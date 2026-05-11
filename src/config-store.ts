import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAgentDir, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import {
  loadConfigFromSettingsFiles,
  normalizeConfig,
  SETTINGS_KEY,
  type WorkingLineConfig
} from "./config.js";

export interface WorkingLineConfigStore {
  load(cwd?: string): WorkingLineConfig;
  save(config: WorkingLineConfig, cwd?: string): Promise<string>;
  getGlobalSettingsPath(): string;
}

export interface WorkingLineConfigStoreOptions {
  agentDir?: string;
  cwd?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getProjectSettingsPath(cwd: string): string {
  return join(cwd, ".pi", "settings.json");
}

async function readSettingsObject(settingsPath: string): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await readFile(settingsPath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }

  if (!raw.trim()) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON in ${settingsPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`Invalid settings format in ${settingsPath}: expected a JSON object`);
  }

  return parsed;
}

async function writeSettingsObject(settingsPath: string, settings: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(settingsPath), { recursive: true });
  const tempPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    await rename(tempPath, settingsPath);
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
}

export function createWorkingLineConfigStore(
  options: WorkingLineConfigStoreOptions = {}
): WorkingLineConfigStore {
  const agentDir = options.agentDir ?? getAgentDir();
  const defaultCwd = options.cwd ?? process.cwd();
  const globalSettingsPath = join(agentDir, "settings.json");

  return {
    load(cwd = defaultCwd): WorkingLineConfig {
      return loadConfigFromSettingsFiles(globalSettingsPath, getProjectSettingsPath(cwd), readFileSync);
    },

    async save(config: WorkingLineConfig): Promise<string> {
      const normalizedConfig = normalizeConfig(config);
      await withFileMutationQueue(globalSettingsPath, async () => {
        const settings = await readSettingsObject(globalSettingsPath);
        settings[SETTINGS_KEY] = normalizedConfig;
        await writeSettingsObject(globalSettingsPath, settings);
      });
      return globalSettingsPath;
    },

    getGlobalSettingsPath(): string {
      return globalSettingsPath;
    }
  };
}
