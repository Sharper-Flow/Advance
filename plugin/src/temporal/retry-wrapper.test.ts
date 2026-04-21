import { describe, expect, it, vi } from "vitest";
import { classifyTemporalError, withTemporalRetry } from "./retry-wrapper";

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
    expect(
      classifyTemporalError(new Error("Workflow not found")),
    ).toBe("fallback");
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
    const mod = await import("./retry-wrapper");
    mod.resetTemporalRetryTelemetry();

    await withTemporalRetry(async () => "ok");
    expect(mod.getTemporalRetryTelemetry().lastOpAt).toBeTruthy();
    expect(mod.getTemporalRetryTelemetry().lastError).toBeNull();

    await expect(
      withTemporalRetry(async () => {
        throw new Error("NonDeterministicWorkflowError");
      }),
    ).rejects.toThrow(/NonDeterministic/);
    expect(mod.getTemporalRetryTelemetry().lastError).toContain(
      "NonDeterministicWorkflowError",
    );
  });
});
