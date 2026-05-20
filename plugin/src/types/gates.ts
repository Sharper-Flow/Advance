/**
 * Gates Domain Types
 *
 * GateDef, GateId, GateCompletion, Gates, helper functions.
 * Single source of truth for the 7-gate model.
 */

import { z } from "zod";

// =============================================================================
// Quality Gates
// =============================================================================

/**
 * Gate definition — single source of truth for all gate metadata.
 * Add/remove/reorder gates here; all derived artifacts follow automatically.
 */
interface GateDef {
  /** Unique gate identifier (used as JSON key, schema enum value, etc.) */
  id: string;
  /** Human-readable description */
  description: string;
}

/**
 * GATE_DEFS — the canonical, ordered list of gates.
 * Everything else (GateIdSchema, GATE_ORDER, GatesSchema, createDefaultGates)
 * is derived from this array.
 *
 * To change the gate model: edit this array only.
 */
export const GATE_DEFS: readonly GateDef[] = [
  {
    id: "proposal",
    description: "Proposal: Problem statement confirmed via /adv-proposal",
  },
  {
    id: "discovery",
    description:
      "Discovery: Context gathered, objectives agreed via /adv-discover",
  },
  {
    id: "design",
    description: "Design: Architecture decisions validated via /adv-design",
  },
  {
    id: "planning",
    description: "Planning: Task graph synthesized via /adv-prep",
  },
  {
    id: "execution",
    description: "Execution: Deliverables produced via /adv-apply",
  },
  {
    id: "acceptance",
    description: "Acceptance: User accepts deliverables via /adv-review",
  },
  {
    id: "release",
    description:
      "Release: Final quality pass and archive via /adv-harden + /adv-archive",
  },
] as const;

/** Gate IDs derived from GATE_DEFS */
const GATE_IDS = GATE_DEFS.map((g) => g.id) as [string, ...string[]];

/**
 * Gate ID schema — Zod enum derived from GATE_DEFS.
 */
export const GateIdSchema = z.enum(GATE_IDS);

export type GateId = z.infer<typeof GateIdSchema>;

export const GateArtifactKindSchema = z.enum([
  "proposal",
  "agreement",
  "design",
  "acceptance",
]);

export type GateArtifactKind = z.infer<typeof GateArtifactKindSchema>;

export const GateArtifactEvidenceSchema = z.object({
  kind: GateArtifactKindSchema,
  path: z.string().optional(),
  content_hash: z.string().optional(),
  non_whitespace_chars: z.number().int().nonnegative().optional(),
  checked_at: z.string(),
  compatibility_reason: z.string().optional(),
});

export type GateArtifactEvidence = z.infer<typeof GateArtifactEvidenceSchema>;

export const GateReadinessBlockerSchema = z.object({
  code: z.string(),
  gateId: GateIdSchema,
  message: z.string(),
  remediation: z.string(),
  blockingGateId: GateIdSchema.optional(),
  artifactKind: GateArtifactKindSchema.optional(),
  contractId: z.string().optional(),
});

export type GateReadinessBlocker = z.infer<typeof GateReadinessBlockerSchema>;

/**
 * Ordered list of gate IDs for sequence enforcement.
 * Derived from GATE_DEFS order.
 */
export const GATE_ORDER: GateId[] = GATE_DEFS.map((g) => g.id) as GateId[];

/**
 * Gate status values.
 * - pending: Not yet started
 * - in_progress: Agent is actively working this gate
 * - awaiting_approval: Gate output is ready and waiting for user approval
 * - stuck: Gate cannot progress without recovery
 * - done: Completed with timestamp + actor evidence
 */
const GateStatusSchema = z.enum([
  "pending",
  "in_progress",
  "awaiting_approval",
  "stuck",
  "done",
]);

type _GateStatus = z.infer<typeof GateStatusSchema>;

/**
 * Single gate completion record.
 * Tracks who completed the gate and when.
 */
export const GateCompletionSchema = z.object({
  /** Current status of this gate */
  status: GateStatusSchema.default("pending" as const),
  /** ISO8601 timestamp when gate was completed */
  completed_at: z.string().optional(),
  /** Who completed the gate (user, agent, migration) */
  completed_by: z.string().optional(),
  /** Key decisions or context captured at gate completion */
  notes: z.string().optional(),
  /** Evidence shown while waiting for user approval */
  approval_evidence: z.string().optional(),
  /** Human-readable reason when gate is stuck */
  stuck_reason: z.string().optional(),
  /** Machine-readable blockers recorded when workflow readiness rejects completion */
  readiness_blockers: z.array(GateReadinessBlockerSchema).optional(),
  /** ISO8601 timestamp when current non-pending state began */
  started_at: z.string().optional(),
  /** Who triggered or owns the current gate state */
  triggered_by: z.string().optional(),
  /** Original gate ID before migration (audit trail for gate renames) */
  migrated_from: z.string().optional(),
  /** Additional old gate completions absorbed into this gate during migration */
  absorbed_completions: z
    .array(
      z.object({
        gate_id: z.string(),
        status: GateStatusSchema,
        completed_at: z.string().optional(),
        completed_by: z.string().optional(),
      }),
    )
    .optional(),
  /** Artifact evidence validated by the workflow before gate completion */
  artifact_evidence: GateArtifactEvidenceSchema.optional(),
});

export type GateCompletion = z.infer<typeof GateCompletionSchema>;

/**
 * Full gates object — one field per GATE_DEFS entry.
 * Derived from GATE_DEFS so adding/removing a gate propagates automatically.
 */
export const GatesSchema = z.object(
  Object.fromEntries(
    GATE_DEFS.map((g) => [
      g.id,
      GateCompletionSchema.default({ status: "pending" as const }),
    ]),
  ) as Record<string, ReturnType<typeof GateCompletionSchema.default>>,
);

export type Gates = z.infer<typeof GatesSchema>;

/**
 * Check if a gate is "satisfied" (done or legacy).
 * Legacy gates count as satisfied for sequence enforcement.
 */
export const isGateSatisfied = (gate: GateCompletion): boolean => {
  return gate.status === "done";
};

/**
 * Check if a gate can be completed (previous gate must be satisfied).
 * @param gates - Current gates state
 * @param gateId - Gate to check
 * @returns true if the gate can be completed
 */
export const canCompleteGate = (gates: Gates, gateId: GateId): boolean => {
  const idx = GATE_ORDER.indexOf(gateId);
  if (idx === 0) return true; // First gate can always be completed

  // Check all previous gates are satisfied
  for (let i = 0; i < idx; i++) {
    const prevGateId = GATE_ORDER[i];
    if (!isGateSatisfied(gates[prevGateId])) {
      return false;
    }
  }
  return true;
};

/**
 * Get list of incomplete gates (not done or legacy).
 */
export const getIncompleteGates = (gates: Gates): GateId[] => {
  return GATE_ORDER.filter((gateId) => !isGateSatisfied(gates[gateId]));
};

/**
 * Check if all gates are satisfied (can archive/complete).
 */
export const allGatesSatisfied = (gates: Gates): boolean => {
  return GATE_ORDER.every((gateId) => isGateSatisfied(gates[gateId]));
};

/**
 * Create default gates object with all gates pending.
 * Derived from GATE_DEFS — adding a gate here is automatic.
 */
export const createDefaultGates = (): Gates =>
  Object.fromEntries(
    GATE_DEFS.map((g) => [g.id, { status: "pending" as const }]),
  ) as Gates;
