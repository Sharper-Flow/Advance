import { beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtemp, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { advWorktreeTools } from "./adv-worktree";
import type { Change } from "../types";
import type { Store } from "../storage/store-types";

const mocks = vi.hoisted(() => ({
  resolveRepoRoot: vi.fn(() => "/tmp/main"),
  detectDefaultBranch: vi.fn(() => ({ branch: "trunk", source: "test" })),
  detectArchivedMergedBranches: vi.fn(() => ({
    status: "ok",
    branches: [] as Array<Record<string, unknown>>,
  })),
  listLocalChangeBranchEntries: vi.fn(() => ({
    status: "ok",
    entries: [
      {
        changeId: "archived-one",
        branch: "change/archived-one",
        localSha: "sha-one",
      },
      {
        changeId: "already-merged",
        branch: "change/already-merged",
        localSha: "sha-merged",
      },
    ] as Array<{ changeId: string; branch: string; localSha: string }>,
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
    resolveRepoRoot: mocks.resolveRepoRoot,
    detectDefaultBranch: mocks.detectDefaultBranch,
    detectArchivedMergedBranches: mocks.detectArchivedMergedBranches,
    listLocalChangeBranchEntries: mocks.listLocalChangeBranchEntries,
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

/** Build a listLocalChangeBranchEntries "ok" result from change ids. */
function localEntries(ids: string[]) {
  return {
    status: "ok" as const,
    entries: ids.map((id) => ({
      changeId: id,
      branch: `change/${id}`,
      localSha: `sha-${id}`,
    })),
  };
}

async function withArchiveDirs<T>(
  ids: string[],
  fn: (archiveDir: string) => Promise<T>,
): Promise<T> {
  const archiveDir = await mkdtemp(join(tmpdir(), "adv-archived-branches-"));
  await Promise.all(
    ids.map((id) => mkdir(join(archiveDir, id), { recursive: true })),
  );
  try {
    return await fn(archiveDir);
  } finally {
    await rm(archiveDir, { recursive: true, force: true });
  }
}

async function withMissingArchiveDir<T>(
  fn: (archiveDir: string) => Promise<T>,
): Promise<T> {
  const archiveDir = await mkdtemp(join(tmpdir(), "adv-archived-branches-"));
  await rm(archiveDir, { recursive: true, force: true });
  return fn(archiveDir);
}

function createMockStore(
  changes: Change[] = [
    archivedChange("archived-one"),
    archivedChange("already-merged"),
  ],
  archiveDir = "/tmp/missing-adv-archive",
): Store {
  const byId = new Map(changes.map((c) => [c.id, c]));
  return {
    paths: { root: "/tmp/main", archive: archiveDir },
    changes: {
      // rq-archivedBranchCleanupInversion01: the helper must NOT enumerate the
      // archive via list(); it verifies archived status per-id via get().
      list: vi.fn(async () => ({ changes })),
      get: vi.fn(async (id: string) =>
        byId.has(id)
          ? { success: true as const, data: byId.get(id)! }
          : {
              success: false as const,
              type: "not_found" as const,
              error: `Change not found: ${id}`,
            },
      ),
    },
  } as unknown as Store;
}

describe("adv_worktree_cleanup mode=archived_branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveRepoRoot.mockReturnValue("/tmp/main");
    mocks.detectDefaultBranch.mockReturnValue({
      branch: "trunk",
      source: "test",
    });
    mocks.listLocalChangeBranchEntries.mockReturnValue(
      localEntries(["archived-one", "already-merged"]),
    );
    mocks.getCheckedOutChangeBranches.mockReturnValue({
      status: "ok",
      branches: new Set<string>(),
      worktreePaths: {},
    });
    mocks.deleteChangeBranch.mockReturnValue({
      localDeleted: true,
      remoteDeleted: true,
    });
    mocks.execGit.mockResolvedValue("");
    targetProjectMock.withTargetPathStore.mockImplementation(
      async (_input: unknown, fn: (arg: unknown) => unknown) =>
        fn({
          context: {
            root: "/target",
            projectId: "0a00e00000ec0000000000000000000000000000",
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

    // Every synchronous git phase receives an injected, bounded runner. This
    // includes setup and the worktree safety filter, not only merge detection.
    expect(mocks.resolveRepoRoot).toHaveBeenCalledWith(
      "/tmp/main",
      expect.objectContaining({ runGit: expect.any(Function) }),
    );
    expect(mocks.detectDefaultBranch).toHaveBeenCalledWith(
      "/tmp/main",
      expect.objectContaining({ runGit: expect.any(Function) }),
    );
    expect(mocks.detectArchivedMergedBranches).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ runGit: expect.any(Function) }),
    );
    expect(mocks.getCheckedOutChangeBranches).toHaveBeenCalledWith(
      "/tmp/main",
      expect.objectContaining({ runGit: expect.any(Function) }),
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
    // detect is still called with archivedChangeIds:string[], now built
    // per-local-branch. A second deps arg (bounded runGit) is now present.
    expect(mocks.detectArchivedMergedBranches).toHaveBeenCalledWith(
      {
        repoRoot: "/tmp/main",
        defaultBranch: "trunk",
        archivedChangeIds: ["archived-one", "already-merged"],
      },
      expect.objectContaining({ runGit: expect.any(Function) }),
    );
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

  test("dryRun returns candidates without deleting and skips the fetch", async () => {
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
    // AC2: no fetch on dryRun.
    expect(mocks.execGit).not.toHaveBeenCalled();
  });

  test("wet-run deletes safe candidates via deleteChangeBranch and fetches", async () => {
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
    // AC3: wet runs attempt a bounded fetch.
    expect(mocks.execGit).toHaveBeenCalledWith(
      ["fetch", "origin", "trunk"],
      "/tmp/main",
      expect.any(Number),
    );
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

  test("filters non-archived changes and records a not_archived omission", async () => {
    const store = createMockStore([
      archivedChange("X"),
      { ...archivedChange("Y"), status: "draft" } as Change,
    ]);
    mocks.listLocalChangeBranchEntries.mockReturnValueOnce(
      localEntries(["X", "Y"]),
    );
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
    expect(mocks.detectArchivedMergedBranches).toHaveBeenCalledWith(
      {
        repoRoot: "/tmp/main",
        defaultBranch: "trunk",
        archivedChangeIds: ["X"],
      },
      expect.objectContaining({ runGit: expect.any(Function) }),
    );
    expect(parsed.omissions).toEqual([
      expect.objectContaining({
        changeId: "Y",
        branch: "change/Y",
        reason: "not_archived",
      }),
    ]);
    // A not_archived-only scan is complete, not partial (LBP-7).
    expect(parsed.partial).toBeUndefined();
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

  test("changeId arg restricts to single archived change via one get", async () => {
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
    expect(mocks.detectArchivedMergedBranches).toHaveBeenCalledWith(
      {
        repoRoot: "/tmp/main",
        defaultBranch: "trunk",
        archivedChangeIds: ["X"],
      },
      expect.objectContaining({ runGit: expect.any(Function) }),
    );
    // changeId fast path verifies just that id — no local branch enumeration.
    expect(mocks.listLocalChangeBranchEntries).not.toHaveBeenCalled();
    expect(store.changes.get as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "X",
    );
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

  test("fails closed when local branch enumeration is blocked", async () => {
    const store = createMockStore();
    mocks.listLocalChangeBranchEntries.mockReturnValueOnce({
      status: "blocked",
      reason: "LOCAL_BRANCH_LIST_FAILED",
      details: ["fatal: not a git repository"],
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
    expect(mocks.detectArchivedMergedBranches).not.toHaveBeenCalled();
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
        stateRequirement: "authoritative",
      }),
      expect.any(Function),
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.mode).toBe("archived_branches");
    expect(parsed._projectContext).toMatchObject({
      root: "/target",
      projectId: "0a00e00000ec0000000000000000000000000000",
    });
    expect(mocks.detectArchivedMergedBranches).toHaveBeenCalledWith(
      {
        repoRoot: "/tmp/main",
        defaultBranch: "trunk",
        archivedChangeIds: ["archived-one", "already-merged"],
      },
      expect.objectContaining({ runGit: expect.any(Function) }),
    );
  });

  // ---- rq-archivedBranchCleanupInversion01 new coverage ----

  test("residual path does not call store.changes.list and gets per local branch", async () => {
    const store = createMockStore();
    mocks.detectArchivedMergedBranches.mockReturnValueOnce({
      status: "ok",
      branches: [],
    });

    await advWorktreeTools.adv_worktree_cleanup.execute(
      {
        reason: "archived branch cleanup",
        mode: "archived_branches",
        dryRun: true,
      },
      store,
    );

    expect(
      store.changes.list as ReturnType<typeof vi.fn>,
    ).not.toHaveBeenCalled();
    const get = store.changes.get as ReturnType<typeof vi.fn>;
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledWith("archived-one");
    expect(get).toHaveBeenCalledWith("already-merged");
  });

  test("residual per-id status reads respect the concurrency cap of 8", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `arch-${i}`);
    const store = createMockStore(ids.map((id) => archivedChange(id)));
    mocks.listLocalChangeBranchEntries.mockReturnValueOnce(localEntries(ids));
    mocks.detectArchivedMergedBranches.mockReturnValueOnce({
      status: "ok",
      branches: [],
    });

    let inFlight = 0;
    let maxInFlight = 0;
    const byId = new Map(ids.map((id) => [id, archivedChange(id)]));
    (store.changes.get as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { success: true as const, data: byId.get(id)! };
      },
    );

    await advWorktreeTools.adv_worktree_cleanup.execute(
      {
        reason: "archived branch cleanup",
        mode: "archived_branches",
        dryRun: true,
      },
      store,
    );

    expect(maxInFlight).toBeGreaterThan(0);
    expect(maxInFlight).toBeLessThanOrEqual(8);
  });

  test("archive membership wins over a stale active projection", async () => {
    await withArchiveDirs(["stale-archived"], async (archiveDir) => {
      const store = createMockStore(
        [{ ...archivedChange("stale-archived"), status: "draft" } as Change],
        archiveDir,
      );
      mocks.listLocalChangeBranchEntries.mockReturnValueOnce(
        localEntries(["stale-archived"]),
      );
      mocks.detectArchivedMergedBranches.mockReturnValueOnce({
        status: "ok",
        branches: [
          {
            changeId: "stale-archived",
            branch: "change/stale-archived",
            localSha: "sha-stale-archived",
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
      expect(parsed.candidates).toHaveLength(1);
      expect(parsed.candidates[0].changeId).toBe("stale-archived");
      expect(parsed.omissions).toBeUndefined();
      expect(store.changes.get).not.toHaveBeenCalled();
    });
  });

  test("residual missing projection remains a lookup_failed omission", async () => {
    await withArchiveDirs(["different-archived"], async (archiveDir) => {
      const store = createMockStore([], archiveDir);
      mocks.listLocalChangeBranchEntries.mockReturnValueOnce(
        localEntries(["residual-ghost"]),
      );
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
      expect(parsed.partial).toBe(true);
      expect(parsed.omissions).toEqual([
        expect.objectContaining({
          changeId: "residual-ghost",
          reason: "lookup_failed",
          detail: "not_found",
        }),
      ]);
      expect(store.changes.get).toHaveBeenCalledWith("residual-ghost");
    });
  });

  test("archive-first scan stays complete with 90 archived branches and 10 residuals", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `bulk-${i}`);
    const archivedIds = ids.slice(0, 90);
    const residualIds = ids.slice(90);

    await withArchiveDirs(archivedIds, async (archiveDir) => {
      const store = createMockStore([], archiveDir);
      mocks.listLocalChangeBranchEntries.mockReturnValueOnce(localEntries(ids));
      (store.changes.get as ReturnType<typeof vi.fn>).mockImplementation(
        async (id: string) => ({
          success: true as const,
          data: { ...archivedChange(id), status: "draft" } as Change,
        }),
      );
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
      expect(parsed.partial).toBeUndefined();
      expect(parsed.omissions).toHaveLength(residualIds.length);
      expect(parsed.omissions).toEqual(
        expect.arrayContaining(
          residualIds.map((changeId) =>
            expect.objectContaining({ changeId, reason: "not_archived" }),
          ),
        ),
      );
      expect(store.changes.get).toHaveBeenCalledTimes(residualIds.length);
    });
  });

  test("archive directory read failure falls back to per-id status reads", async () => {
    await withMissingArchiveDir(async (archiveDir) => {
      const store = createMockStore([archivedChange("fallback")], archiveDir);
      mocks.listLocalChangeBranchEntries.mockReturnValueOnce(
        localEntries(["fallback"]),
      );
      mocks.detectArchivedMergedBranches.mockReturnValueOnce({
        status: "ok",
        branches: [
          {
            changeId: "fallback",
            branch: "change/fallback",
            localSha: "sha-fallback",
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
      expect(parsed.candidates).toHaveLength(1);
      expect(parsed.candidates[0].changeId).toBe("fallback");
      expect(store.changes.get).toHaveBeenCalledWith("fallback");
    });
  });

  test("AC5: schema_error lookup surfaces as a lookup_failed omission and partial", async () => {
    const store = createMockStore([archivedChange("good")]);
    mocks.listLocalChangeBranchEntries.mockReturnValueOnce(
      localEntries(["good", "broken"]),
    );
    (store.changes.get as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) =>
        id === "good"
          ? { success: true as const, data: archivedChange("good") }
          : {
              success: false as const,
              type: "schema_error" as const,
              error: 'Schema validation failed for change "broken"',
            },
    );
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
    expect(parsed.partial).toBe(true);
    expect(parsed.omissions).toEqual([
      expect.objectContaining({
        changeId: "broken",
        reason: "lookup_failed",
        detail: "schema_error",
      }),
    ]);
    expect(mocks.detectArchivedMergedBranches).toHaveBeenCalledWith(
      expect.objectContaining({ archivedChangeIds: ["good"] }),
      expect.anything(),
    );
  });

  test("AC5: not_found lookup surfaces as a lookup_failed omission", async () => {
    const store = createMockStore([archivedChange("present")]);
    mocks.listLocalChangeBranchEntries.mockReturnValueOnce(
      localEntries(["present", "ghost"]),
    );
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
    expect(parsed.partial).toBe(true);
    expect(parsed.omissions).toEqual([
      expect.objectContaining({
        changeId: "ghost",
        reason: "lookup_failed",
        detail: "not_found",
      }),
    ]);
  });

  test("AC5: null projection surfaces as a lookup_failed omission (fail-closed)", async () => {
    const store = createMockStore([archivedChange("present")]);
    mocks.listLocalChangeBranchEntries.mockReturnValueOnce(
      localEntries(["present", "nullish"]),
    );
    (store.changes.get as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) =>
        id === "present"
          ? { success: true as const, data: archivedChange("present") }
          : { success: true as const, data: null },
    );
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
    expect(parsed.partial).toBe(true);
    expect(parsed.omissions).toEqual([
      expect.objectContaining({
        changeId: "nullish",
        reason: "lookup_failed",
        detail: "null projection",
      }),
    ]);
  });

  test("AC3: wet-run fetch failure degrades to a warning and still returns candidates", async () => {
    const store = createMockStore();
    mocks.execGit.mockRejectedValueOnce(new Error("fetch timed out"));
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

    const result = await advWorktreeTools.adv_worktree_cleanup.execute(
      { reason: "archived branch cleanup", mode: "archived_branches" },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.warnings).toEqual([
      expect.stringContaining("Best-effort default-branch fetch failed"),
    ]);
  });

  test("AC4: caller timeoutMs above the safe budget is clamped and reported", async () => {
    const store = createMockStore();
    mocks.detectArchivedMergedBranches.mockReturnValueOnce({
      status: "ok",
      branches: [],
    });

    const result = await advWorktreeTools.adv_worktree_cleanup.execute(
      {
        reason: "archived branch cleanup",
        mode: "archived_branches",
        dryRun: true,
        timeoutMs: 60_000,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.effectiveTimeoutMs).toBe(45_000);
    expect(parsed.timeoutNote).toContain("clamped to safe budget");
  });

  test("AC4: per-id lookup timeout yields a self-partial result, not a hard timeout", async () => {
    const store = createMockStore([archivedChange("slow")]);
    mocks.listLocalChangeBranchEntries.mockReturnValueOnce(
      localEntries(["slow"]),
    );
    // Never resolves → the helper's per-item withTimeout must fire.
    (store.changes.get as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}),
    );
    mocks.detectArchivedMergedBranches.mockReturnValueOnce({
      status: "ok",
      branches: [],
    });

    const result = await advWorktreeTools.adv_worktree_cleanup.execute(
      {
        reason: "archived branch cleanup",
        mode: "archived_branches",
        dryRun: true,
        // Small but > per-item floor so the item timeout fires inside budget.
        timeoutMs: 1_200,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.timedOut).toBeUndefined();
    expect(parsed.partial).toBe(true);
    expect(parsed.omissions).toEqual([
      expect.objectContaining({
        changeId: "slow",
        reason: "deadline_exceeded",
      }),
    ]);
  }, 10_000);
});
