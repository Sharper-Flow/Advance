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

export function classifyTemporalError(error: unknown): TemporalErrorClass {
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
