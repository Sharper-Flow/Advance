import { open, readFile, rm } from "fs/promises";
import { randomUUID } from "crypto";
import { join } from "path";

export const WORKER_LOCK_FILENAME = "worker.lock";
export const STALE_HEARTBEAT_GRACE_MS = 60_000;

export interface WorkerLockContentsV1 {
  pid: number;
  worker_id: string;
  acquired_at: string;
  schema_version?: 1;
}

export interface WorkerLockContentsV2 {
  pid: number;
  worker_id: string;
  acquired_at: string;
  schema_version: 2;
  last_heartbeat: string;
  expected_queue?: string;
}

export type WorkerLockContents = WorkerLockContentsV1 | WorkerLockContentsV2;

export type WorkerLockResult =
  | { owned: true; ownerPid: number; workerId: string; lockPath: string }
  | {
      owned: false;
      ownerPid: number;
      workerId?: string;
      lockPath: string;
      reason: "lock_held_by_alive_pid";
    };

export interface AcquireWorkerLockOptions {
  pid?: number;
  lockFilename?: string;
  schemaVersion?: 1 | 2;
  expectedQueue?: string;
  now?: () => Date;
}

export interface ReleaseWorkerLockOptions {
  lockFilename?: string;
}

export interface ReclaimWorkerLockOptions extends AcquireWorkerLockOptions {
  staleHeartbeatGraceMs?: number;
  isPidAlive?: (pid: number) => boolean;
}

export async function acquireWorkerLock(
  projectStateDir: string,
  options: AcquireWorkerLockOptions = {},
): Promise<WorkerLockResult> {
  const lockPath = join(
    projectStateDir,
    options.lockFilename ?? WORKER_LOCK_FILENAME,
  );
  const pid = options.pid ?? process.pid;
  const acquiredAt = (options.now ?? (() => new Date()))().toISOString();
  const contents: WorkerLockContents = {
    pid,
    worker_id: randomUUID(),
    acquired_at: acquiredAt,
    ...(options.schemaVersion === 2
      ? {
          schema_version: 2,
          last_heartbeat: acquiredAt,
          ...(options.expectedQueue
            ? { expected_queue: options.expectedQueue }
            : {}),
        }
      : { schema_version: 1 }),
  };

  try {
    const handle = await open(lockPath, "wx");
    try {
      await handle.writeFile(JSON.stringify(contents, null, 2));
    } finally {
      await handle.close();
    }
    return {
      owned: true,
      ownerPid: pid,
      workerId: contents.worker_id,
      lockPath,
    };
  } catch {
    const existing = await readLockContents(lockPath).catch(() => null);
    return {
      owned: false,
      ownerPid: existing?.pid ?? -1,
      workerId: existing?.worker_id,
      lockPath,
      reason: "lock_held_by_alive_pid",
    };
  }
}

export async function tryReclaimStaleLock(
  projectStateDir: string,
  options: ReclaimWorkerLockOptions = {},
): Promise<WorkerLockResult> {
  const firstAttempt = await acquireWorkerLock(projectStateDir, options);
  if (firstAttempt.owned) return firstAttempt;

  const existing = await readLockContents(firstAttempt.lockPath).catch(
    () => null,
  );
  if (!existing) return firstAttempt;

  if (!isLockOwnerAlive(existing.pid, options.isPidAlive)) {
    await releaseWorkerLock(projectStateDir, options);
    return acquireWorkerLock(projectStateDir, options);
  }

  if (isHeartbeatStale(existing, options)) {
    await releaseWorkerLock(projectStateDir, options);
    return acquireWorkerLock(projectStateDir, options);
  }

  return firstAttempt;
}

export async function releaseWorkerLock(
  projectStateDir: string,
  options: ReleaseWorkerLockOptions = {},
): Promise<void> {
  const lockPath = join(
    projectStateDir,
    options.lockFilename ?? WORKER_LOCK_FILENAME,
  );
  await rm(lockPath, { force: true }).catch(() => undefined);
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
  if (parsed.schema_version === 2) {
    if (
      typeof parsed.last_heartbeat !== "string" ||
      (parsed.expected_queue !== undefined &&
        typeof parsed.expected_queue !== "string")
    ) {
      return null;
    }
    return {
      pid: parsed.pid,
      worker_id: parsed.worker_id,
      acquired_at: parsed.acquired_at,
      schema_version: 2,
      last_heartbeat: parsed.last_heartbeat,
      ...(parsed.expected_queue
        ? { expected_queue: parsed.expected_queue }
        : {}),
    };
  }

  return {
    pid: parsed.pid,
    worker_id: parsed.worker_id,
    acquired_at: parsed.acquired_at,
    schema_version: 1,
  };
}

function isLockOwnerAlive(
  pid: number,
  isPidAlive: ((pid: number) => boolean) | undefined,
): boolean {
  if (isPidAlive) return isPidAlive(pid);
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function isHeartbeatStale(
  contents: WorkerLockContents,
  options: ReclaimWorkerLockOptions,
): boolean {
  if (contents.schema_version !== 2) return false;
  const heartbeatMs = Date.parse(contents.last_heartbeat);
  if (Number.isNaN(heartbeatMs)) return false;
  const nowMs = (options.now ?? (() => new Date()))().getTime();
  const graceMs =
    options.staleHeartbeatGraceMs ?? STALE_HEARTBEAT_GRACE_MS;
  return nowMs - heartbeatMs > graceMs;
}
