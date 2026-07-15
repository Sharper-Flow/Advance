import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  classifyTemporalError,
  createTemporalReadDeadline,
  isReconnectableError,
  remainingDeadlineMs,
  TEMPORAL_READ_DEADLINE_BUDGET_MS,
  TemporalQueryTimeoutError,
  withTemporalRetry,
} from "./retry-wrapper";

/**
 * Build a validated @temporalio/client ServiceError-shaped error: a wrapper
 * whose `cause` carries a @grpc/grpc-js ServiceError shape (numeric `code` +
 * string `details` + record-like `metadata`). Mirrors how the SDK's
 * `rethrowGrpcError` nests the raw gRPC error as `ServiceError.cause`.
 */
function grpcError(code: number, message = "grpc failure"): Error {
  const cause = Object.assign(new Error(message), {
    code,
    details: message,
    metadata: {},
  });
  return Object.assign(new Error(`ServiceError: ${message}`), { cause });
}

// gRPC status codes (grpc-js constants).
const DEADLINE_EXCEEDED = 4;
const NOT_FOUND = 5;
const ALREADY_EXISTS = 6;
const PERMISSION_DENIED = 7;
const RESOURCE_EXHAUSTED = 8;
const ABORTED = 10;
const UNAVAILABLE = 14;

describe("two-axis structural gRPC classification", () => {
  it("classifies validated saturation/availability codes as transient (retryable)", () => {
    for (const code of [
      DEADLINE_EXCEEDED,
      RESOURCE_EXHAUSTED,
      ABORTED,
      UNAVAILABLE,
    ]) {
      expect(classifyTemporalError(grpcError(code))).toBe("transient");
    }
  });

  it("classifies validated NOT_FOUND/ALREADY_EXISTS codes as fallback", () => {
    expect(classifyTemporalError(grpcError(NOT_FOUND))).toBe("fallback");
    expect(classifyTemporalError(grpcError(ALREADY_EXISTS))).toBe("fallback");
  });

  it("classifies other validated codes (PERMISSION_DENIED) as fatal", () => {
    expect(classifyTemporalError(grpcError(PERMISSION_DENIED))).toBe("fatal");
  });

  it("ignores an arbitrary numeric code without gRPC ServiceError shape", () => {
    // Bare { code: 14 } with no `details`/`metadata` is not a validated gRPC
    // service error and carries no transient text — must not be transient.
    const bogus = Object.assign(new Error("app-level failure"), { code: 14 });
    expect(classifyTemporalError(bogus)).toBe("fatal");
  });

  it("does not treat the SDK non-gRPC wrapper text as transient", () => {
    // The SDK emits this specifically when the value is NOT a gRPC error.
    expect(
      classifyTemporalError(
        new Error("Unexpected error while making gRPC request"),
      ),
    ).toBe("fatal");
  });

  it("preserves fatal/fallback precedence over transport classification", () => {
    expect(
      classifyTemporalError(
        new Error("[TMPRL1100] Nondeterminism error: No command scheduled"),
      ),
    ).toBe("fallback");
  });

  it("terminates on a cyclic cause chain", () => {
    const a: { message: string; cause?: unknown } = { message: "a" };
    const b: { message: string; cause?: unknown } = { message: "b" };
    a.cause = b;
    b.cause = a;
    // Must not infinite-loop; no validated gRPC shape → falls through to fatal.
    expect(classifyTemporalError(a)).toBe("fatal");
  });
});

describe("isReconnectableError (reconnect axis)", () => {
  it("returns true only for genuine transport-channel failures", () => {
    for (const msg of [
      "ECONNREFUSED connection refused",
      "Channel has been shut down",
      "GOAWAY received",
      "read ECONNRESET",
      "write EPIPE broken pipe",
    ]) {
      expect(isReconnectableError(new Error(msg))).toBe(true);
    }
  });

  it("returns false for saturation/availability codes (retryable, not reconnectable)", () => {
    for (const code of [
      DEADLINE_EXCEEDED,
      RESOURCE_EXHAUSTED,
      ABORTED,
      UNAVAILABLE,
    ]) {
      expect(isReconnectableError(grpcError(code))).toBe(false);
    }
  });

  it("does not reconnect a validated saturation code when its details contain transport text", () => {
    expect(
      isReconnectableError(
        grpcError(RESOURCE_EXHAUSTED, "Channel has been shut down"),
      ),
    ).toBe(false);
  });
});

describe("withTemporalRetry reconnect gating", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires onTransientFailure (reconnect) for reconnectable transport errors", async () => {
    const onTransientFailure = vi.fn(async () => {});
    let calls = 0;
    const op = vi.fn(async () => {
      calls += 1;
      if (calls < 2) throw new Error("Channel has been shut down");
      return "ok";
    });
    const promise = withTemporalRetry(op, {
      initialDelayMs: 10,
      onTransientFailure,
    });
    const assertion = expect(promise).resolves.toBe("ok");
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    expect(onTransientFailure).toHaveBeenCalledTimes(1);
  });

  it("does NOT reconnect for retryable saturation codes (RESOURCE_EXHAUSTED/ABORTED)", async () => {
    const onTransientFailure = vi.fn(async () => {});
    let calls = 0;
    const op = vi.fn(async () => {
      calls += 1;
      if (calls < 2) throw grpcError(RESOURCE_EXHAUSTED);
      return "ok";
    });
    const promise = withTemporalRetry(op, {
      initialDelayMs: 10,
      onTransientFailure,
    });
    const assertion = expect(promise).resolves.toBe("ok");
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    // Retried (transient) but never reconnected the shared connection.
    expect(op).toHaveBeenCalledTimes(2);
    expect(onTransientFailure).not.toHaveBeenCalled();
  });

  it("caps combined retry amplification for a coded saturation error under the aggregate budget", async () => {
    const deadline = createTemporalReadDeadline(1_000);
    const op = vi.fn(async () => {
      throw grpcError(RESOURCE_EXHAUSTED);
    });
    const promise = withTemporalRetry(op, {
      deadline,
      maxAttempts: 50,
      initialDelayMs: 250,
    });
    const assertion = expect(promise).rejects.toBeInstanceOf(
      TemporalQueryTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    // Bounded by the 1s aggregate budget, not by maxAttempts=50.
    expect(op.mock.calls.length).toBeLessThanOrEqual(4);
  });
});

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
