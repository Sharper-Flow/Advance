import { describe, expect, test, vi, beforeEach } from "vitest";
import { changeTools } from "./change";
import type { Change, Gates } from "../types";
import type { Store } from "../storage/store";

const mocks = vi.hoisted(() => ({
  findArchiveBundle: vi.fn(),
  saveRecoveredChangeStatus: vi.fn(),
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
        data: changeId === change.id ? change : null,
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
    mocks.saveRecoveredChangeStatus.mockImplementation(async () => undefined);
  });

  test("flips wedged status to archived when gates done + bundle present", async () => {
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
    expect(parsed.fromStatus).toBe("draft");
    expect(mocks.saveRecoveredChangeStatus).toHaveBeenCalledTimes(1);
    const call = mocks.saveRecoveredChangeStatus.mock.calls[0][0];
    expect(call.status).toBe("archived");
    expect(call.authorization.reason).toBe("operator_status_repair");
    expect(call.authorization.evidence).toContain("WorkflowNotFoundError");
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
});
