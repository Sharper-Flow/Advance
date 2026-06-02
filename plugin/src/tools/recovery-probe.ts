/**
 * Tool-layer poisoned-workflow probe.
 *
 * Lives at the tool layer (not in `temporal/recovery-classification.ts`) to
 * stay out of the Temporal workflow bundle. `recovery-classification.ts` is
 * transitively imported by workflows.ts via gate-readiness.ts, so async
 * probe logic that touches a workflow handle must not be added there.
 *
 * The probe is best-effort: any describe failure returns `false`/`null` and
 * the caller propagates the original error. Callers MUST still require
 * explicit recoveryEvidence / compatibilityReason before mutating disk
 * projection.
 */

import {
  isPoisonedHistoryError,
  isWorkflowCompletedError,
} from "../temporal/recovery-classification";

// Keep the core markers aligned with `temporal/recovery-classification.ts`.
// This probe intentionally accepts richer `describe()` output shapes while the
// workflow-safe classifier owns plain error/evidence text.
const POISONED_DESCRIPTION_RE =
  /WorkflowTaskFailedCauseNonDeterministicError|NonDeterministic|Nondeterminism|TMPRL1100|No command scheduled|WorkflowExecutionUpdateAccepted/i;

export interface PoisonedDescribeProbeTarget {
  describe?: () => Promise<unknown>;
}

const MAX_EVIDENCE_SUMMARY_CHARS = 500;

/**
 * Returns true when the workflow's `describe()` output carries
 * poisoned-history evidence (NonDeterministicError, Nondeterminism,
 * TMPRL1100, etc.). Returns false on:
 *   - no `describe()` function on the handle
 *   - describe() throws
 *   - describe() output does not match poisoned evidence
 */
export async function workflowHasPoisonedDescription(
  handle: PoisonedDescribeProbeTarget,
): Promise<boolean> {
  return (await workflowPoisonedDescriptionEvidence(handle)) !== null;
}

/**
 * Shared tool-layer predicate for poisoned-history recovery decisions.
 *
 * Pass `signalError` only for call sites whose existing contract accepts either
 * legacy signal-error text OR workflow describe evidence. Omit it for stricter
 * call sites that require describe-confirmed poisoned history.
 */
export async function workflowHasPoisonedRecoveryEvidence(
  handle: PoisonedDescribeProbeTarget,
  options: { signalError?: unknown } = {},
): Promise<boolean> {
  if (
    options.signalError !== undefined &&
    isPoisonedHistoryError(options.signalError)
  ) {
    return true;
  }
  return workflowHasPoisonedDescription(handle);
}

/**
 * Shared classifier for the completed-OR-poisoned recovery decision used by the
 * gate (acceptance/release) and contract (poisoned_history) recovery paths.
 *
 * Returns:
 *   - `completedWorkflow` — the error indicates a completed/absent workflow
 *     (callers use this as `diskDirect`).
 *   - `recover` — recovery should be attempted at all: completed OR
 *     describe-confirmed poisoned. The `||` short-circuits the describe() probe
 *     when the workflow is already known completed.
 *
 * Call sites keep their own GATING (gateId scope vs recoveryMode) and their own
 * recovery ACTION; this only consolidates the duplicated detection expression.
 * NOTE: the completed-only recovery sites (which intentionally do NOT probe for
 * poisoned evidence) must keep calling `isWorkflowCompletedError` directly and
 * must NOT adopt this combinator — doing so would broaden their recovery.
 */
export async function classifyCompletedOrPoisonedRecovery(
  handle: PoisonedDescribeProbeTarget,
  error: unknown,
): Promise<{ completedWorkflow: boolean; recover: boolean }> {
  const completedWorkflow = isWorkflowCompletedError(error);
  const recover =
    completedWorkflow ||
    (await workflowHasPoisonedRecoveryEvidence(handle, { signalError: error }));
  return { completedWorkflow, recover };
}

/**
 * Returns a bounded evidence summary when `describe()` carries poisoned-history
 * markers, otherwise null. Shares the same probe regex as
 * `workflowHasPoisonedDescription` so callers do not invent another
 * classification path.
 */
export async function workflowPoisonedDescriptionEvidence(
  handle: PoisonedDescribeProbeTarget,
): Promise<string | null> {
  if (typeof handle.describe !== "function") return null;
  try {
    const description = await handle.describe();
    const text = stringifyDescription(description);
    return POISONED_DESCRIPTION_RE.test(text) ? summarizeEvidence(text) : null;
  } catch {
    return null;
  }
}

function stringifyDescription(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizeEvidence(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_EVIDENCE_SUMMARY_CHARS) return normalized;
  return `${normalized.slice(0, MAX_EVIDENCE_SUMMARY_CHARS - 1)}…`;
}
