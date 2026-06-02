/**
 * Canonical recognition-set tests for isWorkflowCompletedError
 * (remediateSlopScanFindings / QUAL-002 AC5).
 *
 * The classifier is the authoritative gatekeeper for routing completed-workflow
 * failures into disk-projection recovery. It MUST recognize the real Temporal
 * phrasings (exact error names + mid-string message patterns) while NOT
 * false-positiving on benign errors whose name merely CONTAINS a recognized
 * substring. This test locks the recognized set so SDK upgrades surface as a
 * test failure rather than a silent recovery break.
 */

import { describe, expect, test } from "vitest";
import { isWorkflowCompletedError } from "./recovery-classification";

function errWithName(name: string, message = "x"): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

describe("isWorkflowCompletedError — canonical recognition set", () => {
  test("recognized error names (exact) → true", () => {
    expect(
      isWorkflowCompletedError(
        errWithName("WorkflowExecutionAlreadyCompleted"),
      ),
    ).toBe(true);
    expect(isWorkflowCompletedError(errWithName("WorkflowNotFoundError"))).toBe(
      true,
    );
  });

  test("recognized message phrasings (mid-string) → true", () => {
    for (const msg of [
      "workflow execution already completed",
      "Workflow Already Completed",
      "Temporal: the Workflow is not running",
      "Cannot signal a completed workflow handle",
    ]) {
      expect(isWorkflowCompletedError(new Error(msg))).toBe(true);
    }
  });

  test("near-miss name containing a recognized substring → false", () => {
    // Broad substring matching (the pre-hardening behavior) would return true
    // for this; exact name membership must reject it.
    const nearMiss = errWithName(
      "MyWorkflowExecutionAlreadyCompletedHandlerError",
      "totally unrelated failure",
    );
    expect(isWorkflowCompletedError(nearMiss)).toBe(false);
  });

  test("benign errors and non-Error values → false", () => {
    expect(isWorkflowCompletedError(new Error("network timeout"))).toBe(false);
    expect(
      isWorkflowCompletedError(
        errWithName("TypeError", "cannot read properties of undefined"),
      ),
    ).toBe(false);
    expect(isWorkflowCompletedError("string error")).toBe(false);
    expect(isWorkflowCompletedError(42)).toBe(false);
    expect(isWorkflowCompletedError(null)).toBe(false);
    expect(isWorkflowCompletedError(undefined)).toBe(false);
  });
});
