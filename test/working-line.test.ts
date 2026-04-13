import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { WorkingLineConfig } from "../src/config.js";
import piWorkingLine from "../src/index.js";
import { installWorkingLine } from "../src/working-line.js";

type Handler = (event: unknown, ctx: any) => void;

function createMockPi() {
  const handlers = new Map<string, Handler[]>();
  const commands = new Map<string, any>();
  const messageRenderers = new Map<string, any>();
  return {
    pi: {
      on(event: string, handler: Handler) {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      },
      registerCommand(name: string, options: any) {
        commands.set(name, options);
      },
      registerMessageRenderer(customType: string, renderer: any) {
        messageRenderers.set(customType, renderer);
      }
    },
    emit(event: string, ctx: any = {}, payload: Record<string, unknown> = {}) {
      for (const handler of handlers.get(event) ?? []) {
        handler({ type: event, ...payload }, ctx);
      }
    },
    command(name: string) {
      const command = commands.get(name);
      if (!command) throw new Error(`Missing command: ${name}`);
      return command;
    },
    renderer(customType: string) {
      const renderer = messageRenderers.get(customType);
      if (!renderer) throw new Error(`Missing renderer: ${customType}`);
      return renderer;
    }
  };
}

function createPanelTestRuntime() {
  const rendered: string[] = [];
  const tui = { requestRender: vi.fn() };
  const theme = {
    fg: (color: string, text: string) => `<${color}>${text}</${color}>`
  };
  const keybindings = {};

  return { rendered, tui, theme, keybindings };
}

function createMemoryConfigStore(initialConfig: unknown) {
  let config = initialConfig as WorkingLineConfig;
  const save = vi.fn(async (nextConfig: WorkingLineConfig) => {
    config = nextConfig;
    return "/Users/test/.pi/agent/settings.json";
  });

  return {
    store: {
      load: vi.fn(() => config),
      save,
      getGlobalSettingsPath: () => "/Users/test/.pi/agent/settings.json"
    },
    save,
    getConfig: () => config
  };
}

describe("installWorkingLine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("sets an initial phrase and updates elapsed time every second", () => {
    const { pi, emit } = createMockPi();
    const setWorkingMessage = vi.fn();
    installWorkingLine(pi as any, {
      phrases: ["Baking"],
      now: () => Date.now()
    });

    emit("agent_start", { ui: { setWorkingMessage } });

    expect(setWorkingMessage).toHaveBeenLastCalledWith("Baking... · 0s");

    vi.advanceTimersByTime(1_000);
    expect(setWorkingMessage).toHaveBeenLastCalledWith("Baking... · 1s");

    vi.advanceTimersByTime(63_000);
    expect(setWorkingMessage).toHaveBeenLastCalledWith("Baking... · 1m 04s");
  });

  test("chooses one phrase per turn and keeps it stable across ticks", () => {
    const { pi, emit } = createMockPi();
    const setWorkingMessage = vi.fn();
    installWorkingLine(pi as any, {
      phrases: ["Baking", "Brewing"],
      random: () => 0.99,
      now: () => Date.now()
    });

    emit("agent_start", { ui: { setWorkingMessage } });
    vi.advanceTimersByTime(2_000);

    expect(setWorkingMessage.mock.calls.map((call) => call[0])).toEqual([
      "Brewing... · 0s",
      "Brewing... · 1s",
      "Brewing... · 2s"
    ]);
  });

  test("restores the default Pi working message on agent_end", () => {
    const { pi, emit } = createMockPi();
    const setWorkingMessage = vi.fn();
    installWorkingLine(pi as any, {
      phrases: ["Baking"],
      now: () => Date.now()
    });

    emit("agent_start", { ui: { setWorkingMessage } });
    emit("agent_end", { ui: { setWorkingMessage } });
    vi.advanceTimersByTime(5_000);

    expect(setWorkingMessage).toHaveBeenLastCalledWith();
  });

  test("cleans up timer state on session_shutdown", () => {
    const { pi, emit } = createMockPi();
    const setWorkingMessage = vi.fn();
    installWorkingLine(pi as any, {
      phrases: ["Baking"],
      now: () => Date.now()
    });

    emit("agent_start", { ui: { setWorkingMessage } });
    emit("session_shutdown", { ui: { setWorkingMessage } });
    vi.advanceTimersByTime(5_000);

    expect(setWorkingMessage).toHaveBeenCalledTimes(2);
    expect(setWorkingMessage).toHaveBeenLastCalledWith();
  });

  test("shows current tool suffix while a tool is running", () => {
    const { pi, emit } = createMockPi();
    const setWorkingMessage = vi.fn();
    installWorkingLine(pi as any, {
      phrases: ["Baking"],
      now: () => Date.now()
    });

    emit("agent_start", { ui: { setWorkingMessage } });
    emit("tool_execution_start", { ui: { setWorkingMessage } }, { toolCallId: "tool-1", toolName: "bash" });

    expect(setWorkingMessage).toHaveBeenLastCalledWith("Baking... · running bash · 0s");

    emit("tool_execution_end", { ui: { setWorkingMessage } }, { toolCallId: "tool-1", toolName: "bash" });
    expect(setWorkingMessage).toHaveBeenLastCalledWith("Baking... · 0s");
  });

  test("shows thinking status and then thought duration", () => {
    const { pi, emit } = createMockPi();
    const setWorkingMessage = vi.fn();
    installWorkingLine(pi as any, {
      phrases: ["Baking"],
      now: () => Date.now()
    });

    emit("agent_start", { ui: { setWorkingMessage } });
    emit("message_update", { ui: { setWorkingMessage } }, {
      assistantMessageEvent: { type: "thinking_start" }
    });

    expect(setWorkingMessage).toHaveBeenLastCalledWith("Baking... · 0s · thinking");

    vi.advanceTimersByTime(8_000);
    emit("message_update", { ui: { setWorkingMessage } }, {
      assistantMessageEvent: { type: "thinking_end" }
    });

    expect(setWorkingMessage).toHaveBeenLastCalledWith("Baking... · 8s · thought for 8s");
  });

  test("shows optional estimated token count from text deltas", () => {
    const { pi, emit } = createMockPi();
    const setWorkingMessage = vi.fn();
    installWorkingLine(pi as any, {
      phrases: ["Baking"],
      now: () => Date.now(),
      config: {
        segments: {
          tokens: true
        }
      }
    });

    emit("agent_start", { ui: { setWorkingMessage } });
    emit("message_update", { ui: { setWorkingMessage } }, {
      assistantMessageEvent: { type: "text_delta", delta: "x".repeat(7200) }
    });

    expect(setWorkingMessage).toHaveBeenLastCalledWith("Baking... · 0s · ↓ 1.8k tokens");
  });

  test("registers a dim custom renderer for turn duration messages", () => {
    const { pi, renderer } = createMockPi();
    piWorkingLine(pi as any);

    const component = renderer("pi-working-line")(
      { content: "Baked for 31s", details: { durationMs: 31_000, phrase: "Baking" } },
      { expanded: false },
      {
        fg: (color: string, text: string) => `<${color}>${text}</${color}>`
      }
    );

    expect(component.render(80).map((line: string) => line.trimEnd())).toEqual(["<dim> Baked for 31s</dim>"]);
  });

  test("sends optional turn duration message after long turns", () => {
    const { pi, emit } = createMockPi();
    const setWorkingMessage = vi.fn();
    const sendMessage = vi.fn();
    installWorkingLine({ ...pi, sendMessage } as any, {
      phrases: ["Baking"],
      now: () => Date.now(),
      config: {
        turnDuration: {
          enabled: true,
          thresholdMs: 30_000
        }
      }
    });

    emit("agent_start", { ui: { setWorkingMessage } });
    vi.advanceTimersByTime(31_000);
    emit("agent_end", { ui: { setWorkingMessage } });

    expect(sendMessage).toHaveBeenCalledWith({
      customType: "pi-working-line",
      content: "Baked for 31s",
      display: true,
      details: {
        durationMs: 31_000,
        phrase: "Baking"
      }
    });
  });

  test("does nothing when disabled", () => {
    const { pi, emit } = createMockPi();
    const setWorkingMessage = vi.fn();
    installWorkingLine(pi as any, {
      phrases: ["Baking"],
      now: () => Date.now(),
      config: {
        enabled: false
      }
    });

    emit("agent_start", { ui: { setWorkingMessage } });
    vi.advanceTimersByTime(5_000);
    emit("agent_end", { ui: { setWorkingMessage } });

    expect(setWorkingMessage).not.toHaveBeenCalled();
  });

  test("uses custom phrase configuration", () => {
    const { pi, emit } = createMockPi();
    const setWorkingMessage = vi.fn();
    installWorkingLine(pi as any, {
      phrases: ["Baking"],
      random: () => 0,
      now: () => Date.now(),
      config: {
        phrases: {
          mode: "replace",
          verbs: ["Consulting"]
        }
      }
    });

    emit("agent_start", { ui: { setWorkingMessage } });

    expect(setWorkingMessage).toHaveBeenLastCalledWith("Consulting... · 0s");
  });

  test("shows status and command help", async () => {
    const { pi, command } = createMockPi();
    const notify = vi.fn();
    installWorkingLine(pi as any, {
      phrases: ["Baking"],
      config: {
        segments: { tokens: true },
        phrases: { mode: "append", verbs: ["Consulting"] },
        turnDuration: { enabled: true, thresholdMs: 10_000 }
      }
    });

    await command("working-line").handler("", { ui: { notify } });

    expect(notify.mock.calls[0][0]).toContain("pi-working-line enabled");
    expect(notify.mock.calls[0][0]).toContain("tokens: on");
    expect(notify.mock.calls[0][0]).toContain("Turn duration: on, threshold 10s");
    expect(notify.mock.calls[0][0]).toContain("Phrases: built-ins + 1 custom");
    expect(notify.mock.calls[0][0]).toContain("Baking... · running bash · 12s · thinking · ↓ 1.8k tokens");
    expect(notify.mock.calls[0][0]).toContain("/working-line tokens on|off");
  });

  test("uses a custom panel that toggles tokens in place without closing or notifying", async () => {
    const { store, save } = createMemoryConfigStore({
      segments: {
        tokens: false
      }
    });
    const { pi, command, emit } = createMockPi();
    const notify = vi.fn();
    const { rendered, tui, theme, keybindings } = createPanelTestRuntime();
    const custom = vi.fn(async (factory) => {
      let result: unknown;
      const component = await factory(tui, theme, keybindings, (value: unknown) => {
        result = value;
      });
      rendered.push(component.render(80).join("\n"));
      component.handleInput("\n");
      await Promise.resolve();
      await Promise.resolve();
      rendered.push(component.render(80).join("\n"));
      component.handleInput("\u001b");
      return result;
    });
    const setWorkingMessage = vi.fn();
    installWorkingLine(pi as any, {
      phrases: ["Baking"],
      now: () => Date.now(),
      configStore: store
    });

    await command("working-line").handler("", {
      cwd: "/Users/test/project",
      hasUI: true,
      ui: { notify, custom }
    });

    expect(custom).toHaveBeenCalledTimes(1);
    expect(rendered[0]).toContain("Baking... · running bash · 12s · thinking");
    expect(rendered[0]).toContain("Toggle tokens");
    expect(rendered[0]).toContain("off");
    expect(rendered[1]).toContain("Baking... · running bash · 12s · thinking · ↓ 1.8k tokens");
    expect(rendered[1]).toContain("on");
    expect(save.mock.calls[0][0].segments.tokens).toBe(true);
    expect(notify).not.toHaveBeenCalled();

    emit("agent_start", { ui: { setWorkingMessage } });
    emit("message_update", { ui: { setWorkingMessage } }, {
      assistantMessageEvent: { type: "text_delta", delta: "x".repeat(7200) }
    });

    expect(setWorkingMessage).toHaveBeenLastCalledWith("Baking... · 0s · ↓ 1.8k tokens");
  });

  test("custom panel returns add phrase action and reopens phrases screen after saving", async () => {
    const { store, save, getConfig } = createMemoryConfigStore({});
    const { pi, command } = createMockPi();
    const notify = vi.fn();
    const input = vi.fn(async (_title?: string) => "Reticulating");
    const { rendered, tui, theme, keybindings } = createPanelTestRuntime();
    const custom = vi.fn()
      .mockImplementationOnce(async (factory) => {
        let result: unknown;
        const component = await factory(tui, theme, keybindings, (value: unknown) => {
          result = value;
        });
        component.handleInput("\u001b[B");
        component.handleInput("\u001b[B");
        component.handleInput("\u001b[B");
        component.handleInput("\u001b[B");
        component.handleInput("\n");
        await Promise.resolve();
        await Promise.resolve();
        return result;
      })
      .mockImplementationOnce(async (factory) => {
        let result: unknown;
        const component = await factory(tui, theme, keybindings, (value: unknown) => {
          result = value;
        });
        rendered.push(component.render(80).join("\n"));
        component.handleInput("\n");
        await Promise.resolve();
        await Promise.resolve();
        return result;
      })
      .mockImplementationOnce(async (factory) => {
        let result: unknown;
        const component = await factory(tui, theme, keybindings, (value: unknown) => {
          result = value;
        });
        rendered.push(component.render(80).join("\n"));
        component.handleInput("\u001b");
        return result;
      });
    installWorkingLine(pi as any, {
      phrases: ["Baking"],
      configStore: store
    });

    await command("working-line").handler("", {
      cwd: "/Users/test/project",
      hasUI: true,
      ui: { notify, custom, input }
    });

    expect(custom).toHaveBeenCalledTimes(3);
    expect(rendered[0]).toContain("Configure phrases");
    expect(rendered[0]).toContain("Custom phrases: 0");
    expect(rendered[1]).toContain("Custom phrases: 1");
    expect(input.mock.calls[0][0]).toBe("New phrase:");
    expect(save.mock.calls[0][0].phrases).toEqual({
      mode: "append",
      verbs: ["Reticulating"]
    });
    expect(getConfig().phrases.verbs).toEqual(["Reticulating"]);
    expect(notify.mock.calls[0][0]).toContain("Added phrase: Reticulating");
  });

  test("main custom panel omits low-use actions", async () => {
    const { store } = createMemoryConfigStore({});
    const { pi, command } = createMockPi();
    const notify = vi.fn();
    const { rendered, tui, theme, keybindings } = createPanelTestRuntime();
    const custom = vi.fn(async (factory) => {
      let result: unknown;
      const component = await factory(tui, theme, keybindings, (value: unknown) => {
        result = value;
      });
      rendered.push(component.render(80).join("\n"));
      component.handleInput("\u001b");
      return result;
    });
    installWorkingLine(pi as any, {
      configStore: store
    });

    await command("working-line").handler("", {
      cwd: "/Users/test/project",
      hasUI: true,
      ui: { notify, custom }
    });

    expect(rendered[0]).not.toContain("Done");
    expect(rendered[0]).not.toContain("Reset to defaults");
    expect(rendered[0]).not.toContain("Status / help");
  });

  test("custom panel supports j and k navigation", async () => {
    const { store, save } = createMemoryConfigStore({
      segments: {
        thinking: true
      }
    });
    const { pi, command } = createMockPi();
    const notify = vi.fn();
    const { rendered, tui, theme, keybindings } = createPanelTestRuntime();
    const custom = vi.fn(async (factory) => {
      let result: unknown;
      const component = await factory(tui, theme, keybindings, (value: unknown) => {
        result = value;
      });
      component.handleInput("j");
      rendered.push(component.render(80).join("\n"));
      component.handleInput("\n");
      await Promise.resolve();
      await Promise.resolve();
      rendered.push(component.render(80).join("\n"));
      component.handleInput("k");
      rendered.push(component.render(80).join("\n"));
      component.handleInput("\u001b");
      return result;
    });
    installWorkingLine(pi as any, {
      configStore: store
    });

    await command("working-line").handler("", {
      cwd: "/Users/test/project",
      hasUI: true,
      ui: { notify, custom }
    });

    expect(rendered[0]).toContain("Toggle thinking");
    expect(save.mock.calls[0][0].segments.thinking).toBe(false);
    expect(rendered[1]).toContain("Toggle thinking");
    expect(rendered[1]).toContain("off");
    expect(rendered[2]).toContain("Toggle tokens");
  });

  test("blocks replace mode when there are no custom phrases", async () => {
    const { store, save } = createMemoryConfigStore({});
    const { pi, command } = createMockPi();
    const notify = vi.fn();
    installWorkingLine(pi as any, {
      configStore: store
    });

    await command("working-line").handler("phrases mode replace", {
      cwd: "/Users/test/project",
      hasUI: false,
      ui: { notify }
    });

    expect(save).not.toHaveBeenCalled();
    expect(notify.mock.calls[0][0]).toContain("Add at least one custom phrase before switching to replace mode.");
  });

  test("supports direct phrase and turn-duration commands", async () => {
    const { store, save, getConfig } = createMemoryConfigStore({});
    const { pi, command } = createMockPi();
    const notify = vi.fn();
    installWorkingLine(pi as any, {
      configStore: store
    });

    await command("working-line").handler("phrases add Consulting", {
      cwd: "/Users/test/project",
      hasUI: false,
      ui: { notify }
    });
    await command("working-line").handler("phrases mode replace", {
      cwd: "/Users/test/project",
      hasUI: false,
      ui: { notify }
    });
    await command("working-line").handler("turn-duration threshold 45s", {
      cwd: "/Users/test/project",
      hasUI: false,
      ui: { notify }
    });

    expect(save).toHaveBeenCalledTimes(3);
    expect(getConfig().phrases).toEqual({ mode: "replace", verbs: ["Consulting"] });
    expect(getConfig().turnDuration.thresholdMs).toBe(45_000);
  });
});
