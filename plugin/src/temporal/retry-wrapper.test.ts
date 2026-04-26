import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyTemporalError,
  getTemporalRetryTelemetry,
  getTemporalOpTelemetry,
  resetTemporalRetryTelemetry,
  withTemporalRetry,
} from "./retry-wrapper";

describe("retry-wrapper (C2)", () => {
  it("classifies connection-refused as transient", () => {
    expect(
      classifyTemporalError(new Error("connect ECONNREFUSED 127.0.0.1:7233")),
    ).toBe("transient");
  });

  it("classifies missing task queue handler as transient", () => {
    expect(
      classifyTemporalError(
        new Error(
          "no task queue handler is subscribed to task queue advance-x",
        ),
      ),
    ).toBe("transient");
  });

  it("classifies workflow/update/query not found/registered as fallback-safe", () => {
    expect(
      classifyTemporalError(new Error("Workflow execution not found")),
    ).toBe("fallback");
    expect(classifyTemporalError(new Error("UpdateNotRegistered"))).toBe(
      "fallback",
    );
  });

  it("classifies 'workflow not found for ID' (Temporal server gRPC detail) as fallback", () => {
    expect(
      classifyTemporalError(
        new Error(
          "workflow not found for ID: adv/change/proj1/cleanupParityHarnessLeak",
        ),
      ),
    ).toBe("fallback");
    expect(classifyTemporalError(new Error("Workflow not found"))).toBe(
      "fallback",
    );
  });

  it("classifies deterministic errors as fatal", () => {
    expect(
      classifyTemporalError(new Error("NonDeterministicWorkflowError")),
    ).toBe("fatal");
  });

  it("retries transient failures with recovery hook then succeeds", async () => {
    const recover = vi.fn(async () => {});
    const op = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:7233"))
      .mockResolvedValueOnce("ok");

    const result = await withTemporalRetry(op, { onTransientFailure: recover });

    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(2);
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it("does not retry fallback-safe errors", async () => {
    const op = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("Workflow execution not found"));

    await expect(withTemporalRetry(op)).rejects.toThrow(/not found/i);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("records last_op_at on success and last_error on failure", async () => {
    resetTemporalRetryTelemetry();

    await withTemporalRetry(async () => "ok");
    expect(getTemporalRetryTelemetry().lastOpAt).toBeTruthy();
    expect(getTemporalRetryTelemetry().lastError).toBeNull();

    await expect(
      withTemporalRetry(async () => {
        throw new Error("NonDeterministicWorkflowError");
      }),
    ).rejects.toThrow(/NonDeterministic/);
    expect(getTemporalRetryTelemetry().lastError).toContain(
      "NonDeterministicWorkflowError",
    );
  });

  // --- Phase A: Jittered exponential backoff tests ---

  describe("jittered exponential backoff", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("uses full-jitter exponential delay between retries", async () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);

      const delays: number[] = [];
      vi.spyOn(globalThis, "setTimeout").mockImplementation(((
        cb: () => void,
        ms?: number,
      ) => {
        delays.push(ms ?? 0);
        cb();
        return {} as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout);

      const op = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
        .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
        .mockResolvedValueOnce("ok");

      await withTemporalRetry(op, {
        initialDelayMs: 250,
        backoffCoefficient: 2,
        maxDelayMs: 2000,
      });

      // attempt 1: base = min(2000, 250 * 2^0) = 250, delay = 0.5 * 250 = 125
      // attempt 2: base = min(2000, 250 * 2^1) = 500, delay = 0.5 * 500 = 250
      expect(delays).toHaveLength(2);
      expect(delays[0]).toBe(125);
      expect(delays[1]).toBe(250);
    });

    it("caps delay at maxDelayMs with jitter", async () => {
      vi.spyOn(Math, "random").mockReturnValue(0.9);

      const delays: number[] = [];
      vi.spyOn(globalThis, "setTimeout").mockImplementation(((
        cb: () => void,
        ms?: number,
      ) => {
        delays.push(ms ?? 0);
        cb();
        return {} as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout);

      const op = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
        .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
        .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
        .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
        .mockResolvedValueOnce("ok");

      await withTemporalRetry(op, {
        maxAttempts: 5,
        initialDelayMs: 250,
        backoffCoefficient: 2,
        maxDelayMs: 500,
      });

      // attempt 1: base=250, delay=0.9*250=225
      // attempt 2: base=500, delay=0.9*500=450
      // attempt 3: base=min(500,1000)=500, delay=0.9*500=450
      // attempt 4: base=min(500,2000)=500, delay=0.9*500=450
      expect(delays).toHaveLength(4);
      for (const d of delays) {
        expect(d).toBeLessThanOrEqual(500);
      }
    });

    it("records lastAttempts on exhaustion", async () => {
      resetTemporalRetryTelemetry();

      const op = vi
        .fn<() => Promise<string>>()
        .mockRejectedValue(new Error("connect ECONNREFUSED"));

      vi.spyOn(Math, "random").mockReturnValue(0.0);

      await expect(withTemporalRetry(op, { maxAttempts: 3 })).rejects.toThrow(
        /ECONNREFUSED/,
      );

      expect(getTemporalRetryTelemetry().lastError).toContain("ECONNREFUSED");
      expect(getTemporalRetryTelemetry().lastAttempts).toBe(3);
    });

    it("records lastAttempts=1 on success without retries", async () => {
      resetTemporalRetryTelemetry();

      await withTemporalRetry(async () => "ok");

      expect(getTemporalRetryTelemetry().lastAttempts).toBe(1);
    });

    it("supports legacy backoffMs option (deprecated)", async () => {
      const delays: number[] = [];
      vi.spyOn(globalThis, "setTimeout").mockImplementation(((
        cb: () => void,
        ms?: number,
      ) => {
        delays.push(ms ?? 0);
        cb();
        return {} as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout);

      const op = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
        .mockResolvedValueOnce("ok");

      await withTemporalRetry(op, { backoffMs: [100, 200, 300] });

      expect(delays).toHaveLength(1);
      expect(delays[0]).toBe(100);
    });
  });

  // --- Phase B.1: Per-op telemetry (KD-3) ---

  describe("per-op telemetry", () => {
    afterEach(() => {
      resetTemporalRetryTelemetry();
    });

    it("getTemporalOpTelemetry returns empty array when no ops recorded", () => {
      expect(getTemporalOpTelemetry()).toEqual([]);
    });

    it("records successCount per opType", async () => {
      await withTemporalRetry(async () => "ok", { opType: "addTaskUpdate" });
      const ops = getTemporalOpTelemetry();
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({
        opType: "addTaskUpdate",
        successCount: 1,
        failureCount: 0,
        retryCount: 0,
      });
    });

    it("records failureCount and retryCount per opType", async () => {
      const op = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
        .mockResolvedValueOnce("ok");

      await withTemporalRetry(op, { opType: "updateTaskUpdate" });

      const ops = getTemporalOpTelemetry();
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({
        opType: "updateTaskUpdate",
        successCount: 1,
        failureCount: 0,
        retryCount: 1,
      });
    });

    it("records failureCount on fatal error", async () => {
      await expect(
        withTemporalRetry(async () => {
          throw new Error("NonDeterministicWorkflowError");
        }, { opType: "closeChangeUpdate" }),
      ).rejects.toThrow(/NonDeterministic/);

      const ops = getTemporalOpTelemetry();
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({
        opType: "closeChangeUpdate",
        successCount: 0,
        failureCount: 1,
        retryCount: 0,
      });
    });

    it("aggregates multiple ops of same type", async () => {
      await withTemporalRetry(async () => "ok", { opType: "addTaskUpdate" });
      await withTemporalRetry(async () => "ok", { opType: "addTaskUpdate" });

      const ops = getTemporalOpTelemetry();
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({
        opType: "addTaskUpdate",
        successCount: 2,
        failureCount: 0,
        retryCount: 0,
      });
    });

    it("keeps separate counters for different opTypes", async () => {
      await withTemporalRetry(async () => "ok", { opType: "addTaskUpdate" });
      await withTemporalRetry(async () => "ok", { opType: "completeGateUpdate" });

      const ops = getTemporalOpTelemetry();
      expect(ops).toHaveLength(2);
      const addTask = ops.find((o) => o.opType === "addTaskUpdate");
      const completeGate = ops.find((o) => o.opType === "completeGateUpdate");
      expect(addTask?.successCount).toBe(1);
      expect(completeGate?.successCount).toBe(1);
    });

    it("preserves getTemporalRetryTelemetry as aggregated view", async () => {
      resetTemporalRetryTelemetry();
      await withTemporalRetry(async () => "ok", { opType: "addTaskUpdate" });

      const agg = getTemporalRetryTelemetry();
      expect(agg.lastOpAt).toBeTruthy();
      expect(agg.lastError).toBeNull();
      expect(agg.lastAttempts).toBe(1);
    });

    it("does not record per-op telemetry when opType is omitted", async () => {
      await withTemporalRetry(async () => "ok");
      expect(getTemporalOpTelemetry()).toEqual([]);
    });
  });

  // P1.3.8 — Query timeout regression guard.
  //
  // Context: `handle.query()` against a dead worker never resolves (no
  // built-in SDK timeout). Pre-P1.3.8 this hung the calling tool forever.
  // Fix: add optional `timeoutMs` to RetryOptions; withTemporalRetry
  // races op() against a TemporalQueryTimeoutError. That error is
  // classified as `transient` so the retry budget still applies.
  //
  // See design.md § KD-2. Do NOT add timeout to executeUpdate callsites.
  describe("query timeout (P1.3.8)", () => {
    it("throws TemporalQueryTimeoutError when op exceeds timeoutMs", async () => {
      vi.useFakeTimers();
      try {
        const op = vi.fn(
          () => new Promise<string>(() => {}), // never resolves
        );
        const promise = withTemporalRetry(op, {
          timeoutMs: 100,
          maxAttempts: 1, // don't retry the timeout for this assertion
        });
        // Attach error handler immediately to avoid unhandled rejection noise.
        const settled = promise.catch((err: Error) => err);
        await vi.advanceTimersByTimeAsync(150);
        const result = await settled;
        expect(result).toBeInstanceOf(Error);
        expect((result as Error).name).toBe("TemporalQueryTimeout");
        expect((result as Error).message).toMatch(/100ms|timeout/i);
      } finally {
        vi.useRealTimers();
      }
    });

    it("classifies TemporalQueryTimeoutError as transient for retry", async () => {
      const { classifyTemporalError, TemporalQueryTimeoutError } =
        await import("./retry-wrapper");
      const err = new TemporalQueryTimeoutError(5000);
      expect(classifyTemporalError(err)).toBe("transient");
    });

    it("does NOT apply timeout when timeoutMs is omitted (executeUpdate path)", async () => {
      // Slow-but-succeeds op simulates an executeUpdate: withTemporalRetry
      // called without timeoutMs must let it finish regardless of duration.
      const op = vi.fn(
        () =>
          new Promise<string>((resolve) => setTimeout(() => resolve("ok"), 50)),
      );
      const result = await withTemporalRetry(op);
      expect(result).toBe("ok");
    });
  });
});
