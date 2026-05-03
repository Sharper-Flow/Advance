/**
 * Tests for git-worktree-flock.ts (T15 — KD-2, KD-7, R16).
 *
 * Verifies the thin wrapper:
 *   - Lock file is created at `<projectStateDir>/git-worktree.lock`
 *     (distinct from `worker.lock` — singleton-worker is uncoupled).
 *   - First acquire wins, second contends with `owned: false`.
 *   - Release frees the lock so a subsequent acquire succeeds.
 *   - Two separate locks (worker.lock + git-worktree.lock) coexist
 *     in the same project state dir without collision.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { access } from "fs/promises";
import { join } from "path";
import {
  acquireGitWorktreeFlock,
  releaseGitWorktreeFlock,
  GIT_WORKTREE_LOCK_FILENAME,
} from "./git-worktree-flock";
import {
  acquireWorkerLock,
  releaseWorkerLock,
  WORKER_LOCK_FILENAME,
} from "../temporal/worker-lock";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";

describe("git-worktree-flock (T15)", () => {
  let stateDir: string;

  beforeEach(async () => {
    stateDir = await createTempDir("adv-git-worktree-flock-");
  });

  afterEach(async () => {
    await cleanupTempDir(stateDir);
  });

  it("creates lock file at git-worktree.lock (not worker.lock)", async () => {
    const result = await acquireGitWorktreeFlock(stateDir);
    expect(result.owned).toBe(true);
    if (!result.owned) throw new Error("expected owned:true");
    expect(result.lockPath).toBe(join(stateDir, GIT_WORKTREE_LOCK_FILENAME));
    // worker.lock is NOT created by the git-worktree flock.
    await expect(
      access(join(stateDir, WORKER_LOCK_FILENAME)),
    ).rejects.toThrow();
    await releaseGitWorktreeFlock(stateDir);
  });

  it("serializes concurrent acquire — first wins, second contends", async () => {
    const first = await acquireGitWorktreeFlock(stateDir);
    expect(first.owned).toBe(true);

    // Second acquire while first is still held returns owned:false with
    // reason `lock_held_by_alive_pid` — the underlying worker-lock primitive
    // detects the existing lock file (even when held by the same PID) and
    // refuses to re-acquire. Cross-PID contention is covered by
    // worker-lock.test.ts; this test verifies the wrapper surface.
    const second = await acquireGitWorktreeFlock(stateDir);
    expect(second.owned).toBe(false);
    if (second.owned)
      throw new Error("expected owned:false on contended re-acquire");
    expect(second.reason).toBe("lock_held_by_alive_pid");
    expect(second.ownerPid).toBe(process.pid);

    await releaseGitWorktreeFlock(stateDir);
  });

  it("release frees the lock for subsequent acquire", async () => {
    const first = await acquireGitWorktreeFlock(stateDir);
    expect(first.owned).toBe(true);
    await releaseGitWorktreeFlock(stateDir);

    // After release, a fresh acquire succeeds.
    const second = await acquireGitWorktreeFlock(stateDir);
    expect(second.owned).toBe(true);
    await releaseGitWorktreeFlock(stateDir);
  });

  it("coexists with worker.lock — both locks held simultaneously without collision", async () => {
    const workerLock = await acquireWorkerLock(stateDir);
    expect(workerLock.owned).toBe(true);

    const gitLock = await acquireGitWorktreeFlock(stateDir);
    expect(gitLock.owned).toBe(true);

    if (!workerLock.owned || !gitLock.owned) {
      throw new Error("expected both locks owned");
    }
    expect(workerLock.lockPath).not.toBe(gitLock.lockPath);

    // Both files must exist on disk.
    await access(workerLock.lockPath);
    await access(gitLock.lockPath);

    await releaseGitWorktreeFlock(stateDir);
    await releaseWorkerLock(stateDir);
  });
});
