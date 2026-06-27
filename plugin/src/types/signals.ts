/**
 * Signal Payload Types
 *
 * Zod schemas for the signal-driven change workflow contract.
 * Tool-layer adapters validate these before firing Temporal signals.
 */

import { z } from "zod";
import {
  EpicChangeRefSchema,
  EpicMergedIntoSchema,
  EpicMembershipSchema,
  EpicMembershipStatusSchema,
  EpicScopeSchema,
  EpicSchema,
} from "./epics";
import { ConformanceVerdictSchema } from "./conformance";
import {
  GateArtifactEvidenceSchema,
  GateCriterionSchema,
  GateIdSchema,
  GateReadinessBlockerSchema,
} from "./gates";
import { WisdomEntrySchema } from "./wisdom";
import { AttemptSchema, TaskSchema } from "./tasks";
import { TaskStructuredOutputSchema } from "./task-output";
import {
  DesignConcernDispositionSchema,
  ScopedSubagentReportSchema,
} from "./subagent-reports";
import {
  ChangeContractSchema,
  ContractAmendmentSchema,
  ContractReviewMatrixSchema,
  Phase9FinalizationStatusSchema,
  OpsEvidenceEntrySchema,
  OpsFollowupLinkSchema,
  OpsFollowupProfileSchema,
  OpsFollowupStatusSchema,
} from "./changes";

const IsoTimestampSchema = z.string();

const DocumentUpdateBaseSchema = z.object({
  text: z.string(),
  updatedBy: z.string().optional(),
  updatedAt: IsoTimestampSchema,
});

export const ProposalUpdatedSignalPayloadSchema = DocumentUpdateBaseSchema;
export type ProposalUpdatedSignalPayload = z.infer<
  typeof ProposalUpdatedSignalPayloadSchema
>;

export const ProblemStatementUpdatedSignalPayloadSchema =
  DocumentUpdateBaseSchema;
export type ProblemStatementUpdatedSignalPayload = z.infer<
  typeof ProblemStatementUpdatedSignalPayloadSchema
>;

export const AgreementUpdatedSignalPayloadSchema = DocumentUpdateBaseSchema;
export type AgreementUpdatedSignalPayload = z.infer<
  typeof AgreementUpdatedSignalPayloadSchema
>;

export const DesignUpdatedSignalPayloadSchema = DocumentUpdateBaseSchema;
export type DesignUpdatedSignalPayload = z.infer<
  typeof DesignUpdatedSignalPayloadSchema
>;

export const ExecutiveSummaryUpdatedSignalPayloadSchema =
  DocumentUpdateBaseSchema;
export type ExecutiveSummaryUpdatedSignalPayload = z.infer<
  typeof ExecutiveSummaryUpdatedSignalPayloadSchema
>;

export const AcceptanceUpdatedSignalPayloadSchema = DocumentUpdateBaseSchema;
export type AcceptanceUpdatedSignalPayload = z.infer<
  typeof AcceptanceUpdatedSignalPayloadSchema
>;

export const AcceptanceCriteriaSetSignalPayloadSchema = z.object({
  criteria: z.array(z.string()),
  setBy: z.string().optional(),
  setAt: IsoTimestampSchema,
});
export type AcceptanceCriteriaSetSignalPayload = z.infer<
  typeof AcceptanceCriteriaSetSignalPayloadSchema
>;

export const ContractSetSignalPayloadSchema = z.object({
  contract: ChangeContractSchema,
  updatedAt: IsoTimestampSchema,
});
export type ContractSetSignalPayload = z.infer<
  typeof ContractSetSignalPayloadSchema
>;

export const ContractAmendedSignalPayloadSchema = z.object({
  amendments: z.array(ContractAmendmentSchema),
  updatedAt: IsoTimestampSchema,
});
export type ContractAmendedSignalPayload = z.infer<
  typeof ContractAmendedSignalPayloadSchema
>;

export const ContractReviewMatrixSetSignalPayloadSchema = z.object({
  reviewMatrix: ContractReviewMatrixSchema,
  updatedAt: IsoTimestampSchema,
});
export type ContractReviewMatrixSetSignalPayload = z.infer<
  typeof ContractReviewMatrixSetSignalPayloadSchema
>;

export const TaskAddedSignalPayloadSchema = z.object({
  task: TaskSchema,
  addedAt: IsoTimestampSchema,
});
export type TaskAddedSignalPayload = z.infer<
  typeof TaskAddedSignalPayloadSchema
>;

export const TaskUpdatedSignalPayloadSchema = z.object({
  taskId: z.string(),
  partial: TaskSchema.partial(),
  updatedAt: IsoTimestampSchema,
});
export type TaskUpdatedSignalPayload = z.infer<
  typeof TaskUpdatedSignalPayloadSchema
>;

export const TaskRemovedSignalPayloadSchema = z.object({
  taskId: z.string(),
  removedAt: IsoTimestampSchema,
});
export type TaskRemovedSignalPayload = z.infer<
  typeof TaskRemovedSignalPayloadSchema
>;

export const TaskAssignedSignalPayloadSchema = z.object({
  taskId: z.string(),
  sessionId: z.string(),
  assignedAt: IsoTimestampSchema,
});
export type TaskAssignedSignalPayload = z.infer<
  typeof TaskAssignedSignalPayloadSchema
>;

export const TaskCompletedSignalPayloadSchema = z.object({
  taskId: z.string(),
  verification: z.string().min(1),
  summary: z.string().min(1),
  filesTouched: z.array(z.string()).default([]),
  checkpointSha: z.string().optional(),
  completedAt: IsoTimestampSchema,
  /** Structured output extracted from `<adv-output>` tags — optional, non-blocking */
  structured_output: TaskStructuredOutputSchema.optional(),
  /** Evidence ref for red run — rq-TDD009seq ordering enforcement */
  lastRedRunId: z.string().optional(),
  /** Evidence ref for green run — rq-TDD009seq ordering enforcement */
  lastGreenRunId: z.string().optional(),
  /** Evidence ref for non-inline TDD (separate_verification / not_applicable) */
  lastEvidenceRunId: z.string().optional(),
});
export type TaskCompletedSignalPayload = z.infer<
  typeof TaskCompletedSignalPayloadSchema
>;

const MockSurfaceEntrySchema = z.object({
  pattern: z.string(),
  count: z.number().int().nonnegative(),
});

/**
 * Shared record shape for a persisted test run. Stored in
 * `state.testRuns[taskId][]` (ring-buffered, last 20). The signal payload
 * extends this with `taskId`.
 *
 * rq-TDD009seq ordering enforcement matches `runId` + `phase` + `exitCode`
 * from these records against `TaskCompletedSignalPayload.lastRedRunId` /
 * `lastGreenRunId`.
 */
const TestRunRecordBaseSchema = z.object({
  runId: z.string().min(1),
  phase: z.enum(["red", "green", "verify"]).optional(),
  exitCode: z.number().int().nullable(),
  classification: z.string().min(1),
  command: z.string().min(1),
  durationMs: z.number().nonnegative(),
  assertionDensity: z.number().nonnegative().optional(),
  mockSurface: z.array(MockSurfaceEntrySchema).optional(),
  behaviorSurface: z.enum(["small", "medium", "large"]).optional(),
  recordedAt: IsoTimestampSchema,
});

export const TestRunRecordedSignalPayloadSchema =
  TestRunRecordBaseSchema.extend({
    taskId: z.string(),
  });
export type TestRunRecordedSignalPayload = z.infer<
  typeof TestRunRecordedSignalPayloadSchema
>;

export const SubagentReportSubmittedSignalPayloadSchema = z.object({
  taskId: z.string().optional(),
  report: ScopedSubagentReportSchema,
  submittedAt: IsoTimestampSchema,
});
export type SubagentReportSubmittedSignalPayload = z.infer<
  typeof SubagentReportSubmittedSignalPayloadSchema
>;

// Records a typed disposition for a single design-quality concern so the
// gate-readiness evaluator can clear an otherwise-blocking concern. The payload
// is the disposition record itself.
export const DesignConcernDispositionedSignalPayloadSchema =
  DesignConcernDispositionSchema;
export type DesignConcernDispositionedSignalPayload = z.infer<
  typeof DesignConcernDispositionedSignalPayloadSchema
>;

export const TaskBlockedSignalPayloadSchema = z.object({
  taskId: z.string(),
  reason: z.string(),
  attempts: z.array(AttemptSchema).default([]),
  blockedAt: IsoTimestampSchema,
});
export type TaskBlockedSignalPayload = z.infer<
  typeof TaskBlockedSignalPayloadSchema
>;

export const TaskCancelledSignalPayloadSchema = z.object({
  taskId: z.string(),
  approvalEvidence: z.string().min(1),
  reason: z.string().min(1),
  cancelledAt: IsoTimestampSchema,
});
export type TaskCancelledSignalPayload = z.infer<
  typeof TaskCancelledSignalPayloadSchema
>;

export const GateInProgressSignalPayloadSchema = z.object({
  gateId: GateIdSchema,
  triggeredBy: z.string().optional(),
  triggeredAt: IsoTimestampSchema,
});
export type GateInProgressSignalPayload = z.infer<
  typeof GateInProgressSignalPayloadSchema
>;

export const GateAwaitingApprovalSignalPayloadSchema = z.object({
  gateId: GateIdSchema,
  evidence: z.string().min(1),
  triggeredAt: IsoTimestampSchema,
});
export type GateAwaitingApprovalSignalPayload = z.infer<
  typeof GateAwaitingApprovalSignalPayloadSchema
>;

export const GateStuckSignalPayloadSchema = z.object({
  gateId: GateIdSchema,
  reason: z.string().min(1),
  readinessBlockers: z.array(GateReadinessBlockerSchema).optional(),
  triggeredAt: IsoTimestampSchema,
});
export type GateStuckSignalPayload = z.infer<
  typeof GateStuckSignalPayloadSchema
>;

export const GateCompletedSignalPayloadSchema = z.object({
  gateId: GateIdSchema,
  approvalEvidence: z.string().optional(),
  compatibilityReason: z.string().optional(),
  artifactEvidence: GateArtifactEvidenceSchema.optional(),
  completedBy: z.string(),
  completedAt: IsoTimestampSchema,
  /**
   * Advisory criteria evaluated at gate completion time.
   * Optional for replay-safety — histories predating this field replay
   * cleanly with criteria undefined.
   */
  criteria: z.array(GateCriterionSchema).optional(),
});
export type GateCompletedSignalPayload = z.infer<
  typeof GateCompletedSignalPayloadSchema
>;

export const GateReenteredSignalPayloadSchema = z.object({
  fromGateId: GateIdSchema,
  reason: z.string().min(1),
  scopeDelta: z.string().optional(),
  reenteredBy: z.string(),
  reenteredAt: IsoTimestampSchema,
});
export type GateReenteredSignalPayload = z.infer<
  typeof GateReenteredSignalPayloadSchema
>;

export const WisdomAddedSignalPayloadSchema = z.object({
  entry: WisdomEntrySchema,
  addedAt: IsoTimestampSchema,
});
export type WisdomAddedSignalPayload = z.infer<
  typeof WisdomAddedSignalPayloadSchema
>;

export const ReflectionRecordedSignalPayloadSchema = z.object({
  report: z.unknown(),
  recordedAt: IsoTimestampSchema,
});
export type ReflectionRecordedSignalPayload = z.infer<
  typeof ReflectionRecordedSignalPayloadSchema
>;

export const WorktreeCreatedSignalPayloadSchema = z.object({
  branch: z.string(),
  path: z.string(),
  baseRef: z.string(),
  headSha: z.string(),
  createdAt: IsoTimestampSchema,
});
export type WorktreeCreatedSignalPayload = z.infer<
  typeof WorktreeCreatedSignalPayloadSchema
>;

export const WorktreeDeletedSignalPayloadSchema = z.object({
  branch: z.string(),
  reason: z.string(),
  deletedAt: IsoTimestampSchema,
});
export type WorktreeDeletedSignalPayload = z.infer<
  typeof WorktreeDeletedSignalPayloadSchema
>;

/**
 * rq-autoManageAdvWorktrees AC3 — per-change marker signal.
 *
 * `source: "create"` fires at change creation with `value: true`.
 * `source: "migrate"` fires lazily on first read of a legacy change.json
 *   without the marker, with `value: false`.
 * Handler is sticky: once `state.worktree_auto_managed` is set to a
 * boolean, subsequent signals are ignored (idempotent).
 */
export const WorktreeAutoManagedSignalPayloadSchema = z.object({
  value: z.boolean(),
  source: z.enum(["create", "migrate"]),
  recordedAt: IsoTimestampSchema,
});
export type WorktreeAutoManagedSignalPayload = z.infer<
  typeof WorktreeAutoManagedSignalPayloadSchema
>;

/**
 * rq-autoManageAdvWorktrees AC4 — worktree path projection signal.
 *
 * Projects a created (or detached) worktree path onto the change record
 * for cross-project routing convenience. Registry remains the canonical
 * source per `rq-worktreeRegistry01`; this projection is a routing hint
 * walked by archive Phase 9 cleanup and by mutation guards.
 *
 * Roles:
 * - `current` — current-repo worktree (today this lives in the
 *   per-change worktrees map; the projection writes through for
 *   parity with target/scope roles).
 * - `target` — sets `state.target_worktree_path`. Pass `path: null` to
 *   clear after cleanup.
 * - `scope` — sets `state.scope_worktrees[repoId] = path`. Pass
 *   `path: null` to clear a single entry.
 *
 * Idempotent: equal payloads are no-ops; differing values overwrite.
 */
export const WorktreeAttachedSignalPayloadSchema = z.object({
  role: z.enum(["current", "target", "scope"]),
  repoId: z.string().optional(),
  path: z.string().nullable(),
  recordedAt: IsoTimestampSchema,
});
export type WorktreeAttachedSignalPayload = z.infer<
  typeof WorktreeAttachedSignalPayloadSchema
>;

export const ConformanceLockedSignalPayloadSchema = z.object({
  specs: z.array(z.string()),
  lockedAt: IsoTimestampSchema,
});
export type ConformanceLockedSignalPayload = z.infer<
  typeof ConformanceLockedSignalPayloadSchema
>;

export const ConformanceVerdictSignalPayloadSchema = z.object({
  verdict: ConformanceVerdictSchema,
  runId: z.string(),
  failed: z
    .array(z.object({ rq_id: z.string(), summary: z.string() }).passthrough())
    .optional(),
  recordedAt: IsoTimestampSchema,
});
export type ConformanceVerdictSignalPayload = z.infer<
  typeof ConformanceVerdictSignalPayloadSchema
>;

export const ConformanceOverriddenSignalPayloadSchema = z.object({
  user: z.string(),
  reason: z.string(),
  reVerifyDeadline: z.string(),
  overriddenAt: IsoTimestampSchema,
});
export type ConformanceOverriddenSignalPayload = z.infer<
  typeof ConformanceOverriddenSignalPayloadSchema
>;

export const ArchiveRequestedSignalPayloadSchema = z.object({
  approvalEvidence: z.string().min(1),
  requestedBy: z.string(),
  requestedAt: IsoTimestampSchema,
});
export type ArchiveRequestedSignalPayload = z.infer<
  typeof ArchiveRequestedSignalPayloadSchema
>;

export const Phase9StatusUpdatedSignalPayloadSchema = z.object({
  phase9_status: Phase9FinalizationStatusSchema,
  updatedAt: IsoTimestampSchema,
});
export type Phase9StatusUpdatedSignalPayload = z.infer<
  typeof Phase9StatusUpdatedSignalPayloadSchema
>;

export const OpsFollowupSeededSignalPayloadSchema = z.object({
  profile: OpsFollowupProfileSchema,
  seededAt: IsoTimestampSchema,
});
export type OpsFollowupSeededSignalPayload = z.infer<
  typeof OpsFollowupSeededSignalPayloadSchema
>;

export const OpsFollowupLinkAddedSignalPayloadSchema = z.object({
  link: OpsFollowupLinkSchema,
  addedAt: IsoTimestampSchema,
});
export type OpsFollowupLinkAddedSignalPayload = z.infer<
  typeof OpsFollowupLinkAddedSignalPayloadSchema
>;

export const OpsEvidenceAppendedSignalPayloadSchema = z.object({
  entry: OpsEvidenceEntrySchema,
  /** Optional status override applied to the child profile. */
  status: OpsFollowupStatusSchema.optional(),
  appendedAt: IsoTimestampSchema,
});
export type OpsEvidenceAppendedSignalPayload = z.infer<
  typeof OpsEvidenceAppendedSignalPayloadSchema
>;

export const ChangeCancelledSignalPayloadSchema = z.object({
  approvalEvidence: z.string().min(1),
  reason: z.string().min(1),
  supersededBy: z.string().optional(),
  cancelledBy: z.string(),
  cancelledAt: IsoTimestampSchema,
});
export type ChangeCancelledSignalPayload = z.infer<
  typeof ChangeCancelledSignalPayloadSchema
>;

// =============================================================================
// Epic Workflow Signal Payloads
// =============================================================================

/**
 * Create or replace the Epic record. Used at workflow creation and when a
 * full Epic snapshot is reapplied (e.g., migration). Additive: extra fields
 * on the Epic record are preserved via EpicSchema.passthrough.
 */
export const EpicCreatedSignalPayloadSchema = EpicSchema;
export type EpicCreatedSignalPayload = z.infer<
  typeof EpicCreatedSignalPayloadSchema
>;

/**
 * Update Epic title/narrative with optimistic-concurrency version check.
 * expectedVersion must match state.epic.version; otherwise a typed conflict
 * is recorded and the update is rejected.
 */
export const EpicUpdatedSignalPayloadSchema = z.object({
  title: z.string().optional(),
  narrative: z.string().optional(),
  expectedVersion: z.number().int().min(0),
  idempotencyKey: z.string().min(1),
  updatedAt: IsoTimestampSchema,
});
export type EpicUpdatedSignalPayload = z.infer<
  typeof EpicUpdatedSignalPayloadSchema
>;

/**
 * Replace Epic scope metadata with optimistic-concurrency version check.
 * Local/product-spanning display is derived from scope repo count, not `kind`.
 */
export const EpicScopeUpdatedSignalPayloadSchema = z.object({
  epicScope: EpicScopeSchema.optional(),
  expectedVersion: z.number().int().min(0),
  updatedBy: z.string().min(1),
  auditEvidence: z.string().min(1),
  idempotencyKey: z.string().min(1),
  updatedAt: IsoTimestampSchema,
});
export type EpicScopeUpdatedSignalPayload = z.infer<
  typeof EpicScopeUpdatedSignalPayloadSchema
>;

/**
 * Add a shell entry to the Epic roadmap. order is advisory; the workflow
 * assigns the next available order when omitted.
 */
export const ShellAddedSignalPayloadSchema = z.object({
  entryId: z.string().min(1),
  title: z.string().min(1),
  successHint: z.string().min(1),
  order: z.number().int().min(0).optional(),
  idempotencyKey: z.string().min(1),
  addedAt: IsoTimestampSchema,
});
export type ShellAddedSignalPayload = z.infer<
  typeof ShellAddedSignalPayloadSchema
>;

/**
 * Promote a shell entry to a linked ADV change. Idempotent by
 * idempotencyKey and shell entry ID: retries return the already-linked
 * change without creating duplicate rows.
 */
export const ShellPromotedSignalPayloadSchema = z.object({
  entryId: z.string().min(1),
  changeId: z.string().min(1),
  promotedBy: z.string().min(1),
  promotedAt: IsoTimestampSchema,
  idempotencyKey: z.string().min(1),
});
export type ShellPromotedSignalPayload = z.infer<
  typeof ShellPromotedSignalPayloadSchema
>;

/**
 * Link an existing ADV change as a new Epic entry.
 */
export const ChangeLinkedSignalPayloadSchema = z.object({
  entryId: z.string().min(1),
  changeId: z.string().min(1),
  changeRef: EpicChangeRefSchema.optional(),
  title: z.string().min(1),
  order: z.number().int().min(0).optional(),
  membershipStatus: EpicMembershipStatusSchema.optional(),
  linkedBy: z.string().min(1).optional(),
  linkEvidence: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1),
  linkedAt: IsoTimestampSchema,
});
export type ChangeLinkedSignalPayload = z.infer<
  typeof ChangeLinkedSignalPayloadSchema
>;

/**
 * Update an Epic change entry's child projection status after repair/enrichment.
 */
export const ChangeProjectionStatusUpdatedSignalPayloadSchema = z.object({
  entryId: z.string().min(1),
  membershipStatus: EpicMembershipStatusSchema,
  evidence: z.string().min(1),
  idempotencyKey: z.string().min(1),
  updatedAt: IsoTimestampSchema,
});
export type ChangeProjectionStatusUpdatedSignalPayload = z.infer<
  typeof ChangeProjectionStatusUpdatedSignalPayloadSchema
>;

const EpicMembershipIdentitySchema = z.object({
  epic_id: z.string().min(1),
  entry_id: z.string().min(1),
});

/**
 * Set/refresh a child change's compact Epic membership projection.
 */
export const EpicMembershipSetSignalPayloadSchema = z.object({
  membership: EpicMembershipSchema,
  expectedCurrent: EpicMembershipIdentitySchema.optional(),
  setAt: IsoTimestampSchema,
});
export type EpicMembershipSetSignalPayload = z.infer<
  typeof EpicMembershipSetSignalPayloadSchema
>;

/**
 * Clear a child change's Epic membership projection when identity matches.
 */
export const EpicMembershipClearedSignalPayloadSchema = z.object({
  expected: EpicMembershipIdentitySchema,
  clearedAt: IsoTimestampSchema,
});
export type EpicMembershipClearedSignalPayload = z.infer<
  typeof EpicMembershipClearedSignalPayloadSchema
>;

/**
 * Retarget an existing Epic change entry from one child change ID to another.
 * Preserves entry_id and order; updates the child reference, membership status,
 * and retarget audit fields atomically.
 */
export const ChangeRetargetedSignalPayloadSchema = z.object({
  entryId: z.string().min(1),
  fromChangeId: z.string().min(1),
  toChangeId: z.string().min(1),
  changeRef: EpicChangeRefSchema.optional(),
  title: z.string().min(1).optional(),
  membershipStatus: EpicMembershipStatusSchema.optional(),
  retargetedBy: z.string().min(1),
  retargetEvidence: z.string().min(1),
  idempotencyKey: z.string().min(1),
  retargetedAt: IsoTimestampSchema,
});
export type ChangeRetargetedSignalPayload = z.infer<
  typeof ChangeRetargetedSignalPayloadSchema
>;

/**
 * Unlink a change entry from the Epic. The entry is removed; this is not
 * idempotent beyond missing-entry tolerance.
 */
export const ChangeUnlinkedSignalPayloadSchema = z.object({
  entryId: z.string().min(1),
  unlinkEvidence: z.string().min(1),
  idempotencyKey: z.string().min(1),
  unlinkedAt: IsoTimestampSchema,
});
export type ChangeUnlinkedSignalPayload = z.infer<
  typeof ChangeUnlinkedSignalPayloadSchema
>;

/**
 * Reorder Epic entries. expectedVersion enables CAS conflict detection;
 * idempotencyKey survives continue-as-new.
 */
export const EntriesReorderedSignalPayloadSchema = z.object({
  entryIds: z.array(z.string().min(1)).min(1),
  expectedVersion: z.number().int().min(0),
  idempotencyKey: z.string().min(1),
  reorderedAt: IsoTimestampSchema,
});
export type EntriesReorderedSignalPayload = z.infer<
  typeof EntriesReorderedSignalPayloadSchema
>;

/**
 * Compact terminal summary update for a child change entry.
 */
export const EntryTerminalSummarySignalPayloadSchema = z.object({
  entryId: z.string().min(1),
  status: z.enum(["archived", "closed"]),
  completedAt: IsoTimestampSchema,
  idempotencyKey: z.string().min(1),
});
export type EntryTerminalSummarySignalPayload = z.infer<
  typeof EntryTerminalSummarySignalPayloadSchema
>;

/**
 * Mark a source Epic as merged into a survivor Epic. Merged sources remain
 * queryable for audit/history and must not produce active next-work.
 */
export const EpicMergedSignalPayloadSchema = z.object({
  mergedInto: EpicMergedIntoSchema,
  expectedVersion: z.number().int().min(0),
  idempotencyKey: z.string().min(1),
});
export type EpicMergedSignalPayload = z.infer<
  typeof EpicMergedSignalPayloadSchema
>;

/**
 * Archive the Epic. Terminal signal that sets status to "archived".
 */
export const EpicArchivedSignalPayloadSchema = z.object({
  archivedAt: IsoTimestampSchema,
  archivedBy: z.string().min(1),
});
export type EpicArchivedSignalPayload = z.infer<
  typeof EpicArchivedSignalPayloadSchema
>;
