import { describe, expect, test } from "vitest";
import {
  checkMutationEligibility,
  classifyMutationOutcome,
  evaluateDestructiveWorkflowRecoveryPreconditions,
  isOuterSignalRetryAllowed,
  requireMutationEligible,
  TemporalMutationIneligibleError,
  WORKFLOW_TERMINATE_SHIPPED_GATES,
  type TemporalMutationOutcome,
  type TemporalWorkflowDiagnostic,
} from "./mutation-safety";
import { createDefaultGates } from "../types";
import type { Gates } from "../types";

const SC4_INELIGIBLE_CLASSES: Array<TemporalWorkflowDiagnostic["class"]> = [
  "no_poller",
  "query_failed_or_not_registered",
  "deadline",
  "unknown",
  "query_rejected",
  "resource_exhaustion",
  "permission",
];

function shippedGates(): Gates {
  const gates = createDefaultGates();
  for (const gateId of WORKFLOW_TERMINATE_SHIPPED_GATES) {
    gates[gateId] = { status: "done" };
  }
  return gates;
}

function baseDestructiveInput() {
  return {
    approvedByUser: true as const,
    approvalEvidence:
      "Operator approved termination of wedged shipped workflow",
    changeStatus: "active" as const,
    gates: shippedGates(),
    serviceAvailable: true,
    description: {
      runId: "run-123",
      statusName: "RUNNING",
      wedgedEvidence: "TMPRL1100 No command scheduled for event",
    },
  };
}

describe("classifyMutationOutcome", () => {
  test("confirmed when both signal and readback succeed", () => {
    expect(classifyMutationOutcome({})).toBe("confirmed");
    expect(
      classifyMutationOutcome({ signalError: null, readbackError: null }),
    ).toBe("confirmed");
  });

  test("outcome_unknown when signal succeeds but readback fails", () => {
    for (const message of [
      "no poller is available for this workflow query",
      "Query type 'changeStateQuery' not registered",
      "deadline exceeded",
      "Failed to query Workflow",
    ]) {
      expect(
        classifyMutationOutcome({ readbackError: new Error(message) }),
      ).toBe("outcome_unknown_readback_unavailable");
    }
  });

  test("failed_before_ack when the signal call itself errors", () => {
    expect(
      classifyMutationOutcome({
        signalError: new Error("connection refused"),
      }),
    ).toBe("failed_before_ack");
  });

  test("signal error takes precedence over readback error", () => {
    expect(
      classifyMutationOutcome({
        signalError: new Error("connection refused"),
        readbackError: new Error("no poller"),
      }),
    ).toBe("failed_before_ack");
  });
});

describe("isOuterSignalRetryAllowed", () => {
  test.each([
    "confirmed",
    "outcome_unknown_readback_unavailable",
    "failed_before_ack",
  ] as TemporalMutationOutcome[])("prevents outer retry for %s", (outcome) => {
    expect(isOuterSignalRetryAllowed(outcome)).toBe(false);
  });
});

describe("checkMutationEligibility", () => {
  test("reachable workflow is eligible for mutation", () => {
    const check = checkMutationEligibility({
      reachable: true,
      class: "reachable",
    });
    expect(check.eligible).toBe(true);
    expect(check.reason).toBeUndefined();
  });

  test("SC4-listed classes are mutation ineligible", () => {
    for (const cls of SC4_INELIGIBLE_CLASSES) {
      const check = checkMutationEligibility({
        reachable: false,
        class: cls,
      });
      expect(check.eligible).toBe(false);
      expect(check.reason).toMatch(/mutation-ineligible/);
      expect(check.reason).toMatch(new RegExp(cls));
    }
  });

  test("not_found and poisoned_history are not blocked by the SC4 guard", () => {
    // These classes require additional safeguards (exact pinning, approval,
    // shipped proof, dry-run, poisoned-history evidence) but are not
    // mutation-ineligible per SC4 — they may authorize projection recovery.
    expect(
      checkMutationEligibility({ reachable: false, class: "not_found" })
        .eligible,
    ).toBe(true);
    expect(
      checkMutationEligibility({
        reachable: false,
        class: "poisoned_history",
      }).eligible,
    ).toBe(true);
  });
});

describe("requireMutationEligible", () => {
  test("does not throw for a reachable workflow", () => {
    expect(() =>
      requireMutationEligible({ reachable: true, class: "reachable" }),
    ).not.toThrow();
  });

  test("throws TemporalMutationIneligibleError for SC4 classes", () => {
    for (const cls of SC4_INELIGIBLE_CLASSES) {
      expect(() =>
        requireMutationEligible({ reachable: false, class: cls }),
      ).toThrow(TemporalMutationIneligibleError);
    }
  });

  test("error preserves the diagnostic class and evidence", () => {
    const diagnostic: TemporalWorkflowDiagnostic = {
      reachable: false,
      class: "deadline",
      evidence: "deadline exceeded",
    };
    try {
      requireMutationEligible(diagnostic);
      expect.fail("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(TemporalMutationIneligibleError);
      const typed = error as TemporalMutationIneligibleError;
      expect(typed.workflowClass).toBe("deadline");
      expect(typed.diagnostic).toEqual(diagnostic);
    }
  });
});

describe("evaluateDestructiveWorkflowRecoveryPreconditions", () => {
  test("refuses without explicit approvedByUser", () => {
    const result = evaluateDestructiveWorkflowRecoveryPreconditions({
      ...baseDestructiveInput(),
      approvedByUser: false as unknown as true,
    });
    expect(result.kind).toBe("refused");
    expect(result).toMatchObject({
      reason: expect.stringMatching(/approvedByUser/),
    });
  });

  test("refuses blank approvalEvidence", () => {
    const result = evaluateDestructiveWorkflowRecoveryPreconditions({
      ...baseDestructiveInput(),
      approvalEvidence: "   ",
    });
    expect(result.kind).toBe("refused");
    expect(result).toMatchObject({
      reason: expect.stringMatching(/approvalEvidence/),
    });
  });

  test("refuses archived changes and routes to adv_archive_purge", () => {
    const result = evaluateDestructiveWorkflowRecoveryPreconditions({
      ...baseDestructiveInput(),
      changeStatus: "archived",
    });
    expect(result.kind).toBe("refused");
    expect(result).toMatchObject({
      reason: expect.stringMatching(/archived/i),
    });
    expect(String((result as { reason: string }).reason)).toMatch(
      /adv_archive_purge/,
    );
  });

  test("refuses changes without shipped acceptance/release gate proof", () => {
    const gates = shippedGates();
    gates.release = { status: "pending" };
    const result = evaluateDestructiveWorkflowRecoveryPreconditions({
      ...baseDestructiveInput(),
      gates,
    });
    expect(result.kind).toBe("refused");
    const reason = (result as { reason: string }).reason;
    expect(reason).toMatch(/shipped|gate/i);
    expect(reason).toMatch(/release/);
  });

  test("refuses when Temporal service is unavailable", () => {
    const result = evaluateDestructiveWorkflowRecoveryPreconditions({
      ...baseDestructiveInput(),
      serviceAvailable: false,
    });
    expect(result.kind).toBe("refused");
    expect(result).toMatchObject({
      reason: expect.stringMatching(/Temporal/i),
    });
  });

  test("refuses an unclassifiable run status", () => {
    const result = evaluateDestructiveWorkflowRecoveryPreconditions({
      ...baseDestructiveInput(),
      description: {
        ...baseDestructiveInput().description,
        statusName: "UNSPECIFIED",
      },
    });
    expect(result.kind).toBe("refused");
    expect(result).toMatchObject({ reason: expect.stringMatching(/status/i) });
  });

  test("refuses a RUNNING/PAUSED run without poisoned-history evidence", () => {
    const result = evaluateDestructiveWorkflowRecoveryPreconditions({
      ...baseDestructiveInput(),
      description: {
        runId: "run-123",
        statusName: "RUNNING",
        wedgedEvidence: "",
      },
    });
    expect(result.kind).toBe("refused");
    expect(result).toMatchObject({
      reason: expect.stringMatching(/wedged|poisoned/i),
    });
  });

  test("refuses a terminable run with no runId to pin", () => {
    const result = evaluateDestructiveWorkflowRecoveryPreconditions({
      ...baseDestructiveInput(),
      description: {
        runId: "",
        statusName: "RUNNING",
        wedgedEvidence: "TMPRL1100",
      },
    });
    expect(result.kind).toBe("refused");
    expect(result).toMatchObject({
      reason: expect.stringMatching(/runId|pin/i),
    });
  });

  test("dry-run passes without terminating or refreshing cache", () => {
    const result = evaluateDestructiveWorkflowRecoveryPreconditions({
      ...baseDestructiveInput(),
      dryRun: true,
    });
    expect(result.kind).toBe("allowed");
    expect(result).toMatchObject({
      alreadyTerminated: false,
      dryRun: true,
    });
  });

  test("treats an already-terminal run status as idempotent alreadyTerminated", () => {
    for (const statusName of ["TERMINATED", "COMPLETED", "CANCELLED"]) {
      const result = evaluateDestructiveWorkflowRecoveryPreconditions({
        ...baseDestructiveInput(),
        description: { runId: "run-123", statusName, wedgedEvidence: "" },
      });
      expect(result.kind).toBe("allowed");
      expect(result).toMatchObject({ alreadyTerminated: true });
    }
  });

  test("allows termination of a pinned, wedged, RUNNING/PAUSED run", () => {
    const result = evaluateDestructiveWorkflowRecoveryPreconditions(
      baseDestructiveInput(),
    );
    expect(result.kind).toBe("allowed");
    expect(result).toMatchObject({
      alreadyTerminated: false,
      dryRun: false,
    });
  });
});
