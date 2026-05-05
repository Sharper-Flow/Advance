import { open, readFile, rm } from "fs/promises";
import { randomUUID } from "crypto";
import { join } from "path";

export const WORKER_LOCK_FILENAME = "worker.lock";

export interface WorkerLockContents {
  pid: number;
  worker_id: string;
  acquired_at: string;
  schema_version?: 1;
}

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
}

export interface ReleaseWorkerLockOptions {
  lockFilename?: string;
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
  const contents: WorkerLockContents = {
    pid,
    worker_id: randomUUID(),
    acquired_at: new Date().toISOString(),
    schema_version: 1,
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
  return {
    pid: parsed.pid,
    worker_id: parsed.worker_id,
    acquired_at: parsed.acquired_at,
    schema_version: 1,
  };
}
