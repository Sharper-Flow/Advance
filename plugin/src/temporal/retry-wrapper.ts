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

export function collectErrorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      parts.push(current.message);
      parts.push(current.name);
      current = (current as Error & { cause?: unknown }).cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(" | ");
}

export function classifyTemporalError(error: unknown): TemporalErrorClass {
  const text = collectErrorText(error);
  if (/ECONNREFUSED|Unavailable|Channel has been shut down|timeout|deadline/i.test(text)) {
    return "transient";
  }
  if (/not[_ ]found|NOT_FOUND|not registered|already started|already exists/i.test(text)) {
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
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await withTimeout(op(), options.timeoutMs);
      telemetry.lastOpAt = new Date().toISOString();
      telemetry.lastError = null;
      telemetry.lastAttempts = attempt;
      return result;
    } catch (error) {
      telemetry.lastError = error instanceof Error ? error.message : String(error);
      telemetry.lastAttempts = attempt;
      if (classifyTemporalError(error) !== "transient" || attempt >= maxAttempts) {
        throw error;
      }
      await options.onTransientFailure?.();
      await new Promise((resolve) => setTimeout(resolve, delayMs(attempt, options)));
    }
  }
}
