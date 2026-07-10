import { describe, expect, it } from "vitest";

import type { ChangeWorkflowState } from "../temporal/contracts";
import type { GateId, GateReadinessBlocker, Gates } from "../types";
import { createDefaultGates, GATE_ORDER } from "../types";
import { deriveWorkflowDirective, GATE_COMMAND } from "./workflow-directive";

const EPOCH = Date.parse("2026-05-05T12:00:00.000Z");
const STALE = "2026-05-04T00:00:00.000Z"; // >24h before EPOCH
const FRESH = "2026-05-05T11:30:00.000Z"; // 30m before EPOCH

function makeState(
  overrides: Partial<ChangeWorkflowState> = {},
): ChangeWorkflowState {
  return {
    projectId: "project-1",
    changeId: "change-1",
    title: "Test change",
    initializedAt: FRESH,
    id: "change-1",
    status: "active",
    lifecycleState: "open",
    createdAt: FRESH,
    lastSignalAt: FRESH,
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: createDefaultGates(),
    artifacts: {},
    ...overrides,
  };
}

function gatesWith(
  gate: GateId,
  status: Gates[GateId]["status"],
  extras: Partial<Gates[GateId]> = {},
): Gates {
  const gates = createDefaultGates();
  gates[gate] = { ...gates[gate], status, ...extras };
  return gates;
}

function markDone(gates: Gates, ...done: GateId[]): Gates {
  for (const id of done) gates[id] = { ...gates[id], status: "done" };
  return gates;
}

function blocker(code: string, gateId: GateId): GateReadinessBlocker {
  return {
    code,
    gateId,
    message: `${code} on ${gateId}`,
    remediation: `fix ${code}`,
  };
}

describe("deriveWorkflowDirective", () => {
  it("never_started when no gates have been started (all pending)", () => {
    const d = deriveWorkflowDirective(makeState(), EPOCH);
    expect(d.changeId).toBe("change-1");
    expect(d.phase).toBe("proposal");
    expect(d.action.kind).toBe("never_started");
    expect(d.canArchive).toBe(false);
    expect(d.approvalPending).toBe(false);
    expect(d.blockers).toEqual([]);
    expect(d.recovery).toBeUndefined();
  });

  it.each(GATE_ORDER)(
    "reports phase + manifest-owned command for in_progress gate %s",
    (gate) => {
      const idx = GATE_ORDER.indexOf(gate);
      const prior = GATE_ORDER.slice(0, idx);
      let gates = gatesWith(gate, "in_progress");
      gates = markDone(gates, ...prior);
      const d = deriveWorkflowDirective(makeState({ gates }), EPOCH);
      expect(d.phase).toBe(gate);
      expect(d.gateStatus[gate]).toBe("in_progress");
      expect(d.action.kind).toBe("continue");
      expect(d.action.gateId).toBe(gate);
      expect(d.action.command).toBe(GATE_COMMAND[gate]);
      expect(d.canArchive).toBe(false);
    },
  );

  it("routes to approval when a human checkpoint is pending", () => {
    const gates = markDone(gatesWith("planning", "awaiting_approval"));
    // proposal/discovery/design done, planning awaiting approval
    const ready = markDone(gates, "proposal", "discovery", "design");
    const d = deriveWorkflowDirective(
      makeState({ gates: ready, pendingCheckpoint: true }),
      EPOCH,
    );
    expect(d.action.kind).toBe("approval");
    expect(d.approvalPending).toBe(true);
    expect(d.action.gateId).toBe("planning");
  });

  it("classifies poisoned-history evidence as recovery", () => {
    const gates = gatesWith("execution", "stuck", {
      stuck_reason: "TMPRL1100 nondeterminism while replaying history",
    });
    const ready = markDone(
      gates,
      "proposal",
      "discovery",
      "design",
      "planning",
    );
    const d = deriveWorkflowDirective(makeState({ gates: ready }), EPOCH);
    expect(d.recovery?.reason).toBe("poisoned_history");
    expect(d.action.kind).toBe("recovery");
  });

  it("classifies a terminated non-terminal workflow as missing_workflow", () => {
    const d = deriveWorkflowDirective(
      makeState({ terminated: true, status: "active" }),
      EPOCH,
    );
    expect(d.recovery?.reason).toBe("missing_workflow");
    expect(d.action.kind).toBe("recovery");
  });

  it("surfaces blockers and routes to blocked (>=2 blocker types)", () => {
    let gates = gatesWith("design", "in_progress");
    gates = markDone(gates, "proposal", "discovery");
    gates.design = {
      ...gates.design,
      readiness_blockers: [
        blocker("ARTIFACT_MISSING", "design"),
        blocker("ARTIFACT_TOO_SMALL", "design"),
      ],
    };
    const d = deriveWorkflowDirective(makeState({ gates }), EPOCH);
    expect(d.action.kind).toBe("blocked");
    expect(d.action.gateId).toBe("design");
    expect(d.blockers.length).toBeGreaterThanOrEqual(2);
    const codes = d.blockers.map((b) => b.code);
    expect(codes).toContain("ARTIFACT_MISSING");
    expect(codes).toContain("ARTIFACT_TOO_SMALL");
  });

  it("synthesizes a GATE_STUCK blocker for a non-poisoned stuck gate", () => {
    const gates = markDone(
      gatesWith("planning", "stuck", { stuck_reason: "prep readiness failed" }),
      "proposal",
      "discovery",
      "design",
    );
    const d = deriveWorkflowDirective(makeState({ gates }), EPOCH);
    expect(d.action.kind).toBe("blocked");
    expect(d.blockers.some((b) => b.code === "GATE_STUCK")).toBe(true);
  });

  it("canArchive + continue(archive) when all gates are done", () => {
    let gates = createDefaultGates();
    gates = markDone(gates, ...GATE_ORDER);
    const d = deriveWorkflowDirective(makeState({ gates }), EPOCH);
    expect(d.canArchive).toBe(true);
    expect(d.phase).toBe("done");
    expect(d.action.kind).toBe("continue");
    expect(d.action.gateId).toBe("release");
    expect(d.action.command).toBe("adv-archive");
  });

  it("never_started when only proposal is done and the change is idle", () => {
    const gates = markDone(createDefaultGates(), "proposal");
    const d = deriveWorkflowDirective(
      makeState({
        gates,
        createdAt: STALE,
        lastSignalAt: STALE,
      }),
      EPOCH,
    );
    expect(d.action.kind).toBe("never_started");
    expect(d.bucket).toBe("never_started");
  });

  it("routes to archived when the change status is archived", () => {
    let gates = createDefaultGates();
    gates = markDone(gates, ...GATE_ORDER);
    const d = deriveWorkflowDirective(
      makeState({ status: "archived", lifecycleState: "archived", gates }),
      EPOCH,
    );
    expect(d.phase).toBe("archived");
    expect(d.action.kind).toBe("archived");
    expect(d.canArchive).toBe(true);
  });

  it("classifies unclassifiable recovery audit as recovery reason unknown", () => {
    const gates = gatesWith("execution", "done", {
      recovery_audit: {
        reason: "manually reconciled projection",
        evidence: "operator note",
        recovered_at: FRESH,
      },
    });
    const ready = markDone(
      gates,
      "proposal",
      "discovery",
      "design",
      "planning",
    );
    const d = deriveWorkflowDirective(makeState({ gates: ready }), EPOCH);
    expect(d.recovery?.reason).toBe("unknown");
    expect(d.action.kind).toBe("recovery");
  });

  it("is referentially transparent for equal state + epoch", () => {
    const gates = markDone(gatesWith("execution", "in_progress"), "proposal");
    const state = makeState({ gates });
    const a = deriveWorkflowDirective(state, EPOCH);
    const b = deriveWorkflowDirective(state, EPOCH);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
