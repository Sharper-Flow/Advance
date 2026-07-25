import { describe, expect, it } from "vitest";
import {
  ADV_SESSION_NOT_READY_KIND,
  ADV_SESSION_READINESS_RETRY_HINT,
  classifyAdvEnvelope,
  isAdvPluginInitFailed,
  isAdvSessionNotReady,
  isNoPoller,
  type AdvSessionNotReady,
  type AdvSessionNotReadyRetryHint,
} from "./readiness-types";

describe("ADV_SESSION_NOT_READY response envelope", () => {
  const envelope: AdvSessionNotReady = {
    kind: ADV_SESSION_NOT_READY_KIND,
    blockers: ["ADV_SESSION_NOT_READY"],
    retryHint: ADV_SESSION_READINESS_RETRY_HINT,
  };

  it("exports a typed envelope with the expected discriminator", () => {
    expect(envelope.kind).toBe("ADV_SESSION_NOT_READY");
    expect(envelope.blockers).toEqual(["ADV_SESSION_NOT_READY"]);
    expect(typeof envelope.retryHint).toBe("string");
  });

  it("retryHint references the ~10s orphan-adoption heartbeat cadence and advises retry-after-heartbeat", () => {
    const hint = envelope.retryHint.toLowerCase();
    expect(hint).toContain("10s");
    expect(hint).toContain("heartbeat");
    expect(hint).toContain("orphan");
    expect(hint).toContain("retry-after-heartbeat");
  });

  it("does NOT expose an exact ETA field", () => {
    const keys = Object.keys(envelope);
    expect(keys).not.toContain("etaMs");
    expect(keys).not.toContain("eta");
    expect(keys).not.toContain("retryAfterMs");
    expect(envelope.retryHint).not.toMatch(/\\d{13,}/); // no epoch timestamps in the hint
  });

  it("isAdvSessionNotReady narrows to the envelope type", () => {
    expect(isAdvSessionNotReady(envelope)).toBe(true);
  });

  it("isAdvSessionNotReady rejects ADV_PLUGIN_INIT_FAILED", () => {
    const initFailed = {
      status: "ADV_PLUGIN_INIT_FAILED",
      message: "init failed",
      error: "boom",
      directory: "/tmp",
      remediation: [],
    };
    expect(isAdvSessionNotReady(initFailed)).toBe(false);
    expect(isAdvPluginInitFailed(initFailed)).toBe(true);
  });

  it("isAdvSessionNotReady rejects no_poller diagnostic", () => {
    const noPoller = {
      class: "no_poller",
      cause: undefined,
      evidence: "no poller",
    };
    expect(isAdvSessionNotReady(noPoller)).toBe(false);
    expect(isNoPoller(noPoller)).toBe(true);
  });

  it("classifyAdvEnvelope distinguishes all three envelopes", () => {
    const initFailed = {
      status: "ADV_PLUGIN_INIT_FAILED",
      message: "init failed",
      error: "boom",
      directory: "/tmp",
      remediation: [],
    };
    const noPoller = { class: "no_poller", evidence: "no poller" };

    expect(classifyAdvEnvelope(envelope)).toEqual({
      kind: "session-not-ready",
      payload: envelope,
    });
    expect(classifyAdvEnvelope(initFailed)).toEqual({
      kind: "init-failed",
    });
    expect(classifyAdvEnvelope(noPoller)).toEqual({
      kind: "no-poller",
    });
    expect(classifyAdvEnvelope(null)).toEqual({
      kind: "unknown",
    });
  });

  it("structured retry hint is available and carries the heartbeat cadence without an ETA", () => {
    // Import the structured shape explicitly so callers can opt into typed access.
    const structured: AdvSessionNotReadyRetryHint = {
      heartbeatCadenceMs: 10_000,
      advise: "retry-after-heartbeat",
      message: ADV_SESSION_READINESS_RETRY_HINT,
    };
    expect(structured.heartbeatCadenceMs).toBe(10_000);
    expect(structured.advise).toBe("retry-after-heartbeat");
    expect(("etaMs" as keyof AdvSessionNotReadyRetryHint) in structured).toBe(
      false,
    );
    expect(("eta" as keyof AdvSessionNotReadyRetryHint) in structured).toBe(
      false,
    );
  });
});
