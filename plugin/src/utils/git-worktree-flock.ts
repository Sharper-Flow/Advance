/**
 * Git Worktree File-Lock (T15 — KD-2, KD-7, R16).
 *
 * A narrow per-repository filesystem lock used **only** to serialize git filesystem
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
import { lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { isProcessAlive } from "./process-liveness";
import { execFileGitAsync } from "./git-binary";

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
 * Lock filename used inside the per-repository administrative lease
 * directory. Distinct from
 * `worker.lock` so singleton-worker election is not coupled to git operations.
 * The file lives under `<git-common-dir>/advance`, never in a checkout.
 */
export const GIT_WORKTREE_LOCK_FILENAME = "git-worktree.lock";
/** Git administrative subdirectory shared by linked worktrees. */
export const GIT_WORKTREE_LEASE_DIRECTORY = "advance";
/** Distinct from the process-lease contention code for legacy migration. */
export const LEGACY_GIT_WORKTREE_FLOCK_CONFLICT_EXIT_CODE = 74;
const LEGACY_LOCK_MAX_BYTES = 4_096;
const LEGACY_REMOVE_SCRIPT =
  'test ! -L "$1" && test -f "$1" && mv -- "$1" "$2" && rm -f -- "$2"';

export type LegacyGitWorktreeLockFailure =
  | "held"
  | "malformed"
  | "probe_failed"
  | "remove_failed";

/** Typed, fail-closed legacy migration error. The artifact is never force-removed. */
export class GitWorktreeLegacyLockError extends Error {
  constructor(
    readonly failure: LegacyGitWorktreeLockFailure,
    readonly lockPath: string,
    message: string,
  ) {
    super(message);
    this.name = "GitWorktreeLegacyLockError";
  }
}

export class GitWorktreeLeaseResolutionError extends Error {
  constructor(
    readonly repository: string,
    message: string,
  ) {
    super(message);
    this.name = "GitWorktreeLeaseResolutionError";
  }
}

/**
 * Resolve the one lease directory shared by a repository's main and linked
 * worktrees. Git's common directory is repository administrative state, not a
 * checkout, so this path is invisible to `git status` and independent across
 * separate clones.
 */
export async function resolveGitWorktreeLeaseDir(
  repository: string,
): Promise<string> {
  try {
    const { stdout } = await execFileGitAsync(
      ["rev-parse", "--git-common-dir"],
      { cwd: repository },
    );
    const commonDir = stdout.trim();
    if (!commonDir) throw new Error("git returned an empty common directory");
    return join(resolve(repository, commonDir), GIT_WORKTREE_LEASE_DIRECTORY);
  } catch (error) {
    throw new GitWorktreeLeaseResolutionError(
      repository,
      `unable to resolve git common directory for ${repository}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function isKnownLegacyLockRecord(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort().join(",");
  if (keys !== "acquired_at,owner_token,pid,worker_id") return false;
  return (
    typeof record.pid === "number" &&
    Number.isInteger(record.pid) &&
    record.pid >= 0 &&
    typeof record.worker_id === "string" &&
    record.worker_id.length > 0 &&
    record.worker_id.length <= 256 &&
    typeof record.owner_token === "string" &&
    record.owner_token.length > 0 &&
    record.owner_token.length <= 256 &&
    typeof record.acquired_at === "string" &&
    record.acquired_at.length > 0 &&
    record.acquired_at.length <= 128
  );
}

async function probeLegacyKernelLock(lockPath: string): Promise<void> {
  await new Promise<void>((resolveProbe, rejectProbe) => {
    const child = spawn(
      "flock",
      [
        "-n",
        "-E",
        String(LEGACY_GIT_WORKTREE_FLOCK_CONFLICT_EXIT_CODE),
        lockPath,
        "true",
      ],
      { stdio: "ignore", windowsHide: true },
    );
    child.once("error", rejectProbe);
    child.once("close", (code) => {
      if (code === 0) return resolveProbe();
      if (code === LEGACY_GIT_WORKTREE_FLOCK_CONFLICT_EXIT_CODE) {
        rejectProbe(
          new GitWorktreeLegacyLockError(
            "held",
            lockPath,
            `legacy worktree lock is held: ${lockPath}; retry deletion after its owner exits`,
          ),
        );
        return;
      }
      rejectProbe(
        new GitWorktreeLegacyLockError(
          "probe_failed",
          lockPath,
          `unable to probe legacy worktree lock ${lockPath} (flock exit ${code ?? "unknown"})`,
        ),
      );
    });
  });
}

/**
 * Reacquire nonblocking before removal so a holder arriving after the probe
 * wins. Rename the locked inode before unlinking it: a peer that opens the
 * canonical path after flock is taken gets a new inode that is left in place.
 */
async function removeLegacyKernelLock(lockPath: string): Promise<void> {
  const retiredPath = join(
    dirname(lockPath),
    `.git-worktree.lock.migrating-${randomUUID()}`,
  );
  await new Promise<void>((resolveRemoval, rejectRemoval) => {
    const child = spawn(
      "flock",
      [
        "-n",
        "-E",
        String(LEGACY_GIT_WORKTREE_FLOCK_CONFLICT_EXIT_CODE),
        lockPath,
        "sh",
        "-c",
        LEGACY_REMOVE_SCRIPT,
        "sh",
        lockPath,
        retiredPath,
      ],
      { stdio: "ignore", windowsHide: true },
    );
    child.once("error", rejectRemoval);
    child.once("close", (code) => {
      if (code === 0) return resolveRemoval();
      if (code === LEGACY_GIT_WORKTREE_FLOCK_CONFLICT_EXIT_CODE) {
        rejectRemoval(
          new GitWorktreeLegacyLockError(
            "held",
            lockPath,
            `legacy worktree lock became held during migration: ${lockPath}; retry deletion after its owner exits`,
          ),
        );
        return;
      }
      rejectRemoval(
        new GitWorktreeLegacyLockError(
          "remove_failed",
          lockPath,
          `unable to remove migrated legacy worktree lock ${lockPath} (flock exit ${code ?? "unknown"})`,
        ),
      );
    });
  });
}

/**
 * Migrate only the known historical repository-local lock artifact. This is
 * intentionally called by deletion, never startup: malformed or held files
 * remain in place and produce typed repair guidance instead of broad cleanup.
 */
export async function migrateLegacyGitWorktreeLock(
  repository: string,
): Promise<{ removed: boolean; lockPath: string }> {
  const lockPath = join(
    resolve(repository),
    ".adv",
    GIT_WORKTREE_LOCK_FILENAME,
  );
  try {
    const legacyDir = dirname(lockPath);
    const legacyDirDetails = await lstat(legacyDir);
    if (!legacyDirDetails.isDirectory() || legacyDirDetails.isSymbolicLink()) {
      throw new GitWorktreeLegacyLockError(
        "malformed",
        lockPath,
        `legacy worktree lock parent is not a real directory: ${legacyDir}; preserve it for operator repair`,
      );
    }
    const details = await lstat(lockPath);
    if (!details.isFile() || details.size > LEGACY_LOCK_MAX_BYTES) {
      throw new GitWorktreeLegacyLockError(
        "malformed",
        lockPath,
        `legacy worktree lock is not a bounded regular artifact: ${lockPath}; preserve it for operator repair`,
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { removed: false, lockPath };
    if (error instanceof GitWorktreeLegacyLockError) throw error;
    throw new GitWorktreeLegacyLockError(
      "probe_failed",
      lockPath,
      `unable to inspect legacy worktree lock ${lockPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // Probe before reading or unlinking. A held legacy inode is never removed.
  await probeLegacyKernelLock(lockPath);
  let content: string;
  try {
    content = await readFile(lockPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { removed: false, lockPath };
    throw new GitWorktreeLegacyLockError(
      "probe_failed",
      lockPath,
      `unable to read legacy worktree lock ${lockPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (
    content.length > LEGACY_LOCK_MAX_BYTES ||
    (content.length > 0 &&
      (() => {
        try {
          return !isKnownLegacyLockRecord(JSON.parse(content));
        } catch {
          return true;
        }
      })())
  ) {
    throw new GitWorktreeLegacyLockError(
      "malformed",
      lockPath,
      `legacy worktree lock has an unexpected format: ${lockPath}; preserve it for operator repair`,
    );
  }
  await removeLegacyKernelLock(lockPath);
  return { removed: true, lockPath };
}

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
/** GNU util-linux documents 1 as the default conflict code; keep it distinct. */
export const GIT_WORKTREE_FLOCK_CONFLICT_EXIT_CODE = 73;
const FLOCK_DIAGNOSTIC_LIMIT = 4_096;
// Keep this shell program constant: the lock path is a separate argv and no
// path, token, or runtime value is interpolated into shell syntax.
const FLOCK_HOLDER_SCRIPT =
  "command -v tail >/dev/null 2>&1 || { printf '%s\\n' 'ADV_WORKTREE_FLOCK_HOLDER_UNAVAILABLE' >&2; exit 127; }; printf '%s\\n' 'ADV_WORKTREE_FLOCK_READY'; exec tail -f /dev/null";

export class GitWorktreeFlockHolderError extends Error {
  constructor(
    readonly exitCode: number | null,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    const detail = stderr || stdout;
    super(
      `flock holder failed to start (exit ${exitCode ?? "unknown"})${
        detail ? `: ${detail}` : ""
      }`,
    );
    this.name = "GitWorktreeFlockHolderError";
  }
}

function appendBounded(current: string, chunk: Buffer | string): string {
  if (current.length >= FLOCK_DIAGNOSTIC_LIMIT) return current;
  return `${current}${chunk.toString()}`.slice(0, FLOCK_DIAGNOSTIC_LIMIT);
}

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
  platform?: NodeJS.Platform;
  spawnProcess?: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => ChildProcess;
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
  const platform = options.platform ?? process.platform;
  if (platform !== "linux") {
    throw new GitWorktreeFlockUnsupportedError(
      `kernel flock lease requires Linux (got ${platform})`,
    );
  }
  mkdirSync(projectStateDir, { recursive: true });
  if (options.signal?.aborted) throwIfAborted(options.signal);

  const lockPath = join(projectStateDir, GIT_WORKTREE_LOCK_FILENAME);
  const ownerToken = randomUUID();
  const child = (options.spawnProcess ?? spawn)(
    "flock",
    [
      "-n",
      "-E",
      String(GIT_WORKTREE_FLOCK_CONFLICT_EXIT_CODE),
      lockPath,
      "sh",
      "-c",
      FLOCK_HOLDER_SCRIPT,
    ],
    {
      detached: true,
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
  let stderrOutput = "";
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
      output = appendBounded(output, chunk);
      if (!readyState && output.includes(FLOCK_READY)) {
        readyState = true;
        resolve(true);
      }
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderrOutput = appendBounded(stderrOutput, chunk);
    });
    child.once("error", (error) => {
      if (!readyState) reject(error);
    });
    child.once("close", (code) => {
      settledState = true;
      resolveParentSettled();
      if (!readyState) {
        if (code === GIT_WORKTREE_FLOCK_CONFLICT_EXIT_CODE) resolve(false);
        else if (code === 127)
          reject(
            new GitWorktreeFlockUnsupportedError(
              `flock holder command is unavailable: ${stderrOutput || output}`,
            ),
          );
        else
          reject(new GitWorktreeFlockHolderError(code, output, stderrOutput));
      }
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
 * Acquire the per-repository git-worktree flock. Callers pass the directory
 * returned by `resolveGitWorktreeLeaseDir`; linked worktrees therefore share
 * one Git-administrative artifact.
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
 * Release the per-repository git-worktree flock previously taken via
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
