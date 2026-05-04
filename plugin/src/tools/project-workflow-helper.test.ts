import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canReachTemporalAddress: vi.fn(async () => true),
  getProjectId: vi.fn(async () => "proj123"),
  getRegisteredTemporalWorkerQueues: vi.fn((): string[] => []),
  getTemporalWorkerAliveness: vi.fn(() => false),
  getTemporalWorkerDiagnostics: vi.fn((): unknown[] => []),
  restartCurrentProjectTemporalWorker: vi.fn(async () => ({
    projectId: "proj123",
    expectedQueue: "advance-proj123",
    queues: ["advance-proj123"],
  })),
  getTemporalHealth: vi.fn(async () => ({
    server_alive: true,
    worker_alive: false,
    worker_process_alive: false,
    registered_queues: [],
    last_op_at: null,
    last_error: null,
    fallback_counts: { changes: 0, tasks: 0, wisdom: 0, gates: 0 },
    stale_queues: [],
    reconnect_count: 0,
    op_counters: [],
    worker_lock: null,
    last_worker_run_error: null,
  })),
  getService: vi.fn(() => ({
    address: "127.0.0.1:7233",
    namespace: "default",
    connection: {
      workflowService: {
        describeTaskQueue: vi.fn(async () => ({ pollers: [] })),
      },
    },
    client: {
      workflow: {
        getHandle: vi.fn(() => ({
          query: vi.fn(async () => ({})),
          executeUpdate: vi.fn(async () => undefined),
        })),
      },
    },
  })),
}));

vi.mock("../temporal/runtime-manager", async () => {
  const actual = await vi.importActual<
    typeof import("../temporal/runtime-manager")
  >("../temporal/runtime-manager");
  return { ...actual, canReachTemporalAddress: mocks.canReachTemporalAddress };
});

vi.mock("../utils/project-id", async () => {
  const actual =
    await vi.importActual<typeof import("../utils/project-id")>(
      "../utils/project-id",
    );
  return { ...actual, getProjectId: mocks.getProjectId };
});

vi.mock("../plugin-init", async () => {
  const actual =
    await vi.importActual<typeof import("../plugin-init")>("../plugin-init");
  return {
    ...actual,
    getRegisteredTemporalWorkerQueues: mocks.getRegisteredTemporalWorkerQueues,
    getTemporalWorkerAliveness: mocks.getTemporalWorkerAliveness,
    getTemporalWorkerDiagnostics: mocks.getTemporalWorkerDiagnostics,
    restartCurrentProjectTemporalWorker:
      mocks.restartCurrentProjectTemporalWorker,
  };
});

vi.mock("../temporal/health-probe", () => ({
  getTemporalHealth: mocks.getTemporalHealth,
}));

vi.mock("../temporal/service", async () => {
  const actual = await vi.importActual<typeof import("../temporal/service")>(
    "../temporal/service",
  );
  return { ...actual, getService: mocks.getService };
});

import { getBoundedProjectWorkflowAccess } from "./project-workflow-helper";

describe("getBoundedProjectWorkflowAccess recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canReachTemporalAddress.mockResolvedValue(true);
    mocks.getRegisteredTemporalWorkerQueues
      .mockReturnValueOnce([])
      .mockReturnValue(["advance-proj123"]);
    mocks.getTemporalWorkerAliveness
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue([]);
  });

  it("runs exactly one non-approval recovery and retries workflow access", async () => {
    const result = await getBoundedProjectWorkflowAccess({
      projectDir: "/repo",
      mutablePath: "/state/proj123/worktree-state.marker",
      recovery: "once",
    });

    expect(mocks.restartCurrentProjectTemporalWorker).toHaveBeenCalledOnce();
    expect(mocks.restartCurrentProjectTemporalWorker).toHaveBeenCalledWith(
      "/repo",
      { approvedLockReclaim: false, approvalEvidence: undefined },
    );
    expect(result.mode).toBe("workflow-backed");
  });

  it("returns approval-required diagnostics for suspect live legacy locks", async () => {
    mocks.getRegisteredTemporalWorkerQueues.mockReset();
    mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([]);
    mocks.getTemporalWorkerAliveness.mockReset();
    mocks.getTemporalWorkerAliveness.mockReturnValue(false);
    mocks.restartCurrentProjectTemporalWorker.mockRejectedValueOnce(
      Object.assign(new Error("worker.lock held by pid=4444"), {
        code: "WORKER_LOCK_HELD",
        ownerPid: 4444,
      }),
    );
    mocks.getTemporalHealth.mockResolvedValueOnce({
      server_alive: true,
      worker_alive: false,
      worker_process_alive: false,
      registered_queues: [],
      last_op_at: null,
      last_error: null,
      fallback_counts: { changes: 0, tasks: 0, wisdom: 0, gates: 0 },
      stale_queues: [{ queue: "advance-proj123", running_count: 6 }],
      reconnect_count: 0,
      op_counters: [],
      worker_lock: {
        holder_pid: 4444,
        last_heartbeat_at: null,
        heartbeat_age_ms: null,
        schema_version: 1,
      },
      last_worker_run_error: null,
    });

    const result = await getBoundedProjectWorkflowAccess({
      projectDir: "/repo",
      mutablePath: "/state/proj123/worktree-state.marker",
      recovery: "once",
    });

    expect(result.mode).toBe("unavailable");
    if (result.mode !== "unavailable") throw new Error("expected unavailable");
    expect(result.reason).toContain("suspect live legacy v1 worker.lock");
    expect(result.recommendedNextAction).toContain("explicit approval");
    expect(result.recommendedNextAction).not.toContain("in-place");
    expect(result.queueServiceability?.status).toBe("not_serviceable");
  });

  it("does not run recovery for non-worker unavailable reasons", async () => {
    mocks.canReachTemporalAddress.mockResolvedValueOnce(false);

    const result = await getBoundedProjectWorkflowAccess({
      projectDir: "/repo",
      mutablePath: "/state/proj123/worktree-state.marker",
      recovery: "once",
    });

    expect(result.mode).toBe("unavailable");
    expect(mocks.restartCurrentProjectTemporalWorker).not.toHaveBeenCalled();
  });
});
