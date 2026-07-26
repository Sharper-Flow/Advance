/**
 * Typed change mutation/recovery coordinator.
 *
 * One authority/outcome seam for all ADV mutation families.
 *
 *   resolve authority
 *   → apply typed intent
 *   → persist through Temporal (healthy) or commitChangeProjection (recovery)
 *   → read back from the same authority
 *   → verify mutation-specific postcondition
 *   → return typed outcome
 *
 * Tools construct intents and render outcomes; they do not reimplement
 * probe/signal/recovery branching per mutation family.
 */

import {
  isPoisonedHistoryError,
  recoveryReasonFromError,
  type RecoveryReason,
} from "../temporal/recovery-classification";
import { poisonedDescriptionEvidence } from "./recovery-probe";
import { waitForQueryPredicate } from "../utils/query-predicate";
import { CHANGE_WORKFLOW_QUERY_NAMES } from "../temporal/contracts";
import {
  commitChangeProjection,
  type ProjectionCommitOutcome,
  type ProjectionCommitVerifyResult,
} from "../storage/change-projection-transaction";
import type { Change, ProjectionCommitAuditEntry } from "../types";

export type { RecoveryReason };

export interface RecoveryEvidence {
  reason: RecoveryReason;
  evidence: string;
}

/**
 * Minimal workflow-handle surface used by the coordinator. Keeps the coordinator
 * decoupled from the full Temporal SDK WorkflowHandle type so tests can pass
 * lightweight mocks.
 */
export interface WorkflowHandleLike {
  describe?: () => Promise<unknown>;
  query(definition: unknown, ...args: unknown[]): Promise<unknown>;
  signal(definition: unknown, ...args: unknown[]): Promise<void>;
}

export type ChangeAuthority =
  | { kind: "temporal_live"; handle: WorkflowHandleLike; changeId: string }
  | { kind: "workflow_completed"; evidence: RecoveryEvidence }
  | { kind: "workflow_missing"; evidence: RecoveryEvidence }
  | { kind: "workflow_poisoned"; evidence: RecoveryEvidence }
  | { kind: "operator_required"; reason: string };

export type MutationOutcome<T> =
  | { kind: "applied_temporal"; value: T; mutationReceiptId: string }
  | {
      kind: "recovered_verified";
      value: Change;
      revision: number;
      recoveryAudit: ProjectionCommitAuditEntry;
    }
  | {
      kind: "recovered_unverified";
      reason: string;
      recoveryAudit: ProjectionCommitAuditEntry;
    }
  | { kind: "stale_revision"; expected: number; actual: number }
  | { kind: "operator_required"; reason: string };

export interface MutationIntent<T> {
  changeId: string;
  mutationKind: string;
  /**
   * Send the typed signal to a live workflow. The coordinator supplies a
   * mutation receipt id; callers must embed it in the signal payload so the
   * workflow can record it deterministically.
   */
  sendSignal: (
    handle: WorkflowHandleLike,
    mutationReceiptId: string,
  ) => Promise<void>;
  /** Refresh authoritative state from Temporal after the signal is applied. */
  refresh: (handle: WorkflowHandleLike) => Promise<T>;
  /** Verify the intended postcondition against the refreshed Temporal state. */
  verifyTemporal: (value: T) => ProjectionCommitVerifyResult;
  /**
   * Apply the field-local mutation to the latest disk projection read inside
   * the commit transaction. Callers must derive the result from `latest`.
   */
  mutateLatestProjection: (latest: Change) => Change;
  /** Verify the intended postcondition against the committed projection readback. */
  verifyProjection: (readback: Change) => ProjectionCommitVerifyResult;
}

export type WorkflowFailureKind =
  | "poisoned_history"
  | "workflow_completed"
  | "workflow_missing"
  | "workflow_unresponsive"
  | "query_failed"
  | "unknown";

export interface WorkflowFailure {
  kind: WorkflowFailureKind;
  evidence: string;
}

const MAX_EVIDENCE_CHARS = 500;

function safeSummarize(error: unknown): string {
  if (error === null || error === undefined) return "unknown error";
  if (error instanceof Error) {
    const name = error.name ?? "";
    const msg = error.message ?? "";
    const text =
      name && msg ? `${name}: ${msg}` : msg || name || "unknown error";
    return truncateEvidence(text);
  }
  const text = typeof error === "string" ? error : safeStringify(error);
  return truncateEvidence(text);
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncateEvidence(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_EVIDENCE_CHARS) return normalized;
  return `${normalized.slice(0, MAX_EVIDENCE_CHARS - 1)}…`;
}

// Legacy message phrasings for completed/absent workflows. These are checked
// only after SDK error names/types fail to classify (D7).
const COMPLETED_WORKFLOW_MESSAGE_RE =
  /workflow execution already completed|already completed|workflow is not running|cannot signal a completed/i;
const MISSING_WORKFLOW_MESSAGE_RE =
  /workflow not found for ID|workflow execution not found|workflow not found/i;
const QUERY_TIMEOUT_MESSAGE_RE = /temporal operation exceeded \d+ms timeout/i;

/**
 * Normalize SDK errors, ADV wrapper errors, and service errors into exactly
 * one typed workflow failure.
 *
 * SDK type/name is checked first; message fixtures are a fallback confined to
 * this boundary.
 */
export function normalizeWorkflowFailure(error: unknown): WorkflowFailure {
  if (error instanceof Error) {
    const name = error.name ?? "";
    const msg = error.message ?? "";
    const lowerName = name.toLowerCase();

    if (isPoisonedHistoryError(error)) {
      return { kind: "poisoned_history", evidence: safeSummarize(error) };
    }

    if (lowerName === "workflowexecutionalreadycompleted") {
      return { kind: "workflow_completed", evidence: safeSummarize(error) };
    }

    if (lowerName === "workflownotfounderror") {
      return { kind: "workflow_missing", evidence: safeSummarize(error) };
    }

    if (COMPLETED_WORKFLOW_MESSAGE_RE.test(msg)) {
      return { kind: "workflow_completed", evidence: safeSummarize(error) };
    }

    if (MISSING_WORKFLOW_MESSAGE_RE.test(msg)) {
      return { kind: "workflow_missing", evidence: safeSummarize(error) };
    }

    if (
      name === "TemporalQueryTimeout" ||
      lowerName === "temporalquerytimeout" ||
      QUERY_TIMEOUT_MESSAGE_RE.test(msg)
    ) {
      return { kind: "workflow_unresponsive", evidence: safeSummarize(error) };
    }
  }

  // Fallback to the existing recovery-classification reason taxonomy for any
  // non-Error or unclassified shape.
  const reason = recoveryReasonFromError(error);
  switch (reason) {
    case "poisoned_history":
      return { kind: "poisoned_history", evidence: safeSummarize(error) };
    case "missing_workflow":
      return { kind: "workflow_missing", evidence: safeSummarize(error) };
    case "workflow_unresponsive":
      return { kind: "workflow_unresponsive", evidence: safeSummarize(error) };
    case "query_failed":
      return { kind: "query_failed", evidence: safeSummarize(error) };
    default:
      return { kind: "unknown", evidence: safeSummarize(error) };
  }
}

function failureToAuthority(failure: WorkflowFailure): ChangeAuthority {
  switch (failure.kind) {
    case "poisoned_history":
      return {
        kind: "workflow_poisoned",
        evidence: { reason: "poisoned_history", evidence: failure.evidence },
      };
    case "workflow_completed":
      return {
        kind: "workflow_completed",
        evidence: { reason: "missing_workflow", evidence: failure.evidence },
      };
    case "workflow_missing":
      return {
        kind: "workflow_missing",
        evidence: { reason: "missing_workflow", evidence: failure.evidence },
      };
    case "workflow_unresponsive":
      return {
        kind: "operator_required",
        reason: `Workflow is unresponsive: ${failure.evidence}`,
      };
    case "query_failed":
      return {
        kind: "operator_required",
        reason: `Workflow query failed: ${failure.evidence}`,
      };
    case "unknown":
      return {
        kind: "operator_required",
        reason: `Unknown workflow failure: ${failure.evidence}`,
      };
  }
}

function failureToMutationOutcome<T>(
  failure: WorkflowFailure,
): MutationOutcome<T> {
  switch (failure.kind) {
    case "poisoned_history":
      return {
        kind: "operator_required",
        reason: `Poisoned-history signal/refresh failure: ${failure.evidence}`,
      };
    case "workflow_completed":
      return {
        kind: "operator_required",
        reason: `Workflow completed: ${failure.evidence}`,
      };
    case "workflow_missing":
      return {
        kind: "operator_required",
        reason: `Workflow missing: ${failure.evidence}`,
      };
    case "workflow_unresponsive":
      return {
        kind: "operator_required",
        reason: `Workflow is unresponsive: ${failure.evidence}`,
      };
    case "query_failed":
      return {
        kind: "operator_required",
        reason: `Workflow query failed: ${failure.evidence}`,
      };
    case "unknown":
      return {
        kind: "operator_required",
        reason: `Unknown workflow failure: ${failure.evidence}`,
      };
  }
}

/**
 * Resolve which authority should process a mutation.
 *
 * - When `signalError` is present, it is normalized and mapped to a recovery
 *   authority or operator_required.
 * - When no signal error is present and a handle is present, the coordinator
 *   probes describe() for poisoned-history evidence. Confirmed poisoned
 *   workflows route to disk recovery; otherwise the healthy Temporal signal
 *   path is used.
 * - `skipProbe` bypasses the describe probe and assumes a live workflow.
 */
export async function resolveChangeAuthority(args: {
  changeId?: string;
  signalError?: unknown;
  handle?: WorkflowHandleLike;
  skipProbe?: boolean;
}): Promise<ChangeAuthority> {
  const { signalError, handle, skipProbe, changeId } = args;

  if (signalError !== undefined) {
    return failureToAuthority(normalizeWorkflowFailure(signalError));
  }

  if (skipProbe || !handle || typeof handle.describe !== "function") {
    if (handle) {
      return {
        kind: "temporal_live",
        handle,
        changeId: changeId ?? "unknown",
      };
    }
    return {
      kind: "operator_required",
      reason:
        "No workflow handle and no signal error; cannot resolve authority.",
    };
  }

  try {
    const description = await handle.describe();
    const evidence = poisonedDescriptionEvidence(description);
    if (evidence !== null) {
      return {
        kind: "workflow_poisoned",
        evidence: { reason: "poisoned_history", evidence },
      };
    }
    return {
      kind: "temporal_live",
      handle,
      changeId: changeId ?? "unknown",
    };
  } catch (describeError) {
    const failure = normalizeWorkflowFailure(describeError);
    if (
      failure.kind === "workflow_completed" ||
      failure.kind === "workflow_missing"
    ) {
      return failureToAuthority(failure);
    }
    // Any other describe failure is not authoritative: the workflow may be
    // live but temporarily unreachable. Fall back to the healthy signal path.
    return {
      kind: "temporal_live",
      handle,
      changeId: changeId ?? "unknown",
    };
  }
}

function isRecoverableWorkflowFailure(failure: WorkflowFailure): boolean {
  return (
    failure.kind === "workflow_completed" ||
    failure.kind === "workflow_missing" ||
    failure.kind === "poisoned_history"
  );
}

interface CoordinateOptions<T> {
  authority: ChangeAuthority;
  intent: MutationIntent<T>;
  /** Disk projection directory. Required for recovery and optional dual-write. */
  changesDir?: string;
  /** Expected revision for conflict-sensitive mutations. */
  expectedRevision?: number;
  /** How long to wait for the mutation receipt query to observe the signal. */
  receiptTimeoutMs?: number;
}

function verifyToResult(
  result: ProjectionCommitVerifyResult,
  defaultError: string,
): { ok: boolean; error: string } {
  if (typeof result === "boolean") {
    return { ok: result, error: defaultError };
  }
  return { ok: result.ok, error: result.error ?? defaultError };
}

/**
 * Execute one coordinated mutation through the resolved authority and return
 * a typed outcome.
 */
export async function coordinateChangeMutation<T>(
  options: CoordinateOptions<T>,
): Promise<MutationOutcome<T>> {
  const { authority, intent, changesDir, expectedRevision, receiptTimeoutMs } =
    options;

  if (authority.kind === "operator_required") {
    return { kind: "operator_required", reason: authority.reason };
  }

  if (authority.kind === "temporal_live") {
    return executeTemporalPath({
      authority,
      intent,
      changesDir,
      receiptTimeoutMs,
    });
  }

  return executeRecoveryPath({
    authority,
    intent,
    changesDir,
    expectedRevision,
  });
}

async function executeTemporalPath<T>({
  authority,
  intent,
  changesDir,
  receiptTimeoutMs,
}: {
  authority: Extract<ChangeAuthority, { kind: "temporal_live" }>;
  intent: MutationIntent<T>;
  changesDir?: string;
  receiptTimeoutMs?: number;
}): Promise<MutationOutcome<T>> {
  const mutationReceiptId = `mrec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  try {
    await intent.sendSignal(authority.handle, mutationReceiptId);
  } catch (signalError) {
    // Signal dispatch failed before the healthy path could establish proof.
    // If the failure is recoverable and the caller supplied a projection
    // directory, transition to the recovery path with the same intent.
    const failure = normalizeWorkflowFailure(signalError);
    if (isRecoverableWorkflowFailure(failure) && changesDir) {
      return executeRecoveryPath({
        authority: failureToAuthority(failure) as Extract<
          ChangeAuthority,
          {
            kind:
              | "workflow_completed"
              | "workflow_missing"
              | "workflow_poisoned";
          }
        >,
        intent,
        changesDir,
      });
    }
    return failureToMutationOutcome(failure);
  }

  const receipt = await waitForQueryPredicate(
    () =>
      authority.handle.query(
        CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt,
        mutationReceiptId,
      ) as Promise<{ id: string } | undefined>,
    (candidate) => candidate?.id === mutationReceiptId,
    { attempts: 10, delayMs: receiptTimeoutMs ? receiptTimeoutMs / 10 : 100 },
  );

  if (!receipt) {
    return {
      kind: "operator_required",
      reason: `Mutation receipt ${mutationReceiptId} was not observed in Temporal state after signaling ${intent.mutationKind}.`,
    };
  }

  let refreshed: T;
  try {
    refreshed = await intent.refresh(authority.handle);
  } catch (refreshError) {
    return failureToMutationOutcome(normalizeWorkflowFailure(refreshError));
  }

  const temporalVerify = verifyToResult(
    intent.verifyTemporal(refreshed),
    "Temporal postcondition verification failed.",
  );
  if (!temporalVerify.ok) {
    return {
      kind: "operator_required",
      reason: temporalVerify.error,
    };
  }

  if (changesDir) {
    const commit = await commitChangeProjection({
      changesDir,
      changeId: intent.changeId,
      authority: {
        kind: "temporal",
        mutationReceiptId,
      },
      mutationKind: intent.mutationKind,
      mutateLatest: intent.mutateLatestProjection,
      verify: ({ readback }) => intent.verifyProjection(readback),
    });
    const commitOutcome = mapCommitOutcome(commit);
    if (commitOutcome.kind !== "recovered_verified") {
      // Dual-write projection failure is a blocker: the Temporal mutation is
      // authoritative, but downstream disk readers would not observe it.
      return {
        kind: "operator_required",
        reason:
          commitOutcome.kind === "recovered_unverified"
            ? `Temporal mutation applied but disk projection dual-write could not be verified: ${commitOutcome.reason}`
            : `Temporal mutation applied but disk projection dual-write failed: ${commitOutcome.kind}`,
      };
    }
  }

  return { kind: "applied_temporal", value: refreshed, mutationReceiptId };
}

async function executeRecoveryPath<T>({
  authority,
  intent,
  changesDir,
  expectedRevision,
}: {
  authority: Extract<
    ChangeAuthority,
    { kind: "workflow_completed" | "workflow_missing" | "workflow_poisoned" }
  >;
  intent: MutationIntent<T>;
  changesDir?: string;
  expectedRevision?: number;
}): Promise<MutationOutcome<T>> {
  if (!changesDir) {
    return {
      kind: "operator_required",
      reason: `Recovery authority ${authority.kind} requires a changesDir to commit the projection, but none was supplied.`,
    };
  }

  const commit = await commitChangeProjection({
    changesDir,
    changeId: intent.changeId,
    expectedRevision,
    authority: {
      kind: "recovery",
      reason: authority.evidence.reason,
      evidence: authority.evidence.evidence,
    },
    mutationKind: intent.mutationKind,
    mutateLatest: intent.mutateLatestProjection,
    verify: ({ readback }) => intent.verifyProjection(readback),
  });

  return mapCommitOutcome(commit) as MutationOutcome<T>;
}

type CommitMappedOutcome =
  | Extract<MutationOutcome<unknown>, { kind: "recovered_verified" }>
  | Extract<MutationOutcome<unknown>, { kind: "recovered_unverified" }>
  | Extract<MutationOutcome<unknown>, { kind: "stale_revision" }>
  | Extract<MutationOutcome<unknown>, { kind: "operator_required" }>;

function mapCommitOutcome(
  commit: ProjectionCommitOutcome,
): CommitMappedOutcome {
  switch (commit.kind) {
    case "committed":
      return {
        kind: "recovered_verified",
        value: commit.readback,
        revision: commit.revision,
        recoveryAudit: commit.audit,
      };
    case "committed_unverified":
      return {
        kind: "recovered_unverified",
        reason: commit.postconditionError,
        recoveryAudit: commit.audit,
      };
    case "stale_revision":
      return {
        kind: "stale_revision",
        expected: commit.expected,
        actual: commit.actual,
      };
    case "lock_timeout":
      return {
        kind: "operator_required",
        reason: `Projection lock timeout at ${commit.lockPath} (${commit.timeoutMs}ms).`,
      };
    case "schema_error":
      return {
        kind: "operator_required",
        reason: `Projection schema error: ${commit.error}`,
      };
    case "write_error":
      return {
        kind: "operator_required",
        reason: `Projection write error: ${commit.error}`,
      };
    case "operator_required":
      return { kind: "operator_required", reason: commit.reason };
  }
}
