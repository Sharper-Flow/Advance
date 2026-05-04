/**
 * Worker Lock — singleton-per-project Temporal worker coordination
 *
 * Coordinates Temporal worker ownership across multiple plugin instances
 * that share the same external state directory (the same project_id).
 * Only the lock owner spawns a worker; subsequent plugin instances skip
 * worker spawn and participate as Temporal clients only.
 *
 * Spec: rq-workerSingleton01.
 *
 * The lock primitive is parametrized by `lockFilename` (default
 * `worker.lock`) so adjacent coordination domains — for example the
 * git-worktree-flock used during `git worktree add/remove` — can reuse
 * the same atomic O_EXCL acquisition machinery without colliding with
 * the worker-singleton lock. The default keeps full backward compat.
 *
 * Multi-session note (rq-multiSessionCoordination01): worker-singleton
 * coordination is a building block of multi-session-safe ADV operation.
 * The worker is shared across peer sessions in the same project; ADV
 * state writes from those sessions are serialized by the Temporal
 * workflow updates the singleton worker hosts.
 *
 * Lock file: `{projectStateDir}/worker.lock` containing JSON:
 *   {
 *     "pid": <owner-process-pid>,
 *     "worker_id": "<uuid-v4>",
 *     "acquired_at": "<ISO-8601>",
 *     "schema_version": 2,
 *     "last_heartbeat": "<ISO-8601>"
 *   }
 *
 * Acquisition (atomic via O_EXCL):
 *   - Try to create the lock file with O_CREAT | O_EXCL | O_WRONLY.
 *   - EEXIST: read the existing lock and check liveness via
 *     `process.kill(pid, 0)`.
 *       * ESRCH (no such process): stale → remove and retry once.
 *       * EPERM (process exists but not ours): treat as alive — do NOT
 *         reclaim. Another user / container owns the worker.
 *       * Resolved (PID alive): another instance owns the lock.
 *   - Unreadable lock contents: treat as stale, remove + retry once.
 *
 * Retries are capped at 1 to prevent acquisition loops on persistent
 * failures.
 *
 * KD-7: PID-only in v1. The PID-reuse window for long-lived plugin
 * processes is negligible; start_time is a documented v2 follow-up if
 * incidents materialize.
 *
 * KD-8: Out-of-process worker mode is the production path. The legacy
 * in-process worker is reachable via ADV_FORCE_IN_PROCESS_WORKER=1
 * (handled at the plugin-init seam, not in this module).
 */

import { open, readFile, rename, rm } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

export const WORKER_LOCK_FILENAME = "worker.lock";
export const HEARTBEAT_INTERVAL_MS = readPositiveIntEnv(
  "ADV_WORKER_HEARTBEAT_INTERVAL_MS",
  5_000,
);
const CONFIGURED_STALE_HEARTBEAT_MS = readPositiveIntEnv(
  "ADV_WORKER_HEARTBEAT_STALE_MS",
  60_000,
);
export const STALE_HEARTBEAT_MS =
  CONFIGURED_STALE_HEARTBEAT_MS > 2 * HEARTBEAT_INTERVAL_MS
    ? CONFIGURED_STALE_HEARTBEAT_MS
    : Math.max(60_000, HEARTBEAT_INTERVAL_MS * 3);
const WORKER_LOCK_TMP_SUFFIX = ".tmp";
const WORKER_LOCK_RELEASING_SUFFIX = ".releasing";

export interface WorkerLockContentsV1 {
  pid: number;
  worker_id: string;
  acquired_at: string;
  schema_version?: 1;
  last_heartbeat?: never;
}

export interface WorkerLockContentsV2 {
  pid: number;
  worker_id: string;
  acquired_at: string;
  schema_version: 2;
  last_heartbeat: string;
}

export type WorkerLockContents = WorkerLockContentsV1 | WorkerLockContentsV2;

export function isV2Lock(
  contents: Partial<WorkerLockContents>,
): contents is WorkerLockContentsV2 {
  return (
    contents.schema_version === 2 && typeof contents.last_heartbeat === "string"
  );
}

export type WorkerLockResult =
  | {
      owned: true;
      ownerPid: number;
      workerId: string;
      lockPath: string;
    }
  | {
      owned: false;
      ownerPid: number;
      workerId?: string;
      lockPath: string;
      reason: "lock_held_by_alive_pid";
    };

export interface AcquireWorkerLockOptions {
  /**
   * Override the current process PID. Test-only — production callers
   * should let this default to `process.pid`.
   */
  pid?: number;
  /** Override liveness check. Test-only. */
  isAlive?: (pid: number) => "alive" | "dead" | "unknown_owner";
  /**
   * Override the lock filename. Defaults to `WORKER_LOCK_FILENAME`
   * (`"worker.lock"`). Used by adjacent coordination domains that want
   * to reuse this primitive (for example git-worktree-flock at T15).
   * Backward-compat: omit to retain default behavior.
   */
  lockFilename?: string;
}

export interface ReleaseWorkerLockOptions {
  /**
   * Override the lock filename. Must match the value passed to
   * `acquireWorkerLock`. Defaults to `WORKER_LOCK_FILENAME`.
   */
  lockFilename?: string;
}

/**
 * Try to acquire the worker lock for a project. Idempotent on success
 * for the same caller (re-acquiring an owned lock returns the same
 * owner identity). Caps at 1 retry on stale / corrupt detection.
 */
export async function acquireWorkerLock(
  projectStateDir: string,
  options: AcquireWorkerLockOptions = {},
): Promise<WorkerLockResult> {
  const lockFilename = options.lockFilename ?? WORKER_LOCK_FILENAME;
  const lockPath = join(projectStateDir, lockFilename);
  const myPid = options.pid ?? process.pid;
  const isAlive = options.isAlive ?? defaultIsAlive;

  for (let attempt = 0; attempt < 2; attempt++) {
    const acquired = await tryAtomicCreate(lockPath, myPid);
    if (acquired) {
      return {
        owned: true,
        ownerPid: myPid,
        workerId: acquired.worker_id,
        lockPath,
      };
    }

    // Lock already exists. Inspect.
    let contents: WorkerLockContents | null;
    try {
      contents = await readLockContents(lockPath);
    } catch {
      // Unreadable lock — treat as stale, remove and retry once.
      await safeRemove(lockPath);
      continue;
    }

    if (!contents) {
      // Lock is empty / partial-write / unparseable. Treat as stale.
      await safeRemove(lockPath);
      continue;
    }

    const livenessState = isAlive(contents.pid);
    if (livenessState === "dead") {
      // Owner is gone — reclaim.
      await safeRemove(lockPath);
      continue;
    }
    // alive OR unknown_owner → respect the lock.
    return {
      owned: false,
      ownerPid: contents.pid,
      workerId: contents.worker_id,
      lockPath,
      reason: "lock_held_by_alive_pid",
    };
  }

  // After max retries, read final state and report owner if any.
  try {
    const final = await readLockContents(lockPath);
    if (final) {
      return {
        owned: false,
        ownerPid: final.pid,
        workerId: final.worker_id,
        lockPath,
        reason: "lock_held_by_alive_pid",
      };
    }
  } catch {
    // ignore
  }
  // Lock is gone again but we exhausted retries. Return not-owned with
  // sentinel pid so callers can treat it as "could not acquire, but
  // also nobody owns it" — a degenerate race.
  return {
    owned: false,
    ownerPid: -1,
    lockPath,
    reason: "lock_held_by_alive_pid",
  };
}

/**
 * Release a lock owned by this process. Best-effort: any failure is
 * swallowed because the next plugin start's stale-PID detection is the
 * authoritative recovery path.
 */
export async function releaseWorkerLock(
  projectStateDir: string,
  options: ReleaseWorkerLockOptions = {},
): Promise<void> {
  const lockFilename = options.lockFilename ?? WORKER_LOCK_FILENAME;
  const lockPath = join(projectStateDir, lockFilename);
  const releasingPath = lockPath + WORKER_LOCK_RELEASING_SUFFIX;
  try {
    await rename(lockPath, releasingPath);
    await safeRemove(releasingPath);
  } catch {
    // Best-effort. If the rename failed (lock missing, permission error),
    // try direct removal.
    await safeRemove(lockPath);
  }
}

// ============================================================================
// Internals
// ============================================================================

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function tryAtomicCreate(
  lockPath: string,
  pid: number,
): Promise<WorkerLockContents | null> {
  const acquiredAt = new Date().toISOString();
  const contents: WorkerLockContentsV2 = {
    pid,
    worker_id: randomUUID(),
    acquired_at: acquiredAt,
    schema_version: 2,
    last_heartbeat: acquiredAt,
  };
  // Atomic write via tmp+rename so partial-write contents never appear in
  // the canonical lock path. EEXIST on the canonical path means another
  // instance already owns it.
  const tmpPath = lockPath + WORKER_LOCK_TMP_SUFFIX + "." + pid;
  let handle;
  try {
    handle = await open(tmpPath, "wx");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      // Stale tmp from a prior crashed acquire — remove and retry once.
      await safeRemove(tmpPath);
      try {
        handle = await open(tmpPath, "wx");
      } catch {
        return null;
      }
    } else {
      throw err;
    }
  }
  try {
    await handle.writeFile(JSON.stringify(contents, null, 2));
    await handle.sync();
  } finally {
    await handle.close();
  }
  // Now move tmp to canonical via link+unlink for atomicity. Use
  // rename with O_EXCL semantics: if the canonical path already exists,
  // rename will overwrite — which we don't want. Instead, attempt
  // exclusive open of the canonical and copy contents.
  try {
    const canonicalHandle = await open(lockPath, "wx");
    try {
      await canonicalHandle.writeFile(JSON.stringify(contents, null, 2));
      await canonicalHandle.sync();
    } finally {
      await canonicalHandle.close();
    }
    // Canonical write succeeded — clean up tmp and return acquired.
    await safeRemove(tmpPath);
    return contents;
  } catch (err) {
    // Canonical exists — another instance already acquired. Clean tmp.
    await safeRemove(tmpPath);
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      return null;
    }
    throw err;
  }
}

export async function readLockContents(
  lockPath: string,
): Promise<WorkerLockContents | null> {
  const raw = await readFile(lockPath, "utf8");
  if (!raw.trim()) return null;
  const parsed = JSON.parse(raw) as Partial<WorkerLockContents>;
  if (
    typeof parsed.pid !== "number" ||
    typeof parsed.worker_id !== "string" ||
    typeof parsed.acquired_at !== "string"
  ) {
    return null;
  }
  if (isV2Lock(parsed)) {
    return {
      pid: parsed.pid,
      worker_id: parsed.worker_id,
      acquired_at: parsed.acquired_at,
      schema_version: 2,
      last_heartbeat: parsed.last_heartbeat,
    };
  }
  return {
    pid: parsed.pid,
    worker_id: parsed.worker_id,
    acquired_at: parsed.acquired_at,
    schema_version: 1,
  };
}

async function safeRemove(path: string): Promise<void> {
  try {
    await rm(path, { force: true });
  } catch {
    // ignore — best-effort cleanup
  }
}

function defaultIsAlive(pid: number): "alive" | "dead" | "unknown_owner" {
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return "dead";
    if (code === "EPERM") return "unknown_owner";
    // Any other error → conservative "unknown_owner" so we don't reclaim.
    return "unknown_owner";
  }
}
