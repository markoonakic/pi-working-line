import { describe, expect, test } from "vitest";
import { composeWorkingMessage, formatElapsed, pastTensePhrase } from "../src/format.js";

describe("formatElapsed", () => {
  test.each([
    [0, "0s"],
    [999, "0s"],
    [1_000, "1s"],
    [59_900, "59s"],
    [60_000, "1m 00s"],
    [64_000, "1m 04s"],
    [3_661_000, "1h 01m 01s"]
  ])("formats %i ms as %s", (input, expected) => {
    expect(formatElapsed(input)).toBe(expected);
  });
});

describe("pastTensePhrase", () => {
  test.each([
    ["Baking", "Baked"],
    ["Noodling", "Noodled"],
    ["Dilly-dallying", "Dilly-dallied"],
    ["", "Worked"]
  ])("formats %s as %s", (input, expected) => {
    expect(pastTensePhrase(input)).toBe(expected);
  });
});

describe("composeWorkingMessage", () => {
  test("formats phrase and elapsed time with a middot separator", () => {
    expect(composeWorkingMessage({ phrase: "Baking", elapsedMs: 12_000 })).toBe("Baking... · 12s");
  });

  test("trims phrases and preserves an existing ellipsis", () => {
    expect(composeWorkingMessage({ phrase: "  Brewing... ", elapsedMs: 1_000 })).toBe("Brewing... · 1s");
  });

  test("includes enabled suffix, thinking, and estimated token segments in order", () => {
    expect(
      composeWorkingMessage({
        phrase: "Baking",
        elapsedMs: 45_000,
        suffix: "running bash",
        thinking: "thought for 8s",
        estimatedTokens: 1800,
        segments: {
          phrase: true,
          suffix: true,
          elapsed: true,
          thinking: true,
          tokens: true
        }
      })
    ).toBe("Baking... · running bash · 45s · thought for 8s · ↓ 1.8k tokens");
  });

  test("omits disabled segments", () => {
    expect(
      composeWorkingMessage({
        phrase: "Baking",
        elapsedMs: 45_000,
        suffix: "running bash",
        thinking: "thinking",
        estimatedTokens: 1800,
        segments: {
          phrase: true,
          suffix: false,
          elapsed: true,
          thinking: false,
          tokens: false
        }
      })
    ).toBe("Baking... · 45s");
  });

  test("returns undefined when every visible segment is disabled", () => {
    expect(
      composeWorkingMessage({
        phrase: "Baking",
        elapsedMs: 45_000,
        suffix: "running bash",
        thinking: "thinking",
        estimatedTokens: 1800,
        segments: {
          phrase: false,
          suffix: false,
          elapsed: false,
          thinking: false,
          tokens: false
        }
      })
    ).toBeUndefined();
  });
});
