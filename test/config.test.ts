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

  test("rejects invalid values back to defaults", () => {
    expect(
      normalizeConfig({
        enabled: "yes",
        segments: {
          phrase: "no"
        },
        turnDuration: {
          enabled: "yes",
          thresholdMs: -1
        }
      })
    ).toEqual(DEFAULT_CONFIG);
  });

  test("loads nested package config from settings.json", () => {
    const config = loadConfigFromSettingsFile("/tmp/settings.json", () => JSON.stringify({
      "pi-working-line": {
        segments: {
          tokens: true
        }
      }
    }));

    expect(config.segments.tokens).toBe(true);
    expect(config.segments.phrase).toBe(true);
  });

  test("falls back to defaults when settings.json cannot be read", () => {
    const config = loadConfigFromSettingsFile("/tmp/settings.json", () => {
      throw new Error("missing");
    });

    expect(config).toEqual(DEFAULT_CONFIG);
  });
});
