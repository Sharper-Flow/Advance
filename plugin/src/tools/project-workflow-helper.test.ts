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
  ensureProjectWorkflowStarted: vi.fn(async () => ({
    query: vi.fn(async () => ({})),
    executeUpdate: vi.fn(async () => undefined),
  })),
  probeTaskQueuePollers: vi.fn(async () => ({
    status: "fresh" as const,
    lastAccessMs: 500,
  })),
}));

vi.mock("../temporal/runtime-manager", async () => {
  const actual = await vi.importActual<
    typeof import("../temporal/runtime-manager")
  >("../temporal/runtime-manager");
  return { ...actual, canReachTemporalAddress: mocks.canReachTemporalAddress };
});

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
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

vi.mock("../temporal/migration", () => ({
  ensureProjectWorkflowStarted: mocks.ensureProjectWorkflowStarted,
}));

vi.mock("../temporal/queue-serviceability", async () => {
  const actual = await vi.importActual<
    typeof import("../temporal/queue-serviceability")
  >("../temporal/queue-serviceability");
  return { ...actual, probeTaskQueuePollers: mocks.probeTaskQueuePollers };
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
    // Server-side probe returns no pollers so the code falls through
    // to the recovery path (these tests exercise recovery behavior).
    mocks.probeTaskQueuePollers.mockResolvedValue({
      status: "unavailable" as const,
      lastAccessMs: null,
    });
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

  it("returns approval-required diagnostics for fresh-v2 unserviceable locks", async () => {
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
        last_heartbeat_at: "2026-04-21T00:00:02.000Z",
        heartbeat_age_ms: 1234,
        schema_version: 2,
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
    expect(result.reason).toContain("suspect live unserviceable worker.lock");
    expect(result.recommendedNextAction).toContain("explicit approval");
    expect(result.recommendedNextAction).not.toContain("in-place");
    expect(result.recommendedNextAction).not.toContain(
      "adv_temporal_reconnect",
    );
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

/**
 * Regression guard for the cross-cutting #22/#23/#24 recovery class
 * (`fixStuckTemporalWorkerRecovery`). Models the shared incident shape:
 *
 * - Temporal server alive
 * - Expected project queue not serviceable (no fresh poller, no local
 *   registration)
 * - `worker.lock` present with alive `holder_pid`, schema_version: 1, no
 *   `last_heartbeat_at`
 * - Stale running workflow count > 0 on the queue
 * - Worktree-create style hot-path caller blocked BEFORE running any
 *   filesystem operation: the recovery seam returns a structured failure
 *   envelope, never a "in-place" fallback
 *
 * The recovery contract surfaces:
 * - `mode: "unavailable"` with reason naming `suspect live legacy v1
 *   worker.lock`
 * - `recommendedNextAction` requesting explicit approval evidence; never
 *   recommends in-place edits
 * - `queueServiceability.status === "not_serviceable"` with evidence
 *   covering local registration, ownership, server poller probe, and stale
 *   running workflow count
 * - At most one bounded `restartCurrentProjectTemporalWorker` attempt; no
 *   blind restart loops
 */
describe("regression: fixStuckTemporalWorkerRecovery incident shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canReachTemporalAddress.mockResolvedValue(true);
    mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([]);
    mocks.getTemporalWorkerAliveness.mockReturnValue(false);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue([]);
    // Server-side probe returns no pollers so recovery path is exercised.
    mocks.probeTaskQueuePollers.mockResolvedValue({
      status: "unavailable" as const,
      lastAccessMs: null,
    });
  });

  it("returns a structured failure envelope for the suspect-v1-lock incident shape and runs at most one bounded recovery attempt", async () => {
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

    // Bounded recovery: exactly one non-approval restart attempt.
    expect(mocks.restartCurrentProjectTemporalWorker).toHaveBeenCalledTimes(1);
    expect(mocks.restartCurrentProjectTemporalWorker).toHaveBeenCalledWith(
      "/repo",
      { approvedLockReclaim: false, approvalEvidence: undefined },
    );

    // Structured failure envelope (#22/#23/#24 contract).
    expect(result.mode).toBe("unavailable");
    if (result.mode !== "unavailable") throw new Error("expected unavailable");
    expect(result.reason).toContain("suspect live legacy v1 worker.lock");
    expect(result.recommendedNextAction).toBeDefined();
    expect(result.recommendedNextAction).toContain("explicit approval");
    expect(result.recommendedNextAction).not.toContain("in-place");

    // Serviceability snapshot exposes the diagnostic shape needed by
    // diagnose/status/worktree callers.
    expect(result.queueServiceability).toBeDefined();
    const serviceability = result.queueServiceability!;
    expect(serviceability.status).toBe("not_serviceable");
    expect(serviceability.expectedQueue).toBe("advance-proj123");
    expect(serviceability.evidence.localRegistered).toBe(false);
    expect(serviceability.evidence.localWorkerAlive).toBe(false);
    expect(serviceability.evidence.localOwnership).toBe("peer");
    expect(serviceability.evidence.staleRunningWorkflowCount).toBe(6);
    expect(serviceability.blockers.length).toBeGreaterThan(0);
  });
});

/**
 * GH#31: Project workflow auto-bootstrap when worker is ready but project
 * workflow may be missing (Temporal state loss scenario).
 */
describe("GH#31: project workflow auto-bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canReachTemporalAddress.mockResolvedValue(true);
    mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([
      "advance-proj123",
    ]);
    mocks.getTemporalWorkerAliveness.mockReturnValue(true);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue([]);
  });

  it("bootstraps project workflow when worker is ready", async () => {
    mocks.ensureProjectWorkflowStarted.mockResolvedValueOnce({
      query: vi.fn(async () => ({})),
      executeUpdate: vi.fn(async () => undefined),
    });

    const result = await getBoundedProjectWorkflowAccess({
      projectDir: "/repo",
      mutablePath: "/state/proj123/worktree-state.marker",
    });

    expect(result.mode).toBe("workflow-backed");
    expect(mocks.ensureProjectWorkflowStarted).toHaveBeenCalledOnce();
    // Should pass projectId and initializedAt
    const callArgs = mocks.ensureProjectWorkflowStarted.mock.calls[0];
    expect(callArgs[1].projectId).toBe("proj123");
    expect(callArgs[1].initializedAt).toBeDefined();
  });

  it("returns workflow-backed when bootstrap says already started", async () => {
    // Simulate "already started" — this is the normal case when the
    // project workflow exists.
    mocks.ensureProjectWorkflowStarted.mockResolvedValueOnce({
      query: vi.fn(async () => ({})),
      executeUpdate: vi.fn(async () => undefined),
    });

    const result = await getBoundedProjectWorkflowAccess({
      projectDir: "/repo",
      mutablePath: "/state/proj123/worktree-state.marker",
    });

    expect(result.mode).toBe("workflow-backed");
  });

  it("returns unavailable when bootstrap fails with non-already-started error", async () => {
    mocks.ensureProjectWorkflowStarted.mockRejectedValueOnce(
      new Error("Temporal server connection refused"),
    );

    const result = await getBoundedProjectWorkflowAccess({
      projectDir: "/repo",
      mutablePath: "/state/proj123/worktree-state.marker",
    });

    expect(result.mode).toBe("unavailable");
    if (result.mode !== "unavailable") throw new Error("expected unavailable");
    expect(result.reason).toContain("Project workflow bootstrap failed");
    expect(result.recommendedNextAction).toContain("adv_temporal_diagnose");
  });

  it("returns workflow-backed when bootstrap throws already-started error", async () => {
    // ensureProjectWorkflowStarted handles already-started internally,
    // but test the edge case where it leaks through
    mocks.ensureProjectWorkflowStarted.mockRejectedValueOnce(
      new Error("Workflow execution already started"),
    );

    const result = await getBoundedProjectWorkflowAccess({
      projectDir: "/repo",
      mutablePath: "/state/proj123/worktree-state.marker",
    });

    // Already-started is treated as success
    expect(result.mode).toBe("workflow-backed");
  });
});

/**
 * GH#34: When no local worker exists but peer's server-side pollers
 * service the queue, worktree tools should still get workflow-backed
 * access instead of hitting WORKER_LOCK_HELD recovery failure.
 */
describe("GH#34: server-side poller probe fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canReachTemporalAddress.mockResolvedValue(true);
    // No local worker registered
    mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([]);
    mocks.getTemporalWorkerAliveness.mockReturnValue(false);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue([]);
  });

  it("returns workflow-backed when server-side pollers are active (no local worker)", async () => {
    mocks.probeTaskQueuePollers.mockResolvedValueOnce({
      status: "fresh",
      lastAccessMs: 500,
    });
    mocks.ensureProjectWorkflowStarted.mockResolvedValueOnce({
      query: vi.fn(async () => ({})),
      executeUpdate: vi.fn(async () => undefined),
    });

    const result = await getBoundedProjectWorkflowAccess({
      projectDir: "/repo",
      mutablePath: "/state/proj123/worktree-state.marker",
    });

    expect(result.mode).toBe("workflow-backed");
    expect(mocks.probeTaskQueuePollers).toHaveBeenCalled();
    // Should NOT try to restart local worker
    expect(mocks.restartCurrentProjectTemporalWorker).not.toHaveBeenCalled();
  });

  it("falls through to unavailable when server-side probe returns no pollers", async () => {
    mocks.probeTaskQueuePollers.mockResolvedValueOnce({
      status: "unavailable" as const,
      lastAccessMs: null,
    });

    const result = await getBoundedProjectWorkflowAccess({
      projectDir: "/repo",
      mutablePath: "/state/proj123/worktree-state.marker",
    });

    expect(result.mode).toBe("unavailable");
    expect(mocks.restartCurrentProjectTemporalWorker).not.toHaveBeenCalled();
  });

  it("falls through to recovery when server-side probe throws", async () => {
    mocks.probeTaskQueuePollers.mockRejectedValueOnce(
      new Error("gRPC connection refused"),
    );

    const result = await getBoundedProjectWorkflowAccess({
      projectDir: "/repo",
      mutablePath: "/state/proj123/worktree-state.marker",
      recovery: "none",
    });

    // Falls through past server probe to the final unavailable return
    expect(result.mode).toBe("unavailable");
  });

  it("skips server probe when local worker is ready", async () => {
    mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([
      "advance-proj123",
    ]);
    mocks.getTemporalWorkerAliveness.mockReturnValue(true);
    mocks.ensureProjectWorkflowStarted.mockResolvedValueOnce({
      query: vi.fn(async () => ({})),
      executeUpdate: vi.fn(async () => undefined),
    });

    const result = await getBoundedProjectWorkflowAccess({
      projectDir: "/repo",
      mutablePath: "/state/proj123/worktree-state.marker",
    });

    expect(result.mode).toBe("workflow-backed");
    // Server probe should NOT be called when local worker is ready
    expect(mocks.probeTaskQueuePollers).not.toHaveBeenCalled();
  });

  it("skips server probe when bundle is not available", async () => {
    mocks.getService.mockReturnValueOnce(null);
    mocks.probeTaskQueuePollers.mockResolvedValueOnce({
      status: "fresh",
      lastAccessMs: 500,
    });

    const result = await getBoundedProjectWorkflowAccess({
      projectDir: "/repo",
      mutablePath: "/state/proj123/worktree-state.marker",
    });

    expect(result.mode).toBe("unavailable");
    // Probe should not be called without a bundle
    expect(mocks.probeTaskQueuePollers).not.toHaveBeenCalled();
  });
});

/**
 * GH#35: adv_worktree_create blocked by live peer worker lock during
 * approved apply.
 *
 * Incident: Peer session holds `worker.lock` with fresh heartbeat AND
 * server-side Temporal pollers are active (fresh/stale). This session has
 * no local worker. `initStateDb` → `resolveAccess` →
 * `getBoundedProjectWorkflowAccess(recovery: "once")` should return
 * `workflow-backed` via the server-side poller probe WITHOUT attempting
 * worker restart (which would fail with WORKER_LOCK_HELD).
 *
 * This is the exact combination that the GH#34 tests don't cover:
 * `recovery: "once"` + active server pollers. Without the poller probe,
 * the code would fall through to `runBoundedRecovery` →
 * `restartCurrentProjectTemporalWorker` → WORKER_LOCK_HELD failure.
 */
describe("GH#35: worktree creation with peer lock + active pollers skips recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canReachTemporalAddress.mockResolvedValue(true);
    // No local worker — this session doesn't own the worker lock
    mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([]);
    mocks.getTemporalWorkerAliveness.mockReturnValue(false);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue([]);
  });

  it("returns workflow-backed via server pollers without attempting restart (recovery: once)", async () => {
    // Peer's worker has active server-side pollers
    mocks.probeTaskQueuePollers.mockResolvedValueOnce({
      status: "fresh",
      lastAccessMs: 276,
    });
    mocks.ensureProjectWorkflowStarted.mockResolvedValueOnce({
      query: vi.fn(async () => ({})),
      executeUpdate: vi.fn(async () => undefined),
    });

    const result = await getBoundedProjectWorkflowAccess({
      projectDir: "/repo",
      mutablePath: "/state/proj123/worktree-state.marker",
      recovery: "once",
    });

    expect(result.mode).toBe("workflow-backed");
    // Server-side poller probe MUST be called (it's the fix path)
    expect(mocks.probeTaskQueuePollers).toHaveBeenCalledOnce();
    // Worker restart MUST NOT be called — peer's pollers handle the queue
    expect(mocks.restartCurrentProjectTemporalWorker).not.toHaveBeenCalled();
  });

  it("returns workflow-backed via stale server pollers without attempting restart (recovery: once)", async () => {
    // Even stale pollers indicate an active peer — no restart needed
    mocks.probeTaskQueuePollers.mockResolvedValueOnce({
      status: "stale",
      lastAccessMs: 45_000,
    });
    mocks.ensureProjectWorkflowStarted.mockResolvedValueOnce({
      query: vi.fn(async () => ({})),
      executeUpdate: vi.fn(async () => undefined),
    });

    const result = await getBoundedProjectWorkflowAccess({
      projectDir: "/repo",
      mutablePath: "/state/proj123/worktree-state.marker",
      recovery: "once",
    });

    expect(result.mode).toBe("workflow-backed");
    expect(mocks.probeTaskQueuePollers).toHaveBeenCalledOnce();
    expect(mocks.restartCurrentProjectTemporalWorker).not.toHaveBeenCalled();
  });
});
