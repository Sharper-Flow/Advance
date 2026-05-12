import { randomUUID } from "crypto";
import { rename, writeFile } from "fs/promises";
import { join } from "path";

import {
  releaseWorkerLock,
  readLockContents,
  WORKER_LOCK_FILENAME,
  type WorkerLockContentsV2,
} from "./worker-lock";

export const WORKER_HEARTBEAT_INTERVAL_MS = 10_000;
export const SERVICEABILITY_GRACE_MS = 90_000;

type IntervalHandle = NodeJS.Timeout;

export interface WorkerLockHeartbeatOptions {
  lockFilename?: string;
  intervalMs?: number;
  serviceabilityGraceMs?: number;
  now?: () => Date;
  isServiceable?: () => boolean;
  setIntervalFn?: (handler: () => void, timeout: number) => IntervalHandle;
  clearIntervalFn?: (timer: IntervalHandle) => void;
}

export interface WorkerLockHeartbeatController {
  beatNow: () => Promise<void>;
  stop: () => Promise<void>;
  isStopped: () => boolean;
}

export function startWorkerLockHeartbeat(
  projectStateDir: string,
  options: WorkerLockHeartbeatOptions = {},
): WorkerLockHeartbeatController {
  const lockFilename = options.lockFilename ?? WORKER_LOCK_FILENAME;
  const lockPath = join(projectStateDir, lockFilename);
  const intervalMs = options.intervalMs ?? WORKER_HEARTBEAT_INTERVAL_MS;
  const serviceabilityGraceMs =
    options.serviceabilityGraceMs ?? SERVICEABILITY_GRACE_MS;
  const now = options.now ?? (() => new Date());
  const isServiceable = options.isServiceable ?? (() => true);
  const setIntervalFn: (
    handler: () => void,
    timeout: number,
  ) => IntervalHandle =
    options.setIntervalFn ??
    ((handler, timeout) => setInterval(handler, timeout) as IntervalHandle);
  const clearIntervalFn: (timer: IntervalHandle) => void =
    options.clearIntervalFn ?? ((timer) => clearInterval(timer));

  let stopped = false;
  let firstUnserviceableAt: number | null = null;

  const stopRenewing = () => {
    if (stopped) return;
    stopped = true;
    clearIntervalFn(timer);
  };

  const beatNow = async (): Promise<void> => {
    if (stopped) return;

    const current = now();
    if (!isServiceable()) {
      firstUnserviceableAt ??= current.getTime();
      if (current.getTime() - firstUnserviceableAt > serviceabilityGraceMs) {
        stopRenewing();
        return;
      }
    } else {
      firstUnserviceableAt = null;
    }

    const contents = await readLockContents(lockPath);
    if (!contents || contents.schema_version !== 2) return;
    const next: WorkerLockContentsV2 = {
      ...contents,
      last_heartbeat: current.toISOString(),
    };
    await writeLockContentsAtomically(lockPath, next);
  };

  const timer = setIntervalFn(() => {
    void beatNow();
  }, intervalMs);
  timer.unref?.();

  return {
    beatNow,
    stop: async () => {
      stopRenewing();
      await releaseWorkerLock(projectStateDir, { lockFilename });
    },
    isStopped: () => stopped,
  };
}

async function writeLockContentsAtomically(
  lockPath: string,
  contents: WorkerLockContentsV2,
): Promise<void> {
  const tmpPath = `${lockPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, JSON.stringify(contents, null, 2));
  await rename(tmpPath, lockPath);
}
