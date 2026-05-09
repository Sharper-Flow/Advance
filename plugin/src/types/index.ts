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
// Gates
// =============================================================================
export {
  GATE_DEFS,
  GateIdSchema,
  type GateId,
  GATE_ORDER,
  GateCompletionSchema,
  type GateCompletion,
  GatesSchema,
  type Gates,
  isGateSatisfied,
  canCompleteGate,
  getIncompleteGates,
  allGatesSatisfied,
  createDefaultGates,
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
  FastFollowOfSchema,
  type FastFollowOf,
  ChangeOriginKindSchema,
  type ChangeOriginKind,
  ChangeOriginSchema,
  type ChangeOrigin,
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
} from "./changes";

// =============================================================================
// Project
// =============================================================================
export {
  RelatedRepoSchema,
  type RelatedRepo,
  FeatureFlagsSchema,
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
