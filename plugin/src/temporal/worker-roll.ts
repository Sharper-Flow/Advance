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
 *      compared against the generation the current child is running,
 *      tracked IN-MEMORY (seeded at spawn, updated on every roll) so a
 *      lagging lock stamp can never trigger a redundant re-roll.
 *   3. On drift, the monitor drives a first-class `restartChild()` roll
 *      (NOT crash-respawn, NOT shutdown — see worker-multi.ts) and only
 *      AFTER the replacement child's ready handshake records the new
 *      generation in-memory and hands it to the heartbeat controller,
 *      which stamps worker.lock atomically immediately after readiness.
 *
 * Hard rules (design constraints):
 *   - Owner-driven only: rolls happen exclusively when THIS process holds
 *     worker.lock (pid match). Never force-kill another session's worker,
 *     never reclaim an alive owner's lock.
 *   - Same generation is a no-op — including immediately after a roll.
 *   - Single-flight: overlapping beats share one in-flight roll. A failed
 *     roll leaves the recorded generation untouched so the next beat
 *     retries.
 *   - Single lock writer (AC5 no-lost-updates): the monitor NEVER writes
 *     worker.lock directly. The heartbeat (`worker-heartbeat.ts`) is the
 *     sole post-acquire lock writer; it persists the handed-off
 *     generation together with `last_heartbeat` in one atomic rewrite,
 *     so a concurrent beat can never clobber a completed roll's stamp.
 */

import { join } from "path";

import { readWorkerBundleGeneration } from "./worker-bundle-manifest";
import { readLockContents, WORKER_LOCK_FILENAME } from "./worker-lock";

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
  /**
   * Optional replay-verification gate. When provided, called before
   * restartChild() on every detected drift. If it returns
   * { passed: false }, the roll is refused. Skipped when
   * ADV_FORCE_DEPLOY=1 is set in the environment.
   *
   * When omitted (tests, back-compat, in-process workers), verification
   * is skipped — same fail-open posture as before this change.
   */
  verifyCandidateBundle?: (input: {
    workflowsPath: string;
    historiesDir: string;
  }) => Promise<{ passed: boolean; report?: unknown }>;
  /**
   * Sole-writer handoff: the worker.lock heartbeat controller's
   * `stampBundleGeneration`. Invoked with the generation the current child
   * is running — at spawn (via `initWorkerBundleRoll`) and after every
   * successful roll — so the heartbeat stamps it atomically immediately
   * after readiness, without waiting for the next scheduled beat.
   */
  stampBundleGeneration?: (generation: string) => Promise<void>;
  /**
   * Override-only handoff: used when `stampBundleGeneration` is not
   * provided (tests/back-compat). The generation is written together
   * with `last_heartbeat` on the next beat.
   */
  setBundleGeneration?: (generation: string) => void;
  /**
   * Generation the current child is already running (seeded by
   * `initWorkerBundleRoll` from the post-spawn manifest). When omitted,
   * the first check falls back to the lock's `bundle_generation`.
   */
  initialGeneration?: string | null;
  lockFilename?: string;
  /** Owning pid for the lock-owner check. Defaults to process.pid. */
  pid?: number;
  onRolled?: (generation: string) => void;
  onRollError?: (err: Error) => void;
}

export type WorkerRollCheckResult =
  | { rolled: true; generation: string }
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
  // Source of truth for the running child's bundle generation. Updated
  // synchronously the moment a roll's readiness gate passes, so a lock
  // stamp lagging up to one heartbeat interval cannot cause a re-roll.
  let currentGeneration: string | null = options.initialGeneration ?? null;

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
    // In-memory generation wins; the lock value is only a fallback for
    // monitors created without spawn information.
    const runningGeneration =
      currentGeneration ?? lock.bundle_generation ?? null;
    if (runningGeneration === manifestGeneration) {
      return { rolled: false, reason: "same_generation" };
    }

    // Replay-verification gate: verify candidate bundle before rolling.
    // Skipped when ADV_FORCE_DEPLOY=1 or when no callback is provided
    // (tests, back-compat, in-process workers).
    if (process.env.ADV_FORCE_DEPLOY !== "1") {
      if (options.verifyCandidateBundle) {
        const workflowsPath = join(options.bundleDir, "workflows.js");
        const historiesDir = join(
          options.bundleDir,
          "..",
          "src",
          "temporal",
          "__tests__",
          "replay",
          "histories",
        );
        try {
          const result = await options.verifyCandidateBundle({
            workflowsPath,
            historiesDir,
          });
          if (!result.passed) {
            return {
              rolled: false,
              reason: "roll_failed",
              error:
                "Candidate worker bundle failed replay verification — refusing to roll. Set ADV_FORCE_DEPLOY=1 to override.",
            };
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          options.onRollError?.(error);
          return {
            rolled: false,
            reason: "roll_failed",
            error: `Replay verification threw: ${error.message}`,
          };
        }
      }
    }

    try {
      // First-class roll: graceful SIGTERM drain, readiness-gated
      // replacement. Resolves only after the new child sent ready.
      await options.restartChild();

      // Readiness gate passed — the replacement child is running
      // `manifestGeneration` NOW. Record it in-memory immediately and
      // hand it to the heartbeat (the sole worker.lock writer) so the
      // generation is stamped atomically without waiting for the next
      // scheduled beat.
      currentGeneration = manifestGeneration;
      if (options.stampBundleGeneration) {
        await options.stampBundleGeneration(manifestGeneration);
      } else {
        options.setBundleGeneration?.(manifestGeneration);
      }

      lastRolled = manifestGeneration;
      options.onRolled?.(manifestGeneration);
      return { rolled: true, generation: manifestGeneration };
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
 * seed the monitor's in-memory generation and hand it to the heartbeat
 * (the sole worker.lock writer) so the next beat stamps the lock, then
 * return the drift monitor. This satisfies the "record the lock
 * generation only after child readiness" rule for initial spawn and keeps
 * the first post-start beat a same-generation no-op.
 *
 * Best-effort: a missing manifest (or an unwired heartbeat handoff) never
 * prevents monitor creation — the next beat simply sees drift and
 * converges via a roll.
 */
export async function initWorkerBundleRoll(
  options: WorkerBundleRollMonitorOptions,
): Promise<WorkerBundleRollMonitor> {
  const manifestGeneration = await readWorkerBundleGeneration(
    options.bundleDir,
  );
  if (manifestGeneration) {
    if (options.stampBundleGeneration) {
      await options.stampBundleGeneration(manifestGeneration);
    } else {
      options.setBundleGeneration?.(manifestGeneration);
    }
  }
  return createWorkerBundleRollMonitor({
    ...options,
    initialGeneration: manifestGeneration ?? null,
  });
}
