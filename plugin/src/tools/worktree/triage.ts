/**
 * Worktree Triage (T18 — Q9, KD-5 #3+#4 detection layer).
 *
 * Read-only inventory + advisory recommendations. NO auto-fix (per Q9 LBP
 * decision: triage surfaces drift; user/operator chooses remediation).
 *
 * Detects orphan classes from real local state:
 *   - Disk: `git worktree list --porcelain`
 *   - Local git: `detectStaleBranchHead` for stale-HEAD detection
 *   - Index/working tree: `git status --porcelain` for dirty-work detection
 *
 * | Class                       | Detection                                              |
 * |-----------------------------|--------------------------------------------------------|
 * | `stale_head`                | `detectStaleBranchHead` returns stale                  |
 * | `dirty_uncommitted_work`    | Worktree has staged/modified/untracked files           |
 *
 * Citations: rq-worktreeRegistry01, rq-multiSessionFraming01,
 *            rq-worktreeDirtyDetection01 (#120).
 */

import {
  initStateDb,
  getPendingDeletes,
  type WorktreeStateAccess,
} from "./state";
import { inferChangeIdFromBranch } from "./branch-parser";
import { detectStaleBranchHead } from "../../utils/stale-head";
import { execFileGitAsync } from "../../utils/git-binary";
import { resolve } from "path";
import {
  parseWorktreeListPorcelain,
  type DiskWorktree,
} from "./porcelain-parser";
import {
  createInventoryBudget,
  type InventoryBudget,
  type InventoryStopReason,
} from "./inventory-budget";

// =============================================================================
// Public types
// =============================================================================

export type OrphanClass =
  | "stale_head"
  | "dirty_uncommitted_work"
  | "terminal_cleanup_retained";

export interface OrphanRecord {
  class: OrphanClass;
  branch?: string;
  path?: string;
  reason: string;
  recommendedFix: string;
}

export interface OmittedScope {
  scope: string;
  branch?: string;
  path?: string;
  reason: string;
}

export interface TriageResult {
  orphans: OrphanRecord[];
  total: number;
  complete?: boolean;
  stopReason?: InventoryStopReason;
  stoppedStage?: string;
  inspectedCount?: number;
  candidateCount?: number;
  omitted?: OmittedScope[];
  stageTimings?: Record<string, number>;
}

export interface TriageOptions {
  currentProjectRoot?: string;
  callerSignal?: AbortSignal;
  timeoutMs?: number;
  budget?: InventoryBudget;
}

// =============================================================================
// Helpers
// =============================================================================

function isTargetProjectTriage(
  repoRoot: string,
  options?: TriageOptions,
): boolean {
  return Boolean(
    options?.currentProjectRoot &&
    resolve(options.currentProjectRoot) !== resolve(repoRoot),
  );
}

function targetArgsSuffix(repoRoot: string, targetProject: boolean): string {
  return targetProject
    ? ` target_path: "${repoRoot}" target_confirmed: true confirmationEvidence: "<target cleanup approval>"`
    : "";
}

function cleanupFix(repoRoot: string, targetProject: boolean): string {
  return `adv_worktree_cleanup${targetArgsSuffix(repoRoot, targetProject)}`;
}

/**
 * Parse `git worktree list --porcelain` output. Each worktree block is
 * separated by a blank line; the first line of each block is `worktree
 * <path>`, followed by `HEAD <sha>` and either `branch refs/heads/<name>`
 * or `detached`.
 */
async function listDiskWorktrees(repoRoot: string): Promise<DiskWorktree[]> {
  let stdout: string;
  try {
    const result = await execFileGitAsync(
      ["worktree", "list", "--porcelain", "-z"],
      { cwd: repoRoot },
    );
    stdout = result.stdout;
  } catch {
    return [];
  }

  return parseWorktreeListPorcelain(stdout);
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Run worktree triage and return a structured advisory result.
 * Read-only — never mutates state. NO auto-fix.
 *
 * @param repoRoot — absolute path to the project's main checkout. Used
 *                   for `git worktree list` enumeration + stale-HEAD check.
 * @param accessOverride — optional `WorktreeStateAccess` (for tests).
 *                          Production callers omit this; the function
 *                          calls `initStateDb(repoRoot)` itself.
 */
export async function triageWorktrees(
  repoRoot: string,
  accessOverride?: WorktreeStateAccess,
  options?: TriageOptions,
): Promise<TriageResult> {
  let ownBudget: InventoryBudget | undefined;
  let budget = options?.budget;
  if (!budget && (options?.callerSignal || options?.timeoutMs !== undefined)) {
    ownBudget = createInventoryBudget({
      callerSignal: options.callerSignal,
      timeoutMs: options.timeoutMs,
    });
    budget = ownBudget;
  }

  try {
    return await collectTriage(repoRoot, accessOverride, options, budget);
  } finally {
    ownBudget?.dispose();
  }
}

async function collectTriage(
  repoRoot: string,
  accessOverride: WorktreeStateAccess | undefined,
  options: TriageOptions | undefined,
  budget: InventoryBudget | undefined,
): Promise<TriageResult> {
  const orphans: OrphanRecord[] = [];
  const targetProject = isTargetProjectTriage(repoRoot, options);

  const stageTimings: Record<string, number> = {};
  let stageStart = performance.now();
  let currentStage = "start";
  let stoppedStage: string | undefined;
  const omitted: OmittedScope[] = [];
  let candidateCount = 0;
  let inspectedCount = 0;

  function enterStage(stage: string) {
    const now = performance.now();
    if (currentStage !== stage) {
      stageTimings[currentStage] = Number((now - stageStart).toFixed(3));
      currentStage = stage;
      stageStart = now;
    }
  }

  function admit(stage: string): boolean {
    enterStage(stage);
    if (!budget) return true;
    const ok = budget.canStartInspection();
    if (!ok && !stoppedStage) stoppedStage = stage;
    return ok;
  }

  function buildResult({ orphans }: { orphans: OrphanRecord[] }): TriageResult {
    enterStage("complete");
    const snap = budget?.snapshot();
    const complete = snap?.complete ?? true;
    return {
      orphans,
      total: orphans.length,
      complete,
      stopReason: snap?.stopReason,
      stoppedStage: complete ? undefined : (stoppedStage ?? currentStage),
      inspectedCount,
      candidateCount,
      omitted: omitted.length > 0 ? omitted : undefined,
      stageTimings,
    };
  }

  // 1. Stale HEAD on main checkout.
  if (!admit("stale_head")) {
    omitted.push({
      scope: "stale_head",
      reason: "inventory budget exhausted",
    });
  } else {
    const stale = await detectStaleBranchHead(repoRoot).catch(() => null);
    if (stale && stale.stale) {
      orphans.push({
        class: "stale_head",
        reason: stale.reason,
        recommendedFix: stale.suggestion,
      });
      inspectedCount += 1;
    }
  }

  // 2. Enumerate local worktrees. Workflow/registry divergence repair was
  // removed with the workflow-backed registry; Git is now the authority.
  let access: WorktreeStateAccess;
  if (!admit("init_state")) {
    omitted.push({
      scope: "init_state",
      reason: "inventory budget exhausted",
    });
    return buildResult({ orphans });
  }
  try {
    access = accessOverride ?? (await initStateDb(repoRoot));
  } catch {
    return buildResult({ orphans });
  }

  let diskList: DiskWorktree[] = [];
  if (!admit("disk_list")) {
    omitted.push({
      scope: "disk_list",
      reason: "inventory budget exhausted",
    });
  } else {
    diskList = await listDiskWorktrees(repoRoot);
  }

  candidateCount = diskList.length;

  // dirty_uncommitted_work (rq-worktreeDirtyDetection01 / #120): any disk
  // worktree (other than the main checkout) with staged, modified, or
  // untracked files. Surfaced BEFORE any deletion recommendation so the
  // operator can review the unsaved work first. The 3-condition deletion
  // gate already blocks dirty worktrees, but triage callers see only
  // commit-graph signals — adding this class makes the dirty state visible
  // at recommendation time rather than at delete failure time.
  for (const dw of diskList) {
    if (!dw.branch) continue;
    // Skip the main checkout — only flag named-branch worktrees we manage.
    // (Convention: ADV-managed worktrees use `change/...` branches.)
    if (!dw.branch || !inferChangeIdFromBranch(dw.branch)) continue;
    if (!admit("dirty_uncommitted_work")) {
      omitted.push({
        scope: "dirty_uncommitted_work",
        branch: dw.branch,
        path: dw.path,
        reason: "inventory budget exhausted",
      });
      continue;
    }
    const dirty = await getWorktreeDirtySummary(dw.path);
    inspectedCount += 1;
    if (!dirty) continue; // git status failed or path missing
    if (dirty.staged === 0 && dirty.modified === 0 && dirty.untracked === 0) {
      continue;
    }
    orphans.push({
      class: "dirty_uncommitted_work",
      branch: dw.branch,
      path: dw.path,
      reason:
        `Worktree at ${dw.path} has uncommitted work: ` +
        `${dirty.staged} staged, ${dirty.modified} modified, ${dirty.untracked} untracked. ` +
        `Force-deleting it would discard this work.`,
      recommendedFix:
        `Inspect first: \`cd ${dw.path} && git status\`. ` +
        `Commit, stash, or review before deletion.`,
    });
  }

  // pending deletes
  if (!admit("pending_deletes")) {
    omitted.push({
      scope: "pending_deletes",
      reason: "inventory budget exhausted",
    });
  } else {
    const pendingDeletes = await getPendingDeletes(access).catch(() => []);
    for (const pendingDelete of pendingDeletes) {
      orphans.push({
        class: "terminal_cleanup_retained",
        branch: pendingDelete.branch,
        path: pendingDelete.path,
        reason:
          `Terminal cleanup retained ${pendingDelete.branch}: ${pendingDelete.reason}. ` +
          `Attempts: ${pendingDelete.attempts}.`,
        recommendedFix: `Resolve the blocker, then run ${cleanupFix(repoRoot, targetProject)} for ${pendingDelete.branch}.`,
      });
    }
    inspectedCount += pendingDeletes.length;
  }

  return buildResult({ orphans });
}

// =============================================================================
// Dirty-state detection
// =============================================================================

interface WorktreeDirtySummary {
  staged: number;
  modified: number;
  untracked: number;
}

/**
 * Run `git status --porcelain` in the worktree and classify the output.
 *
 * Porcelain v1 format: `XY filename` where X is the index state and Y is
 * the working-tree state. `??` is untracked. `!!` is ignored (we don't
 * surface ignored files here).
 *
 * Returns null if the path doesn't exist or git status fails — the caller
 * skips silently. We do NOT treat a failure as evidence of cleanliness.
 */
async function getWorktreeDirtySummary(
  worktreePath: string,
): Promise<WorktreeDirtySummary | null> {
  let stdout: string;
  try {
    const result = await execFileGitAsync(["status", "--porcelain"], {
      cwd: worktreePath,
    });
    stdout = result.stdout;
  } catch {
    return null;
  }

  let staged = 0;
  let modified = 0;
  let untracked = 0;
  for (const line of stdout.split("\n")) {
    if (line.length === 0) continue;
    // Porcelain v1 lines are at least 3 chars wide: "XY filename".
    if (line.length < 3) continue;
    const x = line.charAt(0);
    const y = line.charAt(1);
    if (x === "?" && y === "?") {
      untracked += 1;
      continue;
    }
    if (x === "!" && y === "!") {
      // ignored — skip
      continue;
    }
    if (x !== " " && x !== "?") staged += 1;
    if (y !== " " && y !== "?") modified += 1;
  }
  return { staged, modified, untracked };
}
