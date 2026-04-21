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
