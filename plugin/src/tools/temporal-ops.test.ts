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
  getService: vi.fn(() => ({
    address: "127.0.0.1:7233",
    namespace: "default",
    connection: {
      close: vi.fn(async () => {}),
      operatorService: {
        getSearchAttributes: vi.fn(async () => ({
          customAttributes: {
            AdvProjectId: { indexedValueType: 1 },
            AdvChangeId: { indexedValueType: 1 },
            AdvChangeStatus: { indexedValueType: 1 },
            AdvActiveGate: { indexedValueType: 1 },
            AdvDoomLoopActive: { indexedValueType: 4 },
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

import {
  asProjectWorkflowHandle,
  asWorkflowClientSurface,
  temporalOpsTools,
} from "./temporal-ops";

describe("temporal operator tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asProjectWorkflowHandle preserves query and terminate methods", async () => {
    const handle = {
      terminate: vi.fn(async () => {}),
      query: vi.fn(async () => []),
    };

    const coerced = asProjectWorkflowHandle(handle);

    await coerced.terminate("test");
    await coerced.query("adv.project.agenda");
    expect(handle.terminate).toHaveBeenCalledWith("test");
    expect(handle.query).toHaveBeenCalledWith("adv.project.agenda");
  });

  it("asWorkflowClientSurface exposes workflow client shape", () => {
    const bundleClient = {
      workflow: {
        getHandle: vi.fn(),
      },
    };

    const coerced = asWorkflowClientSurface(bundleClient);

    expect(coerced.workflow).toBe(bundleClient.workflow);
  });

  it("adv_temporal_worker_restart invokes restartCurrentProjectTemporalWorker and returns queues", async () => {
    const store = { paths: { root: "/repo" } } as any;
    const result = await temporalOpsTools.adv_temporal_worker_restart.execute(
      {},
      store,
    );
    const parsed = JSON.parse(result);

    expect(mocks.restartCurrentProjectTemporalWorker).toHaveBeenCalledWith(
      "/repo",
    );
    expect(parsed.success).toBe(true);
    expect(parsed.projectId).toBe("proj123");
    expect(parsed.queues).toEqual(["advance-proj123"]);
    expect(parsed.stsl).toEqual({
      initialized: true,
      reconnectCount: 0,
      reconnectFailureCount: 0,
      recommendedNextAction: "run adv_temporal_diagnose if tools still fail",
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
  });

  it("adv_temporal_diagnose recommends search-attribute registration when attrs are missing", async () => {
    const bundle = mocks.getService();
    bundle.connection.operatorService.getSearchAttributes = vi.fn(async () => ({
      customAttributes: {},
    }));
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
    expect(parsed.searchAttributes.missing).toHaveLength(5);
    expect(parsed.recommendedNextAction).toBe(
      "run adv_temporal_register_search_attributes",
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
    bundle.connection.operatorService.getSearchAttributes = vi.fn(async () => ({
      customAttributes: {
        AdvProjectId: { indexedValueType: 1 },
      },
    }));
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
    expect(bundle.connection.operatorService.addSearchAttributes).toHaveBeenCalledWith({
      namespace: "default",
      searchAttributes: {
        AdvChangeId: 1,
        AdvChangeStatus: 1,
        AdvActiveGate: 1,
        AdvDoomLoopActive: 4,
      },
    });
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
});
