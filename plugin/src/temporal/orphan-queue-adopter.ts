/**
 * OrphanQueueAdopter — coordinator that adopts one orphan session task queue
 * per heartbeat tick (rq-isolSessionTaskQueue05; design D2-D8).
 *
 * Per-tick contract:
 *  1. single-flight (`scanInFlight`) — overlapping ticks skip;
 *  2. enumerate orphans via `listOrphanSessionQueues` (FIFO-sorted, idempotent
 *     against `worker.queues`);
 *  3. pick the first orphan not in cooldown;
 *  4. `registerQueue` raced against a hard per-tick timeout;
 *  5. on failure, bump attempt count; after `maxAttempts`, enter cooldown;
 *  6. shutdown-class errors are suppressed (never counted);
 *  7. `scanInFlight` is released in `finally` so a stalled register or never-
 *     arriving ACK cannot hold single-flight indefinitely (DDC2 / R9).
 *
 * No worker-lifecycle or IPC changes — reuses the existing `registerQueue`
 * surface. Phase B wires this into the heartbeat `onBeat` (env-gated).
 */
import { listOrphanSessionQueues } from "./list-orphan-session-queues";
import type {
  OrphanListClient,
  OrphanSessionQueue,
} from "./list-orphan-session-queues";
import { markStale } from "./session-readiness";

/** Minimal worker shape the coordinator depends on (structural). */
export interface OrphanAdopterWorker {
  registerQueue(queue: string): Promise<void>;
  /** Currently-polled queues (read live each tick for idempotency). */
  readonly queues: readonly string[];
}

export interface OrphanQueueAdopterOptions {
  client: OrphanListClient;
  projectId: string;
  worker: OrphanAdopterWorker;
  /** Per-tick hard timeout (DDC2; default 8 s, just under the 10 s heartbeat). */
  tickTimeoutMs?: number;
  /** Retry cap before cooldown (DDC4; default 3). */
  maxAttempts?: number;
  /** Cooldown duration after the cap (DDC5; default 5 min). */
  cooldownMs?: number;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

export interface PerQueueAdoptionState {
  attemptCount: number;
  lastAttemptAt: number;
  cooldownUntil: number;
  /** Most recent failure reason (AC6 operability). Cleared on success. */
  lastError?: string;
}

export interface OrphanQueueAdopterState {
  scanInFlight: boolean;
  perQueueState: Map<string, PerQueueAdoptionState>;
}

export interface OrphanQueueAdoptionDiagnostics {
  scanInFlight: boolean;
  /** Total bounded-enumeration failures (timeout or reject) since start. */
  scanFailureCount: number;
  /** Consecutive enumeration failures; resets to 0 on any successful scan. */
  consecutiveScanFailures: number;
  /** Most recent enumeration failure reason. Cleared on success. */
  lastScanError?: string;
  /** Epoch ms the most recent enumeration attempt began. */
  lastScanStartedAt: number;
  /** Duration of the most recent enumeration attempt. */
  lastScanDurationMs: number;
  /**
   * Count of shutdown-class register refusals suppressed without a retry bump.
   * Surfaced so suppression cannot masquerade as "no adoption attempts made".
   */
  suppressedShutdownCount: number;
  trackedQueues: Array<{
    queue: string;
    attemptCount: number;
    lastAttemptAt: number;
    cooldownUntil: number;
    inCooldown: boolean;
    /** Most recent failure reason, surfaced so operators can diagnose a capped/cooldown queue (AC6). */
    lastError?: string;
  }>;
}

/**
 * Typed adoption health verdict.
 *
 * Adoption being *constructed* is not the same as adoption *working*. In #327
 * the adopter was enabled, live, and completely broken, yet every probe
 * reported healthy because nothing asserted forward progress. These states
 * exist so health surfaces can assert progress, not just presence.
 */
export type OrphanAdoptionHealth =
  | { state: "ok" }
  | { state: "stuck_scan"; stuckForMs: number; lastScanError?: string }
  | {
      state: "failing_scans";
      consecutiveScanFailures: number;
      lastScanError?: string;
    };

/**
 * A scan in flight longer than this is stuck, not merely slow: enumeration and
 * register are each independently bounded by `tickTimeoutMs` (8 s default), so
 * roughly three driver ticks without settling means the latch is held.
 */
export const ORPHAN_STUCK_SCAN_MS = 30_000;

/** Consecutive failed enumerations before adoption is declared unhealthy. */
export const ORPHAN_MAX_CONSECUTIVE_SCAN_FAILURES = 3;

/**
 * Pure predicate over a diagnostics snapshot. Single source of truth so
 * `adv_doctor` and `adv_status view:health` cannot drift apart.
 */
export function evaluateOrphanAdoptionHealth(
  diagnostics: OrphanQueueAdoptionDiagnostics,
  now: number,
  opts: { stuckScanMs?: number; maxConsecutiveScanFailures?: number } = {},
): OrphanAdoptionHealth {
  const stuckScanMs = opts.stuckScanMs ?? ORPHAN_STUCK_SCAN_MS;
  const maxFailures =
    opts.maxConsecutiveScanFailures ?? ORPHAN_MAX_CONSECUTIVE_SCAN_FAILURES;

  if (diagnostics.scanInFlight && diagnostics.lastScanStartedAt > 0) {
    const stuckForMs = now - diagnostics.lastScanStartedAt;
    if (stuckForMs >= stuckScanMs) {
      return {
        state: "stuck_scan",
        stuckForMs,
        ...(diagnostics.lastScanError
          ? { lastScanError: diagnostics.lastScanError }
          : {}),
      };
    }
  }

  if (diagnostics.consecutiveScanFailures >= maxFailures) {
    return {
      state: "failing_scans",
      consecutiveScanFailures: diagnostics.consecutiveScanFailures,
      ...(diagnostics.lastScanError
        ? { lastScanError: diagnostics.lastScanError }
        : {}),
    };
  }

  return { state: "ok" };
}

const DEFAULT_TICK_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_COOLDOWN_MS = 5 * 60_000;

/** Error string fragment marking a worker-shutdown refusal (worker-multi.ts). */
const SHUTDOWN_MARKER = "shutting down";

function isShutdownError(err: unknown): boolean {
  return (
    err instanceof Error && err.message.toLowerCase().includes(SHUTDOWN_MARKER)
  );
}

/** Bound an error to a diagnostic-safe string (AC6 lastError surface). */
export function describeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > 200 ? `${msg.slice(0, 197)}...` : msg;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A `delay` whose timer can be cleared once the race is decided, so a fast
 * winner does not leave an 8 s timer pending on every driver tick.
 */
function cancellableDelay(ms: number): {
  promise: Promise<void>;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return {
    promise,
    cancel: () => {
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}

/**
 * Raised when Visibility enumeration exceeds the per-tick bound. Typed so the
 * blackout in #327 (`scanInFlight: true` + `attemptCount: 0`, forever) is a
 * named, counted condition rather than an invisible suspended await.
 */
export class OrphanScanTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`orphan enumeration timed out after ${timeoutMs}ms`);
    this.name = "OrphanScanTimeoutError";
  }
}

/**
 * Kill-switch env flag for orphan-queue adoption (rq-isolSessionTaskQueue05 /
 * DDC8). Adoption is always-on in production — this flag is an emergency
 * disable path, NOT an opt-in. Default ON; only `"0"` disables. Reconciled to
 * kill-switch-default-on because the deployed bundle already wires adoption
 * unconditionally; a default-off flag would regress that live behavior.
 */
export const ADV_ORPHAN_QUEUE_ADOPTION_ENV = "ADV_ORPHAN_QUEUE_ADOPTION";
export const ADV_ORPHAN_QUEUE_ADOPTION_DISABLE = "0";

/**
 * Returns `true` (adoption enabled) unless `ADV_ORPHAN_QUEUE_ADOPTION=0`.
 * Unset, `"1"`, empty, and unrecognized values all enable adoption — only the
 * exact `"0"` sentinel disables it. Injectable `env` for deterministic tests.
 */
export function isOrphanQueueAdoptionEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env[ADV_ORPHAN_QUEUE_ADOPTION_ENV] !== ADV_ORPHAN_QUEUE_ADOPTION_DISABLE
  );
}

export class OrphanQueueAdopter {
  private readonly client: OrphanListClient;
  private readonly projectId: string;
  private readonly worker: OrphanAdopterWorker;
  private readonly tickTimeoutMs: number;
  private readonly maxAttempts: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  private scanInFlight = false;
  private readonly perQueueState = new Map<string, PerQueueAdoptionState>();

  // Enumeration-phase health (#327). Tracked separately from per-queue retry
  // state because a failed scan has no target queue to attribute the failure to.
  private scanFailureCount = 0;
  private consecutiveScanFailures = 0;
  private lastScanError: string | undefined;
  private lastScanStartedAt = 0;
  private lastScanDurationMs = 0;
  private suppressedShutdownCount = 0;

  constructor(options: OrphanQueueAdopterOptions) {
    this.client = options.client;
    this.projectId = options.projectId;
    this.worker = options.worker;
    this.tickTimeoutMs = options.tickTimeoutMs ?? DEFAULT_TICK_TIMEOUT_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.now = options.now ?? (() => Date.now());
  }

  /** Adopt at most one orphan queue. Safe to call every heartbeat tick. */
  async adoptNextOrphan(): Promise<void> {
    // DDC7 — single-flight: overlapping ticks skip.
    if (this.scanInFlight) return;
    this.scanInFlight = true;
    try {
      await this.runOneAdoptionTick();
    } finally {
      // DDC2 / R9 — always release, even on timeout or thrown register.
      this.scanInFlight = false;
    }
  }

  private async runOneAdoptionTick(): Promise<void> {
    // D1 — enumerate + FIFO sort + idempotency against currently-polled queues.
    //
    // R10 (#327) — this await MUST be bounded and caught. Previously it sat
    // outside the try block below, so a Visibility stream that never yielded
    // suspended the tick forever: `finally` never ran (scanInFlight stuck true),
    // the register race never started (its timeout is downstream of this await),
    // and recordFailure never ran (attemptCount stuck at 0) — a silent blackout
    // that every liveness probe reported as healthy.
    let orphans: OrphanSessionQueue[];
    try {
      orphans = await this.enumerateOrphansBounded();
    } catch (err) {
      this.recordScanFailure(describeError(err));
      return;
    }
    this.recordScanSuccess();
    if (orphans.length === 0) return;

    const now = this.now();

    // D3 — pick the oldest orphan not currently in cooldown.
    const target = orphans.find((o) => {
      const state = this.perQueueState.get(o.queue);
      return !state || state.cooldownUntil <= now;
    });
    if (!target) return;

    try {
      // DDC2 — race the register against the hard per-tick timeout. A LATE
      // settlement of registerQueue (after the timeout wins) is handled by the
      // Promise.race internals — both branches have rejection handlers attached
      // by race, so a late reject cannot surface as an unhandledRejection. A
      // late resolve after timeout is tolerated: the count is cosmetic because
      // worker.queues excludes an actually-adopted queue on the next tick
      // (self-healing). During planned shutdown the worker may never reply; the
      // timeout then records a best-effort failure, but the heartbeat is torn
      // down concurrently so impact is bounded (documented limitation, D7).
      const outcome = await Promise.race([
        this.worker
          .registerQueue(target.queue)
          .then(() => ({ ok: true as const })),
        delay(this.tickTimeoutMs).then(() => ({ ok: false as const })),
      ]);
      if (outcome.ok) {
        // Success clears retry/cooldown state (and lastError) for this queue.
        this.perQueueState.set(target.queue, {
          attemptCount: 0,
          lastAttemptAt: now,
          cooldownUntil: 0,
          lastError: undefined,
        });
      } else {
        // Worker observed dead/unresponsive during the adoption heartbeat:
        // mark the target queue stale so the readiness barrier re-probes before
        // the next mutation (KD5 / AC4). Existing retry/cooldown accounting
        // continues unchanged (DONT3).
        markStale(target.queue);
        this.recordFailure(
          target.queue,
          now,
          `registerQueue timed out after ${this.tickTimeoutMs}ms`,
        );
      }
    } catch (err) {
      // Worker observed dead during the adoption heartbeat: mark the target
      // queue stale so the readiness barrier re-probes before the next mutation
      // (KD5 / AC4). Existing shutdown-error suppression and retry accounting
      // continue unchanged (DONT3).
      markStale(target.queue);
      // D7 — suppress shutdown-class refusals (no retry bump), but COUNT them.
      // Silent suppression is indistinguishable from "no adoption was ever
      // attempted" in diagnostics, which is precisely the ambiguity that made
      // #327 hard to classify.
      if (isShutdownError(err)) {
        this.suppressedShutdownCount += 1;
        return;
      }
      this.recordFailure(target.queue, now, describeError(err));
    }
  }

  /**
   * Enumerate orphans under a hard wall-clock bound, cancelling the underlying
   * Visibility gRPC call if the bound is exceeded.
   *
   * The bound is enforced twice, because one alone is insufficient:
   *  - `deadlineMs` inside the helper breaks the collection loop between
   *    records — handles a slow/large stream;
   *  - the race here handles a stream that stalls BEFORE yielding anything,
   *    which the in-loop check can never observe.
   *
   * On timeout the AbortController is fired so the connection cancels the
   * in-flight request. Without that, each 10 s driver tick would strand another
   * Visibility stream.
   */
  private async enumerateOrphansBounded(): Promise<OrphanSessionQueue[]> {
    const controller = new AbortController();
    const timeout = cancellableDelay(this.tickTimeoutMs);
    this.lastScanStartedAt = this.now();

    const scan = listOrphanSessionQueues(
      this.client,
      this.projectId,
      this.worker.queues,
      {
        signal: controller.signal,
        deadlineMs: this.tickTimeoutMs,
        now: this.now,
      },
    );

    try {
      const outcome = await Promise.race([
        scan.then((queues) => ({ ok: true as const, queues })),
        timeout.promise.then(() => ({ ok: false as const })),
      ]);
      if (outcome.ok) return outcome.queues;

      controller.abort();
      // `Promise.race` already attached handlers to both branches, so a late
      // rejection cannot surface as an unhandledRejection; this explicit no-op
      // keeps that guarantee local and obvious.
      void scan.catch(() => {});
      throw new OrphanScanTimeoutError(this.tickTimeoutMs);
    } finally {
      timeout.cancel();
    }
  }

  /** Record a failed enumeration (AC: the stall is counted, not silent). */
  private recordScanFailure(reason: string): void {
    this.scanFailureCount += 1;
    this.consecutiveScanFailures += 1;
    this.lastScanError = reason;
    this.lastScanDurationMs = this.now() - this.lastScanStartedAt;
  }

  /** Clear enumeration failure state after a scan completes. */
  private recordScanSuccess(): void {
    this.consecutiveScanFailures = 0;
    this.lastScanError = undefined;
    this.lastScanDurationMs = this.now() - this.lastScanStartedAt;
  }

  /** Bump attempt count; enter cooldown once the cap is reached (D4 / DDC4-5). */
  private recordFailure(queue: string, now: number, reason?: string): void {
    const prev = this.perQueueState.get(queue);
    const attemptCount = (prev?.attemptCount ?? 0) + 1;
    const cooldownUntil =
      attemptCount >= this.maxAttempts ? now + this.cooldownMs : 0;
    this.perQueueState.set(queue, {
      attemptCount,
      lastAttemptAt: now,
      cooldownUntil,
      lastError: reason,
    });
  }

  /** Snapshot for diagnostics / testing (Phase C surfaces this via getDiagnostics). */
  getState(): OrphanQueueAdopterState {
    return {
      scanInFlight: this.scanInFlight,
      perQueueState: this.perQueueState,
    };
  }

  /**
   * Serializable diagnostic surface consumed by `getOrphanQueueAdoptionDiagnostics`
   * → `adv_doctor` + `adv_status view:health` (rq-isolSessionTaskQueue05 / AC7).
   */
  getDiagnostics(): OrphanQueueAdoptionDiagnostics {
    const now = this.now();
    return {
      scanInFlight: this.scanInFlight,
      scanFailureCount: this.scanFailureCount,
      consecutiveScanFailures: this.consecutiveScanFailures,
      lastScanError: this.lastScanError,
      lastScanStartedAt: this.lastScanStartedAt,
      lastScanDurationMs: this.lastScanDurationMs,
      suppressedShutdownCount: this.suppressedShutdownCount,
      trackedQueues: [...this.perQueueState.entries()].map(([queue, s]) => ({
        queue,
        attemptCount: s.attemptCount,
        lastAttemptAt: s.lastAttemptAt,
        cooldownUntil: s.cooldownUntil,
        inCooldown: s.cooldownUntil > now,
        lastError: s.lastError,
      })),
    };
  }
}
