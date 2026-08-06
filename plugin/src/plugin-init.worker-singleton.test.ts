import { afterEach, describe, expect, test, vi } from "vitest";

import { registerShutdownHandlers } from "./plugin-init";

describe("plugin-init shutdown handlers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("flushes and closes store before signal exit", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const store = {
      flush: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
    } as any;
    const handlers = registerShutdownHandlers(store);

    try {
      handlers.shutdownWithFlush();
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(store.flush).toHaveBeenCalledTimes(1);
      expect(store.close).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      handlers.removeProcessListeners();
    }
  });

  test("null-store shutdown exits without flush/close", () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const handlers = registerShutdownHandlers(null);

    try {
      handlers.shutdownWithFlush();

      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      handlers.removeProcessListeners();
    }
  });

  test("does not register duplicate process listeners on repeated init", () => {
    const before = process.listenerCount("SIGINT");
    const first = registerShutdownHandlers(null);
    const afterFirst = process.listenerCount("SIGINT");
    const second = registerShutdownHandlers(null);

    try {
      expect(afterFirst).toBe(before + 1);
      expect(process.listenerCount("SIGINT")).toBe(afterFirst);
    } finally {
      second.removeProcessListeners();
      first.removeProcessListeners();
    }

    expect(process.listenerCount("SIGINT")).toBe(before);
  });
});
