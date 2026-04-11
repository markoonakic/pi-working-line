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

function normalizePhraseConfig(value: unknown, fallback: PhraseConfig): PhraseConfig {
  const input = asRecord(value);
  const mode = input.mode === "replace" || input.mode === "append" ? input.mode : fallback.mode;
  const verbs = Array.isArray(input.verbs)
    ? input.verbs
      .filter((verb): verb is string => typeof verb === "string" && verb.trim().length > 0)
      .map((verb) => verb.trim())
    : [...fallback.verbs];
  return { mode, verbs };
}

export function normalizeConfig(value: unknown, fallback: WorkingLineConfig = DEFAULT_CONFIG): WorkingLineConfig {
  const input = asRecord(value);
  const rawSegments = asRecord(input.segments);
  const rawTurnDuration = asRecord(input.turnDuration);

  return {
    enabled: optionalBoolean(input.enabled, fallback.enabled),
    phrases: normalizePhraseConfig(input.phrases, fallback.phrases),
    segments: {
      phrase: optionalBoolean(rawSegments.phrase, fallback.segments.phrase),
      suffix: optionalBoolean(rawSegments.suffix, fallback.segments.suffix),
      elapsed: optionalBoolean(rawSegments.elapsed, fallback.segments.elapsed),
      thinking: optionalBoolean(rawSegments.thinking, fallback.segments.thinking),
      tokens: optionalBoolean(rawSegments.tokens, fallback.segments.tokens)
    },
    turnDuration: {
      enabled: optionalBoolean(rawTurnDuration.enabled, fallback.turnDuration.enabled),
      thresholdMs: optionalPositiveNumber(rawTurnDuration.thresholdMs, fallback.turnDuration.thresholdMs)
    }
  };
}

function loadRawConfigFromSettingsFile(
  settingsPath: string,
  readFile: (path: string, encoding: BufferEncoding) => string
): unknown {
  const raw = JSON.parse(readFile(settingsPath, "utf8")) as unknown;
  const settings = asRecord(raw);
  return settings[SETTINGS_KEY];
}

export function loadConfigFromSettingsFile(
  settingsPath: string,
  readFile: (path: string, encoding: BufferEncoding) => string
): WorkingLineConfig {
  try {
    return normalizeConfig(loadRawConfigFromSettingsFile(settingsPath, readFile));
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function loadConfigFromSettingsFiles(
  globalSettingsPath: string,
  projectSettingsPath: string,
  readFile: (path: string, encoding: BufferEncoding) => string
): WorkingLineConfig {
  let config = DEFAULT_CONFIG;

  try {
    config = normalizeConfig(loadRawConfigFromSettingsFile(globalSettingsPath, readFile));
  } catch {
    config = DEFAULT_CONFIG;
  }

  try {
    return normalizeConfig(loadRawConfigFromSettingsFile(projectSettingsPath, readFile), config);
  } catch {
    return config;
  }
}
