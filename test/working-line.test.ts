import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { installWorkingLine } from "../src/working-line.js";

type Handler = (event: unknown, ctx: any) => void;

function createMockPi() {
  const handlers = new Map<string, Handler[]>();
  const commands = new Map<string, any>();
  return {
    pi: {
      on(event: string, handler: Handler) {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      },
      registerCommand(name: string, options: any) {
        commands.set(name, options);
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
    }
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

  test("registers a read-only status command", async () => {
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
    expect(notify.mock.calls[0][0]).toContain("turn duration: on, threshold 10s");
    expect(notify.mock.calls[0][0]).toContain("phrases: 2");
    expect(notify.mock.calls[0][0]).toContain("Baking... · running bash · 12s · thinking · ↓ 1.8k tokens");
  });
});
