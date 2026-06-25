import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerWorkingLineCommand, renderCommandPreview } from "./commands.js";
import { type WorkingLineConfig, normalizeConfig } from "./config.js";
import { createWorkingLineConfigStore, type WorkingLineConfigStore } from "./config-store.js";
import { composeWorkingMessage, formatElapsed, pastTensePhrase } from "./format.js";
import { DEFAULT_PHRASES, pickPhrase, resolvePhrases } from "./phrases.js";

type Timer = ReturnType<typeof setInterval>;
type Timeout = ReturnType<typeof setTimeout>;

export interface WorkingLineOptions {
  phrases?: readonly string[];
  random?: () => number;
  now?: () => number;
  intervalMs?: number;
  config?: unknown;
  configStore?: WorkingLineConfigStore;
}

export function installWorkingLine(pi: ExtensionAPI, options: WorkingLineOptions = {}): void {
  let timer: Timer | undefined;
  let startedAt = 0;
  let phrase = "Working";
  let activeCtx: ExtensionContext | undefined;
  let suffix: string | undefined;
  let thinkingStartedAt: number | undefined;
  let thoughtDurationMs: number | undefined;
  let outputChars = 0;
  let durationMessageTimer: Timeout | undefined;
  const activeTools = new Map<string, string>();

  const configStore = options.configStore ?? createWorkingLineConfigStore();
  let config = normalizeConfig(options.config ?? configStore.load());
  let phrases = resolvePhrases(options.phrases ?? DEFAULT_PHRASES, config.phrases);
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const intervalMs = options.intervalMs ?? 1000;

  function applyConfig(nextConfig: WorkingLineConfig): void {
    config = normalizeConfig(nextConfig);
    phrases = resolvePhrases(options.phrases ?? DEFAULT_PHRASES, config.phrases);
  }

  function refreshConfig(cwd?: string): void {
    if (options.config !== undefined) return;
    applyConfig(configStore.load(cwd));
  }

  function clearTimer(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = undefined;
  }

  function clearDurationMessageTimer(): void {
    if (!durationMessageTimer) return;
    clearTimeout(durationMessageTimer);
    durationMessageTimer = undefined;
  }

  function render(): void {
    if (!activeCtx) return;
    const message = composeWorkingMessage({
      phrase,
      elapsedMs: now() - startedAt,
      suffix,
      thinking: formatThinking(),
      estimatedTokens: estimateTokens(),
      segments: config.segments
    });
    if (!message) {
      activeCtx.ui.setWorkingMessage();
      return;
    }
    activeCtx.ui.setWorkingMessage(message);
  }

  function formatThinking(): string | undefined {
    if (thinkingStartedAt !== undefined) return "thinking";
    if (thoughtDurationMs !== undefined) return `thought for ${Math.max(1, Math.round(thoughtDurationMs / 1000))}s`;
    return undefined;
  }

  function estimateTokens(): number | undefined {
    if (!config.segments.tokens || outputChars <= 0) return undefined;
    return Math.round(outputChars / 4);
  }

  function resetState(): void {
    suffix = undefined;
    thinkingStartedAt = undefined;
    thoughtDurationMs = undefined;
    outputChars = 0;
    activeTools.clear();
  }

  function setToolSuffix(toolCallId: string | undefined, toolName: string | undefined): void {
    if (!toolCallId || !toolName) return;
    activeTools.set(toolCallId, formatToolName(toolName));
    suffix = activeTools.get(toolCallId);
  }

  function clearToolSuffix(toolCallId: string | undefined): void {
    if (toolCallId) activeTools.delete(toolCallId);
    suffix = Array.from(activeTools.values()).at(-1);
  }

  function formatToolName(toolName: string): string {
    const known: Record<string, string> = {
      bash: "running bash",
      read: "reading file",
      write: "writing file",
      edit: "editing file",
      grep: "searching files",
      find: "finding files",
      ls: "listing files"
    };
    return known[toolName] ?? `running ${toolName}`;
  }

  function maybeSendTurnDuration(durationMs: number): void {
    if (!config.turnDuration.enabled || durationMs < config.turnDuration.thresholdMs) return;
    const message = {
      customType: "pi-working-line",
      content: `${pastTensePhrase(phrase)} for ${formatElapsed(durationMs)}`,
      display: true,
      details: {
        durationMs,
        phrase
      }
    };

    // ponytail: defer past agent_end; direct send there is queued as steering and causes an extra turn.
    durationMessageTimer = setTimeout(() => {
      durationMessageTimer = undefined;
      pi.sendMessage(message);
    }, 0);
    durationMessageTimer.unref?.();
  }

  function reset(ctx?: ExtensionContext, options?: { sendTurnDuration?: boolean }): void {
    const durationMs = startedAt > 0 ? now() - startedAt : 0;
    clearTimer();
    clearDurationMessageTimer();
    if (ctx && options?.sendTurnDuration) {
      maybeSendTurnDuration(durationMs);
    }
    activeCtx = undefined;
    startedAt = 0;
    resetState();
    ctx?.ui.setWorkingMessage();
  }

  pi.on("agent_start", (_event, ctx) => {
    refreshConfig(ctx.cwd);
    if (!config.enabled) return;
    reset();
    activeCtx = ctx;
    startedAt = now();
    phrase = pickPhrase(phrases, random);
    render();
    timer = setInterval(render, intervalMs);
  });

  pi.on("tool_execution_start", (event) => {
    if (!config.enabled || !activeCtx) return;
    const candidate = event as { toolCallId?: string; toolName?: string };
    setToolSuffix(candidate.toolCallId, candidate.toolName);
    render();
  });

  pi.on("tool_execution_end", (event) => {
    if (!config.enabled || !activeCtx) return;
    const candidate = event as { toolCallId?: string };
    clearToolSuffix(candidate.toolCallId);
    render();
  });

  pi.on("message_update", (event) => {
    if (!config.enabled || !activeCtx) return;
    const assistantEvent = (event as { assistantMessageEvent?: { type?: string; delta?: string } }).assistantMessageEvent;
    if (!assistantEvent) return;
    if (assistantEvent.type === "text_delta") {
      outputChars += assistantEvent.delta?.length ?? 0;
    } else if (assistantEvent.type === "thinking_start") {
      thinkingStartedAt = now();
      thoughtDurationMs = undefined;
    } else if (assistantEvent.type === "thinking_end" && thinkingStartedAt !== undefined) {
      thoughtDurationMs = now() - thinkingStartedAt;
      thinkingStartedAt = undefined;
    }
    render();
  });

  pi.on("agent_end", (_event, ctx) => {
    if (!config.enabled) return;
    reset(ctx, { sendTurnDuration: true });
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (!config.enabled) return;
    reset(ctx);
  });

  pi.on("context", (event) => {
    const messages = (event as { messages?: unknown[] }).messages;
    if (!Array.isArray(messages)) return;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i] as { role?: string; customType?: string } | undefined;
      if (message?.role === "custom" && message.customType === "pi-working-line") {
        messages.splice(i, 1);
      }
    }
  });

  registerWorkingLineCommand(pi, {
    getConfig: () => config,
    saveConfig: async (nextConfig, ctx) => {
      const normalized = normalizeConfig(nextConfig);
      const shouldPersist = options.config === undefined || options.configStore !== undefined;
      const path = shouldPersist ? await configStore.save(normalized, ctx.cwd) : undefined;
      applyConfig(normalized);
      render();
      return path;
    },
    getPhraseCount: (nextConfig = config) => resolvePhrases(options.phrases ?? DEFAULT_PHRASES, nextConfig.phrases).length,
    getSettingsPath: () => configStore.getGlobalSettingsPath(),
    renderPreview: (nextConfig = config) => renderCommandPreview(nextConfig)
  });
}
