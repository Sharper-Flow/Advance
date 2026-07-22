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
  isPreciseWorkflowRecoveryEvidence,
  isWorkflowCompletedError,
} from "../temporal/recovery-classification";
import { createLogger } from "../utils/debug-log";

const logger = createLogger("recovery-probe");

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
 * Value-level poisoned-history evidence predicate over an already-fetched
 * `describe()` result. Shares the same probe regex as the handle-level
 * wrappers so callers that need the raw description for other reasons
 * (e.g. run pinning in `adv_change_workflow_terminate`) do not invent a
 * second classification path or pay for a second describe RPC.
 */
export function poisonedDescriptionEvidence(
  description: unknown,
): string | null {
  const text = stringifyDescription(description);
  return POISONED_DESCRIPTION_RE.test(text) ? summarizeEvidence(text) : null;
}

/**
 * Returns a bounded evidence summary when `describe()` carries poisoned-history
 * markers, otherwise null. Shares the same probe regex as
 * `workflowHasPoisonedDescription` so callers do not invent another
 * classification path.
 */
export async function workflowPoisonedDescriptionEvidence(
  handle: PoisonedDescribeProbeTarget | undefined,
): Promise<string | null> {
  if (!handle || typeof handle.describe !== "function") return null;
  try {
    return poisonedDescriptionEvidence(await handle.describe());
  } catch {
    return null;
  }
}

/**
 * Probe-first recovery gate. Returns true when the operator has supplied
 * sufficient evidence to take the disk-direct recovery branch WITHOUT
 * firing the signal — required because Temporal signals are fire-and-forget
 * (server acceptance, not workflow processing) and silently resolve on
 * poisoned replay, so the existing catch-gated path is unreachable for
 * the common poison case (issue #198, #253).
 *
 * Authority model: operator-supplied precise recoveryEvidence (textual
 * markers like WorkflowNotFoundError, WorkflowExecutionAlreadyCompleted,
 * TMPRL1100). describe() is NOT authoritative per validator findings —
 * DescribeWorkflowExecutionResponse has no Workflow Task failure cause/
 * details field in the Temporal API proto.
 *
 * Callers MUST still emit recovery_audit (reason + evidence + recovered_at)
 * on the disk-direct write.
 *
 * Constraint: per agreement C2, recoveryEvidence must be precise poisoned/
 * completed evidence via isPreciseWorkflowRecoveryEvidence. This helper
 * enforces that — it does NOT accept vague evidence.
 */
export function shouldTakeRecoveryBranch(args: {
  recoveryMode?: "normal" | "poisoned_history";
  recoveryEvidence?: string;
}): boolean {
  return (
    args.recoveryMode === "poisoned_history" &&
    typeof args.recoveryEvidence === "string" &&
    args.recoveryEvidence.trim().length > 0 &&
    isPreciseWorkflowRecoveryEvidence(args.recoveryEvidence)
  );
}

/**
 * Optional diagnostic probe — logs describe() content for operator visibility
 * but NEVER returns a recovery decision. Recovery authority comes solely
 * from operator-supplied recoveryEvidence via shouldTakeRecoveryBranch.
 *
 * Kept as an export so callers can log "describe said X" alongside the
 * recovery_audit trail without inventing a parallel classification path.
 * Best-effort: describe() failures are swallowed (returns void).
 */
export async function logRecoveryProbeDiagnostics(
  handle: PoisonedDescribeProbeTarget | undefined,
  changeId: string,
): Promise<void> {
  try {
    const evidence = await workflowPoisonedDescriptionEvidence(handle);
    if (evidence) {
      logger.info(
        `Recovery probe diagnostics for ${changeId}: describe() carried poisoned markers (advisory only; operator evidence is authority)`,
      );
    }
  } catch {
    // Best-effort diagnostic; never throw.
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
