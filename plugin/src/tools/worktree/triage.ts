/**
 * Worktree Triage (T18 — Q9, KD-5 #3+#4 detection layer).
 *
 * Read-only inventory + advisory recommendations. NO auto-fix (per Q9 LBP
 * decision: triage surfaces drift; user/operator chooses remediation).
 *
 * Detects orphan classes by comparing three sources of truth:
 *   - Disk: `git worktree list --porcelain`
 *   - Temporal: `worktree_registry` from project workflow state
 *   - Temporal: `change_summaries[].status` for archived-not-cleaned check
 *   - Local git: `detectStaleBranchHead` for stale-HEAD detection
 *   - Index/working tree: `git status --porcelain` for dirty-work detection
 *
 * | Class                       | Detection                                              |
 * |-----------------------------|--------------------------------------------------------|
 * | `stale_head`                | `detectStaleBranchHead` returns stale                  |
 * | `missing_from_temporal`     | Disk has worktree, registry doesn't                    |
 * | `missing_from_temporal_unmerged` | Disk has unregistered worktree with unmerged commits |
 * | `missing_from_disk`         | Registry has, disk doesn't                             |
 * | `registry_missing_change_id`| Registry has change branch without owner metadata      |
 * | `archived_not_cleaned`      | Registry has worktree for archived change              |
 * | `dirty_uncommitted_work`    | Worktree has staged/modified/untracked files           |
 *
 * Citations: rq-worktreeRegistry01, rq-multiSessionFraming01,
 *            rq-worktreeDirtyDetection01 (#120).
 */

import {
  initStateDb,
  getWorktreeRegistrySnapshot,
  getPendingDeletes,
  type WorktreeStateAccess,
  type WorktreeCrossChangeWarning,
} from "./state";
import { detectStaleBranchHead } from "../../utils/stale-head";
import { CHANGE_BRANCH_PREFIX } from "../../temporal/contracts";
import { execFileGitAsync } from "../../utils/git-binary";
import { getDefaultBranch } from "../../utils/git";
import { resolve } from "path";
import {
  parseWorktreeListPorcelain,
  type DiskWorktree,
} from "./porcelain-parser";

// =============================================================================
// Public types
// =============================================================================

export type OrphanClass =
  | "stale_head"
  | "missing_from_temporal"
  | "missing_from_temporal_unmerged"
  | "missing_from_disk"
  | "registry_missing_change_id"
  | "archived_not_cleaned"
  | "dirty_uncommitted_work"
  | "terminal_cleanup_retained";

export interface OrphanRecord {
  class: OrphanClass;
  branch?: string;
  path?: string;
  reason: string;
  recommendedFix: string;
}

export interface TriageResult {
  orphans: OrphanRecord[];
  total: number;
  warnings?: WorktreeCrossChangeWarning[];
}

export interface TriageOptions {
  currentProjectRoot?: string;
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

function deleteFix(
  branch: string | undefined,
  repoRoot: string,
  targetProject: boolean,
): string {
  return `adv_worktree_delete ${branch ?? "<branch>"}${targetArgsSuffix(repoRoot, targetProject)}`;
}

function cleanupFix(repoRoot: string, targetProject: boolean): string {
  return `adv_worktree_cleanup${targetArgsSuffix(repoRoot, targetProject)}`;
}

interface BranchReachability {
  unmerged: boolean;
  defaultBranch?: string;
  aheadCount?: number;
}

async function detectUnmergedBranch(
  repoRoot: string,
  branch: string,
): Promise<BranchReachability> {
  try {
    const defaultBranch = await getDefaultBranch(repoRoot);

    // Prove both refs exist before interpreting rev-list output. Unknown
    // reachability must preserve the legacy `missing_from_temporal` class
    // rather than over-classifying.
    await execFileGitAsync(
      ["rev-parse", "--verify", `${defaultBranch}^{commit}`],
      {
        cwd: repoRoot,
      },
    );
    await execFileGitAsync(["rev-parse", "--verify", `${branch}^{commit}`], {
      cwd: repoRoot,
    });

    const { stdout } = await execFileGitAsync(
      ["rev-list", "--count", `${defaultBranch}..${branch}`],
      { cwd: repoRoot },
    );
    const aheadCount = Number.parseInt(stdout.trim(), 10);
    if (!Number.isFinite(aheadCount) || aheadCount <= 0) {
      return { unmerged: false, defaultBranch, aheadCount: 0 };
    }
    return { unmerged: true, defaultBranch, aheadCount };
  } catch {
    return { unmerged: false };
  }
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
    const result = await execFileGitAsync(["worktree", "list", "--porcelain"], {
      cwd: repoRoot,
    });
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
  const orphans: OrphanRecord[] = [];
  // rq-worktreeTargetCleanup01: recommendations from target-project triage
  // must carry target_path context so callers in another repo can act safely.
  const targetProject = isTargetProjectTriage(repoRoot, options);

  // 1. Stale HEAD on main checkout.
  const stale = await detectStaleBranchHead(repoRoot).catch(() => null);
  if (stale && stale.stale) {
    orphans.push({
      class: "stale_head",
      reason: stale.reason,
      recommendedFix: stale.suggestion,
    });
  }

  // 2-4. Cross-reference disk + Temporal.
  let access: WorktreeStateAccess;
  try {
    access = accessOverride ?? (await initStateDb(repoRoot));
  } catch {
    // Project workflow unreachable — skip the cross-reference layer.
    return { orphans, total: orphans.length };
  }

  const [diskList, snapshot] = await Promise.all([
    listDiskWorktrees(repoRoot),
    getWorktreeRegistrySnapshot(access),
  ]);
  const registry = snapshot.records;
  const summaries = snapshot.changeSummaries;
  const warnings = snapshot.warnings;

  const diskByBranch = new Map<string, DiskWorktree>();
  for (const dw of diskList) {
    if (dw.branch) diskByBranch.set(dw.branch, dw);
  }

  const registryByBranch = new Map<string, (typeof registry)[number]>();
  for (const r of registry) {
    if (r.branch) registryByBranch.set(r.branch, r);
  }

  // missing_from_temporal: disk has worktree, registry doesn't.
  // Skip the main checkout (no `branch` may equal change-named branch but
  // it's not a tracked worktree session — only flag named-branch worktrees
  // under our convention `change/...`).
  for (const dw of diskList) {
    if (!dw.branch) continue;
    if (!dw.branch.startsWith(CHANGE_BRANCH_PREFIX)) continue;
    if (registryByBranch.has(dw.branch)) continue;
    const reachability = await detectUnmergedBranch(repoRoot, dw.branch);
    if (reachability.unmerged) {
      orphans.push({
        class: "missing_from_temporal_unmerged",
        branch: dw.branch,
        path: dw.path,
        reason:
          `Disk worktree at ${dw.path} (branch ${dw.branch}) has no entry in worktree_registry ` +
          `and has ${reachability.aheadCount ?? 1} unmerged commits ahead of ${reachability.defaultBranch ?? "the default branch"}`,
        recommendedFix:
          `Resume/materialize the owning ADV worktree with adv_worktree_resume for ${dw.branch}; ` +
          `review and merge/archive the branch before cleanup`,
      });
      continue;
    }
    orphans.push({
      class: "missing_from_temporal",
      branch: dw.branch,
      path: dw.path,
      reason: `Disk worktree at ${dw.path} (branch ${dw.branch}) has no entry in worktree_registry`,
      recommendedFix:
        `If still active, resume/materialize the owning ADV worktree with adv_worktree_resume for ${dw.branch}; ` +
        `otherwise inspect manually, then use ${deleteFix(dw.branch, repoRoot, targetProject)} and let the terminal/merged/clean gates decide`,
    });
  }

  // missing_from_disk: registry has, disk doesn't.
  for (const r of registry) {
    if (!r.branch) continue;
    if (diskByBranch.has(r.branch)) continue;
    orphans.push({
      class: "missing_from_disk",
      branch: r.branch,
      path: r.path,
      reason: `worktree_registry has ${r.branch} at ${r.path}, but no on-disk worktree exists`,
      recommendedFix:
        `${deleteFix(r.branch, repoRoot, targetProject)} ` +
        `# reason: disk_missing ${r.branch}`,
    });
  }

  // registry_missing_change_id: registry has a canonical change worktree but
  // cannot prove ownership for delete integration checks.
  for (const r of registry) {
    if (!r.branch?.startsWith(CHANGE_BRANCH_PREFIX)) continue;
    if (r.changeId) continue;
    orphans.push({
      class: "registry_missing_change_id",
      branch: r.branch,
      path: r.path,
      reason: `worktree_registry has ${r.branch} at ${r.path}, but the record has no owning changeId`,
      recommendedFix:
        `repair registry metadata for ${r.branch}, then use ${deleteFix(r.branch, repoRoot, targetProject)} ` +
        `so terminal+merged+clean verification stays centralized`,
    });
  }

  // archived_not_cleaned: registry entry whose change is archived.
  for (const r of registry) {
    const changeId = r.changeId;
    if (!changeId) continue;
    const summary = summaries[changeId];
    if (!summary) continue;
    if (summary.status !== "archived") continue;
    if (!diskByBranch.has(r.branch ?? "")) continue; // already covered by missing_from_disk
    orphans.push({
      class: "archived_not_cleaned",
      branch: r.branch,
      path: r.path,
      reason: `Worktree ${r.branch} backs archived change ${changeId} (3-condition gate not yet exercised)`,
      recommendedFix: `${deleteFix(r.branch, repoRoot, targetProject)}  # 3-condition gate enforces archived+merged+clean`,
    });
  }

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
    if (!dw.branch.startsWith(CHANGE_BRANCH_PREFIX)) continue;
    const dirty = await getWorktreeDirtySummary(dw.path);
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

  return {
    orphans,
    total: orphans.length,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
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
