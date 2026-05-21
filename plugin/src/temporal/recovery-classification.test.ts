import { describe, expect, test } from "vitest";
import {
  isFailingContractReviewStatus,
  isPoisonedHistoryError,
  isPrecisePoisonedHistoryEvidence,
  recoveryReasonFromError,
} from "./recovery-classification";

describe("recovery-classification", () => {
  test("detects poisoned-history Temporal errors through nested causes", () => {
    const error = new Error("outer", {
      cause: new Error("TMPRL1100: Nondeterminism error"),
    });

    expect(isPoisonedHistoryError(error)).toBe(true);
    expect(recoveryReasonFromError(error)).toBe("poisoned_history");
  });

  test("does not classify missing workflow errors as poisoned history", () => {
    const error = new Error("Workflow execution not found");

    expect(isPoisonedHistoryError(error)).toBe(false);
    expect(recoveryReasonFromError(error)).toBe("missing_workflow");
  });

  test("requires specific poisoned-history evidence tokens", () => {
    expect(
      isPrecisePoisonedHistoryEvidence(
        "TMPRL1100: Nondeterminism error in workflow history",
      ),
    ).toBe(true);
    expect(
      isPrecisePoisonedHistoryEvidence(
        "WorkflowExecutionUpdateAccepted event poisoned replay",
      ),
    ).toBe(true);
    expect(
      isPrecisePoisonedHistoryEvidence("operator confirmed poisoned history"),
    ).toBe(false);
    expect(isPrecisePoisonedHistoryEvidence("   ")).toBe(false);
  });

  test("classifies failing contract review statuses structurally", () => {
    expect(isFailingContractReviewStatus("fail")).toBe(true);
    expect(isFailingContractReviewStatus("violated")).toBe(true);
    expect(isFailingContractReviewStatus("unknown")).toBe(true);
    expect(isFailingContractReviewStatus("pass")).toBe(false);
    expect(isFailingContractReviewStatus("respected")).toBe(false);
  });
});
