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
import type { OrphanListClient } from "./list-orphan-session-queues";
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
function describeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > 200 ? `${msg.slice(0, 197)}...` : msg;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const orphans = await listOrphanSessionQueues(
      this.client,
      this.projectId,
      this.worker.queues,
    );
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
      // D7 — suppress shutdown-class refusals silently (no retry bump).
      if (isShutdownError(err)) return;
      this.recordFailure(target.queue, now, describeError(err));
    }
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
