import { describe, expect, it, vi } from "vitest";
import type { Change } from "../types";
import { createDefaultGates } from "../types";
import { reopenChangeFromGate } from "./gate-reentry";

function makeChange(): Change {
  const gates = createDefaultGates();
  gates.proposal = { status: "done", completed_at: "2026-04-21T00:00:00.000Z" };
  gates.discovery = {
    status: "done",
    completed_at: "2026-04-21T00:01:00.000Z",
  };
  gates.design = { status: "done", completed_at: "2026-04-21T00:02:00.000Z" };
  gates.planning = {
    status: "done",
    completed_at: "2026-04-21T00:03:00.000Z",
  };
  return {
    id: "c1",
    title: "Change",
    status: "draft",
    created_at: "2026-04-21T00:00:00.000Z",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates,
    reentry_history: [],
  } as Change;
}

describe("reopenChangeFromGate — workflow-safe timestamp injection", () => {
  it("uses the caller-supplied `now` on the history entry when provided", () => {
    const change = makeChange();
    const explicitNow = "2026-04-21T12:34:56.789Z";

    const result = reopenChangeFromGate(
      change,
      "planning",
      "test reason",
      undefined,
      "agent",
      undefined,
      explicitNow,
    );

    expect(result.entry.reopened_at).toBe(explicitNow);
    expect(result.timestamp).toBe(explicitNow);
    expect(change.reentry_history?.[0]?.reopened_at).toBe(explicitNow);
  });

  it("does NOT call `new Date()` when caller supplies `now`", () => {
    const change = makeChange();
    const explicitNow = "2026-04-21T12:34:56.789Z";

    // Spy on the Date constructor. When caller supplies `now`, the
    // function must not invoke `new Date()` — critical for Temporal
    // workflow sandbox determinism.
    const dateSpy = vi.spyOn(globalThis, "Date");

    reopenChangeFromGate(
      change,
      "planning",
      "test reason",
      undefined,
      "agent",
      undefined,
      explicitNow,
    );

    expect(dateSpy).not.toHaveBeenCalled();
    dateSpy.mockRestore();
  });

  it("falls back to `new Date().toISOString()` when caller omits `now`", () => {
    const change = makeChange();

    const result = reopenChangeFromGate(
      change,
      "planning",
      "storage-side call",
    );

    expect(result.entry.reopened_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
    expect(result.timestamp).toBe(result.entry.reopened_at);
  });
});
