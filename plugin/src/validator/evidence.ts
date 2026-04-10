/**
 * Evidence Semantics Validation
 *
 * Pure validation for TDD evidence exit-code semantics.
 * Called by tool layer (adv_task_evidence, adv_run_test) before
 * store.tasks.recordEvidence() to reject contradictory evidence.
 *
 * Rules:
 *   - red phase + exitCode 0 → reject (test should be failing)
 *   - green phase + exitCode non-zero → reject (test should be passing)
 *   - exitCode undefined → allow (backward compat, manual recording)
 */

export type EvidenceValidation =
  | { valid: true }
  | { valid: false; reason: string };

export function validateEvidenceSemantics(
  phase: "red" | "green",
  exitCode: number | undefined,
): EvidenceValidation {
  if (exitCode === undefined) return { valid: true };

  if (phase === "red" && exitCode === 0) {
    return {
      valid: false,
      reason:
        `Red phase expects a failing test (non-zero exit code), but got exitCode=0. ` +
        `Either the test is passing (use phase="green") or the test needs to be written to fail first.`,
    };
  }

  if (phase === "green" && exitCode !== 0) {
    return {
      valid: false,
      reason:
        `Green phase expects a passing test (exit code 0), but got exitCode=${exitCode}. ` +
        `Either the implementation is incomplete or the wrong phase was specified.`,
    };
  }

  return { valid: true };
}
