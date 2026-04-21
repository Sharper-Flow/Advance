import { beforeEach, describe, expect, it, vi } from "vitest";

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
    inProcessWorker: {
      registerQueue: vi.fn(async () => {}),
      shutdown: vi.fn(async () => {}),
      get queues() {
        return [] as readonly string[];
      },
    },
    createInProcessWorker: vi.fn(async () => mocks.inProcessWorker),
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
  };
});

vi.mock("./temporal/in-process-worker", () => ({
  createInProcessWorker: mocks.createInProcessWorker,
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
  beforeEach(() => {
    vi.clearAllMocks();
    // Strip ambient ADV env so tests are deterministic regardless of the
    // developer's shell. ADV_DISABLE_TEMPORAL=1 (a common workaround for
    // the Bun-worker issue) otherwise bypasses the Temporal bootstrap path
    // these tests intend to exercise.
    vi.stubEnv("ADV_DISABLE_TEMPORAL", "");
    vi.stubEnv("ADV_ALLOW_DEGRADED_FALLBACK", "");
  });

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

  it("runs bootstrap migration sweep when projectId and externalRoot are available", async () => {
    mocks.getProjectId.mockResolvedValueOnce("proj-sha");
    const { readdir } = await import("node:fs/promises");
    vi.mocked(readdir).mockResolvedValueOnce([
      { name: "proj-sha", isDirectory: () => true },
    ] as any);

    const { tryInitStore } = await import("./plugin-init");

    await tryInitStore("/tmp/repo", "/tmp/external/proj-sha");

    expect(mocks.workflowStart).toHaveBeenCalledTimes(1);
    const call = mocks.workflowStart.mock.calls[0][1];
    expect(call.workflowId).toMatch(
      /^adv\/migration\/proj-sha\/bootstrap-\d+$/,
    );
    expect(call.taskQueue).toBe("advance-proj-sha");
    expect(call.args[0]).toMatchObject({
      controlProjectId: "proj-sha",
      projectPaths: ["/tmp/external/proj-sha"],
    });
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
      throw new Error("Bun runtime does not expose Bun.spawn for local runtime");
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
});

describe("runBootstrapMigrationSweep", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns done when sweep finishes before timeout", async () => {
    const { runBootstrapMigrationSweep } = await import("./plugin-init");

    const result = await runBootstrapMigrationSweep({
      projectId: "proj-sha",
      externalRoot: "/tmp/external/proj-sha",
      client: { workflow: {} } as any,
      timeoutMs: 50,
      now: () => 123,
      discoverProjectPaths: async () => ["/tmp/external/proj-sha"],
      runSweep: mocks.runMigrationSweep,
    });

    expect(mocks.runMigrationSweep).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        controlProjectId: "proj-sha",
        runId: "bootstrap-123",
        projectPaths: ["/tmp/external/proj-sha"],
      }),
    );
    expect(result).toEqual({
      status: "done",
      totalProjects: 1,
      runId: "bootstrap-123",
    });
  });

  it("returns in_progress when sweep exceeds timeout budget", async () => {
    vi.useFakeTimers();
    const { runBootstrapMigrationSweep } = await import("./plugin-init");
    const never = new Promise(() => {});

    const promise = runBootstrapMigrationSweep({
      projectId: "proj-sha",
      externalRoot: "/tmp/external/proj-sha",
      client: { workflow: {} } as any,
      timeoutMs: 20,
      now: () => 456,
      discoverProjectPaths: async () => ["/tmp/external/proj-sha"],
      runSweep: vi.fn(async () => await never),
    });

    await vi.advanceTimersByTimeAsync(25);
    await expect(promise).resolves.toEqual({
      status: "in_progress",
      totalProjects: 1,
      runId: "bootstrap-456",
    });
  });
});
