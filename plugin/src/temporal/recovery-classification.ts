import { collectErrorText } from "./error-text";
import type { ContractEvidenceStatus } from "../types";

const POISONED_HISTORY_RE =
  /TMPRL1100|Nondeterminism error|No command scheduled for event/i;

// Keep this error-text classifier aligned with the tool-layer describe probe
// in `tools/recovery-probe.ts`. The probe intentionally handles richer
// `describe()` shapes; this workflow-safe module owns plain error/evidence
// text only because it is imported by the workflow bundle.
const POISONED_HISTORY_EVIDENCE_RE =
  /TMPRL1100|Nondeterminism|NonDeterministic|No command scheduled|WorkflowExecutionUpdateAccepted/i;

const COMPLETED_WORKFLOW_EVIDENCE_RE =
  /WorkflowNotFoundError|WorkflowExecutionAlreadyCompleted|workflow execution already completed|already completed|workflow is not running|cannot signal a completed/i;

export const RECOVERY_RECONCILIATION_WARNING =
  "Poisoned-history recovery wrote the disk projection only; the Temporal workflow is not healed and stale workflow state may diverge if it becomes queryable later. Complete recovery in this session and archive or close promptly.";

/**
 * Structural taxonomy for reachable Temporal query failures.
 *
 * - `poisoned_history` — workflow history is nondeterministic/poisoned.
 * - `missing_workflow` — workflow completed or is absent (not-found).
 * - `workflow_unresponsive` — the query did not return within the per-member
 *   cap (workflow/worker wedged or slow). Read-only disk fallback is safe;
 *   the workflow state is stale/unknown, so this reason NEVER authorizes
 *   mutation/re-seed.
 * - `query_failed` — any other reachable query failure. The workflow state
 *   is UNKNOWN, so this reason NEVER authorizes mutation (re-seed,
 *   projection recovery writes). Only the projection-safe subset may gate
 *   mutation paths.
 */
export const RECOVERY_REASONS = [
  "poisoned_history",
  "missing_workflow",
  "workflow_unresponsive",
  "query_failed",
] as const;

export type RecoveryReason = (typeof RECOVERY_REASONS)[number];

/**
 * Subset of recovery reasons that authorize projection recovery / re-seed
 * mutation. `query_failed` is deliberately excluded: an unclassified query
 * failure says nothing about workflow state, so mutating on it can mask or
 * clobber a live workflow.
 */
export type ProjectionRecoveryReason = Exclude<RecoveryReason, "query_failed">;

export const FAILING_CONTRACT_REVIEW_STATUSES = [
  "fail",
  "violated",
  "unknown",
] as const satisfies readonly ContractEvidenceStatus[];

export function isPoisonedHistoryError(error: unknown): boolean {
  return POISONED_HISTORY_RE.test(collectErrorText(error));
}

export function isPrecisePoisonedHistoryEvidence(evidence: string): boolean {
  return POISONED_HISTORY_EVIDENCE_RE.test(evidence);
}

// Exact lowercased Temporal error names that signal a completed/absent
// workflow. Exact membership (not substring) avoids false positives on
// benign errors whose name merely contains one of these substrings.
const COMPLETED_WORKFLOW_NAMES: ReadonlySet<string> = new Set([
  "workflowexecutionalreadycompleted",
  "workflownotfounderror",
]);

// Case-insensitive SUBSTRING (mid-string) patterns for the real Temporal
// message phrasings. NOT line-anchored: the phrasings appear embedded in
// larger messages (e.g. "...Cannot signal a completed workflow handle").
const COMPLETED_WORKFLOW_MESSAGE_PATTERNS: readonly RegExp[] = [
  /workflow execution already completed/i,
  /already completed/i,
  /workflow is not running/i,
  /cannot signal a completed/i,
];

// gRPC/SDK not-found phrasings that signal an ABSENT workflow. Mirrors the
// not-found family in `retry-wrapper.classifyTemporalError` minus the
// start-path-only terms ("already started" / "already exists") and minus
// "not registered" — an unregistered query/workflow type means the workflow
// EXISTS but cannot answer, which is `query_failed`, never `missing_workflow`.
const MISSING_WORKFLOW_TEXT_RE = /not[_ ]found|NOT_FOUND/i;

export function isWorkflowCompletedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const name = err.name?.toLowerCase() ?? "";
  if (COMPLETED_WORKFLOW_NAMES.has(name)) return true;
  const msg = err.message ?? "";
  return COMPLETED_WORKFLOW_MESSAGE_PATTERNS.some((pattern) =>
    pattern.test(msg),
  );
}

export function isPreciseWorkflowRecoveryEvidence(evidence: string): boolean {
  return (
    isPrecisePoisonedHistoryEvidence(evidence) ||
    COMPLETED_WORKFLOW_EVIDENCE_RE.test(evidence)
  );
}

export function isFailingContractReviewStatus(
  status: ContractEvidenceStatus,
): boolean {
  return FAILING_CONTRACT_REVIEW_STATUSES.includes(
    status as (typeof FAILING_CONTRACT_REVIEW_STATUSES)[number],
  );
}

const TEMPORAL_QUERY_TIMEOUT_RE = /Temporal operation exceeded \d+ms timeout/i;

function isWorkflowUnresponsiveError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "TemporalQueryTimeout") return true;
  return TEMPORAL_QUERY_TIMEOUT_RE.test(error.message);
}

export function recoveryReasonFromError(error: unknown): RecoveryReason {
  if (isPoisonedHistoryError(error)) return "poisoned_history";
  if (isWorkflowCompletedError(error)) return "missing_workflow";
  if (MISSING_WORKFLOW_TEXT_RE.test(collectErrorText(error))) {
    return "missing_workflow";
  }
  if (isWorkflowUnresponsiveError(error)) return "workflow_unresponsive";
  // Any other reachable query failure: workflow state unknown. Typed so
  // callers can classify it, but it never authorizes mutation.
  return "query_failed";
}
