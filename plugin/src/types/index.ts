/**
 * Advance (ADV) Core Types — Barrel Module
 *
 * Re-exports every public symbol from the per-domain type modules so that
 * existing import sites (`from "../types"`) continue to resolve unchanged.
 *
 * Pattern matches the named-re-export convention used by:
 *   - plugin/src/storage/index.ts
 *   - plugin/src/events/index.ts
 *   - plugin/src/validator/index.ts
 *
 * Backed by:
 *   - specs.ts          Priority, Scenario, Requirement, Spec, Dependency, Delta
 *   - tasks.ts          TaskStatus, Task, TaskType, Cancellation, Tdd*, TaskRun*, ErrorRecovery
 *   - gates.ts          GateId, Gates, GateCompletion, GATE_DEFS, helpers
 *   - changes.ts        Change, ChangeStatus, ReentryHistory, CrossProject*, BulkClose, etc.
 *   - wisdom.ts         WisdomType, WisdomEntry
 *   - project.ts        ProjectConfig, FeatureFlags, RelatedRepo, ProjectMetadataEntry
 *   - conformance.ts    Conformance*, EMPTY_CONFORMANCE_STATE
 *   - status.ts         STATUS_MARKERS, StatusMarker
 *   - responses.ts      SpecListResponse, ChangeListResponse, TaskReadyResponse, ProjectStatus, ChangeRecency
 *   - tdd-helpers.ts    TDD_*_PATTERNS, isLogicTask, hasCompleteTddEvidence, etc.
 */

// =============================================================================
// Artifacts (canonical ArtifactKind + ArtifactPayload + size caps)
// =============================================================================
export {
  ArtifactKindSchema,
  ARTIFACT_FILENAME,
  type ArtifactKind,
  type ArtifactMetadata,
  ArtifactPayloadSchema,
  type ArtifactPayload,
  ARTIFACT_SOFT_CAP,
  ARTIFACT_HARD_CAP,
  AGGREGATE_SOFT_CAP,
  AGGREGATE_HARD_CAP,
} from "./artifacts";

export { CHANGE_BRANCH_PREFIX } from "./branch-prefix";
export type {
  WorktreeRecord,
  WorktreeRecordStatus,
  MaterializedWorktreeRecord,
  PendingWorktreeDelete,
} from "./worktree-registry";
export type { SessionRecord } from "./session-record";
export type { ChangeInput, ChangeState } from "./change-state";
export type { EpicInput, EpicState, EpicSignalRejection } from "./epic-state";

// =============================================================================
// Backlog
// =============================================================================
export {
  BacklogItemStatusSchema,
  type BacklogItemStatus,
  BacklogPromotionTargetSchema,
  type BacklogPromotionTarget,
  BacklogItemSchema,
  type BacklogItem,
  BacklogHeaderSchema,
  type BacklogHeader,
  CURRENT_SCHEMA_VERSION,
} from "./backlog";

// =============================================================================
// Specs
// =============================================================================
export {
  PrioritySchema,
  ScenarioSchema,
  type Scenario,
  RequirementSchema,
  type Requirement,
  SpecSchema,
  type Spec,
  DependencySchema,
  CAPABILITY_KEY_PATTERN,
  type CapabilityKey,
  SHA256DigestSchema,
  DeltaPreconditionSchema,
  type DeltaPrecondition,
  DeltaSchema,
  type Delta,
  type DeltaAdd,
  DeltaModifyChangesSchema,
  type DeltaModifyChanges,
  type DeltaModify,
  type DeltaRemove,
  type DeltaRename,
} from "./specs";

// =============================================================================
// Epics
// =============================================================================
export {
  EpicStatusSchema,
  type EpicStatus,
  EpicEntryKindSchema,
  type EpicEntryKind,
  EpicScopeRepoSchema,
  type EpicScopeRepo,
  EpicScopeSchema,
  type EpicScope,
  EpicScopeLabelSchema,
  type EpicScopeLabel,
  deriveEpicScopeLabel,
  EpicMergedIntoSchema,
  type EpicMergedInto,
  ShellPromotionProvenanceSchema,
  type ShellPromotionProvenance,
  EpicProgressSummarySchema,
  type EpicProgressSummary,
  EpicChangeRefSchema,
  type EpicChangeRef,
  EpicMembershipStatusSchema,
  type EpicMembershipStatus,
  EpicEntrySchema,
  type EpicEntry,
  EpicSchema,
  type Epic,
  EpicMembershipSchema,
  type EpicMembership,
  RetiredEpicProjectionStatusSchema,
  type RetiredEpicProjectionStatus,
  RetiredEpicProjectionSchema,
  type RetiredEpicProjection,
} from "./epics";

// =============================================================================
// Tasks
// =============================================================================
export {
  TaskStatusSchema,
  CancellationSchema,
  type Cancellation,
  TddReclassificationSchema,
  type TddReclassification,
  AttemptSchema,
  ErrorRecoverySchema,
  type ErrorRecovery,
  FailureAttributionKindSchema,
  type FailureAttributionKind,
  FailureAttributionSchema,
  type FailureAttribution,
  ContractConflictKindSchema,
  type ContractConflictKind,
  ContractConflictSchema,
  type ContractConflict,
  DelegationRecoverySchema,
  type DelegationRecovery,
  TaskTypeSchema,
  type TaskType,
  TaskContractRefsSchema,
  type TaskContractRefs,
  WisdomDraftStatusSchema,
  WisdomDraftDismissReasonSchema,
  WisdomDraftSuggestedTypeSchema,
  WisdomDraftSchema,
  type WisdomDraft,
  TaskSchema,
  type Task,
} from "./tasks";

// =============================================================================
// Evidence Policy
// =============================================================================
export {
  PROOF_BEARING_EVIDENCE_POLICIES,
  WARN_FIRST_EVIDENCE_POLICIES,
  isProofBearingEvidencePolicy,
  isWarnFirstEvidencePolicy,
  ReviewEvidenceRefSchema,
  type ReviewEvidenceRef,
  TaskEvidenceCompatibilitySchema,
  type TaskEvidenceCompatibility,
  TaskEvidenceStageSchema,
  type TaskEvidenceStage,
  TaskEvidencePlanSchema,
  type TaskEvidencePlan,
  TaskEvidenceResolutionSchema,
  type TaskEvidenceResolution,
} from "./evidence-policy";

// =============================================================================
// Sub-agent Reports
// =============================================================================
export {
  SUBAGENT_REPORT_SCHEMA_VERSION,
  SubagentAgentSchema,
  type SubagentAgent,
  ChangeReportScopeKeySchema,
  TaskSubagentReportScopeSchema,
  ChangeSubagentReportScopeSchema,
  SubagentReportScopeSchema,
  SubagentVerificationEntrySchema,
  SubagentDecisionSchema,
  SubagentBlockerSchema,
  SubagentConsumerWarningSchema,
  RequiredFollowUpSchema,
  type RequiredFollowUp,
  ReportFollowUpRefSchema,
  reportKeyFromReport,
  DesignConcernDispositionSchema,
  type DesignConcernDisposition,
  type VerificationEvidenceDisposition,
  EngineerSubagentReportSchema,
  DesignerDesignDimensionSchema,
  DesignerDesignDimensionsSchema,
  DesignerNeighboringRecommendationSchema,
  DesignerSubagentReportSchema,
  ReviewerFindingSchema,
  ReviewerChangeMadeSchema,
  ReviewerScopeDriftSchema,
  ReviewerSubagentReportSchema,
  ChangeScopedReviewerSubagentReportSchema,
  SubagentSourceReferenceSchema,
  ResearcherValidationSchema,
  ResearcherSubagentReportSchema,
  TronOptimizationCandidateEvidenceSchema,
  TronOptimizationCandidateCostShapeSchema,
  TronOptimizationCandidateSchema,
  TronEvidenceSchema,
  TronSubagentReportSchema,
  ScannerBundleFindingSchema,
  ScannerBundleSubagentReportSchema,
  VerificationTriageFailureModeSchema,
  VerificationTriageAttributionResultSchema,
  VerificationTriageComparisonStatusSchema,
  VerificationTriageFailureAttributionSchema,
  VerificationTriageBundleSubagentReportSchema,
  TaskScopedSubagentReportSchema,
  ChangeScopedSubagentReportSchema,
  ScopedSubagentReportSchema,
  normalizePersistedSubagentReportState,
  type PersistedSubagentReportAgent,
  type SubagentReportFieldSource,
  SUBAGENT_REPORT_PACKET_ANCHORS,
  SUBAGENT_WARN_FIRST_PACKET_ANCHORS,
  SUBAGENT_REPORT_FIELD_SOURCES,
  getSubagentReportPacketAnchors,
  type SubagentReportScope,
  type TaskSubagentReportScope,
  type ChangeSubagentReportScope,
  type EngineerSubagentReport,
  type ReviewerSubagentReport,
  type ChangeScopedReviewerSubagentReport,
  type DesignerSubagentReport,
  type TaskScopedSubagentReport,
  type ChangeScopedSubagentReport,
  type ResearcherSubagentReport,
  type TronOptimizationCandidateEvidence,
  type TronOptimizationCandidateCostShape,
  type TronOptimizationCandidate,
  type TronSubagentReport,
  type ScannerBundleSubagentReport,
  type VerificationTriageFailureMode,
  type VerificationTriageAttributionResult,
  type VerificationTriageComparisonStatus,
  type VerificationTriageFailureAttribution,
  type VerificationTriageBundleSubagentReport,
  type ScopedSubagentReport,
  type SupportedSubagentReport,
  type SubagentReport,
} from "./subagent-reports";

// =============================================================================
// Loop Ledger (read/projection vocabulary — evidence-only, non-authoritative)
// =============================================================================
export {
  LOOP_LEDGER_SCHEMA_VERSION,
  LoopKindSchema,
  type LoopKind,
  LoopVerdictSchema,
  type LoopVerdict,
  LoopSourceRefSchema,
  type LoopSourceRef,
  LoopLedgerEntrySchema,
  type LoopLedgerEntry,
  LoopLedgerSourceTotalsSchema,
  type LoopLedgerSourceTotals,
  LoopLedgerLatestStatusSchema,
  type LoopLedgerLatestStatus,
  LoopLedgerSummarySchema,
  type LoopLedgerSummary,
  LoopLedgerReadbackSchema,
  type LoopLedgerReadback,
} from "./loop-ledger";

// =============================================================================
// Briefing Packets
// =============================================================================
export {
  BRIEFING_PACKET_LANE_SCHEMA_VERSION,
  BRIEFING_PACKET_SESSION_METADATA_MAX_LENGTH,
  BriefingPacketLaneSchema,
  type BriefingPacketLane,
  BRIEFING_PACKET_LANE_TO_AGENT,
  BRIEFING_PACKET_LANE_DESCRIPTORS,
  type BriefingPacketLaneDescriptor,
  type ManifestLaneDescriptor,
  type VirtualLaneDescriptor,
  type ArchiveLaneDescriptor,
  BriefingFactOutcomeSchema,
  type BriefingFactOutcome,
  RESEARCH_CITATION_RENDER_LIMIT,
  BriefingFactSchema,
  type BriefingFact,
  BriefingPacketSectionKindSchema,
  type BriefingPacketSectionKind,
  BriefingPacketSectionSchema,
  type BriefingPacketSection,
  BriefingPacketSchema,
  type BriefingPacket,
  getBriefingPacketLaneAnchors,
  getBriefingPacketArchiveAnchors,
} from "./briefing-packets";

// =============================================================================
// Future Work Context Packets
// =============================================================================
export {
  FutureWorkContextPacketSchema,
  type FutureWorkContextPacket,
} from "./future-work";

// =============================================================================
// Work Graph (dependency graph + resume projection)
// =============================================================================
export {
  WorkNodeRefSchema,
  type WorkNodeRef,
  ResumeRowLifecycleSchema,
  type ResumeRowLifecycle,
  ResumeRowKindSchema,
  type ResumeRowKind,
  ResumeRowSchema,
  type ResumeRow,
  CrossEpicRedirectSchema,
  type CrossEpicRedirect,
  WorkGraphDiagnosticsSchema,
  type WorkGraphDiagnostics,
  ResumeProjectionSchema,
  type ResumeProjection,
  DependencyCycleErrorSchema,
  type DependencyCycleError,
  UnresolvedDependencyErrorSchema,
  type UnresolvedDependencyError,
  InvalidWorkNodeRefErrorSchema,
  type InvalidWorkNodeRefError,
  ShellPrereqNonterminalErrorSchema,
  type ShellPrereqNonterminalError,
  DepPrereqNonterminalErrorSchema,
  type DepPrereqNonterminalError,
} from "./work-graph";

// =============================================================================
// Gates
// =============================================================================
export {
  GATE_DEFS,
  GateIdSchema,
  type GateId,
  GATE_ORDER,
  type GateWorktreeImpact,
  GATE_WORKTREE_IMPACT,
  isMetadataOnlyGate,
  isWorktreeMutationGate,
  GateArtifactKindSchema,
  type GateArtifactKind,
  GateArtifactEvidenceSchema,
  type GateArtifactEvidence,
  GateReadinessBlockerSchema,
  type GateReadinessBlocker,
  GateCompletionSchema,
  type GateCompletion,
  GatesSchema,
  type Gates,
  isGateSatisfied,
  canCompleteGate,
  getIncompleteGates,
  allGatesSatisfied,
  createDefaultGates,
  GateCriterionSchema,
  type GateCriterion,
  type CriterionDef,
  GATE_CRITERIA_DEFINITIONS,
  AcceptanceCriteriaFreshnessSchema,
  type AcceptanceCriteriaFreshness,
  AcceptanceCriteriaSnapshotSchema,
  type AcceptanceCriteriaSnapshot,
  AcceptanceCriteriaProjectionSchema,
  type AcceptanceCriteriaProjection,
} from "./gates";

// =============================================================================
// Wisdom
// =============================================================================
export {
  WisdomTypeSchema,
  type WisdomType,
  WisdomEntrySchema,
  type WisdomEntry,
} from "./wisdom";

// =============================================================================
// Changes
// =============================================================================
export {
  ChangeStatusSchema,
  type ChangeStatus,
  normalizeLegacyChangeStatus,
  ChangeLifecycleStateSchema,
  type ChangeLifecycleState,
  ChangeListStatusFilterSchema,
  ChangeClosureSchema,
  type ChangeClosure,
  BulkCloseExplicitSelectorSchema,
  BulkCloseFilterSelectorSchema,
  type BulkCloseSelector,
  BulkCloseResultSchema,
  type BulkCloseResult,
  ReentryHistoryEntrySchema,
  type ReentryHistoryEntry,
  ClarifyFindingSnapshotSchema,
  type ClarifyFindingSnapshot,
  CrossProjectOriginSchema,
  type CrossProjectOrigin,
  CrossProjectLinkRelationshipSchema,
  CrossProjectLinkSchema,
  type CrossProjectLink,
  ExternalDependencyRelationshipSchema,
  ExternalDependencySchema,
  type ExternalDependency,
  ChangeRepoScopeSchema,
  type ChangeRepoScope,
  FastFollowOfSchema,
  type FastFollowOf,
  ChangeOriginKindSchema,
  type ChangeOriginKind,
  ChangeOriginSchema,
  type ChangeOrigin,
  Phase9FinalizationStatusSchema,
  type Phase9FinalizationStatus,
  ContractRigorSchema,
  type ContractRigor,
  ContractItemKindSchema,
  type ContractItemKind,
  ContractEvidencePolicySchema,
  type ContractEvidencePolicy,
  ContractItemStatusSchema,
  type ContractItemStatus,
  ContractEvidenceStatusSchema,
  type ContractEvidenceStatus,
  ContractItemVariantKindSchema,
  type ContractItemVariantKind,
  BehavioralVariantSchema,
  type BehavioralVariant,
  EvidenceVariantSchema,
  type EvidenceVariant,
  SpecLawVariantSchema,
  type SpecLawVariant,
  ConstraintVariantSchema,
  type ConstraintVariant,
  ContractItemVariantSchema,
  type ContractItemVariant,
  ContractSourceSchema,
  type ContractSource,
  ContractItemSchema,
  type ContractItem,
  ContractReviewMatrixRowSchema,
  type ContractReviewMatrixRow,
  ContractReviewMatrixSchema,
  type ContractReviewMatrix,
  ContractAmendmentSchema,
  type ContractAmendment,
  ChangeContractSchema,
  type ChangeContract,
  ChangeSchema,
  type Change,
  SignalRejectionSchema,
  type SignalRejection,
  TestRunRecordSchema,
  type TestRunRecord,
  ChangeCoordinationClaimResponsibilitySchema,
  type ChangeCoordinationClaimResponsibility,
  ChangeCoordinationClaimSchema,
  type ChangeCoordinationClaim,
  ProjectionCommitAuditEntrySchema,
  type ProjectionCommitAuditEntry,
  OpsFollowupKindSchema,
  type OpsFollowupKind,
  OpsRelationshipSchema,
  type OpsRelationship,
  type OpsFollowupStatus,
  OpsFollowupSourceSchema,
  type OpsFollowupSource,
  OpsEvidenceEntrySchema,
  OpsRunStatusSchema,
  type OpsRunStatus,
  OpsRunStepKindSchema,
  type OpsRunStepKind,
  OpsRunStepStatusSchema,
  type OpsRunStepStatus,
  OpsRunApprovalPolicySchema,
  type OpsRunApprovalPolicy,
  OpsRunArtifactRefSchema,
  type OpsRunArtifactRef,
  OpsRunPlanSchema,
  type OpsRunPlan,
  OpsRunStepSchema,
  type OpsRunStep,
  OpsRunEvidenceEntrySchema,
  type OpsRunEvidenceEntry,
  OpsRunSchema,
  type OpsRun,
  OpsFollowupProfileSchema,
  type OpsFollowupProfile,
  OpsFollowupResolutionSchema,
  type OpsFollowupResolution,
  type OpsFollowupResolutionReason,
  OpsFollowupLinkSchema,
  type OpsFollowupLink,
} from "./changes";

export {
  LightweightProfileCriterionIdSchema,
  type LightweightProfileCriterionId,
  LightweightProfileCriterionStatusSchema,
  type LightweightProfileCriterionStatus,
  LightweightProfileRequestSchema,
  type LightweightProfileRequest,
  LightweightProfileEvidenceSnapshotSchema,
  type LightweightProfileEvidenceSnapshot,
  LightweightProfileCriterionRecordSchema,
  type LightweightProfileCriterionRecord,
  LightweightProfileResultSchema,
  type LightweightProfileResult,
  LightweightProfilePhaseSchema,
  type LightweightProfilePhase,
  LightweightProfileEvaluationSchema,
  type LightweightProfileEvaluation,
  LightweightProfileOmissionPolicySchema,
  type LightweightProfileOmissionPolicy,
  LightweightChangeProfileSchema,
  type LightweightChangeProfile,
  buildLightweightProfileEvaluationKey,
  evaluateLightweightProfile,
  LIGHTWEIGHT_PROFILE_OMISSION_CATEGORIES,
} from "./lightweight-change-profile";

// =============================================================================
// Project
// =============================================================================
export {
  RelatedRepoSchema,
  type RelatedRepo,
  ProductLinkSchema,
  type ProductLink,
  FeatureFlagsSchema,
  withStabilityFeatureDefaults,
  resolveProjectFeaturePolicy,
  type FeaturePolicySource,
  type ResolvedFeatureFlag,
  type ResolvedProjectFeaturePolicy,
  type FeatureFlags,
  ProjectConfigSchema,
  type ProjectConfig,
  ProjectMetadataEntrySchema,
  type ProjectMetadataEntry,
} from "./project";

// =============================================================================
// Conformance
// =============================================================================
export {
  ConformanceVerdictSchema,
  type ConformanceVerdict,
  ConformanceRootKindSchema,
  type ConformanceRootKind,
  ConformanceLastVerdictSchema,
  type ConformanceLastVerdict,
  ConformanceOverrideSchema,
  type ConformanceOverride,
  ConformanceSpecEntrySchema,
  type ConformanceSpecEntry,
  ConformanceStateSchema,
  type ConformanceState,
  EMPTY_CONFORMANCE_STATE,
} from "./conformance";

// =============================================================================
// Status Markers
// =============================================================================
export { STATUS_MARKERS, type StatusMarker } from "./status";

// =============================================================================
// Tool Response Types
// =============================================================================
export type {
  SpecListResponse,
  ChangeListResponse,
  TaskReadyResponse,
  ChangeRecency,
  ProjectStatus,
  TerminalSource,
  TerminalWarningCode,
  TerminalWarning,
  TerminalHydrationStats,
  HydrationStats,
} from "./responses";

// =============================================================================
// TDD Helpers
// =============================================================================
export {
  TDD_REQUIRED_PATTERNS,
  TDD_TRIVIAL_PATTERNS,
  isLogicTask,
  isTrivialTask,
  truncateOutput,
} from "./tdd-helpers";

// =============================================================================
// Signal Payloads
// =============================================================================
export * from "./signals";
export * from "./archive-projection";
