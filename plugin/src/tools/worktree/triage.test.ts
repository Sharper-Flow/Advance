/**
 * Tests for triage.ts (T18 — Q9, KD-5 #3+#4).
 *
 * Mocks state.ts, branch-parser.ts, and stale-head.ts to inject deterministic fixtures.
 * Covers the current disk-authority scenarios:
 *   - clean state (no orphans)
 *   - stale_head detected
 *   - dirty_uncommitted_work (disk worktree has uncommitted files)
 *   - terminal_cleanup_retained (pending cleanup remains blocked)
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { mkdtempSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";

// Mock state.ts and branch-parser.ts BEFORE importing triage.
vi.mock("./state", () => ({
  initStateDb: vi.fn(async () => ({
    projectDir: "/test",
    projectId: "0e000d0000000000000000000000000000000000",
  })),
  getWorktreeRegistrySnapshot: vi.fn(async () => ({
    records: [],
    changeSummaries: {},
    warnings: [],
    poisonedWorkflows: [],
  })),
  listWorktrees: vi.fn(async () => []),
  getChangeSummaries: vi.fn(async () => ({})),
  getPendingDeletes: vi.fn(async () => []),
}));

vi.mock("./branch-parser", () => ({
  inferChangeIdFromBranch: vi.fn((branch: string) =>
    branch.startsWith("change/") ? branch.slice("change/".length) : null,
  ),
}));

vi.mock("../../utils/stale-head", () => ({
  detectStaleBranchHead: vi.fn(async () => ({
    stale: false,
    reason: "on default branch",
    suggestion: "",
  })),
}));

import { triageWorktrees } from "./triage";
import { getWorktreeRegistrySnapshot, getPendingDeletes } from "./state";
import { detectStaleBranchHead } from "../../utils/stale-head";
import {
  createInventoryBudget,
  type InventoryBudget,
} from "./inventory-budget";

const mockedRegistrySnapshot = vi.mocked(getWorktreeRegistrySnapshot);
const mockedGetPendingDeletes = vi.mocked(getPendingDeletes);
const mockedStaleHead = vi.mocked(detectStaleBranchHead);

type SnapshotRecord = Awaited<
  ReturnType<typeof getWorktreeRegistrySnapshot>
>["records"][number];

function mockRegistrySnapshot(
  records: SnapshotRecord[],
  changeSummaries: Awaited<
    ReturnType<typeof getWorktreeRegistrySnapshot>
  >["changeSummaries"] = {},
): void {
  mockedRegistrySnapshot.mockResolvedValue({
    records,
    changeSummaries,
    warnings: [],
    poisonedWorkflows: [],
  });
}

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
    mockedRegistrySnapshot.mockResolvedValue({
      records: [],
      changeSummaries: {},
      warnings: [],
      poisonedWorkflows: [],
    });
    mockedGetPendingDeletes.mockResolvedValue([]);
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
      mockRegistrySnapshot([
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

      mockRegistrySnapshot([
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

      mockRegistrySnapshot([
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

      mockRegistrySnapshot([
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

  it("reports retained terminal cleanup pending deletes with exact branch path and blocker", async () => {
    mockedGetPendingDeletes.mockResolvedValue([
      {
        branch: "change/live-terminal",
        path: "/tmp/live-terminal",
        reason: "worktree is still in use by a running process",
        recordedAt: "2026-05-21T00:00:00.000Z",
        attempts: 3,
      },
    ]);

    const result = await triageWorktrees(repoRoot);

    expect(result.orphans).toContainEqual(
      expect.objectContaining({
        class: "terminal_cleanup_retained",
        branch: "change/live-terminal",
        path: "/tmp/live-terminal",
        reason: expect.stringContaining("worktree is still in use"),
        recommendedFix: expect.stringContaining("adv_worktree_cleanup"),
      }),
    );
  });

  describe("bounded inventory (budget-aware triage)", () => {
    function makeSequenceBudget(allowFirstN: number): InventoryBudget {
      let calls = 0;
      const controller = new AbortController();
      return {
        signal: controller.signal,
        canStartInspection() {
          return ++calls <= allowFirstN;
        },
        stopReason() {
          return calls > allowFirstN ? "internal_budget_exhausted" : undefined;
        },
        snapshot() {
          return calls > allowFirstN
            ? {
                complete: false,
                stopReason: "internal_budget_exhausted" as const,
              }
            : { complete: true };
        },
        dispose() {},
      };
    }

    it("returns complete true when no budget is exhausted", async () => {
      const result = await triageWorktrees(repoRoot);
      expect(result.complete).toBe(true);
      expect(result.stopReason).toBeUndefined();
    });

    it("returns incomplete when budget is exhausted before any inspection", async () => {
      const budget = createInventoryBudget({ timeoutMs: 0 });
      const result = await triageWorktrees(repoRoot, undefined, { budget });

      expect(result.complete).toBe(false);
      expect(result.stopReason).toBe("internal_budget_exhausted");
      expect(result.stoppedStage).toBe("stale_head");
      expect(result.orphans).toHaveLength(0);
      expect(result.omitted).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ scope: "stale_head" }),
          expect.objectContaining({ scope: "init_state" }),
        ]),
      );
    });

    it("preserves inspected dirty work and omits remaining worktrees when budget stops mid-collection", async () => {
      // Two change worktrees. The first is dirty and inspected; the second is
      // omitted when the budget closes admission.
      execFileSync(
        "git",
        ["worktree", "add", "-b", "change/a", join(tempRoot, "wt-a"), "trunk"],
        { cwd: repoRoot },
      );
      execFileSync(
        "git",
        ["worktree", "add", "-b", "change/b", join(tempRoot, "wt-b"), "trunk"],
        { cwd: repoRoot },
      );
      execFileSync("touch", [join(tempRoot, "wt-a", "unsaved.ts")]);
      mockRegistrySnapshot([]);

      // Allow stale_head, init_state, disk_list, and one dirty-worktree
      // inspection.
      const budget = makeSequenceBudget(4);

      const result = await triageWorktrees(repoRoot, undefined, { budget });

      expect(result.complete).toBe(false);
      expect(result.stopReason).toBe("internal_budget_exhausted");
      // Exactly one inspected dirty-work orphan.
      const inspected = result.orphans.filter(
        (o) => o.class === "dirty_uncommitted_work",
      );
      expect(inspected).toHaveLength(1);
      // The remaining worktree is explicitly omitted, not classified as clean.
      expect(result.omitted).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            scope: "dirty_uncommitted_work",
            branch: "change/b",
          }),
        ]),
      );
      // No orphan was emitted for the omitted worktree.
      const orphanBranches = result.orphans.map((o) => o.branch);
      expect(orphanBranches).not.toContain("change/b");
    });

    it("propagates a caller abort signal as the stop reason", async () => {
      const caller = new AbortController();
      caller.abort("caller aborted");
      const result = await triageWorktrees(repoRoot, undefined, {
        callerSignal: caller.signal,
      });

      expect(result.complete).toBe(false);
      expect(result.stopReason).toBe("caller_cancelled");
    });
  });
});
