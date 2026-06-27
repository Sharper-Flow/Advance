import { describe, expect, test, vi, beforeEach } from "vitest";
import { changeTools } from "./change";
import type { Change, Gates } from "../types";
import type { Store } from "../storage/store";

const mocks = vi.hoisted(() => ({
  findArchiveBundle: vi.fn(),
  saveRecoveredChangeStatus: vi.fn(),
  withTargetPathStore: vi.fn(),
}));

vi.mock("../archive", async () => {
  const actual =
    await vi.importActual<typeof import("../archive")>("../archive");
  return {
    ...actual,
    findArchiveBundle: mocks.findArchiveBundle,
  };
});

vi.mock("./_recovery-writers", async () => {
  const actual = await vi.importActual<typeof import("./_recovery-writers")>(
    "./_recovery-writers",
  );
  return {
    ...actual,
    saveRecoveredChangeStatus: mocks.saveRecoveredChangeStatus,
  };
});

vi.mock("./target-project", async () => {
  const actual =
    await vi.importActual<typeof import("./target-project")>(
      "./target-project",
    );
  return {
    ...actual,
    withTargetPathStore: mocks.withTargetPathStore,
  };
});

function doneGates(): Gates {
  const done = {
    status: "done" as const,
    completed_at: "2026-01-01T00:00:00Z",
    completed_by: "agent",
  };
  return {
    proposal: { ...done },
    discovery: { ...done },
    design: { ...done },
    planning: { ...done },
    execution: { ...done },
    acceptance: { ...done },
    release: { ...done },
  } as Gates;
}

function wedgedChange(overrides: Partial<Change> = {}): Change {
  return {
    id: "wedgedChange",
    title: "Wedged change",
    status: "draft",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: doneGates(),
    ...overrides,
  } as Change;
}

function createMockStore(change: Change): Store {
  const changes = [change];
  return {
    paths: {
      root: "/tmp/main",
      changes: "/tmp/.adv/changes",
      archive: "/tmp/.adv/archive",
    } as Store["paths"],
    config: { name: "test", features: {} } as Store["config"],
    changes: {
      get: vi.fn(async (changeId: string) => ({
        success: true,
        data: changes.find((candidate) => candidate.id === changeId) ?? null,
      })),
      list: vi.fn(async ({ status }: { status?: string } = {}) => ({
        changes: changes.filter((candidate) => {
          if (status === undefined)
            return !["archived", "closed"].includes(candidate.status);
          if (status) return candidate.status === status;
        }),
      })),
      save: vi.fn(),
      refresh: vi.fn(),
    } as unknown as Store["changes"],
  } as unknown as Store;
}

describe("adv_change_status_repair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findArchiveBundle.mockResolvedValue(
      "/tmp/.adv/archive/2026-01-01-wedgedChange",
    );
    mocks.saveRecoveredChangeStatus.mockImplementation(
      async (input: { change: Change; status: Change["status"] }) => {
        input.change.status = input.status;
      },
    );
    mocks.withTargetPathStore.mockImplementation(async (_input, fn) =>
      fn({
        context: {
          root: "/target/project",
          projectId: "target-project-id",
          externalRoot: "/target/external",
          trusted: true,
          trustSource: "explicit",
          stateMode: "temporal",
        },
        store: createMockStore(wedgedChange()),
      }),
    );
  });

  test("flips wedged status to archived when gates done + bundle present", async () => {
    const change = wedgedChange();
    const store = createMockStore(change);
    const archivedChange = { ...change, status: "archived" as const };
    (store.changes.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: true, data: change })
      .mockResolvedValue({ success: true, data: archivedChange });
    (store.changes.list as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ status }: { status?: string } = {}) => ({
        changes:
          status === "archived"
            ? [archivedChange]
            : status === undefined
              ? []
              : [],
      }),
    );

    const result = await changeTools.adv_change_status_repair.execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: "WorkflowNotFoundError + operator approved",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.status).toBe("archived");
    expect(parsed.fromStatus).toBe("draft");
    expect(parsed.recovered).toBe(true);
    expect(parsed._recoveryMutation).toBe(true);
    expect(mocks.saveRecoveredChangeStatus).toHaveBeenCalledTimes(1);
    const call = mocks.saveRecoveredChangeStatus.mock.calls[0][0];
    expect(call.status).toBe("archived");
    expect(call.authorization.reason).toBe("operator_status_repair");
    expect(call.authorization.evidence).toContain("WorkflowNotFoundError");
    expect(parsed.readback).toMatchObject({
      showStatus: "archived",
      inFlightCount: 0,
      archivedCount: 1,
    });
  });

  test("fails when status repair read-after-write still sees in-flight state", async () => {
    const change = wedgedChange();
    const store = createMockStore(change);
    (store.changes.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: true, data: change })
      .mockResolvedValue({ success: true, data: wedgedChange() });
    (store.changes.list as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ status }: { status?: string } = {}) => ({
        changes:
          status === "archived" ? [] : status === undefined ? [change] : [],
      }),
    );

    const result = await changeTools.adv_change_status_repair.execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: "WorkflowNotFoundError + operator approved",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("read-after-write verification failed");
    expect(parsed.readback).toMatchObject({
      showStatus: "draft",
      inFlightCount: 1,
      archivedCount: 0,
    });
    expect(mocks.saveRecoveredChangeStatus).toHaveBeenCalledTimes(1);
  });

  test("fails closed when status repair readback throws after disk repair", async () => {
    const change = wedgedChange();
    const store = createMockStore(change);
    (store.changes.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: true, data: change })
      .mockRejectedValueOnce(new Error("workflow projection unavailable"));

    const result = await changeTools.adv_change_status_repair.execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: "WorkflowNotFoundError + operator approved",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("read-after-write verification failed");
    expect(parsed.error).toContain("readback threw");
    expect(parsed.error).toContain("workflow projection unavailable");
    expect(parsed.readback).toMatchObject({
      inFlightCount: -1,
      archivedCount: -1,
    });
    expect(mocks.saveRecoveredChangeStatus).toHaveBeenCalledTimes(1);
  });

  test("routes target_path repair through target store with project context", async () => {
    const targetChange = wedgedChange();
    const targetStore = createMockStore(targetChange);
    mocks.withTargetPathStore.mockImplementationOnce(async (input, fn) =>
      fn({
        context: {
          root: input.target_path,
          projectId: "target-project-id",
          externalRoot: "/target/external",
          trusted: true,
          trustSource: "explicit",
          stateMode: "temporal",
        },
        store: targetStore,
      }),
    );

    const result = await changeTools.adv_change_status_repair.execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: "WorkflowNotFoundError + operator approved",
        target_path: "/target/project",
        target_confirmed: true,
        confirmationEvidence: "user approved target mutation",
      },
      createMockStore(wedgedChange()),
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.status).toBe("archived");
    expect(parsed._projectContext).toMatchObject({
      root: "/target/project",
      projectId: "target-project-id",
      stateMode: "temporal",
    });
    expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        target_path: "/target/project",
        stateRequirement: "temporal-required",
        target_confirmed: true,
        confirmationEvidence: "user approved target mutation",
      }),
      expect.any(Function),
    );
  });

  test("returns same-project repair packet when target_path is not serviceable", async () => {
    mocks.withTargetPathStore.mockRejectedValueOnce(
      new Error("Target project Temporal queue is not serviceable"),
    );

    const result = await changeTools.adv_change_status_repair.execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: "WorkflowNotFoundError + operator approved",
        target_path: "/target/project",
        target_confirmed: true,
        confirmationEvidence: "user approved target mutation",
      },
      createMockStore(wedgedChange()),
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Target project status repair unavailable");
    expect(parsed.targetRepairPacket).toEqual({
      workdir: "/target/project",
      tool: "adv_change_status_repair",
      args: {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: "WorkflowNotFoundError + operator approved",
      },
    });
  });

  test("dry run previews without writing the status flip", async () => {
    const store = createMockStore(wedgedChange());

    const result = await changeTools.adv_change_status_repair.execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: "evidence",
        dryRun: true,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.toStatus).toBe("archived");
    expect(mocks.saveRecoveredChangeStatus).not.toHaveBeenCalled();
  });

  test("is idempotent when already archived", async () => {
    const store = createMockStore(wedgedChange({ status: "archived" }));

    const result = await changeTools.adv_change_status_repair.execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: "evidence",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.status).toBe("archived");
    expect(mocks.saveRecoveredChangeStatus).not.toHaveBeenCalled();
  });

  test("refuses when a gate is not done", async () => {
    const gates = doneGates();
    (gates.release as { status: string }).status = "pending";
    const store = createMockStore(wedgedChange({ gates }));

    const result = await changeTools.adv_change_status_repair.execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: "evidence",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.incompleteGates).toContain("release");
    expect(mocks.saveRecoveredChangeStatus).not.toHaveBeenCalled();
  });

  test("refuses when no archive bundle is present on disk", async () => {
    mocks.findArchiveBundle.mockResolvedValue(null);
    const store = createMockStore(wedgedChange());

    const result = await changeTools.adv_change_status_repair.execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: "evidence",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("no archive bundle");
    expect(mocks.saveRecoveredChangeStatus).not.toHaveBeenCalled();
  });

  test("requires non-empty approvalEvidence", async () => {
    const store = createMockStore(wedgedChange());

    const result = await changeTools.adv_change_status_repair.execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: "   ",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("approvalEvidence is required");
    expect(mocks.saveRecoveredChangeStatus).not.toHaveBeenCalled();
  });

  test("returns not-found for unknown change", async () => {
    const store = createMockStore(wedgedChange());

    const result = await changeTools.adv_change_status_repair.execute(
      {
        changeId: "doesNotExist",
        approvedByUser: true,
        approvalEvidence: "evidence",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("Change not found");
    expect(mocks.saveRecoveredChangeStatus).not.toHaveBeenCalled();
  });

  // The real saveRecoveredChangeStatus must be called by the status-repair
  // tool, but it must not call store.changes.refresh because refresh can
  // re-query a stale live workflow and overwrite the disk repair.
  test("invokes the real saveRecoveredChangeStatus without refreshing stale workflow state", async () => {
    // Import the real writer (bypassing the module-level mock for this test).
    const { saveRecoveredChangeStatus: realSaveRecoveredChangeStatus } =
      await vi.importActual<typeof import("./_recovery-writers")>(
        "./_recovery-writers",
      );
    mocks.saveRecoveredChangeStatus.mockImplementation(async (input) => {
      const updated = await realSaveRecoveredChangeStatus(input);
      Object.assign(input.change, updated);
      return updated;
    });

    const change = wedgedChange();
    const store = createMockStore(change);

    const result = await changeTools.adv_change_status_repair.execute(
      {
        changeId: "wedgedChange",
        approvedByUser: true,
        approvalEvidence: "WorkflowNotFoundError + operator approved",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.status).toBe("archived");
    expect(mocks.saveRecoveredChangeStatus).toHaveBeenCalledTimes(1);
    expect(store.changes.refresh).not.toHaveBeenCalled();
  });
});
