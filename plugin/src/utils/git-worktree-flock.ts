/**
 * Git Worktree File-Lock (T15 — KD-2, KD-7, R16).
 *
 * A narrow per-project filesystem lock used **only** to serialize git filesystem
 * operations (`git worktree add` / `git worktree remove`) that race against
 * each other when multiple peer sessions create or delete worktrees
 * concurrently. Hold time is targeted at ~50ms — long enough to cover the
 * git invocation, short enough to be invisible to the user.
 *
 * This is a genuine filesystem lock: acquisition is an atomic O_EXCL create,
 * and contention is represented by the existing lock file and its owner PID.
 *
 * Citations: rq-multiSessionCoordination01, rq-worktreeRegistry01.
 */

import { open, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

export type GitWorktreeLockResult =
  | { owned: true; ownerPid: number; workerId: string; lockPath: string }
  | {
      owned: false;
      ownerPid: number;
      workerId?: string;
      lockPath: string;
      reason: "lock_held_by_alive_pid";
    };

/**
 * Lock filename used inside the per-project state directory. Distinct from
 * `worker.lock` so the singleton-worker election is not coupled to git
 * operations.
 */
export const GIT_WORKTREE_LOCK_FILENAME = "git-worktree.lock";

/**
 * Acquire the per-project git-worktree flock.
 *
 * Returns a lock result whose `owned` field indicates whether
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
): Promise<GitWorktreeLockResult> {
  const lockPath = join(projectStateDir, GIT_WORKTREE_LOCK_FILENAME);
  const ownerPid = process.pid;
  const workerId = randomUUID();
  try {
    const handle = await open(lockPath, "wx");
    try {
      await handle.writeFile(
        JSON.stringify({
          pid: ownerPid,
          worker_id: workerId,
          acquired_at: new Date().toISOString(),
        }),
      );
    } finally {
      await handle.close();
    }
    return { owned: true, ownerPid, workerId, lockPath };
  } catch {
    let existing: { pid?: number; worker_id?: string } | null = null;
    try {
      existing = JSON.parse(await readFile(lockPath, "utf8")) as {
        pid?: number;
        worker_id?: string;
      };
    } catch {
      // The lock may have been released between the failed create and read.
    }
    return {
      owned: false,
      ownerPid: existing?.pid ?? -1,
      workerId: existing?.worker_id,
      lockPath,
      reason: "lock_held_by_alive_pid",
    };
  }
}

/**
 * Release the per-project git-worktree flock previously taken via
 * `acquireGitWorktreeFlock`. Idempotent — no-op when the lock file is
 * absent or owned by another PID (defensive: avoids stealing peer locks).
 */
export async function releaseGitWorktreeFlock(
  projectStateDir: string,
): Promise<void> {
  await rm(join(projectStateDir, GIT_WORKTREE_LOCK_FILENAME), { force: true });
}
