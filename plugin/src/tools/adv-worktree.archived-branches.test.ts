import { beforeEach, describe, expect, test, vi } from "vitest";
import { advWorktreeTools } from "./adv-worktree";
import type { Change } from "../types";
import type { Store } from "../storage/store-types";

const mocks = vi.hoisted(() => ({
  resolveMainCheckout: vi.fn(() => "/tmp/main"),
  detectDefaultBranch: vi.fn(() => ({ branch: "trunk", source: "test" })),
  detectArchivedMergedBranches: vi.fn(() => ({
    status: "ok",
    branches: [] as Array<Record<string, unknown>>,
  })),
  getCheckedOutChangeBranches: vi.fn(() => ({
    status: "ok",
    branches: new Set<string>(),
    worktreePaths: {} as Record<string, string>,
  })),
  deleteChangeBranch: vi.fn(() => ({
    localDeleted: true,
    remoteDeleted: true,
  })),
  execGit: vi.fn(async () => ""),
  advWorktreeCleanup: vi.fn(),
}));

const targetProjectMock = vi.hoisted(() => ({
  appendTargetProjectContextOutput: vi.fn(
    (output: string, context: unknown) => {
      const parsed = JSON.parse(output);
      parsed._projectContext = context;
      return JSON.stringify(parsed);
    },
  ),
  withTargetPathStore: vi.fn(),
}));

vi.mock("./archive-helpers/git-finalize", async () => {
  const actual = await vi.importActual<
    typeof import("./archive-helpers/git-finalize")
  >("./archive-helpers/git-finalize");
  return {
    ...actual,
    resolveMainCheckout: mocks.resolveMainCheckout,
    detectDefaultBranch: mocks.detectDefaultBranch,
    detectArchivedMergedBranches: mocks.detectArchivedMergedBranches,
    getCheckedOutChangeBranches: mocks.getCheckedOutChangeBranches,
    deleteChangeBranch: mocks.deleteChangeBranch,
  };
});

vi.mock("../utils/git.js", async () => {
  const actual =
    await vi.importActual<typeof import("../utils/git.js")>("../utils/git.js");
  return { ...actual, execGit: mocks.execGit };
});

vi.mock("./worktree", () => ({
  advWorktreeCreate: vi.fn(),
  advWorktreeResume: vi.fn(),
  advWorktreeDelete: vi.fn(),
  advWorktreeCleanup: mocks.advWorktreeCleanup,
  loadWorktreeConfig: vi.fn(),
}));

vi.mock("./worktree/state", () => ({
  initStateDb: vi.fn(),
}));

vi.mock("./worktree/triage", () => ({
  triageWorktrees: vi.fn(),
}));

vi.mock("../utils/workspace-warp", () => ({
  createAdvWorkspace: vi.fn(),
  deleteAdvWorkspace: vi.fn(),
  getSessionWorkspaceID: vi.fn(),
  warpFlagEnabled: vi.fn(),
  warpSession: vi.fn(),
  workspaceAndWarpAvailable: vi.fn(),
}));

vi.mock("./target-project", () => targetProjectMock);

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
    paths: { root: "/tmp/main" },
    changes: {
      list: vi.fn(async ({ status }: { status?: string } = {}) => ({
        changes: status
          ? changes.filter((change) => change.status === status)
          : changes,
      })),
    },
  } as unknown as Store;
}

describe("adv_worktree_cleanup mode=archived_branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    targetProjectMock.withTargetPathStore.mockImplementation(
      async (_input: unknown, fn: (arg: unknown) => unknown) =>
        fn({
          context: {
            root: "/target",
            projectId: "target-project",
            externalRoot: "/external/target-project",
            trusted: false,
            trustSource: "explicit",
            stateMode: "temporal",
          },
          store: createMockStore(),
        }),
    );
  });

  test("lists candidates with merge proof on dryRun", async () => {
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

    const result = await advWorktreeTools.adv_worktree_cleanup.execute(
      {
        reason: "archived branch cleanup",
        mode: "archived_branches",
        dryRun: true,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.mode).toBe("archived_branches");
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
    expect(mocks.advWorktreeCleanup).not.toHaveBeenCalled();
  });

  test("excludes branches checked out in worktrees", async () => {
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

    const result = await advWorktreeTools.adv_worktree_cleanup.execute(
      {
        reason: "archived branch cleanup",
        mode: "archived_branches",
        dryRun: true,
      },
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

  test("dryRun returns candidates without deleting", async () => {
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

    const result = await advWorktreeTools.adv_worktree_cleanup.execute(
      {
        reason: "archived branch cleanup",
        mode: "archived_branches",
        dryRun: true,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.count).toBe(2);
    expect(mocks.deleteChangeBranch).not.toHaveBeenCalled();
  });

  test("wet-run deletes safe candidates via deleteChangeBranch", async () => {
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

    const result = await advWorktreeTools.adv_worktree_cleanup.execute(
      { reason: "archived branch cleanup", mode: "archived_branches" },
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

  test("reports per-branch blocked results when branch deletion throws", async () => {
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

    const result = await advWorktreeTools.adv_worktree_cleanup.execute(
      { reason: "archived branch cleanup", mode: "archived_branches" },
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

  test("filters non-archived changes", async () => {
    const store = createMockStore([
      archivedChange("X"),
      { ...archivedChange("Y"), status: "draft" } as Change,
    ]);
    mocks.detectArchivedMergedBranches.mockReturnValueOnce({
      status: "ok",
      branches: [],
    });

    const result = await advWorktreeTools.adv_worktree_cleanup.execute(
      {
        reason: "archived branch cleanup",
        mode: "archived_branches",
        dryRun: true,
      },
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

  test("tolerates remote-already-deleted as warning", async () => {
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

    const result = await advWorktreeTools.adv_worktree_cleanup.execute(
      { reason: "archived branch cleanup", mode: "archived_branches" },
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

  test("changeId arg restricts to single archived change", async () => {
    const store = createMockStore([archivedChange("X"), archivedChange("Y")]);
    mocks.detectArchivedMergedBranches.mockReturnValueOnce({
      status: "ok",
      branches: [],
    });

    const result = await advWorktreeTools.adv_worktree_cleanup.execute(
      {
        reason: "archived branch cleanup",
        mode: "archived_branches",
        changeId: "X",
        dryRun: true,
      },
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

  test("rejects changeId that is not archived", async () => {
    const store = createMockStore([archivedChange("X")]);

    const result = await advWorktreeTools.adv_worktree_cleanup.execute(
      {
        reason: "archived branch cleanup",
        mode: "archived_branches",
        changeId: "Y",
        dryRun: true,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("not archived or was not found");
    expect(mocks.detectArchivedMergedBranches).not.toHaveBeenCalled();
  });

  test("fails closed when merge detection is blocked", async () => {
    const store = createMockStore();
    mocks.detectArchivedMergedBranches.mockReturnValueOnce({
      status: "blocked",
      reason: "git branch --list failed",
      details: { stderr: "fatal" },
    });

    const result = await advWorktreeTools.adv_worktree_cleanup.execute(
      {
        reason: "archived branch cleanup",
        mode: "archived_branches",
        dryRun: true,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Cleanup scan blocked");
    expect(mocks.deleteChangeBranch).not.toHaveBeenCalled();
  });

  test("default mode routes to queued worktree cleanup, not branch detection", async () => {
    const store = createMockStore();
    mocks.advWorktreeCleanup.mockResolvedValueOnce({
      removed: ["change/done"],
      retained: [],
    });

    const result = await advWorktreeTools.adv_worktree_cleanup.execute(
      { reason: "retry queued cleanup" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(mocks.advWorktreeCleanup).toHaveBeenCalledTimes(1);
    expect(mocks.detectArchivedMergedBranches).not.toHaveBeenCalled();
  });

  test("archived_branches mode routes target_path through target store", async () => {
    const store = createMockStore();
    mocks.detectArchivedMergedBranches.mockReturnValueOnce({
      status: "ok",
      branches: [],
    });

    const result = await advWorktreeTools.adv_worktree_cleanup.execute(
      {
        reason: "target archived branch cleanup",
        mode: "archived_branches",
        dryRun: true,
        target_path: "/target",
        target_confirmed: true,
        confirmationEvidence: "User approved target cleanup",
      },
      store,
    );

    expect(targetProjectMock.withTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        currentProjectPath: "/tmp/main",
        target_path: "/target",
        target_confirmed: true,
        confirmationEvidence: "User approved target cleanup",
        stateRequirement: "temporal-required",
      }),
      expect.any(Function),
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.mode).toBe("archived_branches");
    expect(parsed._projectContext).toMatchObject({
      root: "/target",
      projectId: "target-project",
    });
    expect(mocks.detectArchivedMergedBranches).toHaveBeenCalledWith({
      mainCheckout: "/tmp/main",
      defaultBranch: "trunk",
      archivedChangeIds: ["archived-one", "already-merged"],
    });
  });
});
