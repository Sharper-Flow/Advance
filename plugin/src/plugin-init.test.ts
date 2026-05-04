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
    heartbeatWriter: {
      stop: vi.fn(async () => {}),
    },
    startHeartbeatWriter: vi.fn(() => mocks.heartbeatWriter),
  };
});

vi.mock("./storage/store", () => ({
  createStore: mocks.createStore,
}));

vi.mock("./utils/project-id", async () => {
  const actual =
    await vi.importActual<typeof import("./utils/project-id")>(
      "./utils/project-id",
    );
  return {
    ...actual,
    getProjectId: mocks.getProjectId,
  };
});

// Mock worker-lock so plugin-init tests don't write real lock files to
// arbitrary tmp paths. Default: every acquire reports owned (so spawn
// path is exercised); individual tests override for not-owned coverage.
vi.mock("./temporal/worker-lock", () => ({
  HEARTBEAT_INTERVAL_MS: 5000,
  acquireWorkerLock: vi.fn(async (_dir: string) => ({
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

describe("getTemporalWorkerAliveness", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns false when all in-process queues are marked failed", async () => {
    const { getTemporalWorkerAliveness, registerInProcessTemporalWorker } =
      await import("./plugin-init");

    registerInProcessTemporalWorker({
      registerQueue: vi.fn(async () => {}),
      shutdown: vi.fn(async () => {}),
      queues: ["advance-dead"],
      failedQueues: ["advance-dead"],
    } as any);

    expect(getTemporalWorkerAliveness()).toBe(false);
  });

  it("returns true when any in-process queue remains unfailed", async () => {
    const { getTemporalWorkerAliveness, registerInProcessTemporalWorker } =
      await import("./plugin-init");

    registerInProcessTemporalWorker({
      registerQueue: vi.fn(async () => {}),
      shutdown: vi.fn(async () => {}),
      queues: ["advance-dead", "advance-live"],
      failedQueues: ["advance-dead"],
    } as any);

    expect(getTemporalWorkerAliveness()).toBe(true);
  });

  it("continues to delegate liveness to out-of-process workers", async () => {
    const { getTemporalWorkerAliveness, registerInProcessTemporalWorker } =
      await import("./plugin-init");
    const isAlive = vi.fn(() => true);

    registerInProcessTemporalWorker({
      registerQueue: vi.fn(async () => {}),
      shutdown: vi.fn(async () => {}),
      queues: [],
      failedQueues: ["advance-dead"],
      isAlive,
    } as any);

    expect(getTemporalWorkerAliveness()).toBe(true);
    expect(isAlive).toHaveBeenCalled();
  });
});

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

  it("ensureProjectTemporalQueue registers the target project queue", async () => {
    const queues = new Set<string>();
    const worker = {
      registerQueue: vi.fn(async (queue: string) => {
        queues.add(queue);
      }),
      shutdown: vi.fn(async () => {}),
      get queues() {
        return [...queues];
      },
    };

    const { ensureProjectTemporalQueue, registerInProcessTemporalWorker } =
      await import("./plugin-init");

    registerInProcessTemporalWorker(worker as any);
    await ensureProjectTemporalQueue("target-proj");

    expect(worker.registerQueue).toHaveBeenCalledWith("advance-target-proj");
    expect(queues.has("advance-target-proj")).toBe(true);
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

  it("stops owned heartbeat writers before releasing worker.lock during shutdown", async () => {
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
    const heartbeatStop = vi.fn(async () => {
      callOrder.push("heartbeat.stop");
    });

    mocks.getProjectId.mockResolvedValue("proj-shutdown");
    mocks.createStore.mockResolvedValue(mockStore);
    mocks.createInProcessWorker.mockResolvedValue(mockWorker as any);
    mocks.startHeartbeatWriter.mockReturnValueOnce({ stop: heartbeatStop });
    const { releaseWorkerLock } = await import("./temporal/worker-lock");
    (releaseWorkerLock as any).mockImplementationOnce(async () => {
      callOrder.push("releaseLock");
    });

    const { tryInitStore, registerShutdownHandlers } =
      await import("./plugin-init");
    await tryInitStore("/tmp/repo", "/tmp/external");

    const handlers = registerShutdownHandlers(mockStore);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as any);

    handlers.shutdownWithFlush();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(heartbeatStop).toHaveBeenCalledTimes(1);
    expect(releaseWorkerLock).toHaveBeenCalledWith("/tmp/external");
    expect(callOrder.indexOf("heartbeat.stop")).toBeLessThan(
      callOrder.indexOf("releaseLock"),
    );
    expect(callOrder.indexOf("releaseLock")).toBeLessThan(
      callOrder.lastIndexOf("drainWorker"),
    );
    expect(callOrder.indexOf("flush")).toBeLessThan(callOrder.indexOf("close"));

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

// =============================================================================
// C5 / rq-workerSingleton01: cross-session singleton worker integration
// =============================================================================

describe("tryInitStore worker singleton (C5 / rq-workerSingleton01)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // vi.clearAllMocks() also clears default implementations set at
    // mock factory time. Restore everything this describe block needs.
    mocks.createStore.mockImplementation(async () => mocks.store as any);
    mocks.createInProcessWorker.mockImplementation(
      async () => mocks.inProcessWorker,
    );
    mocks.createOutOfProcessWorker.mockImplementation(
      async () => mocks.outOfProcessWorker,
    );
    mocks.initStsl.mockImplementation(async () => ({
      address: "127.0.0.1:7233",
      namespace: "default",
      connection: {} as any,
      client: {
        workflow: {
          start: mocks.workflowStart,
          getHandle: mocks.workflowGetHandle,
        },
      } as any,
    }));
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
    // worker-lock default: owned:true (this instance owns the lock).
    const { acquireWorkerLock, releaseWorkerLock } =
      await import("./temporal/worker-lock");
    (acquireWorkerLock as any).mockImplementation(async () => ({
      owned: true,
      ownerPid: process.pid,
      workerId: "test-worker-id",
      lockPath: "/tmp/test/worker.lock",
    }));
    (releaseWorkerLock as any).mockImplementation(async () => {});
    mocks.startHeartbeatWriter.mockImplementation(() => mocks.heartbeatWriter);
    mocks.heartbeatWriter.stop.mockImplementation(async () => {});
    delete process.env.ADV_FORCE_IN_PROCESS_WORKER;
  });

  afterEach(() => {
    delete process.env.ADV_FORCE_IN_PROCESS_WORKER;
  });

  it("when worker.lock is owned by another instance, no worker is spawned and store still resolves", async () => {
    mocks.getProjectId.mockResolvedValueOnce("proj-sha");

    // Override the worker-lock mock for THIS test: report owned:false.
    const { acquireWorkerLock } = await import("./temporal/worker-lock");
    (acquireWorkerLock as any).mockResolvedValueOnce({
      owned: false,
      ownerPid: 99999,
      lockPath: "/tmp/external/worker.lock",
      reason: "lock_held_by_alive_pid",
    });

    const { tryInitStore } = await import("./plugin-init");
    const result = await tryInitStore("/tmp/repo", "/tmp/external");

    // Store still created (Temporal client still init'd) — second
    // instance participates as client only.
    expect(result.store).toBe(mocks.store);
    expect(result.initError).toBeNull();
    // Critical: no worker process spawned.
    expect(mocks.createInProcessWorker).not.toHaveBeenCalled();
    expect(mocks.createOutOfProcessWorker).not.toHaveBeenCalled();
  });

  it("when worker.lock is owned by us, worker IS spawned (default behavior)", async () => {
    mocks.getProjectId.mockResolvedValueOnce("proj-sha");
    // Default mock returns owned:true — no override needed.

    const { tryInitStore } = await import("./plugin-init");
    await tryInitStore("/tmp/repo", "/tmp/external");

    expect(mocks.createInProcessWorker).toHaveBeenCalledTimes(1);
  });

  it("starts the heartbeat writer when this instance owns worker.lock", async () => {
    mocks.getProjectId.mockResolvedValueOnce("proj-sha");

    const { tryInitStore } = await import("./plugin-init");
    await tryInitStore("/tmp/repo", "/tmp/external");

    expect(mocks.startHeartbeatWriter).toHaveBeenCalledWith({
      projectStateDir: "/tmp/external",
      workerId: "test-worker-id",
      intervalMs: 5000,
    });
  });

  it("does not start heartbeat writer when worker.lock is owned by another instance", async () => {
    mocks.getProjectId.mockResolvedValueOnce("proj-sha");
    const { acquireWorkerLock } = await import("./temporal/worker-lock");
    (acquireWorkerLock as any).mockResolvedValueOnce({
      owned: false,
      ownerPid: 99999,
      lockPath: "/tmp/external/worker.lock",
      reason: "lock_held_by_alive_pid",
    });

    const { tryInitStore } = await import("./plugin-init");
    await tryInitStore("/tmp/repo", "/tmp/external");

    expect(mocks.startHeartbeatWriter).not.toHaveBeenCalled();
  });

  it("in-process onWorkerExhausted stops heartbeat, releases lock, records failure, and updates aliveness once", async () => {
    mocks.getProjectId.mockResolvedValueOnce("proj-sha");
    const ownedWorker = {
      registerQueue: vi.fn(async () => {}),
      shutdown: vi.fn(async () => {}),
      queues: ["advance-proj-sha"],
      failedQueues: [],
    };
    mocks.createInProcessWorker.mockResolvedValueOnce(ownedWorker as any);

    const { releaseWorkerLock } = await import("./temporal/worker-lock");
    const { getLastWorkerRunError, resetTemporalRetryTelemetry } =
      await import("./temporal/retry-wrapper");
    resetTemporalRetryTelemetry();
    const { getTemporalWorkerAliveness, tryInitStore } =
      await import("./plugin-init");
    const heartbeatStop = vi.fn(async () => {});
    mocks.startHeartbeatWriter.mockReturnValueOnce({
      stop: heartbeatStop,
    });

    await tryInitStore("/tmp/repo", "/tmp/external");
    expect(getTemporalWorkerAliveness()).toBe(true);

    const onWorkerExhausted = mocks.createInProcessWorker.mock.calls[0][0]
      .onWorkerExhausted as () => Promise<void>;
    await onWorkerExhausted();
    await onWorkerExhausted();

    expect(heartbeatStop).toHaveBeenCalledTimes(1);
    expect(releaseWorkerLock).toHaveBeenCalledTimes(1);
    expect(releaseWorkerLock).toHaveBeenCalledWith("/tmp/external");
    expect(getLastWorkerRunError()).toMatchObject({
      queue: "<all>",
      message: "worker exhausted",
    });
    expect(getTemporalWorkerAliveness()).toBe(false);
  });

  it("wires onWorkerExhausted into out-of-process workers", async () => {
    mocks.getProjectId.mockResolvedValueOnce("proj-sha");
    mocks.probeTemporalWorkerRuntime.mockReturnValueOnce({
      supported: false,
      runtime: "bun",
      reason: "bun",
    });

    const { tryInitStore } = await import("./plugin-init");
    await tryInitStore("/tmp/repo", "/tmp/external");

    expect(mocks.createOutOfProcessWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        onWorkerExhausted: expect.any(Function),
      }),
    );
  });

  it("ADV_FORCE_IN_PROCESS_WORKER=1 bypasses the lock check entirely", async () => {
    mocks.getProjectId.mockResolvedValueOnce("proj-sha");
    process.env.ADV_FORCE_IN_PROCESS_WORKER = "1";

    const { acquireWorkerLock } = await import("./temporal/worker-lock");

    const { tryInitStore } = await import("./plugin-init");
    await tryInitStore("/tmp/repo", "/tmp/external");

    // Lock acquisition is skipped — env var is the rollback path.
    expect(acquireWorkerLock).not.toHaveBeenCalled();
    // Worker is still spawned via the legacy probe-based path.
    expect(mocks.createInProcessWorker).toHaveBeenCalledTimes(1);
  });

  it("two sequential plugin-inits with worker.lock contention spawn exactly one worker", async () => {
    // First instance owns the lock.
    mocks.getProjectId.mockResolvedValue("proj-sha");
    const { acquireWorkerLock } = await import("./temporal/worker-lock");

    const { tryInitStore } = await import("./plugin-init");

    // First init: default acquire returns owned:true → spawn.
    await tryInitStore("/tmp/repo", "/tmp/external");
    expect(mocks.createInProcessWorker).toHaveBeenCalledTimes(1);

    // Second init: simulate lock held → no spawn.
    (acquireWorkerLock as any).mockResolvedValueOnce({
      owned: false,
      ownerPid: process.pid + 1,
      lockPath: "/tmp/external/worker.lock",
      reason: "lock_held_by_alive_pid",
    });

    await tryInitStore("/tmp/repo", "/tmp/external");

    // Total spawns across both inits: still 1 (rq-workerSingleton01).
    expect(mocks.createInProcessWorker).toHaveBeenCalledTimes(1);
  });
});
