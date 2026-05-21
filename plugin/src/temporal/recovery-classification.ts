import { collectErrorText } from "./retry-wrapper";

const POISONED_HISTORY_RE =
  /TMPRL1100|Nondeterminism error|No command scheduled for event/i;

export function isPoisonedHistoryError(error: unknown): boolean {
  return POISONED_HISTORY_RE.test(collectErrorText(error));
}

export function recoveryReasonFromError(
  error: unknown,
): "poisoned_history" | "missing_workflow" {
  return isPoisonedHistoryError(error)
    ? "poisoned_history"
    : "missing_workflow";
}
