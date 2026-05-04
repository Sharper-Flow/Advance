import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const store = {
    init: vi.fn(async () => {}),
    close: vi.fn(),
    flush: vi.fn(async () => {}),
  };

  const inProcessWorker = {
    shutdown: vi.fn(async () => {}),
    registerQueue: vi.fn(async () => {}),
    get queues() {
      return [] as readonly string[];
    },
  };

  return {
    store,
    heartbeatWriter: {
      stop: vi.fn(async () => {}),
    },
    startHeartbeatWriter: vi.fn(() => mocks.heartbeatWriter),
    createStore: vi.fn(async () => store as any),
    getProjectId: vi.fn(async () => "proj-cleanup"),
    ensureTemporalRuntime: vi.fn(async () => ({
      address: "127.0.0.1:7233",
      namespace: "default",
      startedRuntime: true,
    })),
    inProcessWorker,
    createInProcessWorker: vi.fn(async () => inProcessWorker),
    initStsl: vi.fn(async () => ({
      address: "127.0.0.1:7233",
      namespace: "default",
      connection: { close: vi.fn(async () => {}) } as any,
      client: { workflow: { start: vi.fn(), getHandle: vi.fn() } } as any,
    })),
  };
});

vi.mock("./storage/store", () => ({ createStore: mocks.createStore }));

vi.mock("./utils/project-id", async () => {
  const actual =
    await vi.importActual<typeof import("./utils/project-id")>(
      "./utils/project-id",
    );
  return { ...actual, getProjectId: mocks.getProjectId };
});

// Stub worker-lock so this test doesn't write real lock files.
vi.mock("./temporal/worker-lock", () => ({
  HEARTBEAT_INTERVAL_MS: 5000,
  WORKER_LOCK_FILENAME: "worker.lock",
  acquireWorkerLock: vi.fn(async () => ({
    owned: true,
    ownerPid: process.pid,
    workerId: "test-worker-id",
    lockPath: "/tmp/test/worker.lock",
  })),
  releaseWorkerLock: vi.fn(async () => {}),
}));

vi.mock("./temporal/heartbeat-writer", () => ({
  startHeartbeatWriter: mocks.startHeartbeatWriter,
}));

vi.mock("./temporal/runtime-manager", async () => {
  const actual = await vi.importActual<
    typeof import("./temporal/runtime-manager")
  >("./temporal/runtime-manager");
  return {
    ...actual,
    ensureTemporalRuntime: mocks.ensureTemporalRuntime,
  };
});

vi.mock("./temporal/service", async () => {
  const actual =
    await vi.importActual<typeof import("./temporal/service")>(
      "./temporal/service",
    );
  return {
    ...actual,
    initStsl: mocks.initStsl,
    closeStsl: vi.fn(async () => {}),
  };
});

vi.mock("./temporal/in-process-worker", () => ({
  createInProcessWorker: mocks.createInProcessWorker,
}));

vi.mock("node:fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
  return { ...actual, readdir: vi.fn(async () => []) };
});

describe("plugin-init in-process worker shutdown (A4b')", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registerShutdownHandlers drains the in-process Temporal worker on handleExit", async () => {
    const { tryInitStore, registerShutdownHandlers } =
      await import("./plugin-init");

    const init = await tryInitStore("/tmp/repo", "/tmp/external/proj-cleanup");
    expect(mocks.createInProcessWorker).toHaveBeenCalledTimes(1);

    const handlers = registerShutdownHandlers(init.store);
    try {
      handlers.handleExit();
    } finally {
      handlers.removeProcessListeners();
    }

    // handleExit fires drain as void promise; allow the microtask queue to flush.
    await new Promise((r) => setImmediate(r));

    expect(mocks.inProcessWorker.shutdown).toHaveBeenCalledTimes(1);
  });

  it("registerShutdownHandlers is safe when no worker was created (no projectId)", async () => {
    mocks.getProjectId.mockResolvedValueOnce(null);
    const { tryInitStore, registerShutdownHandlers } =
      await import("./plugin-init");

    const init = await tryInitStore("/tmp/repo", undefined);
    expect(mocks.createInProcessWorker).not.toHaveBeenCalled();

    const handlers = registerShutdownHandlers(init.store);
    try {
      expect(() => handlers.handleExit()).not.toThrow();
    } finally {
      handlers.removeProcessListeners();
    }

    expect(mocks.inProcessWorker.shutdown).not.toHaveBeenCalled();
  });

  it("shutdownWithFlush preserves flushInFlight idempotency and orders flush -> worker.shutdown -> close", async () => {
    const order: string[] = [];
    mocks.store.flush.mockImplementationOnce(async () => {
      order.push("flush:start");
      await Promise.resolve();
      order.push("flush:end");
    });
    mocks.store.close.mockImplementationOnce(() => {
      order.push("store.close");
    });
    mocks.inProcessWorker.shutdown.mockImplementationOnce(async () => {
      order.push("worker.shutdown");
    });

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(
        (() => undefined) as unknown as (
          code?: string | number | null | undefined,
        ) => never,
      );

    const { tryInitStore, registerShutdownHandlers } =
      await import("./plugin-init");

    const init = await tryInitStore("/tmp/repo", "/tmp/external/proj-cleanup");
    const handlers = registerShutdownHandlers(init.store);
    try {
      handlers.shutdownWithFlush();
      handlers.shutdownWithFlush();
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
    } finally {
      handlers.removeProcessListeners();
      exitSpy.mockRestore();
    }

    expect(mocks.store.flush).toHaveBeenCalledTimes(1);
    expect(mocks.inProcessWorker.shutdown).toHaveBeenCalledTimes(1);
    expect(mocks.store.close).toHaveBeenCalledTimes(1);
    expect(order).toEqual([
      "flush:start",
      "flush:end",
      "worker.shutdown",
      "store.close",
    ]);
  });
});
