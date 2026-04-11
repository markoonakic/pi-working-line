import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Container, type SettingItem, SettingsList, type SettingsListTheme } from "@mariozechner/pi-tui";
import {
  DEFAULT_CONFIG,
  normalizeConfig,
  type SegmentConfig,
  type WorkingLineConfig
} from "./config.js";
import { composeWorkingMessage, formatElapsed } from "./format.js";

export interface WorkingLineCommandHost {
  getConfig(): WorkingLineConfig;
  saveConfig(config: WorkingLineConfig, ctx: ExtensionCommandContext): Promise<string | undefined>;
  getPhraseCount(config?: WorkingLineConfig): number;
  getSettingsPath(): string;
  renderPreview(config?: WorkingLineConfig): string;
}

type PanelScreen = "main" | "phrases";

type PanelAction =
  | { type: "add-phrase" }
  | { type: "edit-phrases" }
  | { type: "reset-phrases" }
  | { type: "reset-config" }
  | { type: "status" }
  | { type: "open-phrases" }
  | { type: "open-main" };

interface PanelTheme {
  fg(color: string, text: string): string;
}

function createPanelSettingsTheme(theme: PanelTheme): SettingsListTheme {
  return {
    label: (text, selected) => (selected ? theme.fg("accent", text) : text),
    value: (text, selected) => (selected ? theme.fg("accent", text) : theme.fg("muted", text)),
    description: (text) => theme.fg("dim", text),
    cursor: theme.fg("accent", "→ "),
    hint: (text) => theme.fg("dim", text)
  };
}

function onOff(value: boolean): "on" | "off" {
  return value ? "on" : "off";
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function phraseSummary(config: WorkingLineConfig, phraseCount: number): string {
  const custom = config.phrases.verbs.length;
  if (config.phrases.mode === "replace") return `${pluralize(custom, "custom phrase")} only`;
  return `built-ins + ${pluralize(custom, "custom phrase")}`;
}

function formatStatus(host: WorkingLineCommandHost): string {
  const config = host.getConfig();
  return [
    `pi-working-line ${config.enabled ? "enabled" : "disabled"}`,
    "",
    "Preview:",
    `  ${host.renderPreview()}`,
    "",
    "Segments:",
    `  phrase: ${onOff(config.segments.phrase)}`,
    `  suffix: ${onOff(config.segments.suffix)}`,
    `  elapsed: ${onOff(config.segments.elapsed)}`,
    `  thinking: ${onOff(config.segments.thinking)}`,
    `  tokens: ${onOff(config.segments.tokens)}`,
    "",
    `Turn duration: ${onOff(config.turnDuration.enabled)}, threshold ${formatElapsed(config.turnDuration.thresholdMs)}`,
    `Phrases: ${phraseSummary(config, host.getPhraseCount())}`,
    `Config: ${host.getSettingsPath()}`,
    "",
    "Commands:",
    "  /working-line",
    "  /working-line status",
    "  /working-line tokens on|off",
    "  /working-line thinking on|off",
    "  /working-line suffix on|off",
    "  /working-line turn-duration on|off",
    "  /working-line turn-duration threshold <duration>",
    "  /working-line phrases add <phrase>",
    "  /working-line phrases mode append|replace",
    "  /working-line phrases reset",
    "  /working-line reset"
  ].join("\n");
}

function parseSwitch(value: string | undefined): boolean | undefined {
  if (value === "on" || value === "enable" || value === "enabled" || value === "true") return true;
  if (value === "off" || value === "disable" || value === "disabled" || value === "false") return false;
  return undefined;
}

function parseDurationMs(value: string | undefined): number | undefined {
  const match = value?.trim().match(/^(\d+)\s*(ms|s|m|h)?$/i);
  if (!match) return undefined;
  const amount = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const unit = (match[2] ?? "s").toLowerCase();
  if (unit === "ms") return amount;
  if (unit === "s") return amount * 1_000;
  if (unit === "m") return amount * 60_000;
  if (unit === "h") return amount * 3_600_000;
  return undefined;
}

function customPhrasesFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function setSegment(config: WorkingLineConfig, segment: keyof SegmentConfig, enabled: boolean): WorkingLineConfig {
  return normalizeConfig({
    ...config,
    segments: {
      ...config.segments,
      [segment]: enabled
    }
  });
}

function setPhraseMode(config: WorkingLineConfig, mode: "append" | "replace"): WorkingLineConfig | undefined {
  if (mode === "replace" && config.phrases.verbs.length === 0) return undefined;
  return normalizeConfig({
    ...config,
    phrases: {
      ...config.phrases,
      mode
    }
  });
}

async function saveAndNotify(
  host: WorkingLineCommandHost,
  ctx: ExtensionCommandContext,
  config: WorkingLineConfig,
  message: string,
  options?: { notify?: boolean }
): Promise<boolean> {
  try {
    const path = await host.saveConfig(config, ctx);
    if (options?.notify !== false) {
      ctx.ui.notify(path ? `${message} · saved to ${path}` : message, "info");
    }
    return true;
  } catch (error) {
    ctx.ui.notify(`pi-working-line config save failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    return false;
  }
}

function createSettingsPanel(
  host: WorkingLineCommandHost,
  ctx: ExtensionCommandContext,
  tui: { requestRender(): void },
  theme: PanelTheme,
  done: (action?: PanelAction) => void,
  screen: PanelScreen
) {
  const container = new Container();

  const title = {
    render(): string[] {
      const config = host.getConfig();
      if (screen === "phrases") {
        return [
          "",
          `  ${theme.fg("accent", "Configure phrases")}`,
          `  Mode: ${config.phrases.mode}`,
          `  Custom phrases: ${config.phrases.verbs.length}`,
          `  Preview pool: ${phraseSummary(config, host.getPhraseCount())}`,
          ""
        ];
      }
      return [
        "",
        `  ${theme.fg("accent", "pi-working-line")}`,
        `  ${host.renderPreview()}`,
        ""
      ];
    },
    invalidate(): void {}
  };

  const config = host.getConfig();
  const items: SettingItem[] = screen === "phrases"
    ? [
        { id: "add-phrase", label: "Add phrase", currentValue: "", values: [""] },
        { id: "edit-phrases", label: "Edit custom phrases", currentValue: "", values: [""] },
        { id: "phrase-mode", label: "Phrase mode", currentValue: config.phrases.mode, values: ["append", "replace"] },
        { id: "reset-phrases", label: "Reset custom phrases", currentValue: "", values: [""] },
        { id: "back", label: "Back", currentValue: "", values: [""] }
      ]
    : [
        { id: "tokens", label: "Toggle tokens", currentValue: onOff(config.segments.tokens), values: ["off", "on"] },
        { id: "thinking", label: "Toggle thinking", currentValue: onOff(config.segments.thinking), values: ["off", "on"] },
        { id: "suffix", label: "Toggle tool suffix", currentValue: onOff(config.segments.suffix), values: ["off", "on"] },
        { id: "turn-duration", label: "Toggle turn message", currentValue: onOff(config.turnDuration.enabled), values: ["off", "on"] },
        { id: "open-phrases", label: "Configure phrases", currentValue: "", values: [""] }
      ];

  let settingsList: SettingsList;

  function updateListFromConfig(): void {
    const nextConfig = host.getConfig();
    settingsList.updateValue("tokens", onOff(nextConfig.segments.tokens));
    settingsList.updateValue("thinking", onOff(nextConfig.segments.thinking));
    settingsList.updateValue("suffix", onOff(nextConfig.segments.suffix));
    settingsList.updateValue("turn-duration", onOff(nextConfig.turnDuration.enabled));
    settingsList.updateValue("phrase-mode", nextConfig.phrases.mode);
  }

  async function onChange(id: string, newValue: string): Promise<void> {
    if (id === "open-phrases") return done({ type: "open-phrases" });
    if (id === "add-phrase") return done({ type: "add-phrase" });
    if (id === "edit-phrases") return done({ type: "edit-phrases" });
    if (id === "reset-phrases") return done({ type: "reset-phrases" });
    if (id === "back") return done({ type: "open-main" });
    if (id === "tokens") await setSegmentCommand(host, ctx, "tokens", newValue, { notify: false });
    if (id === "thinking") await setSegmentCommand(host, ctx, "thinking", newValue, { notify: false });
    if (id === "suffix") await setSegmentCommand(host, ctx, "suffix", newValue, { notify: false });
    if (id === "turn-duration") await setTurnDuration(host, ctx, newValue, { notify: false });
    if (id === "phrase-mode") await updatePhraseMode(host, ctx, newValue === "replace" ? "replace" : "append", { notify: false });
    updateListFromConfig();
    tui.requestRender();
  }

  settingsList = new SettingsList(
    items,
    Math.min(items.length + 2, 12),
    createPanelSettingsTheme(theme),
    (id, newValue) => {
      void onChange(id, newValue);
    },
    () => done(undefined)
  );

  container.addChild(title);
  container.addChild(settingsList);

  return {
    render(width: number): string[] {
      return container.render(width);
    },

    invalidate(): void {
      container.invalidate();
    },

    handleInput(data: string): void {
      if (data === "j") {
        settingsList.handleInput("\u001b[B");
      } else if (data === "k") {
        settingsList.handleInput("\u001b[A");
      } else {
        settingsList.handleInput(data);
      }
      tui.requestRender();
    }
  };
}

async function showInteractivePanel(
  host: WorkingLineCommandHost,
  ctx: ExtensionCommandContext,
  initialScreen: PanelScreen = "main"
): Promise<void> {
  let screen = initialScreen;

  while (true) {
    const action = await ctx.ui.custom<PanelAction | undefined>(
      (tui, theme, _keybindings, done) => createSettingsPanel(host, ctx, tui, theme, done, screen)
    );

    if (!action) return;
    if (action.type === "open-phrases") {
      screen = "phrases";
      continue;
    }
    if (action.type === "open-main") {
      screen = "main";
      continue;
    }
    if (action.type === "status") {
      ctx.ui.notify(formatStatus(host), "info");
      screen = "main";
      continue;
    }
    if (action.type === "reset-config") {
      await resetConfig(host, ctx);
      screen = "main";
      continue;
    }
    if (action.type === "add-phrase") {
      const phrase = (await ctx.ui.input("New phrase:"))?.trim();
      if (!phrase) {
        screen = "phrases";
        continue;
      }
      const config = host.getConfig();
      await saveAndNotify(host, ctx, normalizeConfig({
        ...config,
        phrases: {
          ...config.phrases,
          verbs: [...config.phrases.verbs, phrase]
        }
      }), `Added phrase: ${phrase}`);
      screen = "phrases";
      continue;
    }
    if (action.type === "edit-phrases") {
      const config = host.getConfig();
      const edited = await ctx.ui.editor("Custom phrases (one per line):", config.phrases.verbs.join("\n"));
      if (edited === undefined) {
        screen = "phrases";
        continue;
      }
      const verbs = customPhrasesFromText(edited);
      if (config.phrases.mode === "replace" && verbs.length === 0) {
        ctx.ui.notify("Add at least one custom phrase before switching to replace mode.", "warning");
        screen = "phrases";
        continue;
      }
      await saveAndNotify(host, ctx, normalizeConfig({
        ...config,
        phrases: {
          ...config.phrases,
          verbs
        }
      }), `Custom phrases updated: ${verbs.length}`);
      screen = "phrases";
      continue;
    }
    if (action.type === "reset-phrases") {
      const ok = await ctx.ui.confirm("Reset custom phrases?", "Clear custom phrases and switch back to append mode?");
      if (!ok) {
        screen = "phrases";
        continue;
      }
      const config = host.getConfig();
      await saveAndNotify(host, ctx, normalizeConfig({
        ...config,
        phrases: {
          mode: "append",
          verbs: []
        }
      }), "Custom phrases reset");
      screen = "phrases";
    }
  }
}

async function toggleSegment(
  host: WorkingLineCommandHost,
  ctx: ExtensionCommandContext,
  segment: keyof SegmentConfig
): Promise<void> {
  const next = !host.getConfig().segments[segment];
  await saveAndNotify(host, ctx, setSegment(host.getConfig(), segment, next), `pi-working-line: ${segment} ${onOff(next)}`, {
    notify: false
  });
}

async function setSegmentCommand(
  host: WorkingLineCommandHost,
  ctx: ExtensionCommandContext,
  segment: keyof SegmentConfig,
  value: string | undefined,
  options?: { notify?: boolean }
): Promise<void> {
  const enabled = parseSwitch(value);
  if (enabled === undefined) {
    ctx.ui.notify(`Usage: /working-line ${segment} on|off`, "warning");
    return;
  }
  await saveAndNotify(host, ctx, setSegment(host.getConfig(), segment, enabled), `pi-working-line: ${segment} ${onOff(enabled)}`, options);
}

async function toggleTurnDuration(host: WorkingLineCommandHost, ctx: ExtensionCommandContext): Promise<void> {
  const config = host.getConfig();
  const enabled = !config.turnDuration.enabled;
  await saveAndNotify(host, ctx, normalizeConfig({
    ...config,
    turnDuration: {
      ...config.turnDuration,
      enabled
    }
  }), `pi-working-line: turn duration ${onOff(enabled)}`, {
    notify: false
  });
}

async function setTurnDuration(
  host: WorkingLineCommandHost,
  ctx: ExtensionCommandContext,
  value: string | undefined,
  options?: { notify?: boolean }
): Promise<void> {
  const enabled = parseSwitch(value);
  if (enabled === undefined) {
    ctx.ui.notify("Usage: /working-line turn-duration on|off", "warning");
    return;
  }
  const config = host.getConfig();
  await saveAndNotify(host, ctx, normalizeConfig({
    ...config,
    turnDuration: {
      ...config.turnDuration,
      enabled
    }
  }), `pi-working-line: turn duration ${onOff(enabled)}`, options);
}

async function setTurnDurationThreshold(
  host: WorkingLineCommandHost,
  ctx: ExtensionCommandContext,
  value: string | undefined
): Promise<void> {
  const thresholdMs = parseDurationMs(value);
  if (thresholdMs === undefined) {
    ctx.ui.notify("Usage: /working-line turn-duration threshold <duration>, e.g. 45s or 2m", "warning");
    return;
  }
  const config = host.getConfig();
  await saveAndNotify(host, ctx, normalizeConfig({
    ...config,
    turnDuration: {
      ...config.turnDuration,
      thresholdMs
    }
  }), `pi-working-line: turn duration threshold ${formatElapsed(thresholdMs)}`);
}

async function updatePhraseMode(
  host: WorkingLineCommandHost,
  ctx: ExtensionCommandContext,
  mode: "append" | "replace",
  options?: { notify?: boolean }
): Promise<void> {
  const nextConfig = setPhraseMode(host.getConfig(), mode);
  if (!nextConfig) {
    ctx.ui.notify("Add at least one custom phrase before switching to replace mode.", "warning");
    return;
  }
  await saveAndNotify(host, ctx, nextConfig, `pi-working-line: phrase mode ${mode}`, options);
}

async function resetConfig(host: WorkingLineCommandHost, ctx: ExtensionCommandContext): Promise<void> {
  if (ctx.hasUI) {
    const ok = await ctx.ui.confirm("Reset pi-working-line?", "Restore default pi-working-line settings?");
    if (!ok) return;
  }
  await saveAndNotify(host, ctx, DEFAULT_CONFIG, "pi-working-line: reset to defaults");
}

async function handlePhrasesCommand(
  host: WorkingLineCommandHost,
  ctx: ExtensionCommandContext,
  args: string
): Promise<void> {
  const tokens = args.split(/\s+/);
  const action = tokens[1];

  if (action === "add") {
    const phrase = args.replace(/^phrases\s+add\s+/, "").trim();
    if (!phrase || phrase === args) {
      ctx.ui.notify("Usage: /working-line phrases add <phrase>", "warning");
      return;
    }
    const config = host.getConfig();
    await saveAndNotify(host, ctx, normalizeConfig({
      ...config,
      phrases: {
        ...config.phrases,
        verbs: [...config.phrases.verbs, phrase]
      }
    }), `Added phrase: ${phrase}`);
    return;
  }

  if (action === "mode") {
    const mode = tokens[2];
    if (mode !== "append" && mode !== "replace") {
      ctx.ui.notify("Usage: /working-line phrases mode append|replace", "warning");
      return;
    }
    await updatePhraseMode(host, ctx, mode);
    return;
  }

  if (action === "reset") {
    const config = host.getConfig();
    await saveAndNotify(host, ctx, normalizeConfig({
      ...config,
      phrases: {
        mode: "append",
        verbs: []
      }
    }), "Custom phrases reset");
    return;
  }

  if (action === "edit" && ctx.hasUI) {
    await showInteractivePanel(host, ctx, "phrases");
    return;
  }

  ctx.ui.notify([
    "Usage:",
    "  /working-line phrases add <phrase>",
    "  /working-line phrases mode append|replace",
    "  /working-line phrases reset"
  ].join("\n"), "warning");
}

async function handleCommand(host: WorkingLineCommandHost, args: string, ctx: ExtensionCommandContext): Promise<void> {
  const trimmed = args.trim();
  if (!trimmed) {
    if (ctx.hasUI) {
      await showInteractivePanel(host, ctx);
      return;
    }
    ctx.ui.notify(formatStatus(host), "info");
    return;
  }

  const tokens = trimmed.split(/\s+/);
  const command = tokens[0];

  if (command === "status" || command === "help") {
    ctx.ui.notify(formatStatus(host), "info");
    return;
  }

  if (command === "enable") {
    await saveAndNotify(host, ctx, normalizeConfig({ ...host.getConfig(), enabled: true }), "pi-working-line: enabled");
    return;
  }

  if (command === "disable") {
    await saveAndNotify(host, ctx, normalizeConfig({ ...host.getConfig(), enabled: false }), "pi-working-line: disabled");
    return;
  }

  if (command === "tokens") return setSegmentCommand(host, ctx, "tokens", tokens[1]);
  if (command === "thinking") return setSegmentCommand(host, ctx, "thinking", tokens[1]);
  if (command === "suffix") return setSegmentCommand(host, ctx, "suffix", tokens[1]);
  if (command === "turn-duration") {
    if (tokens[1] === "threshold") return setTurnDurationThreshold(host, ctx, tokens[2]);
    return setTurnDuration(host, ctx, tokens[1]);
  }
  if (command === "phrases") return handlePhrasesCommand(host, ctx, trimmed);
  if (command === "reset") return resetConfig(host, ctx);

  ctx.ui.notify(formatStatus(host), "warning");
}

export function registerWorkingLineCommand(pi: ExtensionAPI, host: WorkingLineCommandHost): void {
  pi.registerCommand("working-line", {
    description: "Configure pi-working-line status text",
    getArgumentCompletions: (prefix) => {
      const values = ["status", "help", "tokens", "thinking", "suffix", "turn-duration", "phrases", "reset", "enable", "disable"];
      const matches = values.filter((value) => value.startsWith(prefix.trim()));
      return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      await handleCommand(host, args, ctx);
    }
  });
}

export function renderCommandPreview(config: WorkingLineConfig): string {
  return composeWorkingMessage({
    phrase: "Baking",
    suffix: "running bash",
    elapsedMs: 12_000,
    thinking: "thinking",
    estimatedTokens: 1800,
    segments: config.segments.tokens ? config.segments : { ...config.segments, tokens: false }
  }) ?? "(default Pi working message)";
}
