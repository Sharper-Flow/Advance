/**
 * Workflow Directive — derive-on-read authoritative execution directive.
 *
 * Mirrors the canonical pure-derivation pattern from `./buckets.ts`:
 *   - `directiveCtxFromState(state, epoch)` bridges `ChangeWorkflowState` into
 *     a plain `DirectiveContext`.
 *   - `deriveWorkflowDirective(state, epoch)` builds a single authoritative
 *     `WorkflowDirective` from durable workflow state.
 *
 * No persistence, no caching, no `defineUpdate`. Equal (state, epoch) inputs
 * produce structurally equal output (referentially transparent).
 *
 * Workflow-safe: imports from `../types` and `../temporal/*` (and `./buckets`,
 * which is itself workflow-safe) only. No tools, storage, manifest, or node:
 * imports.
 */

import type { GateId, GateReadinessBlocker, Gates } from "../types";
import { GATE_ORDER, allGatesSatisfied } from "../types";
import type {
  LightweightProfileOmissionPolicy,
  LightweightProfileResult,
} from "../types/lightweight-change-profile";
import type { ChangeWorkflowState } from "../temporal/contracts";
import { isPrecisePoisonedHistoryEvidence } from "../temporal/recovery-classification";
import type { Bucket } from "./buckets";
import { bucketCtxFromState, deriveBucket } from "./buckets";

// =============================================================================
// Manifest-owned gate → primary command mapping
// =============================================================================
//
// Mirrors `getCommandsByGate(gate)[0].name` from `../manifest.ts`. The manifest
// is NOT workflow-safe to import, so the canonical ownership is mirrored here
// and kept in sync with the `gate` field on each `CommandDef`:
//   proposal   → adv-proposal
//   discovery  → adv-discover
//   design     → adv-design
//   planning   → adv-prep
//   execution  → adv-apply
//   acceptance → adv-review
//   release    → adv-archive   (adv-harden owns no gate; archive is release owner)
export const GATE_COMMAND: Record<GateId, string> = {
  proposal: "adv-proposal",
  discovery: "adv-discover",
  design: "adv-design",
  planning: "adv-prep",
  execution: "adv-apply",
  acceptance: "adv-review",
  release: "adv-archive",
};

// =============================================================================
// Public types
// =============================================================================

export type DirectiveActionKind =
  | "continue"
  | "approval"
  | "recovery"
  | "blocked"
  | "archived"
  | "never_started";

export interface DirectiveAction {
  kind: DirectiveActionKind;
  gateId?: GateId;
  command?: string;
  checkpoint?: string;
}

export interface DirectiveRecovery {
  reason: "poisoned_history" | "missing_workflow" | "unknown";
  description: string;
}

export type DirectiveGateStatus =
  | "pending"
  | "done"
  | "in_progress"
  | "awaiting_approval"
  | "stuck";

export interface WorkflowDirective {
  changeId: string;
  phase: GateId | "done" | "archived";
  gateStatus: Record<GateId, DirectiveGateStatus>;
  action: DirectiveAction;
  approvalPending: boolean;
  recovery?: DirectiveRecovery;
  blockers: GateReadinessBlocker[];
  canArchive: boolean;
  bucket: Bucket;
  /**
   * Lightweight change profile routing info. Undefined when the change has
   * not requested a lightweight profile.
   */
  lightweightProfile?: {
    result: LightweightProfileResult;
    omissionPolicy: LightweightProfileOmissionPolicy;
    evaluatedAt?: string;
    downgradeReason?: string;
  };
}

// =============================================================================
// Context bridge
// =============================================================================

export interface DirectiveContext {
  changeId: string;
  isArchived: boolean;
  firstOpenGate: GateId | undefined;
  canArchive: boolean;
  noGatesStarted: boolean;
  approvalPending: boolean;
  gateStatus: Record<GateId, DirectiveGateStatus>;
  blockers: GateReadinessBlocker[];
  bucket: Bucket;
  recovery?: DirectiveRecovery;
  lightweightProfile?: WorkflowDirective["lightweightProfile"];
}

function gateStatusRecord(gates: Gates): Record<GateId, DirectiveGateStatus> {
  const out = {} as Record<GateId, DirectiveGateStatus>;
  for (const id of GATE_ORDER) {
    out[id] = gates[id].status as DirectiveGateStatus;
  }
  return out;
}

function synthesizeStuckBlocker(
  gateId: GateId,
  reason: string | undefined,
): GateReadinessBlocker {
  return {
    code: "GATE_STUCK",
    gateId,
    message: reason
      ? `Gate ${gateId} is stuck: ${reason}`
      : `Gate ${gateId} is stuck`,
    remediation: `Run /adv-recover or resolve the blocker on gate ${gateId}`,
  };
}

function collectBlockers(state: ChangeWorkflowState): GateReadinessBlocker[] {
  const blockers: GateReadinessBlocker[] = [];
  for (const id of GATE_ORDER) {
    const gate = state.gates[id];
    if (gate.readiness_blockers && gate.readiness_blockers.length > 0) {
      blockers.push(...gate.readiness_blockers);
    }
    // A stuck gate that is NOT already explained by poisoned-history recovery
    // is surfaced as a structural blocker so the directive routes to `blocked`.
    if (
      gate.status === "stuck" &&
      !isPrecisePoisonedHistoryEvidence(gate.stuck_reason ?? "")
    ) {
      blockers.push(synthesizeStuckBlocker(id, gate.stuck_reason));
    }
  }
  return blockers;
}

function deriveRecovery(
  state: ChangeWorkflowState,
): DirectiveRecovery | undefined {
  // 1) Recent poisoned-history evidence from rejected signals (most precise).
  for (const rej of state.signal_rejections ?? []) {
    const text = `${rej.errorClass} ${rej.errorMessage}`;
    if (isPrecisePoisonedHistoryEvidence(text)) {
      return {
        reason: "poisoned_history",
        description: `Signal rejection indicates poisoned history: ${rej.errorClass}`,
      };
    }
  }

  // 2) Per-gate evidence: stuck reason or recovery audit.
  for (const id of GATE_ORDER) {
    const gate = state.gates[id];
    if (gate.status === "stuck" && gate.stuck_reason) {
      if (isPrecisePoisonedHistoryEvidence(gate.stuck_reason)) {
        return {
          reason: "poisoned_history",
          description: `Gate ${id} stuck with poisoned-history evidence`,
        };
      }
    }
    if (gate.recovery_audit) {
      const reasonText = `${gate.recovery_audit.reason} ${gate.recovery_audit.evidence}`;
      if (isPrecisePoisonedHistoryEvidence(reasonText)) {
        return {
          reason: "poisoned_history",
          description: `Gate ${id} carries poisoned-history recovery audit`,
        };
      }
      // Recovery audit present but unclassifiable → safe unknown recovery.
      return {
        reason: "unknown",
        description: `Gate ${id} carries an unclassified recovery audit`,
      };
    }
  }

  // 3) Terminated workflow whose change is not in a terminal state → the
  //    durable workflow is gone/unreachable while the change is still open.
  if (state.terminated === true && !isTerminalStatus(state.status)) {
    return {
      reason: "missing_workflow",
      description:
        "Workflow terminated while change is still active (workflow unreachable)",
    };
  }

  return undefined;
}

function isTerminalStatus(status: ChangeWorkflowState["status"]): boolean {
  return status === "archived" || status === "closed";
}

function deriveLightweightProfile(
  state: ChangeWorkflowState,
): WorkflowDirective["lightweightProfile"] {
  const profile = state.lightweight_profile;
  if (!profile) return undefined;
  const latest = profile.evaluations[profile.evaluations.length - 1];
  if (!latest) return undefined;

  // A completed gate is durable evidence that its adjacent profile boundary
  // must have been revalidated. If collection, service, or signal delivery
  // failed after the gate transition, a prior qualification must not keep
  // advisory omissions active merely because it remains the latest profile
  // evaluation. Derive the fail-closed suppression from durable gate state so
  // it survives reads, retries, and host-process restarts.
  const requiredPhase =
    state.gates.execution.status === "done"
      ? "acceptance_boundary"
      : state.gates.planning.status === "done"
        ? "execution_boundary"
        : undefined;
  if (requiredPhase && latest.phase !== requiredPhase) {
    return {
      result: "ineligible",
      omissionPolicy: profile.omissionPolicy,
      downgradeReason: `${requiredPhase} revalidation is missing after its gate boundary`,
    };
  }

  return {
    result: latest.result,
    omissionPolicy: profile.omissionPolicy,
    evaluatedAt: latest.evaluatedAt,
    downgradeReason: latest.downgradeReason,
  };
}

export function directiveCtxFromState(
  state: ChangeWorkflowState,
  epoch: number,
): DirectiveContext {
  const firstOpenGate = GATE_ORDER.find(
    (gateId) => state.gates[gateId].status !== "done",
  );
  const canArchive = allGatesSatisfied(state.gates);
  const noGatesStarted = GATE_ORDER.every(
    (gateId) => state.gates[gateId].status === "pending",
  );

  return {
    changeId: state.changeId,
    // Terminal statuses (`archived` and `closed`) share the safe archived
    // directive so a closed change with all gates done does NOT route to a
    // confusing `continue(release, adv-archive)` next-action.
    isArchived: isTerminalStatus(state.status),
    firstOpenGate,
    canArchive,
    noGatesStarted,
    approvalPending: state.pendingCheckpoint === true,
    gateStatus: gateStatusRecord(state.gates),
    blockers: collectBlockers(state),
    bucket: deriveBucket(bucketCtxFromState(state, epoch)),
    recovery: deriveRecovery(state),
    lightweightProfile: deriveLightweightProfile(state),
  };
}

// =============================================================================
// Derivation
// =============================================================================

function commandFor(gateId: GateId): string {
  return GATE_COMMAND[gateId];
}

export function deriveWorkflowDirective(
  state: ChangeWorkflowState,
  epoch: number,
): WorkflowDirective {
  const ctx = directiveCtxFromState(state, epoch);

  // Phase: archived terminal, fully-complete, or the first open gate.
  const phase: WorkflowDirective["phase"] = ctx.isArchived
    ? "archived"
    : ctx.canArchive
      ? "done"
      : (ctx.firstOpenGate ?? "done");

  const action = deriveAction(ctx);

  return {
    changeId: ctx.changeId,
    phase,
    gateStatus: ctx.gateStatus,
    action,
    approvalPending: ctx.approvalPending,
    ...(ctx.recovery ? { recovery: ctx.recovery } : {}),
    blockers: ctx.blockers,
    canArchive: ctx.canArchive,
    bucket: ctx.bucket,
    lightweightProfile: ctx.lightweightProfile,
  };
}

/**
 * Best-effort wrapper for tool-layer call sites.
 *
 * `deriveWorkflowDirective` is pure and deterministic over well-formed
 * `ChangeWorkflowState`, but tool handlers read state that may be partially
 * hydrated (disk projections, poisoned-history fallbacks, target-path
 * snapshots). A derivation throw must not break an otherwise-useful tool
 * response (gate completion, gate status, change show/create, status
 * enrichment, recovery handoff). This helper swallows the error and returns
 * `undefined` so callers degrade gracefully: snapshots omit the `Next:` line,
 * and load-bearing reads (gate status, status enrichment) fall back to
 * gate-derived next-action.
 *
 * Intentionally NOT used from `temporal/workflows.ts`: inside the workflow the
 * state is always well-formed and a throw must surface deterministically rather
 * than be masked. Logging is the caller's responsibility — this module stays
 * workflow-safe (no debug-log import, no `node:*`).
 */
export function deriveDirectiveSafe(
  state: ChangeWorkflowState,
  epoch: number,
): WorkflowDirective | undefined {
  try {
    return deriveWorkflowDirective(state, epoch);
  } catch {
    return undefined;
  }
}

function deriveAction(ctx: DirectiveContext): DirectiveAction {
  // Precedence: archived > recovery > approval > blocked > never_started > continue.
  if (ctx.isArchived) {
    return { kind: "archived" };
  }

  if (ctx.recovery) {
    return { kind: "recovery", gateId: ctx.firstOpenGate };
  }

  if (ctx.approvalPending) {
    return {
      kind: "approval",
      gateId: ctx.firstOpenGate,
      ...(ctx.firstOpenGate ? { checkpoint: ctx.firstOpenGate } : {}),
    };
  }

  if (ctx.blockers.length > 0) {
    return { kind: "blocked", gateId: ctx.firstOpenGate };
  }

  // Never started: either nothing has begun, or the bucket classifier says the
  // change is a stale proposal-only change (never_started bucket). Surface the
  // first gate's manifest-owned command so agents see an executable next step
  // (e.g. `Next: proposal → /adv-proposal`) rather than a bare gate label.
  if (ctx.noGatesStarted || ctx.bucket === "never_started") {
    return {
      kind: "never_started",
      ...(ctx.firstOpenGate
        ? { gateId: ctx.firstOpenGate, command: commandFor(ctx.firstOpenGate) }
        : {}),
    };
  }

  // Fully complete → continue into archive (release gate owns adv-archive).
  if (ctx.canArchive) {
    return {
      kind: "continue",
      gateId: "release",
      command: commandFor("release"),
    };
  }

  // Default: proceed to the next gate with its manifest-owned command.
  const next = ctx.firstOpenGate;
  return {
    kind: "continue",
    ...(next ? { gateId: next, command: commandFor(next) } : {}),
  };
}
