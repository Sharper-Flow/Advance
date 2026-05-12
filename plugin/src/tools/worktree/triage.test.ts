/**
 * Tests for triage.ts (T18 — Q9, KD-5 #3+#4).
 *
 * Mocks state.ts + stale-head.ts to inject deterministic fixtures.
 * Covers the 5 task scenarios:
 *   - clean state (no orphans)
 *   - stale_head detected
 *   - missing_from_temporal (disk has, registry doesn't)
 *   - missing_from_disk (registry has, disk doesn't)
 *   - archived_not_cleaned (registry has worktree backing archived change)
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { mkdtempSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";

// Mock state.ts BEFORE importing triage.
vi.mock("./state", () => ({
  initStateDb: vi.fn(async () => ({
    projectDir: "/test",
    projectId: "test-id",
  })),
  listWorktrees: vi.fn(async () => []),
  getChangeSummaries: vi.fn(async () => ({})),
}));

vi.mock("../../utils/stale-head", () => ({
  detectStaleBranchHead: vi.fn(async () => ({
    stale: false,
    reason: "on default branch",
    suggestion: "",
  })),
}));

import { triageWorktrees } from "./triage";
import { listWorktrees, getChangeSummaries } from "./state";
import { detectStaleBranchHead } from "../../utils/stale-head";

const mockedListWorktrees = vi.mocked(listWorktrees);
const mockedGetSummaries = vi.mocked(getChangeSummaries);
const mockedStaleHead = vi.mocked(detectStaleBranchHead);

describe("triageWorktrees (T18)", () => {
  let tempRoot: string;
  let repoRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "triage-test-"));
    repoRoot = join(tempRoot, "repo");
    mkdirSync(repoRoot, { recursive: true });
    execFileSync("git", ["init", "-q", "-b", "trunk", repoRoot]);
    execFileSync("git", ["config", "user.email", "t@e.com"], { cwd: repoRoot });
    execFileSync("git", ["config", "user.name", "T"], { cwd: repoRoot });
    execFileSync("git", ["commit", "--allow-empty", "-m", "root"], {
      cwd: repoRoot,
    });
    vi.clearAllMocks();
    // Reset default mocks.
    mockedListWorktrees.mockResolvedValue([]);
    mockedGetSummaries.mockResolvedValue({});
    mockedStaleHead.mockResolvedValue({
      stale: false,
      reason: "on default branch",
      suggestion: "",
    });
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("returns empty orphans on clean state", async () => {
    const result = await triageWorktrees(repoRoot);
    expect(result.total).toBe(0);
    expect(result.orphans).toEqual([]);
  });

  it("reports stale_head when detectStaleBranchHead returns stale", async () => {
    mockedStaleHead.mockResolvedValue({
      stale: true,
      reason:
        'branch "feature/old" is merged into trunk and remote branch is deleted',
      suggestion: "git switch trunk && git branch -d feature/old",
    });

    const result = await triageWorktrees(repoRoot);
    expect(result.total).toBe(1);
    expect(result.orphans[0]).toMatchObject({
      class: "stale_head",
      reason: expect.stringContaining("merged into trunk"),
      recommendedFix: "git switch trunk && git branch -d feature/old",
    });
  });

  it("reports missing_from_temporal when disk has worktree but registry doesn't", async () => {
    // Create an actual on-disk worktree on a change-named branch.
    const wtPath = join(tempRoot, "wt-orphan");
    execFileSync(
      "git",
      ["worktree", "add", "-b", "change/orphan", wtPath, "trunk"],
      { cwd: repoRoot },
    );

    mockedListWorktrees.mockResolvedValue([]); // empty registry

    const result = await triageWorktrees(repoRoot);
    const orphan = result.orphans.find(
      (o) => o.class === "missing_from_temporal",
    );
    expect(orphan).toBeDefined();
    expect(orphan?.branch).toBe("change/orphan");
    expect(orphan?.recommendedFix).toContain("adopt change/orphan");
  });

  it("reports missing_from_disk when registry has worktree but disk doesn't", async () => {
    mockedListWorktrees.mockResolvedValue([
      {
        branch: "change/ghost",
        path: "/nonexistent/path",
        changeId: "ghostchange",
        status: "active",
        createdAt: "2026-05-01T00:00:00Z",
        lastSeenAt: "2026-05-01T00:00:00Z",
        baseRef: "trunk",
        headSha: "deadbeef",
        source: "tool",
        sourceVersion: 1,
      },
    ]);

    const result = await triageWorktrees(repoRoot);
    const orphan = result.orphans.find((o) => o.class === "missing_from_disk");
    expect(orphan).toBeDefined();
    expect(orphan?.branch).toBe("change/ghost");
    expect(orphan?.recommendedFix).toContain("disk_missing change/ghost");
  });

  it("reports archived_not_cleaned when registry worktree backs archived change", async () => {
    const wtPath = join(tempRoot, "wt-archived");
    execFileSync(
      "git",
      ["worktree", "add", "-b", "change/archived", wtPath, "trunk"],
      { cwd: repoRoot },
    );

    mockedListWorktrees.mockResolvedValue([
      {
        branch: "change/archived",
        path: wtPath,
        changeId: "archivedchange",
        status: "active",
        createdAt: "2026-05-01T00:00:00Z",
        lastSeenAt: "2026-05-01T00:00:00Z",
        baseRef: "trunk",
        headSha: "deadbeef",
        source: "tool",
        sourceVersion: 1,
      },
    ]);
    mockedGetSummaries.mockResolvedValue({
      archivedchange: { status: "archived" },
    });

    const result = await triageWorktrees(repoRoot);
    const orphan = result.orphans.find(
      (o) => o.class === "archived_not_cleaned",
    );
    expect(orphan).toBeDefined();
    expect(orphan?.branch).toBe("change/archived");
    expect(orphan?.recommendedFix).toContain(
      "adv_worktree_delete change/archived",
    );
  });

  it("reports registry_missing_change_id for change worktrees without owner metadata", async () => {
    const wtPath = join(tempRoot, "wt-missing-change-id");
    execFileSync(
      "git",
      ["worktree", "add", "-b", "change/missing-id", wtPath, "trunk"],
      { cwd: repoRoot },
    );

    mockedListWorktrees.mockResolvedValue([
      {
        branch: "change/missing-id",
        path: wtPath,
        status: "active",
        createdAt: "2026-05-01T00:00:00Z",
        lastSeenAt: "2026-05-01T00:00:00Z",
        baseRef: "trunk",
        headSha: "deadbeef",
        source: "tool",
        sourceVersion: 1,
      },
    ]);

    const result = await triageWorktrees(repoRoot);
    const orphan = result.orphans.find(
      (o) => o.class === "registry_missing_change_id",
    );
    expect(orphan).toBeDefined();
    expect(orphan?.branch).toBe("change/missing-id");
    expect(orphan?.recommendedFix).toContain("repair registry metadata");
  });

  // rq-worktreeDirtyDetection01: F1 / #120 — triage must surface
  // worktrees with staged/modified/untracked files BEFORE recommending
  // deletion. Commit-graph "0 ahead of trunk" is not sufficient; the
  // index/working-tree state can contain unsaved prototype work that
  // force-delete would discard.
  describe("dirty_uncommitted_work (rq-worktreeDirtyDetection01 / #120)", () => {
    it("reports dirty_uncommitted_work when worktree has staged files", async () => {
      const wtPath = join(tempRoot, "wt-dirty-staged");
      execFileSync(
        "git",
        ["worktree", "add", "-b", "change/dirty-staged", wtPath, "trunk"],
        { cwd: repoRoot },
      );
      // Stage a file but don't commit
      execFileSync("touch", [join(wtPath, "prototype.svelte")]);
      execFileSync("git", ["add", "prototype.svelte"], { cwd: wtPath });

      // Worktree IS in registry — this isn't an orphan via other classes
      mockedListWorktrees.mockResolvedValue([
        {
          branch: "change/dirty-staged",
          path: wtPath,
          changeId: "dirtyStagedChange",
          status: "active",
          createdAt: "2026-05-01T00:00:00Z",
          lastSeenAt: "2026-05-01T00:00:00Z",
          baseRef: "trunk",
          headSha: "deadbeef",
          source: "tool",
          sourceVersion: 1,
        },
      ]);

      const result = await triageWorktrees(repoRoot);
      const orphan = result.orphans.find(
        (o) => o.class === "dirty_uncommitted_work",
      );
      expect(orphan).toBeDefined();
      expect(orphan?.branch).toBe("change/dirty-staged");
      expect(orphan?.reason).toMatch(/staged|modified|untracked/i);
      expect(orphan?.recommendedFix).toMatch(/inspect|commit|stash|review/i);
    });

    it("reports dirty_uncommitted_work for untracked files", async () => {
      const wtPath = join(tempRoot, "wt-dirty-untracked");
      execFileSync(
        "git",
        ["worktree", "add", "-b", "change/dirty-untracked", wtPath, "trunk"],
        { cwd: repoRoot },
      );
      // Untracked file — no `git add`
      execFileSync("touch", [join(wtPath, "scratch.txt")]);

      mockedListWorktrees.mockResolvedValue([
        {
          branch: "change/dirty-untracked",
          path: wtPath,
          changeId: "dirtyUntrackedChange",
          status: "active",
          createdAt: "2026-05-01T00:00:00Z",
          lastSeenAt: "2026-05-01T00:00:00Z",
          baseRef: "trunk",
          headSha: "deadbeef",
          source: "tool",
          sourceVersion: 1,
        },
      ]);

      const result = await triageWorktrees(repoRoot);
      const orphan = result.orphans.find(
        (o) => o.class === "dirty_uncommitted_work",
      );
      expect(orphan).toBeDefined();
      expect(orphan?.branch).toBe("change/dirty-untracked");
    });

    it("does NOT report dirty_uncommitted_work for clean worktrees", async () => {
      const wtPath = join(tempRoot, "wt-clean");
      execFileSync(
        "git",
        ["worktree", "add", "-b", "change/clean", wtPath, "trunk"],
        { cwd: repoRoot },
      );
      // No staged/untracked files

      mockedListWorktrees.mockResolvedValue([
        {
          branch: "change/clean",
          path: wtPath,
          changeId: "cleanChange",
          status: "active",
          createdAt: "2026-05-01T00:00:00Z",
          lastSeenAt: "2026-05-01T00:00:00Z",
          baseRef: "trunk",
          headSha: "deadbeef",
          source: "tool",
          sourceVersion: 1,
        },
      ]);

      const result = await triageWorktrees(repoRoot);
      const dirty = result.orphans.find(
        (o) => o.class === "dirty_uncommitted_work",
      );
      expect(dirty).toBeUndefined();
    });

    it("counts staged/modified/untracked file totals in the reason", async () => {
      const wtPath = join(tempRoot, "wt-dirty-counts");
      execFileSync(
        "git",
        ["worktree", "add", "-b", "change/dirty-counts", wtPath, "trunk"],
        { cwd: repoRoot },
      );
      // 3 staged + 2 untracked
      for (let i = 0; i < 3; i++) {
        execFileSync("touch", [join(wtPath, `staged-${i}.ts`)]);
        execFileSync("git", ["add", `staged-${i}.ts`], { cwd: wtPath });
      }
      for (let i = 0; i < 2; i++) {
        execFileSync("touch", [join(wtPath, `untracked-${i}.ts`)]);
      }

      mockedListWorktrees.mockResolvedValue([
        {
          branch: "change/dirty-counts",
          path: wtPath,
          changeId: "dirtyCountsChange",
          status: "active",
          createdAt: "2026-05-01T00:00:00Z",
          lastSeenAt: "2026-05-01T00:00:00Z",
          baseRef: "trunk",
          headSha: "deadbeef",
          source: "tool",
          sourceVersion: 1,
        },
      ]);

      const result = await triageWorktrees(repoRoot);
      const orphan = result.orphans.find(
        (o) => o.class === "dirty_uncommitted_work",
      );
      expect(orphan).toBeDefined();
      // Reason should mention the counts (3 staged, 2 untracked)
      expect(orphan?.reason).toMatch(/3/);
      expect(orphan?.reason).toMatch(/2/);
    });
  });
});
