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
import { TaskSchema } from "./tasks";
import { DeltaSchema } from "./specs";
import { WisdomEntrySchema } from "./wisdom";
import { GatesSchema, GateIdSchema } from "./gates";

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
  "draft", // Being written
  "pending", // Awaiting approval
  "active", // In progress
  "archived", // Completed and promoted
  "closed", // Retired without completion
]);

export type ChangeStatus = z.infer<typeof ChangeStatusSchema>;

/**
 * Filter-only status value for adv_change_list.
 * "in-flight" is a union filter (draft + pending + active), not a stored status.
 */
export const ChangeListStatusFilterSchema = z.union([
  ChangeStatusSchema,
  z.literal("in-flight"),
]);

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

export const BulkCloseSelectorSchema = z.discriminatedUnion("kind", [
  BulkCloseExplicitSelectorSchema,
  BulkCloseFilterSelectorSchema,
]);

export type BulkCloseSelector = z.infer<typeof BulkCloseSelectorSchema>;

export const BulkCloseResultSchema = z.object({
  success: z.boolean(),
  closed: z.number(),
  results: z.array(
    z.object({
      changeId: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
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
  /** Finding code (e.g., CLARIFY_MISSING_SUCCESS_CRITERIA) */
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
 * Set when project A creates a follow-up change in project B (e.g. pokeedge
 * backend creating a follow-up in pokeedge-web).
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
});

export type FastFollowOf = z.infer<typeof FastFollowOfSchema>;

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

export const ContractEvidencePolicySchema = z.enum([
  "test",
  "review",
  "static_check",
  "design_proof",
  "not_applicable",
]);
export type ContractEvidencePolicy = z.infer<
  typeof ContractEvidencePolicySchema
>;

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
});
export type ContractItem = z.infer<typeof ContractItemSchema>;

export const ContractReviewMatrixRowSchema = z.object({
  contractId: z.string(),
  kind: ContractItemKindSchema,
  status: ContractEvidenceStatusSchema,
  evidencePolicy: ContractEvidencePolicySchema,
  evidence: z.string(),
  notes: z.string().optional(),
});
export type ContractReviewMatrixRow = z.infer<
  typeof ContractReviewMatrixRowSchema
>;

export const ContractReviewMatrixSchema = z.object({
  reviewedAt: z.string(),
  rows: z.array(ContractReviewMatrixRowSchema),
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
 *   - `roadmap`   — promoted from a GitHub Project / ROADMAP.md item
 *                   (`issue_number` required)
 *   - `discovery` — surfaced mid-session (bug found, drive-by improvement);
 *                   issue may be opened post-hoc but is not required
 *   - `triage`    — promoted by `/adv-triage` from a non-GH source artifact
 *                   (agenda, wisdom, notes); `issue_number` set after promotion
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
  /** GitHub issue number when kind=roadmap (required) or backlinked later. */
  issue_number: z.number().int().positive().optional(),
  /**
   * Stable reference to the upstream artifact that triggered this change.
   * For kind=triage: agenda-id (`ag-...`), wisdom-id, or note-line ref.
   * For kind=discovery: optional task-id or wisdom-id created at the same time.
   * For kind=adhoc: omitted.
   */
  source_artifact: z.string().optional(),
});

export type ChangeOrigin = z.infer<typeof ChangeOriginSchema>;

export const ChangeSchema = z
  .object({
    $schema: z.string().optional(),
    id: z.string(), // camelCase title
    title: z.string(),
    status: ChangeStatusSchema,
    created_at: z.string(), // ISO8601
    created_by: z.string().optional(),
    // Optional with safe defaults so legacy / hand-authored change.json
    // (lacking tasks or deltas) loads without manual schema patching.
    // Output type stays non-optional via .default() — callers continue to see
    // Task[] / Record<string, Delta[]>.
    tasks: z.array(TaskSchema).optional().default([]),
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
     * Temporal project ID that owns this change. Persisted on disk snapshots
     * so the shared guard can detect cross-project context mismatches.
     * Optional for legacy compatibility — ownerless changes are best-effort.
     */
    adv_project_id: z.string().optional(),
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type Change = z.infer<typeof ChangeSchema>;
