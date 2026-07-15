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
import {
  isWorkflowCompletedError,
  recoveryReasonFromError,
} from "./recovery-classification";

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

describe("recoveryReasonFromError — three-way query-failure taxonomy", () => {
  test("poisoned history → poisoned_history", () => {
    expect(
      recoveryReasonFromError(
        new Error(
          "[TMPRL1100] Nondeterminism error: No command scheduled for event HistoryEvent(id: 231)",
        ),
      ),
    ).toBe("poisoned_history");
  });

  test("completed/absent workflow → missing_workflow", () => {
    expect(
      recoveryReasonFromError(
        new Error("Cannot signal a completed workflow handle"),
      ),
    ).toBe("missing_workflow");
    expect(recoveryReasonFromError(errWithName("WorkflowNotFoundError"))).toBe(
      "missing_workflow",
    );
    expect(
      recoveryReasonFromError(
        new Error("Workflow execution not found for workflowId: change-p1-x"),
      ),
    ).toBe("missing_workflow");
  });

  test("other reachable query failure → query_failed", () => {
    // Generic Temporal SDK query failure with no poisoned/completed markers.
    expect(recoveryReasonFromError(new Error("Failed to query Workflow"))).toBe(
      "query_failed",
    );
    expect(recoveryReasonFromError(new Error("permission denied"))).toBe(
      "query_failed",
    );
    // An unregistered query handler means the workflow EXISTS but cannot
    // answer — that is not a missing workflow and must never authorize
    // re-seed mutation.
    expect(
      recoveryReasonFromError(
        new Error("Query type 'changeStateQuery' not registered"),
      ),
    ).toBe("query_failed");
  });

  test("non-Error values → query_failed", () => {
    expect(recoveryReasonFromError("string error")).toBe("query_failed");
    expect(recoveryReasonFromError(null)).toBe("query_failed");
    expect(recoveryReasonFromError(undefined)).toBe("query_failed");
  });
});
