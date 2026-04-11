import { describe, expect, test } from "vitest";
import { DEFAULT_PHRASES, pickPhrase } from "../src/phrases.js";

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
