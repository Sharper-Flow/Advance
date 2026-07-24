import { describe, expect, it, vi } from "vitest";

import type { PoisonedDescribeProbeTarget } from "./recovery-probe";

import { classifyMutationRecoveryDecision } from "./monotonic-recovery";

function makeHandle(describeResult: unknown): PoisonedDescribeProbeTarget {
  return {
    describe: vi.fn(async () => describeResult),
  };
}

function makeFailingHandle(error: unknown): PoisonedDescribeProbeTarget {
  return {
    describe: vi.fn(async () => {
      throw error;
    }),
  };
}

const POISONED_DESCRIBE = {
  workflowExecutionInfo: {
    status: "RUNNING",
    historyLength: 842,
  },
  pendingActivities: [],
  pendingWorkflowTask: {
    state: "FAILED",
    failure: {
      cause: {
        type: "WorkflowTaskFailedCauseNonDeterministicError",
        message:
          "Non-deprecated patch marker encountered for change acceptance-readiness-revision-v1, but there is no corresponding change command",
      },
    },
  },
};

const HEALTHY_DESCRIBE = {
  workflowExecutionInfo: { status: "RUNNING", historyLength: 12 },
  pendingWorkflowTask: { state: "QUERYABLE" },
};

describe("classifyMutationRecoveryDecision", () => {
  describe("signal-error path (signal was attempted and threw)", () => {
    it("classifies completed workflow as recover_via_disk", async () => {
      const error = new Error("workflow execution already completed");
      error.name = "WorkflowExecutionAlreadyCompleted";
      const decision = await classifyMutationRecoveryDecision({
        signalError: error,
        handle: makeHandle(HEALTHY_DESCRIBE),
      });
      expect(decision.kind).toBe("recover_via_disk");
      if (decision.kind === "recover_via_disk") {
        expect(decision.reason).toBe("missing_workflow");
        expect(decision.authority).toBe("workflow_completed");
        expect(decision.evidence).toMatch(/already completed/i);
      }
    });

    it("classifies WorkflowNotFoundError as recover_via_disk", async () => {
      const error = new Error("workflow not found");
      error.name = "WorkflowNotFoundError";
      const decision = await classifyMutationRecoveryDecision({
        signalError: error,
        handle: makeHandle(HEALTHY_DESCRIBE),
      });
      expect(decision.kind).toBe("recover_via_disk");
      if (decision.kind === "recover_via_disk") {
        expect(decision.reason).toBe("missing_workflow");
        expect(decision.authority).toBe("workflow_completed");
      }
    });

    it("classifies TMPRL1100 + describe-confirmed as recover_via_disk", async () => {
      const error = new Error(
        "TMPRL1100: Nondeterminism error: No command scheduled for event",
      );
      const decision = await classifyMutationRecoveryDecision({
        signalError: error,
        handle: makeHandle(POISONED_DESCRIBE),
      });
      expect(decision.kind).toBe("recover_via_disk");
      if (decision.kind === "recover_via_disk") {
        expect(decision.reason).toBe("poisoned_history");
        expect(decision.authority).toBe("workflow_poisoned_describe");
        // Evidence is the describe-text summary; the poisoned markers can be
        // either the noun ("Nondeterminism") or adjective ("NonDeterministic")
        // depending on whether the source was a signal error or describe.
        expect(decision.evidence).toMatch(
          /TMPRL1100|Nondeterminism|NonDeterministic|No command scheduled/i,
        );
      }
    });

    it("returns operator_required when signal says poisoned but describe disagrees", async () => {
      const error = new Error("TMPRL1100: Nondeterminism error");
      const decision = await classifyMutationRecoveryDecision({
        signalError: error,
        handle: makeHandle(HEALTHY_DESCRIBE),
      });
      expect(decision.kind).toBe("operator_required");
      if (decision.kind === "operator_required") {
        expect(decision.cause).toBe("reachable_authority_disagrees");
      }
    });

    it("returns operator_required when signal says poisoned but describe throws", async () => {
      const error = new Error("TMPRL1100: Nondeterminism error");
      const decision = await classifyMutationRecoveryDecision({
        signalError: error,
        handle: makeFailingHandle(new Error("describe timeout")),
      });
      expect(decision.kind).toBe("operator_required");
      if (decision.kind === "operator_required") {
        expect(decision.cause).toBe("reachable_authority_disagrees");
      }
    });

    it("returns operator_required for unclassified query failures", async () => {
      const error = new Error("permission denied");
      const decision = await classifyMutationRecoveryDecision({
        signalError: error,
        handle: makeHandle(HEALTHY_DESCRIBE),
      });
      expect(decision.kind).toBe("operator_required");
      if (decision.kind === "operator_required") {
        expect(decision.cause).toBe("query_failed");
      }
    });

    it("does not probe describe when workflow is already classified completed", async () => {
      const error = new Error("workflow execution already completed");
      error.name = "WorkflowExecutionAlreadyCompleted";
      const handle = makeHandle(POISONED_DESCRIBE);
      const decision = await classifyMutationRecoveryDecision({
        signalError: error,
        handle,
      });
      expect(decision.kind).toBe("recover_via_disk");
      expect(handle.describe).not.toHaveBeenCalled();
    });
  });

  describe("probe-first path (signal was NOT attempted)", () => {
    it("proceeds with signal when describe is healthy", async () => {
      const decision = await classifyMutationRecoveryDecision({
        handle: makeHandle(HEALTHY_DESCRIBE),
      });
      expect(decision.kind).toBe("proceed_with_signal");
    });

    it("recovers via disk when describe shows poisoned (skip signal entirely)", async () => {
      const decision = await classifyMutationRecoveryDecision({
        handle: makeHandle(POISONED_DESCRIBE),
      });
      expect(decision.kind).toBe("recover_via_disk");
      if (decision.kind === "recover_via_disk") {
        expect(decision.reason).toBe("poisoned_history");
        expect(decision.authority).toBe("workflow_poisoned_describe");
      }
    });

    it("proceeds with signal when describe throws (optimistic)", async () => {
      const decision = await classifyMutationRecoveryDecision({
        handle: makeFailingHandle(new Error("describe timeout")),
      });
      expect(decision.kind).toBe("proceed_with_signal");
    });

    it("recovers via disk when describe reports a typed missing workflow", async () => {
      const error = new Error("workflow not found");
      error.name = "WorkflowNotFoundError";
      const decision = await classifyMutationRecoveryDecision({
        handle: makeFailingHandle(error),
      });
      expect(decision.kind).toBe("recover_via_disk");
      if (decision.kind === "recover_via_disk") {
        expect(decision.reason).toBe("missing_workflow");
        expect(decision.authority).toBe("workflow_completed");
      }
    });

    it.each(["workflow not found", "NOT_FOUND from a downstream service"])(
      "proceeds with signal when an untyped describe error message says %s",
      async (message) => {
        const decision = await classifyMutationRecoveryDecision({
          handle: makeFailingHandle(new Error(message)),
        });
        expect(decision).toEqual({ kind: "proceed_with_signal" });
      },
    );

    it.each([
      "workflow execution already completed",
      "workflow is not running",
      "cannot signal a completed workflow",
    ])(
      "proceeds with signal when an untyped describe error message says %s",
      async (message) => {
        const decision = await classifyMutationRecoveryDecision({
          handle: makeFailingHandle(new Error(message)),
        });
        expect(decision).toEqual({ kind: "proceed_with_signal" });
      },
    );

    it("proceeds with signal when handle has no describe function", async () => {
      const decision = await classifyMutationRecoveryDecision({
        handle: {},
      });
      expect(decision.kind).toBe("proceed_with_signal");
    });

    it("proceeds with signal when no handle is provided", async () => {
      const decision = await classifyMutationRecoveryDecision({});
      expect(decision.kind).toBe("proceed_with_signal");
    });

    it("proceeds with signal when skipProbe is true", async () => {
      const handle = makeHandle(POISONED_DESCRIBE);
      const decision = await classifyMutationRecoveryDecision({
        handle,
        skipProbe: true,
      });
      expect(decision.kind).toBe("proceed_with_signal");
      expect(handle.describe).not.toHaveBeenCalled();
    });
  });
});
