export type TemporalErrorClass = "transient" | "fallback" | "fatal";

interface TemporalRetryTelemetry {
  lastOpAt: string | null;
  lastError: string | null;
  /** Number of attempts in the last withTemporalRetry call. Additive field — existing readers are unaffected. */
  lastAttempts: number | null;
}

/**
 * Per-operation latency histogram for Temporal operations.
 * Stores raw latencies; percentile calculations done on query.
 */
export interface LatencyHistogram {
  add(latencyMs: number): void;
  getCount(): number;
  getPercentile(p: number): number | null;
  reset(): void;
}

function createLatencyHistogram(): LatencyHistogram {
  const samples: number[] = [];
  return {
    add(latencyMs: number): void {
      samples.push(latencyMs);
      // Cap at 10k samples to prevent unbounded memory growth
      if (samples.length > 10_000) samples.shift();
    },
    getCount(): number {
      return samples.length;
    },
    getPercentile(p: number): number | null {
      if (samples.length === 0) return null;
      const sorted = [...samples].sort((a, b) => a - b);
      const idx = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[Math.max(0, idx)] ?? null;
    },
    reset(): void {
      samples.length = 0;
    },
  };
}

/** Latency histogram for all Temporal operations combined. */
export const temporalOpLatency = createLatencyHistogram();

const temporalRetryTelemetry: TemporalRetryTelemetry = {
  lastOpAt: null,
  lastError: null,
  lastAttempts: null,
};

export function getTemporalRetryTelemetry(): TemporalRetryTelemetry {
  return { ...temporalRetryTelemetry };
}

export function resetTemporalRetryTelemetry(): void {
  temporalRetryTelemetry.lastOpAt = null;
  temporalRetryTelemetry.lastError = null;
  temporalRetryTelemetry.lastAttempts = null;
}

function recordTemporalSuccess(attempts: number): void {
  temporalRetryTelemetry.lastOpAt = new Date().toISOString();
  temporalRetryTelemetry.lastError = null;
  temporalRetryTelemetry.lastAttempts = attempts;
}

function recordTemporalFailure(error: unknown, attempts: number): void {
  temporalRetryTelemetry.lastError =
    error instanceof Error ? error.message : String(error ?? "");
  temporalRetryTelemetry.lastAttempts = attempts;
}

/**
 * Walk the error cause chain and collect all messages (including
 * constructor.name / .name) into a single string for regex matching.
 * The Temporal SDK sometimes wraps the real error (e.g.
 * WorkflowNotFoundError) inside a generic ServiceError whose own
 * message is something like "Failed to query Workflow". The underlying
 * not-found signal lives in `.cause`.
 */
function collectErrorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      parts.push(current.message ?? "");
      parts.push(current.constructor.name ?? current.name ?? "");
      current = (current as Error & { cause?: unknown }).cause;
    } else {
      parts.push(String(current ?? ""));
      break;
    }
  }
  return parts.join(" | ");
}

/**
 * Raised by `withTemporalRetry` when an op wrapped with `timeoutMs`
 * exceeds its budget. Surfaces as `errorClass: "TemporalQueryTimeout"`
 * and classifies as `"transient"` so the retry budget still applies.
 *
 * P1.3.8 scope: this error fires ONLY when the caller opts in via
 * `runTemporal(op, { timeoutMs })`. The default (no timeout) path is
 * used for `executeUpdate` and other long-running ops per design.md
 * § KD-2.
 */
export class TemporalQueryTimeoutError extends Error {
  override readonly name = "TemporalQueryTimeout";
  constructor(public readonly timeoutMs: number) {
    super(
      `Temporal query exceeded ${timeoutMs}ms timeout — worker may be down or ` +
        `workflow may be unresponsive. Retry budget (if any) still applies.`,
    );
  }
}

export function classifyTemporalError(error: unknown): TemporalErrorClass {
  // P1.3.8: query timeout is inherently transient — the worker may
  // recover before the next attempt. Check before the regex branch
  // because the name doesn't match the transient regex.
  if (error instanceof TemporalQueryTimeoutError) return "transient";

  const combined = collectErrorText(error);

  if (
    /ECONNREFUSED|connection refused|no task queue handler|task queue handler is subscribed|Unavailable/i.test(
      combined,
    )
  ) {
    return "transient";
  }

  if (
    /WorkflowExecutionNotFound|Workflow execution not found|workflow not found|not[_ ]found|NOT_FOUND|QueryNotRegistered|UpdateNotRegistered|not registered/i.test(
      combined,
    )
  ) {
    return "fallback";
  }

  return "fatal";
}

interface RetryOptions {
  maxAttempts?: number;
  /** @deprecated Use initialDelayMs / backoffCoefficient / maxDelayMs instead. */
  backoffMs?: readonly number[];
  /** Base delay for the first retry (default 250ms). */
  initialDelayMs?: number;
  /** Exponential multiplier between retries (default 2). */
  backoffCoefficient?: number;
  /** Upper bound for the delay before jitter (default 2000ms). */
  maxDelayMs?: number;
  onTransientFailure?: () => Promise<void>;
  /**
   * Per-attempt timeout in milliseconds. When set, `op()` is raced
   * against a `TemporalQueryTimeoutError`. Omit for ops that must
   * never be interrupted (e.g. executeUpdate, connection setup).
   *
   * P1.3.8: apply `timeoutMs: 5000` to `handle.query()` callsites in
   * `store-temporal.ts`. Do NOT apply to `executeUpdate` callsites.
   * See design.md § KD-2.
   */
  timeoutMs?: number;
}

/**
 * Compute the full-jitter delay for a given attempt.
 * delay = random(0, min(maxDelayMs, initialDelayMs * coefficient^(attempt-1)))
 */
function computeDelay(
  attempt: number,
  initialDelayMs: number,
  coefficient: number,
  maxDelayMs: number,
): number {
  const base = Math.min(
    maxDelayMs,
    initialDelayMs * coefficient ** (attempt - 1),
  );
  return Math.random() * base;
}

/**
 * Race a promise against a `TemporalQueryTimeoutError` on a specified
 * timeout budget. Clears the timer on resolution to avoid leaked
 * handles. See P1.3.8.
 */
function raceWithQueryTimeout<T>(
  op: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new TemporalQueryTimeoutError(timeoutMs)),
      timeoutMs,
    );
  });
  return Promise.race([op, timeoutPromise]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export async function withTemporalRetry<T>(
  op: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;

  // Legacy path: if caller explicitly passes backoffMs, use the fixed ladder
  const useLegacyBackoff = options.backoffMs !== undefined;
  const backoffMs = options.backoffMs ?? [250, 1000, 2000];
  const initialDelayMs = options.initialDelayMs ?? 250;
  const coefficient = options.backoffCoefficient ?? 2;
  const maxDelayMs = options.maxDelayMs ?? 2000;
  const timeoutMs = options.timeoutMs;

  let attempt = 0;
  while (true) {
    const startTime = Date.now();
    try {
      const result =
        timeoutMs !== undefined
          ? await raceWithQueryTimeout(op(), timeoutMs)
          : await op();
      const latencyMs = Date.now() - startTime;
      temporalOpLatency.add(latencyMs);
      recordTemporalSuccess(attempt + 1);
      return result;
    } catch (error) {
      attempt += 1;
      recordTemporalFailure(error, attempt);
      const cls = classifyTemporalError(error);
      if (cls !== "transient" || attempt >= maxAttempts) {
        throw error;
      }

      await options.onTransientFailure?.();

      const delay = useLegacyBackoff
        ? (backoffMs[Math.min(attempt - 1, backoffMs.length - 1)] ?? 0)
        : computeDelay(attempt, initialDelayMs, coefficient, maxDelayMs);

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}
