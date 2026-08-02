import type {
  TemporalListOutcome,
  TemporalMutationServerOutcome,
  TemporalReadOutcome,
} from "./operations";

/**
 * Typed error wrapping a non-confirmed Temporal mutation outcome (signal,
 * start, terminate, cancel). Preserves the exact outcome kind, the underlying
 * cause error, and the workflow diagnostic so callers can branch on
 * `confirmed_failure` vs `timeout_unavailable` vs `outcome_unknown` instead of
 * parsing a generic error message.
 */
export class TemporalMutationOutcomeError extends Error {
  override readonly name = "TemporalMutationOutcomeError";
  constructor(
    public readonly outcome: Exclude<
      TemporalMutationServerOutcome<unknown>,
      { kind: "confirmed" }
    >,
  ) {
    super(
      `Temporal mutation outcome: ${outcome.kind}${
        outcome.error instanceof Error ? ` — ${outcome.error.message}` : ""
      }`,
    );
  }
}

export function isTemporalMutationOutcomeError(
  error: unknown,
): error is TemporalMutationOutcomeError {
  return error instanceof TemporalMutationOutcomeError;
}

/**
 * Typed error wrapping a non-complete Temporal read outcome (query, describe,
 * list). Preserves the exact kind (`degraded`/`timeout`/`unavailable`) so
 * callers can distinguish transient unavailability from a confirmed absence.
 */
export class TemporalReadOutcomeError extends Error {
  override readonly name = "TemporalReadOutcomeError";
  constructor(
    public readonly outcome: Exclude<
      TemporalReadOutcome<unknown>,
      { kind: "complete" }
    >,
  ) {
    super(
      `Temporal read outcome: ${outcome.kind}${
        outcome.error instanceof Error ? ` — ${outcome.error.message}` : ""
      }`,
    );
  }
}

export function isTemporalReadOutcomeError(
  error: unknown,
): error is TemporalReadOutcomeError {
  return error instanceof TemporalReadOutcomeError;
}

/**
 * Typed error wrapping a non-complete Temporal visibility-list outcome
 * (`degraded`/`timeout`/`unavailable`). Preserves the exact kind, underlying
 * cause, and workflow diagnostic so callers can branch on it instead of
 * parsing a generic "list failed" error.
 */
export class TemporalListOutcomeError extends Error {
  override readonly name = "TemporalListOutcomeError";
  constructor(
    public readonly outcome: Exclude<
      TemporalListOutcome<unknown>,
      { kind: "complete" }
    >,
  ) {
    super(
      `Temporal list outcome: ${outcome.kind}${
        outcome.error instanceof Error ? ` — ${outcome.error.message}` : ""
      }`,
    );
  }
}

export function isTemporalListOutcomeError(
  error: unknown,
): error is TemporalListOutcomeError {
  return error instanceof TemporalListOutcomeError;
}
