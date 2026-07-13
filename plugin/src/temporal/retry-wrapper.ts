import { collectErrorText } from "./error-text";

export type TemporalErrorClass = "transient" | "fallback" | "fatal";

export interface WorkerRunErrorTelemetry {
  queue: string;
  message: string;
  at: string;
}

export interface OpTelemetry {
  opType: string;
  successCount: number;
  failureCount: number;
  retryCount: number;
  lastOpAt: string | null;
  lastError: string | null;
}

export { collectErrorText };

interface RetryTelemetry {
  lastOpAt: string | null;
  lastError: string | null;
  lastAttempts: number | null;
}

const telemetry: RetryTelemetry = {
  lastOpAt: null,
  lastError: null,
  lastAttempts: null,
};
let lastWorkerRunError: WorkerRunErrorTelemetry | null = null;

export const temporalOpLatency = {
  add(_latencyMs: number): void {},
  getCount(): number {
    return 0;
  },
  getPercentile(_p: number): number | null {
    return null;
  },
  reset(): void {},
};

export function classifyTemporalError(error: unknown): TemporalErrorClass {
  const text = collectErrorText(error);
  if (
    /TMPRL1100|Nondeterminism error|No command scheduled for event/i.test(text)
  ) {
    return "fallback";
  }
  if (
    /ECONNREFUSED|Unavailable|Channel has been shut down|timeout|deadline/i.test(
      text,
    )
  ) {
    return "transient";
  }
  if (
    /not[_ ]found|NOT_FOUND|not registered|already started|already exists/i.test(
      text,
    )
  ) {
    return "fallback";
  }
  return "fatal";
}

export class TemporalQueryTimeoutError extends Error {
  override readonly name = "TemporalQueryTimeout";
  constructor(public readonly timeoutMs: number) {
    super(`Temporal operation exceeded ${timeoutMs}ms timeout`);
  }
}

/**
 * Aggregate deadline budget for one authoritative read request (KD1).
 * List/status resolvers create one deadline context per request and
 * thread it into every Temporal query attempt; the retry wrapper caps
 * per-attempt timeouts and retry/backoff admission to the remaining
 * budget so a slow candidate can never outlive the request.
 */
export const TEMPORAL_READ_DEADLINE_BUDGET_MS = 8_000;

export interface TemporalReadDeadline {
  /** Total aggregate budget in milliseconds (for diagnostics/errors). */
  readonly budgetMs: number;
  /** Absolute expiry in `Date.now()` epoch milliseconds. */
  readonly deadlineAt: number;
}

export function createTemporalReadDeadline(
  budgetMs: number = TEMPORAL_READ_DEADLINE_BUDGET_MS,
): TemporalReadDeadline {
  return { budgetMs, deadlineAt: Date.now() + budgetMs };
}

export function remainingDeadlineMs(deadline: TemporalReadDeadline): number {
  return deadline.deadlineAt - Date.now();
}

export function getTemporalRetryTelemetry(): RetryTelemetry {
  return { ...telemetry };
}

export function getTemporalOpTelemetry(): OpTelemetry[] {
  return [];
}

export function recordWorkerRunFailure(queue: string, err: unknown): void {
  lastWorkerRunError = {
    queue,
    message: err instanceof Error ? err.message : String(err ?? ""),
    at: new Date().toISOString(),
  };
}

export function recordTemporalRuntimeFailure(err: unknown): void {
  telemetry.lastError = err instanceof Error ? err.message : String(err ?? "");
}

export function getLastWorkerRunError(): WorkerRunErrorTelemetry | null {
  return lastWorkerRunError ? { ...lastWorkerRunError } : null;
}

export function resetTemporalRetryTelemetry(): void {
  telemetry.lastOpAt = null;
  telemetry.lastError = null;
  telemetry.lastAttempts = null;
  lastWorkerRunError = null;
}

interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffCoefficient?: number;
  onTransientFailure?: () => Promise<void>;
  timeoutMs?: number;
  opType?: string;
  /**
   * Request-scoped aggregate deadline (KD1). When present, each attempt
   * uses no more than the smaller of `timeoutMs` and the remaining
   * budget, and no new attempt or backoff begins once the budget is
   * exhausted. Omit for mutation/long-running paths.
   */
  deadline?: TemporalReadDeadline;
}

function delayMs(attempt: number, options: RetryOptions): number {
  const initial = options.initialDelayMs ?? 250;
  const coefficient = options.backoffCoefficient ?? 2;
  const max = options.maxDelayMs ?? 2_000;
  return Math.min(max, initial * coefficient ** Math.max(0, attempt - 1));
}

async function withTimeout<T>(op: Promise<T>, timeoutMs?: number): Promise<T> {
  if (timeoutMs === undefined) return op;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      op,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new TemporalQueryTimeoutError(timeoutMs)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function withTemporalRetry<T>(
  op: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const deadline = options.deadline;
  for (let attempt = 1; ; attempt++) {
    let remaining: number | undefined;
    if (deadline) {
      remaining = remainingDeadlineMs(deadline);
      if (remaining <= 0) {
        // Budget exhausted: refuse to begin a new attempt (KD1). Surface an
        // aggregate timeout so callers record typed incompleteness instead
        // of an unbounded hang.
        throw new TemporalQueryTimeoutError(deadline.budgetMs);
      }
    }
    const attemptTimeoutMs =
      remaining !== undefined
        ? Math.min(options.timeoutMs ?? remaining, remaining)
        : options.timeoutMs;
    try {
      const result = await withTimeout(op(), attemptTimeoutMs);
      telemetry.lastOpAt = new Date().toISOString();
      telemetry.lastError = null;
      telemetry.lastAttempts = attempt;
      return result;
    } catch (error) {
      telemetry.lastError =
        error instanceof Error ? error.message : String(error);
      telemetry.lastAttempts = attempt;
      if (
        classifyTemporalError(error) !== "transient" ||
        attempt >= maxAttempts
      ) {
        throw error;
      }
      if (deadline) {
        const afterFailure = remainingDeadlineMs(deadline);
        if (afterFailure <= 0) {
          // No reconnect/backoff may begin after expiry; propagate the
          // failure that consumed the budget rather than swallowing it.
          throw error;
        }
      }
      await options.onTransientFailure?.();
      const backoffMs = delayMs(attempt, options);
      const waitMs = deadline
        ? Math.min(backoffMs, Math.max(0, remainingDeadlineMs(deadline)))
        : backoffMs;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}
