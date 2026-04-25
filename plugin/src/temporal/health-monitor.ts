/**
 * Worker Health Monitor (P1.6).
 *
 * Periodic liveness probe + bounded-budget worker restart. Designed as a
 * pure factory so callers inject `probe()` and `restart()` callbacks —
 * tests can drive the state machine without a real Temporal server, and
 * production wiring lives in `plugin-init.ts`.
 *
 * Schedule:
 *   - Probe every `intervalMs` (default 30s).
 *   - Each probe times out at `probeTimeoutMs` (default 3s) — a hung
 *     probe is treated as a failure.
 *   - On failure: log warning, attempt restart, increment counter.
 *   - Restart bounded to `maxRestarts` (default 10) attempts with
 *     exponential backoff per `backoffMs` (default
 *     `[1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000, 60000]`).
 *   - After `maxRestarts` consecutive failures: emit `[ADV:BLOCKED]`,
 *     invoke `onBlocked`, stop retrying.
 *   - A successful probe resets the restart counter.
 *
 * Lifecycle:
 *   - `start()` schedules the first probe.
 *   - `stop()` clears all scheduled timers + cancels in-flight backoff.
 *
 * See design.md § KD-5.
 */

import { createLogger } from "../utils/debug-log";

const logger = createLogger("health-monitor");

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_PROBE_TIMEOUT_MS = 3_000;
const DEFAULT_MAX_RESTARTS = 10;
/**
 * Default exponential backoff schedule (ms): 1s, 2s, 4s, 8s, 16s, 32s,
 * 60s, 60s, 60s, 60s. Capped at 60s — high enough to survive a flaky
 * Temporal restart, low enough to recover quickly. Covers
 * MAX_RESTARTS=10 by default.
 */
const DEFAULT_BACKOFF_MS: readonly number[] = [
  1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000, 60_000,
];

export interface HealthMonitorOptions {
  /** Returns true when the worker is healthy; throws or returns false when unhealthy. */
  probe: () => Promise<boolean>;
  /** Restart the worker. May throw — that's logged and counted as another failed restart. */
  restart: () => Promise<void>;
  /** Probe cadence. Default 30_000 ms. */
  intervalMs?: number;
  /** Per-probe hard timeout. Default 3_000 ms. */
  probeTimeoutMs?: number;
  /** Bounded restart attempts before giving up. Default 10. */
  maxRestarts?: number;
  /** Exponential backoff between restart attempts (ms). Default `[1s, 2s, 4s, 8s, 16s, 32s, 60s × 4]`. */
  backoffMs?: readonly number[];
  /** Invoked once when the restart budget is exhausted. */
  onBlocked?: () => void;
}

export interface HealthMonitorStats {
  /** Number of consecutive failed restart attempts. Resets on successful probe. */
  restartCount: number;
  /** Total successful probes since start. */
  successCount: number;
  /** Total failed probes (probe rejected or timed out). */
  failureCount: number;
  /** True when the restart budget is exhausted. Monitor stops scheduling further probes. */
  blocked: boolean;
}

export interface HealthMonitor {
  start(): void;
  stop(): void;
  getStats(): HealthMonitorStats;
}

/**
 * Compose a worker health probe (P1.10).
 *
 * Two-leg probe:
 *   1. Connection liveness via `workflowService.describeNamespace`.
 *      Confirms the gRPC channel is open and the server is responding.
 *   2. Worker round-trip via `workflowService.describeWorkflowExecution`
 *      against a sentinel workflow ID that's expected to NOT exist.
 *      A `WorkflowNotFound` response (or similar) is healthy proof
 *      that the server-side worker reachability check completes
 *      promptly. A hang here means the worker's event loop is stuck
 *      (zombie state).
 *
 * Either leg failing — including a timeout caught by the monitor's
 * outer `probeTimeoutMs` — counts as one health failure. The
 * single-counter shared budget keeps semantics simple: zombie restarts
 * count toward the same 10-attempt limit as connection failures.
 *
 * Returns false on bundle-missing or service-unavailable; throws on
 * the underlying RPC error (caller catches via `probeWithTimeout`).
 */
export function composeWorkerHealthProbe(input: {
  getBundle: () => {
    namespace: string;
    connection: unknown;
  } | null;
  /** Sentinel workflow ID for the round-trip leg. Default: `adv-healthcheck-sentinel`. */
  sentinelWorkflowId?: string;
}): () => Promise<boolean> {
  const sentinelId = input.sentinelWorkflowId ?? "adv-healthcheck-sentinel";
  return async () => {
    const bundle = input.getBundle();
    if (!bundle) return false;
    const svc = (
      bundle.connection as unknown as {
        workflowService?: {
          describeNamespace?: (req: { namespace: string }) => Promise<unknown>;
          describeWorkflowExecution?: (req: {
            namespace: string;
            execution: { workflowId: string };
          }) => Promise<unknown>;
        };
      }
    ).workflowService;
    if (
      !svc ||
      typeof svc.describeNamespace !== "function" ||
      typeof svc.describeWorkflowExecution !== "function"
    ) {
      return false;
    }

    // Leg 1: connection liveness
    await svc.describeNamespace({ namespace: bundle.namespace });

    // Leg 2: server↔worker round-trip via sentinel describe.
    // A `NotFound` rejection is the healthy outcome — server processed
    // the request promptly. We catch and treat as success.
    try {
      await svc.describeWorkflowExecution({
        namespace: bundle.namespace,
        execution: { workflowId: sentinelId },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        /NotFound|not[\s_]?found|NOT_FOUND|WorkflowExecutionNotFound/i.test(msg)
      ) {
        // Expected — server processed our request, sentinel just doesn't exist.
        return true;
      }
      // Other errors (Unavailable, ResourceExhausted, etc.) propagate
      // so the monitor can route through restart.
      throw err;
    }
    // Sentinel actually existed (rare but harmless) — still healthy.
    return true;
  };
}

/**
 * Race a probe against a timeout. Resolves false on timeout (treated as
 * a failed probe), so callers can route through the same failure path.
 */
function probeWithTimeout(
  probe: () => Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  return Promise.race([probe().catch(() => false), timeoutPromise]).finally(
    () => {
      if (timer !== undefined) clearTimeout(timer);
    },
  );
}

export function createHealthMonitor(
  options: HealthMonitorOptions,
): HealthMonitor {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const probeTimeoutMs = options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const maxRestarts = options.maxRestarts ?? DEFAULT_MAX_RESTARTS;
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;

  let intervalTimer: ReturnType<typeof setInterval> | undefined;
  let backoffTimer: ReturnType<typeof setTimeout> | undefined;
  const stats: HealthMonitorStats = {
    restartCount: 0,
    successCount: 0,
    failureCount: 0,
    blocked: false,
  };
  let probeInFlight = false;

  async function runProbe(): Promise<void> {
    if (stats.blocked) return;
    if (probeInFlight) return; // Avoid overlapping probes if previous still running
    probeInFlight = true;
    try {
      const healthy = await probeWithTimeout(options.probe, probeTimeoutMs);
      if (healthy) {
        stats.successCount += 1;
        // Reset restart counter on recovery — caller doesn't need to
        // track this; we treat a single healthy probe as proof the
        // worker is back. Keeps semantics simple.
        if (stats.restartCount > 0) {
          logger.info(
            `Worker recovered after ${stats.restartCount} restart attempts — resetting counter`,
          );
        }
        stats.restartCount = 0;
        return;
      }

      // Probe failed (rejected or timed out)
      stats.failureCount += 1;
      logger.warn(
        `Worker health probe failed (failure #${stats.failureCount}, restart ${stats.restartCount}/${maxRestarts})`,
      );

      // Budget exhaustion check: block when we'd be SCHEDULING the
      // (maxRestarts+1)th restart. The Nth restart is the last allowed
      // attempt; the next failure trips the block.
      if (stats.restartCount >= maxRestarts) {
        stats.blocked = true;
        logger.error(
          `[ADV:BLOCKED] Worker restart budget exhausted (${maxRestarts} attempts) — manual intervention required`,
        );
        options.onBlocked?.();
        stop();
        return;
      }

      // Schedule the restart
      const delay =
        backoffMs[Math.min(stats.restartCount, backoffMs.length - 1)] ?? 0;
      stats.restartCount += 1;

      const attemptNumber = stats.restartCount;
      logger.info(
        `Scheduling worker restart attempt ${attemptNumber}/${maxRestarts} in ${delay}ms`,
      );

      backoffTimer = setTimeout(() => {
        backoffTimer = undefined;
        void (async () => {
          try {
            await options.restart();
            logger.info(
              `Worker restart attempt ${attemptNumber}/${maxRestarts} completed`,
            );
          } catch (err) {
            logger.warn(
              `Worker restart attempt ${attemptNumber}/${maxRestarts} failed: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        })();
      }, delay);
    } finally {
      probeInFlight = false;
    }
  }

  function start(): void {
    if (intervalTimer !== undefined) return; // Already started
    logger.debug(
      `Health monitor started (interval=${intervalMs}ms, probeTimeout=${probeTimeoutMs}ms, maxRestarts=${maxRestarts})`,
    );
    intervalTimer = setInterval(() => {
      void runProbe();
    }, intervalMs);
    // Allow process to exit if this is the only timer
    if (typeof intervalTimer.unref === "function") intervalTimer.unref();
  }

  function stop(): void {
    if (intervalTimer !== undefined) {
      clearInterval(intervalTimer);
      intervalTimer = undefined;
    }
    if (backoffTimer !== undefined) {
      clearTimeout(backoffTimer);
      backoffTimer = undefined;
    }
    logger.debug("Health monitor stopped");
  }

  function getStats(): HealthMonitorStats {
    return { ...stats };
  }

  return { start, stop, getStats };
}
