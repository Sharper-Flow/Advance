import { describe, expect, it } from "vitest";

import {
  classifyCompletedOrPoisonedRecovery,
  workflowHasPoisonedDescription,
  workflowPoisonedDescriptionEvidence,
  workflowHasPoisonedRecoveryEvidence,
} from "./recovery-probe";

describe("workflow poisoned description probe", () => {
  it("returns null/false when describe is unavailable or fails", async () => {
    await expect(workflowPoisonedDescriptionEvidence({})).resolves.toBeNull();
    await expect(workflowHasPoisonedDescription({})).resolves.toBe(false);

    const throwingHandle = {
      describe: async () => {
        throw new Error("describe unavailable");
      },
    };

    await expect(
      workflowPoisonedDescriptionEvidence(throwingHandle),
    ).resolves.toBeNull();
    await expect(workflowHasPoisonedDescription(throwingHandle)).resolves.toBe(
      false,
    );
  });

  it("extracts bounded poisoned-history evidence from describe output", async () => {
    const longEvidence = `WorkflowTaskFailedCauseNonDeterministicError [TMPRL1100] ${"x".repeat(1_000)}`;
    const evidence = await workflowPoisonedDescriptionEvidence({
      describe: async () => ({
        lastFailure: { message: longEvidence },
      }),
    });

    expect(evidence).not.toBeNull();
    expect(evidence).toContain("TMPRL1100");
    expect(evidence).toHaveLength(500);
    expect(evidence).toMatch(/…$/);
  });

  it("detects supported poisoned-history markers in describe output", async () => {
    const cases: unknown[] = [
      {
        searchAttributes: {
          TemporalReportedProblems: [
            "category=WorkflowTaskFailed",
            "cause=WorkflowTaskFailedCauseNonDeterministicError",
          ],
        },
      },
      {
        searchAttributes: {
          TemporalReportedProblems: ["Nondeterminism error during replay"],
        },
      },
      { memo: { lastError: "TMPRL1100 nondeterminism" } },
      "No command scheduled for event 17",
      { historyEvent: "WorkflowExecutionUpdateAccepted" },
    ];

    for (const description of cases) {
      const handle = { describe: async () => description };

      await expect(workflowHasPoisonedDescription(handle)).resolves.toBe(true);
      await expect(
        workflowPoisonedDescriptionEvidence(handle),
      ).resolves.not.toBeNull();
    }
  });

  it("ignores non-poisoned describe output", async () => {
    await expect(
      workflowPoisonedDescriptionEvidence({
        describe: async () => ({ status: "RUNNING", lastFailure: null }),
      }),
    ).resolves.toBeNull();
  });

  it("centralizes legacy signal-error and describe-based recovery evidence", async () => {
    await expect(
      workflowHasPoisonedRecoveryEvidence(
        {},
        { signalError: new Error("TMPRL1100 nondeterminism") },
      ),
    ).resolves.toBe(true);

    await expect(
      workflowHasPoisonedRecoveryEvidence({
        describe: async () => ({ memo: { lastError: "Nondeterminism" } }),
      }),
    ).resolves.toBe(true);

    await expect(
      workflowHasPoisonedRecoveryEvidence(
        { describe: async () => ({ status: "RUNNING" }) },
        { signalError: new Error("network unavailable") },
      ),
    ).resolves.toBe(false);
  });
});

describe("classifyCompletedOrPoisonedRecovery", () => {
  it("completed-workflow error short-circuits the describe probe", async () => {
    let described = false;
    const handle = {
      describe: async () => {
        described = true;
        return { status: "RUNNING" };
      },
    };
    const result = await classifyCompletedOrPoisonedRecovery(
      handle,
      new Error("workflow execution already completed"),
    );
    expect(result).toEqual({ completedWorkflow: true, recover: true });
    // `||` short-circuit: the describe() poisoned probe must NOT run when the
    // workflow is already known completed.
    expect(described).toBe(false);
  });

  it("non-completed error recovers when describe carries poisoned evidence", async () => {
    const handle = {
      describe: async () => ({
        memo: { lastError: "TMPRL1100 nondeterminism" },
      }),
    };
    const result = await classifyCompletedOrPoisonedRecovery(
      handle,
      new Error("signal failed for unrelated reason"),
    );
    expect(result).toEqual({ completedWorkflow: false, recover: true });
  });

  it("non-completed error with clean describe does not recover", async () => {
    const handle = { describe: async () => ({ status: "RUNNING" }) };
    const result = await classifyCompletedOrPoisonedRecovery(
      handle,
      new Error("network unavailable"),
    );
    expect(result).toEqual({ completedWorkflow: false, recover: false });
  });
});
