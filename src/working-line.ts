import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { composeWorkingMessage } from "./format.js";
import { DEFAULT_PHRASES, pickPhrase } from "./phrases.js";

type Timer = ReturnType<typeof setInterval>;

export interface WorkingLineOptions {
  phrases?: readonly string[];
  random?: () => number;
  now?: () => number;
  intervalMs?: number;
}

export function installWorkingLine(pi: ExtensionAPI, options: WorkingLineOptions = {}): void {
  let timer: Timer | undefined;
  let startedAt = 0;
  let phrase = "Working";
  let activeCtx: ExtensionContext | undefined;

  const phrases = options.phrases ?? DEFAULT_PHRASES;
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const intervalMs = options.intervalMs ?? 1000;

  function clearTimer(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = undefined;
  }

  function render(): void {
    if (!activeCtx) return;
    activeCtx.ui.setWorkingMessage(
      composeWorkingMessage({
        phrase,
        elapsedMs: now() - startedAt
      })
    );
  }

  function reset(ctx?: ExtensionContext): void {
    clearTimer();
    activeCtx = undefined;
    ctx?.ui.setWorkingMessage();
  }

  pi.on("agent_start", (_event, ctx) => {
    reset();
    activeCtx = ctx;
    startedAt = now();
    phrase = pickPhrase(phrases, random);
    render();
    timer = setInterval(render, intervalMs);
  });

  pi.on("agent_end", (_event, ctx) => {
    reset(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    reset(ctx);
  });
}
