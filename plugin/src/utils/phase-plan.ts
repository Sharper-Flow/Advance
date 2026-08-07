/**
 * Phase Plan — canonical, versioned, derive-on-read current-action plan.
 *
 * This module is the canonical derivation kernel for ADV orchestration reads:
 *   - `directiveCtxFromState(state, epoch)` bridges durable
 *     `ChangeState` into the shared normalized `DirectiveContext`.
 *   - `derivePhasePlan(ctx)` produces the strict, versioned `PhasePlan`
 *     discriminated union: actionable, approval-required, blocked,
 *     recovery-required, terminal, or degraded (exactly one current state).
 *   - `parsePhasePlan` is the strict boundary validator: malformed or
 *     unsupported payloads fail parsing instead of falling through to a
 *     command.
 *
 * The legacy `WorkflowDirective` surface in `./workflow-directive` is a
 * lossless adapter over this canonical plan during migration; both derive
 * from the same normalized `DirectiveContext`, so precedence can never drift.
 *
 * Contract anchors: SC1, SC3, AC1–AC5, C1–C3, DONT1–DONT2, DDC1–DDC3.
 *
 * Invariants:
 *   - Read-only: no persistence, no caching, no signals, no `defineUpdate`.
 *     Equal (state, epoch) inputs produce structurally equal output.
 *   - Read-safe: imports from `../types` and `./buckets` only. No tools, storage,
 *     manifest, or `node:` imports.
 *   - Bounded: actionable plans carry at most `PHASE_PLAN_MAX_EVIDENCE` (12)
 *     evidence entries and `PHASE_PLAN_MAX_GUIDANCE` (3) guidance snippets,
 *     enforced both by the derivation and the schema.
 *   - Non-authorizing variants carry stable provenance and
 *     `failClosed: true`; only `actionable` carries a command.
 */

import { z } from "zod";

import type { GateId, GateReadinessBlocker, Gates } from "../types";
import {
  allGatesSatisfied,
  GATE_ORDER,
  GateIdSchema,
  GateReadinessBlockerSchema,
} from "../types";
import type { ChangeState } from "../types/change-state";
import type { Bucket } from "./buckets";
import { bucketCtxFromState, deriveBucket } from "./buckets";
import type {
  LightweightProfileOmissionPolicy,
  LightweightProfileResult,
} from "../types/lightweight-change-profile";

// =============================================================================
// Version and bounds
// =============================================================================

export const PHASE_PLAN_VERSION = 1;

/** AC5/DDC2 caps: at most 12 evidence entries and 3 guidance snippets. */
export const PHASE_PLAN_MAX_EVIDENCE = 12;
export const PHASE_PLAN_MAX_GUIDANCE = 3;

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
// Shared normalized derivation kernel
// =============================================================================
//
// `DirectiveContext` is the single normalized input for both the canonical
// plan derivation and the legacy directive adapter. It is derived on read
// from durable workflow state; it is never persisted as a second state
// machine (DONT2) and never inferred from agent prose (DONT1).

export type DirectiveGateStatus =
  | "pending"
  | "done"
  | "in_progress"
  | "awaiting_approval"
  | "stuck";

export const PlanRecoverySchema = z
  .object({
    reason: z.enum(["poisoned_history", "missing_workflow", "unknown"]),
    description: z.string().min(1),
  })
  .strict();
export type PlanRecovery = z.infer<typeof PlanRecoverySchema>;

export interface DirectiveLightweightProfile {
  result: LightweightProfileResult;
  omissionPolicy: LightweightProfileOmissionPolicy;
  evaluatedAt?: string;
  downgradeReason?: string;
}

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
  recovery?: PlanRecovery;
  lightweightProfile?: DirectiveLightweightProfile;
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

function collectBlockers(state: ChangeState): GateReadinessBlocker[] {
  const blockers: GateReadinessBlocker[] = [];
  for (const id of GATE_ORDER) {
    const gate = state.gates[id];
    if (gate.readiness_blockers && gate.readiness_blockers.length > 0) {
      blockers.push(...gate.readiness_blockers);
    }
    if (gate.status === "stuck") {
      blockers.push(synthesizeStuckBlocker(id, gate.stuck_reason));
    }
  }
  return blockers;
}

function deriveRecovery(state: ChangeState): PlanRecovery | undefined {
  // Per-gate audited evidence remains readable on disk.
  for (const id of GATE_ORDER) {
    const gate = state.gates[id];
    if (gate.status === "stuck" && gate.stuck_reason) {
      continue;
    }
    if (gate.recovery_audit) {
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

function isTerminalStatus(status: ChangeState["status"]): boolean {
  return status === "archived" || status === "closed";
}

function deriveLightweightProfile(
  state: ChangeState,
): DirectiveLightweightProfile | undefined {
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
  state: ChangeState,
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
    // Terminal statuses (`archived` and `closed`) share the safe terminal
    // plan so a closed change with all gates done does NOT route to a
    // confusing `actionable(release, adv-archive)` next-action.
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
// Phase plan contract (strict, versioned)
// =============================================================================

const BucketSchema = z.enum([
  "awaiting_approval",
  "in_flight",
  "stuck",
  "drifting",
  "ready_to_archive",
  "never_started",
]);

// Compile-time drift guard: BucketSchema must stay exactly aligned with the
// `Bucket` union in ./buckets (plain TS, no schema there).
type AssertExact<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : never
  : never;
const assertBucketSync: AssertExact<
  z.infer<typeof BucketSchema>,
  Bucket
> = true;
void assertBucketSync;

export const PhasePlanDegradedReasonSchema = z.enum([
  "missing_state",
  "conflicting_state",
  "unsupported_state",
  "derivation_error",
]);
export type PhasePlanDegradedReason = z.infer<
  typeof PhasePlanDegradedReasonSchema
>;

export const PhasePlanProvenanceSchema = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("canonical"),
      bucket: BucketSchema,
    })
    .strict(),
  z
    .object({
      source: z.literal("degraded"),
      reason: PhasePlanDegradedReasonSchema,
      diagnostics: z.string(),
    })
    .strict(),
]);
export type PhasePlanProvenance = z.infer<typeof PhasePlanProvenanceSchema>;

export const PhasePlanPhaseSchema = z.union([
  GateIdSchema,
  z.literal("done"),
  z.literal("archived"),
]);
export type PhasePlanPhase = z.infer<typeof PhasePlanPhaseSchema>;

const planBaseFields = {
  version: z.literal(PHASE_PLAN_VERSION),
  changeId: z.string().min(1),
  phase: PhasePlanPhaseSchema,
  provenance: PhasePlanProvenanceSchema,
};

export const PhaseDirectiveSchema = z
  .object({
    kind: z.literal("phase_directive"),
    command: z.enum(["adv-review"]),
    content: z.string().min(1),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export type PhaseDirective = z.infer<typeof PhaseDirectiveSchema>;

export const ActionablePhasePlanSchema = z
  .object({
    ...planBaseFields,
    kind: z.literal("actionable"),
    failClosed: z.literal(false),
    gateId: GateIdSchema,
    command: z.string().min(1),
    /** True when the change has never started (initial gate open). */
    initial: z.boolean(),
    evidence: z.array(z.string().min(1)).max(PHASE_PLAN_MAX_EVIDENCE),
    guidance: z.array(z.string().min(1)).max(PHASE_PLAN_MAX_GUIDANCE),
    directive: PhaseDirectiveSchema.optional(),
  })
  .strict();
export type ActionablePhasePlan = z.infer<typeof ActionablePhasePlanSchema>;

export const ApprovalRequiredPhasePlanSchema = z
  .object({
    ...planBaseFields,
    kind: z.literal("approval-required"),
    failClosed: z.literal(true),
    gateId: GateIdSchema.optional(),
    checkpoint: z.string().min(1).optional(),
  })
  .strict();
export type ApprovalRequiredPhasePlan = z.infer<
  typeof ApprovalRequiredPhasePlanSchema
>;

export const BlockedPhasePlanSchema = z
  .object({
    ...planBaseFields,
    kind: z.literal("blocked"),
    failClosed: z.literal(true),
    gateId: GateIdSchema.optional(),
    blockers: z.array(GateReadinessBlockerSchema),
  })
  .strict();
export type BlockedPhasePlan = z.infer<typeof BlockedPhasePlanSchema>;

export const RecoveryRequiredPhasePlanSchema = z
  .object({
    ...planBaseFields,
    kind: z.literal("recovery-required"),
    failClosed: z.literal(true),
    gateId: GateIdSchema.optional(),
    recovery: PlanRecoverySchema,
  })
  .strict();
export type RecoveryRequiredPhasePlan = z.infer<
  typeof RecoveryRequiredPhasePlanSchema
>;

export const TerminalPhasePlanSchema = z
  .object({
    ...planBaseFields,
    kind: z.literal("terminal"),
    failClosed: z.literal(true),
  })
  .strict();
export type TerminalPhasePlan = z.infer<typeof TerminalPhasePlanSchema>;

export const DegradedPhasePlanSchema = z
  .object({
    version: z.literal(PHASE_PLAN_VERSION),
    changeId: z.string().min(1),
    kind: z.literal("degraded"),
    failClosed: z.literal(true),
    provenance: z
      .object({
        source: z.literal("degraded"),
        reason: PhasePlanDegradedReasonSchema,
        diagnostics: z.string(),
      })
      .strict(),
    reason: PhasePlanDegradedReasonSchema,
    diagnostics: z.string(),
  })
  .strict();
export type DegradedPhasePlan = z.infer<typeof DegradedPhasePlanSchema>;

export const PhasePlanSchema = z.discriminatedUnion("kind", [
  ActionablePhasePlanSchema,
  ApprovalRequiredPhasePlanSchema,
  BlockedPhasePlanSchema,
  RecoveryRequiredPhasePlanSchema,
  TerminalPhasePlanSchema,
  DegradedPhasePlanSchema,
]);
export type PhasePlan = z.infer<typeof PhasePlanSchema>;
export type PhasePlanKind = PhasePlan["kind"];

/**
 * Strict boundary validator (DDC1). Throws a ZodError on malformed or
 * unsupported payloads — an unparseable plan must never fall through to a
 * command.
 */
export function parsePhasePlan(input: unknown): PhasePlan {
  return PhasePlanSchema.parse(input);
}

/** Non-throwing variant for tool-layer readers adapting boundary failures. */
export function safeParsePhasePlan(input: unknown) {
  return PhasePlanSchema.safeParse(input);
}

// =============================================================================
// Derivation
// =============================================================================

function planPhase(ctx: DirectiveContext): PhasePlanPhase {
  // Phase: archived terminal, fully-complete, or the first open gate.
  if (ctx.isArchived) return "archived";
  if (ctx.canArchive) return "done";
  return ctx.firstOpenGate ?? "done";
}

function canonicalProvenance(ctx: DirectiveContext): PhasePlanProvenance {
  return { source: "canonical", bucket: ctx.bucket };
}

function actionableEvidence(ctx: DirectiveContext, gateId: GateId): string[] {
  const evidence: string[] = [];
  for (const id of GATE_ORDER) {
    if (ctx.gateStatus[id] === "done") {
      evidence.push(`gate:${id}:done`);
    }
  }
  evidence.push(`gate:${gateId}:${ctx.gateStatus[gateId]}`);
  evidence.push(`bucket:${ctx.bucket}`);
  return evidence.slice(0, PHASE_PLAN_MAX_EVIDENCE);
}

function actionableGuidance(
  ctx: DirectiveContext,
  gateId: GateId,
  initial: boolean,
): string[] {
  const command = GATE_COMMAND[gateId];
  if (initial) {
    return [`Change ${ctx.changeId} has not started; begin with /${command}`];
  }
  if (ctx.canArchive) {
    return [`All gates satisfied; run /${command} to archive ${ctx.changeId}`];
  }
  return [`Next: ${gateId} → /${command}`];
}

function actionablePlan(
  ctx: DirectiveContext,
  gateId: GateId,
  initial: boolean,
): ActionablePhasePlan {
  return {
    version: PHASE_PLAN_VERSION,
    kind: "actionable",
    changeId: ctx.changeId,
    phase: planPhase(ctx),
    provenance: canonicalProvenance(ctx),
    failClosed: false,
    gateId,
    command: GATE_COMMAND[gateId],
    initial,
    evidence: actionableEvidence(ctx, gateId),
    guidance: actionableGuidance(ctx, gateId, initial),
  };
}

/**
 * Canonical plan derivation. Pure and deterministic over the normalized
 * `DirectiveContext`: equal contexts produce structurally equal plans.
 *
 * Precedence: terminal > recovery-required > approval-required > blocked >
 * initial start > advance. Conflicting normalized state (e.g. no open gate
 * while the change can neither archive nor start) throws; tool-layer callers
 * use `derivePhasePlanSafe` to adapt that into a typed degraded plan.
 */
export function derivePhasePlan(ctx: DirectiveContext): PhasePlan {
  if (ctx.isArchived) {
    return {
      version: PHASE_PLAN_VERSION,
      kind: "terminal",
      changeId: ctx.changeId,
      phase: planPhase(ctx),
      provenance: canonicalProvenance(ctx),
      failClosed: true,
    };
  }

  if (ctx.recovery) {
    return {
      version: PHASE_PLAN_VERSION,
      kind: "recovery-required",
      changeId: ctx.changeId,
      phase: planPhase(ctx),
      provenance: canonicalProvenance(ctx),
      failClosed: true,
      ...(ctx.firstOpenGate ? { gateId: ctx.firstOpenGate } : {}),
      recovery: ctx.recovery,
    };
  }

  if (ctx.approvalPending) {
    return {
      version: PHASE_PLAN_VERSION,
      kind: "approval-required",
      changeId: ctx.changeId,
      phase: planPhase(ctx),
      provenance: canonicalProvenance(ctx),
      failClosed: true,
      ...(ctx.firstOpenGate
        ? { gateId: ctx.firstOpenGate, checkpoint: ctx.firstOpenGate }
        : {}),
    };
  }

  if (ctx.blockers.length > 0) {
    return {
      version: PHASE_PLAN_VERSION,
      kind: "blocked",
      changeId: ctx.changeId,
      phase: planPhase(ctx),
      provenance: canonicalProvenance(ctx),
      failClosed: true,
      ...(ctx.firstOpenGate ? { gateId: ctx.firstOpenGate } : {}),
      blockers: ctx.blockers,
    };
  }

  // Never started: either nothing has begun, or the bucket classifier says
  // the change is a stale proposal-only change (never_started bucket). The
  // plan is actionable with the first gate's manifest-owned command so agents
  // see an executable next step (e.g. `Next: proposal → /adv-proposal`).
  if (ctx.noGatesStarted || ctx.bucket === "never_started") {
    if (!ctx.firstOpenGate) {
      throw new Error(
        "conflicting state: never-started change has no open gate",
      );
    }
    return actionablePlan(ctx, ctx.firstOpenGate, true);
  }

  // Fully complete → actionable archive step (release gate owns adv-archive).
  if (ctx.canArchive) {
    return actionablePlan(ctx, "release", false);
  }

  if (!ctx.firstOpenGate) {
    throw new Error(
      "conflicting state: no open gate and change cannot archive",
    );
  }

  // Default: advance the first open gate with its manifest-owned command.
  return actionablePlan(ctx, ctx.firstOpenGate, false);
}

export function derivePhasePlanFromState(
  state: ChangeState,
  epoch: number,
): PhasePlan {
  return derivePhasePlan(directiveCtxFromState(state, epoch));
}

/**
 * Typed degraded-plan builder for tool-layer readers (AC3). Carries stable
 * provenance, a machine-readable reason, and human diagnostics; it never
 * carries a command and always fails closed.
 */
export function degradedPhasePlan(
  changeId: string,
  reason: PhasePlanDegradedReason,
  diagnostics: string,
): DegradedPhasePlan {
  return {
    version: PHASE_PLAN_VERSION,
    kind: "degraded",
    changeId: changeId || "unknown",
    failClosed: true,
    provenance: { source: "degraded", reason, diagnostics },
    reason,
    diagnostics,
  };
}

/**
 * Best-effort plan derivation for tool-layer call sites.
 *
 * Mirrors the `deriveDirectiveSafe` contract: a derivation throw on partially
 * hydrated or malformed state must not break an otherwise-useful tool
 * response. Instead of swallowing to `undefined`, this wrapper returns a
 * typed, non-authorizing degraded plan with provenance and diagnostics so
 * unavailable authoritative state never becomes an invented next action
 * (SC3/AC3).
 *
 * Logging is the caller's responsibility — this module stays pure (no
 * debug-log import, no `node:*`).
 */
export function derivePhasePlanSafe(
  state: ChangeState,
  epoch: number,
): PhasePlan {
  try {
    return derivePhasePlanFromState(state, epoch);
  } catch (error) {
    const changeId =
      typeof state?.changeId === "string" ? state.changeId : "unknown";
    const diagnostics = error instanceof Error ? error.message : String(error);
    const reason: PhasePlanDegradedReason =
      error instanceof TypeError
        ? "missing_state"
        : diagnostics.startsWith("conflicting state")
          ? "conflicting_state"
          : "derivation_error";
    return degradedPhasePlan(changeId, reason, diagnostics);
  }
}
