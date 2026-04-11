import type { SegmentConfig } from "./config.js";

export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }

  if (totalMinutes > 0) {
    return `${totalMinutes}m ${String(seconds).padStart(2, "0")}s`;
  }

  return `${seconds}s`;
}

function normalizePhrase(phrase: string): string {
  const trimmed = phrase.trim();
  if (!trimmed) return "Working...";
  return trimmed.endsWith("...") || trimmed.endsWith("…") ? trimmed : `${trimmed}...`;
}

export function formatEstimatedTokens(tokens: number): string {
  const safe = Math.max(0, Math.round(tokens));
  if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(1).replace(/\\.0$/, "")}M`;
  if (safe >= 1_000) return `${(safe / 1_000).toFixed(1).replace(/\\.0$/, "")}k`;
  return String(safe);
}

export function pastTensePhrase(phrase: string): string {
  const normalized = phrase.trim().replace(/\\.{3}$|…$/, "");
  if (!normalized) return "Worked";
  if (normalized.endsWith("ing")) {
    const base = normalized.slice(0, -3);
    return base.endsWith("y") ? `${base.slice(0, -1)}ied` : `${base}ed`;
  }
  return `${normalized}ed`;
}

export interface ComposeWorkingMessageParams {
  phrase: string;
  elapsedMs: number;
  suffix?: string;
  thinking?: string;
  estimatedTokens?: number;
  segments?: Partial<SegmentConfig>;
}

const DEFAULT_SEGMENTS: SegmentConfig = {
  phrase: true,
  suffix: false,
  elapsed: true,
  thinking: false,
  tokens: false
};

export function composeWorkingMessage(params: ComposeWorkingMessageParams): string | undefined {
  const segments = { ...DEFAULT_SEGMENTS, ...params.segments };
  const parts: string[] = [];

  if (segments.phrase) {
    parts.push(normalizePhrase(params.phrase));
  }
  if (segments.suffix && params.suffix) {
    parts.push(params.suffix);
  }
  if (segments.elapsed) {
    parts.push(formatElapsed(params.elapsedMs));
  }
  if (segments.thinking && params.thinking) {
    parts.push(params.thinking);
  }
  if (segments.tokens && typeof params.estimatedTokens === "number" && params.estimatedTokens > 0) {
    parts.push(`↓ ${formatEstimatedTokens(params.estimatedTokens)} tokens`);
  }

  return parts.length > 0 ? parts.join(" · ") : undefined;
}
