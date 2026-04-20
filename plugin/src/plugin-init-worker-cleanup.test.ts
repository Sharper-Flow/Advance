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
    createStore: vi.fn(async () => store as any),
    getProjectId: vi.fn(async () => "proj-cleanup"),
    ensureTemporalRuntime: vi.fn(async () => ({
      address: "127.0.0.1:7233",
      namespace: "default",
      startedRuntime: true,
    })),
    inProcessWorker,
    createInProcessWorker: vi.fn(async () => inProcessWorker),
    createTemporalClientBundle: vi.fn(async () => ({
      address: "127.0.0.1:7233",
      namespace: "default",
      connection: { close: vi.fn(async () => {}) } as any,
      client: { workflow: { start: vi.fn(), getHandle: vi.fn() } } as any,
    })),
  };
});

vi.mock("./storage/store", () => ({ createStore: mocks.createStore }));

vi.mock("./utils/project-id", () => ({ getProjectId: mocks.getProjectId }));

vi.mock("./temporal/runtime-manager", async () => {
  const actual = await vi.importActual<
    typeof import("./temporal/runtime-manager")
  >("./temporal/runtime-manager");
  return {
    ...actual,
    ensureTemporalRuntime: mocks.ensureTemporalRuntime,
  };
});

vi.mock("./temporal/client", async () => {
  const actual = await vi.importActual<typeof import("./temporal/client")>(
    "./temporal/client",
  );
  return {
    ...actual,
    createTemporalClientBundle: mocks.createTemporalClientBundle,
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
    const { tryInitStore, registerShutdownHandlers } = await import(
      "./plugin-init"
    );

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
    const { tryInitStore, registerShutdownHandlers } = await import(
      "./plugin-init"
    );

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
});
