/**
 * Workflow Directive — legacy derive-on-read authoritative execution directive.
 *
 * MIGRATION NOTE: the canonical derivation kernel now lives in
 * `./phase-plan`. This module is the lossless legacy adapter: it derives the
 * strict, versioned `PhasePlan` from the shared normalized `DirectiveContext`
 * and adapts it back to the legacy `WorkflowDirective` shape consumed by the
 * `getDirective` query, gate/status enrichment, context snapshots, and
 * recovery handoff. Keeping one canonical derivation prevents directive/plan
 * precedence drift during the migration.
 *
 *   - `directiveCtxFromState(state, epoch)` (re-exported from `./phase-plan`)
 *     bridges `ChangeState` into the shared `DirectiveContext`.
 *   - `deriveWorkflowDirective(state, epoch)` = `directiveCtxFromState` →
 *     `derivePhasePlan` → `directiveFromPlan`.
 *
 * No persistence, no caching, no `defineUpdate`. Equal (state, epoch) inputs
 * produce structurally equal output (referentially transparent).
 *
 * Pure: imports from `../types`, `./buckets`, and `./phase-plan` only. No
 * tools, storage, manifest, or `node:` imports.
 */

import type { GateId, GateReadinessBlocker } from "../types";
import type { ChangeState } from "../types/change-state";
import type { Bucket } from "./buckets";
import type {
  DirectiveContext,
  DirectiveLightweightProfile,
  PhasePlan,
  PlanRecovery,
} from "./phase-plan";
import { derivePhasePlan, directiveCtxFromState } from "./phase-plan";

// =============================================================================
// Compatibility re-exports
// =============================================================================
//
// The normalized derivation kernel moved to `./phase-plan`. Re-export the
// kernel surface so existing consumers of this module keep working unchanged.

export { directiveCtxFromState, GATE_COMMAND } from "./phase-plan";
export type { DirectiveContext, DirectiveGateStatus } from "./phase-plan";

// =============================================================================
// Public types (legacy directive surface)
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

export type DirectiveRecovery = PlanRecovery;

export interface WorkflowDirective {
  changeId: string;
  phase: GateId | "done" | "archived";
  gateStatus: DirectiveContext["gateStatus"];
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
  lightweightProfile?: DirectiveLightweightProfile;
}

// =============================================================================
// Plan → legacy directive adapter
// =============================================================================

function actionFromPlan(
  plan: Exclude<PhasePlan, { kind: "degraded" }>,
): DirectiveAction {
  switch (plan.kind) {
    case "terminal":
      return { kind: "archived" };
    case "recovery-required":
      return {
        kind: "recovery",
        ...(plan.gateId ? { gateId: plan.gateId } : {}),
      };
    case "approval-required":
      return {
        kind: "approval",
        ...(plan.gateId ? { gateId: plan.gateId } : {}),
        ...(plan.checkpoint ? { checkpoint: plan.checkpoint } : {}),
      };
    case "blocked":
      return {
        kind: "blocked",
        ...(plan.gateId ? { gateId: plan.gateId } : {}),
      };
    case "actionable":
      // The plan's `initial` flag preserves the legacy never_started vs
      // continue distinction losslessly.
      return plan.initial
        ? { kind: "never_started", gateId: plan.gateId, command: plan.command }
        : { kind: "continue", gateId: plan.gateId, command: plan.command };
  }
}

/**
 * Lossless adapter from the canonical plan back to the legacy directive
 * shape. The action decision comes entirely from the plan; state-projection
 * fields (gateStatus, blockers, bucket, canArchive, approvalPending) come
 * from the same normalized context the plan was derived from.
 *
 * A degraded plan is non-authorizing and has no legacy directive equivalent;
 * adapting it throws. Tool-layer callers that may see degraded plans should
 * consume the plan directly instead of adapting.
 */
export function directiveFromPlan(
  plan: PhasePlan,
  ctx: DirectiveContext,
): WorkflowDirective {
  if (plan.kind === "degraded") {
    throw new Error(
      `cannot adapt degraded phase plan to a legacy directive: ${plan.diagnostics}`,
    );
  }
  return {
    changeId: ctx.changeId,
    phase: plan.phase,
    gateStatus: ctx.gateStatus,
    action: actionFromPlan(plan),
    approvalPending: ctx.approvalPending,
    ...(ctx.recovery ? { recovery: ctx.recovery } : {}),
    blockers: ctx.blockers,
    canArchive: ctx.canArchive,
    bucket: ctx.bucket,
    lightweightProfile: ctx.lightweightProfile,
  };
}

// =============================================================================
// Derivation (canonical plan → legacy adapter)
// =============================================================================

export function deriveWorkflowDirective(
  state: ChangeState,
  epoch: number,
): WorkflowDirective {
  const ctx = directiveCtxFromState(state, epoch);
  return directiveFromPlan(derivePhasePlan(ctx), ctx);
}

/**
 * Best-effort wrapper for tool-layer call sites.
 *
 * `deriveWorkflowDirective` is pure and deterministic over well-formed
 * `ChangeState`, but tool handlers read state that may be partially
 * hydrated (disk projections, poisoned-history fallbacks, target-path
 * snapshots). A derivation throw must not break an otherwise-useful tool
 * response (gate completion, gate status, change show/create, status
 * enrichment, recovery handoff). This helper swallows the error and returns
 * `undefined` so callers degrade gracefully: snapshots omit the `Next:` line,
 * and load-bearing reads (gate status, status enrichment) fall back to
 * gate-derived next-action.
 *
 * Logging is the caller's responsibility — this module stays pure (no
 * debug-log import, no `node:`).
 */
export function deriveDirectiveSafe(
  state: ChangeState,
  epoch: number,
): WorkflowDirective | undefined {
  try {
    return deriveWorkflowDirective(state, epoch);
  } catch {
    return undefined;
  }
}
