export interface SegmentConfig {
  phrase: boolean;
  suffix: boolean;
  elapsed: boolean;
  thinking: boolean;
  tokens: boolean;
}

export interface TurnDurationConfig {
  enabled: boolean;
  thresholdMs: number;
}

export interface PhraseConfig {
  mode: "append" | "replace";
  verbs: string[];
}

export interface WorkingLineConfig {
  enabled: boolean;
  phrases: PhraseConfig;
  segments: SegmentConfig;
  turnDuration: TurnDurationConfig;
}

export const SETTINGS_KEY = "pi-working-line";

export const DEFAULT_CONFIG: WorkingLineConfig = {
  enabled: true,
  phrases: {
    mode: "append",
    verbs: []
  },
  segments: {
    phrase: true,
    suffix: true,
    elapsed: true,
    thinking: true,
    tokens: false
  },
  turnDuration: {
    enabled: false,
    thresholdMs: 30_000
  }
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function optionalPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizePhraseConfig(value: unknown): PhraseConfig {
  const input = asRecord(value);
  const mode = input.mode === "replace" ? "replace" : DEFAULT_CONFIG.phrases.mode;
  const verbs = Array.isArray(input.verbs)
    ? input.verbs.filter((verb): verb is string => typeof verb === "string" && verb.trim().length > 0)
    : DEFAULT_CONFIG.phrases.verbs;
  return { mode, verbs };
}

export function normalizeConfig(value: unknown): WorkingLineConfig {
  const input = asRecord(value);
  const rawSegments = asRecord(input.segments);
  const rawTurnDuration = asRecord(input.turnDuration);

  return {
    enabled: optionalBoolean(input.enabled, DEFAULT_CONFIG.enabled),
    phrases: normalizePhraseConfig(input.phrases),
    segments: {
      phrase: optionalBoolean(rawSegments.phrase, DEFAULT_CONFIG.segments.phrase),
      suffix: optionalBoolean(rawSegments.suffix, DEFAULT_CONFIG.segments.suffix),
      elapsed: optionalBoolean(rawSegments.elapsed, DEFAULT_CONFIG.segments.elapsed),
      thinking: optionalBoolean(rawSegments.thinking, DEFAULT_CONFIG.segments.thinking),
      tokens: optionalBoolean(rawSegments.tokens, DEFAULT_CONFIG.segments.tokens)
    },
    turnDuration: {
      enabled: optionalBoolean(rawTurnDuration.enabled, DEFAULT_CONFIG.turnDuration.enabled),
      thresholdMs: optionalPositiveNumber(rawTurnDuration.thresholdMs, DEFAULT_CONFIG.turnDuration.thresholdMs)
    }
  };
}

export function loadConfigFromSettingsFile(
  settingsPath: string,
  readFile: (path: string, encoding: BufferEncoding) => string
): WorkingLineConfig {
  try {
    const raw = JSON.parse(readFile(settingsPath, "utf8")) as unknown;
    const settings = asRecord(raw);
    return normalizeConfig(settings[SETTINGS_KEY]);
  } catch {
    return DEFAULT_CONFIG;
  }
}
