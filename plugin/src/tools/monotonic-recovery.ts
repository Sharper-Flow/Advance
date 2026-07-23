/**
 * Machine-evidence monotonic recovery classifier.
 *
 * Replaces operator-supplied `recoveryMode`/`recoveryEvidence`/`recoveryReason`
 * ceremony on routine mutations (design D4, AC5/AC6/SC3). The classifier
 * inspects authoritative machine signals — Temporal signal/query errors,
 * describe() workflow status, bounded workflow-history evidence — and decides
 * whether a mutation should:
 *
 *   1. proceed via the normal Temporal signal path,
 *   2. recover via the disk-projection writer (monotonic-safe), or
 *   3. refuse with a typed operator-required result (destructive or
 *      competing-authority cases remain explicitly operator-controlled).
 *
 * Authority model (per agreement C3/C4/DONT1/DONT5):
 *   - A reachable, schema-valid workflow describe is authoritative.
 *   - A workflow-completed signal error is authoritative on its own.
 *   - describe() evidence NEVER alone authorizes a write when the signal has
 *     not been attempted — it authorizes skipping the signal (probe-first
 *     path) only when the workflow is describe-confirmed poisoned.
 *   - Non-monotonic post-state (disk write did not produce the expected
 *     state) is never silently accepted; callers must verify post-state and
 *     surface a typed refusal.
 *
 * This module is a pure classifier. It performs no disk writes and no signal
 * sends. Callers retain the disk-projection writer and the post-write
 * monotonicity check; this only decides which path they should take.
 */
import {
  isWorkflowCompletedError,
  recoveryReasonFromError,
  type ProjectionRecoveryReason,
} from "../temporal/recovery-classification";
import {
  workflowPoisonedDescriptionEvidence,
  type PoisonedDescribeProbeTarget,
} from "./recovery-probe";

export type MonotonicRecoveryAuthority =
  /**
   * - `workflow_completed` — the signal error is authoritative on its own:
   *   the workflow is completed, absent, or unreachable. No describe probe is
   *   required.
   * - `workflow_poisoned_describe` — describe() carries poisoned-history
   *   evidence; only safe disk-direct writes are allowed.
   */
  "workflow_completed" | "workflow_poisoned_describe";

export type OperatorRequiredCause =
  /**
   * - `query_failed` — the signal threw an unclassified error. Workflow state
   *   is unknown; never mutate.
   * - `reachable_authority_disagrees` — the signal error says poisoned but
   *   describe() does not confirm. Two authorities disagree; operator must
   *   decide.
   * - `non_monotonic` — reserved for callers to surface post-write
   *   monotonicity violations through the same typed refusal shape.
   */
  "query_failed" | "reachable_authority_disagrees" | "non_monotonic";

export type MonotonicRecoveryDecision =
  | { kind: "proceed_with_signal" }
  | {
      kind: "recover_via_disk";
      reason: ProjectionRecoveryReason;
      evidence: string;
      authority: MonotonicRecoveryAuthority;
    }
  | {
      kind: "operator_required";
      cause: OperatorRequiredCause;
      detail: string;
    };

export interface ClassifyMutationRecoveryArgs {
  /**
   * Present when the calling tool has already attempted the Temporal signal
   * and the signal threw. When omitted, the classifier takes the probe-first
   * path: probe describe() (if available) to decide whether to skip the
   * signal entirely.
   */
  signalError?: unknown;
  /**
   * Workflow handle with a `describe()` method. Optional: callers that lack
   * a handle (e.g. tests or paths where the workflow is known unreachable)
   * always get `proceed_with_signal` on the probe-first path.
   */
  handle?: PoisonedDescribeProbeTarget | undefined;
  /**
   * Bypass the describe probe on the probe-first path. Used by callers that
   * have already decided to attempt the signal optimistically and will
   * re-classify with `signalError` if it throws.
   */
  skipProbe?: boolean;
}

/**
 * Decide whether a mutation should proceed via the normal Temporal signal
 * or via the disk-projection recovery writer. See module docstring for the
 * full authority model.
 */
// rq-directMonotonicRecovery01: classify whether recovery can proceed via disk without operator.
export async function classifyMutationRecoveryDecision(
  args: ClassifyMutationRecoveryArgs,
): Promise<MonotonicRecoveryDecision> {
  const { signalError, handle, skipProbe } = args;

  // Signal-error path: a signal was attempted and threw.
  if (signalError !== undefined) {
    const reason = recoveryReasonFromError(signalError);

    if (reason === "query_failed") {
      return {
        kind: "operator_required",
        cause: "query_failed",
        detail:
          "Signal failed with an unclassified query error; workflow state is unknown and mutation is unsafe.",
      };
    }

    // Completed workflow (missing_workflow reason): the signal error itself is
    // authoritative. No describe probe is required — describe() of a completed
    // workflow is the same evidence shape, just slower.
    if (reason === "missing_workflow") {
      return {
        kind: "recover_via_disk",
        reason: "missing_workflow",
        authority: "workflow_completed",
        evidence: summarizeError(signalError),
      };
    }

    // Poisoned history: probe describe() to confirm. describe() is the
    // authoritative second signal — Temporal error text alone could be a
    // transient classification that disagrees with the live workflow.
    const describeEvidence = await probeDescribeEvidence(handle);
    if (describeEvidence === null) {
      return {
        kind: "operator_required",
        cause: "reachable_authority_disagrees",
        detail:
          "Signal error carried poisoned-history markers but describe() did not confirm; two authorities disagree and mutation is unsafe without operator review.",
      };
    }
    return {
      kind: "recover_via_disk",
      reason: "poisoned_history",
      authority: "workflow_poisoned_describe",
      // Prefer the describe evidence (richer, machine-produced) but include
      // the signal error context in the bounded summary.
      evidence: describeEvidence,
    };
  }

  // Probe-first path: signal has not been attempted. Probe describe() to
  // decide whether to skip the signal entirely (poisoned workflows silently
  // resolve signals, so the signal would have no effect anyway).
  if (skipProbe || !handle || typeof handle.describe !== "function") {
    return { kind: "proceed_with_signal" };
  }

  const describeEvidence = await probeDescribeEvidence(handle);
  if (describeEvidence === null) {
    return { kind: "proceed_with_signal" };
  }
  return {
    kind: "recover_via_disk",
    reason: "poisoned_history",
    authority: "workflow_poisoned_describe",
    evidence: describeEvidence,
  };
}

async function probeDescribeEvidence(
  handle?: PoisonedDescribeProbeTarget,
): Promise<string | null> {
  if (!handle || typeof handle.describe !== "function") return null;
  // workflowPoisonedDescriptionEvidence swallows describe() failures and
  // returns null — exactly the "describe disagrees / unavailable" signal
  // we want here.
  return workflowPoisonedDescriptionEvidence(handle);
}

const MAX_EVIDENCE_CHARS = 500;

function summarizeError(error: unknown): string {
  if (error === null || error === undefined) return "unknown error";
  if (error instanceof Error) {
    const name = error.name ?? "";
    const msg = error.message ?? "";
    const text =
      name && msg ? `${name}: ${msg}` : msg || name || "unknown error";
    return truncate(text);
  }
  const text = typeof error === "string" ? error : safeStringify(error);
  return truncate(text);
}

function truncate(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_EVIDENCE_CHARS) return normalized;
  return `${normalized.slice(0, MAX_EVIDENCE_CHARS - 1)}…`;
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Convenience predicate for callers that only need the binary
 * "should I skip the signal and recover via disk?" answer.
 */
export async function shouldRecoverViaDisk(
  args: ClassifyMutationRecoveryArgs,
): Promise<boolean> {
  const decision = await classifyMutationRecoveryDecision(args);
  return decision.kind === "recover_via_disk";
}

// Re-exported for callers that need to detect the workflow-completed
// authority without duplicating the classifier.
export { isWorkflowCompletedError };
