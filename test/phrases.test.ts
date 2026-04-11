import { describe, expect, test } from "vitest";
import { DEFAULT_PHRASES, pickPhrase, resolvePhrases } from "../src/phrases.js";

describe("pickPhrase", () => {
  test("uses the provided random function to pick a stable list entry", () => {
    expect(pickPhrase(["Baking", "Brewing", "Herding"], () => 0.5)).toBe("Brewing");
  });

  test("falls back to Working for empty lists", () => {
    expect(pickPhrase([], () => 0.5)).toBe("Working");
  });

  test("ships with a non-empty default phrase list", () => {
    expect(DEFAULT_PHRASES.length).toBeGreaterThan(20);
    expect(DEFAULT_PHRASES).toContain("Baking");
  });
});

describe("resolvePhrases", () => {
  test("appends configured verbs by default", () => {
    expect(resolvePhrases(["Baking"], { mode: "append", verbs: ["Consulting"] })).toEqual(["Baking", "Consulting"]);
  });

  test("replaces defaults when mode is replace", () => {
    expect(resolvePhrases(["Baking"], { mode: "replace", verbs: ["Consulting"] })).toEqual(["Consulting"]);
  });

  test("falls back to defaults when replace mode is empty", () => {
    expect(resolvePhrases(["Baking"], { mode: "replace", verbs: [] })).toEqual(["Baking"]);
  });
});
