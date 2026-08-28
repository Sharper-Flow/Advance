/**
 * Changes Domain Types
 *
 * ValidationResult (private), ChangeStatus, ChangeListStatusFilter,
 * ChangeClosure, BulkClose, ReentryHistory, ClarifyFindingSnapshot,
 * CrossProjectOrigin, CrossProjectLink, ExternalDependency, FastFollowOf,
 * Change.
 *
 * Imports TaskSchema (./tasks), DeltaSchema (./specs), WisdomEntrySchema
 * (./wisdom), GatesSchema/GateIdSchema (./gates).
 */

import { z } from "zod";
import { ContractEvidencePolicySchema } from "./evidence-policy";
import { TaskSchema } from "./tasks";
import {
  DesignConcernDispositionSchema,
  ReportFollowUpRefSchema,
  ScopedSubagentReportSchema,
  VerificationEvidenceDispositionSchema,
} from "./subagent-reports";
import { DeltaSchema } from "./specs";
import { WisdomEntrySchema } from "./wisdom";
import { GatesSchema, GateIdSchema, GateRecoveryAuditSchema } from "./gates";
import { AcceptanceCriteriaSnapshotSchema } from "./gates";
import { EpicMembershipSchema } from "./epics";
import { LightweightChangeProfileSchema } from "./lightweight-change-profile";
import { ArchiveProjectionProofReceiptSchema } from "./archive-projection";
import { WorkNodeRefSchema } from "./work-graph";
export {
  ContractEvidencePolicySchema,
  type ContractEvidencePolicy,
} from "./evidence-policy";

// =============================================================================
// Coordination Claims
// =============================================================================

/**
 * Typed coordination claim: lightweight, agent-authored scope ownership
 * projection stored on the change workflow. No separate store — the claim is
 * authoritative only on open lifecycle + running workflow.
 */
export const ChangeCoordinationClaimResponsibilitySchema = z.enum([
  "owner",
  "reviewer",
  "stakeholder",
  "observer",
]);

export type ChangeCoordinationClaimResponsibility = z.infer<
  typeof ChangeCoordinationClaimResponsibilitySchema
>;

const ChangeCoordinationClaimIdentifierSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9_-]+$/,
    "Invalid identifier: only lowercase letters, numbers, hyphens, and underscores are allowed",
  );

export const ChangeCoordinationClaimSchema = z.object({
  scope_summary: z.string().trim().min(1).max(200),
  responsibility: ChangeCoordinationClaimResponsibilitySchema,
  exact_identifiers: z
    .array(ChangeCoordinationClaimIdentifierSchema)
    .max(20)
    .transform((arr) => [...new Set(arr)]),
  generated_terms: z
    .array(ChangeCoordinationClaimIdentifierSchema)
    .max(20)
    .transform((arr) => [...new Set(arr)]),
  claimed_at: z.string(),
  claimed_by: z.string().optional(),
});

export type ChangeCoordinationClaim = z.infer<
  typeof ChangeCoordinationClaimSchema
>;

// =============================================================================
// Validation Result (private — used only by ChangeSchema)
// =============================================================================

const ValidationErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

type _ValidationError = z.infer<typeof ValidationErrorSchema>;

const ValidationWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
});

type _ValidationWarning = z.infer<typeof ValidationWarningSchema>;

const ValidationResultSchema = z.object({
  checked_against_specs: z.array(z.string()),
  conflicts: z.array(ValidationErrorSchema),
  warnings: z.array(ValidationWarningSchema),
  validated_at: z.string().optional(),
});

type _ValidationResult = z.infer<typeof ValidationResultSchema>;

// =============================================================================
// Change Status
// =============================================================================

export const ChangeStatusSchema = z.enum([
  "draft", // Open — being written or in progress (see AdvLifecycleState for open-claim authority)
  "archived", // Completed and promoted
  "closed", // Retired without completion
]);

export type ChangeStatus = z.infer<typeof ChangeStatusSchema>;

/**
 * Normalize legacy stored change statuses to the modern draft-only open set.
 *
 * `active` and `pending` were historically stored on change records, but no
 * code path writes them anymore — open changes are `draft` and open-claim
 * authority lives in `AdvLifecycleState` (see fixChangeStatusHonesty design).
 * Legacy or poisoned disk/seed state must still load (C4), so both values
 * map to `"draft"`. Any other value passes through unchanged so schema
 * validation can still reject genuine garbage.
 *
 * Applied at the change-record load path (storage/json.ts, before
 * `ChangeSchema.parse`) and at workflow-seed boundaries
 * (changeSeedStateFromChange + changeWorkflow seed application).
 */
export function normalizeLegacyChangeStatus(status: unknown): unknown {
  if (status === "active" || status === "pending") return "draft";
  return status;
}

export const ChangeLifecycleStateSchema = z.enum([
  "open",
  "archived",
  "closed",
]);

export type ChangeLifecycleState = z.infer<typeof ChangeLifecycleStateSchema>;

/**
 * Filter-only status value for adv_change_list.
 * "in-flight" is a union filter for open changes (draft), not a stored status.
 * "active" and "pending" are never stored on changes; they are rejected with
 * a hint to use "in-flight" (or no status filter) for open changes.
 *
 * The legacy open spellings ("active"/"pending") are union members only so the
 * superRefine below can intercept them with an actionable hint — they always
 * fail validation and are never valid output.
 */
export const ChangeListStatusFilterSchema = z
  .union([
    ChangeStatusSchema,
    z.literal("in-flight"),
    z.literal("active"),
    z.literal("pending"),
  ])
  .superRefine((value, ctx) => {
    if (value === "active" || value === "pending") {
      ctx.addIssue({
        code: "custom",
        message: `"${value}" is never stored on changes. Use "in-flight" (or no status filter) for open changes; "archived"/"closed" for terminal changes.`,
      });
    }
  });

const ChangeClosureReasonSchema = z.enum([
  "cancelled",
  "superseded",
  "not_planned",
]);

type _ChangeClosureReason = z.infer<typeof ChangeClosureReasonSchema>;

export const ChangeClosureSchema = z.object({
  reason: ChangeClosureReasonSchema,
  approved_by_user: z.literal(true),
  approval_evidence: z.string(),
  superseded_by: z.string().optional(),
  approved_at: z.string(),
  operation_id: z.string().min(1).optional(),
  /** Canonical payload hash for close-command idempotency. */
  payload_hash: z.string().min(1).optional(),
});

export type ChangeClosure = z.infer<typeof ChangeClosureSchema>;

// =============================================================================
// Bulk Close
// =============================================================================

export const BulkCloseExplicitSelectorSchema = z.object({
  kind: z.literal("explicit"),
  changeIds: z.array(z.string()).min(1),
});

export const BulkCloseFilterSelectorSchema = z.object({
  kind: z.literal("filter"),
  filter: z.object({
    status: z.string().optional(),
    titleContains: z.string().optional(),
    prefix: z.string().optional(),
    createdBefore: z.string().optional(),
    lastActivityBefore: z.string().optional(),
  }),
});

export type BulkCloseSelector =
  | z.infer<typeof BulkCloseExplicitSelectorSchema>
  | z.infer<typeof BulkCloseFilterSelectorSchema>;

export const BulkCloseResultSchema = z.object({
  success: z.boolean(),
  closed: z.number(),
  results: z.array(
    z.object({
      changeId: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
      state: z
        .enum(["pending", "prepared", "rejected", "committed", "aborted"])
        .optional(),
    }),
  ),
  message: z.string(),
});

export type BulkCloseResult = z.infer<typeof BulkCloseResultSchema>;

// =============================================================================
// Re-Entry History (Scope Expansion Audit Trail)
// =============================================================================

/**
 * A single re-entry event — recorded when mid-change scope expansion
 * triggers a cascade reopen of gates back through discovery/design/planning.
 *
 * Append-only audit trail: each re-entry is a new entry, never modified.
 */
export const ReentryHistoryEntrySchema = z.object({
  /** Gate to reopen FROM (this gate + all downstream reset to pending) */
  from_gate: GateIdSchema,
  /** Human-readable reason for the re-entry */
  reason: z.string(),
  /** Description of what scope was added/changed (optional) */
  scope_delta: z.string().optional(),
  /** Who triggered the re-entry (agent name, user, command) */
  reopened_by: z.string(),
  /** Optional audit evidence for the re-entry (for example, direct user instruction) */
  approval_evidence: z.string().optional(),
  /** ISO8601 timestamp when the re-entry was triggered */
  reopened_at: z.string(),
  /** Gate IDs that were reset to pending (from_gate + all downstream) */
  gates_reset: z.array(GateIdSchema).nonempty(),
});

export type ReentryHistoryEntry = z.infer<typeof ReentryHistoryEntrySchema>;

// =============================================================================
// Clarify Finding Snapshot
// =============================================================================

/**
 * A persisted snapshot of a clarify finding — enables resolution tracking.
 * Findings are append-only; resolved status is set when the finding is addressed.
 */
export const ClarifyFindingSnapshotSchema = z.object({
  /** Finding code (e.g., CLARIFY_UNCLEAR_SCOPE) */
  code: z.string(),
  /** Severity of the finding */
  severity: z.enum(["error", "warning", "info"]),
  /** Human-readable finding message */
  message: z.string(),
  /** ISO8601 timestamp when this finding was first recorded */
  recorded_at: z.string(),
  /** Whether this finding has been resolved */
  resolved: z.boolean().optional(),
  /** ISO8601 timestamp when this finding was resolved */
  resolved_at: z.string().optional(),
});

export type ClarifyFindingSnapshot = z.infer<
  typeof ClarifyFindingSnapshotSchema
>;

// =============================================================================
// Cross-Project Origin (Follow-up Change Provenance)
// =============================================================================

/**
 * Provenance metadata for changes created from another project.
 * Set when project A creates a follow-up change in project B (e.g. example-product
 * backend creating a follow-up in example-web).
 *
 * rq-opsFollowTrace01: source project/path/change provenance belongs in typed
 * workflow state, not free-text queue entries.
 */
export const CrossProjectOriginSchema = z.object({
  /** Name of the source project that created this follow-up change */
  source_project: z.string(),
  /** Absolute path to the source project repository */
  source_path: z.string(),
  /** Change ID in the source project that triggered this follow-up */
  source_change_id: z.string().optional(),
  /** ISO8601 timestamp when the cross-project link was established */
  linked_at: z.string(),
});

export type CrossProjectOrigin = z.infer<typeof CrossProjectOriginSchema>;

export const CrossProjectLinkRelationshipSchema = z.enum([
  "origin",
  "follow_up",
  "coordinates_with",
  "depends_on",
]);

/**
 * Outbound or inbound coordination link to a change in another project.
 * Links are advisory/provenance metadata; each referenced project remains
 * authoritative for its own change state.
 */
export const CrossProjectLinkSchema = z.object({
  /** Absolute path to the linked project repository root */
  target_path: z.string().min(1),
  /** Stable ADV project ID for the linked repository, when known */
  target_project_id: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .optional(),
  /** Change ID in the linked project */
  changeId: z.string().min(1),
  /** Relationship between this change and the linked change */
  relationship: CrossProjectLinkRelationshipSchema,
  /** ISO8601 timestamp when the link was established */
  linked_at: z.string(),
});

export type CrossProjectLink = z.infer<typeof CrossProjectLinkSchema>;

export const ExternalDependencyRelationshipSchema = z.enum([
  "requires",
  "blocks",
  "coordinates_with",
]);

/**
 * Advisory dependency on a change, gate, or task in another project.
 * V1 dependencies are intentionally non-blocking; unmet dependencies surface
 * warnings/status only and do not block gates or archive.
 */
export const ExternalDependencySchema = z.object({
  /** Absolute path to the dependency project repository root */
  target_path: z.string().min(1),
  /** Stable ADV project ID for the dependency repository, when known */
  target_project_id: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .optional(),
  /** Change ID in the dependency project */
  changeId: z.string().min(1),
  /** Optional gate that the dependency references */
  gate: GateIdSchema.optional(),
  /** Optional task that the dependency references */
  taskId: z.string().min(1).optional(),
  /** How this change relates to the external work */
  relationship: ExternalDependencyRelationshipSchema,
  /** V1 dependencies are advisory-only by agreement */
  advisory: z.literal(true),
});

export type ExternalDependency = z.infer<typeof ExternalDependencySchema>;

export const ChangeRepoScopeSchema = z.object({
  /** Product repo identifier from ProductContext.repos. */
  repo_id: z.string().min(1),
  /** Optional role snapshot for display/filtering. */
  role: z.enum(["primary", "secondary"]).optional(),
  /** Optional repo path snapshot. */
  path: z.string().min(1).optional(),
  /** Optional stable repo project id snapshot. */
  repo_project_id: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .optional(),
  /** Whether this repo is required for verification/archive. */
  required: z.boolean().default(true),
  /** Optional ordered multi-repo merge position. */
  merge_order: z.number().int().nonnegative().optional(),
});

export type ChangeRepoScope = z.infer<typeof ChangeRepoScopeSchema>;

// =============================================================================
// Fast Follow (Same-Project Follow-up Lineage)
// =============================================================================

/**
 * Provenance metadata for changes created as a fast-follow within the same
 * project. Set when a child change is created with `parent_change_id` to
 * establish same-project lineage.
 */
export const FastFollowOfSchema = z.object({
  /** Change ID of the parent change in the current project */
  parent_change_id: z.string(),
  /** ISO8601 timestamp when the fast-follow link was established */
  linked_at: z.string(),
  /**
   * Structural reference to the report follow-up that motivated this
   * fast-follow child. Present when the child was created as the
   * post-planning owner of a promoted report follow-up.
   */
  followup_ref: ReportFollowUpRefSchema.optional(),
});

export type FastFollowOf = z.infer<typeof FastFollowOfSchema>;

// =============================================================================
// Ops Follow-up Traceability
// =============================================================================

/**
 * Ops/enabler follow-up kind. Covers migrations, backfills, deploy config,
 * monitoring, cleanup, teardown, docs, and similar enablers. Keeps ADV from
 * drifting into a project-manager clone while preserving structural lineage.
 */
export const OpsFollowupKindSchema = z.enum([
  "migration",
  "backfill",
  "deploy_config",
  "monitoring",
  "cleanup",
  "teardown",
  "other",
]);
export type OpsFollowupKind = z.infer<typeof OpsFollowupKindSchema>;

/**
 * Single ops relationship vocabulary. `blocks` is the hard-blocking path for
 * in-scope release-safety work; the other relationships support release-first
 * sequencing and post-release follow-through.
 */
export const OpsRelationshipSchema = z.enum([
  "blocks",
  "follows_release",
  "monitors",
  "cleanup_after",
]);
export type OpsRelationship = z.infer<typeof OpsRelationshipSchema>;

/**
 * Follow-up status for the child/follow-up change profile. Distinct from the
 * seven ADV gates — this is the operational execution state.
 */
export const OpsFollowupStatusSchema = z.enum([
  "not_started",
  "running",
  "partial",
  "failed",
  "rerun_needed",
  "rollback_needed",
  "cleanup_needed",
  "complete",
]);
export type OpsFollowupStatus = z.infer<typeof OpsFollowupStatusSchema>;

/**
 * Source provenance for an ops follow-up. Mirrors the structural source of the
 * promotion (typed required follow-up, sub-agent report, or manual fallback).
 * The source change/project/path is always recorded so the link is repairable
 * from the child context.
 *
 * retireAgendaWorkflow (AC8 parse-only): the `agenda` source_kind and
 * `source_agenda_id` field are retained in the persisted schema so legacy
 * changes and reports that already reference Agenda remain readable. No new
 * tool or signal writes these fields; new promotions must use the typed
 * report/manual source kinds.
 */
export const OpsFollowupSourceSchema = z.object({
  /** The change that originated this follow-up. */
  source_change_id: z.string().min(1),
  /** Stable ADV project ID of the originating project, when known. */
  source_project_id: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .optional(),
  /** Absolute path to the originating project repository, when known. */
  source_path: z.string().min(1).optional(),
  /** Source artifact kind/reference (e.g. report key, contract id). */
  source_artifact: z.string().min(1).optional(),
  /** Contract item ID that motivated the follow-up, when applicable. */
  source_contract_id: z.string().min(1).optional(),
  /** Task ID in the originating change, when applicable. */
  source_task_id: z.string().min(1).optional(),
  /** Sidecar sub-agent report key, when promoted from a report. */
  source_report_key: z.string().min(1).optional(),
  /** Parse-only legacy Agenda item ID. No new writes (retireAgendaWorkflow). */
  source_agenda_id: z.string().min(1).optional(),
  /**
   * Promotion source kind — ordered from most to least structured.
   * Parse-only: "agenda" is retained so legacy records validate; new writes
   * must use the typed report/manual kinds (retireAgendaWorkflow AC8).
   */
  source_kind: z.enum([
    "required_follow_up",
    "report_follow_up",
    "agenda",
    "manual",
  ]),
});
export type OpsFollowupSource = z.infer<typeof OpsFollowupSourceSchema>;

/**
 * Lightweight operational evidence entry. Runbook-shaped but minimal: enough
 * for an agent to resume, validate, rerun, or clean up the follow-up work.
 */
export const OpsEvidenceEntrySchema = z.object({
  id: z.string().min(1),
  recorded_at: z.string(),
  env: z.string().min(1),
  action: z.string().min(1),
  batch: z.string().optional(),
  status: z.enum([
    "started",
    "partial",
    "pass",
    "fail",
    "rerun_needed",
    "rollback_needed",
    "cleanup_needed",
    "complete",
  ]),
  summary: z.string().min(1),
  next_step: z.string().optional(),
  completion_signal: z.string().optional(),
});

/**
 * Status vocabulary for a typed ops runbook instance. This is nested under the
 * ops_followup profile so legacy profiles remain valid while production-impacting
 * work can carry a durable runbook state machine.
 */
export const OpsRunStatusSchema = z.enum([
  "not_started",
  "planned",
  "approval_required",
  "approved",
  "running",
  "partial",
  "failed",
  "rerun_needed",
  "rollback_needed",
  "cleanup_needed",
  "complete",
]);
export type OpsRunStatus = z.infer<typeof OpsRunStatusSchema>;

export const OpsRunStepKindSchema = z.enum([
  "plan",
  "approval",
  "execute",
  "health_check",
  "rollback",
  "cleanup",
]);
export type OpsRunStepKind = z.infer<typeof OpsRunStepKindSchema>;

export const OpsRunStepStatusSchema = z.enum([
  "pending",
  "running",
  "pass",
  "fail",
  "skipped",
]);
export type OpsRunStepStatus = z.infer<typeof OpsRunStepStatusSchema>;

export const OpsRunApprovalPolicySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("approval_required"),
    approval_evidence: z.string().min(1).optional(),
  }),
  z.object({
    mode: z.literal("bounded_low_risk_autonomous"),
    rationale: z.string().min(1),
    bounds: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    mode: z.literal("not_prod_impacting"),
    rationale: z.string().min(1).optional(),
  }),
]);
export type OpsRunApprovalPolicy = z.infer<typeof OpsRunApprovalPolicySchema>;

export const OpsRunArtifactRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pointer"),
    uri: z.string().min(1),
    summary: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal("none"),
    rationale: z.string().min(1),
  }),
]);
export type OpsRunArtifactRef = z.infer<typeof OpsRunArtifactRefSchema>;

export const OpsRunPlanSchema = z.object({
  env: z.string().min(1),
  action: z.string().min(1),
  bounds: z.array(z.string().min(1)).min(1),
  evidence_policy: z.string().min(1),
  rollback_or_cleanup_plan: z.string().min(1),
});
export type OpsRunPlan = z.infer<typeof OpsRunPlanSchema>;

export const OpsRunStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: OpsRunStepKindSchema,
  status: OpsRunStepStatusSchema.default("pending"),
  approval_policy: OpsRunApprovalPolicySchema.optional(),
});
export type OpsRunStep = z.infer<typeof OpsRunStepSchema>;

export const OpsRunEvidenceEntrySchema = z.object({
  id: z.string().min(1),
  recorded_at: z.string(),
  step_id: z.string().min(1).optional(),
  step_kind: OpsRunStepKindSchema,
  env: z.string().min(1),
  run_id: z.string().min(1).optional(),
  batch: z.string().min(1).optional(),
  status: z.enum([
    "started",
    "partial",
    "pass",
    "fail",
    "rerun_needed",
    "rollback_needed",
    "cleanup_needed",
    "complete",
  ]),
  summary: z.string().min(1),
  artifact: OpsRunArtifactRefSchema,
  next_status: OpsRunStatusSchema,
  completion_signal: z.string().min(1).optional(),
  health_verification: z.string().min(1).optional(),
  rollback_or_cleanup_disposition: z.string().min(1).optional(),
});
export type OpsRunEvidenceEntry = z.infer<typeof OpsRunEvidenceEntrySchema>;

export const OpsRunSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: OpsRunStatusSchema,
  created_at: z.string(),
  updated_at: z.string().optional(),
  plan: OpsRunPlanSchema,
  steps: z.array(OpsRunStepSchema).default([]),
  evidence: z.array(OpsRunEvidenceEntrySchema).default([]),
});
export type OpsRun = z.infer<typeof OpsRunSchema>;

/**
 * Ops follow-up profile on the child/follow-up change. The child owns its own
 * source provenance, status, and evidence; the parent/source owns the outbound
 * link edge for release/discovery.
 */
export const OpsFollowupProfileSchema = z.object({
  kind: OpsFollowupKindSchema,
  source: OpsFollowupSourceSchema,
  relationship: OpsRelationshipSchema,
  status: OpsFollowupStatusSchema,
  created_at: z.string(),
  updated_at: z.string().optional(),
  completion_signal: z.string().optional(),
  evidence: z.array(OpsEvidenceEntrySchema).default([]),
  runs: z.array(OpsRunSchema).default([]),
});
export type OpsFollowupProfile = z.infer<typeof OpsFollowupProfileSchema>;

/**
 * Verified-at-read proof projected onto a parent outbound ops link after reading
 * the child/source-of-truth profile. This is not a standalone source of truth;
 * it is a bounded release/archive readiness proof.
 */
const OpsFollowupResolutionReasonSchema = z.enum([
  "verified",
  "child_missing",
  "profile_missing",
  "target_identity_mismatch",
  "unreachable",
]);
export type OpsFollowupResolutionReason = z.infer<
  typeof OpsFollowupResolutionReasonSchema
>;

export const OpsFollowupResolutionSchema = z.object({
  status: OpsFollowupStatusSchema,
  verified_at: z.string(),
  child_updated_at: z.string().optional(),
  resolution_reason: OpsFollowupResolutionReasonSchema.optional(),
  source: z.enum(["child_profile", "unreachable"]),
  completion_signal: z.string().min(1).optional(),
  health_verification: z.string().min(1).optional(),
  rollback_or_cleanup_disposition: z.string().min(1).optional(),
  evidence_summary: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});
export type OpsFollowupResolution = z.infer<typeof OpsFollowupResolutionSchema>;

/**
 * Outbound ops follow-up link recorded on the parent/source change. The parent
 * owns edge existence for release/archive reporting and discovery; the `status`
 * field is a last-known display snapshot only — the child profile is the source
 * of truth for operational status/evidence.
 */
export const OpsFollowupLinkSchema = z.object({
  id: z.string().min(1),
  target_project_id: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .optional(),
  target_path: z.string().min(1).optional(),
  changeId: z.string().min(1),
  relationship: OpsRelationshipSchema,
  status: OpsFollowupStatusSchema,
  required_handoff: z.boolean().default(false),
  linked_at: z.string(),
  source_artifact: z.string().optional(),
  source_contract_id: z.string().optional(),
  resolution: OpsFollowupResolutionSchema.optional(),
});
export type OpsFollowupLink = z.infer<typeof OpsFollowupLinkSchema>;

// =============================================================================
// Change Contract Traceability
// =============================================================================

export const ContractRigorSchema = z.enum(["minimal", "standard", "strict"]);
export type ContractRigor = z.infer<typeof ContractRigorSchema>;

export const ContractItemKindSchema = z.enum([
  "success_criterion",
  "acceptance_criterion",
  "constraint",
  "avoidance",
  "out_of_scope",
]);
export type ContractItemKind = z.infer<typeof ContractItemKindSchema>;

export const ContractItemStatusSchema = z.enum([
  "draft",
  "approved",
  "amended",
  "superseded",
  "waived",
]);
export type ContractItemStatus = z.infer<typeof ContractItemStatusSchema>;

export const ContractEvidenceStatusSchema = z.enum([
  "pass",
  "fail",
  "respected",
  "violated",
  "unknown",
  "not_applicable",
]);
export type ContractEvidenceStatus = z.infer<
  typeof ContractEvidenceStatusSchema
>;

export const ContractItemVariantKindSchema = z.enum([
  "behavioral",
  "evidence",
  "spec_law",
  "constraint",
]);
export type ContractItemVariantKind = z.infer<
  typeof ContractItemVariantKindSchema
>;

export const BehavioralVariantSchema = z.object({
  kind: z.literal("behavioral"),
  context: z.string().min(1),
  trigger: z.string().min(1),
  outcome: z.string().min(1),
  boundaries: z.array(z.string().min(1)).optional(),
});
export type BehavioralVariant = z.infer<typeof BehavioralVariantSchema>;

export const EvidenceVariantSchema = z
  .object({
    kind: z.literal("evidence"),
    subject: z.string().min(1),
    method: z.string().min(1).optional(),
    source: z.string().min(1).optional(),
  })
  .refine(
    (variant) => variant.method !== undefined || variant.source !== undefined,
    { message: "Evidence variants require a method or source" },
  );
export type EvidenceVariant = z.infer<typeof EvidenceVariantSchema>;

export const SpecLawVariantSchema = z.object({
  kind: z.literal("spec_law"),
  spec: z.string().min(1),
  requirement: z.string().min(1),
});
export type SpecLawVariant = z.infer<typeof SpecLawVariantSchema>;

export const ConstraintVariantSchema = z.object({
  kind: z.literal("constraint"),
  obligation: z.string().min(1),
  scope: z.string().min(1).optional(),
});
export type ConstraintVariant = z.infer<typeof ConstraintVariantSchema>;

export const ContractItemVariantSchema = z.discriminatedUnion("kind", [
  BehavioralVariantSchema,
  EvidenceVariantSchema,
  SpecLawVariantSchema,
  ConstraintVariantSchema,
]);
export type ContractItemVariant = z.infer<typeof ContractItemVariantSchema>;

export const ContractSourceSchema = z.object({
  artifact: z.enum(["proposal", "problemStatement", "agreement", "design"]),
  contentHash: z.string().optional(),
  approvedAt: z.string(),
});
export type ContractSource = z.infer<typeof ContractSourceSchema>;

export const ContractItemSchema = z.object({
  id: z.string(),
  kind: ContractItemKindSchema,
  text: z.string(),
  sourceArtifact: z.enum([
    "proposal",
    "problemStatement",
    "agreement",
    "design",
  ]),
  sourceHash: z.string().optional(),
  verificationRequired: z.boolean().default(true),
  evidencePolicy: ContractEvidencePolicySchema,
  status: ContractItemStatusSchema.default("draft"),
  notRequiredReason: z.string().optional(),
  requiredCritical: z.boolean().optional(),
  /**
   * Declared capability warrants (addAcWarrantGuard). Present only on
   * capability-presuming criteria that carried a `[warrant: ...]` tag in the
   * agreement. Each ref (`tool:<name>`, `tool:<name>#<arg>`, `spec:<rq-id>`) is
   * verified against the live tool surface / spec ids at mint time; an
   * unresolved warrant fails the mint with CONTRACT_UNRESOLVED_WARRANT.
   */
  warrants: z.array(z.string()).optional(),
  /**
   * Optional structured criterion variant parsed once at mint time. Canonical
   * `text` remains the compatibility anchor; display parts are advisory and
   * must not be treated as behavioral proof (C2).
   */
  variant: ContractItemVariantSchema.optional(),
});
export type ContractItem = z.infer<typeof ContractItemSchema>;

export const ContractReviewMatrixRowSchema = z.object({
  contractId: z.string(),
  kind: ContractItemKindSchema,
  status: ContractEvidenceStatusSchema,
  evidencePolicy: ContractEvidencePolicySchema,
  evidence: z.string().min(1),
  notes: z.string().optional(),
});
export type ContractReviewMatrixRow = z.infer<
  typeof ContractReviewMatrixRowSchema
>;

export const ContractReviewMatrixSchema = z.object({
  reviewedAt: z.string(),
  rows: z.array(ContractReviewMatrixRowSchema),
  /**
   * Recovery-audit marker stamped by saveRecoveredContractReviewMatrix when a
   * poisoned/completed-workflow recovery write lands on the disk projection.
   * Optional for backward compatibility with matrices recorded via the normal
   * contractReviewMatrixSetSignal path. Stripped before the signal is re-fired
   * during acceptance reconciliation.
   */
  recovery_audit: GateRecoveryAuditSchema.optional(),
});
export type ContractReviewMatrix = z.infer<typeof ContractReviewMatrixSchema>;

export const ContractAmendmentSchema = z.object({
  id: z.string(),
  actor: z.string(),
  reason: z.string(),
  approvalEvidence: z.string().optional(),
  amendedAt: z.string(),
  affectedIds: z.array(z.string()),
  invalidatesReviewMatrix: z.boolean().default(true),
});
export type ContractAmendment = z.infer<typeof ContractAmendmentSchema>;

export const ChangeContractSchema = z.object({
  version: z.literal(1),
  rigor: ContractRigorSchema,
  source: ContractSourceSchema,
  items: z.array(ContractItemSchema),
  reviewMatrix: ContractReviewMatrixSchema.optional(),
  amendments: z.array(ContractAmendmentSchema).default([]),
});
export type ChangeContract = z.infer<typeof ChangeContractSchema>;

// =============================================================================
// Change
// =============================================================================

/**
 * Origin provenance — captures the trigger context for a change.
 *
 * `kind` semantics (see ADV_INSTRUCTIONS.md § Change Origin Linkage Strategy):
 *   - `roadmap`   — READABLE LEGACY ONLY. Historically promoted from a
 *                   GitHub Project item; new writes rejected by
 *                   `adv_change_create` (retired by
 *                   `reshapeTriagePortfolioBalance`).
 *                   Archived changes still carry this kind for read compat.
 *   - `discovery` — surfaced mid-session (bug found, drive-by improvement);
 *                   may carry source_artifact, never issue_number
 *   - `triage`    — promoted by `/adv-triage` from a non-GH source artifact
 *                   (wisdom, notes); issue_number/source_artifact optional
 *   - `adhoc`     — explicit, no upstream artifact (default for ad-hoc work)
 *
 * The schema is typed-state only at this layer; behavior automation
 * (auto-create issue on `/adv-proposal #N`, auto-close on archive) lands
 * in a follow-up change.
 */
export const ChangeOriginKindSchema = z.enum([
  "roadmap",
  "discovery",
  "triage",
  "adhoc",
]);

export type ChangeOriginKind = z.infer<typeof ChangeOriginKindSchema>;

export const ChangeOriginSchema = z.object({
  kind: ChangeOriginKindSchema,
  /** rq-backlogCoord08: GitHub issue number for roadmap (required) or triage only. */
  issue_number: z.number().int().positive().optional(),
  /**
   * Stable reference to the upstream artifact that triggered this change.
   * For kind=triage: wisdom-id or note-line ref.
   * Parse-only legacy: agenda-id (`ag-...`) values remain readable for
   * historical records (retireAgendaWorkflow AC8).
   * For kind=discovery: optional task-id or wisdom-id created at the same time.
   * For kind=adhoc: omitted.
   */
  source_artifact: z.string().optional(),
});

export type ChangeOrigin = z.infer<typeof ChangeOriginSchema>;

export const Phase9FinalizationStatusSchema = z.object({
  status: z.enum(["pending", "pending_merge", "done", "failed"]),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  repo: z.string().optional(),
  prNumber: z.number().int().positive().optional(),
  prUrl: z.string().url().optional(),
  autoMergeArmed: z.boolean().optional(),
  route: z
    .enum([
      "no_remote",
      "direct",
      "pr_auto_merge",
      "pr_manual",
      "merge_queue",
      "blocked",
    ])
    .optional(),
  // rq-fixPhase9SquashMergeRedetect SC1: change-tip SHA captured at archive
  // dispatch time. Lets reachability detection survive branch deletion by
  // using a content-addressed tip instead of the live change/{id} git ref.
  changeTipSha: z
    .string()
    .regex(/^[0-9a-f]{40}$/, "changeTipSha must be a 40-hex Git SHA")
    .optional(),
  // SHA of the change branch tip before archive artifacts were committed.
  preArchiveTipSha: z
    .string()
    .regex(/^[0-9a-f]{40}$/, "preArchiveTipSha must be a 40-hex Git SHA")
    .optional(),
  /** Exact PR head SHA used by direct-route merged-PR proof. */
  prHeadSha: z.string().min(1).optional(),
  /** Exact merged PR commit OID used by direct-route merged-PR proof. */
  mergeCommitSha: z.string().min(1).optional(),
  /** Current origin/default SHA proven to contain the merged PR commit. */
  defaultBranchSha: z.string().min(1).optional(),
});

export type Phase9FinalizationStatus = z.infer<
  typeof Phase9FinalizationStatusSchema
>;

// =============================================================================
// Signal Rejection (workflow-state sidecar projection)
// =============================================================================

/**
 * Zod mirror of the persisted `SignalPayloadDigest` and `SignalRejection`.
 * Declared here so ChangeSchema
 * can type the persisted `signal_rejections` projection at the read boundary
 * instead of relying on `as unknown as` casts (AI-007). Structurally identical
 * to the workflow interfaces; keep the two in sync.
 */
export const SignalPayloadDigestSchema = z.object({
  payload_size: z.number(),
  payload_sample: z.string(),
  payload_fnv1a: z.string(),
});

export const SignalRejectionSchema = z.object({
  signalName: z.string(),
  errorMessage: z.string(),
  errorClass: z.string(),
  payloadDigest: SignalPayloadDigestSchema,
  rejectedAt: z.string(),
});
export type SignalRejection = z.infer<typeof SignalRejectionSchema>;

/**
 * Read-model mirror of the workflow's bounded `state.testRuns[taskId][]`
 * evidence. This is evidence-only and never controls task or gate completion.
 */
export const TestRunRecordSchema = z.object({
  runId: z.string(),
  phase: z.enum(["red", "green", "verify"]).optional(),
  exitCode: z.number().int().nullable(),
  classification: z.string(),
  command: z.string(),
  durationMs: z.number(),
  assertionDensity: z.number().optional(),
  mockSurface: z
    .array(z.object({ pattern: z.string(), count: z.number() }))
    .optional(),
  behaviorSurface: z.enum(["small", "medium", "large"]).optional(),
  evidence_kind: z.enum(["unit", "other"]).optional(),
  recordedAt: z.string(),
});
export type TestRunRecord = z.infer<typeof TestRunRecordSchema>;

/**
 * Bounded audit entry for a storage-owned conditional projection commit.
 *
 * Recorded by `commitChangeProjection` on every active-projection write.
 * Carries enough metadata to reconstruct authority, concurrency revision,
 * and recovery provenance without embedding full histories or secrets.
 */
export const ProjectionCommitAuditEntrySchema = z.object({
  mutation_kind: z.string().min(1),
  /**
   * Why the commit was authorized.
   *
   * `mutation` (ordinary write) and `recovery` (repair) are the only values
   * that can be written. `temporal` is retained as a read-only legacy value:
   * archived changes committed before Temporal was removed carry it, and
   * dropping it from the enum would make their `projection_commits`
   * unreadable.
   */
  authority_kind: z.enum(["mutation", "recovery", "temporal"]),
  authority_reason: z.string().optional(),
  authority_evidence: z.string().optional(),
  /**
   * Legacy read-only fields. `mutation_receipt_id` was written by the
   * Temporal authority; `recovery_reason` / `recovery_evidence` were the
   * pre-rename spelling of `authority_reason` / `authority_evidence`. Kept
   * optional so archived commits still parse.
   */
  mutation_receipt_id: z.string().optional(),
  recovery_reason: z.string().optional(),
  recovery_evidence: z.string().optional(),
  /** Stable operation identity supplied by the caller at the command boundary. */
  operation_id: z.string().min(1).optional(),
  /** Canonical hash of the command payload for idempotency/conflict detection. */
  payload_hash: z.string().min(1).optional(),
  /** Workflow state revision that was projected by this commit. */
  state_revision: z.number().int().nonnegative().optional(),
  prior_revision: z.number().int().nonnegative(),
  new_revision: z.number().int().nonnegative(),
  committed_at: z.string(),
  /**
   * Optional full signal payload recorded for recovery authority commits so
   * the mutation can be re-delivered to a reachable workflow during
   * reconciliation.
   */
  payload: z.record(z.string(), z.unknown()).optional(),
});

export type ProjectionCommitAuditEntry = z.infer<
  typeof ProjectionCommitAuditEntrySchema
>;

export const ChangeSchema = z
  .object({
    $schema: z.string().optional(),
    id: z.string(), // camelCase title
    title: z.string(),
    status: ChangeStatusSchema,
    lifecycleState: ChangeLifecycleStateSchema.optional(),
    created_at: z.string(), // ISO8601
    created_by: z.string().optional(),
    // Optional with safe defaults so legacy / hand-authored change.json
    // (lacking tasks or deltas) loads without manual schema patching.
    // Output type stays non-optional via .default() — callers continue to see
    // Task[] / Record<string, Delta[]>.
    tasks: z.array(TaskSchema).optional().default([]),
    /** Canonical sidecar store for compact persisted sub-agent reports. */
    subagent_reports: z.array(ScopedSubagentReportSchema).optional(),
    /** Bounded task test-run evidence projection; omitted from normal readback. */
    test_runs: z.record(z.string(), z.array(TestRunRecordSchema)).optional(),
    deltas: z.record(z.string(), z.array(DeltaSchema)).optional().default({}),
    validation: ValidationResultSchema.optional(),
    /** Accumulated wisdom/learnings for this change (optional, backwards compatible) */
    wisdom: z.array(WisdomEntrySchema).optional(),
    /** 7-gate quality checklist (optional, backwards compatible with migration) */
    gates: GatesSchema.optional(),
    /** Linked GitHub issue URLs (optional, backwards compatible) */
    github_issues: z.array(z.string().url()).optional(),
    /** Structural traceability spine for approved change obligations. */
    contract: ChangeContractSchema.optional(),
    /** Legacy acceptance criteria projection derived from contract items. */
    acceptanceCriteria: z.array(z.string()).optional(),
    /**
     * Monotonic revision counter for acceptance-readiness state. Advanced
     * when the contract, contract amendments, review matrix, or relevant
     * re-entry change. Optional for backward compatibility; legacy state
     * defaults to 0.
     */
    acceptanceReadinessRevision: z.number().int().nonnegative().optional(),
    /**
     * Snapshot of acceptance criteria captured at gate-completion time, keyed
     * to the acceptanceReadinessRevision at capture. Preserved as audit evidence
     * while the live projection recomputes current criteria on every read.
     */
    acceptanceCriteriaSnapshot: AcceptanceCriteriaSnapshotSchema.optional(),
    /**
     * Workflow document content — authoritative source for the six change
     * artifacts (proposal, problemStatement, agreement, design,
     * executiveSummary, acceptance). Populated by content signals into
     * `state.documents`. Used by `readArtifact` for disk reads and by
     * `writeArchiveBundleFiles` for archive bundle writes.
     *
     * Additive optional fields retained for persisted-state compatibility.
     */
    documents: z
      .object({
        proposal: z.string().optional(),
        problemStatement: z.string().optional(),
        agreement: z.string().optional(),
        design: z.string().optional(),
        executiveSummary: z.string().optional(),
        acceptance: z.string().optional(),
      })
      .optional(),
    /** Artifact metadata projection used during workflow re-seed. */
    artifacts: z.record(z.string(), z.unknown()).optional(),
    /** Structured closure metadata for retired changes */
    closure: ChangeClosureSchema.optional(),
    /** Persisted clarify finding snapshots for resolution tracking */
    clarify_findings: z.array(ClarifyFindingSnapshotSchema).optional(),
    /** Append-only audit trail for scope-expansion re-entry events */
    reentry_history: z.array(ReentryHistoryEntrySchema).optional(),
    /**
     * Cross-project origin provenance — set when this change was created
     * as a follow-up from another project. Presence signals to /adv-discover
     * that origin validation is required before agreement.
     */
    cross_project_origin: CrossProjectOriginSchema.optional(),
    /** Cross-project coordination links to changes in other projects. */
    cross_project_links: z.array(CrossProjectLinkSchema).optional(),
    /** Advisory external dependencies on changes/gates/tasks in other projects. */
    external_dependencies: z.array(ExternalDependencySchema).optional(),
    /**
     * Same-project hard prerequisite edges (rq-workGraphTypes01 /
     * addDependencyAwareResume). Validated at mutation time (cycle-safe,
     * target-resolved). D3 enforcement refuses creation of a dependency-bearing
     * active change whose prereqs are nonterminal. Default [] on absent
     * field (additive schema, no migration needed).
     */
    same_project_dependencies: z.array(WorkNodeRefSchema).default([]),
    /** Product-linked repo scope for this change. */
    scope_repos: z.array(ChangeRepoScopeSchema).optional(),
    /** Project IDs affected by this change for cross-workflow discovery. */
    affectedProjects: z.array(z.string()).optional(),
    /** Path hints affected by this change for collision discovery. */
    affectedPaths: z.array(z.string()).optional(),
    /** ISO8601 timestamp of the latest signal processed by the workflow. */
    lastSignalAt: z.string().optional(),
    /** True when the workflow is waiting on a checkpoint/approval boundary. */
    pendingCheckpoint: z.boolean().optional(),
    /** True once an archive/cancel terminal signal has been processed. */
    terminated: z.boolean().optional(),
    /**
     * Same-project fast-follow lineage — set when this change was created
     * as a follow-up to another change within the same project. Presence
     * signals to /adv-discover that lineage validation is required.
     */
    fast_follow_of: FastFollowOfSchema.optional(),

    /**
     * Origin provenance — captures whether this change was triggered by a
     * roadmap item, a mid-session discovery, a triage promotion, or ad-hoc
     * work. Optional for backward compatibility; legacy changes default to
     * `adhoc` semantics on read. See ADV_INSTRUCTIONS.md § Change Origin
     * Linkage Strategy for resolution rules.
     */
    origin: ChangeOriginSchema.optional(),

    /**
     * Project ID that owns this change. Persisted on disk snapshots so the
     * shared guard can detect cross-project context mismatches.
     * Optional for legacy compatibility — ownerless changes are best-effort.
     */
    adv_project_id: z.string().optional(),

    /**
     * Per-change worktree-management marker (rq-autoManageAdvWorktrees AC3).
     * - `true` — change is auto-managed: mutation guards proactively create
     *   the worktree on first discovery-phase mutation from main checkout.
     * - `false` — grandfathered legacy change; guards run in block-only mode
     *   when the global `worktree_guard_enforce` flag is true.
     * - `undefined` — lazy-migrated to `false` on first read after this
     *   schema lands (sticky once set). Migration flows through
     *   `worktreeAutoManagedSignal` so workflow state stays authoritative.
     * Decoupled from `features.worktree_guard_enforce`: per-change marker
     * is the activation switch for auto-create behavior.
     */
    worktree_auto_managed: z.boolean().optional(),

    /**
     * Projection of the per-change worktree path on a cross-project mutation
     * target (rq-autoManageAdvWorktrees AC4). Populated lazily via
     * `worktreeAttachedSignal({ role: "target" })` after the auto-create
     * helper materializes a worktree in the target project. Set back to
     * `null` after archive Phase 9 cleanup completes. Registry remains the
     * canonical source per `rq-worktreeRegistry01`; this field is a
     * routing-convenience projection, never bypassing the signal path.
     */
    target_worktree_path: z.string().nullable().optional(),

    /**
     * Projection of per-`scope_repos` worktree paths for product-linked
     * changes (rq-autoManageAdvWorktrees AC4). Keyed by `repo_id` from
     * `scope_repos[*].repo_id`. Populated lazily per repo via
     * `worktreeAttachedSignal({ role: "scope", repoId, path })`. Cleared
     * to `{}` after archive Phase 9 cleanup completes. Iteration order
     * matches `Object.keys` insertion order, which the cleanup helper
     * relies on for deterministic per-repo deletion.
     */
    scope_worktrees: z.record(z.string(), z.string()).optional(),

    /**
     * Idempotency keys for sub-agent reports already folded into workflow
     * state. Workflow-state projection persisted on the change snapshot
     * (referenced by subagent-reports spec). Bounded to the most recent 200
     * distinct IDs in FIFO order.
     */
    seenReportIds: z.array(z.string()).optional(),

    /** Cumulative count of every accepted distinct report ID. */
    seenReportIdsTotal: z.number().optional(),

    /**
     * Typed dispositions for adv-designer design concerns. Persisted on the
     * change projection so workflow re-seed / continue-as-new preserve the
     * structural acceptance/release gate clearing state.
     */
    design_concern_dispositions: z
      .array(DesignConcernDispositionSchema)
      .optional(),

    /**
     * Typed dispositions for verification-evidence gaps on completed tasks
     * with proof-bearing evidence policies. Persisted on the change projection
     * so workflow re-seed / continue-as-new preserve the structural
     * acceptance/release gate clearing state.
     */
    verification_evidence_dispositions: z
      .array(VerificationEvidenceDispositionSchema)
      .optional(),

    /**
     * Persisted signal-rejection audit projection (e.g. T8 size-guard
     * rejections). Typed here so the read boundary needs no casts (AI-007).
     */
    signal_rejections: z.array(SignalRejectionSchema).optional(),

    /** Running total of rejected signals across the workflow's lifetime. */
    signal_rejections_total: z.number().optional(),

    /**
     * Phase 9 async finalization status. Set when archive dispatches
     * finalization to the background queue (phase9:"run"). Agents can
     * observe this field via adv_change_show to confirm completion.
     */
    phase9_status: Phase9FinalizationStatusSchema.optional(),

    /** Immutable released-projection proof required by terminal archive state. */
    archive_projection_proof: ArchiveProjectionProofReceiptSchema.optional(),

    /**
     * Lightweight change profile state: request, immutable omission policy, and
     * append-only evaluation history. Optional for backward compatibility.
     */
    lightweight_profile: LightweightChangeProfileSchema.optional(),

    /**
     * Ops/enabler follow-up profile on this change (child/follow-up context).
     * Optional for backward compatibility; set via ops-follow-up promotion or
     * by seeding a change that already carries the profile.
     */
    ops_followup: OpsFollowupProfileSchema.optional(),

    /**
     * Outbound ops follow-up links from this change (parent/source context).
     * Optional for backward compatibility; additive and idempotent by link id.
     */
    ops_followup_links: z.array(OpsFollowupLinkSchema).optional(),

    /**
     * Optional Epic membership projection for child changes.
     * V1: a change may belong to zero or one Epic. Enables fast Epic context
     * loading and Visibility lookup via AdvEpicId search attribute.
     */
    epic_membership: EpicMembershipSchema.optional(),

    /**
     * Typed coordination claim: bounded scope summary, responsibility enum,
     * normalized exact identifiers, and generated terms. Stored on the change
     * workflow only; no separate store. Search-attribute projection is gated
     * to open lifecycle + running workflow authority.
     */
    coordination_claim: ChangeCoordinationClaimSchema.optional(),

    /**
     * rq-creationRequestHash01 (tk-74c358188ffb, design D2 / AC4 / AC11):
     * canonical SHA-256 hash of stable creation-request fields, computed by
     * `computeCreationRequestHash` and stamped on the disk projection at
     * create time. Used by `ensureChangeWorkflowStarted` to reconcile
     * post-commit-timeout retries against the existing workflow's recorded
     * hash: same hash → idempotent match; differing hash → typed conflict
     * (refuses before mutation). Optional for backward compatibility —
     * legacy changes pre-dating this field are treated as `first_creation`
     * by the idempotency resolver.
     */
    creation_request_hash: z.string().optional(),

    /**
     * Monotonic projection-revision counter for storage-owned conditional
     * commits. Optional for backward compatibility — legacy changes and
     * archive bundles without this field are treated as revision 0 on read.
     * Incremented exactly once per successful `commitChangeProjection`.
     */
    projection_revision: z.number().int().nonnegative().optional(),

    /**
     * Bounded audit trail of storage-owned conditional projection commits.
     * Optional additive/backward-compatible. Trimmed to the most recent 50
     * entries at write time so the projection does not grow unbounded.
     */
    projection_commits: z.array(ProjectionCommitAuditEntrySchema).optional(),

    /**
     * Monotonic workflow state revision mirrored into the disk projection.
     * Legacy/absent = 0. Used to fence out-of-order projection commits.
     */
    state_revision: z.number().int().nonnegative().optional(),

    /**
     * Bounded operation ledger for stable command identity. Survives workflow
     * continue-as-new / re-seed so retries and conflicting operation_ids are
     * handled deterministically.
     */
    operation_ledger: z
      .record(
        z.string(),
        z.object({
          operation_id: z.string(),
          command_kind: z.string(),
          payload_hash: z.string(),
          outcome: z.enum(["accepted", "rejected", "idempotent_replay"]),
          state_revision: z.number().int().nonnegative(),
          accepted_at: z.string(),
          last_seen_at: z.string(),
        }),
      )
      .optional(),
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type Change = z.infer<typeof ChangeSchema>;
