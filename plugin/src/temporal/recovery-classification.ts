import { collectErrorText } from "./retry-wrapper";
import type { Change, ContractEvidenceStatus } from "../types";

const POISONED_HISTORY_RE =
  /TMPRL1100|Nondeterminism error|No command scheduled for event/i;

const POISONED_HISTORY_EVIDENCE_RE =
  /TMPRL1100|Nondeterminism|No command scheduled|poisoned[-\s]?history|workflow history|WorkflowExecutionUpdateAccepted/i;

export const RECOVERY_RECONCILIATION_WARNING =
  "Poisoned-history recovery wrote the disk projection only; the Temporal workflow is not healed and stale workflow state may diverge if it becomes queryable later. Complete recovery in this session and archive or close promptly.";

export const FAILING_CONTRACT_REVIEW_STATUSES = [
  "fail",
  "violated",
  "unknown",
] as const satisfies readonly ContractEvidenceStatus[];

type RecoveryMarkedChange = Change & {
  _recovery?: { reason?: string };
};

export function isPoisonedHistoryError(error: unknown): boolean {
  return POISONED_HISTORY_RE.test(collectErrorText(error));
}

export function isPrecisePoisonedHistoryEvidence(evidence: string): boolean {
  return POISONED_HISTORY_EVIDENCE_RE.test(evidence);
}

export function isFailingContractReviewStatus(
  status: ContractEvidenceStatus,
): boolean {
  return FAILING_CONTRACT_REVIEW_STATUSES.includes(
    status as (typeof FAILING_CONTRACT_REVIEW_STATUSES)[number],
  );
}

export function hasPoisonedHistoryMarker(change: Change): boolean {
  return (
    (change as RecoveryMarkedChange)._recovery?.reason === "poisoned_history"
  );
}

export function recoveryReasonFromError(
  error: unknown,
): "poisoned_history" | "missing_workflow" {
  return isPoisonedHistoryError(error)
    ? "poisoned_history"
    : "missing_workflow";
}
