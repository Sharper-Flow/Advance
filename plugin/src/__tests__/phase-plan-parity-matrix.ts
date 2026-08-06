/**
 * Phase-Plan Parity Matrix — the single table driving derivation, adapter,
 * manifest-mapping, and orientation-consumer parity suites (AC2, AC6, AC7,
 * AC10; DDC4).
 *
 * One row = one durable snapshot shape. Every expectation on a row is
 * derived from the SAME snapshot, so drift between the canonical PhasePlan,
 * the legacy WorkflowDirective adapter, the manifest command mapping, or
 * any orientation consumer fails a suite somewhere.
 *
 * Matrix keys:
 *   - all seven gate positions (GATE_ORDER), each in-progress
 *   - never-started and all-gates-done actionable boundaries
 *   - approval-pending, readiness-blocked, precise recovery
 *   - precedence collisions (approval > blocked, recovery > approval,
 *     terminal > everything)
 *   - terminal lifecycle: archived and closed
 *   - malformed durable projection (typed degraded plan, no directive)
 *
 * Orientation consumers covered by suites importing this table:
 *   - adv_gate_status (tools/gate.test.ts — AC6)
 *   - adv_change_show `_phasePlan` + `_contextSnapshot` (tools/change.test.ts)
 *   - adv_status next-gate recommendation
 *     (buildNextGateRecommendationFromDirective — utils/phase-plan-parity.test.ts)
 *   - context snapshot formatter (utils/phase-plan-parity.test.ts); the live
 *     emission, change-show snapshot, and recovery handoff all share
 *     `buildChangeContextSnapshot`, so formatter-level parity covers them
 *   - compaction context (`buildCompactionContext` wraps the same snapshot)
 *
 * Mutation-response snapshots (change-create, gate-complete) render through
 * the same formatter and are covered by formatter-level parity. The workflow
 * `getDirective`/`getPhasePlan` query handlers bind the same derivation
 * kernel; their binding is covered by temporal/workflows.queries.itest.ts.
 *
 * The malformed row has no `gateStatus` expectation: adv_gate_status throws
 * on a gate record with missing entries before its directive fallback
 * engages; degraded-read parity for that row is asserted by the
 * adv_change_show table and the derivation-level suites.
 */

import type { ChangeState } from "../types/change-state";
import type { Change, GateId, GateReadinessBlocker, Gates } from "../types";
import {
  createDefaultGates,
  GATE_ORDER,
  normalizeLegacyChangeStatus,
} from "../types";
import type { PhasePlanKind, PhasePlanPhase } from "../utils/phase-plan";
import type { DirectiveActionKind } from "../utils/workflow-directive";

/** Fixed epoch shared by every derivation in the parity suites. */
export const PARITY_EPOCH = Date.parse("2026-05-05T12:00:00.000Z");
const FRESH = "2026-05-05T11:30:00.000Z"; // 30m before PARITY_EPOCH

/**
 * Expected gate→primary-command literals. Suites assert the four-way tie:
 * plan command == this table == manifest primary == workflow-safe
 * GATE_COMMAND mirror, so any single-side drift fails.
 */
export const EXPECTED_GATE_COMMAND: Record<GateId, string> = {
  proposal: "adv-proposal",
  discovery: "adv-discover",
  design: "adv-design",
  planning: "adv-prep",
  execution: "adv-apply",
  acceptance: "adv-review",
  release: "adv-archive",
};

export interface ParityExpectation {
  /** Plan variant the canonical derivation must report. */
  planKind: PhasePlanKind;
  /** Expected `phase` (absent on the degraded variant). */
  planPhase?: PhasePlanPhase;
  planGateId?: GateId;
  /** Actionable rows only: the routed command (manifest primary). */
  planCommand?: string;
  /** Actionable rows only: initial start vs advance. */
  planInitial?: boolean;
  /** Legacy adapter action kind (absent when no directive is derivable). */
  directiveActionKind?: DirectiveActionKind;
  /** Exact snapshot `Next:` line; undefined ⇒ the line must be omitted. */
  snapshotNext?: string;
  /** adv_gate_status projection; undefined ⇒ row not applicable to the tool. */
  gateStatus?: { nextGate: GateId | null; canArchive: boolean };
  /** Status next-gate recommendation; undefined ⇒ null recommendation. */
  recommendation?: { gateId: GateId; command: string };
}

export interface ParityRow {
  name: string;
  state: ChangeState;
  expect: ParityExpectation;
}

function makeState(overrides: Partial<ChangeState> = {}): ChangeState {
  return {
    projectId: "project-1",
    changeId: "change-1",
    title: "Parity change",
    initializedAt: FRESH,
    id: "change-1",
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

function allDone(): Gates {
  return markDone(createDefaultGates(), ...GATE_ORDER);
}

/** Change-override projection of a row for tool-level mock stores. */
export function toolChangeFor(row: ParityRow): Partial<Change> {
  const state = row.state;
  return {
    // Mirror the workflow-seed boundary: legacy open spellings normalize to
    // "draft" before reaching a Change record.
    status: normalizeLegacyChangeStatus(state.status) as Change["status"],
    lifecycleState: state.lifecycleState as Change["lifecycleState"],
    ...(state.pendingCheckpoint ? { pendingCheckpoint: true } : {}),
    gates: state.gates as Change["gates"],
  };
}

function gateInProgressRow(gate: GateId): ParityRow {
  const prior = GATE_ORDER.slice(0, GATE_ORDER.indexOf(gate));
  const gates = markDone(gatesWith(gate, "in_progress"), ...prior);
  const command = EXPECTED_GATE_COMMAND[gate];
  return {
    name: `gate:${gate}`,
    state: makeState({ gates }),
    expect: {
      planKind: "actionable",
      planPhase: gate,
      planGateId: gate,
      planCommand: command,
      planInitial: false,
      directiveActionKind: "continue",
      snapshotNext: `Next: ${gate} → /${command}`,
      gateStatus: { nextGate: gate, canArchive: false },
      recommendation: { gateId: gate, command },
    },
  };
}

const POISONED_REASON = "TMPRL1100 nondeterminism while replaying history";

export const PARITY_ROWS: ParityRow[] = [
  {
    name: "never-started",
    state: makeState(),
    expect: {
      planKind: "actionable",
      planPhase: "proposal",
      planGateId: "proposal",
      planCommand: EXPECTED_GATE_COMMAND.proposal,
      planInitial: true,
      directiveActionKind: "never_started",
      snapshotNext: `Next: proposal → /${EXPECTED_GATE_COMMAND.proposal}`,
      gateStatus: { nextGate: "proposal", canArchive: false },
      recommendation: {
        gateId: "proposal",
        command: EXPECTED_GATE_COMMAND.proposal,
      },
    },
  },
  ...GATE_ORDER.map(gateInProgressRow),
  {
    name: "all-gates-done",
    state: makeState({ gates: allDone() }),
    expect: {
      planKind: "actionable",
      planPhase: "done",
      planGateId: "release",
      planCommand: EXPECTED_GATE_COMMAND.release,
      planInitial: false,
      directiveActionKind: "continue",
      snapshotNext: `Next: release → /${EXPECTED_GATE_COMMAND.release}`,
      gateStatus: { nextGate: null, canArchive: true },
      recommendation: {
        gateId: "release",
        command: EXPECTED_GATE_COMMAND.release,
      },
    },
  },
  {
    name: "approval-pending",
    state: makeState({
      gates: markDone(
        gatesWith("planning", "awaiting_approval"),
        "proposal",
        "discovery",
        "design",
      ),
      pendingCheckpoint: true,
    }),
    expect: {
      planKind: "approval-required",
      planPhase: "planning",
      planGateId: "planning",
      directiveActionKind: "approval",
      snapshotNext: "Next: approval · planning",
      gateStatus: { nextGate: "planning", canArchive: false },
      // Blocked/approval actions carry a gate but no command; the
      // recommendation falls back to the manifest primary (route-only).
      recommendation: {
        gateId: "planning",
        command: EXPECTED_GATE_COMMAND.planning,
      },
    },
  },
  {
    name: "readiness-blocked",
    state: makeState({
      gates: (() => {
        const gates = markDone(
          gatesWith("design", "in_progress"),
          "proposal",
          "discovery",
        );
        gates.design = {
          ...gates.design,
          readiness_blockers: [
            blocker("ARTIFACT_MISSING", "design"),
            blocker("ARTIFACT_TOO_SMALL", "design"),
          ],
        };
        return gates;
      })(),
    }),
    expect: {
      planKind: "blocked",
      planPhase: "design",
      planGateId: "design",
      directiveActionKind: "blocked",
      snapshotNext: "Next: blocked · design",
      gateStatus: { nextGate: "design", canArchive: false },
      recommendation: {
        gateId: "design",
        command: EXPECTED_GATE_COMMAND.design,
      },
    },
  },
  {
    name: "precise-recovery",
    state: makeState({
      gates: markDone(
        gatesWith("execution", "stuck", { stuck_reason: POISONED_REASON }),
        "proposal",
        "discovery",
        "design",
        "planning",
      ),
    }),
    expect: {
      planKind: "recovery-required",
      planPhase: "execution",
      planGateId: "execution",
      directiveActionKind: "recovery",
      snapshotNext: "Next: recovery · execution",
      gateStatus: { nextGate: "execution", canArchive: false },
      recommendation: {
        gateId: "execution",
        command: EXPECTED_GATE_COMMAND.execution,
      },
    },
  },
  {
    name: "precedence:approval-beats-blocked",
    state: makeState({
      gates: (() => {
        const gates = markDone(
          gatesWith("design", "in_progress"),
          "proposal",
          "discovery",
        );
        gates.design = {
          ...gates.design,
          readiness_blockers: [blocker("ARTIFACT_MISSING", "design")],
        };
        gates.planning = { ...gates.planning, status: "awaiting_approval" };
        return gates;
      })(),
      pendingCheckpoint: true,
    }),
    expect: {
      planKind: "approval-required",
      planPhase: "design",
      planGateId: "design",
      directiveActionKind: "approval",
      snapshotNext: "Next: approval · design",
      gateStatus: { nextGate: "design", canArchive: false },
      recommendation: {
        gateId: "design",
        command: EXPECTED_GATE_COMMAND.design,
      },
    },
  },
  {
    name: "precedence:recovery-beats-approval",
    state: makeState({
      gates: markDone(
        gatesWith("execution", "stuck", { stuck_reason: POISONED_REASON }),
        "proposal",
        "discovery",
        "design",
        "planning",
      ),
      pendingCheckpoint: true,
    }),
    expect: {
      planKind: "recovery-required",
      planPhase: "execution",
      planGateId: "execution",
      directiveActionKind: "recovery",
      snapshotNext: "Next: recovery · execution",
      gateStatus: { nextGate: "execution", canArchive: false },
      recommendation: {
        gateId: "execution",
        command: EXPECTED_GATE_COMMAND.execution,
      },
    },
  },
  {
    name: "precedence:terminal-beats-all",
    state: makeState({
      gates: (() => {
        const gates = markDone(
          gatesWith("design", "in_progress"),
          "proposal",
          "discovery",
        );
        gates.design = {
          ...gates.design,
          readiness_blockers: [blocker("ARTIFACT_MISSING", "design")],
        };
        gates.planning = { ...gates.planning, status: "awaiting_approval" };
        return gates;
      })(),
      pendingCheckpoint: true,
      status: "archived",
      lifecycleState: "archived",
    }),
    expect: {
      planKind: "terminal",
      planPhase: "archived",
      directiveActionKind: "archived",
      snapshotNext: "Next: archived",
      // Terminal action carries no gate; gate status falls back to the first
      // incomplete gate pointer without a command route.
      gateStatus: { nextGate: "design", canArchive: false },
      recommendation: undefined,
    },
  },
  {
    name: "archived",
    state: makeState({
      status: "archived",
      lifecycleState: "archived",
      gates: allDone(),
    }),
    expect: {
      planKind: "terminal",
      planPhase: "archived",
      directiveActionKind: "archived",
      snapshotNext: "Next: archived",
      gateStatus: { nextGate: null, canArchive: true },
      recommendation: undefined,
    },
  },
  {
    name: "closed",
    state: makeState({ status: "closed", gates: allDone() }),
    expect: {
      planKind: "terminal",
      planPhase: "archived",
      directiveActionKind: "archived",
      snapshotNext: "Next: archived",
      gateStatus: { nextGate: null, canArchive: true },
      recommendation: undefined,
    },
  },
  {
    name: "malformed",
    state: makeState({ gates: {} as Gates }),
    expect: {
      planKind: "degraded",
      // No directive is derivable: snapshot omits Next, no recommendation,
      // and the row is excluded from the adv_gate_status table.
    },
  },
];
