import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  restartCurrentProjectTemporalWorker: vi.fn(async () => ({
    projectId: "proj123",
    queues: ["advance-proj123"],
  })),
  getTemporalWorkerAliveness: vi.fn(() => true),
  getTemporalWorkerDiagnostics: vi.fn(() => [
    {
      kind: "out_of_process",
      queues: ["advance-proj123"],
      failedQueues: [],
      alive: true,
      diagnostics: { childPid: 4321, childRunning: true },
    },
  ]),
  loadChange: vi.fn(async () => ({
    success: true,
    data: {
      id: "chg123",
      title: "Fix bad workflow",
      status: "draft",
      created_at: "2026-04-21T00:00:00.000Z",
      tasks: [],
      deltas: {},
      wisdom: [],
      gates: {},
    },
  })),
  loadAgenda: vi.fn(async () => ({ items: [] })),
  listProjectWisdom: vi.fn(async () => []),
  rebuildProjectWorkflowState: vi.fn(async () => ({})),
  reImportChangeState: vi.fn(async () => ({})),
  writeJsonlAtomic: vi.fn(async () => {}),
  getTemporalHealth: vi.fn(async () => ({
    server_alive: true,
    worker_alive: true,
    worker_process_alive: true,
    registered_queues: ["advance-proj123"],
    last_op_at: null,
    last_error: null,
    fallback_counts: { changes: 0, tasks: 0, wisdom: 0, gates: 0 },
    stale_queues: [],
    reconnect_count: 0,
  })),
  getStslStats: vi.fn(() => ({
    getServiceCalls: 1,
    newConnections: 1,
    reuseRate: 1,
    reconnectCount: 0,
    reconnectFailureCount: 0,
  })),
  reinitStsl: vi.fn(async () => {}),
  createTemporalClientBundle: vi.fn(async () => ({
    connection: { close: vi.fn(async () => {}) },
    client: {
      workflow: {
        getHandle: vi.fn(() => ({
          describe: vi.fn(async () => ({})),
          terminate: vi.fn(async () => {}),
          query: vi.fn(async (queryDef: any) => {
            const name = queryDef?.name ?? queryDef;
            if (name === "adv.project.agenda") return [];
            if (name === "adv.project.wisdom") return [];
            return null;
          }),
        })),
        start: vi.fn(async () => ({})),
      },
    },
  })),
  getService: vi.fn(() => ({
    address: "127.0.0.1:7233",
    namespace: "default",
    connection: {
      close: vi.fn(async () => {}),
      operatorService: {
        listSearchAttributes: vi.fn(async () => ({
          customAttributes: {
            AdvProjectId: { indexedValueType: 2 },
            AdvChangeId: { indexedValueType: 2 },
            AdvChangeStatus: { indexedValueType: 2 },
            AdvActiveGate: { indexedValueType: 2 },
            AdvDoomLoopActive: { indexedValueType: 5 },
          },
        })),
      },
      workflowService: {
        describeWorkflowExecution: vi.fn(async () => ({})),
      },
    },
    client: {
      workflow: {
        getHandle: vi.fn(() => ({
          terminate: vi.fn(async () => {}),
          query: vi.fn(async (queryDef: any) => {
            const name = queryDef?.name ?? queryDef;
            if (name === "adv.project.agenda") return [];
            if (name === "adv.project.wisdom") return [];
            return null;
          }),
        })),
      },
    },
  })),
}));

vi.mock("../plugin-init", async () => {
  const actual =
    await vi.importActual<typeof import("../plugin-init")>("../plugin-init");
  return {
    ...actual,
    restartCurrentProjectTemporalWorker:
      mocks.restartCurrentProjectTemporalWorker,
    getTemporalWorkerAliveness: mocks.getTemporalWorkerAliveness,
    getTemporalWorkerDiagnostics: mocks.getTemporalWorkerDiagnostics,
  };
});

vi.mock("../storage/json", async () => {
  const actual =
    await vi.importActual<typeof import("../storage/json")>("../storage/json");
  return {
    ...actual,
    loadChange: mocks.loadChange,
  };
});

vi.mock("../storage/agenda", async () => {
  const actual =
    await vi.importActual<typeof import("../storage/agenda")>(
      "../storage/agenda",
    );
  return { ...actual, loadAgenda: mocks.loadAgenda };
});

vi.mock("../storage/project-wisdom", async () => {
  const actual = await vi.importActual<
    typeof import("../storage/project-wisdom")
  >("../storage/project-wisdom");
  return { ...actual, listProjectWisdom: mocks.listProjectWisdom };
});

vi.mock("../storage/jsonl-atomic-writer", () => ({
  writeJsonlAtomic: mocks.writeJsonlAtomic,
}));

vi.mock("../temporal/client", async () => {
  const actual =
    await vi.importActual<typeof import("../temporal/client")>(
      "../temporal/client",
    );
  return {
    ...actual,
    createTemporalClientBundle: mocks.createTemporalClientBundle,
  };
});

vi.mock("../temporal/service", async () => {
  const actual = await vi.importActual<typeof import("../temporal/service")>(
    "../temporal/service",
  );
  return {
    ...actual,
    getService: mocks.getService,
    getStslStats: mocks.getStslStats,
    reinitStsl: mocks.reinitStsl,
  };
});

vi.mock("../temporal/health-probe", async () => {
  const actual = await vi.importActual<
    typeof import("../temporal/health-probe")
  >("../temporal/health-probe");
  return {
    ...actual,
    getTemporalHealth: mocks.getTemporalHealth,
  };
});

vi.mock("../temporal/migration", async () => {
  const actual = await vi.importActual<typeof import("../temporal/migration")>(
    "../temporal/migration",
  );
  return {
    ...actual,
    rebuildProjectWorkflowState: mocks.rebuildProjectWorkflowState,
    reImportChangeState: mocks.reImportChangeState,
  };
});

import { temporalOpsTools } from "./temporal-ops";

describe("temporal operator tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.restartCurrentProjectTemporalWorker.mockResolvedValue({
      projectId: "proj123",
      queues: ["advance-proj123"],
    });
    mocks.getTemporalWorkerAliveness.mockReturnValue(true);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue([
      {
        kind: "out_of_process",
        queues: ["advance-proj123"],
        failedQueues: [],
        alive: true,
        diagnostics: { childPid: 4321, childRunning: true },
      },
    ]);
    mocks.getTemporalHealth.mockResolvedValue({
      server_alive: true,
      worker_alive: true,
      worker_process_alive: true,
      registered_queues: ["advance-proj123"],
      last_op_at: null,
      last_error: null,
      fallback_counts: { changes: 0, tasks: 0, wisdom: 0, gates: 0 },
      stale_queues: [],
      reconnect_count: 0,
      op_counters: [],
      worker_lock: null,
      last_worker_run_error: null,
    });
  });

  it("adv_temporal_worker_restart description clarifies worker-only reload scope", () => {
    const description =
      temporalOpsTools.adv_temporal_worker_restart.description;

    expect(description).toContain("Temporal worker process");
    expect(description).toContain("out-of-process Node child");
    expect(description).toContain("Does NOT reload plugin tool code");
    expect(description).toContain("plugin/src/tools/*.ts");
    expect(description).toContain("pnpm run build:worker");
    expect(description).toContain("dist/temporal");
  });

  it("adv_temporal_worker_restart waits for verified local serviceability before success", async () => {
    const store = {
      paths: { root: "/repo", external: "/state/proj123" },
    } as any;
    const result = await temporalOpsTools.adv_temporal_worker_restart.execute(
      {},
      store,
    );
    const parsed = JSON.parse(result);

    expect(mocks.restartCurrentProjectTemporalWorker).toHaveBeenCalledWith(
      "/repo",
      { approvedLockReclaim: false, approvalEvidence: undefined },
    );
    expect(parsed.success).toBe(true);
    expect(parsed.message).toContain("verified");
    expect(parsed.projectId).toBe("proj123");
    expect(parsed.expectedQueue).toBe("advance-proj123");
    expect(parsed.serviceability.status).toBe("serviceable");
    expect(parsed.serviceability.confidence).toBe("local");
    expect(parsed.workerDiagnostics).toEqual([
      {
        kind: "out_of_process",
        queues: ["advance-proj123"],
        failedQueues: [],
        alive: true,
        diagnostics: { childPid: 4321, childRunning: true },
      },
    ]);
    expect(parsed.recommendedNextAction).toBe("retry the blocked ADV command");
  });

  it("adv_temporal_worker_restart returns structured timeout failure when serviceability is not proven", async () => {
    vi.stubEnv("ADV_WORKER_RESTART_VERIFY_TIMEOUT_MS", "1");
    mocks.getTemporalWorkerAliveness.mockReturnValue(false);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue([]);
    mocks.getTemporalHealth.mockResolvedValue({
      server_alive: true,
      worker_alive: false,
      worker_process_alive: false,
      registered_queues: [],
      last_op_at: null,
      last_error: null,
      fallback_counts: { changes: 0, tasks: 0, wisdom: 0, gates: 0 },
      stale_queues: [{ queue: "advance-proj123", running_count: 2 }],
      reconnect_count: 0,
      op_counters: [],
      worker_lock: null,
      last_worker_run_error: null,
    });

    const store = {
      paths: { root: "/repo", external: "/state/proj123" },
    } as any;
    const result = await temporalOpsTools.adv_temporal_worker_restart.execute(
      {},
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.errorClass).toBe("WorkerRestartVerificationTimeout");
    expect(parsed.expectedQueue).toBe("advance-proj123");
    expect(parsed.serviceability.status).toBe("not_serviceable");
    expect(parsed.serviceability.blockers).toContain(
      "local_queue_not_registered",
    );
    expect(parsed.temporalHealth.stale_queues).toEqual([
      { queue: "advance-proj123", running_count: 2 },
    ]);
    expect(parsed.recommendedNextAction).toContain("adv_temporal_diagnose");
  });

  it("adv_temporal_worker_restart refuses unapproved suspect live legacy locks with diagnostics", async () => {
    mocks.restartCurrentProjectTemporalWorker.mockRejectedValueOnce(
      Object.assign(new Error("worker.lock held by pid=4444"), {
        code: "WORKER_LOCK_HELD",
        ownerPid: 4444,
      }),
    );
    mocks.getTemporalWorkerAliveness.mockReturnValue(false);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue([]);
    mocks.getTemporalHealth.mockResolvedValue({
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

    const store = {
      paths: { root: "/repo", external: "/state/proj123" },
    } as any;
    const result = await temporalOpsTools.adv_temporal_worker_restart.execute(
      {},
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.reason).toBe("suspect_live_legacy_lock");
    expect(parsed.approvalRequired).toBe(true);
    expect(parsed.worker_lock.holder_pid).toBe(4444);
    expect(parsed.serviceability.status).toBe("not_serviceable");
    expect(parsed.recommendedNextAction).toContain("explicit approval");
  });

  it("adv_temporal_worker_restart refuses unapproved fresh-v2 unserviceable locks with diagnostics", async () => {
    mocks.restartCurrentProjectTemporalWorker.mockRejectedValueOnce(
      Object.assign(new Error("worker.lock held by pid=4444"), {
        code: "WORKER_LOCK_HELD",
        ownerPid: 4444,
      }),
    );
    mocks.getTemporalWorkerAliveness.mockReturnValue(false);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue([]);
    mocks.getTemporalHealth.mockResolvedValue({
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

    const store = {
      paths: { root: "/repo", external: "/state/proj123" },
    } as any;
    const result = await temporalOpsTools.adv_temporal_worker_restart.execute(
      {},
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.reason).toBe("suspect_live_unserviceable_lock");
    expect(parsed.approvalRequired).toBe(true);
    expect(parsed.worker_lock.holder_pid).toBe(4444);
    expect(parsed.serviceability.status).toBe("not_serviceable");
    expect(parsed.recommendedNextAction).toContain("explicit approval");
    expect(parsed.recommendedNextAction).not.toContain(
      "adv_temporal_reconnect",
    );
  });

  it("adv_temporal_worker_restart passes approved suspect-lock reclaim evidence through", async () => {
    mocks.restartCurrentProjectTemporalWorker.mockResolvedValueOnce({
      projectId: "proj123",
      queues: ["advance-proj123"],
      reclaim: {
        reason: "approved_live_legacy_lock",
        priorPid: 4444,
        priorWorkerId: "00000000-0000-4000-8000-000000000000",
        priorSchemaVersion: 1,
        expectedQueue: "advance-proj123",
        approvalEvidence: "user said approve live v1 lock reclaim",
      },
    });

    const store = {
      paths: { root: "/repo", external: "/state/proj123" },
    } as any;
    const result = await temporalOpsTools.adv_temporal_worker_restart.execute(
      {
        approvedLockReclaim: true,
        approvalEvidence: "user said approve live v1 lock reclaim",
      },
      store,
    );
    const parsed = JSON.parse(result);

    expect(mocks.restartCurrentProjectTemporalWorker).toHaveBeenCalledWith(
      "/repo",
      {
        approvedLockReclaim: true,
        approvalEvidence: "user said approve live v1 lock reclaim",
      },
    );
    expect(parsed.success).toBe(true);
    expect(parsed.reclaim).toEqual({
      reason: "approved_live_legacy_lock",
      priorPid: 4444,
      priorWorkerId: "00000000-0000-4000-8000-000000000000",
      priorSchemaVersion: 1,
      expectedQueue: "advance-proj123",
      approvalEvidence: "user said approve live v1 lock reclaim",
    });
  });

  it("adv_temporal_reconnect calls reinitStsl and reports before/after stats", async () => {
    mocks.getStslStats
      .mockReturnValueOnce({
        getServiceCalls: 1,
        newConnections: 1,
        reuseRate: 1,
        reconnectCount: 0,
        reconnectFailureCount: 0,
      })
      .mockReturnValueOnce({
        getServiceCalls: 2,
        newConnections: 2,
        reuseRate: 1,
        reconnectCount: 1,
        reconnectFailureCount: 0,
      });
    const store = { paths: { root: "/repo" } } as any;

    const result = await temporalOpsTools.adv_temporal_reconnect.execute(
      {},
      store,
    );
    const parsed = JSON.parse(result);

    expect(mocks.reinitStsl).toHaveBeenCalledTimes(1);
    expect(parsed.success).toBe(true);
    expect(parsed.before.reconnectCount).toBe(0);
    expect(parsed.after.reconnectCount).toBe(1);
    expect(parsed.message).toContain("Reconnected Temporal service layer");
  });

  it("adv_temporal_diagnose reports healthy recovery state", async () => {
    const store = {
      paths: {
        root: "/repo",
        external: "/home/jrede/.local/share/opencode/plugins/advance/proj123",
      },
    } as any;

    const result = await temporalOpsTools.adv_temporal_diagnose.execute(
      { changeId: "chg123" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.projectId).toBe("proj123");
    expect(parsed.stsl.initialized).toBe(true);
    expect(parsed.searchAttributes.ok).toBe(true);
    expect(parsed.projectWorkflow.reachable).toBe(true);
    expect(parsed.changeWorkflow).toEqual({
      changeId: "chg123",
      reachable: true,
    });
    expect(parsed.recommendedNextAction).toBe("none");

    // T23: new fields present + backward-compatible.
    expect(parsed).toHaveProperty("peer_sessions");
    expect(parsed).toHaveProperty("worker_lock_holder_pid");
    expect(parsed).toHaveProperty("project_workflow_present");
    expect(typeof parsed.peer_sessions).toBe("number");
    expect(parsed.project_workflow_present).toBe(true);
    // worker_lock_holder_pid is null when no worker.lock exists in the
    // mocked external dir.
    expect(parsed.worker_lock_holder_pid).toBeNull();
  });

  it("adv_temporal_diagnose recommends approval-gated recovery for suspect live legacy locks", async () => {
    mocks.getTemporalWorkerAliveness.mockReturnValue(false);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue([]);
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
    const store = {
      paths: {
        root: "/repo",
        external: "/home/jrede/.local/share/opencode/plugins/advance/proj123",
      },
    } as any;

    const result = await temporalOpsTools.adv_temporal_diagnose.execute(
      { changeId: "chg123" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.queue_serviceability.status).toBe("not_serviceable");
    expect(parsed.reason).toBe("suspect_live_legacy_lock");
    expect(parsed.recommendedNextAction).toContain("explicit approval");
    expect(parsed.recommendedNextAction).not.toContain(
      "run adv_temporal_worker_restart (worker process only)",
    );
  });

  it("adv_temporal_diagnose recommends approval-gated recovery for fresh-v2 unserviceable locks", async () => {
    mocks.getTemporalWorkerAliveness.mockReturnValue(false);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue([]);
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
    const store = {
      paths: {
        root: "/repo",
        external: "/home/jrede/.local/share/opencode/plugins/advance/proj123",
      },
    } as any;

    const result = await temporalOpsTools.adv_temporal_diagnose.execute(
      { changeId: "chg123" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.queue_serviceability.status).toBe("not_serviceable");
    expect(parsed.reason).toBe("suspect_live_unserviceable_lock");
    expect(parsed.recommendedNextAction).toContain("explicit approval");
    expect(parsed.recommendedNextAction).not.toContain(
      "adv_temporal_reconnect",
    );
  });

  it("adv_temporal_diagnose treats fresh server poller evidence as serviceable for peer-owned queues", async () => {
    mocks.getTemporalWorkerAliveness.mockReturnValue(false);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue([]);
    mocks.getTemporalHealth.mockResolvedValueOnce({
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
      worker_lock: {
        holder_pid: 4444,
        last_heartbeat_at: null,
        heartbeat_age_ms: null,
        schema_version: 1,
      },
      last_worker_run_error: null,
    });
    mocks.getService.mockReturnValueOnce({
      address: "127.0.0.1:7233",
      namespace: "default",
      connection: {
        close: vi.fn(async () => {}),
        operatorService: {
          listSearchAttributes: vi.fn(async () => ({
            customAttributes: {
              AdvProjectId: { indexedValueType: 2 },
              AdvChangeId: { indexedValueType: 2 },
              AdvChangeStatus: { indexedValueType: 2 },
              AdvActiveGate: { indexedValueType: 2 },
              AdvDoomLoopActive: { indexedValueType: 5 },
            },
          })),
        },
        workflowService: {
          describeWorkflowExecution: vi.fn(async () => ({})),
          describeTaskQueue: vi.fn(async () => ({
            pollers: [{ lastAccessTime: new Date() }],
          })),
        },
      },
      client: {
        workflow: {
          getHandle: vi.fn(() => ({
            terminate: vi.fn(async () => {}),
            query: vi.fn(async () => []),
          })),
        },
      },
    } as any);
    const store = {
      paths: {
        root: "/repo",
        external: "/home/jrede/.local/share/opencode/plugins/advance/proj123",
      },
    } as any;

    const result = await temporalOpsTools.adv_temporal_diagnose.execute(
      { changeId: "chg123" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.queue_serviceability.status).toBe("serviceable");
    expect(parsed.queue_serviceability.confidence).toBe("server");
    expect(parsed.recommendedNextAction).toBe("none");
  });

  it("adv_temporal_diagnose renders worker lock and worker-run errors compactly", async () => {
    mocks.getTemporalHealth.mockResolvedValueOnce({
      server_alive: true,
      worker_alive: false,
      worker_process_alive: false,
      registered_queues: ["advance-proj123"],
      last_op_at: null,
      last_error: null,
      fallback_counts: { changes: 0, tasks: 0, wisdom: 0, gates: 0 },
      stale_queues: [],
      reconnect_count: 0,
      worker_lock: {
        holder_pid: 4242,
        last_heartbeat_at: "2026-04-21T00:00:02.000Z",
        heartbeat_age_ms: 1234,
        schema_version: 2,
      },
      last_worker_run_error: {
        queue: "advance-proj123",
        message: "Worker.run rejected",
        at: "2026-04-21T00:00:03.000Z",
      },
    });
    const store = {
      paths: {
        root: "/repo",
        external: "/home/jrede/.local/share/opencode/plugins/advance/proj123",
      },
    } as any;

    const result = await temporalOpsTools.adv_temporal_diagnose.execute(
      {},
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.worker_lock).toBe(
      "pid=4242 v2 heartbeat=1234ms last=2026-04-21T00:00:02.000Z",
    );
    expect(parsed.last_worker_run_error).toBe(
      "advance-proj123: Worker.run rejected @ 2026-04-21T00:00:03.000Z",
    );
  });

  it("adv_temporal_diagnose omits null worker lock and worker-run errors", async () => {
    mocks.getTemporalHealth.mockResolvedValueOnce({
      server_alive: true,
      worker_alive: true,
      worker_process_alive: true,
      registered_queues: ["advance-proj123"],
      last_op_at: null,
      last_error: null,
      fallback_counts: { changes: 0, tasks: 0, wisdom: 0, gates: 0 },
      stale_queues: [],
      reconnect_count: 0,
      worker_lock: null,
      last_worker_run_error: null,
    });
    const store = {
      paths: {
        root: "/repo",
        external: "/home/jrede/.local/share/opencode/plugins/advance/proj123",
      },
    } as any;

    const result = await temporalOpsTools.adv_temporal_diagnose.execute(
      {},
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed).not.toHaveProperty("worker_lock");
    expect(parsed).not.toHaveProperty("last_worker_run_error");
  });

  it("adv_temporal_diagnose treats stale heartbeat with no local worker as peer-spawn pending", async () => {
    mocks.getTemporalHealth.mockResolvedValueOnce({
      server_alive: true,
      worker_alive: false,
      worker_process_alive: false,
      registered_queues: [],
      last_op_at: null,
      last_error: null,
      fallback_counts: { changes: 0, tasks: 0, wisdom: 0, gates: 0 },
      stale_queues: [],
      reconnect_count: 0,
      worker_lock: {
        holder_pid: 4242,
        last_heartbeat_at: "2026-04-21T00:00:02.000Z",
        heartbeat_age_ms: 60001,
        schema_version: 2,
      },
      last_worker_run_error: null,
    });
    const store = {
      paths: {
        root: "/repo",
        external: "/home/jrede/.local/share/opencode/plugins/advance/proj123",
      },
    } as any;

    const result = await temporalOpsTools.adv_temporal_diagnose.execute(
      {},
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.recommendedNextAction).toBe(
      "normal recovery — peer worker spawn pending",
    );
  });

  it("adv_temporal_diagnose does not displace genuine or healthy recommendations with stale-lock context", async () => {
    const staleLock = {
      holder_pid: 4242,
      last_heartbeat_at: "2026-04-21T00:00:02.000Z",
      heartbeat_age_ms: 60001,
      schema_version: 2 as const,
    };
    const store = {
      paths: {
        root: "/repo",
        external: "/home/jrede/.local/share/opencode/plugins/advance/proj123",
      },
    } as any;

    mocks.getTemporalHealth.mockResolvedValueOnce({
      server_alive: false,
      worker_alive: false,
      worker_process_alive: false,
      registered_queues: [],
      last_op_at: null,
      last_error: null,
      fallback_counts: { changes: 0, tasks: 0, wisdom: 0, gates: 0 },
      stale_queues: [],
      reconnect_count: 0,
      worker_lock: staleLock,
      last_worker_run_error: null,
    });
    const serverDown = JSON.parse(
      await temporalOpsTools.adv_temporal_diagnose.execute({}, store),
    );
    expect(serverDown.recommendedNextAction).toBe("restore Temporal server");

    mocks.getTemporalHealth.mockResolvedValueOnce({
      server_alive: true,
      worker_alive: true,
      worker_process_alive: true,
      registered_queues: ["advance-proj123"],
      last_op_at: null,
      last_error: null,
      fallback_counts: { changes: 0, tasks: 0, wisdom: 0, gates: 0 },
      stale_queues: [],
      reconnect_count: 0,
      worker_lock: staleLock,
      last_worker_run_error: null,
    });
    const healthy = JSON.parse(
      await temporalOpsTools.adv_temporal_diagnose.execute({}, store),
    );
    expect(healthy.recommendedNextAction).toBe("none");
  });

  it("adv_temporal_diagnose reports project_workflow_present:false when workflow unreachable (T23)", async () => {
    // Force unreachable: no projectId resolved (no external path).
    const store = {
      paths: {
        root: "/repo",
      },
    } as any;

    const result = await temporalOpsTools.adv_temporal_diagnose.execute(
      {},
      store,
    );
    const parsed = JSON.parse(result);
    expect(parsed.project_workflow_present).toBe(false);
    expect(parsed.peer_sessions).toBe(0);
    expect(parsed.worker_lock_holder_pid).toBeNull();
  });

  it("adv_temporal_diagnose recommends search-attribute registration when attrs are missing", async () => {
    const bundle = mocks.getService();
    bundle.connection.operatorService.listSearchAttributes = vi.fn(
      async () => ({
        customAttributes: {},
      }),
    );
    mocks.getService.mockReturnValueOnce(bundle as any);
    const store = {
      paths: {
        root: "/repo",
        external: "/home/jrede/.local/share/opencode/plugins/advance/proj123",
      },
    } as any;

    const result = await temporalOpsTools.adv_temporal_diagnose.execute(
      {},
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.searchAttributes.ok).toBe(false);
    expect(parsed.searchAttributes.verificationStatus).toBe("verified");
    expect(parsed.searchAttributes.missing).toHaveLength(5);
    expect(parsed.recommendedNextAction).toBe(
      "run adv_temporal_register_search_attributes",
    );
  });

  it("adv_temporal_diagnose recommends verification recovery when search-attribute health is unverified", async () => {
    const bundle = mocks.getService();
    bundle.connection.operatorService.listSearchAttributes = vi.fn(async () => {
      throw new Error("operator unavailable");
    });
    mocks.getService.mockReturnValueOnce(bundle as any);
    const store = {
      paths: {
        root: "/repo",
        external: "/home/jrede/.local/share/opencode/plugins/advance/proj123",
      },
    } as any;

    const result = await temporalOpsTools.adv_temporal_diagnose.execute(
      {},
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.searchAttributes.ok).toBe(false);
    expect(parsed.searchAttributes.verificationStatus).toBe("unverified");
    expect(parsed.recommendedNextAction).toBe(
      "run adv_temporal_register_search_attributes with approval; if verification remains unverified, run adv_temporal_reconnect or adv_temporal_worker_restart (worker process only), then retry blocked Temporal tool; restart OpenCode for plugin tool-code drift",
    );
  });

  it("adv_temporal_register_search_attributes requires explicit approval", async () => {
    const store = { paths: { root: "/repo" } } as any;

    const result =
      await temporalOpsTools.adv_temporal_register_search_attributes.execute(
        { approvedByUser: false, approvalEvidence: "" },
        store,
      );
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("approval");
  });

  it("adv_temporal_register_search_attributes creates missing attrs through STSL", async () => {
    const bundle = mocks.getService();
    // First calls: check sees only AdvProjectId (triggers registration of the rest)
    // Subsequent calls: all SAs present (post-registration verification)
    let callCount = 0;
    bundle.connection.operatorService.listSearchAttributes = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        // Pre-registration check: only AdvProjectId present
        return {
          customAttributes: {
            AdvProjectId: { indexedValueType: 2 },
          },
        };
      }
      // Post-registration (calls 2+): all present
      return {
        customAttributes: {
          AdvProjectId: { indexedValueType: 2 },
          AdvChangeId: { indexedValueType: 2 },
          AdvChangeStatus: { indexedValueType: 2 },
          AdvActiveGate: { indexedValueType: 2 },
          AdvDoomLoopActive: { indexedValueType: 5 },
        },
      };
    });
    bundle.connection.operatorService.addSearchAttributes = vi
      .fn()
      .mockResolvedValue({});
    mocks.getService.mockReturnValueOnce(bundle as any);
    const store = { paths: { root: "/repo" } } as any;

    const result =
      await temporalOpsTools.adv_temporal_register_search_attributes.execute(
        {
          approvedByUser: true,
          approvalEvidence: "User approved via question tool",
        },
        store,
      );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.result.created.map((attr: any) => attr.name)).toEqual([
      "AdvChangeId",
      "AdvChangeStatus",
      "AdvActiveGate",
      "AdvDoomLoopActive",
    ]);
    expect(parsed.nextAction).toBe(
      "run adv_temporal_worker_restart (worker process only), then retry the failed workflow update or archive command; restart OpenCode for plugin tool-code drift",
    );
    expect(
      bundle.connection.operatorService.addSearchAttributes,
    ).toHaveBeenCalledWith({
      namespace: "default",
      searchAttributes: {
        AdvChangeId: 2,
        AdvChangeStatus: 2,
        AdvActiveGate: 2,
        AdvDoomLoopActive: 5,
      },
    });
  });

  it("adv_orphan_sweep refuses execute mode without approval", async () => {
    const store = {
      paths: {
        root: "/repo",
        external: "/home/jrede/.local/share/opencode/plugins/advance/proj123",
        changes: "/repo/.adv/changes",
      },
    } as any;

    const result = await temporalOpsTools.adv_orphan_sweep.execute(
      { dryRun: false, approvedByUser: false, approvalEvidence: "" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("approval");
  });

  it("adv_workflow_repair rebuilds project workflow, reimports the change, and re-emits derived exports", async () => {
    const store = {
      paths: {
        root: "/repo",
        external: "/home/jrede/.local/share/opencode/plugins/advance/proj123",
        changes: "/repo/.adv/changes",
        agenda:
          "/home/jrede/.local/share/opencode/plugins/advance/proj123/agenda.jsonl",
        wisdom:
          "/home/jrede/.local/share/opencode/plugins/advance/proj123/wisdom.jsonl",
      },
    } as any;

    const result = await temporalOpsTools.adv_workflow_repair.execute(
      {
        changeId: "chg123",
        approvalEvidence: "User approved via question tool",
      },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(mocks.loadChange).toHaveBeenCalledWith(
      "/repo/.adv/changes",
      "chg123",
    );
    expect(mocks.rebuildProjectWorkflowState).toHaveBeenCalledTimes(1);
    expect(mocks.reImportChangeState).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        projectId: "proj123",
        change: expect.objectContaining({ id: "chg123" }),
      }),
    );
    expect(mocks.writeJsonlAtomic).toHaveBeenCalledTimes(2);
    expect(mocks.reinitStsl).toHaveBeenCalledTimes(1);
  });

  it("adv_workflow_repair reports partial state when change re-import fails after project rebuild", async () => {
    mocks.reImportChangeState.mockRejectedValueOnce(
      new Error("missing search attribute AdvChangeId"),
    );
    const store = {
      paths: {
        root: "/repo",
        external: "/home/jrede/.local/share/opencode/plugins/advance/proj123",
        changes: "/repo/.adv/changes",
        agenda:
          "/home/jrede/.local/share/opencode/plugins/advance/proj123/agenda.jsonl",
        wisdom:
          "/home/jrede/.local/share/opencode/plugins/advance/proj123/wisdom.jsonl",
      },
    } as any;

    const result = await temporalOpsTools.adv_workflow_repair.execute(
      {
        changeId: "chg123",
        approvalEvidence: "User approved via question tool",
      },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.phase).toBe("reimport-change");
    expect(parsed.projectRebuilt).toBe(true);
    expect(parsed.error).toContain("missing search attribute AdvChangeId");
    expect(mocks.rebuildProjectWorkflowState).toHaveBeenCalledTimes(1);
  });

  it("adv_workflow_repair rejects when approvalEvidence is empty", async () => {
    const store = {
      paths: {
        root: "/repo",
        external: "/home/jrede/.local/share/opencode/plugins/advance/proj123",
        changes: "/repo/.adv/changes",
        agenda:
          "/home/jrede/.local/share/opencode/plugins/advance/proj123/agenda.jsonl",
        wisdom:
          "/home/jrede/.local/share/opencode/plugins/advance/proj123/wisdom.jsonl",
      },
    } as any;

    const result = await temporalOpsTools.adv_workflow_repair.execute(
      { changeId: "chg123", approvalEvidence: "   " },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("approvalEvidence is required");
    expect(mocks.rebuildProjectWorkflowState).not.toHaveBeenCalled();
  });

  describe("searchAttributesStatus in adv_temporal_diagnose", () => {
    it("returns searchAttributesStatus 'ok' when all SAs present", async () => {
      // Default getService mock returns all SAs present
      const store = {
        paths: { root: "/repo", external: "/data/proj123" },
      } as any;
      const result = await temporalOpsTools.adv_temporal_diagnose.execute(
        {},
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.searchAttributesStatus).toBe("ok");
    });

    it("returns searchAttributesStatus 'missing' when STSL not initialized", async () => {
      mocks.getService.mockReturnValueOnce(null as any);
      const store = {
        paths: { root: "/repo", external: "/data/proj123" },
      } as any;
      const result = await temporalOpsTools.adv_temporal_diagnose.execute(
        {},
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.searchAttributesStatus).toBe("missing");
    });

    it("returns searchAttributesStatus 'degraded' when SAs partially present", async () => {
      const bundle = mocks.getService();
      bundle.connection.operatorService.listSearchAttributes = vi.fn(
        async () => ({
          customAttributes: {
            AdvProjectId: { indexedValueType: 2 },
            // Missing: AdvChangeId, AdvChangeStatus, AdvActiveGate, AdvDoomLoopActive
          },
        }),
      );
      mocks.getService.mockReturnValueOnce(bundle as any);
      const store = {
        paths: { root: "/repo", external: "/data/proj123" },
      } as any;
      const result = await temporalOpsTools.adv_temporal_diagnose.execute(
        {},
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.searchAttributesStatus).toBe("degraded");
    });
  });

  describe("adv_temporal_register_search_attributes verification", () => {
    it("includes verification result after registration", async () => {
      const bundle = mocks.getService();
      bundle.connection.operatorService.listSearchAttributes = vi
        .fn()
        // First call: check before register → some missing
        .mockResolvedValueOnce({
          customAttributes: {
            AdvProjectId: { indexedValueType: 2 },
          },
        })
        // Second call: check after register → all present (verification)
        .mockResolvedValue({
          customAttributes: {
            AdvProjectId: { indexedValueType: 2 },
            AdvChangeId: { indexedValueType: 2 },
            AdvChangeStatus: { indexedValueType: 2 },
            AdvActiveGate: { indexedValueType: 2 },
            AdvDoomLoopActive: { indexedValueType: 5 },
          },
        });
      bundle.connection.operatorService.addSearchAttributes = vi
        .fn()
        .mockResolvedValue({});
      mocks.getService.mockReturnValueOnce(bundle as any);
      const store = { paths: { root: "/repo" } } as any;

      const result =
        await temporalOpsTools.adv_temporal_register_search_attributes.execute(
          {
            approvedByUser: true,
            approvalEvidence: "User approved via question tool",
          },
          store,
        );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.verification).toBeDefined();
      expect(parsed.verification.ok).toBe(true);
    });
  });
});
