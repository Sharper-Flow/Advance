import { describe, expect, it } from "vitest";

import type { ChangeState } from "../types/change-state";
import type { GateId, GateReadinessBlocker, Gates } from "../types";
import { createDefaultGates, GATE_ORDER } from "../types";
import {
  derivePhasePlan,
  derivePhasePlanFromState,
  derivePhasePlanSafe,
  degradedPhasePlan,
  directiveCtxFromState,
  GATE_COMMAND,
  parsePhasePlan,
  PHASE_PLAN_MAX_EVIDENCE,
  PHASE_PLAN_MAX_GUIDANCE,
  PhaseDirectiveSchema,
  type DirectiveContext,
  type PhasePlan,
} from "./phase-plan";
import {
  deriveWorkflowDirective,
  directiveFromPlan,
} from "./workflow-directive";

const EPOCH = Date.parse("2026-05-05T12:00:00.000Z");
const STALE = "2026-05-04T00:00:00.000Z"; // >24h before EPOCH
const FRESH = "2026-05-05T11:30:00.000Z"; // 30m before EPOCH

const PLAN_KINDS = [
  "actionable",
  "approval-required",
  "blocked",
  "recovery-required",
  "terminal",
  "degraded",
] as const;

function makeState(overrides: Partial<ChangeState> = {}): ChangeState {
  return {
    projectId: "0000ec0100000000000000000000000000000000",
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

function makeCtx(overrides: Partial<DirectiveContext> = {}): DirectiveContext {
  const gateStatus = Object.fromEntries(
    GATE_ORDER.map((id) => [id, "pending"]),
  ) as DirectiveContext["gateStatus"];
  return {
    changeId: "change-1",
    isArchived: false,
    firstOpenGate: "proposal",
    canArchive: false,
    noGatesStarted: true,
    approvalPending: false,
    gateStatus,
    blockers: [],
    bucket: "in_flight",
    ...overrides,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function stateWithGateInProgress(gate: GateId): ChangeState {
  const idx = GATE_ORDER.indexOf(gate);
  const prior = GATE_ORDER.slice(0, idx);
  let gates = gatesWith(gate, "in_progress");
  gates = markDone(gates, ...prior);
  return makeState({ gates });
}

describe("derivePhasePlan — variants (AC1)", () => {
  it("produces actionable (initial) for a change with no gates started", () => {
    const plan = derivePhasePlanFromState(makeState(), EPOCH);
    expect(plan.kind).toBe("actionable");
    if (plan.kind !== "actionable") return;
    expect(plan.initial).toBe(true);
    expect(plan.gateId).toBe("proposal");
    expect(plan.command).toBe(GATE_COMMAND.proposal);
    expect(plan.failClosed).toBe(false);
  });

  it("produces actionable (advance) for an in-progress gate", () => {
    const plan = derivePhasePlanFromState(
      stateWithGateInProgress("design"),
      EPOCH,
    );
    expect(plan.kind).toBe("actionable");
    if (plan.kind !== "actionable") return;
    expect(plan.initial).toBe(false);
    expect(plan.gateId).toBe("design");
    expect(plan.command).toBe(GATE_COMMAND.design);
    expect(plan.phase).toBe("design");
  });

  it("produces approval-required when a human checkpoint is pending", () => {
    const ctx = makeCtx({
      noGatesStarted: false,
      firstOpenGate: "planning",
      approvalPending: true,
      bucket: "awaiting_approval",
    });
    const plan = derivePhasePlan(ctx);
    expect(plan.kind).toBe("approval-required");
    if (plan.kind !== "approval-required") return;
    expect(plan.gateId).toBe("planning");
    expect(plan.checkpoint).toBe("planning");
    expect(plan.failClosed).toBe(true);
    expect("command" in plan).toBe(false);
  });

  it("produces blocked with durable readiness blockers", () => {
    const ctx = makeCtx({
      noGatesStarted: false,
      firstOpenGate: "design",
      blockers: [blocker("ARTIFACT_MISSING", "design")],
    });
    const plan = derivePhasePlan(ctx);
    expect(plan.kind).toBe("blocked");
    if (plan.kind !== "blocked") return;
    expect(plan.gateId).toBe("design");
    expect(plan.blockers.map((b) => b.code)).toContain("ARTIFACT_MISSING");
    expect(plan.failClosed).toBe(true);
    expect("command" in plan).toBe(false);
  });

  it("produces terminal for archived and closed changes", () => {
    const allDone = markDone(createDefaultGates(), ...GATE_ORDER);
    const archived = derivePhasePlanFromState(
      makeState({
        status: "archived",
        lifecycleState: "archived",
        gates: allDone,
      }),
      EPOCH,
    );
    expect(archived.kind).toBe("terminal");
    expect(archived.phase).toBe("archived");
    expect(archived.failClosed).toBe(true);
    expect("command" in archived).toBe(false);

    const closed = derivePhasePlanFromState(
      makeState({ status: "closed", gates: allDone }),
      EPOCH,
    );
    expect(closed.kind).toBe("terminal");
  });

  it("produces actionable release plan when all gates are satisfied", () => {
    const allDone = markDone(createDefaultGates(), ...GATE_ORDER);
    const plan = derivePhasePlanFromState(makeState({ gates: allDone }), EPOCH);
    expect(plan.kind).toBe("actionable");
    if (plan.kind !== "actionable") return;
    expect(plan.gateId).toBe("release");
    expect(plan.command).toBe("adv-archive");
    expect(plan.initial).toBe(false);
    expect(plan.phase).toBe("done");
  });

  it("reports exactly one current state kind across a representative matrix", () => {
    const states: ChangeState[] = [
      makeState(),
      stateWithGateInProgress("planning"),
      makeState({
        gates: markDone(gatesWith("planning", "awaiting_approval")),
        pendingCheckpoint: true,
      }),
      makeState({
        gates: gatesWith("execution", "stuck", {
          stuck_reason: "TMPRL1100 nondeterminism while replaying history",
        }),
      }),
      makeState({ status: "archived", lifecycleState: "archived" }),
    ];
    for (const state of states) {
      const plan = derivePhasePlanFromState(state, EPOCH);
      expect(PLAN_KINDS).toContain(plan.kind);
      // Strict boundary: every derived variant must round-trip the parser.
      expect(parsePhasePlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    }
  });
});

describe("derivePhasePlan — determinism across all seven gates (AC2)", () => {
  it.each(GATE_ORDER)(
    "produces a deterministic actionable plan for in-progress gate %s",
    (gate) => {
      const state = stateWithGateInProgress(gate);
      const a = derivePhasePlanFromState(state, EPOCH);
      const b = derivePhasePlanFromState(state, EPOCH);
      expect(a.kind).toBe("actionable");
      if (a.kind !== "actionable") return;
      expect(a.gateId).toBe(gate);
      expect(a.command).toBe(GATE_COMMAND[gate]);
      expect(a.phase).toBe(gate);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    },
  );
});

describe("phase plan — degraded + read-only behavior (AC3)", () => {
  it("strict derivation throws on malformed durable state", () => {
    const malformed = makeState({ gates: {} as Gates });
    expect(() => derivePhasePlanFromState(malformed, EPOCH)).toThrow();
  });

  it("safe wrapper returns a typed non-authorizing degraded plan", () => {
    const malformed = makeState({ gates: {} as Gates });
    const plan = derivePhasePlanSafe(malformed, EPOCH);
    expect(plan.kind).toBe("degraded");
    if (plan.kind !== "degraded") return;
    expect(plan.failClosed).toBe(true);
    expect(plan.reason).toBe("missing_state");
    expect(plan.provenance.source).toBe("degraded");
    expect(plan.changeId).toBe("change-1");
    expect("command" in plan).toBe(false);
    expect("gateId" in plan).toBe(false);
    // The degraded variant is itself strictly parseable.
    expect(parsePhasePlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
  });

  it("classifies conflicting normalized state as a derivation failure, not a command", () => {
    // No open gate, cannot archive, nothing classifiable: conflicting state
    // must throw in the strict path rather than invent an action.
    const conflicting = makeCtx({
      firstOpenGate: undefined,
      canArchive: false,
      noGatesStarted: false,
    });
    expect(() => derivePhasePlan(conflicting)).toThrow(/conflicting state/);

    const noOpenNeverStarted = makeCtx({
      firstOpenGate: undefined,
      noGatesStarted: true,
    });
    expect(() => derivePhasePlan(noOpenNeverStarted)).toThrow(
      /conflicting state/,
    );
  });

  it("performs zero mutations on the durable snapshot", () => {
    const state = makeState({
      gates: markDone(gatesWith("design", "in_progress"), "proposal"),
      pendingCheckpoint: false,
    });
    const before = JSON.stringify(state);
    deepFreeze(state);
    const plan = derivePhasePlanFromState(state, EPOCH);
    expect(plan.kind).toBe("actionable");
    expect(JSON.stringify(state)).toBe(before);
  });

  it("degradedPhasePlan builds a typed diagnostics carrier", () => {
    const plan = degradedPhasePlan(
      "change-9",
      "unsupported_state",
      "plan version 99 not understood by this build",
    );
    expect(plan.kind).toBe("degraded");
    expect(plan.failClosed).toBe(true);
    expect(plan.reason).toBe("unsupported_state");
    expect(plan.provenance).toEqual({
      source: "degraded",
      reason: "unsupported_state",
      diagnostics: "plan version 99 not understood by this build",
    });
    expect(parsePhasePlan(plan)).toEqual(plan);
  });
});

describe("phase plan — provenance and recovery distinction (AC4)", () => {
  it("marks canonical derivation provenance with the durable bucket", () => {
    const plan = derivePhasePlanFromState(
      stateWithGateInProgress("execution"),
      EPOCH,
    );
    expect(plan.provenance).toEqual({
      source: "canonical",
      bucket: "in_flight",
    });
  });

  it("turns a stuck gate into a durable blocker", () => {
    const progress = derivePhasePlanFromState(
      stateWithGateInProgress("execution"),
      EPOCH,
    );
    expect(progress.kind).toBe("actionable");

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
    const recovery = derivePhasePlanFromState(
      makeState({ gates: ready }),
      EPOCH,
    );
    expect(recovery.kind).toBe("blocked");
  });

  it("distinguishes initial start from advancing progress", () => {
    const initial = derivePhasePlanFromState(makeState(), EPOCH);
    const advancing = derivePhasePlanFromState(
      stateWithGateInProgress("proposal"),
      EPOCH,
    );
    expect(initial.kind).toBe("actionable");
    expect(advancing.kind).toBe("actionable");
    if (initial.kind === "actionable" && advancing.kind === "actionable") {
      expect(initial.initial).toBe(true);
      expect(advancing.initial).toBe(false);
    }
  });

  it("carries provenance on non-authorizing variants", () => {
    const ctx = makeCtx({
      isArchived: true,
      canArchive: true,
      firstOpenGate: undefined,
      bucket: "ready_to_archive",
    });
    const plan = derivePhasePlan(ctx);
    expect(plan.kind).toBe("terminal");
    expect(plan.provenance.source).toBe("canonical");
  });
});

describe("phase plan — bounded evidence and guidance (AC5)", () => {
  it.each(GATE_ORDER)(
    "keeps evidence and guidance within bounds for gate %s",
    (gate) => {
      const plan = derivePhasePlanFromState(
        stateWithGateInProgress(gate),
        EPOCH,
      );
      expect(plan.kind).toBe("actionable");
      if (plan.kind !== "actionable") return;
      expect(plan.evidence.length).toBeLessThanOrEqual(PHASE_PLAN_MAX_EVIDENCE);
      expect(plan.guidance.length).toBeLessThanOrEqual(PHASE_PLAN_MAX_GUIDANCE);
      expect(plan.evidence.length).toBeGreaterThan(0);
      expect(plan.guidance.length).toBeGreaterThan(0);
      expect(plan.guidance.join(" ")).toContain(plan.command);
    },
  );

  it("bounds constants match the contract caps", () => {
    expect(PHASE_PLAN_MAX_EVIDENCE).toBe(12);
    expect(PHASE_PLAN_MAX_GUIDANCE).toBe(3);
  });
});

describe("parsePhasePlan — strict boundary validation (DDC1)", () => {
  function validActionable(): PhasePlan {
    return derivePhasePlanFromState(stateWithGateInProgress("design"), EPOCH);
  }

  const validDirective = {
    kind: "phase_directive" as const,
    command: "adv-review" as const,
    content: "Review the acceptance evidence.",
    contentHash:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  };

  it("parses and round-trips an actionable plan with a valid directive", () => {
    const plan = validActionable();
    if (plan.kind !== "actionable") throw new Error("test setup");
    const withDirective = { ...plan, directive: validDirective };

    expect(parsePhasePlan(withDirective)).toEqual(withDirective);
  });

  it("keeps the directive optional for actionable plans", () => {
    const plan = validActionable();

    expect(parsePhasePlan(plan)).toEqual(plan);
    expect("directive" in plan).toBe(false);
  });

  it.each([
    ["wrong kind", { ...validDirective, kind: "directive" }],
    ["unknown command", { ...validDirective, command: "adv-apply" }],
    ["empty content", { ...validDirective, content: "" }],
    [
      "uppercase hash",
      {
        ...validDirective,
        contentHash: validDirective.contentHash.toUpperCase(),
      },
    ],
    ["short hash", { ...validDirective, contentHash: "0123" }],
    [
      "prefixed hash",
      {
        ...validDirective,
        contentHash: `sha256:${validDirective.contentHash}`,
      },
    ],
    ["non-hex hash", { ...validDirective, contentHash: `${"g".repeat(64)}` }],
  ])("rejects a directive with %s", (_case, directive) => {
    expect(PhaseDirectiveSchema.safeParse(directive).success).toBe(false);
  });

  it("excludes directives from every non-actionable plan variant", () => {
    const variants: PhasePlan[] = [
      derivePhasePlan(makeCtx({ approvalPending: true })),
      derivePhasePlan(
        makeCtx({ blockers: [blocker("ARTIFACT_MISSING", "proposal")] }),
      ),
      derivePhasePlan(
        makeCtx({
          recovery: { reason: "unknown", description: "audit" },
        }),
      ),
      derivePhasePlan(makeCtx({ isArchived: true })),
      degradedPhasePlan("change-1", "missing_state", "gone"),
    ];

    for (const variant of variants) {
      expect(variant.kind).not.toBe("actionable");
      const parsed = parsePhasePlan(variant);
      expect(parsed).toEqual(variant);
      expect("directive" in parsed).toBe(false);
    }
  });

  it("rejects an unsupported version", () => {
    const plan = { ...validActionable(), version: 2 };
    expect(() => parsePhasePlan(plan)).toThrow();
  });

  it("rejects an unknown kind", () => {
    const plan = { ...validActionable(), kind: "execute-everything" };
    expect(() => parsePhasePlan(plan)).toThrow();
  });

  it("rejects an actionable plan without a command", () => {
    const plan = validActionable();
    if (plan.kind !== "actionable") throw new Error("test setup");
    const { command: _command, ...rest } = plan;
    expect(() => parsePhasePlan(rest)).toThrow();
  });

  it("rejects unknown extra keys", () => {
    const plan = { ...validActionable(), teleport: true };
    expect(() => parsePhasePlan(plan)).toThrow();
  });

  it("rejects failClosed true on an actionable plan", () => {
    const plan = { ...validActionable(), failClosed: true };
    expect(() => parsePhasePlan(plan)).toThrow();
  });

  it("rejects over-cap evidence and guidance arrays", () => {
    const plan = validActionable();
    if (plan.kind !== "actionable") throw new Error("test setup");
    const overEvidence = {
      ...plan,
      evidence: Array.from({ length: 13 }, (_, i) => `e${i}`),
    };
    expect(() => parsePhasePlan(overEvidence)).toThrow();
    const overGuidance = {
      ...plan,
      guidance: ["a", "b", "c", "d"],
    };
    expect(() => parsePhasePlan(overGuidance)).toThrow();
  });

  it("rejects a blocked plan with malformed blockers", () => {
    const ctx = makeCtx({
      firstOpenGate: "design",
      blockers: [blocker("ARTIFACT_MISSING", "design")],
    });
    const plan = derivePhasePlan(ctx);
    const malformed = {
      ...(plan as unknown as Record<string, unknown>),
      blockers: [{ code: 42 }],
    };
    expect(() => parsePhasePlan(malformed)).toThrow();
  });
});

describe("phase plan — precedence", () => {
  it("terminal beats recovery, approval, and blocked", () => {
    const ctx = makeCtx({
      isArchived: true,
      approvalPending: true,
      blockers: [blocker("ARTIFACT_MISSING", "design")],
      recovery: { reason: "unknown", description: "audit" },
    });
    expect(derivePhasePlan(ctx).kind).toBe("terminal");
  });

  it("recovery beats approval and blocked", () => {
    const ctx = makeCtx({
      approvalPending: true,
      blockers: [blocker("ARTIFACT_MISSING", "design")],
      recovery: { reason: "unknown", description: "audit" },
    });
    expect(derivePhasePlan(ctx).kind).toBe("recovery-required");
  });

  it("approval beats blocked", () => {
    const ctx = makeCtx({
      approvalPending: true,
      blockers: [blocker("ARTIFACT_MISSING", "design")],
    });
    expect(derivePhasePlan(ctx).kind).toBe("approval-required");
  });

  it("blocked beats initial start", () => {
    const ctx = makeCtx({
      noGatesStarted: true,
      blockers: [blocker("ARTIFACT_MISSING", "proposal")],
    });
    expect(derivePhasePlan(ctx).kind).toBe("blocked");
  });
});

describe("directiveFromPlan — lossless legacy adapter", () => {
  it("adapts every plan variant to the legacy action kind", () => {
    const cases: Array<{
      ctx: DirectiveContext;
      planKind: PhasePlan["kind"];
      actionKind: string;
    }> = [
      { ctx: makeCtx(), planKind: "actionable", actionKind: "never_started" },
      {
        ctx: makeCtx({ noGatesStarted: false, firstOpenGate: "design" }),
        planKind: "actionable",
        actionKind: "continue",
      },
      {
        ctx: makeCtx({ approvalPending: true }),
        planKind: "approval-required",
        actionKind: "approval",
      },
      {
        ctx: makeCtx({ blockers: [blocker("ARTIFACT_MISSING", "proposal")] }),
        planKind: "blocked",
        actionKind: "blocked",
      },
      {
        ctx: makeCtx({
          recovery: { reason: "missing_workflow", description: "gone" },
        }),
        planKind: "recovery-required",
        actionKind: "recovery",
      },
      {
        ctx: makeCtx({ isArchived: true }),
        planKind: "terminal",
        actionKind: "archived",
      },
    ];
    for (const { ctx, planKind, actionKind } of cases) {
      const plan = derivePhasePlan(ctx);
      expect(plan.kind).toBe(planKind);
      const directive = directiveFromPlan(plan, ctx);
      expect(directive.action.kind).toBe(actionKind);
      expect(directive.changeId).toBe(ctx.changeId);
      expect(directive.bucket).toBe(ctx.bucket);
    }
  });

  it("matches deriveWorkflowDirective across a state matrix", () => {
    const states: ChangeState[] = [
      makeState(),
      stateWithGateInProgress("design"),
      makeState({ gates: markDone(createDefaultGates(), ...GATE_ORDER) }),
      makeState({ status: "closed", gates: createDefaultGates() }),
      makeState({
        gates: gatesWith("execution", "stuck", {
          stuck_reason: "TMPRL1100 nondeterminism while replaying history",
        }),
      }),
      makeState({
        gates: markDone(gatesWith("planning", "awaiting_approval")),
        pendingCheckpoint: true,
      }),
      makeState({
        gates: markDone(createDefaultGates(), "proposal"),
        createdAt: STALE,
        lastSignalAt: STALE,
      }),
    ];
    for (const state of states) {
      const ctx = directiveCtxFromState(state, EPOCH);
      const plan = derivePhasePlan(ctx);
      expect(directiveFromPlan(plan, ctx)).toEqual(
        deriveWorkflowDirective(state, EPOCH),
      );
    }
  });

  it("refuses to adapt a degraded plan", () => {
    const degraded = degradedPhasePlan("change-1", "missing_state", "gone");
    expect(() => directiveFromPlan(degraded, makeCtx())).toThrow(/degraded/);
  });
});
