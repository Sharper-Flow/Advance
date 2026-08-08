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

import { mkdirSync } from "node:fs";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { isProcessAlive } from "./process-liveness";

export type GitWorktreeLockResult =
  | {
      owned: true;
      ownerPid: number;
      workerId: string;
      ownerToken: string;
      lockPath: string;
    }
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

export interface AcquireGitWorktreeFlockOptions {
  signal?: AbortSignal;
}

export interface GitWorktreeProcessLease {
  owned: true;
  ownerPid: number;
  ownerToken: string;
  lockPath: string;
  process: ChildProcess;
  settled: Promise<void>;
  terminate: (reason: string) => Promise<void>;
  unregister?: () => void;
}

export type GitWorktreeProcessLeaseResult =
  | GitWorktreeProcessLease
  | {
      owned: false;
      ownerPid: number;
      lockPath: string;
      reason: "lock_held_by_alive_pid";
    };

export class GitWorktreeFlockUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitWorktreeFlockUnsupportedError";
  }
}

export class GitWorktreeFlockQuiescenceError extends Error {
  constructor(pgid: number) {
    super(
      `flock process group ${pgid} did not quiesce before the response barrier`,
    );
    this.name = "GitWorktreeFlockQuiescenceError";
  }
}

const FLOCK_READY = "ADV_WORKTREE_FLOCK_READY\n";
const FLOCK_HOLDER_SCRIPT =
  "const fs = require('node:fs'); const { spawn } = require('node:child_process'); fs.writeFileSync(process.env.ADV_FLOCK_PATH, JSON.stringify({ pid: process.pid, owner_token: process.env.ADV_FLOCK_TOKEN })); spawn(process.execPath, ['-e', 'setInterval(() => {}, 0x7fffffff);'], { stdio: 'ignore' }); process.stdout.write('ADV_WORKTREE_FLOCK_READY\\n'); setInterval(() => {}, 0x7fffffff);";

async function waitForSettlement(
  settled: Promise<void>,
  ms: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      settled,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function processGroupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function waitForProcessGroupGone(
  pgid: number,
  timeoutMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (processGroupAlive(pgid)) {
    if (Date.now() >= deadline) throw new GitWorktreeFlockQuiescenceError(pgid);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5);
      timer.unref?.();
    });
  }
}

function signalProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      try {
        child.kill(signal);
      } catch {
        // The close event remains authoritative for process completion.
      }
    }
  }
}

export interface AcquireGitWorktreeProcessLeaseOptions extends AcquireGitWorktreeFlockOptions {
  operation?: {
    registerChildLease: (lease: {
      terminate: (reason: string) => Promise<void>;
    }) => () => void;
  };
}

/**
 * Acquire the deletion lease through a kernel flock held by a dedicated
 * process group. The lock artifact is intentionally never unlinked: kernel
 * ownership ends only after the holder process group has exited.
 */
export async function acquireGitWorktreeProcessLease(
  projectStateDir: string,
  options: AcquireGitWorktreeProcessLeaseOptions = {},
): Promise<GitWorktreeProcessLeaseResult> {
  if (options.signal?.aborted) throwIfAborted(options.signal);
  if (process.platform !== "linux") {
    throw new GitWorktreeFlockUnsupportedError(
      `kernel flock lease requires Linux (got ${process.platform})`,
    );
  }
  mkdirSync(projectStateDir, { recursive: true });
  if (options.signal?.aborted) throwIfAborted(options.signal);

  const lockPath = join(projectStateDir, GIT_WORKTREE_LOCK_FILENAME);
  const ownerToken = randomUUID();
  const child = spawn(
    "flock",
    ["-n", lockPath, process.execPath, "-e", FLOCK_HOLDER_SCRIPT],
    {
      detached: true,
      env: {
        ...process.env,
        ADV_FLOCK_PATH: lockPath,
        ADV_FLOCK_TOKEN: ownerToken,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  let settledState = false;
  let resolveParentSettled!: () => void;
  const parentSettled = new Promise<void>((resolve) => {
    resolveParentSettled = resolve;
  });
  let readyState = false;
  let output = "";
  let terminatePromise: Promise<void> | undefined;
  const settled = parentSettled.then(async () => {
    const pgid = child.pid;
    if (pgid === undefined) return;
    signalProcessGroup(child, "SIGKILL");
    await waitForProcessGroupGone(pgid);
  });
  // The executor observes the rejection through terminate(); keep an
  // unexpected early close from becoming an unhandled rejection meanwhile.
  void settled.catch(() => undefined);
  const ready = new Promise<boolean>((resolve, reject) => {
    child.stdout?.on("data", (chunk: Buffer | string) => {
      output += chunk.toString();
      if (!readyState && output.includes(FLOCK_READY)) {
        readyState = true;
        resolve(true);
      }
    });
    child.once("error", (error) => {
      if (!readyState) reject(error);
    });
    child.once("close", (code) => {
      settledState = true;
      resolveParentSettled();
      if (!readyState) resolve(code === 1 ? false : false);
    });
  });

  const terminate = async (_reason: string): Promise<void> => {
    if (terminatePromise) return terminatePromise;
    terminatePromise = (async () => {
      if (!settledState) {
        signalProcessGroup(child, "SIGTERM");
        await waitForSettlement(parentSettled, 250);
        if (!settledState) signalProcessGroup(child, "SIGKILL");
      }
      // `settled` includes the process-group ESRCH barrier, not merely the
      // flock parent's close event.
      await settled;
    })();
    return terminatePromise;
  };
  const unregister = options.operation?.registerChildLease({ terminate });
  try {
    const acquired = await ready;
    if (!acquired) {
      await terminate("busy");
      unregister?.();
      return {
        owned: false,
        ownerPid: -1,
        lockPath,
        reason: "lock_held_by_alive_pid",
      };
    }
    if (options.signal?.aborted) {
      await terminate("aborted");
      throwIfAborted(options.signal);
    }
    return {
      owned: true,
      ownerPid: child.pid ?? -1,
      ownerToken,
      lockPath,
      process: child,
      settled,
      terminate,
      unregister,
    };
  } catch (error) {
    await terminate("acquisition_failed");
    unregister?.();
    if (error instanceof GitWorktreeFlockUnsupportedError) throw error;
    if (options.signal?.aborted) throwIfAborted(options.signal);
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new GitWorktreeFlockUnsupportedError(
        "flock executable is unavailable",
      );
    }
    throw error;
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new DOMException("git worktree lock acquisition aborted", "AbortError");
}

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
  options: AcquireGitWorktreeFlockOptions = {},
): Promise<GitWorktreeLockResult> {
  throwIfAborted(options.signal);
  await mkdir(projectStateDir, { recursive: true });
  throwIfAborted(options.signal);
  const lockPath = join(projectStateDir, GIT_WORKTREE_LOCK_FILENAME);
  const ownerPid = process.pid;
  const workerId = randomUUID();
  const ownerToken = randomUUID();
  const record = {
    pid: ownerPid,
    worker_id: workerId,
    owner_token: ownerToken,
    acquired_at: new Date().toISOString(),
  };
  let ownLockCreated = false;
  try {
    const handle = await open(lockPath, "wx");
    ownLockCreated = true;
    try {
      throwIfAborted(options.signal);
      await handle.writeFile(JSON.stringify(record));
    } finally {
      await handle.close();
    }
    if (options.signal?.aborted) {
      await rm(lockPath, { force: true });
      throw new DOMException(
        "git worktree lock acquisition aborted",
        "AbortError",
      );
    }
    return { owned: true, ownerPid, workerId, ownerToken, lockPath };
  } catch {
    if (options.signal?.aborted) {
      if (ownLockCreated) await rm(lockPath, { force: true });
      throwIfAborted(options.signal);
    }
    let existing: {
      pid?: number;
      worker_id?: string;
      owner_token?: string;
    } | null = null;
    try {
      existing = JSON.parse(await readFile(lockPath, "utf8")) as {
        pid?: number;
        worker_id?: string;
        owner_token?: string;
      };
    } catch {
      // The lock may have been released between the failed create and read.
    }

    if (existing?.pid !== undefined && !isProcessAlive(existing.pid)) {
      // Rename is the compare-and-reclaim boundary: only the record just read
      // is moved aside, then a fresh O_EXCL create installs a new owner token.
      // If a peer wins the race, leave its lock untouched and report contention.
      const reclaimPath = `${lockPath}.reclaim-${ownerToken}`;
      try {
        throwIfAborted(options.signal);
        await rename(lockPath, reclaimPath);
        const reclaimed = JSON.parse(await readFile(reclaimPath, "utf8")) as {
          pid?: number;
          owner_token?: string;
        };
        if (
          reclaimed.pid === existing.pid &&
          reclaimed.owner_token === existing.owner_token
        ) {
          await rm(reclaimPath, { force: true });
          throwIfAborted(options.signal);
          const handle = await open(lockPath, "wx");
          ownLockCreated = true;
          try {
            throwIfAborted(options.signal);
            await handle.writeFile(JSON.stringify(record));
          } finally {
            await handle.close();
          }
          if (options.signal?.aborted) {
            await rm(lockPath, { force: true });
            ownLockCreated = false;
            throwIfAborted(options.signal);
          }
          return { owned: true, ownerPid, workerId, ownerToken, lockPath };
        }
        await rename(reclaimPath, lockPath).catch(() => undefined);
      } catch {
        await rm(reclaimPath, { force: true }).catch(() => undefined);
      }
      try {
        existing = JSON.parse(
          await readFile(lockPath, "utf8"),
        ) as typeof existing;
      } catch {
        existing = null;
      }
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
  ownerToken: string,
): Promise<void> {
  const lockPath = join(projectStateDir, GIT_WORKTREE_LOCK_FILENAME);
  try {
    const existing = JSON.parse(await readFile(lockPath, "utf8")) as {
      owner_token?: string;
    };
    if (existing.owner_token !== ownerToken) return;
    await rm(lockPath, { force: true });
  } catch {
    // Idempotent when already released or concurrently reclaimed.
  }
}
