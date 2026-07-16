/**
 * Worker bundle roll monitor — owner-driven self-roll on bundle drift.
 *
 * The out-of-process Temporal worker child loads
 * `dist/temporal/worker.js` + `dist/temporal/workflows.js`. When a deploy
 * replaces those files, the RUNNING child keeps executing the old bundle
 * until it is restarted. This monitor closes that gap for the lock-owning
 * session:
 *
 *   1. Each heartbeat beat (fire-and-forget — see worker-heartbeat.ts)
 *      calls `checkNow()`.
 *   2. The on-disk manifest generation (`bundle-manifest.json`) is
 *      compared against the `bundle_generation` stamped in worker.lock.
 *   3. On drift, the monitor drives a first-class `restartChild()` roll
 *      (NOT crash-respawn, NOT shutdown — see worker-multi.ts) and only
 *      AFTER the replacement child's ready handshake stamps the lock with
 *      the new generation via a readback-validated write.
 *
 * Hard rules (design constraints):
 *   - Owner-driven only: rolls happen exclusively when THIS process holds
 *     worker.lock (pid match). Never force-kill another session's worker,
 *     never reclaim an alive owner's lock.
 *   - Same generation is a no-op — including immediately after a roll.
 *   - Single-flight: overlapping beats share one in-flight roll. A failed
 *     roll leaves the lock generation untouched so the next beat retries.
 */

import { join } from "path";

import { readWorkerBundleGeneration } from "./worker-bundle-manifest";
import {
  readLockContents,
  updateWorkerLockBundleGeneration,
  WORKER_LOCK_FILENAME,
} from "./worker-lock";

export interface WorkerBundleRollMonitorOptions {
  /** Project state directory holding worker.lock. */
  projectStateDir: string;
  /** Directory holding worker.js/workflows.js/bundle-manifest.json. */
  bundleDir: string;
  /**
   * First-class child roll (readiness-gated). Typically
   * `() => outOfProcessWorker.restartChild()`.
   */
  restartChild: () => Promise<void>;
  lockFilename?: string;
  /** Owning pid for the lock-owner check. Defaults to process.pid. */
  pid?: number;
  onRolled?: (generation: string) => void;
  onRollError?: (err: Error) => void;
}

export type WorkerRollCheckResult =
  | { rolled: true; generation: string; lockUpdated: boolean }
  | {
      rolled: false;
      reason:
        | "roll_in_flight"
        | "manifest_unavailable"
        | "lock_unavailable"
        | "not_lock_owner"
        | "same_generation"
        | "roll_failed";
      error?: string;
    };

export interface WorkerBundleRollMonitor {
  /**
   * Single drift check + roll-if-needed. Safe to call fire-and-forget
   * from every heartbeat beat — single-flights internally.
   */
  checkNow: () => Promise<WorkerRollCheckResult>;
  /** Generation of the last successful roll, if any. */
  lastRolledGeneration: () => string | null;
}

export function createWorkerBundleRollMonitor(
  options: WorkerBundleRollMonitorOptions,
): WorkerBundleRollMonitor {
  const lockPath = join(
    options.projectStateDir,
    options.lockFilename ?? WORKER_LOCK_FILENAME,
  );
  const ownerPid = options.pid ?? process.pid;

  let rollInFlight: Promise<WorkerRollCheckResult> | null = null;
  let lastRolled: string | null = null;

  async function checkAndRoll(): Promise<WorkerRollCheckResult> {
    const manifestGeneration = await readWorkerBundleGeneration(
      options.bundleDir,
    );
    if (!manifestGeneration) {
      return { rolled: false, reason: "manifest_unavailable" };
    }

    const lock = await readLockContents(lockPath).catch(() => null);
    if (!lock || lock.schema_version !== 2) {
      return { rolled: false, reason: "lock_unavailable" };
    }
    if (lock.pid !== ownerPid) {
      // Owner-driven self-roll only. Another (alive) session owns the
      // worker — never roll someone else's child.
      return { rolled: false, reason: "not_lock_owner" };
    }
    if (lock.bundle_generation === manifestGeneration) {
      return { rolled: false, reason: "same_generation" };
    }

    try {
      // First-class roll: graceful SIGTERM drain, readiness-gated
      // replacement. Resolves only after the new child sent ready.
      await options.restartChild();

      // Readiness gate passed — stamp the lock with the generation the
      // replacement child is actually running (readback-validated).
      const stamp = await updateWorkerLockBundleGeneration(
        options.projectStateDir,
        {
          bundleGeneration: manifestGeneration,
          ...(options.lockFilename
            ? { lockFilename: options.lockFilename }
            : {}),
        },
      );

      lastRolled = manifestGeneration;
      options.onRolled?.(manifestGeneration);
      return {
        rolled: true,
        generation: manifestGeneration,
        lockUpdated: stamp.updated,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      options.onRollError?.(error);
      return {
        rolled: false,
        reason: "roll_failed",
        error: error.message,
      };
    }
  }

  return {
    checkNow(): Promise<WorkerRollCheckResult> {
      // Single-flight latch: heartbeat beats are fire-and-forget, so a
      // beat that arrives mid-roll (or mid-check) skips rather than
      // stacking a second roll.
      if (rollInFlight) {
        return Promise.resolve({ rolled: false, reason: "roll_in_flight" });
      }
      const run = checkAndRoll();
      rollInFlight = run;
      const clearLatch = () => {
        if (rollInFlight === run) rollInFlight = null;
      };
      run.then(clearLatch, clearLatch);
      return run;
    },

    lastRolledGeneration(): string | null {
      return lastRolled;
    },
  };
}

/**
 * Post-spawn convergence: a freshly started worker child was created from
 * the CURRENT on-disk bundle and has already passed its ready handshake —
 * stamp the lock with the current manifest generation (no roll needed),
 * then return the drift monitor. This satisfies the "update the lock
 * generation only after child readiness" rule for initial spawn and keeps
 * the first post-start beat a same-generation no-op.
 *
 * Best-effort: a stamp failure (or a missing manifest) never prevents
 * monitor creation — the next beat simply sees drift and converges via a
 * roll.
 */
export async function initWorkerBundleRoll(
  options: WorkerBundleRollMonitorOptions,
): Promise<WorkerBundleRollMonitor> {
  const manifestGeneration = await readWorkerBundleGeneration(
    options.bundleDir,
  );
  if (manifestGeneration) {
    await updateWorkerLockBundleGeneration(options.projectStateDir, {
      bundleGeneration: manifestGeneration,
      ...(options.lockFilename ? { lockFilename: options.lockFilename } : {}),
    }).catch(() => undefined);
  }
  return createWorkerBundleRollMonitor(options);
}
