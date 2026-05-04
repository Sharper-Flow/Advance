import { open, readFile, rename, rm } from "fs/promises";
import { join } from "path";
import {
  WORKER_LOCK_FILENAME,
  type WorkerLockContents,
  type WorkerLockContentsV2,
} from "./worker-lock";

export interface StartHeartbeatWriterOptions {
  projectStateDir: string;
  workerId: string;
  intervalMs: number;
}

export interface HeartbeatWriter {
  stop(): Promise<void>;
}

export function startHeartbeatWriter(
  options: StartHeartbeatWriterOptions,
): HeartbeatWriter {
  let stopped = false;
  let inFlight: Promise<void> = Promise.resolve();
  const lockPath = join(options.projectStateDir, WORKER_LOCK_FILENAME);

  const tick = (): void => {
    if (stopped) return;
    inFlight = inFlight.then(async () => {
      if (stopped) return;
      const stillOwner = await writeHeartbeat(lockPath, options.workerId);
      if (!stillOwner) {
        stopped = true;
        clearInterval(timer);
      }
    });
  };

  const timer = setInterval(tick, options.intervalMs);
  tick();

  return {
    async stop(): Promise<void> {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}

async function writeHeartbeat(
  lockPath: string,
  workerId: string,
): Promise<boolean> {
  const current = await readCurrentLock(lockPath);
  if (!current || current.worker_id !== workerId) return false;

  const next: WorkerLockContentsV2 = {
    ...current,
    schema_version: 2,
    last_heartbeat: new Date().toISOString(),
  };
  const tmpPath = `${lockPath}.tmp.${process.pid}.${Date.now()}`;

  let handle;
  try {
    handle = await open(tmpPath, "w");
    await handle.writeFile(JSON.stringify(next, null, 2));
    await handle.sync();
  } finally {
    await handle?.close();
  }

  const beforeRename = await readCurrentLock(lockPath);
  if (!beforeRename || beforeRename.worker_id !== workerId) {
    await rm(tmpPath, { force: true });
    return false;
  }

  await rename(tmpPath, lockPath);
  return true;
}

async function readCurrentLock(
  lockPath: string,
): Promise<WorkerLockContents | null> {
  const raw = await readFile(lockPath, "utf8");
  if (!raw.trim()) return null;
  return JSON.parse(raw) as WorkerLockContents;
}
