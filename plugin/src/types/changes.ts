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
import { ScopedSubagentReportSchema } from "./subagent-reports";
import { DeltaSchema } from "./specs";
import { WisdomEntrySchema } from "./wisdom";
import { GatesSchema, GateIdSchema } from "./gates";
import { EpicMembershipSchema } from "./epics";
export {
  ContractEvidencePolicySchema,
  type ContractEvidencePolicy,
} from "./evidence-policy";

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

export const ChangeLifecycleStateSchema = z.enum([
  "open",
  "archived",
  "closed",
]);

export type ChangeLifecycleState = z.infer<typeof ChangeLifecycleStateSchema>;

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
 * workflow state, not agenda text.
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
 * promotion (typed required follow-up, sub-agent report, agenda item, or manual
 * fallback), not agenda text. The source change/project/path is always recorded
 * so the link is repairable from the child context.
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
  /** Source artifact kind/reference (e.g. report key, agenda id, contract id). */
  source_artifact: z.string().min(1).optional(),
  /** Contract item ID that motivated the follow-up, when applicable. */
  source_contract_id: z.string().min(1).optional(),
  /** Task ID in the originating change, when applicable. */
  source_task_id: z.string().min(1).optional(),
  /** Sidecar sub-agent report key, when promoted from a report. */
  source_report_key: z.string().min(1).optional(),
  /** Agenda item ID, only used as a legacy/fallback source. */
  source_agenda_id: z.string().min(1).optional(),
  /** Promotion source kind — ordered from most to least structured. */
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
export type OpsEvidenceEntry = z.infer<typeof OpsEvidenceEntrySchema>;

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
});
export type OpsFollowupProfile = z.infer<typeof OpsFollowupProfileSchema>;

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
 *                   may carry source_artifact, never issue_number
 *   - `triage`    — promoted by `/adv-triage` from a non-GH source artifact
 *                   (agenda, wisdom, notes); issue_number/source_artifact optional
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
   * For kind=triage: agenda-id (`ag-...`), wisdom-id, or note-line ref.
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
});

export type Phase9FinalizationStatus = z.infer<
  typeof Phase9FinalizationStatusSchema
>;

// =============================================================================
// Signal Rejection (workflow-state sidecar projection)
// =============================================================================

/**
 * Zod mirror of the workflow-layer `SignalPayloadDigest` (temporal/digest.ts)
 * and `SignalRejection` (temporal/contracts.ts). Declared here so ChangeSchema
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
     * Workflow document content — authoritative source for the six change
     * artifacts (proposal, problemStatement, agreement, design,
     * executiveSummary, acceptance). Populated by content signals into
     * `state.documents`. Used by `readArtifact` for Temporal-first reads and
     * by `materializeBundleArtifactsActivity` for archive bundle writes.
     *
     * Additive optional fields — Temporal replay-safe.
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
     * (referenced by subagent-reports spec).
     */
    seenReportIds: z.array(z.string()).optional(),

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
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type Change = z.infer<typeof ChangeSchema>;
