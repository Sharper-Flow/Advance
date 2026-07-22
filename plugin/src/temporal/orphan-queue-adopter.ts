/**
 * OrphanQueueAdopter coordinator (rq-isolSessionTaskQueue05 / D2-D8).
 *
 * State machine that adopts one orphaned session queue per heartbeat tick.
 * Key properties:
 *   - Single-flight (scanInFlight): concurrent adoptNextOrphan calls don't overlap
 *   - Bounded: 8s hard timeout per tick (Promise.race + finally-release)
 *   - Cooldown: 3 failed attempts → 5-min cooldown (not permanent failure)
 *   - FIFO: picks oldest orphan first (from listOrphanSessionQueues sorted output)
 *   - Shutdown-safe: suppresses shutdown-class registerQueue errors
 *   - Process-local idempotency via worker.queues (D8)
 */

import {
  listOrphanSessionQueues,
  type OrphanListClient,
} from "./list-orphan-session-queues";

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/** Minimal worker shape for queue adoption. */
export interface AdoptableWorker {
  registerQueue(taskQueue: string): Promise<void>;
  readonly queues: readonly string[];
}

export interface OrphanQueueAdopterOptions {
  client: OrphanListClient;
  projectId: string;
  worker: AdoptableWorker;
  timeoutMs?: number;
  maxAttempts?: number;
  cooldownMs?: number;
}

interface PerQueueState {
  attemptCount: number;
  lastAttemptAt: Date;
  cooldownUntil: Date | null;
  adopted: boolean;
}

export interface OrphanQueueAdopterDiagnostics {
  adoptedQueues: string[];
  cooldownQueues: Array<{
    queue: string;
    cooldownUntil: Date;
    attemptCount: number;
  }>;
  scanInFlight: boolean;
}

function isShutdownError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /shutting down/i.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OrphanQueueAdopter {
  private readonly client: OrphanListClient;
  private readonly projectId: string;
  private readonly worker: AdoptableWorker;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly cooldownMs: number;

  private scanInFlight = false;
  private readonly perQueueState = new Map<string, PerQueueState>();

  constructor(options: OrphanQueueAdopterOptions) {
    this.client = options.client;
    this.projectId = options.projectId;
    this.worker = options.worker;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  }

  /**
   * Adopt one orphan queue. Called from heartbeat onBeat (10s cadence).
   * Single-flight — if already scanning, returns immediately.
   */
  async adoptNextOrphan(): Promise<void> {
    if (this.scanInFlight) return;
    this.scanInFlight = true;
    try {
      await this.doAdoptOne();
    } finally {
      // DDC2: always release, even on timeout or error
      this.scanInFlight = false;
    }
  }

  private async doAdoptOne(): Promise<void> {
    // D1: discover orphans (sorted oldest-first by listOrphanSessionQueues)
    const orphans = await listOrphanSessionQueues(
      this.client,
      this.projectId,
      this.worker.queues,
    );
    if (orphans.length === 0) return;

    // D3: pick first queue not in cooldown (FIFO after client-side sort)
    const now = new Date();
    const candidate = orphans.find((o) => {
      const state = this.perQueueState.get(o.queue);
      if (!state) return true;
      if (state.adopted) return false; // already adopted
      if (state.cooldownUntil && state.cooldownUntil > now) return false; // in cooldown
      return true;
    });
    if (!candidate) return;

    const queue = candidate.queue;
    let state = this.perQueueState.get(queue);
    if (!state) {
      state = {
        attemptCount: 0,
        lastAttemptAt: now,
        cooldownUntil: null,
        adopted: false,
      };
      this.perQueueState.set(queue, state);
    }
    state.lastAttemptAt = now;
    state.attemptCount++;

    // D2: adopt with hard timeout
    try {
      await Promise.race([
        this.worker.registerQueue(queue),
        sleep(this.timeoutMs).then(() => {
          throw new Error(`adoption timeout for ${queue}`);
        }),
      ]);
      // Success
      state.adopted = true;
    } catch (err) {
      if (isShutdownError(err)) {
        // D7: suppress shutdown errors silently
        return;
      }
      // D4: after maxAttempts, enter cooldown
      if (state.attemptCount >= this.maxAttempts) {
        state.cooldownUntil = new Date(now.getTime() + this.cooldownMs);
      }
    }
  }

  /**
   * Diagnostic surface for adv_temporal_diagnose + adv_status.
   * DDC3: cap at 50 entries.
   */
  getDiagnostics(): OrphanQueueAdopterDiagnostics {
    const adoptedQueues: string[] = [];
    const cooldownQueues: OrphanQueueAdopterDiagnostics["cooldownQueues"] = [];
    const now = new Date();

    for (const [queue, state] of this.perQueueState) {
      if (state.adopted) {
        adoptedQueues.push(queue);
      }
      if (state.cooldownUntil && state.cooldownUntil > now) {
        cooldownQueues.push({
          queue,
          cooldownUntil: state.cooldownUntil,
          attemptCount: state.attemptCount,
        });
      }
    }

    return {
      adoptedQueues: adoptedQueues.slice(0, 50),
      cooldownQueues: cooldownQueues.slice(0, 50),
      scanInFlight: this.scanInFlight,
    };
  }
}
