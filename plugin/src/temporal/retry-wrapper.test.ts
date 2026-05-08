import { describe, expect, it } from "vitest";

import { classifyTemporalError } from "./retry-wrapper";

describe("classifyTemporalError", () => {
  it("treats TMPRL1100 replay nondeterminism as fallback-eligible", () => {
    const error = new Error(
      "[TMPRL1100] Nondeterminism error: No command scheduled for event HistoryEvent(id: 231, WorkflowExecutionUpdateAccepted)",
    );

    expect(classifyTemporalError(error)).toBe("fallback");
  });

  it("treats no-command replay errors as fallback-eligible", () => {
    const error = new Error(
      "No command scheduled for event HistoryEvent(id: 231, WorkflowExecutionUpdateAccepted)",
    );

    expect(classifyTemporalError(error)).toBe("fallback");
  });

  it("does not treat bare accepted-update text as fallback-eligible", () => {
    const error = new Error(
      "WorkflowExecutionUpdateAccepted event observed while update is still pending",
    );

    expect(classifyTemporalError(error)).toBe("fatal");
  });
});
