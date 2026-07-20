import {
  classifyTemporalWorkflowFailure,
  isWorkflowMutationIneligible,
  type TemporalWorkflowDiagnostic,
} from "./diagnostics";

// Re-export so callers of `mutation-safety` do not need a second import
// from `diagnostics`. SC4 wiring guards consume this type directly.
export type { TemporalWorkflowDiagnostic };

import type { ChangeStatus, Gates } from "../types";

/**
 * Outcome of a Temporal mutation that was sent with a post-signal readback
 * confirmation step.
 *
 * - `confirmed` — the signal was acknowledged and the post-signal readback
 *   succeeded, so the mutation outcome is known.
 * - `outcome_unknown_readback_unavailable` — the signal was acknowledged, but
 *   the post-signal readback failed before it could confirm the effect. The
 *   mutation may or may not have landed; never outer-retry without stable
 *   idempotency evidence.
 * - `failed_before_ack` — the signal call itself raised before server
 *   acknowledgement; the mutation did not land.
 */
export type TemporalMutationOutcome =
  | "confirmed"
  | "outcome_unknown_readback_unavailable"
  | "failed_before_ack";

export interface ClassifyMutationOutcomeInput {
  /** Error thrown by the signal call before server acknowledgement. */
  signalError?: unknown;
  /** Error from the post-signal readback used to confirm the mutation. */
  readbackError?: unknown;
}

export function classifyMutationOutcome(
  input: ClassifyMutationOutcomeInput,
): TemporalMutationOutcome {
  if (input.signalError !== undefined && input.signalError !== null) {
    return "failed_before_ack";
  }
  if (input.readbackError !== undefined && input.readbackError !== null) {
    return "outcome_unknown_readback_unavailable";
  }
  return "confirmed";
}

/**
 * Outer-layer retry authority for a signal after a mutation outcome has been
 * classified. All three outcomes are non-retryable at the outer layer:
 * - `confirmed` does not need a retry.
 * - `outcome_unknown_readback_unavailable` is ambiguous; retrying without
 *   stable idempotency evidence could duplicate the mutation.
 * - `failed_before_ack` must be diagnosed by the underlying transport layer
 *   (which may still retry genuine transient errors), not by an outer
 *   "just send it again" loop.
 */
export function isOuterSignalRetryAllowed(
  _outcome: TemporalMutationOutcome,
): boolean {
  return false;
}

export interface MutationEligibilityCheck {
  eligible: boolean;
  reason?: string;
  diagnostic: TemporalWorkflowDiagnostic;
}

/**
 * Eligibility check for starting, signaling, resetting, terminating, writing
 * a projection, re-seeding, or promoting cache authority on a workflow.
 *
 * This implements SC4: no-poller, unregistered-query, deadline, and unknown
 * workflow diagnostics are mutation-ineligible. `not_found` and
 * `poisoned_history` are NOT blocked by this guard; they require additional
 * operator safeguards (approval, exact run pinning, shipped proof, dry-run,
 * poisoned-history evidence) before any destructive/projection action.
 */
export function checkMutationEligibility(
  diagnostic: TemporalWorkflowDiagnostic,
): MutationEligibilityCheck {
  if (isWorkflowMutationIneligible(diagnostic)) {
    return {
      eligible: false,
      reason: `Workflow is mutation-ineligible (${diagnostic.class}): cannot start, signal, reset, terminate, write projection, or promote cache authority.`,
      diagnostic,
    };
  }
  return { eligible: true, diagnostic };
}

export class TemporalMutationIneligibleError extends Error {
  override readonly name = "TemporalMutationIneligible";
  constructor(
    public readonly workflowClass: TemporalWorkflowDiagnostic["class"],
    message: string,
    public readonly diagnostic?: TemporalWorkflowDiagnostic,
  ) {
    super(message);
  }
}

export function requireMutationEligible(
  diagnostic: TemporalWorkflowDiagnostic,
): void {
  const check = checkMutationEligibility(diagnostic);
  if (!check.eligible) {
    throw new TemporalMutationIneligibleError(
      diagnostic.class,
      check.reason!,
      diagnostic,
    );
  }
}

/**
 * Classify a raw error from a Temporal signal/operation, then enforce the SC4
 * mutation-eligibility guard. If the diagnostic is mutation-ineligible, this
 * throws `TemporalMutationIneligibleError`. Otherwise it returns the
 * diagnostic so the caller can record it for telemetry.
 *
 * Pass `undefined` or `null` for a successful operation; the helper returns a
 * `reachable` diagnostic and the caller proceeds normally.
 *
 * Use this guard at the entry of every signal, start, reset, terminate, or
 * projection-write call site (rq-temporalMutationSafety01 — SC4 enforcement
 * at production boundaries).
 */
export function enforceMutationEligibilityForError(
  error: unknown,
): TemporalWorkflowDiagnostic {
  const diagnostic = classifyTemporalWorkflowFailure(error);
  requireMutationEligible(diagnostic);
  return diagnostic;
}

/**
 * Result of an SC6-guarded mutation: signal sent, post-signal readback
 * performed, and outcome classified. The discriminator is the typed
 * `outcome` field, where `outcome_unknown_readback_unavailable` exposes an
 * ambiguous result (signal ACK but readback failed) instead of letting the
 * caller claim failure or success.
 *
 * Callers MUST surface the `outcome` field to error metadata so outer-layer
 * retry logic can avoid silently re-firing the signal.
 */
export interface TypedMutationResult<T = unknown> {
  outcome: TemporalMutationOutcome;
  signal: { ok: boolean; error?: unknown };
  readback: { ok: boolean; value?: T; error?: unknown };
  diagnostic?: TemporalWorkflowDiagnostic;
}

/**
 * Compose a signal-call result with a post-signal readback result into a
 * typed `TypedMutationResult` using `classifyMutationOutcome`. Both inputs
 * are passed by the caller (signals and readbacks are I/O-heavy; the helper
 * itself remains pure). The diagnostic, when present, is propagated.
 */
export function composeTypedMutationResult<T = unknown>(input: {
  signalError?: unknown;
  readbackError?: unknown;
  readbackValue?: T;
  diagnostic?: TemporalWorkflowDiagnostic;
}): TypedMutationResult<T> {
  return {
    outcome: classifyMutationOutcome({
      ...(input.signalError !== undefined
        ? { signalError: input.signalError }
        : {}),
      ...(input.readbackError !== undefined
        ? { readbackError: input.readbackError }
        : {}),
    }),
    signal: {
      ok: input.signalError === undefined || input.signalError === null,
      ...(input.signalError !== undefined && input.signalError !== null
        ? { error: input.signalError }
        : {}),
    },
    readback: {
      ok: input.readbackError === undefined || input.readbackError === null,
      ...(input.readbackError !== undefined && input.readbackError !== null
        ? { error: input.readbackError }
        : {}),
      ...(input.readbackError === undefined || input.readbackError === null
        ? { value: input.readbackValue as T }
        : {}),
    },
    ...(input.diagnostic ? { diagnostic: input.diagnostic } : {}),
  };
}

export const WORKFLOW_TERMINATE_SHIPPED_GATES = [
  "acceptance",
  "release",
] as const;

const TERMINAL_WORKFLOW_RUN_STATUSES: ReadonlySet<string> = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "TERMINATED",
  "CONTINUED_AS_NEW",
  "TIMED_OUT",
]);

const TERMINABLE_WORKFLOW_RUN_STATUSES: ReadonlySet<string> = new Set([
  "RUNNING",
  "PAUSED",
]);

export interface WorkflowRunDescriptionPin {
  runId?: string;
  statusName?: string;
  wedgedEvidence?: string;
}

export interface DestructiveWorkflowRecoveryInput {
  approvedByUser: boolean;
  approvalEvidence: string;
  changeStatus: ChangeStatus;
  gates: Gates;
  serviceAvailable: boolean;
  description?: WorkflowRunDescriptionPin;
  dryRun?: boolean;
}

export type DestructiveWorkflowRecoveryDecision =
  | { kind: "allowed"; alreadyTerminated: boolean; dryRun: boolean }
  | { kind: "refused"; reason: string };

/**
 * Pure guard for operator-only destructive workflow recovery. It encodes the
 * approval-first, exact run-pinning, shipped-proof, dry-run, healthy-guard,
 * and failure-before-projection ordering required by `adv_change_workflow_terminate`
 * and related levers. The caller is responsible for performing no actual
 * mutation when the decision is `refused` and for never refreshing a
 * projection cache before a successful termination.
 */
export function evaluateDestructiveWorkflowRecoveryPreconditions(
  input: DestructiveWorkflowRecoveryInput,
): DestructiveWorkflowRecoveryDecision {
  if (input.approvedByUser !== true) {
    return {
      kind: "refused",
      reason: "approvedByUser must be true for change workflow termination.",
    };
  }

  const evidence = input.approvalEvidence?.trim() ?? "";
  if (evidence.length === 0) {
    return {
      kind: "refused",
      reason: "approvalEvidence is required for change workflow termination.",
    };
  }

  if (input.changeStatus === "archived") {
    return {
      kind: "refused",
      reason:
        "Workflow termination refused: change is archived. Use adv_archive_purge for archived changes — it is the sole archived-change workflow termination lever.",
    };
  }

  const incompleteGates = WORKFLOW_TERMINATE_SHIPPED_GATES.filter(
    (gateId) => input.gates[gateId]?.status !== "done",
  );
  if (incompleteGates.length > 0) {
    return {
      kind: "refused",
      reason: `Workflow termination refused: change has no shipped proof (gate(s) not done: ${incompleteGates.join(", ")}).`,
    };
  }

  if (!input.serviceAvailable) {
    return {
      kind: "refused",
      reason:
        "Temporal service not available — cannot describe or terminate the change workflow.",
    };
  }

  if (!input.description) {
    return {
      kind: "refused",
      reason:
        "Workflow termination refused: no describe output available to pin an exact run.",
    };
  }

  const { runId, statusName, wedgedEvidence } = input.description;

  if (statusName && TERMINAL_WORKFLOW_RUN_STATUSES.has(statusName)) {
    return { kind: "allowed", alreadyTerminated: true, dryRun: false };
  }

  if (!statusName || !TERMINABLE_WORKFLOW_RUN_STATUSES.has(statusName)) {
    return {
      kind: "refused",
      reason: `Workflow termination refused: cannot classify run status${statusName ? ` "${statusName}"` : ""}.`,
    };
  }

  if (!wedgedEvidence || wedgedEvidence.trim().length === 0) {
    return {
      kind: "refused",
      reason:
        "Workflow termination refused: run is not wedged — no poisoned-history evidence in describe output.",
    };
  }

  if (!runId || runId.trim().length === 0) {
    return {
      kind: "refused",
      reason:
        "Workflow termination refused: describe output carries no runId — cannot pin an exact run.",
    };
  }

  if (input.dryRun) {
    return { kind: "allowed", alreadyTerminated: false, dryRun: true };
  }

  return { kind: "allowed", alreadyTerminated: false, dryRun: false };
}
