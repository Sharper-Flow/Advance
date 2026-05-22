import { collectErrorText } from "./error-text";
import type { ContractEvidenceStatus } from "../types";

const POISONED_HISTORY_RE =
  /TMPRL1100|Nondeterminism error|No command scheduled for event/i;

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

export function isWorkflowCompletedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message?.toLowerCase() ?? "";
  const name = err.name?.toLowerCase() ?? "";
  return (
    msg.includes("already completed") ||
    msg.includes("workflow execution already completed") ||
    name.includes("workflowexecutionalreadycompleted") ||
    name.includes("workflownotfounderror") ||
    msg.includes("workflow is not running") ||
    msg.includes("cannot signal a completed")
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
