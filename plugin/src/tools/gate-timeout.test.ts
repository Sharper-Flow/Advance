/**
 * Tests for the adv_gate_complete typed timeout classifier.
 *
 * fixTemporalTimeoutsWorker AC1: adv_gate_complete fires a single Temporal
 * signal (gateCompletedSignal) via fireSignalAndRefresh — there is no
 * bundle-first durable write to reconcile, so the classifier is purely
 * advisory. When the safety-net timeout fires, the caller must see a
 * typed "signal may have landed — verify via adv_gate_status" result
 * instead of a bare ToolExecutionTimeout.
 *
 * Probe discipline: the classifier must NEVER issue Temporal queries or
 * any IO — it returns a constant advisory message. A throwing classifier
 * falls back to the generic timeout, so the advisory path must be
 * throw-free.
 */

import { describe, expect, it } from "vitest";
import { formatGateCompleteTimeoutResult } from "./gate-timeout";

describe("formatGateCompleteTimeoutResult", () => {
  it("returns a typed advisory result when changeId is a non-empty string", async () => {
    const raw = await formatGateCompleteTimeoutResult({
      args: { changeId: "example", gateId: "proposal" },
      timeoutMs: 30_000,
    });

    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed.success).toBe(false);
    expect(parsed.errorClass).toBe("ToolExecutionTimeout");
    expect(parsed.tool).toBe("adv_gate_complete");
    expect(parsed.changeId).toBe("example");
    expect(parsed.gateId).toBe("proposal");
    expect(parsed.timeoutMs).toBe(30_000);
    expect(parsed.signalMayHaveLanded).toBe(true);
    expect(parsed.error).toMatch(/may have landed/i);
    expect(parsed.remediation).toMatch(/adv_gate_status/i);
    expect(parsed.hint).toMatch(/adv_gate_status/i);
  });

  it("omits gateId from the payload when not a string", async () => {
    const raw = await formatGateCompleteTimeoutResult({
      args: { changeId: "example" },
      timeoutMs: 30_000,
    });

    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed.changeId).toBe("example");
    expect(parsed.gateId).toBeUndefined();
    expect(parsed.signalMayHaveLanded).toBe(true);
  });

  it("declines (undefined) when changeId is missing — surfaces generic timeout for malformed args", async () => {
    const raw = await formatGateCompleteTimeoutResult({
      args: {},
      timeoutMs: 30_000,
    });

    expect(raw).toBeUndefined();
  });

  it("declines (undefined) when changeId is not a string", async () => {
    const raw = await formatGateCompleteTimeoutResult({
      args: { changeId: 42, gateId: "proposal" },
      timeoutMs: 30_000,
    });

    expect(raw).toBeUndefined();
  });

  it("declines (undefined) when changeId is an empty string", async () => {
    const raw = await formatGateCompleteTimeoutResult({
      args: { changeId: "", gateId: "proposal" },
      timeoutMs: 30_000,
    });

    expect(raw).toBeUndefined();
  });

  it("is throw-free even for exotic args shapes (classifier must never mask the original timeout)", async () => {
    // Circular/POJO/null/undefined args must all resolve without throwing.
    const circular: { self?: unknown } = {};
    circular.self = circular;

    await expect(
      formatGateCompleteTimeoutResult({
        args: circular as { changeId?: unknown },
        timeoutMs: 30_000,
      }),
    ).resolves.toBeUndefined();

    await expect(
      formatGateCompleteTimeoutResult({
        args: { changeId: "ok" },
        timeoutMs: 30_000,
      }),
    ).resolves.toBeTypeOf("string");
  });
});
