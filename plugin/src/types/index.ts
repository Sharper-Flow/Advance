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
 *   - agenda.ts         Agenda*, AGENDA_PRIORITY_ORDER
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
  ArtifactPayloadSchema,
  type ArtifactPayload,
  ARTIFACT_SOFT_CAP,
  ARTIFACT_HARD_CAP,
  AGGREGATE_SOFT_CAP,
  AGGREGATE_HARD_CAP,
} from "./artifacts";

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
  DeltaSchema,
  type Delta,
} from "./specs";

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
  TaskTypeSchema,
  type TaskType,
  TaskContractRefsSchema,
  type TaskContractRefs,
  TaskSchema,
  type Task,
} from "./tasks";

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
  TronEvidenceSchema,
  TronSubagentReportSchema,
  ScannerBundleFindingSchema,
  ScannerBundleSubagentReportSchema,
  TaskScopedSubagentReportSchema,
  ChangeScopedSubagentReportSchema,
  ScopedSubagentReportSchema,
  SupportedSubagentReportSchema,
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
  type TronSubagentReport,
  type ScannerBundleSubagentReport,
  type ScopedSubagentReport,
  type SupportedSubagentReport,
  SubagentReportSchema,
  type SubagentReport,
} from "./subagent-reports";

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
  ChangeLifecycleStateSchema,
  type ChangeLifecycleState,
  ChangeListStatusFilterSchema,
  ChangeClosureSchema,
  type ChangeClosure,
  BulkCloseExplicitSelectorSchema,
  BulkCloseFilterSelectorSchema,
  BulkCloseSelectorSchema,
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
  OpsFollowupKindSchema,
  type OpsFollowupKind,
  OpsRelationshipSchema,
  type OpsRelationship,
  OpsFollowupStatusSchema,
  type OpsFollowupStatus,
  OpsFollowupSourceSchema,
  type OpsFollowupSource,
  OpsEvidenceEntrySchema,
  type OpsEvidenceEntry,
  OpsFollowupProfileSchema,
  type OpsFollowupProfile,
  OpsFollowupLinkSchema,
  type OpsFollowupLink,
} from "./changes";

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
// Agenda
// =============================================================================
export {
  AgendaPrioritySchema,
  type AgendaPriority,
  AgendaStatusSchema,
  type AgendaStatus,
  AgendaItemSchema,
  type AgendaItem,
  AgendaMetaSchema,
  type AgendaMeta,
  AGENDA_PRIORITY_ORDER,
} from "./agenda";

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
