import { LRUCache } from "lru-cache";

export interface ProbeCacheFreshness {
  cached_at: string;
  stale: boolean;
  error?: string;
}

export interface ProbeCacheResult<T> {
  value: T;
  freshness: ProbeCacheFreshness;
}

export interface ProbeCacheFetchContext<T> {
  signal: AbortSignal;
  staleValue?: T;
}

export interface ProbeCacheOptions<T, K extends string = string> {
  name: string;
  ttlMs: number;
  timeoutMs?: number;
  max?: number;
  fetch: (key: K, context: ProbeCacheFetchContext<T>) => Promise<T>;
}

export interface ProbeCache<T, K extends string = string> {
  fetch: (
    key: K,
    options?: { forceRefresh?: boolean },
  ) => Promise<ProbeCacheResult<T>>;
  clear: () => void;
}

interface ProbeCacheEntry<T> {
  value: T;
  cachedAtMs: number;
  cached_at: string;
}

const DEFAULT_TIMEOUT_MS = 2_000;
const DEFAULT_MAX_ENTRIES = 128;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  timeout.unref?.();
  return controller.signal;
}

export function createProbeCache<T, K extends string = string>(
  options: ProbeCacheOptions<T, K>,
): ProbeCache<T, K> {
  const ttlMs = options.ttlMs;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const lastErrorByKey = new Map<K, string>();

  const cache = new LRUCache<K, ProbeCacheEntry<T>>({
    max: options.max ?? DEFAULT_MAX_ENTRIES,
    ttl: ttlMs,
    allowStale: true,
    allowStaleOnFetchAbort: true,
    allowStaleOnFetchRejection: true,
    ignoreFetchAbort: true,
    fetchMethod: async (key, staleEntry, { signal }) => {
      try {
        const value = await options.fetch(key, {
          signal,
          staleValue: staleEntry?.value,
        });
        lastErrorByKey.delete(key);
        const cachedAtMs = Date.now();
        return {
          value,
          cachedAtMs,
          cached_at: new Date(cachedAtMs).toISOString(),
        };
      } catch (error) {
        lastErrorByKey.set(key, errorMessage(error));
        throw error;
      }
    },
  });

  return {
    async fetch(key, fetchOptions = {}) {
      let entry: ProbeCacheEntry<T> | undefined;
      const signal = timeoutSignal(timeoutMs);
      try {
        entry = await cache.fetch(key, {
          allowStale: false,
          forceRefresh: fetchOptions.forceRefresh,
          signal,
        });
      } catch (error) {
        const message = errorMessage(error);
        throw new Error(
          `Probe cache fetch failed for ${options.name}[${key}]: ${message}`,
        );
      }

      if (!entry) {
        const lastError = lastErrorByKey.get(key);
        throw new Error(
          `Probe cache fetch failed for ${options.name}[${key}]${
            lastError ? `: ${lastError}` : ": no value returned"
          }`,
        );
      }

      const stale = Date.now() - entry.cachedAtMs >= ttlMs;
      const lastError =
        lastErrorByKey.get(key) ??
        (stale && signal.aborted ? errorMessage(signal.reason) : undefined);
      return {
        value: entry.value,
        freshness: {
          cached_at: entry.cached_at,
          stale,
          ...(stale && lastError ? { error: lastError } : {}),
        },
      };
    },
    clear() {
      cache.clear();
      lastErrorByKey.clear();
    },
  };
}
