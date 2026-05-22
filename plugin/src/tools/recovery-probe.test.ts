import { describe, expect, it } from "vitest";
import { workflowHasPoisonedDescription } from "./recovery-probe";

describe("workflowHasPoisonedDescription", () => {
  it("returns false when handle has no describe function", async () => {
    expect(await workflowHasPoisonedDescription({})).toBe(false);
  });

  it("returns false when describe throws", async () => {
    const handle = {
      describe: async () => {
        throw new Error("Workflow not found");
      },
    };
    expect(await workflowHasPoisonedDescription(handle)).toBe(false);
  });

  it("returns false on healthy describe output", async () => {
    const handle = {
      describe: async () => ({
        searchAttributes: {
          AdvChangeStatus: ["draft"],
        },
        status: "RUNNING",
      }),
    };
    expect(await workflowHasPoisonedDescription(handle)).toBe(false);
  });

  it("detects WorkflowTaskFailedCauseNonDeterministicError search attribute", async () => {
    const handle = {
      describe: async () => ({
        searchAttributes: {
          TemporalReportedProblems: [
            "category=WorkflowTaskFailed",
            "cause=WorkflowTaskFailedCauseNonDeterministicError",
          ],
        },
      }),
    };
    expect(await workflowHasPoisonedDescription(handle)).toBe(true);
  });

  it("detects Nondeterminism evidence", async () => {
    const handle = {
      describe: async () => ({
        searchAttributes: {
          TemporalReportedProblems: ["Nondeterminism error during replay"],
        },
      }),
    };
    expect(await workflowHasPoisonedDescription(handle)).toBe(true);
  });

  it("detects TMPRL1100 evidence", async () => {
    const handle = {
      describe: async () => ({
        memo: { lastError: "TMPRL1100 nondeterminism" },
      }),
    };
    expect(await workflowHasPoisonedDescription(handle)).toBe(true);
  });

  it("detects No command scheduled evidence", async () => {
    const handle = {
      describe: async () => "No command scheduled for event 17",
    };
    expect(await workflowHasPoisonedDescription(handle)).toBe(true);
  });
});
