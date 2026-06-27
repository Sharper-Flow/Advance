import { describe, expect, test, vi, beforeEach } from "vitest";
import { changeTools } from "./change";
import type { Change } from "../types";
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
  getCheckedOutChangeBranches: vi.fn(() => ({
    status: "ok",
    branches: new Set<string>(),
    worktreePaths: {},
  })),
  deleteChangeBranch: vi.fn(() => ({
    localDeleted: true,
    remoteDeleted: true,
  })),
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
    getCheckedOutChangeBranches: mocks.getCheckedOutChangeBranches,
    deleteChangeBranch: mocks.deleteChangeBranch,
  };
});

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

  test("cleanup_merged scan lists candidates with merge proof", async () => {
    const store = createMockStore();
    mocks.detectArchivedMergedBranches.mockReturnValueOnce({
      status: "ok",
      branches: [
        {
          changeId: "tree-match",
          branch: "change/tree-match",
          localSha: "abc123",
          mergeProof: {
            kind: "tree-identical",
            trunkCommitSha: "def456",
          },
        },
        {
          changeId: "patch-match",
          branch: "change/patch-match",
          localSha: "ghi789",
          mergeProof: { kind: "patch-equivalent" },
        },
      ],
    });

    const result = await changeTools.adv_archive_repair.execute(
      { action: "cleanup_merged", dryRun: true },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.action).toBe("cleanup_merged");
    expect(parsed.dryRun).toBe(true);
    expect(parsed.candidates).toHaveLength(2);
    expect(parsed.candidates[0]).toMatchObject({
      changeId: "tree-match",
      mergeProof: { kind: "tree-identical", trunkCommitSha: "def456" },
    });
    expect(parsed.candidates[1]).toMatchObject({
      changeId: "patch-match",
      mergeProof: { kind: "patch-equivalent" },
    });
    expect(mocks.detectArchivedMergedBranches).toHaveBeenCalledWith({
      mainCheckout: "/tmp/main",
      defaultBranch: "trunk",
      archivedChangeIds: ["archived-one", "already-merged"],
    });
    expect(mocks.deleteChangeBranch).not.toHaveBeenCalled();
  });

  test("cleanup_merged excludes branches checked out in worktrees", async () => {
    const store = createMockStore();
    mocks.detectArchivedMergedBranches.mockReturnValueOnce({
      status: "ok",
      branches: [
        {
          changeId: "checked-out",
          branch: "change/checked-out",
          localSha: "aaa",
          mergeProof: { kind: "patch-equivalent" },
        },
        {
          changeId: "free",
          branch: "change/free",
          localSha: "bbb",
          mergeProof: { kind: "patch-equivalent" },
        },
      ],
    });
    mocks.getCheckedOutChangeBranches.mockReturnValueOnce({
      status: "ok",
      branches: new Set(["change/checked-out"]),
      worktreePaths: { "change/checked-out": "/tmp/wt/checked-out" },
    });

    const result = await changeTools.adv_archive_repair.execute(
      { action: "cleanup_merged", dryRun: true },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.candidates).toHaveLength(1);
    expect(parsed.candidates[0].changeId).toBe("free");
    expect(parsed.skipped).toHaveLength(1);
    expect(parsed.skipped[0]).toMatchObject({
      changeId: "checked-out",
      reason: "WORKTREE_CHECKED_OUT",
      worktreePath: "/tmp/wt/checked-out",
    });
  });

  test("cleanup_merged dryRun returns candidates without deleting", async () => {
    const store = createMockStore();
    mocks.detectArchivedMergedBranches.mockReturnValueOnce({
      status: "ok",
      branches: [
        {
          changeId: "merged-a",
          branch: "change/merged-a",
          localSha: "aaa",
          mergeProof: { kind: "tree-identical", trunkCommitSha: "trunk-aaa" },
        },
        {
          changeId: "merged-b",
          branch: "change/merged-b",
          localSha: "bbb",
          mergeProof: { kind: "patch-equivalent" },
        },
      ],
    });

    const result = await changeTools.adv_archive_repair.execute(
      { action: "cleanup_merged", dryRun: true },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.count).toBe(2);
    expect(mocks.deleteChangeBranch).not.toHaveBeenCalled();
  });

  test("cleanup_merged wet-run deletes safe candidates via deleteChangeBranch", async () => {
    const store = createMockStore();
    mocks.detectArchivedMergedBranches.mockReturnValueOnce({
      status: "ok",
      branches: [
        {
          changeId: "merged-a",
          branch: "change/merged-a",
          localSha: "aaa",
          mergeProof: { kind: "tree-identical", trunkCommitSha: "trunk-aaa" },
        },
        {
          changeId: "merged-b",
          branch: "change/merged-b",
          localSha: "bbb",
          mergeProof: { kind: "patch-equivalent" },
        },
      ],
    });

    const result = await changeTools.adv_archive_repair.execute(
      { action: "cleanup_merged" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(false);
    expect(parsed.results).toHaveLength(2);
    expect(mocks.deleteChangeBranch).toHaveBeenCalledTimes(2);
    expect(mocks.deleteChangeBranch).toHaveBeenNthCalledWith(
      1,
      "/tmp/main",
      "merged-a",
    );
    expect(mocks.deleteChangeBranch).toHaveBeenNthCalledWith(
      2,
      "/tmp/main",
      "merged-b",
    );
    expect(parsed.summary).toMatchObject({
      total: 2,
      candidates: 2,
      deleted: 2,
      remoteDeleted: 2,
      failed: 0,
      skippedWorktree: 0,
    });
  });

  test("cleanup_merged reports per-branch blocked results when branch deletion throws", async () => {
    const store = createMockStore();
    mocks.detectArchivedMergedBranches.mockReturnValueOnce({
      status: "ok",
      branches: [
        {
          changeId: "merged-a",
          branch: "change/merged-a",
          localSha: "aaa",
          mergeProof: { kind: "tree-identical", trunkCommitSha: "trunk-aaa" },
        },
        {
          changeId: "merged-b",
          branch: "change/merged-b",
          localSha: "bbb",
          mergeProof: { kind: "patch-equivalent" },
        },
      ],
    });
    mocks.deleteChangeBranch
      .mockImplementationOnce(() => {
        throw new Error("delete timed out");
      })
      .mockReturnValueOnce({ localDeleted: true, remoteDeleted: true });

    const result = await changeTools.adv_archive_repair.execute(
      { action: "cleanup_merged" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0]).toMatchObject({
      changeId: "merged-a",
      branch: "change/merged-a",
      localDeleted: false,
      remoteDeleted: false,
      blocked: { reason: "DELETE_FAILED" },
    });
    expect(parsed.results[1]).toMatchObject({
      changeId: "merged-b",
      localDeleted: true,
      remoteDeleted: true,
    });
    expect(parsed.summary).toMatchObject({ failed: 1, deleted: 1 });
  });

  test("cleanup_merged filters non-archived changes", async () => {
    const store = createMockStore([
      archivedChange("X"),
      { ...archivedChange("Y"), status: "draft" } as Change,
    ]);
    mocks.detectArchivedMergedBranches.mockReturnValueOnce({
      status: "ok",
      branches: [],
    });

    const result = await changeTools.adv_archive_repair.execute(
      { action: "cleanup_merged", dryRun: true },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(mocks.detectArchivedMergedBranches).toHaveBeenCalledWith({
      mainCheckout: "/tmp/main",
      defaultBranch: "trunk",
      archivedChangeIds: ["X"],
    });
  });

  test("cleanup_merged tolerates remote-already-deleted as warning", async () => {
    const store = createMockStore();
    mocks.detectArchivedMergedBranches.mockReturnValueOnce({
      status: "ok",
      branches: [
        {
          changeId: "merged-a",
          branch: "change/merged-a",
          localSha: "aaa",
          mergeProof: { kind: "patch-equivalent" },
        },
      ],
    });
    mocks.deleteChangeBranch.mockReturnValueOnce({
      localDeleted: true,
      remoteDeleted: false,
      error: "Remote branch deletion failed: remote ref not found",
    });

    const result = await changeTools.adv_archive_repair.execute(
      { action: "cleanup_merged" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0]).toMatchObject({
      changeId: "merged-a",
      localDeleted: true,
      remoteDeleted: false,
    });
    expect(parsed.results[0].error).toContain("Remote branch deletion failed");
    expect(parsed.summary).toMatchObject({
      deleted: 1,
      remoteDeleted: 0,
      failed: 0,
    });
  });

  test("cleanup_merged changeId arg restricts to single archived change", async () => {
    const store = createMockStore([archivedChange("X"), archivedChange("Y")]);
    mocks.detectArchivedMergedBranches.mockReturnValueOnce({
      status: "ok",
      branches: [],
    });

    const result = await changeTools.adv_archive_repair.execute(
      { action: "cleanup_merged", changeId: "X", dryRun: true },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(mocks.detectArchivedMergedBranches).toHaveBeenCalledWith({
      mainCheckout: "/tmp/main",
      defaultBranch: "trunk",
      archivedChangeIds: ["X"],
    });
  });

  test("cleanup_merged rejects changeId that is not archived", async () => {
    const store = createMockStore([archivedChange("X")]);

    const result = await changeTools.adv_archive_repair.execute(
      { action: "cleanup_merged", changeId: "Y", dryRun: true },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("not archived or was not found");
    expect(mocks.detectArchivedMergedBranches).not.toHaveBeenCalled();
  });

  test("non-regression: direct-archive cleanup gate keeps archiveMode === direct check", async () => {
    // This is a source-level guard to ensure the direct-mode archive cleanup
    // gate at change.ts:4436-4441 is not accidentally removed. The actual
    // behavior is covered by existing archive finalization tests.
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      new URL("./change.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('archiveMode === "direct"');
  });
});
