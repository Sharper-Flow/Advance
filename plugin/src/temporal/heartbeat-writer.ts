import { open, readFile, rename, rm } from "fs/promises";
import { join } from "path";
import { appendDebugLog } from "../utils/debug-log";
import {
  WORKER_LOCK_FILENAME,
  type WorkerLockContents,
  type WorkerLockContentsV2,
} from "./worker-lock";

export interface HeartbeatFileHandle {
  writeFile(data: string): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface HeartbeatWriterFs {
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  open(path: string, flags: string): Promise<HeartbeatFileHandle>;
  rename(oldPath: string, newPath: string): Promise<void>;
  rm(path: string, options: { force: boolean }): Promise<void>;
}

export interface StartHeartbeatWriterOptions {
  projectStateDir: string;
  workerId: string;
  intervalMs: number;
  fs?: HeartbeatWriterFs;
  now?: () => Date;
  nonce?: () => string;
  debugLog?: (message: string) => void;
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
  const heartbeatFs = options.fs ?? nodeHeartbeatFs;
  const now = options.now ?? (() => new Date());
  const nonce = options.nonce ?? (() => Date.now().toString());
  const debugLog =
    options.debugLog ??
    ((message: string) => appendDebugLog("heartbeat-writer", message));

  const tick = (): void => {
    if (stopped) return;
    inFlight = inFlight.then(async () => {
      if (stopped) return;
      const stillOwner = await writeHeartbeat(
        lockPath,
        options.workerId,
        heartbeatFs,
        now,
        nonce,
      );
      if (!stillOwner) {
        stopped = true;
        clearInterval(timer);
        debugLog(
          `heartbeat writer stopped: lock identity no longer matches worker_id=${options.workerId}`,
        );
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
  fs: HeartbeatWriterFs,
  now: () => Date,
  nonce: () => string,
): Promise<boolean> {
  const current = await readCurrentLock(lockPath, fs);
  if (!current || current.worker_id !== workerId) return false;

  const next: WorkerLockContentsV2 = {
    ...current,
    schema_version: 2,
    last_heartbeat: now().toISOString(),
  };
  const tmpPath = `${lockPath}.tmp.${process.pid}.${nonce()}`;

  let handle: HeartbeatFileHandle | undefined;
  try {
    handle = await fs.open(tmpPath, "w");
    await handle.writeFile(JSON.stringify(next, null, 2));
    await handle.sync();
  } finally {
    await handle?.close();
  }

  const beforeRename = await readCurrentLock(lockPath, fs);
  if (!beforeRename || beforeRename.worker_id !== workerId) {
    await fs.rm(tmpPath, { force: true });
    return false;
  }

  await fs.rename(tmpPath, lockPath);
  return true;
}

async function readCurrentLock(
  lockPath: string,
  fs: HeartbeatWriterFs,
): Promise<WorkerLockContents | null> {
  const raw = await fs.readFile(lockPath, "utf8");
  if (!raw.trim()) return null;
  return JSON.parse(raw) as WorkerLockContents;
}

const nodeHeartbeatFs: HeartbeatWriterFs = {
  readFile,
  open,
  rename,
  rm,
};
