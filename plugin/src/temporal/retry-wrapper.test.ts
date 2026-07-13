import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  classifyTemporalError,
  createTemporalReadDeadline,
  remainingDeadlineMs,
  TEMPORAL_READ_DEADLINE_BUDGET_MS,
  TemporalQueryTimeoutError,
  withTemporalRetry,
} from "./retry-wrapper";

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

describe("temporal read deadline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses an 8-second aggregate budget by default", () => {
    const start = Date.now();
    const deadline = createTemporalReadDeadline();

    expect(TEMPORAL_READ_DEADLINE_BUDGET_MS).toBe(8_000);
    expect(deadline.deadlineAt).toBe(start + 8_000);
    expect(remainingDeadlineMs(deadline)).toBe(8_000);
  });

  it("tracks remaining budget from elapsed time", () => {
    const deadline = createTemporalReadDeadline(1_000);

    vi.advanceTimersByTime(600);

    expect(remainingDeadlineMs(deadline)).toBe(400);
  });
});

describe("withTemporalRetry deadline admission", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("caps the per-attempt timeout to the remaining aggregate budget", async () => {
    const deadline = createTemporalReadDeadline(1_000);
    const op = vi.fn(() => new Promise<never>(() => {}));

    const promise = withTemporalRetry(op, { timeoutMs: 5_000, deadline });
    const assertion = expect(promise).rejects.toBeInstanceOf(
      TemporalQueryTimeoutError,
    );

    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;

    // One attempt that hit the aggregate cap; no retry began after expiry.
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("does not start a new attempt or backoff once the budget is exhausted", async () => {
    const deadline = createTemporalReadDeadline(1_000);
    const op = vi.fn(async () => {
      throw new Error("ECONNREFUSED connection refused");
    });

    const promise = withTemporalRetry(op, {
      deadline,
      maxAttempts: 5,
      initialDelayMs: 250,
    });
    const assertion = expect(promise).rejects.toBeInstanceOf(
      TemporalQueryTimeoutError,
    );

    // t=0 attempt fails → 250ms backoff; t=250 attempt fails → 500ms
    // backoff; t=750 attempt fails → backoff capped at 250ms remaining;
    // t=1000 budget exhausted → no fourth attempt begins.
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;

    expect(op).toHaveBeenCalledTimes(3);
  });

  it("preserves default retry/backoff behavior without a deadline", async () => {
    let calls = 0;
    const op = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error("ECONNREFUSED connection refused");
      return "ok";
    });

    const promise = withTemporalRetry(op, { initialDelayMs: 10 });
    const assertion = expect(promise).resolves.toBe("ok");

    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(20);
    await assertion;

    expect(op).toHaveBeenCalledTimes(3);
  });

  it("does not retry fatal errors even when budget remains", async () => {
    const deadline = createTemporalReadDeadline(8_000);
    const failure = new Error("permission denied");
    const op = vi.fn(async () => {
      throw failure;
    });

    await expect(withTemporalRetry(op, { deadline })).rejects.toBe(failure);
    expect(op).toHaveBeenCalledTimes(1);
  });
});
