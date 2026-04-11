import { describe, expect, test } from "vitest";
import { composeWorkingMessage, formatElapsed } from "../src/format.js";

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

describe("composeWorkingMessage", () => {
  test("formats phrase and elapsed time with a middot separator", () => {
    expect(composeWorkingMessage({ phrase: "Baking", elapsedMs: 12_000 })).toBe("Baking... · 12s");
  });

  test("trims phrases and preserves an existing ellipsis", () => {
    expect(composeWorkingMessage({ phrase: "  Brewing... ", elapsedMs: 1_000 })).toBe("Brewing... · 1s");
  });
});
