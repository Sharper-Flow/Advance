/**
 * Phase-Plan Parity Suite — derivation, adapter, mapping, and consumer
 * parity driven by the single table in
 * `../__tests__/phase-plan-parity-matrix` (AC2, AC6, AC7, AC10; DDC4).
 *
 * What this suite proves over every matrix row (7 gate positions keyed by
 * GATE_ORDER, never-started, all-gates-done, approval, readiness-blocked,
 * precedence collisions, archived, closed, malformed):
 *
 *   1. AC2  — every gate position produces a deterministic plan from the
 *      same durable snapshot (derive twice → structurally equal).
 *   2. Adapter parity — the legacy WorkflowDirective equals
 *      `directiveFromPlan(derivePhasePlan(ctx), ctx)`; one canonical kernel,
 *      no second derivation path.
 *   3. AC7 — the manifest-owned gate→command mapping and the workflow-safe
 *      `GATE_COMMAND` mirror cannot drift: structural assertions in both
 *      directions plus injected-drift detection proofs.
 *   4. Terminal safety — archived/closed/terminal rows never emit a route
 *      or command in any consumer.
 *   5. Consumer routing-only response — the context snapshot, compaction
 *      context, and status next-gate recommendation render exactly the
 *      routing implied by the plan and nothing more; non-authorizing
 *      variants carry no `/adv-*` command route.
 *   6. Read-only (C2/AC3) — plan/directive reads perform zero mutations on
 *      the durable snapshot, verified under deep-freeze.
 */

import { describe, expect, it } from "vitest";

import { COMMAND_MANIFEST, getCommandsByGate } from "../manifest";
import { buildNextGateRecommendationFromDirective } from "../tools/status-enrich";
import { GATE_ORDER, type GateId } from "../types";
import {
  EXPECTED_GATE_COMMAND,
  PARITY_EPOCH,
  PARITY_ROWS,
} from "../__tests__/phase-plan-parity-matrix";
import { buildCompactionContext } from "./compaction-context";
import { buildChangeContextSnapshot } from "./context-snapshot";
import {
  derivePhasePlan,
  derivePhasePlanFromState,
  derivePhasePlanSafe,
  directiveCtxFromState,
  GATE_COMMAND,
  parsePhasePlan,
} from "./phase-plan";
import {
  deriveDirectiveSafe,
  deriveWorkflowDirective,
  directiveFromPlan,
} from "./workflow-directive";

// These rows modeled poisoned Temporal workflow history. That condition cannot
// occur without Temporal workflows; genuine disk recovery remains covered by
// recovery-audit tests.
const PARITY_ROWS_WITHOUT_RETIRED_RECOVERY = PARITY_ROWS.filter(
  (row) =>
    row.name !== "precise-recovery" &&
    row.name !== "precedence:recovery-beats-approval",
);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function snapshotFor(
  row: (typeof PARITY_ROWS)[number],
  directive: ReturnType<typeof deriveDirectiveSafe>,
): string {
  return buildChangeContextSnapshot({
    change: {
      id: row.state.changeId,
      title: row.state.title,
      tasks: [],
    },
    gates: row.state.gates,
    workdir: "/tmp/parity",
    directive,
  });
}

describe("parity matrix — plan derivation from one durable snapshot (AC2)", () => {
  it.each(PARITY_ROWS_WITHOUT_RETIRED_RECOVERY)(
    "$name: derives the expected variant deterministically",
    (row) => {
      const plan = derivePhasePlanSafe(row.state, PARITY_EPOCH);
      expect(plan.kind).toBe(row.expect.planKind);
      expect(parsePhasePlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);

      if (row.expect.planKind === "actionable") {
        if (plan.kind !== "actionable") throw new Error("matrix drift");
        expect(plan.gateId).toBe(row.expect.planGateId);
        expect(plan.command).toBe(row.expect.planCommand);
        expect(plan.initial).toBe(row.expect.planInitial);
        expect(plan.failClosed).toBe(false);
      } else {
        expect(plan.failClosed).toBe(true);
        // Non-authorizing variants never carry a route or command.
        expect(plan).not.toHaveProperty("command");
        expect(plan).not.toHaveProperty("route");
      }

      if (row.expect.planKind !== "degraded") {
        expect(plan.phase).toBe(row.expect.planPhase);
        if (row.expect.planGateId) {
          expect(plan.gateId).toBe(row.expect.planGateId);
        }
      }

      // AC2: the same durable snapshot produces a structurally equal plan
      // on every read.
      const again = derivePhasePlanSafe(row.state, PARITY_EPOCH);
      expect(JSON.stringify(again)).toBe(JSON.stringify(plan));
    },
  );

  it.each(PARITY_ROWS_WITHOUT_RETIRED_RECOVERY)(
    "$name: reads perform zero mutations on the durable snapshot",
    (row) => {
      const state = structuredClone(row.state);
      const before = JSON.stringify(state);
      deepFreeze(state);
      derivePhasePlanSafe(state, PARITY_EPOCH);
      deriveDirectiveSafe(state, PARITY_EPOCH);
      expect(JSON.stringify(state)).toBe(before);
    },
  );
});

describe("parity matrix — PhasePlan/directive adapter parity", () => {
  const derivable = PARITY_ROWS_WITHOUT_RETIRED_RECOVERY.filter(
    (row) => row.expect.planKind !== "degraded",
  );

  it.each(derivable)(
    "$name: directive equals directiveFromPlan over the same normalized context",
    (row) => {
      const ctx = directiveCtxFromState(row.state, PARITY_EPOCH);
      const plan = derivePhasePlan(ctx);
      expect(directiveFromPlan(plan, ctx)).toEqual(
        deriveWorkflowDirective(row.state, PARITY_EPOCH),
      );

      const directive = deriveWorkflowDirective(row.state, PARITY_EPOCH);
      expect(directive.action.kind).toBe(row.expect.directiveActionKind);
      if (row.expect.planKind === "actionable") {
        expect(directive.action.command).toBe(row.expect.planCommand);
        expect(directive.action.gateId).toBe(row.expect.planGateId);
      } else {
        // Non-authorizing actions route to a gate at most — never a command.
        expect(directive.action).not.toHaveProperty("command");
      }
    },
  );
});

describe("manifest ↔ workflow-safe command mapping (AC7)", () => {
  /**
   * Diff the workflow-safe GATE_COMMAND mirror against the manifest's
   * gate→primary-command ownership. Every mismatch class (renamed, missing,
   * extra, or reordered mapping on either side) must surface as a
   * gate-named entry.
   */
  function findMappingMismatches(
    mapping: { readonly [gate: string]: string | undefined },
    manifestPrimary: (gate: GateId) => string | undefined,
  ): string[] {
    const mismatches: string[] = [];
    for (const gate of GATE_ORDER) {
      const primary = manifestPrimary(gate);
      const mapped = mapping[gate];
      if (!primary) {
        mismatches.push(`${gate}: manifest has no primary command`);
        continue;
      }
      if (mapped === undefined) {
        mismatches.push(`${gate}: workflow-safe mapping is missing`);
        continue;
      }
      if (mapped !== primary) {
        mismatches.push(
          `${gate}: workflow-safe "${mapped}" != manifest primary "${primary}"`,
        );
      }
    }
    for (const key of Object.keys(mapping)) {
      if (!GATE_ORDER.includes(key as GateId)) {
        mismatches.push(`${key}: workflow-safe mapping has no matching gate`);
      }
    }
    return mismatches;
  }

  it("workflow-safe mapping covers exactly the seven gates", () => {
    expect(Object.keys(GATE_COMMAND).sort()).toEqual([...GATE_ORDER].sort());
  });

  it.each(GATE_ORDER)(
    "gate %s: manifest primary == workflow-safe mapping == expected command",
    (gate) => {
      // Exactly one manifest command owns each gate as its primary.
      expect(getCommandsByGate(gate).map((cmd) => cmd.name)).toEqual([
        GATE_COMMAND[gate],
      ]);
      expect(GATE_COMMAND[gate]).toBe(EXPECTED_GATE_COMMAND[gate]);
      const def = COMMAND_MANIFEST[GATE_COMMAND[gate]];
      expect(def).toBeDefined();
      expect(def.gate).toBe(gate);
    },
  );

  it("every manifest command with a gate field is the mapped primary for that gate", () => {
    for (const def of Object.values(COMMAND_MANIFEST)) {
      if (def.gate) {
        expect(GATE_COMMAND[def.gate]).toBe(def.name);
      }
    }
  });

  it("actionable plans route every gate position to the manifest primary", () => {
    for (const row of PARITY_ROWS_WITHOUT_RETIRED_RECOVERY) {
      if (row.expect.planKind !== "actionable" || !row.expect.planGateId) {
        continue;
      }
      const plan = derivePhasePlanFromState(row.state, PARITY_EPOCH);
      if (plan.kind !== "actionable") throw new Error("matrix drift");
      expect(plan.command).toBe(
        getCommandsByGate(row.expect.planGateId)[0]?.name,
      );
    }
  });

  describe("mismatch detection proof", () => {
    const primary = (gate: GateId) => getCommandsByGate(gate)[0]?.name;

    it("reports zero mismatches for the real mapping", () => {
      expect(findMappingMismatches(GATE_COMMAND, primary)).toEqual([]);
    });

    it("detects a renamed workflow-safe command", () => {
      const drifted = { ...GATE_COMMAND, design: "adv-harden" };
      expect(findMappingMismatches(drifted, primary)).toEqual([
        expect.stringContaining("design"),
      ]);
    });

    it("detects a missing workflow-safe gate entry", () => {
      const { release: _dropped, ...drifted } = GATE_COMMAND;
      expect(findMappingMismatches(drifted, primary)).toEqual([
        expect.stringContaining("release"),
      ]);
    });

    it("detects an extra workflow-safe gate entry", () => {
      const drifted = { ...GATE_COMMAND, archive: "adv-archive" };
      expect(findMappingMismatches(drifted, primary)).toEqual([
        expect.stringContaining("archive"),
      ]);
    });

    it("detects a renamed manifest primary", () => {
      const renamed = (gate: GateId) =>
        gate === "design" ? "adv-renamed" : primary(gate);
      expect(findMappingMismatches(GATE_COMMAND, renamed)).toEqual([
        expect.stringContaining("design"),
      ]);
    });

    it("detects a missing manifest primary", () => {
      const missing = (gate: GateId) =>
        gate === "release" ? undefined : primary(gate);
      expect(findMappingMismatches(GATE_COMMAND, missing)).toEqual([
        expect.stringContaining("release"),
      ]);
    });
  });
});

describe("parity matrix — orientation consumers render routing-only responses", () => {
  it.each(PARITY_ROWS_WITHOUT_RETIRED_RECOVERY)(
    "$name: context snapshot Next line matches the plan's routing",
    (row) => {
      const directive = deriveDirectiveSafe(row.state, PARITY_EPOCH);
      const snapshot = snapshotFor(row, directive);
      const nextLine =
        snapshot.split("\n").find((line) => line.includes("Next:")) ?? "";

      if (row.expect.snapshotNext) {
        expect(snapshot).toContain(row.expect.snapshotNext);
      } else {
        expect(nextLine).toBe("");
      }

      if (row.expect.planKind === "actionable") {
        expect(nextLine).toContain(`/${row.expect.planCommand}`);
      } else {
        // Non-authorizing rows never route to a command.
        expect(nextLine).not.toMatch(/\/adv-[a-z-]+/);
      }
    },
  );

  it.each(PARITY_ROWS_WITHOUT_RETIRED_RECOVERY)(
    "$name: compaction context carries the same Next line",
    (row) => {
      const directive = deriveDirectiveSafe(row.state, PARITY_EPOCH);
      const block = buildCompactionContext({
        change: { id: row.state.changeId, title: row.state.title },
        tasks: [],
        gates: row.state.gates,
        specs: [],
        directive,
      });
      if (row.expect.snapshotNext) {
        expect(block).toContain(row.expect.snapshotNext);
      } else {
        expect(block).not.toContain("Next:");
      }
    },
  );

  it.each(PARITY_ROWS_WITHOUT_RETIRED_RECOVERY)(
    "$name: status next-gate recommendation matches the plan's routing",
    (row) => {
      const directive = deriveDirectiveSafe(row.state, PARITY_EPOCH);
      if (!directive) {
        // Degraded rows produce no directive and therefore no recommendation.
        expect(row.expect.recommendation).toBeUndefined();
        return;
      }
      const item = buildNextGateRecommendationFromDirective({
        directive,
        changeId: row.state.changeId,
      });
      if (!row.expect.recommendation) {
        expect(item).toBeNull();
        return;
      }
      expect(item).toMatchObject({
        kind: "next_gate",
        gateId: row.expect.recommendation.gateId,
      });
      expect(item?.action).toContain(`/${row.expect.recommendation.command}`);
      expect(item?.message).toContain(
        `/${row.expect.recommendation.command} ${row.state.changeId}`,
      );
    },
  );
});

describe("parity matrix — terminal safety", () => {
  const terminalRows = PARITY_ROWS.filter(
    (row) => row.expect.planKind === "terminal",
  );
  it("covers archived, closed, and terminal-precedence states", () => {
    expect(terminalRows.map((row) => row.name)).toEqual([
      "precedence:terminal-beats-all",
      "archived",
      "closed",
    ]);
  });

  it.each(terminalRows)(
    "$name: no consumer emits a route or command",
    (row) => {
      const plan = derivePhasePlanFromState(row.state, PARITY_EPOCH);
      expect(plan.kind).toBe("terminal");
      expect(plan).not.toHaveProperty("command");
      expect(plan).not.toHaveProperty("gateId");

      const directive = deriveWorkflowDirective(row.state, PARITY_EPOCH);
      expect(directive.action.kind).toBe("archived");
      expect(directive.action).not.toHaveProperty("command");
      expect(directive.action).not.toHaveProperty("gateId");

      const snapshot = snapshotFor(row, directive);
      expect(snapshot).toContain("Next: archived");
      expect(snapshot).not.toMatch(/Next:[^\n]*\/adv-/);

      expect(
        buildNextGateRecommendationFromDirective({
          directive,
          changeId: row.state.changeId,
        }),
      ).toBeNull();
    },
  );
});

describe("parity matrix — malformed durable projection (typed degraded)", () => {
  const malformed = PARITY_ROWS_WITHOUT_RETIRED_RECOVERY.find(
    (row) => row.name === "malformed",
  );
  if (!malformed) throw new Error("matrix is missing the malformed row");

  it("strict derivation throws; safe wrapper returns a typed non-authorizing plan", () => {
    expect(() =>
      derivePhasePlanFromState(malformed.state, PARITY_EPOCH),
    ).toThrow();
    const plan = derivePhasePlanSafe(malformed.state, PARITY_EPOCH);
    expect(plan).toMatchObject({
      kind: "degraded",
      failClosed: true,
      reason: "missing_state",
    });
    expect(plan).not.toHaveProperty("command");
    expect(plan).not.toHaveProperty("route");
    expect(parsePhasePlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
  });

  it("degraded state produces no directive, no Next line, and no recommendation", () => {
    const directive = deriveDirectiveSafe(malformed.state, PARITY_EPOCH);
    expect(directive).toBeUndefined();
    const snapshot = snapshotFor(malformed, directive);
    expect(snapshot).not.toContain("Next:");
  });
});
