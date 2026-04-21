export type TemporalErrorClass = "transient" | "fallback" | "fatal";

interface TemporalRetryTelemetry {
  lastOpAt: string | null;
  lastError: string | null;
}

const temporalRetryTelemetry: TemporalRetryTelemetry = {
  lastOpAt: null,
  lastError: null,
};

export function getTemporalRetryTelemetry(): TemporalRetryTelemetry {
  return { ...temporalRetryTelemetry };
}

export function resetTemporalRetryTelemetry(): void {
  temporalRetryTelemetry.lastOpAt = null;
  temporalRetryTelemetry.lastError = null;
}

function recordTemporalSuccess(): void {
  temporalRetryTelemetry.lastOpAt = new Date().toISOString();
  temporalRetryTelemetry.lastError = null;
}

function recordTemporalFailure(error: unknown): void {
  temporalRetryTelemetry.lastError =
    error instanceof Error ? error.message : String(error ?? "");
}

export function classifyTemporalError(error: unknown): TemporalErrorClass {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (
    /ECONNREFUSED|connection refused|no task queue handler|task queue handler is subscribed|Unavailable/i.test(
      message,
    )
  ) {
    return "transient";
  }

  if (
    /WorkflowExecutionNotFound|Workflow execution not found|workflow not found|not[_ ]found|NOT_FOUND|QueryNotRegistered|UpdateNotRegistered|not registered/i.test(
      message,
    )
  ) {
    return "fallback";
  }

  return "fatal";
}

interface RetryOptions {
  maxAttempts?: number;
  backoffMs?: readonly number[];
  onTransientFailure?: () => Promise<void>;
}

export async function withTemporalRetry<T>(
  op: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const backoffMs = options.backoffMs ?? [250, 1000, 2000];

  let attempt = 0;
  while (true) {
    try {
      const result = await op();
      recordTemporalSuccess();
      return result;
    } catch (error) {
      recordTemporalFailure(error);
      attempt += 1;
      const cls = classifyTemporalError(error);
      if (cls !== "transient" || attempt >= maxAttempts) {
        throw error;
      }

      await options.onTransientFailure?.();
      const delay = backoffMs[Math.min(attempt - 1, backoffMs.length - 1)] ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}
