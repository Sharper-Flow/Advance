/**
 * Git Worktree File-Lock (T15 — KD-2, KD-7, R16).
 *
 * Thin wrapper around the parametrized worker-lock primitive (T2). Provides
 * a narrow per-project lock used **only** to serialize git filesystem
 * operations (`git worktree add` / `git worktree remove`) that race against
 * each other when multiple peer sessions create or delete worktrees
 * concurrently. Hold time is targeted at ~50ms — long enough to cover the
 * git invocation, short enough to be invisible to the user.
 *
 * Design center note (KD-2): this is the **only** client-side coordination
 * point in the entire `unifyworktreeunderadvmultisess` change. ADV state
 * mutations (changes, tasks, gates, worktree_registry) have ZERO
 * client-side locks — Temporal serializes them via workflow updates.
 *
 * Reuses the underlying worker-lock primitive for:
 *   - atomic O_EXCL creation (no race window),
 *   - ESRCH / EPERM stale-PID handling (retry-once on dead holder),
 *   - PID-based liveness check.
 *
 * Citations: rq-multiSessionCoordination01, rq-worktreeRegistry01.
 */

import {
  acquireWorkerLock,
  releaseWorkerLock,
  type WorkerLockResult,
} from "../temporal/worker-lock";

/**
 * Lock filename used inside the per-project state directory. Distinct from
 * `worker.lock` so the singleton-worker election is not coupled to git
 * operations.
 */
export const GIT_WORKTREE_LOCK_FILENAME = "git-worktree.lock";

/**
 * Acquire the per-project git-worktree flock.
 *
 * Returns a `WorkerLockResult` whose `owned` field indicates whether
 * the lock was taken (`true`) or contended (`false`). Callers MUST honour
 * the returned semantics:
 *   - `owned: true`  → proceed with `git worktree add/remove`, then
 *                       call `releaseGitWorktreeFlock` on the same
 *                       `projectStateDir`.
 *   - `owned: false` → another session holds the lock; retry, surface
 *                       `BRANCH_LOCKED`, or fall back per caller policy.
 */
export async function acquireGitWorktreeFlock(
  projectStateDir: string,
): Promise<WorkerLockResult> {
  return acquireWorkerLock(projectStateDir, {
    lockFilename: GIT_WORKTREE_LOCK_FILENAME,
  });
}

/**
 * Release the per-project git-worktree flock previously taken via
 * `acquireGitWorktreeFlock`. Idempotent — no-op when the lock file is
 * absent or owned by another PID (defensive: avoids stealing peer locks).
 */
export async function releaseGitWorktreeFlock(
  projectStateDir: string,
): Promise<void> {
  await releaseWorkerLock(projectStateDir, {
    lockFilename: GIT_WORKTREE_LOCK_FILENAME,
  });
}
