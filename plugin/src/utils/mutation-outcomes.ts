import type { ProjectionCommitAuditEntry } from "../types";

/** Outcomes returned by the disk projection transaction/coordinator. */
export type MutationOutcome<T> =
  | {
      kind: "verified";
      value: T;
      revision: number;
      audit: ProjectionCommitAuditEntry;
    }
  | { kind: "unverified"; reason: string; audit: ProjectionCommitAuditEntry }
  | { kind: "stale_revision"; expected: number; actual: number }
  | { kind: "operator_required"; reason: string };

export type ReadOutcome<T> =
  | { kind: "complete"; value: T }
  | { kind: "not_found"; error: string }
  | { kind: "schema_error"; error: string }
  | { kind: "read_error"; error: string }
  | { kind: "oversized"; error: string }
  | { kind: "corrupt"; error: string }
  | { kind: "unreadable"; error: string };

export type ListOutcome<T> =
  | { kind: "complete"; value: T }
  | { kind: "read_error"; error: string };

export class MutationOutcomeError extends Error {
  override readonly name = "MutationOutcomeError";
  constructor(
    public readonly outcome: Exclude<
      MutationOutcome<unknown>,
      { kind: "verified" }
    >,
  ) {
    super(
      `Mutation outcome: ${outcome.kind}${"error" in outcome && outcome.error instanceof Error ? ` — ${outcome.error.message}` : ""}`,
    );
  }
}

export function isMutationOutcomeError(
  error: unknown,
): error is MutationOutcomeError {
  return error instanceof MutationOutcomeError;
}

export class ReadOutcomeError extends Error {
  override readonly name = "ReadOutcomeError";
  constructor(
    public readonly outcome: Exclude<
      ReadOutcome<unknown>,
      { kind: "complete" }
    >,
  ) {
    super(
      `Read outcome: ${outcome.kind}${"error" in outcome ? ` — ${outcome.error}` : ""}`,
    );
  }
}

export function isReadOutcomeError(error: unknown): error is ReadOutcomeError {
  return error instanceof ReadOutcomeError;
}

export class ListOutcomeError extends Error {
  override readonly name = "ListOutcomeError";
  constructor(
    public readonly outcome: Exclude<
      ListOutcome<unknown>,
      { kind: "complete" }
    >,
  ) {
    super(
      `List outcome: ${outcome.kind}${"error" in outcome ? ` — ${outcome.error}` : ""}`,
    );
  }
}

export function isListOutcomeError(error: unknown): error is ListOutcomeError {
  return error instanceof ListOutcomeError;
}
