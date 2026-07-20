import { Connection } from "@temporalio/client";
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

// gRPC status codes (@grpc/grpc-js constants) relevant to retry/reconnect
// classification. The Temporal client nests a raw @grpc/grpc-js ServiceError
// as `ServiceError.cause`, where the numeric `code` lives.
const GRPC_DEADLINE_EXCEEDED = 4;
const GRPC_NOT_FOUND = 5;
const GRPC_ALREADY_EXISTS = 6;
const GRPC_RESOURCE_EXHAUSTED = 8;
const GRPC_ABORTED = 10;
const GRPC_UNAVAILABLE = 14;

/**
 * Retryable saturation/availability codes: retry with backoff, but do NOT
 * replace the shared connection. The SDK's Connection interceptor already
 * retries most of these; ADV's aggregate-deadline retry primarily covers
 * DEADLINE_EXCEEDED (which the SDK does not retry) plus a bounded safety net.
 */
const GRPC_RETRYABLE_CODES = new Set<number>([
  GRPC_DEADLINE_EXCEEDED,
  GRPC_RESOURCE_EXHAUSTED,
  GRPC_ABORTED,
  GRPC_UNAVAILABLE,
]);

/** Application-status codes the fallback-recovery paths key on. */
const GRPC_FALLBACK_CODES = new Set<number>([
  GRPC_NOT_FOUND,
  GRPC_ALREADY_EXISTS,
]);

/** Bounded depth for the `cause`-chain walk (defensive against deep nesting). */
const MAX_CAUSE_DEPTH = 16;

/**
 * True when `v` has the shape of a raw @grpc/grpc-js ServiceError: a numeric
 * `code` plus a string `details` and a record-like `metadata`. This is the
 * shape the Temporal TypeScript SDK nests as `ServiceError.cause`. Requiring
 * the full shape — not merely a numeric `.code` — prevents misclassifying
 * unrelated application errors that happen to carry a `code` field.
 */
function isGrpcServiceErrorShape(
  v: unknown,
): v is { code: number; details: string; metadata: object } {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.code === "number" &&
    typeof o.details === "string" &&
    typeof o.metadata === "object" &&
    o.metadata !== null
  );
}

/**
 * Walk the error `cause` chain (bounded depth + visited-set cycle guard) and
 * return the numeric gRPC status of the first validated ServiceError-shaped
 * node, or `undefined` when none is present. Modeled on the SDK's own
 * `isGrpcDeadlineError` traversal.
 */
export function extractGrpcStatus(error: unknown): number | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  let depth = 0;
  while (
    current &&
    typeof current === "object" &&
    !seen.has(current) &&
    depth < MAX_CAUSE_DEPTH
  ) {
    seen.add(current);
    if (isGrpcServiceErrorShape(current)) return current.code;
    current = (current as { cause?: unknown }).cause;
    depth++;
  }
  return undefined;
}

/**
 * Genuine transport-channel failures that justify replacing the shared STSL
 * connection (reconnect axis). Saturation/availability codes are retryable but
 * must NOT close+reopen the shared connection — that would cancel other
 * sessions' in-flight ops on the same task queue (the #217 amplifier).
 */
const RECONNECTABLE_TRANSPORT_RE =
  /ECONNREFUSED|ECONNRESET|EPIPE|broken pipe|Channel has been shut down|GOAWAY|socket hang up|Connection dropped/i;

/**
 * Reconnect axis: true only for genuine transport-channel failures. Distinct
 * from `classifyTemporalError === "transient"` (the retry axis): a saturated
 * server (RESOURCE_EXHAUSTED), coded UNAVAILABLE without transport text, plain
 * ABORTED, or DEADLINE_EXCEEDED are all retryable but NOT reconnectable.
 */
export function isReconnectableError(error: unknown): boolean {
  // A validated saturation/availability status remains on the retry axis even
  // when SDK-provided details happen to contain a transport-looking phrase.
  // Never let descriptive text override the structural gRPC classification.
  if (GRPC_RETRYABLE_CODES.has(extractGrpcStatus(error) ?? -1)) return false;
  return RECONNECTABLE_TRANSPORT_RE.test(collectErrorText(error));
}

export function classifyTemporalError(error: unknown): TemporalErrorClass {
  const text = collectErrorText(error);
  // Precedence 1: replay nondeterminism → fallback-eligible.
  if (
    /TMPRL1100|Nondeterminism error|No command scheduled for event/i.test(text)
  ) {
    return "fallback";
  }
  // Precedence 2: validated structural gRPC status (never an arbitrary code).
  const code = extractGrpcStatus(error);
  if (code !== undefined) {
    if (GRPC_FALLBACK_CODES.has(code)) return "fallback";
    if (GRPC_RETRYABLE_CODES.has(code)) return "transient";
    return "fatal";
  }
  // Precedence 3: text-based transient transport/timeout signals.
  if (
    /ECONNREFUSED|Unavailable|Channel has been shut down|timeout|deadline/i.test(
      text,
    )
  ) {
    return "transient";
  }
  // Precedence 4: text-based fallback (NOT_FOUND / already-exists).
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
 *
 * rq-boundedAuthoritativeRead01: authoritative list/status reads resolve
 * inside this single request-scoped 8s aggregate deadline and return a
 * complete or explicitly degraded result — never an unclassified
 * whole-tool ToolExecutionTimeout and never a worker-restart or
 * timeout-ceiling-increase workaround.
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
  /**
   * SDK connection to use for native gRPC deadline/abort propagation.
   * When provided alongside `deadline`, `Promise.race` is no longer the
   * RPC timeout authority — the SDK's `Connection.withDeadline` and
   * `withAbortSignal` cancel the in-flight RPC instead.
   */
  connection?: Connection;
  /**
   * Request-scoped abort signal. When provided, the SDK cancels the
   * in-flight RPC if the signal is aborted.
   */
  abortSignal?: AbortSignal;
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
      let result: T;
      if (deadline && options.connection) {
        // rq-boundedAuthoritativeRead02: use the SDK's native gRPC deadline
        // and abort propagation as the RPC timeout authority. The per-attempt
        // deadline is the same cap that the legacy Promise.race fallback
        // would have applied, but the SDK cancels the in-flight RPC instead
        // of merely resolving a local race.
        const attemptDeadlineAt =
          Date.now() + (attemptTimeoutMs ?? remainingDeadlineMs(deadline));
        result = await options.connection.withDeadline(attemptDeadlineAt, () =>
          options.connection!.withAbortSignal(
            options.abortSignal ?? new AbortController().signal,
            op,
          ),
        );
      } else {
        result = await withTimeout(op(), attemptTimeoutMs);
      }
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
      // Reconnect axis: only replace the shared connection for genuine
      // transport-channel failures. Retryable saturation/availability codes
      // retry with backoff without reconnecting, so one op's saturation never
      // cancels other sessions' in-flight ops on the shared connection.
      if (isReconnectableError(error)) {
        await options.onTransientFailure?.();
      }
      const backoffMs = delayMs(attempt, options);
      const waitMs = deadline
        ? Math.min(backoffMs, Math.max(0, remainingDeadlineMs(deadline)))
        : backoffMs;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}
