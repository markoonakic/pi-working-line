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

export function composeWorkingMessage(params: { phrase: string; elapsedMs: number }): string {
  return `${normalizePhrase(params.phrase)} · ${formatElapsed(params.elapsedMs)}`;
}
