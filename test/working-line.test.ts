import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { installWorkingLine } from "../src/working-line.js";

type Handler = (event: unknown, ctx: any) => void;

function createMockPi() {
  const handlers = new Map<string, Handler[]>();
  return {
    pi: {
      on(event: string, handler: Handler) {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      }
    },
    emit(event: string, ctx: any = {}) {
      for (const handler of handlers.get(event) ?? []) {
        handler({ type: event }, ctx);
      }
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
});
