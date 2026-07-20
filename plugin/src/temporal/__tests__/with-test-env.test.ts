import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLocalTestWorkflowEnvironment,
  createTestWorkflowEnvironment,
  createTimeSkippingTestWorkflowEnvironment,
  TEARDOWN_ERROR,
  type TemporalTestContext,
  withTestWorkflowEnvironment,
  withTimeSkippingTestWorkflowEnvironment,
} from "./with-test-env";

const { createTimeSkippingMock, createLocalMock } = vi.hoisted(() => ({
  createTimeSkippingMock: vi.fn(),
  createLocalMock: vi.fn(),
}));

vi.mock("@temporalio/testing", () => ({
  TestWorkflowEnvironment: {
    createTimeSkipping: createTimeSkippingMock,
    createLocal: createLocalMock,
  },
}));

interface FakeEnv {
  teardown: () => Promise<void>;
}

describe("withTestWorkflowEnvironment", () => {
  it("creates the env from a stable non-worktree cwd and restores cwd", async () => {
    const originalCwd = process.cwd();
    let observedCwd = "";

    await createTestWorkflowEnvironment(async () => {
      observedCwd = process.cwd();
      return { teardown: async () => {} };
    });

    expect(observedCwd).toContain("advance-temporal-test-cwd");
    expect(process.cwd()).toBe(originalCwd);
  });

  it("calls fn with the created env and tears down on success", async () => {
    const teardown = vi.fn(async () => {});
    const fakeEnv: FakeEnv = { teardown };
    const createEnv = vi.fn(async () => fakeEnv);
    const fn = vi.fn(async (env: FakeEnv) => {
      expect(env).toBe(fakeEnv);
      return 42;
    });

    const result = await withTestWorkflowEnvironment(createEnv, fn);

    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledWith(
      fakeEnv,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it("tears down even when fn throws, and propagates fn's error", async () => {
    const teardown = vi.fn(async () => {});
    const createEnv = async () => ({ teardown });
    const fn = async () => {
      throw new Error("boom from fn");
    };

    await expect(withTestWorkflowEnvironment(createEnv, fn)).rejects.toThrow(
      "boom from fn",
    );
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it("propagates teardown errors when fn succeeds", async () => {
    const createEnv = async () => ({
      teardown: async () => {
        throw new Error("teardown exploded");
      },
    });
    const fn = async () => "ok";

    await expect(withTestWorkflowEnvironment(createEnv, fn)).rejects.toThrow(
      "teardown exploded",
    );
  });

  it("preserves fn's error as primary when both fn and teardown throw", async () => {
    // The callback error is the actionable failure; teardown errors are
    // recorded as secondary evidence so they can be inspected without
    // hiding the original failure.
    const createEnv = async () => ({
      teardown: async () => {
        throw new Error("teardown-err");
      },
    });
    const fn = async () => {
      throw new Error("fn-err");
    };

    let caught: unknown;
    try {
      await withTestWorkflowEnvironment(createEnv, fn);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("fn-err");
    expect(
      (caught as Error & { [TEARDOWN_ERROR]?: unknown })[TEARDOWN_ERROR],
    ).toBeInstanceOf(Error);
    expect(
      (caught as Error & { [TEARDOWN_ERROR]?: Error })[TEARDOWN_ERROR]?.message,
    ).toBe("teardown-err");
  });

  it("passes a signal context to fn", async () => {
    const fn = vi.fn(async (_env, context?: TemporalTestContext) => {
      expect(context?.signal).toBeInstanceOf(AbortSignal);
      return "ok";
    });
    const createEnv = async () => ({ teardown: async () => {} });

    const result = await withTestWorkflowEnvironment(createEnv, fn);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("awaits callback/worker settlement before teardown when the callback is aborted", async () => {
    const controller = new AbortController();
    const order: string[] = [];

    const fakeWorker = {
      runUntil: async (callback: () => Promise<void>) => {
        try {
          await callback();
        } finally {
          order.push("worker-settled");
        }
      },
    };

    const teardown = vi.fn(async () => {
      order.push("teardown");
    });
    const createEnv = async () => ({ teardown });

    const fn = async (_env: FakeEnv, context?: TemporalTestContext) => {
      await fakeWorker.runUntil(async () => {
        await new Promise<void>((_, reject) => {
          context!.signal.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        });
      });
    };

    const promise = withTestWorkflowEnvironment(createEnv, fn, {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 10);

    await expect(promise).rejects.toThrow("aborted");
    expect(order).toEqual(["worker-settled", "teardown"]);
    expect(teardown).toHaveBeenCalledTimes(1);
  });
});

describe("scoped Temporal harness worker ownership", () => {
  it("exposes a registerWorker method on the context", () => {
    const ctx: TemporalTestContext = {
      signal: new AbortController().signal,
      registerWorker: () => {},
    };
    expect(typeof ctx.registerWorker).toBe("function");
  });

  it("owns registered worker shutdown before env teardown after fn success", async () => {
    const order: string[] = [];
    let shutdownResolve!: () => void;
    const shutdownPromise = new Promise<void>((resolve) => {
      shutdownResolve = resolve;
    });

    const fakeWorker = {
      shutdown: async () => {
        await shutdownPromise;
        order.push("worker-shutdown");
      },
    };

    const teardown = vi.fn(async () => {
      order.push("teardown");
    });
    const createEnv = async () => ({ teardown });

    const fn = async (_env: FakeEnv, context?: TemporalTestContext) => {
      context!.registerWorker(fakeWorker);
      return "ok";
    };

    const promise = withTestWorkflowEnvironment(createEnv, fn);
    setTimeout(() => shutdownResolve(), 10);

    await expect(promise).resolves.toBe("ok");
    expect(order).toEqual(["worker-shutdown", "teardown"]);
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it("owns registered worker shutdown before env teardown after fn throws", async () => {
    const order: string[] = [];
    let shutdownResolve!: () => void;
    const shutdownPromise = new Promise<void>((resolve) => {
      shutdownResolve = resolve;
    });

    const fakeWorker = {
      shutdown: async () => {
        await shutdownPromise;
        order.push("worker-shutdown");
      },
    };

    const teardown = vi.fn(async () => {
      order.push("teardown");
    });
    const createEnv = async () => ({ teardown });

    const fn = async (_env: FakeEnv, context?: TemporalTestContext) => {
      context!.registerWorker(fakeWorker);
      throw new Error("fn-err");
    };

    const promise = withTestWorkflowEnvironment(createEnv, fn);
    setTimeout(() => shutdownResolve(), 10);

    await expect(promise).rejects.toThrow("fn-err");
    expect(order).toEqual(["worker-shutdown", "teardown"]);
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it("preserves fn's error as primary when registered worker shutdown throws", async () => {
    const createEnv = async () => ({
      teardown: async () => {},
    });

    const fn = async (_env: FakeEnv, context?: TemporalTestContext) => {
      context!.registerWorker({
        shutdown: async () => {
          throw new Error("worker-shutdown-err");
        },
      });
      throw new Error("fn-err");
    };

    let caught: unknown;
    try {
      await withTestWorkflowEnvironment(createEnv, fn);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("fn-err");
    expect(
      (caught as Error & { [TEARDOWN_ERROR]?: unknown })[TEARDOWN_ERROR],
    ).toBeInstanceOf(Error);
    expect(
      (caught as Error & { [TEARDOWN_ERROR]?: Error })[TEARDOWN_ERROR]?.message,
    ).toBe("worker-shutdown-err");
  });

  it("settles multiple registered workers before env teardown", async () => {
    const order: string[] = [];

    const fakeWorkerA = {
      shutdown: async () => {
        order.push("worker-a-shutdown");
      },
    };
    const fakeWorkerB = {
      shutdown: async () => {
        order.push("worker-b-shutdown");
      },
    };

    const teardown = vi.fn(async () => {
      order.push("teardown");
    });
    const createEnv = async () => ({ teardown });

    const fn = async (_env: FakeEnv, context?: TemporalTestContext) => {
      context!.registerWorker(fakeWorkerA);
      context!.registerWorker(fakeWorkerB);
      return "ok";
    };

    await withTestWorkflowEnvironment(createEnv, fn);

    expect(order).toEqual([
      "worker-a-shutdown",
      "worker-b-shutdown",
      "teardown",
    ]);
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it("does not infer workers from runUntil callbacks (no undisclosed-worker inference)", async () => {
    // A worker that is used inside fn but NOT registered with the harness
    // must not be shutdown by the harness — that's the user's responsibility
    // (either await runUntil themselves, or register explicitly). The
    // contract is: workers are owned only when the user opts in.
    const order: string[] = [];

    const unregisteredWorker = {
      shutdown: async () => {
        order.push("unregistered-worker-shutdown");
      },
      runUntil: async (callback: () => Promise<void>) => {
        try {
          await callback();
        } finally {
          order.push("unregistered-worker-settled");
        }
      },
    };

    const teardown = vi.fn(async () => {
      order.push("teardown");
    });
    const createEnv = async () => ({ teardown });

    const fn = async (_env: FakeEnv, _context?: TemporalTestContext) => {
      await unregisteredWorker.runUntil(async () => {
        // no-op
      });
    };

    await withTestWorkflowEnvironment(createEnv, fn);

    // The harness NEVER infers: only the runUntil-settled marker should appear.
    // The "unregistered-worker-shutdown" path must NOT fire.
    expect(order).toEqual(["unregistered-worker-settled", "teardown"]);
  });
});

describe("named constructor wrappers", () => {
  beforeEach(() => {
    createTimeSkippingMock.mockReset();
    createLocalMock.mockReset();
  });

  it("createTimeSkippingTestWorkflowEnvironment constructs via the SDK from the stable cwd and restores cwd", async () => {
    const originalCwd = process.cwd();
    let observedCwd = "";
    const fakeEnv = { teardown: vi.fn(async () => {}) };
    createTimeSkippingMock.mockImplementation(async () => {
      observedCwd = process.cwd();
      return fakeEnv;
    });

    const env = await createTimeSkippingTestWorkflowEnvironment();

    expect(createTimeSkippingMock).toHaveBeenCalledTimes(1);
    expect(env).toBe(fakeEnv);
    expect(observedCwd).toContain("advance-temporal-test-cwd");
    expect(process.cwd()).toBe(originalCwd);
  });

  it("createLocalTestWorkflowEnvironment constructs via createLocal from the stable cwd and restores cwd", async () => {
    const originalCwd = process.cwd();
    let observedCwd = "";
    const fakeEnv = { teardown: vi.fn(async () => {}) };
    createLocalMock.mockImplementation(async () => {
      observedCwd = process.cwd();
      return fakeEnv;
    });

    const env = await createLocalTestWorkflowEnvironment();

    expect(createLocalMock).toHaveBeenCalledTimes(1);
    expect(env).toBe(fakeEnv);
    expect(observedCwd).toContain("advance-temporal-test-cwd");
    expect(process.cwd()).toBe(originalCwd);
  });

  it("withTimeSkippingTestWorkflowEnvironment runs fn with the created env and tears down on success", async () => {
    const teardown = vi.fn(async () => {});
    const fakeEnv = { teardown };
    createTimeSkippingMock.mockResolvedValue(fakeEnv);

    const result = await withTimeSkippingTestWorkflowEnvironment(
      async (env) => {
        expect(env).toBe(fakeEnv);
        return "ok";
      },
    );

    expect(result).toBe("ok");
    expect(createTimeSkippingMock).toHaveBeenCalledTimes(1);
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it("withTimeSkippingTestWorkflowEnvironment tears down when fn throws and propagates fn's error", async () => {
    const teardown = vi.fn(async () => {});
    createTimeSkippingMock.mockResolvedValue({ teardown });

    await expect(
      withTimeSkippingTestWorkflowEnvironment(async () => {
        throw new Error("boom from fn");
      }),
    ).rejects.toThrow("boom from fn");
    expect(teardown).toHaveBeenCalledTimes(1);
  });
});

describe("signal-aware teardown regression (reapLeakedTestServers AC2)", () => {
  it("runs teardown when fn rejects via an external AbortSignal", async () => {
    // Deterministic interrupt: proves the finally-guarantee holds when fn is
    // cancelled mid-flight, which is exactly how a signal-aware fn behaves
    // when Vitest aborts the test signal on timeout.
    const controller = new AbortController();
    const teardown = vi.fn(async () => {});

    const promise = withTestWorkflowEnvironment(
      async () => ({ teardown }),
      () =>
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new Error("AbortError: test interrupted"));
          });
        }),
    );
    setTimeout(() => controller.abort(), 10);

    await expect(promise).rejects.toThrow("AbortError: test interrupted");
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  describe("Vitest timeout path", () => {
    const teardownLog: string[] = [];

    // it.fails: this test is DESIGNED to time out. Vitest 4 aborts the
    // TestContext signal on timeout (verified empirically against vitest
    // 4.1.8: the timed-out test reports as expected-fail and the follow-up
    // assertion below observes the teardown side effects).
    it.fails(
      "interrupts fn via the Vitest test signal on timeout",
      async ({ signal }) => {
        await withTestWorkflowEnvironment(
          async () => ({
            teardown: async () => {
              teardownLog.push("teardown");
            },
          }),
          () =>
            new Promise<never>((_, reject) => {
              signal.addEventListener("abort", () => {
                teardownLog.push("fn-aborted");
                reject(new Error("AbortError: vitest timeout"));
              });
            }),
        );
      },
      150, // deliberately tiny: the timeout IS the scenario under test
    );

    it("ran teardown for the timed-out test (finally survived the abort)", () => {
      // If the helper's finally-guarantee breaks (teardown removed, or fn
      // never settles so finally never runs), this assertion fails even
      // though the it.fails test above still counts as an expected fail.
      expect(teardownLog).toContain("fn-aborted");
      expect(teardownLog).toContain("teardown");
    });
  });
});
