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

export function recoveryReasonFromError(
  error: unknown,
): "poisoned_history" | "missing_workflow" {
  return isPoisonedHistoryError(error)
    ? "poisoned_history"
    : "missing_workflow";
}
