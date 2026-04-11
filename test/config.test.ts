import { describe, expect, test } from "vitest";
import { DEFAULT_CONFIG, loadConfigFromSettingsFile, normalizeConfig } from "../src/config.js";

describe("normalizeConfig", () => {
  test("uses defaults for missing config", () => {
    expect(normalizeConfig(undefined)).toEqual(DEFAULT_CONFIG);
  });

  test("normalizes segment toggles and turn duration settings", () => {
    expect(
      normalizeConfig({
        enabled: false,
        phrases: {
          mode: "replace",
          verbs: ["Consulting", "Reticulating"]
        },
        segments: {
          tokens: true,
          suffix: false
        },
        turnDuration: {
          enabled: true,
          thresholdMs: 10_000
        }
      })
    ).toEqual({
      enabled: false,
      phrases: {
        mode: "replace",
        verbs: ["Consulting", "Reticulating"]
      },
      segments: {
        phrase: true,
        suffix: false,
        elapsed: true,
        thinking: true,
        tokens: true
      },
      turnDuration: {
        enabled: true,
        thresholdMs: 10_000
      }
    });
  });

  test("rejects invalid primitive values back to defaults while preserving valid verbs", () => {
    const config = normalizeConfig({
      enabled: "yes",
      phrases: {
        mode: "replace",
        verbs: [123, "Valid", ""]
      },
      segments: {
        phrase: "no"
      },
      turnDuration: {
        enabled: "yes",
        thresholdMs: -1
      }
    });

    expect(config.enabled).toBe(DEFAULT_CONFIG.enabled);
    expect(config.segments).toEqual(DEFAULT_CONFIG.segments);
    expect(config.turnDuration).toEqual(DEFAULT_CONFIG.turnDuration);
    expect(config.phrases).toEqual({ mode: "replace", verbs: ["Valid"] });
  });

  test("loads nested package config from settings.json", () => {
    const config = loadConfigFromSettingsFile("/tmp/settings.json", () => JSON.stringify({
      "pi-working-line": {
        phrases: {
          mode: "append",
          verbs: ["Consulting"]
        },
        segments: {
          tokens: true
        }
      }
    }));

    expect(config.segments.tokens).toBe(true);
    expect(config.segments.phrase).toBe(true);
    expect(config.phrases.verbs).toEqual(["Consulting"]);
  });

  test("falls back to defaults when settings.json cannot be read", () => {
    const config = loadConfigFromSettingsFile("/tmp/settings.json", () => {
      throw new Error("missing");
    });

    expect(config).toEqual(DEFAULT_CONFIG);
  });
});
