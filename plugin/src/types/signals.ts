/**
 * Signal Payload Types
 *
 * Zod schemas for the signal-driven change workflow contract.
 * Tool-layer adapters validate these before persisting state transitions.
 */

import { z } from "zod";
import { ArchiveProjectionProofReceiptSchema } from "./archive-projection";
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
import { WisdomDraftSchema } from "./tasks";
import {
  CapabilityKeySchema,
  DeltaAddSchema,
  DeltaModifySchema,
  DeltaRemoveSchema,
  DeltaRenameSchema,
  DeltaSchema,
} from "./specs";
import { AttemptSchema, TaskApplyCycleSchema, TaskSchema } from "./tasks";
import { TaskStructuredOutputSchema } from "./task-output";
import {
  DesignConcernDispositionSchema,
  ScopedSubagentReportSchema,
  VerificationEvidenceDispositionSchema,
} from "./subagent-reports";
import {
  ChangeClosureSchema,
  ChangeContractSchema,
  ChangeCoordinationClaimSchema,
  ChangeOriginSchema,
  ContractAmendmentSchema,
  ContractReviewMatrixSchema,
  Phase9FinalizationStatusSchema,
  OpsEvidenceEntrySchema,
  OpsFollowupLinkSchema,
  OpsFollowupProfileSchema,
  OpsFollowupResolutionSchema,
  OpsFollowupStatusSchema,
  OpsRunEvidenceEntrySchema,
  OpsRunSchema,
} from "./changes";
import { WorkNodeRefSchema } from "./work-graph";
import { FutureWorkContextPacketSchema } from "./future-work";
import {
  LightweightProfileEvaluationSchema,
  LightweightProfileOmissionPolicySchema,
  LightweightProfileRequestSchema,
} from "./lightweight-change-profile";

const IsoTimestampSchema = z.string();

/**
 * Shared optional envelope for caller-stable command identity and canonical
 * payload hash. Migrated ChangeWorkflow command signals accept these fields
 * so the workflow reducer can deduplicate retries and detect payload conflicts.
 */
const CommandOperationEnvelopeSchema = z.object({
  operation_id: z.string().min(1).optional(),
  command_kind: z.string().min(1).optional(),
  payload_hash: z.string().min(1).optional(),
});

const DocumentUpdateBaseSchema = z.object({
  text: z.string(),
  updatedBy: z.string().optional(),
  updatedAt: IsoTimestampSchema,
  mutationReceiptId: z.string().min(1).optional(),
  /**
   * Caller-stable operation identity. Survives retries and
   * continue-as-new so the workflow reducer can deduplicate the same logical
   * command and detect payload conflicts (AC3).
   */
  operation_id: z.string().min(1).optional(),
  /**
   * Command kind recorded in the operation ledger. Must match the signal's
   * command kind for the ledger entry to be accepted.
   */
  command_kind: z.string().min(1).optional(),
  /**
   * Canonical payload hash for content-update idempotency. When supplied the
   * reducer uses it instead of recomputing a hash from the text.
   */
  payload_hash: z.string().min(1).optional(),
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
  mutationReceiptId: z.string().min(1).optional(),
});
export type ContractReviewMatrixSetSignalPayload = z.infer<
  typeof ContractReviewMatrixSetSignalPayloadSchema
>;

export const TaskAddedSignalPayloadSchema = z
  .object({
    task: TaskSchema,
    addedAt: IsoTimestampSchema,
  })
  .merge(CommandOperationEnvelopeSchema);
export type TaskAddedSignalPayload = z.infer<
  typeof TaskAddedSignalPayloadSchema
>;

export const TaskUpdatedSignalPayloadSchema = z
  .object({
    taskId: z.string(),
    partial: TaskSchema.partial(),
    updatedAt: IsoTimestampSchema,
  })
  .merge(CommandOperationEnvelopeSchema);
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
  applyCycle: TaskApplyCycleSchema.optional(),
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
export type MockSurfaceEntry = z.infer<typeof MockSurfaceEntrySchema>;

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
  evidence_kind: z.enum(["unit", "other"]).optional(),
  recordedAt: IsoTimestampSchema,
});

export const TestRunRecordedSignalPayloadSchema =
  TestRunRecordBaseSchema.extend({
    taskId: z.string(),
  });
export type TestRunRecordedSignalPayload = z.infer<
  typeof TestRunRecordedSignalPayloadSchema
>;

/**
 * rq-coordinationClaim01: set or replace a typed coordination claim on an
 * open change. The claim is schema-validated, identifiers are normalized,
 * and the workflow reducer rejects the signal if the lifecycle is not open.
 */
export const CoordinationClaimSetSignalPayloadSchema = z.object({
  claim: ChangeCoordinationClaimSchema,
  set_at: IsoTimestampSchema,
});
export type CoordinationClaimSetSignalPayload = z.infer<
  typeof CoordinationClaimSetSignalPayloadSchema
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
  DesignConcernDispositionSchema.extend({
    mutationReceiptId: z.string().min(1).optional(),
  });
export type DesignConcernDispositionedSignalPayload = z.infer<
  typeof DesignConcernDispositionedSignalPayloadSchema
>;

// Records a typed disposition for a verification-evidence gap so the
// gate-readiness evaluator can clear an otherwise-blocking
// VERIFICATION_EVIDENCE_MISSING blocker. The payload is the disposition record
// itself (latest-wins per (taskId, concernKey)).
export const VerificationEvidenceDispositionedSignalPayloadSchema =
  VerificationEvidenceDispositionSchema.extend({
    mutationReceiptId: z.string().min(1).optional(),
  });
export type VerificationEvidenceDispositionedSignalPayload = z.infer<
  typeof VerificationEvidenceDispositionedSignalPayloadSchema
>;

export const TaskBlockedSignalPayloadSchema = z.object({
  taskId: z.string(),
  reason: z.string(),
  attempts: z.array(AttemptSchema).default([]),
  blockedAt: IsoTimestampSchema,
  /**
   * Optional wisdom_drafts snapshot to apply atomically with the blocked
   * transition. rq-wisdomAutoSurfacing01.3: a SEMANTIC error_recovery
   * accompanying a blocked-status update still creates a WisdomDraft so
   * the learning moment is captured even when the task is re-blocked.
   * Absent on legacy payloads; workflow handler treats undefined as no-op.
   */
  wisdom_drafts: z.array(WisdomDraftSchema).optional(),
});
export type TaskBlockedSignalPayload = z.infer<
  typeof TaskBlockedSignalPayloadSchema
>;

export const TaskCancelledSignalPayloadSchema = z
  .object({
    taskId: z.string(),
    approvalEvidence: z.string().min(1),
    reason: z.string().min(1),
    cancelledAt: IsoTimestampSchema,
  })
  .merge(CommandOperationEnvelopeSchema);
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

export const GateCompletedSignalPayloadSchema = z
  .object({
    gateId: GateIdSchema,
    approvalEvidence: z.string().optional(),
    compatibilityReason: z.string().optional(),
    artifactEvidence: GateArtifactEvidenceSchema.optional(),
    completedBy: z.string(),
    completedAt: IsoTimestampSchema,
    mutationReceiptId: z.string().min(1).optional(),
    /**
     * Advisory criteria evaluated at gate completion time.
     * Optional for replay-safety — histories predating this field replay
     * cleanly with criteria undefined.
     */
    criteria: z.array(GateCriterionSchema).optional(),
  })
  .merge(CommandOperationEnvelopeSchema);
export type GateCompletedSignalPayload = z.infer<
  typeof GateCompletedSignalPayloadSchema
>;

export const ArchiveConvergedSignalPayloadSchema = z.object({
  requestedAt: IsoTimestampSchema,
  requestedBy: z.string(),
  approvalEvidence: z.string().min(1),
  releaseCompletion: GateCompletedSignalPayloadSchema,
  phase9Status: Phase9FinalizationStatusSchema,
  projectionProof: ArchiveProjectionProofReceiptSchema.optional(),
});
export type ArchiveConvergedSignalPayload = z.infer<
  typeof ArchiveConvergedSignalPayloadSchema
>;

export const GateReenteredSignalPayloadSchema = z
  .object({
    fromGateId: GateIdSchema,
    reason: z.string().min(1),
    scopeDelta: z.string().optional(),
    reenteredBy: z.string(),
    reenteredAt: IsoTimestampSchema,
  })
  .merge(CommandOperationEnvelopeSchema);
export type GateReenteredSignalPayload = z.infer<
  typeof GateReenteredSignalPayloadSchema
>;

export const WisdomAddedSignalPayloadSchema = z
  .object({
    entry: WisdomEntrySchema,
    addedAt: IsoTimestampSchema,
  })
  .merge(CommandOperationEnvelopeSchema);
export type WisdomAddedSignalPayload = z.infer<
  typeof WisdomAddedSignalPayloadSchema
>;

/**
 * Append-only spec-delta writer payload (addSpecDeltaWriter change).
 *
 * Restricted to DeltaAdd semantics: only operation:"add" deltas carrying a
 * complete requirement may be recorded. Modify/remove/rename stay
 * archive-internal until their target-resolution and overwrite semantics are
 * separately designed. `capability` accepts an existing or a valid new
 * kebab-case capability key; the workflow reducer appends the delta under
 * `state.deltas[capability]` and archive remains the sole global-spec writer.
 */
export const SpecDeltaAddedSignalPayloadSchema = z
  .object({
    capability: CapabilityKeySchema,
    delta: DeltaAddSchema,
    addedAt: IsoTimestampSchema,
    addedBy: z.string().optional(),
  })
  .merge(CommandOperationEnvelopeSchema);
export type SpecDeltaAddedSignalPayload = z.infer<
  typeof SpecDeltaAddedSignalPayloadSchema
>;

/**
 * Modify-only spec-delta writer payload. The tool resolves the target in the
 * current global spec before signaling; the workflow records only change-owned
 * intent, rejects conflicting durable targets, and never writes global specs.
 */
export const SpecDeltaModifiedSignalPayloadSchema = z
  .object({
    capability: CapabilityKeySchema,
    delta: DeltaModifySchema,
    modifiedAt: IsoTimestampSchema,
    modifiedBy: z.string().optional(),
  })
  .merge(CommandOperationEnvelopeSchema)
  .strict();
export type SpecDeltaModifiedSignalPayload = z.infer<
  typeof SpecDeltaModifiedSignalPayloadSchema
>;

/**
 * Full-replacement amend payload for an existing staged delta. The new delta
 * carries the same id as `deltaId` and replaces the existing entry in place.
 */
export const SpecDeltaAmendedSignalPayloadSchema = z
  .object({
    capability: CapabilityKeySchema,
    deltaId: z.string(),
    delta: DeltaSchema,
    amendedAt: IsoTimestampSchema,
    amendedBy: z.string().optional(),
  })
  .merge(CommandOperationEnvelopeSchema)
  .strict();
export type SpecDeltaAmendedSignalPayload = z.infer<
  typeof SpecDeltaAmendedSignalPayloadSchema
>;

/**
 * Retraction payload: removes an existing staged delta by id from the
 * capability-local delta record.
 */
export const SpecDeltaRetractedSignalPayloadSchema = z
  .object({
    capability: CapabilityKeySchema,
    deltaId: z.string(),
    retractedAt: IsoTimestampSchema,
    retractedBy: z.string().optional(),
  })
  .merge(CommandOperationEnvelopeSchema);
export type SpecDeltaRetractedSignalPayload = z.infer<
  typeof SpecDeltaRetractedSignalPayloadSchema
>;

/**
 * Remove-operation delta writer payload. Mirrors modify semantics: the tool
 * proves the target exists before signaling; the reducer records the intent.
 */
export const SpecDeltaRemovedSignalPayloadSchema = z
  .object({
    capability: CapabilityKeySchema,
    delta: DeltaRemoveSchema,
    removedAt: IsoTimestampSchema,
    removedBy: z.string().optional(),
  })
  .merge(CommandOperationEnvelopeSchema)
  .strict();
export type SpecDeltaRemovedSignalPayload = z.infer<
  typeof SpecDeltaRemovedSignalPayloadSchema
>;

/**
 * Rename-operation delta writer payload. Mirrors modify semantics: the reducer
 * records the rename intent; downstream archive validators enforce new_id
 * uniqueness and ordering.
 */
export const SpecDeltaRenamedSignalPayloadSchema = z
  .object({
    capability: CapabilityKeySchema,
    delta: DeltaRenameSchema,
    renamedAt: IsoTimestampSchema,
    renamedBy: z.string().optional(),
  })
  .merge(CommandOperationEnvelopeSchema)
  .strict();
export type SpecDeltaRenamedSignalPayload = z.infer<
  typeof SpecDeltaRenamedSignalPayloadSchema
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

/**
 * Repairs a missing worktree registration after disk-authoritative reuse.
 * The change workflow performs the if-absent check so a client query failure
 * cannot overwrite an existing setup_failed or metadata-rich record.
 */
export const WorktreeRegistrationRepairedSignalPayloadSchema = z.object({
  branch: z.string(),
  path: z.string(),
  baseRef: z.string(),
  headSha: z.string(),
  repairedAt: IsoTimestampSchema,
});
export type WorktreeRegistrationRepairedSignalPayload = z.infer<
  typeof WorktreeRegistrationRepairedSignalPayloadSchema
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
 * rq-wl-setupReadiness01.1 — durable setup-failure persistence.
 *
 * Fired when git worktree add fails (stage: "git_failed", materialized:false)
 * or when postCreate hooks fail after the git worktree exists
 * (stage: "hook_failed", materialized:true, headSha present).
 */
export const WorktreeSetupFailedSignalPayloadSchema = z.object({
  branch: z.string(),
  path: z.string(),
  changeId: z.string().optional(),
  baseRef: z.string(),
  headSha: z.string().optional(),
  setupFailureReason: z.string(),
  failedAt: IsoTimestampSchema,
  stage: z.enum(["git_failed", "hook_failed"]),
});
export type WorktreeSetupFailedSignalPayload = z.infer<
  typeof WorktreeSetupFailedSignalPayloadSchema
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

/**
 * rq-migrateExistingAdvWorktrees AC4–AC7 — nonterminal worktree dematerialize
 * payload and durable detach receipt.
 *
 * Fired after a directory-only worktree detach succeeds or is refused.
 * The handler records the outcome in `state.worktree_detach_receipts` and,
 * for detached/idempotent outcomes, updates the branch record to
 * status:"unmaterialized" with path cleared and materialized:false.
 */
export const WorktreeDetachPreflightFactSchema = z.object({
  branch: z.string(),
  path: z.string().optional(),
  eligible: z.boolean(),
  refusalReason: z.string().optional(),
  branchActivityAt: IsoTimestampSchema.optional(),
  advActivityAt: IsoTimestampSchema.optional(),
});
export type WorktreeDetachPreflightFact = z.infer<
  typeof WorktreeDetachPreflightFactSchema
>;

export const WorktreeDematerializedSignalPayloadSchema = z
  .object({
    branch: z.string(),
    requestId: z.string().min(1),
    branches: z.array(z.string()),
    cutoffMs: z.number().int().positive(),
    preflightFacts: z.array(WorktreeDetachPreflightFactSchema),
    outcome: z.enum(["detached", "refused", "idempotent_already_detached"]),
    reason: z.string().optional(),
    // Refusal receipts legitimately lack approval evidence; detached records
    // retain the non-empty user evidence supplied by the apply request.
    approvalEvidence: z.string().min(1).optional(),
    dematerializedAt: IsoTimestampSchema,
  })
  .superRefine((payload, ctx) => {
    if (payload.outcome !== "refused" && !payload.approvalEvidence) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approvalEvidence"],
        message: "approval evidence is required for detached worktrees",
      });
    }
  });
export type WorktreeDematerializedSignalPayload = z.infer<
  typeof WorktreeDematerializedSignalPayloadSchema
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
  projectionProof: ArchiveProjectionProofReceiptSchema.optional(),
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

export const OpsFollowupResolutionUpsertedSignalPayloadSchema = z.object({
  linkId: z.string().min(1),
  resolution: OpsFollowupResolutionSchema,
  upsertedAt: IsoTimestampSchema,
});
export type OpsFollowupResolutionUpsertedSignalPayload = z.infer<
  typeof OpsFollowupResolutionUpsertedSignalPayloadSchema
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

export const OpsRunUpsertedSignalPayloadSchema = z.object({
  run: OpsRunSchema,
  upsertedAt: IsoTimestampSchema,
});
export type OpsRunUpsertedSignalPayload = z.infer<
  typeof OpsRunUpsertedSignalPayloadSchema
>;

export const OpsRunEvidenceAppendedSignalPayloadSchema = z.object({
  runId: z.string().min(1),
  entry: OpsRunEvidenceEntrySchema,
  /** Optional child-profile status override. Run status follows entry.next_status. */
  status: OpsFollowupStatusSchema.optional(),
  appendedAt: IsoTimestampSchema,
});
export type OpsRunEvidenceAppendedSignalPayload = z.infer<
  typeof OpsRunEvidenceAppendedSignalPayloadSchema
>;

export const LightweightProfileRequestedSignalPayloadSchema = z.object({
  request: LightweightProfileRequestSchema,
  omissionPolicy: LightweightProfileOmissionPolicySchema,
  requestedAt: IsoTimestampSchema,
  requestedBy: z.string().optional(),
});
export type LightweightProfileRequestedSignalPayload = z.infer<
  typeof LightweightProfileRequestedSignalPayloadSchema
>;

export const LightweightProfileEvaluatedSignalPayloadSchema = z.object({
  evaluation: LightweightProfileEvaluationSchema,
  evaluatedAt: IsoTimestampSchema,
});
export type LightweightProfileEvaluatedSignalPayload = z.infer<
  typeof LightweightProfileEvaluatedSignalPayloadSchema
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

/**
 * rq-activeOriginRepair01: audited, claim-safe origin repair for active/open
 * changes. Archived/closed origin repair is intentionally out of scope (OOS2).
 */
export const OriginRepairedSignalPayloadSchema = z.object({
  origin: ChangeOriginSchema,
  repairedBy: z.string(),
  repairedAt: IsoTimestampSchema,
  approvalEvidence: z.string().min(1),
  reason: z.string().min(1),
  previousOrigin: ChangeOriginSchema.optional(),
});
export type OriginRepairedSignalPayload = z.infer<
  typeof OriginRepairedSignalPayloadSchema
>;

// =============================================================================
// Batch Close Signal Payloads
// =============================================================================

export const PrepareBatchCloseSignalPayloadSchema = z.object({
  batch_id: z.string().min(1),
  closure: ChangeClosureSchema,
});
export type PrepareBatchCloseSignalPayload = z.infer<
  typeof PrepareBatchCloseSignalPayloadSchema
>;

export const CommitBatchCloseSignalPayloadSchema = z.object({
  batch_id: z.string().min(1),
  committed_at: IsoTimestampSchema.optional(),
});
export type CommitBatchCloseSignalPayload = z.infer<
  typeof CommitBatchCloseSignalPayloadSchema
>;

export const AbortBatchCloseSignalPayloadSchema = z.object({
  batch_id: z.string().min(1),
  reason: z.string().min(1),
  aborted_at: IsoTimestampSchema.optional(),
});
export type AbortBatchCloseSignalPayload = z.infer<
  typeof AbortBatchCloseSignalPayloadSchema
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
  importedFrom: z
    .object({
      backlog_id: z.string().min(1),
      imported_at: IsoTimestampSchema,
    })
    .optional(),
  /** Same-project hard prerequisite edges (rq-workGraphTypes01). */
  blockedBy: z.array(WorkNodeRefSchema).default([]),
  /** Optional durable future-work context packet for the shell entry. */
  context_packet: FutureWorkContextPacketSchema.optional(),
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
export const EpicMembershipSetSignalPayloadSchema = z
  .object({
    membership: EpicMembershipSchema,
    expectedCurrent: EpicMembershipIdentitySchema.optional(),
    setAt: IsoTimestampSchema,
  })
  .merge(CommandOperationEnvelopeSchema);
export type EpicMembershipSetSignalPayload = z.infer<
  typeof EpicMembershipSetSignalPayloadSchema
>;

/**
 * Clear a child change's Epic membership projection when identity matches.
 */
export const EpicMembershipClearedSignalPayloadSchema = z
  .object({
    expected: EpicMembershipIdentitySchema,
    clearedAt: IsoTimestampSchema,
  })
  .merge(CommandOperationEnvelopeSchema);
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
 * Requires a completed Epic (all entries terminal) and matches expectedVersion.
 */
export const EpicArchivedSignalPayloadSchema = z.object({
  archivedAt: IsoTimestampSchema,
  archivedBy: z.string().min(1),
  expectedVersion: z.number().int().min(0),
  idempotencyKey: z.string().min(1),
});
export type EpicArchivedSignalPayload = z.infer<
  typeof EpicArchivedSignalPayloadSchema
>;

/**
 * Refresh Epic search-attribute indexing for legacy workflows that started
 * before `AdvEpicStatus` was registered. Purely additive: records the
 * idempotency key and timestamp, upserts the current `AdvEpicStatus`, and
 * does not mutate the Epic record, version, or progress.
 */
export const EpicSearchAttributesRefreshedSignalPayloadSchema = z.object({
  evidence: z.string().min(1),
  refreshedAt: IsoTimestampSchema,
  idempotencyKey: z.string().min(1),
});
export type EpicSearchAttributesRefreshedSignalPayload = z.infer<
  typeof EpicSearchAttributesRefreshedSignalPayloadSchema
>;
