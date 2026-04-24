import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const mocks = vi.hoisted(() => {
  const store = {
    init: vi.fn(async () => {}),
    close: vi.fn(),
    flush: vi.fn(async () => {}),
  };

  return {
    store,
    createStore: vi.fn(async () => store as any),
    getProjectId: vi.fn(async () => null),
    ensureTemporalRuntime: vi.fn(async () => ({
      address: "127.0.0.1:7233",
      namespace: "default",
      startedRuntime: true,
    })),
    // Default: Node runtime → in-process worker works.
    probeTemporalWorkerRuntime: vi.fn(() => ({
      supported: true,
      runtime: "node" as const,
      reason: "node",
    })),
    resolveNodeExecutable: vi.fn(() => ({
      found: true,
      path: "/usr/bin/node",
      source: "path" as const,
    })),
    inProcessWorker: {
      registerQueue: vi.fn(async () => {}),
      shutdown: vi.fn(async () => {}),
      get queues() {
        return [] as readonly string[];
      },
    },
    outOfProcessWorker: {
      registerQueue: vi.fn(async () => {}),
      shutdown: vi.fn(async () => {}),
      isAlive: vi.fn(() => true),
      get queues() {
        return [] as readonly string[];
      },
    },
    createInProcessWorker: vi.fn(async () => mocks.inProcessWorker),
    createOutOfProcessWorker: vi.fn(async () => mocks.outOfProcessWorker),
    workflowStart: vi.fn(async () => ({
      query: vi.fn(),
      executeUpdate: vi.fn(),
    })),
    workflowGetHandle: vi.fn(() => ({
      query: vi.fn(),
      executeUpdate: vi.fn(),
    })),
    initStsl: vi.fn(async () => ({
      address: "127.0.0.1:7233",
      namespace: "default",
      connection: {} as any,
      client: {
        workflow: {
          start: mocks.workflowStart,
          getHandle: mocks.workflowGetHandle,
        },
      } as any,
    })),
    discoverProjectPaths: vi.fn(async () => []),
    runMigrationSweep: vi.fn(async () => ({})),
  };
});

vi.mock("./storage/store", () => ({
  createStore: mocks.createStore,
}));

vi.mock("./utils/project-id", () => ({
  getProjectId: mocks.getProjectId,
}));

vi.mock("./temporal/runtime-manager", async () => {
  const actual = await vi.importActual<
    typeof import("./temporal/runtime-manager")
  >("./temporal/runtime-manager");
  return {
    ...actual,
    ensureTemporalRuntime: mocks.ensureTemporalRuntime,
    probeTemporalWorkerRuntime: mocks.probeTemporalWorkerRuntime,
    resolveNodeExecutable: mocks.resolveNodeExecutable,
  };
});

vi.mock("./temporal/in-process-worker", () => ({
  createInProcessWorker: mocks.createInProcessWorker,
}));

vi.mock("./temporal/out-of-process-worker", () => ({
  createOutOfProcessWorker: mocks.createOutOfProcessWorker,
}));

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

vi.mock("node:fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
  return {
    ...actual,
    readdir: vi.fn(async () => []),
  };
});

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(() => true),
  };
});

vi.mock("./storage/agenda", () => ({
  loadAgenda: vi.fn(async () => ({ items: [] })),
}));

vi.mock("./storage/project-wisdom", () => ({
  listProjectWisdom: vi.fn(async () => []),
}));

vi.mock("./storage/json", () => ({
  loadAllChanges: vi.fn(async () => new Map()),
}));

describe("plugin-init tryInitStore", () => {
  let profileDir: string;
  let originalAdvProfile: string | undefined;
  let originalCacheDir: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    profileDir = mkdtempSync(join(tmpdir(), "adv-plugin-init-"));
    originalAdvProfile = process.env.ADV_PROFILE;
    originalCacheDir = process.env.OPEN_CHAD_CACHE_DIR;
    process.env.OPEN_CHAD_CACHE_DIR = profileDir;
  });

  afterEach(() => {
    if (originalAdvProfile === undefined) {
      delete process.env.ADV_PROFILE;
    } else {
      process.env.ADV_PROFILE = originalAdvProfile;
    }
    if (originalCacheDir === undefined) {
      delete process.env.OPEN_CHAD_CACHE_DIR;
    } else {
      process.env.OPEN_CHAD_CACHE_DIR = originalCacheDir;
    }
    rmSync(profileDir, { recursive: true, force: true });
  });

  const profileLogFile = () => join(profileDir, "adv-profile.log");

  it("wires Temporal runtime + bundle into createStore when projectId resolves", async () => {
    mocks.getProjectId.mockResolvedValueOnce("proj-sha");

    const { tryInitStore } = await import("./plugin-init");

    const result = await tryInitStore("/tmp/repo", "/tmp/external");

    expect(mocks.ensureTemporalRuntime).toHaveBeenCalledWith("proj-sha");
    expect(mocks.createInProcessWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "127.0.0.1:7233",
        namespace: "default",
        queues: ["advance-proj-sha"],
      }),
    );
    expect(mocks.initStsl).toHaveBeenCalledWith(
      expect.objectContaining({
        ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
        ADV_TEMPORAL_NAMESPACE: "default",
      }),
    );
    expect(mocks.createStore).toHaveBeenCalledWith("/tmp/repo", {
      externalRoot: "/tmp/external",
      projectIdOverride: "proj-sha",
      temporalBundle: expect.objectContaining({
        address: "127.0.0.1:7233",
        namespace: "default",
      }),
    });
    expect(mocks.store.init).toHaveBeenCalled();
    expect(result).toEqual({ store: mocks.store, initError: null });
  });

  it("returns initError and never calls createStore when runtime probe blocks Bun", async () => {
    mocks.getProjectId.mockResolvedValueOnce("proj-sha");
    mocks.ensureTemporalRuntime.mockRejectedValueOnce(
      new Error(
        "Bun runtime does not expose Bun.spawn for local runtime/bootstrap management. Run the plugin on Node or upgrade Bun before enabling Temporal-backed storage.",
      ),
    );

    const { tryInitStore } = await import("./plugin-init");

    const result = await tryInitStore("/tmp/repo", "/tmp/external");

    expect(mocks.createStore).not.toHaveBeenCalled();
    expect(result.store).toBeNull();
    expect(result.initError).toBeInstanceOf(Error);
    expect(result.initError?.message).toMatch(
      /Bun runtime does not expose Bun\.spawn/,
    );
  });

  it("does not emit console.warn or console.error when Temporal init fails (narrow scope per validator)", async () => {
    mocks.getProjectId.mockResolvedValue("proj-sha");
    mocks.ensureTemporalRuntime.mockImplementation(async () => {
      throw new Error(
        "Bun runtime does not expose Bun.spawn for local runtime",
      );
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { tryInitStore } = await import("./plugin-init");

    const result = await tryInitStore("/tmp/repo", "/tmp/external");

    // Assert init failed so we know we hit the catch branch
    expect(result.store).toBeNull();
    expect(result.initError).toBeInstanceOf(Error);

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    errorSpy.mockRestore();

    // Restore the default mock so it doesn't affect other tests
    mocks.ensureTemporalRuntime.mockImplementation(async () => ({
      address: "127.0.0.1:7233",
      namespace: "default",
      startedRuntime: true,
    }));
  });

  it("shuts down a created worker if later plugin init steps fail", async () => {
    mocks.getProjectId.mockResolvedValue("proj-sha");
    mocks.probeTemporalWorkerRuntime.mockReturnValue({
      supported: true,
      runtime: "node",
      reason: "node",
    });
    mocks.createStore.mockImplementationOnce(async () => {
      throw new Error("store create exploded");
    });

    const { tryInitStore } = await import("./plugin-init");
    const result = await tryInitStore("/tmp/repo", "/tmp/external");

    expect(result.store).toBeNull();
    expect(result.initError?.message).toMatch(/store create exploded/);
    expect(mocks.createInProcessWorker).toHaveBeenCalledTimes(1);
    expect(mocks.inProcessWorker.shutdown).toHaveBeenCalledTimes(1);
  });

  it("writes temporal startup profile events when ADV_PROFILE=1 on the normal path", async () => {
    process.env.ADV_PROFILE = "1";
    mocks.getProjectId.mockResolvedValueOnce("proj-sha");

    const { tryInitStore } = await import("./plugin-init");
    const result = await tryInitStore("/tmp/repo", "/tmp/external");

    expect(result).toEqual({ store: mocks.store, initError: null });
    expect(existsSync(profileLogFile())).toBe(true);
    const content = readFileSync(profileLogFile(), "utf-8");
    expect(content).toContain('"event":"project_id_resolved"');
    expect(content).toContain('"event":"worker_started"');
    expect(content).toContain('"worker_model":"in_process"');
    expect(content).toContain('"backend_mode":"temporal"');
    expect(content).toContain('"event":"try_init_store_complete"');
  });
});

describe("tryInitStore worker routing (Phase 2.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks: Node runtime with Node found on PATH.
    mocks.probeTemporalWorkerRuntime.mockReturnValue({
      supported: true,
      runtime: "node",
      reason: "node",
    });
    mocks.resolveNodeExecutable.mockReturnValue({
      found: true,
      path: "/usr/bin/node",
      source: "path",
    });
    mocks.ensureTemporalRuntime.mockImplementation(async () => ({
      address: "127.0.0.1:7233",
      namespace: "default",
      startedRuntime: true,
    }));
  });

  it("uses in-process worker under Node runtime", async () => {
    mocks.getProjectId.mockResolvedValueOnce("proj-sha");

    const { tryInitStore } = await import("./plugin-init");
    await tryInitStore("/tmp/repo", "/tmp/external");

    expect(mocks.createInProcessWorker).toHaveBeenCalledTimes(1);
    expect(mocks.createOutOfProcessWorker).not.toHaveBeenCalled();
  });

  it("uses out-of-process worker when Bun detected AND Node available", async () => {
    mocks.getProjectId.mockResolvedValueOnce("proj-sha");
    mocks.probeTemporalWorkerRuntime.mockReturnValueOnce({
      supported: false,
      runtime: "bun",
      reason: "Bun cannot host worker",
      remediation: "use OOP",
    });

    const { tryInitStore } = await import("./plugin-init");
    const result = await tryInitStore("/tmp/repo", "/tmp/external");

    expect(mocks.createOutOfProcessWorker).toHaveBeenCalledTimes(1);
    expect(mocks.createInProcessWorker).not.toHaveBeenCalled();
    expect(result.store).toBe(mocks.store);
    expect(result.initError).toBeNull();
  });

  it("returns initError when Bun detected AND Node NOT available AND fallback flag not set", async () => {
    mocks.getProjectId.mockResolvedValueOnce("proj-sha");
    mocks.probeTemporalWorkerRuntime.mockReturnValueOnce({
      supported: false,
      runtime: "bun",
      reason: "Bun cannot host worker",
      remediation: "use OOP or fallback",
    });
    mocks.resolveNodeExecutable.mockReturnValueOnce({
      found: false,
      source: "none",
      remediation: "Install Node",
    });

    const { tryInitStore } = await import("./plugin-init");
    const result = await tryInitStore("/tmp/repo", "/tmp/external");

    expect(result.store).toBeNull();
    expect(result.initError).toBeInstanceOf(Error);
    expect(result.initError?.message).toMatch(/Node|ADV_NODE_PATH/i);
    expect(mocks.createInProcessWorker).not.toHaveBeenCalled();
    expect(mocks.createOutOfProcessWorker).not.toHaveBeenCalled();
  });
});

describe("rq-advshut1: bounded flush on shutdown after STSL changes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls store.flush → drainWorkers → store.close in order", async () => {
    const callOrder: string[] = [];
    const mockStore = {
      flush: vi.fn(async () => {
        callOrder.push("flush");
      }),
      close: vi.fn(() => {
        callOrder.push("close");
      }),
    } as any;

    const mockWorker = {
      shutdown: vi.fn(async () => {
        callOrder.push("drainWorker");
      }),
      queues: ["test-queue"],
    };

    mocks.createInProcessWorker.mockResolvedValue(mockWorker);
    mocks.probeTemporalWorkerRuntime.mockReturnValue({
      supported: true,
      runtime: "node",
      reason: "node",
    });
    mocks.resolveNodeExecutable.mockReturnValue({
      found: true,
      path: "/usr/bin/node",
      source: "path",
    });
    mocks.ensureTemporalRuntime.mockImplementation(async () => ({
      address: "127.0.0.1:7233",
      namespace: "default",
      startedRuntime: true,
    }));
    mocks.getProjectId.mockResolvedValue("proj-shutdown");
    mocks.createStore.mockResolvedValue(mockStore);

    const { tryInitStore, registerShutdownHandlers } =
      await import("./plugin-init");
    await tryInitStore("/tmp/repo", "/tmp/external");

    const handlers = registerShutdownHandlers(mockStore);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as any);

    handlers.shutdownWithFlush();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockStore.flush).toHaveBeenCalledTimes(1);
    expect(mockStore.close).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);

    const flushIdx = callOrder.indexOf("flush");
    const closeIdx = callOrder.indexOf("close");
    expect(flushIdx).toBeLessThan(closeIdx);

    exitSpy.mockRestore();
    handlers.removeProcessListeners();
  });

  it("idempotent double-SIGINT does not double-flush", async () => {
    const mockStore = {
      flush: vi.fn(async () => {}),
      close: vi.fn(() => {}),
    } as any;

    const { registerShutdownHandlers } = await import("./plugin-init");
    const handlers = registerShutdownHandlers(mockStore);

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as any);

    handlers.shutdownWithFlush();
    handlers.shutdownWithFlush();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockStore.flush).toHaveBeenCalledTimes(1);
    exitSpy.mockRestore();
    handlers.removeProcessListeners();
  });
});
