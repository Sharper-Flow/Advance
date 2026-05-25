/**
 * Multi-worktree archive cleanup target enumeration
 * (rq-autoManageAdvWorktrees AC7).
 *
 * `collectWorktreeCleanupTargets(change)` produces the deterministic list
 * of worktree paths the archive flow must clean up for an auto-managed
 * change. Iteration order is fixed:
 *
 *   1. Current-repo worktree (branch `change/{changeId}`).
 *   2. `target_worktree_path` if set (cross-project mutations).
 *   3. `scope_worktrees[*]` in `Object.keys` insertion order
 *      (product-linked changes, AC4 D2).
 *
 * The current-repo entry is always emitted as a tentative target. The
 * archive flow's deletion step (`adv_worktree_delete`) honors the existing
 * 3-condition gate (archived AND merged AND clean); paths that don't
 * satisfy the gate stay pending and are reported in the archive report.
 *
 * Idempotency: re-running cleanup on an already-cleaned change emits the
 * same list (with empty target/scope) — entries already deleted are no-op
 * skipped by `adv_worktree_delete`'s record check.
 *
 * Partial-failure tolerance: a per-target deletion that fails MUST NOT
 * abort iteration of subsequent targets. Callers iterate the full list,
 * record per-entry outcomes, and surface failures in the archive report.
 */

import type { Change } from "../../types";

export type WorktreeCleanupTargetRole = "current" | "target" | "scope";

export interface WorktreeCleanupTarget {
  role: WorktreeCleanupTargetRole;
  /** Branch name to pass to adv_worktree_delete. */
  branch: string;
  /** Absolute worktree path the agent's archive iteration walks. */
  path: string;
  /** Set only when role === "scope". Keys against scope_worktrees. */
  repoId?: string;
}

/**
 * Compute the deterministic cleanup target list for a change.
 *
 * Inputs are read directly from the change record; no registry I/O. The
 * registry remains canonical for path existence (per `rq-worktreeRegistry01`);
 * this projection is the routing convenience that lets archive iterate
 * without per-target registry queries.
 *
 * The current-repo entry's `path` is left as a conventional stub
 * (`change/{changeId}` branch, no path) because the archive flow resolves
 * the actual current-repo path via git worktree census or via the
 * existing per-change worktree state — the helper just signals
 * "remember to also clean the current-repo worktree, branch `change/{id}`".
 */
export function collectWorktreeCleanupTargets(
  change: Change,
): WorktreeCleanupTarget[] {
  const targets: WorktreeCleanupTarget[] = [];

  // 1. Current-repo worktree — always considered, even on changes where
  // no `target_worktree_path` or `scope_worktrees` field was populated.
  // Archive Phase 9 Step 7 resolves the actual path via git census;
  // this entry tells the iteration which BRANCH to delete.
  targets.push({
    role: "current",
    branch: `change/${change.id}`,
    // path is intentionally a hint — resolved at archive time
    path: "",
  });

  // 2. Cross-project worktree (AC4 D1).
  if (change.target_worktree_path) {
    targets.push({
      role: "target",
      branch: `change/${change.id}`,
      path: change.target_worktree_path,
    });
  }

  // 3. Product-linked scope worktrees (AC4 D2). Object.keys order is
  // insertion order in modern V8, which matches the workflow signal-
  // handler's projection order — archive iteration is deterministic.
  if (change.scope_worktrees) {
    for (const [repoId, path] of Object.entries(change.scope_worktrees)) {
      targets.push({
        role: "scope",
        repoId,
        branch: `change/${change.id}`,
        path,
      });
    }
  }

  return targets;
}
