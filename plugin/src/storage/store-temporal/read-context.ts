import { Connection } from "@temporalio/client";
import {
  classifyTemporalFailure,
  type TemporalFailureDiagnostics,
} from "../../temporal/diagnostics";
import {
  createTemporalReadDeadline,
  remainingDeadlineMs,
  TEMPORAL_READ_DEADLINE_BUDGET_MS,
  TemporalQueryTimeoutError,
  type TemporalReadDeadline,
  withTemporalRetry,
} from "../../temporal/retry-wrapper";

/**
 * Request-scoped context for one authoritative Temporal read (SC3).
 *
 * One absolute deadline and one AbortController are created per read. Both
 * are threaded through change, gate, and status stages so that every in-flight
 * RPC shares the same cancellation surface and the same aggregate budget.
 */
export interface TemporalReadContext {
  deadline: TemporalReadDeadline;
  abortController: AbortController;
  readonly createdAt: number;
}

/**
 * Metadata describing whether an authoritative read completed or degraded.
 *
 * `complete` means the requested data was returned. `degraded` means the read
 * failed in a way that must be surfaced explicitly (deadline, abort, or other
 * classified RPC failure) rather than inferred as complete.
 */
export interface TemporalReadMetadata {
  complete: boolean;
  degraded: boolean;
  source?: "workflow" | "disk" | "archive" | "retired_projection";
  diagnostics?: TemporalFailureDiagnostics;
}

/**
 * Result of an authoritative Temporal read. The `data` and `error` fields are
 * mutually exclusive: exactly one is populated when `complete` is true/false.
 */
export interface TemporalReadResult<T> {
  data: T | undefined;
  complete: boolean;
  degraded: boolean;
  metadata: TemporalReadMetadata;
  error: unknown;
}

/**
 * Create a new read context with an absolute deadline and an AbortController.
 */
export function createTemporalReadContext(
  budgetMs: number = TEMPORAL_READ_DEADLINE_BUDGET_MS,
): TemporalReadContext {
  return {
    deadline: createTemporalReadDeadline(budgetMs),
    abortController: new AbortController(),
    createdAt: Date.now(),
  };
}

/**
 * True when the aggregate deadline has passed or the AbortController has been
 * aborted. No new RPC attempt may begin once this returns true.
 */
export function isTemporalReadExpired(ctx: TemporalReadContext): boolean {
  return (
    ctx.abortController.signal.aborted || remainingDeadlineMs(ctx.deadline) <= 0
  );
}

/**
 * Abort the read context. Any in-flight RPC wrapped in this context will be
 * cancelled by the SDK's abort-signal propagation.
 */
export function abortTemporalRead(ctx: TemporalReadContext): void {
  ctx.abortController.abort();
}

export interface RunTemporalReadOptions {
  /** Per-operation type label for telemetry aggregation (KD-3). */
  opType?: string;
  /** Per-attempt timeout in milliseconds. Omit to use the remaining budget. */
  timeoutMs?: number;
  /** Maximum retry attempts. Defaults to 3. */
  maxAttempts?: number;
  /**
   * Hook fired once per genuine transport-channel failure. Used to rebuild
   * the shared STSL connection when corroborated shared-channel evidence is
   * present (KD-2/KD-4).
   */
  onTransientFailure?: () => Promise<void>;
}

function buildResult<T>(
  ctx: TemporalReadContext,
  data?: T,
  error?: unknown,
): TemporalReadResult<T> {
  const complete = error === undefined;
  const degraded =
    !complete &&
    (isTemporalReadExpired(ctx) || error instanceof TemporalQueryTimeoutError);
  const diagnostics: TemporalFailureDiagnostics | undefined = error
    ? classifyTemporalFailure(error, {
        stslInitialized: true,
        serverReachable: true,
        serverServiceable: true,
      })
    : undefined;
  return {
    data,
    complete,
    degraded,
    metadata: {
      complete,
      degraded,
      diagnostics,
    },
    error: error ?? undefined,
  };
}

/**
 * Run one authoritative Temporal read under the supplied context.
 *
 * When a real `Connection` is available, the SDK's `withDeadline` and
 * `withAbortSignal` become the RPC timeout authority — the underlying gRPC
 * call is cancelled on expiry or abort, and no local `Promise.race` can mask
 * a still-running RPC. When no connection is present (test fixtures, mocks,
 * target-path snapshots), the read falls back to the existing retry wrapper's
 * bounded deadline behavior.
 *
 * After the deadline expires or the abort signal fires, the result is marked
 * degraded and no further attempt is made. Callers must treat a degraded read
 * as incomplete and must not grant it mutation authority.
 */
export async function runTemporalRead<T>(
  connection: Connection | undefined,
  op: () => Promise<T>,
  ctx: TemporalReadContext,
  options?: RunTemporalReadOptions,
): Promise<TemporalReadResult<T>> {
  if (isTemporalReadExpired(ctx)) {
    const error = new TemporalQueryTimeoutError(ctx.deadline.budgetMs);
    return buildResult<T>(ctx, undefined, error);
  }

  try {
    const result = await withTemporalRetry(op, {
      deadline: ctx.deadline,
      connection,
      abortSignal: ctx.abortController.signal,
      timeoutMs: options?.timeoutMs,
      opType: options?.opType,
      maxAttempts: options?.maxAttempts,
      onTransientFailure: options?.onTransientFailure,
    });
    return buildResult<T>(ctx, result, undefined);
  } catch (error) {
    return buildResult<T>(ctx, undefined, error);
  }
}
