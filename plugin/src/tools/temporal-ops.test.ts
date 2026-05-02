import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  restartCurrentProjectTemporalWorker: vi.fn(async () => ({
    projectId: "proj123",
    queues: ["advance-proj123"],
  })),
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
  });

  it("adv_temporal_worker_restart fires-and-forgets: invokes restart but returns immediately with verification hint", async () => {
    const store = { paths: { root: "/repo" } } as any;
    const result = await temporalOpsTools.adv_temporal_worker_restart.execute(
      {},
      store,
    );
    const parsed = JSON.parse(result);

    // Underlying restart was kicked off asynchronously (not awaited).
    expect(mocks.restartCurrentProjectTemporalWorker).toHaveBeenCalledWith(
      "/repo",
    );
    // Response is the fire-and-forget acknowledgment, not the restart result.
    expect(parsed.success).toBe(true);
    expect(parsed.message).toContain("initiated");
    expect(parsed.recommendedNextAction).toContain("adv_status");
    expect(parsed.stsl).toEqual({
      initialized: true,
      reconnectCount: 0,
      reconnectFailureCount: 0,
    });
    // No projectId / queues fields — those came from awaiting the result.
    expect(parsed.projectId).toBeUndefined();
    expect(parsed.queues).toBeUndefined();
  });

  it("adv_temporal_worker_restart returns within 1s even when restart hangs (KD-5 fire-and-forget)", async () => {
    // Simulate a hanging restart: never resolves.
    mocks.restartCurrentProjectTemporalWorker.mockImplementationOnce(
      () => new Promise(() => {}),
    );
    const store = { paths: { root: "/repo" } } as any;
    const start = Date.now();
    const result = await temporalOpsTools.adv_temporal_worker_restart.execute(
      {},
      store,
    );
    const elapsed = Date.now() - start;
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(elapsed).toBeLessThan(1000);
  });

  it("adv_temporal_worker_restart logs async failures via appendDebugLog without throwing", async () => {
    // Reject with an error; tool should not throw, response should still be success.
    mocks.restartCurrentProjectTemporalWorker.mockImplementationOnce(
      async () => {
        throw new Error("simulated worker restart failure");
      },
    );
    const store = { paths: { root: "/repo" } } as any;
    const result = await temporalOpsTools.adv_temporal_worker_restart.execute(
      {},
      store,
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    // Allow microtask queue to drain so the .catch() runs before assertion exit.
    await new Promise((r) => setImmediate(r));
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
      "verify Temporal search-attribute health, run adv_temporal_reconnect or adv_temporal_worker_restart, then retry blocked tool",
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
      "run adv_temporal_worker_restart, then retry the failed workflow update or archive command",
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
