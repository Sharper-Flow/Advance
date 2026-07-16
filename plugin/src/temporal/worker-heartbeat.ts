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
  /**
   * Fire-and-forget hook invoked synchronously after each SUCCESSFUL beat
   * (v2 lock renewed). Not invoked when the beat early-returns (stopped,
   * unserviceable past grace, or no v2 lock). Used by plugin-init to run
   * the worker bundle drift check on the heartbeat cadence; the hook must
   * be cheap and non-blocking (e.g. `void monitor.checkNow()`).
   */
  onBeat?: () => void;
  /**
   * Testing seam: invoked after the lock is read and before the renewed
   * contents are constructed and atomically rewritten. Lets interleaving
   * tests park a beat inside its read-modify-write window to inject a
   * concurrent generation handoff. Not used in production.
   */
  onBeatLockRead?: () => void | Promise<void>;
  setIntervalFn?: (handler: () => void, timeout: number) => IntervalHandle;
  clearIntervalFn?: (timer: IntervalHandle) => void;
}

export interface WorkerLockHeartbeatController {
  beatNow: () => Promise<void>;
  /**
   * Record the bundle generation the worker child is now running. The
   * heartbeat is the SOLE writer of worker.lock after acquire: the
   * handed-off generation is written together with `last_heartbeat` in
   * the same atomic rewrite on the next beat (and every beat after).
   * Because the roll path (`worker-roll.ts`) never writes the lock
   * directly and this override is applied at write time — not read from
   * the beat's lock snapshot — a roll can never lose its generation to
   * an interleaved beat (AC5 no-lost-updates).
   */
  setBundleGeneration: (generation: string) => void;
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
  // Generation handed off by the roll path. Applied at write time on
  // every subsequent beat, so the value persisted never depends on how
  // stale the beat's lock snapshot is.
  let bundleGenerationOverride: string | null = null;

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

    const contents = await readLockContents(lockPath).catch(() => null);
    if (!contents || contents.schema_version !== 2) return;
    if (options.onBeatLockRead) {
      await options.onBeatLockRead();
    }
    const next: WorkerLockContentsV2 = {
      ...contents,
      last_heartbeat: current.toISOString(),
      ...(bundleGenerationOverride !== null
        ? { bundle_generation: bundleGenerationOverride }
        : {}),
    };
    await writeLockContentsAtomically(lockPath, next);

    if (options.onBeat) {
      try {
        options.onBeat();
      } catch {
        // Fire-and-forget hook must never break the heartbeat cadence.
      }
    }
  };

  const timer = setIntervalFn(() => {
    void beatNow();
  }, intervalMs);
  timer.unref?.();

  return {
    beatNow,
    setBundleGeneration: (generation: string) => {
      bundleGenerationOverride = generation;
    },
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
