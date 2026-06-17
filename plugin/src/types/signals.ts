/**
 * Signal Payload Types
 *
 * Zod schemas for the signal-driven change workflow contract.
 * Tool-layer adapters validate these before firing Temporal signals.
 */

import { z } from "zod";
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
import { ScopedSubagentReportSchema } from "./subagent-reports";
import {
  ChangeContractSchema,
  ContractAmendmentSchema,
  ContractReviewMatrixSchema,
  Phase9FinalizationStatusSchema,
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
