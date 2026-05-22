/**
 * Tool-layer poisoned-workflow probe.
 *
 * Lives at the tool layer (not in `temporal/recovery-classification.ts`) to
 * stay out of the Temporal workflow bundle. `recovery-classification.ts` is
 * transitively imported by workflows.ts via gate-readiness.ts, so async
 * probe logic that touches a workflow handle must not be added there.
 *
 * The probe is best-effort: any describe failure returns `false` and the
 * caller propagates the original error. Callers MUST still require explicit
 * recoveryEvidence / compatibilityReason before mutating disk projection.
 */

const POISONED_DESCRIPTION_RE =
  /WorkflowTaskFailedCauseNonDeterministicError|NonDeterministic|Nondeterminism|TMPRL1100|No command scheduled|WorkflowExecutionUpdateAccepted/i;

export interface PoisonedDescribeProbeTarget {
  describe?: () => Promise<unknown>;
}

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
  if (typeof handle.describe !== "function") return false;
  try {
    const description = await handle.describe();
    return POISONED_DESCRIPTION_RE.test(stringifyDescription(description));
  } catch {
    return false;
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
