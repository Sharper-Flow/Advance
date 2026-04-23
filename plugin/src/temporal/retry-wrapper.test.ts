import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyTemporalError,
  getTemporalRetryTelemetry,
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
});
