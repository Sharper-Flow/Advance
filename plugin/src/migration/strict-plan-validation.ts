/**
 * strict-plan-validation — pre-cutover plan surface proof (AC9/DDC5, DDC1).
 *
 * Proves the plan surface is strict and functional before a cutover receipt
 * activates:
 *
 *   1. Each of the 7 gate positions derives a parseable actionable plan
 *      carrying the manifest-owned gate command (round-trip through the
 *      strict boundary parser).
 *   2. A terminal change derives a terminal plan; an all-gates-done change
 *      derives the archive action.
 *   3. Malformed payloads are REJECTED by the boundary parser (DDC1) — an
 *      unparseable plan never falls through to a command.
 *   4. Conflicting state degrades into a typed non-authorizing plan with no
 *      command (SC3/AC3).
 *   5. Derivation is deterministic: equal inputs produce structurally equal
 *      plans.
 *
 * Pure and deterministic — no I/O, no Temporal. The activation script runs
 * this against the same source the deployed bundle was built from; binding
 * the receipt to the immutable build digest makes the proof equivalent for
 * the deployed content.
 */

import type { ChangeWorkflowState } from "../temporal/contracts";
import { createDefaultGates, GATE_ORDER, type Gates } from "../types";
import {
  derivePhasePlanFromState,
  derivePhasePlanSafe,
  GATE_COMMAND,
  parsePhasePlan,
  type PhasePlan,
} from "../utils/phase-plan";

export interface StrictPlanValidationResult {
  passed: boolean;
  checks: number;
  failures: string[];
  detail: string;
}

const FRESH = "2026-05-05T11:30:00.000Z";

function makeState(
  overrides: Partial<ChangeWorkflowState> = {},
): ChangeWorkflowState {
  return {
    projectId: "project-1",
    changeId: "strict-plan-check",
    title: "Strict plan surface check",
    initializedAt: FRESH,
    id: "strict-plan-check",
    status: "draft",
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

function gatesThrough(doneUpTo: number): Gates {
  const gates = createDefaultGates();
  for (let i = 0; i < doneUpTo; i++) {
    const id = GATE_ORDER[i];
    gates[id] = { ...gates[id], status: "done" };
  }
  return gates;
}

type DeriveFn = (state: ChangeWorkflowState, epoch: number) => PhasePlan;

/**
 * Run the strict plan surface matrix. `deriveOverride` exists so the failure
 * path itself is testable; production callers use the canonical kernel.
 */
export function validateStrictPlanSurface(input?: {
  deriveOverride?: DeriveFn;
  nowMs?: number;
}): StrictPlanValidationResult {
  const derive: DeriveFn = input?.deriveOverride ?? derivePhasePlanFromState;
  const nowMs = input?.nowMs ?? Date.parse("2026-05-05T12:00:00.000Z");
  const failures: string[] = [];
  let checks = 0;

  const check = (label: string, fn: () => void): void => {
    checks += 1;
    try {
      fn();
    } catch (error) {
      failures.push(
        `${label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  const assert = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
  };

  // 1. Every gate position: actionable plan, manifest-owned command, parses.
  GATE_ORDER.forEach((gateId, index) => {
    check(`gate:${gateId}`, () => {
      const plan = derive(makeState({ gates: gatesThrough(index) }), nowMs);
      assert(
        plan.kind === "actionable",
        `expected actionable, got ${plan.kind}`,
      );
      if (plan.kind === "actionable") {
        assert(
          plan.gateId === gateId,
          `expected gateId ${gateId}, got ${plan.gateId}`,
        );
        assert(
          plan.command === GATE_COMMAND[gateId],
          `expected command ${GATE_COMMAND[gateId]}, got ${plan.command}`,
        );
      }
      parsePhasePlan(plan); // boundary round-trip must not throw
    });
  });

  // 2a. Terminal lifecycle → terminal plan.
  check("terminal", () => {
    const plan = derive(
      makeState({ status: "archived", gates: gatesThrough(7) }),
      nowMs,
    );
    assert(plan.kind === "terminal", `expected terminal, got ${plan.kind}`);
    parsePhasePlan(plan);
  });

  // 2b. All gates done → archive action (release owns adv-archive).
  check("archive-ready", () => {
    const plan = derive(makeState({ gates: gatesThrough(7) }), nowMs);
    assert(plan.kind === "actionable", `expected actionable, got ${plan.kind}`);
    if (plan.kind === "actionable") {
      assert(
        plan.command === GATE_COMMAND.release,
        `expected ${GATE_COMMAND.release}, got ${plan.command}`,
      );
    }
    parsePhasePlan(plan);
  });

  // 3. Malformed payloads rejected at the boundary (DDC1).
  check("malformed-rejected", () => {
    let rejected = false;
    try {
      parsePhasePlan({ kind: "actionable", command: "adv-prep" });
    } catch {
      rejected = true;
    }
    assert(rejected, "malformed actionable payload was not rejected");
  });

  // 4. Conflicting state → typed degraded plan, no command (SC3/AC3).
  check("conflicting-degrades", () => {
    const broken = makeState({ gates: undefined as unknown as Gates });
    const plan = derivePhasePlanSafe(broken, nowMs);
    assert(plan.kind === "degraded", `expected degraded, got ${plan.kind}`);
    assert(plan.failClosed === true, "degraded plan must fail closed");
    assert(!("command" in plan), "degraded plan must not carry a command");
    parsePhasePlan(plan);
  });

  // 5. Determinism: equal inputs → structurally equal plans.
  check("determinism", () => {
    const state = makeState({ gates: gatesThrough(3) });
    const first = derive(state, nowMs);
    const second = derive(state, nowMs);
    assert(
      JSON.stringify(first) === JSON.stringify(second),
      "equal inputs produced different plans",
    );
  });

  return {
    passed: failures.length === 0,
    checks,
    failures,
    detail:
      failures.length === 0
        ? `${checks} strict plan-surface checks passed`
        : `${failures.length}/${checks} strict plan-surface checks failed`,
  };
}
