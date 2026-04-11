import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createWorkingLineConfigStore } from "../src/config-store.js";
import { DEFAULT_CONFIG } from "../src/config.js";

const cleanupPaths: string[] = [];

describe("createWorkingLineConfigStore", () => {
  afterEach(async () => {
    await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  async function createTempLayout() {
    const root = await mkdtemp(join(tmpdir(), "pi-working-line-"));
    cleanupPaths.push(root);
    const agentDir = join(root, "agent");
    const cwd = join(root, "project");
    await mkdir(agentDir, { recursive: true });
    await mkdir(join(cwd, ".pi"), { recursive: true });
    return { root, agentDir, cwd, settingsPath: join(agentDir, "settings.json") };
  }

  test("saves global config while preserving unrelated settings", async () => {
    const { agentDir, cwd, settingsPath } = await createTempLayout();
    const store = createWorkingLineConfigStore({ agentDir, cwd });
    await writeFile(settingsPath, JSON.stringify({
      theme: "gruvbox",
      "pi-working-line": {
        segments: {
          tokens: false
        }
      }
    }));

    await store.save({
      ...DEFAULT_CONFIG,
      segments: {
        ...DEFAULT_CONFIG.segments,
        tokens: true
      }
    }, cwd);

    const saved = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, any>;
    expect(saved.theme).toBe("gruvbox");
    expect(saved["pi-working-line"].segments.tokens).toBe(true);
  });

  test("rejects invalid settings JSON without overwriting it", async () => {
    const { agentDir, cwd, settingsPath } = await createTempLayout();
    const store = createWorkingLineConfigStore({ agentDir, cwd });
    await writeFile(settingsPath, "{");

    await expect(store.save(DEFAULT_CONFIG, cwd)).rejects.toThrow("Invalid JSON");
    expect(await readFile(settingsPath, "utf8")).toBe("{");
  });
});
