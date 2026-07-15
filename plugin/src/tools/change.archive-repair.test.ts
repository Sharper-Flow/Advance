import { describe, expect, test, vi, beforeEach } from "vitest";
import { changeTools } from "./change";
import type { Change, Gates } from "../types";
import type { Store } from "../storage/store";

const mocks = vi.hoisted(() => ({
  resolveMainCheckout: vi.fn(() => "/tmp/main"),
  detectDefaultBranch: vi.fn(() => ({ branch: "trunk", source: "test" })),
  detectArchivedUnmergedBranches: vi.fn(() => ({
    status: "ok",
    branches: [
      {
        changeId: "archived-one",
        branch: "change/archived-one",
        remoteRef: "refs/heads/change/archived-one",
        sha: "aaa",
        unmergedCommits: ["aaa archived commit"],
      },
    ],
  })),
  redriveArchivedUnmergedBranch: vi.fn(() => ({
    status: "pending_merge",
    mainCheckout: "/tmp/main",
    defaultBranch: "trunk",
    route: "pr_auto_merge",
    pushStatus: "pushed",
    prBranch: "change/archived-one",
    prNumber: 42,
    prUrl: "https://github.com/Sharper-Flow/Advance/pull/42",
    autoMergeArmed: true,
  })),
  detectArchivedMergedBranches: vi.fn(() => ({
    status: "ok",
    branches: [],
  })),
  findArchiveBundle: vi.fn(),
  saveRecoveredChangeStatus: vi.fn(),
}));

vi.mock("./archive-helpers/git-finalize", async () => {
  const actual = await vi.importActual<
    typeof import("./archive-helpers/git-finalize")
  >("./archive-helpers/git-finalize");
  return {
    ...actual,
    resolveMainCheckout: mocks.resolveMainCheckout,
    detectDefaultBranch: mocks.detectDefaultBranch,
    detectArchivedUnmergedBranches: mocks.detectArchivedUnmergedBranches,
    redriveArchivedUnmergedBranch: mocks.redriveArchivedUnmergedBranch,
    detectArchivedMergedBranches: mocks.detectArchivedMergedBranches,
  };
});

vi.mock("../archive", async () => {
  const actual =
    await vi.importActual<typeof import("../archive")>("../archive");
  return { ...actual, findArchiveBundle: mocks.findArchiveBundle };
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

function archivedChange(id: string): Change {
  return {
    id,
    title: id,
    status: "archived",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
  } as Change;
}

function createMockStore(
  changes: Change[] = [
    archivedChange("archived-one"),
    archivedChange("already-merged"),
  ],
): Store {
  return {
    paths: {
      root: "/tmp/main",
      changes: "/tmp/.adv/changes",
    } as Store["paths"],
    config: { name: "test", features: {} } as Store["config"],
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {} as Store["specs"],
    changes: {
      list: vi.fn(async ({ status }: { status?: string } = {}) => ({
        changes: status
          ? changes.filter((change) => change.status === status)
          : changes,
      })),
      get: vi.fn(async (changeId: string) => ({
        success: true,
        data: changes.find((change) => change.id === changeId) ?? null,
      })),
      create: vi.fn(),
      save: vi.fn(),
      updateArtifacts: vi.fn(),
      close: vi.fn(),
      closeBatch: vi.fn(),
      refresh: vi.fn(),
    } as Store["changes"],
    tasks: {} as Store["tasks"],
    wisdom: {} as Store["wisdom"],
    gates: {} as Store["gates"],
    status: vi.fn(),
  } as unknown as Store;
}

describe("adv_archive_repair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findArchiveBundle.mockResolvedValue(null);
    mocks.saveRecoveredChangeStatus.mockImplementation(
      async (input: { change: Change; status: Change["status"] }) => {
        input.change.status = input.status;
        return input.change;
      },
    );
  });

  test("scan lists archived origin change branches not reachable from origin/default", async () => {
    const store = createMockStore();

    const result = await changeTools.adv_archive_repair.execute(
      { action: "scan" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.action).toBe("scan");
    expect(parsed.branches).toHaveLength(1);
    expect(parsed.branches[0]).toMatchObject({
      changeId: "archived-one",
      branch: "change/archived-one",
    });
    expect(store.changes.list).toHaveBeenCalledWith({
      status: "archived",
      includeArchived: true,
    });
    expect(mocks.detectArchivedUnmergedBranches).toHaveBeenCalledWith({
      mainCheckout: "/tmp/main",
      defaultBranch: "trunk",
      archivedChangeIds: ["archived-one", "already-merged"],
    });
  });

  test("redrive opens or reuses PR and arms auto-merge for one archived branch", async () => {
    const store = createMockStore();

    const result = await changeTools.adv_archive_repair.execute(
      { action: "redrive", changeId: "archived-one" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.action).toBe("redrive");
    expect(parsed.outcome).toMatchObject({
      status: "pending_merge",
      prNumber: 42,
      autoMergeArmed: true,
    });
    expect(mocks.redriveArchivedUnmergedBranch).toHaveBeenCalledWith({
      mainCheckout: "/tmp/main",
      defaultBranch: "trunk",
      changeId: "archived-one",
    });
  });

  test("reconcile repairs only bundle-present, fully-gated, merged release-stuck changes", async () => {
    const shipped = {
      ...archivedChange("shipped"),
      status: "active",
      gates: doneGates(),
    } as Change;
    const incomplete = {
      ...archivedChange("incomplete"),
      status: "active",
      gates: {
        ...doneGates(),
        release: { status: "pending" },
      },
    } as Change;
    const noBundle = {
      ...archivedChange("no-bundle"),
      status: "active",
      gates: doneGates(),
    } as Change;
    const unmerged = {
      ...archivedChange("unmerged"),
      status: "active",
      gates: doneGates(),
    } as Change;
    const changes = [shipped, incomplete, noBundle, unmerged];
    const store = createMockStore(changes);
    (store.changes.list as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ status }: { status?: string } = {}) => ({
        changes:
          status === "archived"
            ? changes.filter((change) => change.status === "archived")
            : changes.filter(
                (change) =>
                  change.status !== "archived" && change.status !== "closed",
              ),
      }),
    );
    mocks.findArchiveBundle.mockImplementation(async (_dir, changeId) =>
      ["shipped", "unmerged"].includes(changeId)
        ? `/tmp/.adv/archive/${changeId}`
        : null,
    );
    mocks.detectArchivedMergedBranches.mockReturnValueOnce({
      status: "ok",
      branches: [
        {
          changeId: "shipped",
          branch: "change/shipped",
          localSha: "abc",
          mergeProof: { kind: "tree-identical", trunkCommitSha: "def" },
        },
      ],
    });

    const result = await changeTools.adv_archive_repair.execute(
      {
        action: "reconcile",
        approvedByUser: true,
        approvalEvidence: "WorkflowNotFoundError + operator approved",
        recoveryReason:
          "bundle is durable but terminal archive projection is wedged",
      } as never,
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.summary).toMatchObject({
      total: 4,
      repaired: 1,
      skipped: 3,
      failed: 0,
    });
    expect(parsed.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeId: "shipped",
          disposition: "repaired",
        }),
        expect.objectContaining({
          changeId: "incomplete",
          disposition: "skipped_incomplete_gates",
        }),
        expect.objectContaining({
          changeId: "no-bundle",
          disposition: "skipped_no_bundle",
        }),
        expect.objectContaining({
          changeId: "unmerged",
          disposition: "skipped_unmerged_branch",
        }),
      ]),
    );
    expect(mocks.saveRecoveredChangeStatus).toHaveBeenCalledTimes(1);
    expect(mocks.saveRecoveredChangeStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        store,
        change: shipped,
        status: "archived",
        authorization: expect.objectContaining({
          reason: "bundle is durable but terminal archive projection is wedged",
          evidence: "WorkflowNotFoundError + operator approved",
        }),
      }),
    );
    expect(incomplete.status).toBe("active");
    expect(noBundle.status).toBe("active");
    expect(unmerged.status).toBe("active");
  });

  test("reconcile reports an unreadable candidate without mutating it", async () => {
    const unreadable = {
      ...archivedChange("unreadable"),
      status: "active",
      gates: doneGates(),
    } as Change;
    const store = createMockStore([unreadable]);
    (store.changes.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("disk projection unavailable"),
    );

    const result = await changeTools.adv_archive_repair.execute(
      {
        action: "reconcile",
        approvedByUser: true,
        approvalEvidence: "WorkflowNotFoundError + operator approved",
        recoveryReason:
          "bundle is durable but terminal archive projection is wedged",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.results).toEqual([
      expect.objectContaining({
        changeId: "unreadable",
        disposition: "skipped_unreadable_change",
        detail: "disk projection unavailable",
      }),
    ]);
    expect(mocks.findArchiveBundle).not.toHaveBeenCalled();
    expect(mocks.saveRecoveredChangeStatus).not.toHaveBeenCalled();
    expect(unreadable.status).toBe("active");
  });

  test("non-regression: direct-archive cleanup gate keeps archiveMode === direct check", async () => {
    // This is a source-level guard to ensure the direct-mode archive cleanup
    // gate (`archiveMode === "direct"`) is not accidentally removed. The actual
    // behavior is covered by existing archive finalization tests.
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      new URL("./change.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('archiveMode === "direct"');
  });
});
