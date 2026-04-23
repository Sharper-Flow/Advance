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
    createTemporalClientBundle: vi.fn(async () => ({
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

vi.mock("./temporal/client", async () => {
  const actual =
    await vi.importActual<typeof import("./temporal/client")>(
      "./temporal/client",
    );
  return {
    ...actual,
    createTemporalClientBundle: mocks.createTemporalClientBundle,
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
    // Strip ambient ADV env so tests are deterministic regardless of the
    // developer's shell. ADV_DISABLE_TEMPORAL=1 (a common workaround for
    // the Bun-worker issue) otherwise bypasses the Temporal bootstrap path
    // these tests intend to exercise.
    vi.stubEnv("ADV_DISABLE_TEMPORAL", "");
    vi.stubEnv("ADV_ALLOW_DEGRADED_FALLBACK", "");
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
    expect(mocks.createTemporalClientBundle).toHaveBeenCalledWith(
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

  it("falls back to file-backed store when ADV_ALLOW_DEGRADED_FALLBACK=1 and Temporal init fails", async () => {
    mocks.getProjectId.mockResolvedValue("proj-sha");
    mocks.ensureTemporalRuntime.mockImplementation(async () => {
      throw new Error("Bun cannot run @temporalio/worker in-process");
    });
    vi.stubEnv("ADV_ALLOW_DEGRADED_FALLBACK", "1");

    const { tryInitStore } = await import("./plugin-init");

    const result = await tryInitStore("/tmp/repo", "/tmp/external");

    // Fallback succeeded: store returned, no initError
    expect(result.store).toBe(mocks.store);
    expect(result.initError).toBeNull();
    // createStore called WITHOUT temporalBundle (file-backed path)
    expect(mocks.createStore).toHaveBeenCalledWith(
      "/tmp/repo",
      expect.objectContaining({
        externalRoot: "/tmp/external",
        projectIdOverride: "proj-sha",
      }),
    );
    const call = mocks.createStore.mock.calls.at(-1)?.[1];
    expect(call?.temporalBundle).toBeUndefined();

    // Restore for subsequent tests
    mocks.ensureTemporalRuntime.mockImplementation(async () => ({
      address: "127.0.0.1:7233",
      namespace: "default",
      startedRuntime: true,
    }));
  });

  it("returns initError when ADV_ALLOW_DEGRADED_FALLBACK is not set and Temporal init fails (existing behavior)", async () => {
    mocks.getProjectId.mockResolvedValue("proj-sha");
    mocks.ensureTemporalRuntime.mockImplementation(async () => {
      throw new Error("Bun cannot run @temporalio/worker in-process");
    });
    // Flag explicitly empty — beforeEach already stubs this but assert the
    // expectation explicitly to make the contract clear.
    vi.stubEnv("ADV_ALLOW_DEGRADED_FALLBACK", "");

    const { tryInitStore } = await import("./plugin-init");

    const result = await tryInitStore("/tmp/repo", "/tmp/external");

    expect(result.store).toBeNull();
    expect(result.initError).toBeInstanceOf(Error);
    expect(mocks.createStore).not.toHaveBeenCalled();

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

  it("writes degraded fallback profile events when ADV_PROFILE=1 and fallback is used", async () => {
    process.env.ADV_PROFILE = "1";
    mocks.getProjectId.mockResolvedValue("proj-sha");
    mocks.ensureTemporalRuntime.mockImplementation(async () => {
      throw new Error("Bun cannot run @temporalio/worker in-process");
    });
    vi.stubEnv("ADV_ALLOW_DEGRADED_FALLBACK", "1");

    const { tryInitStore } = await import("./plugin-init");
    const result = await tryInitStore("/tmp/repo", "/tmp/external");

    expect(result.store).toBe(mocks.store);
    expect(result.initError).toBeNull();
    expect(existsSync(profileLogFile())).toBe(true);
    const content = readFileSync(profileLogFile(), "utf-8");
    expect(content).toContain('"event":"try_init_store_failed"');
    expect(content).toContain('"degraded_fallback":true');
    expect(content).toContain('"event":"degraded_fallback_started"');
    expect(content).toContain('"event":"legacy_fallback_ready"');
    expect(content).toContain('"backend_mode":"legacy"');
    expect(content).toContain('"event":"try_init_store_complete"');
    expect(content).toContain('"outcome":"success"');
  });
});

describe("tryInitStore worker routing (Phase 2.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ADV_DISABLE_TEMPORAL", "");
    vi.stubEnv("ADV_ALLOW_DEGRADED_FALLBACK", "");

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

  it("falls back to file-backed when Bun AND no Node AND ADV_ALLOW_DEGRADED_FALLBACK=1", async () => {
    mocks.getProjectId.mockResolvedValueOnce("proj-sha");
    mocks.probeTemporalWorkerRuntime.mockReturnValueOnce({
      supported: false,
      runtime: "bun",
      reason: "Bun cannot host worker",
    });
    mocks.resolveNodeExecutable.mockReturnValueOnce({
      found: false,
      source: "none",
      remediation: "Install Node",
    });
    vi.stubEnv("ADV_ALLOW_DEGRADED_FALLBACK", "1");

    const { tryInitStore } = await import("./plugin-init");
    const result = await tryInitStore("/tmp/repo", "/tmp/external");

    expect(result.store).toBe(mocks.store);
    expect(result.initError).toBeNull();
    const call = mocks.createStore.mock.calls.at(-1)?.[1];
    expect(call?.temporalBundle).toBeUndefined();
    expect(mocks.createInProcessWorker).not.toHaveBeenCalled();
    expect(mocks.createOutOfProcessWorker).not.toHaveBeenCalled();
  });
});
