import { open, readFile, rename, rm } from "fs/promises";
import { join } from "path";
import { appendDebugLog } from "../utils/debug-log";
import {
  STALE_HEARTBEAT_MS,
  WORKER_LOCK_FILENAME,
  type WorkerLockContents,
  type WorkerLockContentsV2,
} from "./worker-lock";
import { recordTemporalRuntimeFailure } from "./retry-wrapper";

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
  staleHeartbeatMs?: number;
  onWorkerExhausted?: () => void | Promise<void>;
}

export interface HeartbeatWriter {
  stop(): Promise<void>;
}

export function startHeartbeatWriter(
  options: StartHeartbeatWriterOptions,
): HeartbeatWriter {
  let stopped = false;
  let inFlight: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let consecutiveFailures = 0;
  let lastSuccessfulHeartbeatAt = 0;
  const lockPath = join(options.projectStateDir, WORKER_LOCK_FILENAME);
  const heartbeatFs = options.fs ?? nodeHeartbeatFs;
  const now = options.now ?? (() => new Date());
  const nonce = options.nonce ?? (() => Date.now().toString());
  const staleHeartbeatMs = options.staleHeartbeatMs ?? STALE_HEARTBEAT_MS;
  const debugLog =
    options.debugLog ??
    ((message: string) => appendDebugLog("heartbeat-writer", message));

  const clearScheduledTick = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  const stopForExhaustion = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    clearScheduledTick();
    try {
      await options.onWorkerExhausted?.();
    } catch (err) {
      debugLog(
        `heartbeat writer exhaustion callback failed: ${formatError(err)}`,
      );
    }
  };

  const scheduleNext = (delayMs: number): void => {
    if (stopped) return;
    clearScheduledTick();
    timer = setTimeout(tick, delayMs);
  };

  const tick = (): void => {
    if (stopped) return;
    inFlight = inFlight.then(async () => {
      if (stopped) return;
      try {
        const stillOwner = await writeHeartbeat(
          lockPath,
          options.workerId,
          heartbeatFs,
          now,
          nonce,
        );
        if (!stillOwner) {
          stopped = true;
          clearScheduledTick();
          debugLog(
            `heartbeat writer stopped: lock identity no longer matches worker_id=${options.workerId}`,
          );
          return;
        }

        consecutiveFailures = 0;
        lastSuccessfulHeartbeatAt = now().getTime();
        scheduleNext(options.intervalMs);
      } catch (err) {
        consecutiveFailures += 1;
        const message = formatError(err);
        debugLog(
          `heartbeat write failed (${consecutiveFailures} consecutive): ${message}`,
        );

        const nextDelayMs =
          consecutiveFailures >= 2
            ? options.intervalMs * 2
            : options.intervalMs;
        if (consecutiveFailures >= 2) {
          recordTemporalRuntimeFailure(
            new Error(`heartbeat write failed: ${message}`),
          );
        }

        const projectedAgeMs =
          now().getTime() - lastSuccessfulHeartbeatAt + nextDelayMs;
        if (consecutiveFailures >= 3 || projectedAgeMs > staleHeartbeatMs) {
          await stopForExhaustion();
          return;
        }

        scheduleNext(nextDelayMs);
      }
    });
  };

  lastSuccessfulHeartbeatAt = now().getTime();
  tick();

  return {
    async stop(): Promise<void> {
      stopped = true;
      clearScheduledTick();
      await inFlight;
    },
  };
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? "");
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
