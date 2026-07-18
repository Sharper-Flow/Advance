/**
 * health-probe-cache
 *
 * Request-owned health probe cache with monotonic per-key publication CAS.
 *
 * Unlike the legacy coalesced probe cache, this cache never joins shared
 * same-key inflight fetches. Every refresh is request-owned and publishes only
 * if its generation token still matches the current key generation, the request
 * has not been aborted, and the request has not passed its cutoff time.
 */

import {
  computeStatusQueueServiceability,
  type StatusQueueServiceabilitySnapshot,
  type TemporalHealthSnapshot,
} from "./status-health";

export type { StatusQueueServiceabilitySnapshot, TemporalHealthSnapshot };

export interface Clock {
  now(): number;
}

export interface HealthProbeCacheOptions<T, K extends string = string> {
  name: string;
  ttlMs: number;
  clock?: Clock;
  fetch: (key: K, context: { signal: AbortSignal }) => Promise<T>;
}

export interface HealthProbeCacheEntry<T> {
  value: T;
  generation: number;
  publishedAt: number;
}

export interface HealthProbeCache<T, K extends string = string> {
  refresh(
    key: K,
    options?: { signal?: AbortSignal; cutoffTime?: number },
  ): Promise<{ value: T; generation: number }>;
  read(key: K): { value: T; generation: number } | undefined;
  currentGeneration(key: K): number;
}

export interface QueueServiceabilityResult {
  value: StatusQueueServiceabilitySnapshot | null;
  outcome: "ok" | "not_admitted";
  evidence: string;
}

const DEFAULT_CLOCK: Clock = { now: () => Date.now() };
const NEVER_ABORTED_SIGNAL = new AbortController().signal;

export function createHealthProbeCache<T, K extends string = string>(
  options: HealthProbeCacheOptions<T, K>,
): HealthProbeCache<T, K> {
  const ttlMs = options.ttlMs;
  const clock = options.clock ?? DEFAULT_CLOCK;
  const published = new Map<K, HealthProbeCacheEntry<T>>();
  const generations = new Map<K, number>();

  function currentGeneration(key: K): number {
    return generations.get(key) ?? 0;
  }

  function incrementGeneration(key: K): number {
    const next = currentGeneration(key) + 1;
    generations.set(key, next);
    return next;
  }

  function publish(
    key: K,
    value: T,
    generation: number,
    signal: AbortSignal,
    cutoffTime: number | undefined,
  ): boolean {
    if (signal.aborted) return false;
    if (cutoffTime !== undefined && clock.now() >= cutoffTime) return false;
    if (currentGeneration(key) !== generation) return false;
    published.set(key, { value, generation, publishedAt: clock.now() });
    return true;
  }

  return {
    async refresh(key, refreshOptions = {}) {
      const generation = incrementGeneration(key);
      const signal = refreshOptions.signal ?? NEVER_ABORTED_SIGNAL;
      const cutoffTime = refreshOptions.cutoffTime;
      const value = await options.fetch(key, { signal });
      if (signal.aborted) {
        throw new Error("aborted");
      }
      publish(key, value, generation, signal, cutoffTime);
      return { value, generation };
    },
    read(key) {
      const entry = published.get(key);
      if (!entry) return undefined;
      if (clock.now() - entry.publishedAt >= ttlMs) {
        published.delete(key);
        return undefined;
      }
      return { value: entry.value, generation: entry.generation };
    },
    currentGeneration,
  };
}

function isTemporalHealthUsable(health: TemporalHealthSnapshot): boolean {
  // A usable Temporal dependency requires a live server probe. Worker liveness
  // and queue details are evaluated by the serviceability computation itself.
  return health.server_alive === true;
}

export async function getQueueServiceability(
  input: {
    projectId: string | undefined;
    health: TemporalHealthSnapshot;
  },
  options?: { signal?: AbortSignal },
): Promise<QueueServiceabilityResult> {
  if (options?.signal?.aborted) {
    return {
      value: null,
      outcome: "not_admitted",
      evidence: "request aborted",
    };
  }
  if (!isTemporalHealthUsable(input.health)) {
    return {
      value: null,
      outcome: "not_admitted",
      evidence: "temporal dependency not usable",
    };
  }
  try {
    const value = await computeStatusQueueServiceability(input);
    return { value, outcome: "ok", evidence: "" };
  } catch (error) {
    const evidence = error instanceof Error ? error.message : String(error);
    return { value: null, outcome: "not_admitted", evidence };
  }
}
