/**
 * Temporal Query/Signal Definitions — Client-Side Bindings
 *
 * These `wf.defineQuery` / `wf.defineSignal` calls declare client-side
 * bindings for the definitions used inside `workflows.ts`. Temporal's
 * workflow bundle is compiled in isolation, so handler tokens created inside
 * the workflow cannot be imported by the outer client/adapter layer. The
 * string names are the actual wire contract; the handler *tokens* are local
 * bindings.
 *
 * When adding or renaming a query/signal:
 *   1. Update the name constant in `contracts.ts` (single source of truth).
 *   2. Update both this file and `workflows.ts` so every call site uses the
 *      same constant, not a raw string literal.
 *   3. Prefer the constants from `contracts.ts` over inline string literals
 *      so drift between the two files is impossible.
 */
import * as wf from "@temporalio/workflow";

import type {
  AcceptanceCriteriaProjection,
  AcceptanceCriteriaSetSignalPayload,
  AcceptanceUpdatedSignalPayload,
  AgreementUpdatedSignalPayload,
  ArchiveConvergedSignalPayload,
  ArchiveRequestedSignalPayload,
  ChangeCancelledSignalPayload,
  ChangeLinkedSignalPayload,
  ChangeProjectionStatusUpdatedSignalPayload,
  ChangeRetargetedSignalPayload,
  ChangeUnlinkedSignalPayload,
  ConformanceLockedSignalPayload,
  ConformanceOverriddenSignalPayload,
  ConformanceVerdictSignalPayload,
  ContractAmendedSignalPayload,
  ContractReviewMatrixSetSignalPayload,
  ContractSetSignalPayload,
  DesignConcernDispositionedSignalPayload,
  DesignUpdatedSignalPayload,
  EntriesReorderedSignalPayload,
  EntryTerminalSummarySignalPayload,
  EpicMembershipClearedSignalPayload,
  EpicMembershipSetSignalPayload,
  EpicArchivedSignalPayload,
  EpicCreatedSignalPayload,
  EpicMergedSignalPayload,
  EpicScopeUpdatedSignalPayload,
  EpicUpdatedSignalPayload,
  ExecutiveSummaryUpdatedSignalPayload,
  GateAwaitingApprovalSignalPayload,
  GateCompletedSignalPayload,
  GateInProgressSignalPayload,
  GateReenteredSignalPayload,
  GateStuckSignalPayload,
  OpsEvidenceAppendedSignalPayload,
  OpsFollowupLinkAddedSignalPayload,
  OpsFollowupResolutionUpsertedSignalPayload,
  OpsFollowupSeededSignalPayload,
  OpsRunEvidenceAppendedSignalPayload,
  OpsRunUpsertedSignalPayload,
  LightweightProfileEvaluatedSignalPayload,
  LightweightProfileRequestedSignalPayload,
  ProblemStatementUpdatedSignalPayload,
  ProposalUpdatedSignalPayload,
  Phase9StatusUpdatedSignalPayload,
  ReflectionRecordedSignalPayload,
  ShellAddedSignalPayload,
  ShellPromotedSignalPayload,
  SpecDeltaAddedSignalPayload,
  SpecDeltaAmendedSignalPayload,
  SpecDeltaModifiedSignalPayload,
  SpecDeltaRemovedSignalPayload,
  SpecDeltaRenamedSignalPayload,
  SpecDeltaRetractedSignalPayload,
  SubagentReportSubmittedSignalPayload,
  TaskAddedSignalPayload,
  TaskAssignedSignalPayload,
  TaskBlockedSignalPayload,
  TaskCancelledSignalPayload,
  TaskCompletedSignalPayload,
  TaskRemovedSignalPayload,
  TaskUpdatedSignalPayload,
  TestRunRecordedSignalPayload,
  VerificationEvidenceDispositionedSignalPayload,
  WisdomAddedSignalPayload,
  WorktreeAttachedSignalPayload,
  WorktreeAutoManagedSignalPayload,
  WorktreeCreatedSignalPayload,
  WorktreeDeletedSignalPayload,
  WorktreeRegistrationRepairedSignalPayload,
  WorktreeSetupFailedSignalPayload,
  WorkerBundleImpactSetSignalPayload,
  WorkerBundleProvenanceRecordedSignalPayload,
} from "../types";
import type { MutationReceipt } from "./contracts";
import type { OperationLedgerEntry } from "./contracts";
import type {
  ChangeWorkflowBootstrapState,
  ChangeWorkflowState,
  CrossProjectCoordinationUpdatedSignalPayload,
  EpicWorkflowState,
} from "./contracts";
import type { WorkflowDirective } from "../utils/workflow-directive";
import type { PhasePlan } from "../utils/phase-plan";
import {
  CHANGE_WORKFLOW_COMPAT_QUERY_NAMES,
  CHANGE_WORKFLOW_QUERY_NAMES,
  CHANGE_WORKFLOW_SIGNAL_NAMES,
  EPIC_WORKFLOW_QUERY_NAMES,
  EPIC_WORKFLOW_SIGNAL_NAMES,
} from "./contracts";

export const changeBootstrapQuery =
  wf.defineQuery<ChangeWorkflowBootstrapState>(
    CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.bootstrap,
  );
export const getStateQuery = wf.defineQuery<ChangeWorkflowState>(
  CHANGE_WORKFLOW_QUERY_NAMES.getState,
);
export const changeStateQuery = getStateQuery;
export const getChangeStateQuery = changeStateQuery;
export const getTasksQuery = wf.defineQuery<
  ChangeWorkflowState["tasks"],
  [
    ChangeWorkflowState["tasks"][number]["status"] | undefined,
    string | undefined,
  ]
>(CHANGE_WORKFLOW_QUERY_NAMES.getTasks);
export const getGateStatusQuery = wf.defineQuery<
  | ChangeWorkflowState["gates"]
  | ChangeWorkflowState["gates"][keyof ChangeWorkflowState["gates"]],
  [keyof ChangeWorkflowState["gates"] | undefined]
>(CHANGE_WORKFLOW_QUERY_NAMES.getGateStatus);
export const getGateCriteriaQuery = wf.defineQuery<
  ChangeWorkflowState["gateCriteria"],
  []
>(CHANGE_WORKFLOW_QUERY_NAMES.getGateCriteria);
export const getAcceptanceCriteriaProjectionQuery = wf.defineQuery<
  AcceptanceCriteriaProjection,
  []
>(CHANGE_WORKFLOW_QUERY_NAMES.getAcceptanceCriteriaProjection);
export const getWorktreesQuery = wf.defineQuery<
  NonNullable<ChangeWorkflowState["worktrees"]>
>(CHANGE_WORKFLOW_QUERY_NAMES.getWorktrees);
export const getConformanceStateQuery = wf.defineQuery<
  ChangeWorkflowState["conformance"]
>(CHANGE_WORKFLOW_QUERY_NAMES.getConformanceState);
export const getMutationReceiptQuery = wf.defineQuery<
  MutationReceipt | undefined,
  [string]
>(CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt);
export const getOperationLedgerOutcomeQuery = wf.defineQuery<
  OperationLedgerEntry | undefined,
  [string]
>(CHANGE_WORKFLOW_QUERY_NAMES.getOperationLedgerOutcome);
export const getCurrentBucketQuery = wf.defineQuery<string>(
  CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.getCurrentBucket,
);
export const getDirectiveQuery = wf.defineQuery<WorkflowDirective>(
  CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.getDirective,
);
export const getPhasePlanQuery = wf.defineQuery<PhasePlan>(
  CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.getPhasePlan,
);
export const getReadyTasksQuery = wf.defineQuery<
  ReturnType<typeof import("./change-state").getReadyTasksFromChangeState>
>(CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.ready);
export const getInvestmentReportQuery = wf.defineQuery<unknown>(
  CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.getInvestmentReport,
);
export const getReviewVerificationQuery = wf.defineQuery<unknown>(
  CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.getReviewVerification,
);
export const getTaskRunSummaryQuery = wf.defineQuery<unknown>(
  CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.getTaskRunSummary,
);
export const changeTasksQuery = wf.defineQuery<
  ChangeWorkflowState["tasks"],
  [
    ChangeWorkflowState["tasks"][number]["status"] | undefined,
    string | undefined,
  ]
>(CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.tasks);
export const changeReadyQuery = wf.defineQuery<
  ReturnType<typeof import("./change-state").getReadyTasksFromChangeState>
>(CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.ready);
export const changeTaskQuery = wf.defineQuery<
  ChangeWorkflowState["tasks"][number] | null,
  [string]
>(CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.task);

export const proposalUpdatedSignal = wf.defineSignal<
  [ProposalUpdatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.proposalUpdated);
export const problemStatementUpdatedSignal = wf.defineSignal<
  [ProblemStatementUpdatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.problemStatementUpdated);
export const agreementUpdatedSignal = wf.defineSignal<
  [AgreementUpdatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.agreementUpdated);
export const designUpdatedSignal = wf.defineSignal<
  [DesignUpdatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.designUpdated);
export const executiveSummaryUpdatedSignal = wf.defineSignal<
  [ExecutiveSummaryUpdatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.executiveSummaryUpdated);
export const acceptanceUpdatedSignal = wf.defineSignal<
  [AcceptanceUpdatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.acceptanceUpdated);
export const acceptanceCriteriaSetSignal = wf.defineSignal<
  [AcceptanceCriteriaSetSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.acceptanceCriteriaSet);
export const contractSetSignal = wf.defineSignal<[ContractSetSignalPayload]>(
  CHANGE_WORKFLOW_SIGNAL_NAMES.contractSet,
);
export const contractAmendedSignal = wf.defineSignal<
  [ContractAmendedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.contractAmended);
export const contractReviewMatrixSetSignal = wf.defineSignal<
  [ContractReviewMatrixSetSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.contractReviewMatrixSet);
export const taskAddedSignal = wf.defineSignal<[TaskAddedSignalPayload]>(
  CHANGE_WORKFLOW_SIGNAL_NAMES.taskAdded,
);
export const taskUpdatedSignal = wf.defineSignal<[TaskUpdatedSignalPayload]>(
  CHANGE_WORKFLOW_SIGNAL_NAMES.taskUpdated,
);
export const taskRemovedSignal = wf.defineSignal<[TaskRemovedSignalPayload]>(
  CHANGE_WORKFLOW_SIGNAL_NAMES.taskRemoved,
);
export const taskAssignedSignal = wf.defineSignal<[TaskAssignedSignalPayload]>(
  CHANGE_WORKFLOW_SIGNAL_NAMES.taskAssigned,
);
export const taskCompletedSignal = wf.defineSignal<
  [TaskCompletedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.taskCompleted);
export const testRunRecordedSignal = wf.defineSignal<
  [TestRunRecordedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.testRunRecorded);
export const subagentReportSubmittedSignal = wf.defineSignal<
  [SubagentReportSubmittedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.subagentReportSubmitted);
export const taskBlockedSignal = wf.defineSignal<[TaskBlockedSignalPayload]>(
  CHANGE_WORKFLOW_SIGNAL_NAMES.taskBlocked,
);
export const taskCancelledSignal = wf.defineSignal<
  [TaskCancelledSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.taskCancelled);
export const designConcernDispositionedSignal = wf.defineSignal<
  [DesignConcernDispositionedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.designConcernDispositioned);
export const verificationEvidenceDispositionedSignal = wf.defineSignal<
  [VerificationEvidenceDispositionedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.verificationEvidenceDispositioned);
export const gateInProgressSignal = wf.defineSignal<
  [GateInProgressSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.gateInProgress);
export const gateAwaitingApprovalSignal = wf.defineSignal<
  [GateAwaitingApprovalSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.gateAwaitingApproval);
export const gateStuckSignal = wf.defineSignal<[GateStuckSignalPayload]>(
  CHANGE_WORKFLOW_SIGNAL_NAMES.gateStuck,
);
export const gateCompletedSignal = wf.defineSignal<
  [GateCompletedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.gateCompleted);
export const gateReenteredSignal = wf.defineSignal<
  [GateReenteredSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.gateReentered);
export const wisdomAddedSignal = wf.defineSignal<[WisdomAddedSignalPayload]>(
  CHANGE_WORKFLOW_SIGNAL_NAMES.wisdomAdded,
);
export const specDeltaAddedSignal = wf.defineSignal<
  [SpecDeltaAddedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.specDeltaAdded);
export const specDeltaModifiedSignal = wf.defineSignal<
  [SpecDeltaModifiedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.specDeltaModified);
export const specDeltaAmendedSignal = wf.defineSignal<
  [SpecDeltaAmendedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.specDeltaAmended);
export const specDeltaRetractedSignal = wf.defineSignal<
  [SpecDeltaRetractedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.specDeltaRetracted);
export const specDeltaRemovedSignal = wf.defineSignal<
  [SpecDeltaRemovedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.specDeltaRemoved);
export const specDeltaRenamedSignal = wf.defineSignal<
  [SpecDeltaRenamedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.specDeltaRenamed);
export const reflectionRecordedSignal = wf.defineSignal<
  [ReflectionRecordedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.reflectionRecorded);
export const worktreeCreatedSignal = wf.defineSignal<
  [WorktreeCreatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.worktreeCreated);
export const worktreeRegistrationRepairedSignal = wf.defineSignal<
  [WorktreeRegistrationRepairedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.worktreeRegistrationRepaired);
export const worktreeDeletedSignal = wf.defineSignal<
  [WorktreeDeletedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.worktreeDeleted);
export const worktreeSetupFailedSignal = wf.defineSignal<
  [WorktreeSetupFailedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.worktreeSetupFailed);
export const worktreeAutoManagedSignal = wf.defineSignal<
  [WorktreeAutoManagedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.worktreeAutoManaged);
export const worktreeAttachedSignal = wf.defineSignal<
  [WorktreeAttachedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.worktreeAttached);
export const crossProjectCoordinationUpdatedSignal = wf.defineSignal<
  [CrossProjectCoordinationUpdatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.crossProjectCoordinationUpdated);
export const conformanceLockedSignal = wf.defineSignal<
  [ConformanceLockedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.conformanceLocked);
export const conformanceVerdictSignal = wf.defineSignal<
  [ConformanceVerdictSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.conformanceVerdict);
export const conformanceOverriddenSignal = wf.defineSignal<
  [ConformanceOverriddenSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.conformanceOverridden);
export const archiveRequestedSignal = wf.defineSignal<
  [ArchiveRequestedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.archiveRequested);
export const archiveConvergedSignal = wf.defineSignal<
  [ArchiveConvergedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.archiveConverged);
export const phase9StatusUpdatedSignal = wf.defineSignal<
  [Phase9StatusUpdatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.phase9StatusUpdated);
export const changeCancelledSignal = wf.defineSignal<
  [ChangeCancelledSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.changeCancelled);
export const opsFollowupSeededSignal = wf.defineSignal<
  [OpsFollowupSeededSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.opsFollowupSeeded);
export const opsFollowupLinkAddedSignal = wf.defineSignal<
  [OpsFollowupLinkAddedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.opsFollowupLinkAdded);
export const opsFollowupResolutionUpsertedSignal = wf.defineSignal<
  [OpsFollowupResolutionUpsertedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.opsFollowupResolutionUpserted);
export const opsEvidenceAppendedSignal = wf.defineSignal<
  [OpsEvidenceAppendedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.opsEvidenceAppended);
export const opsRunUpsertedSignal = wf.defineSignal<
  [OpsRunUpsertedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.opsRunUpserted);
export const opsRunEvidenceAppendedSignal = wf.defineSignal<
  [OpsRunEvidenceAppendedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.opsRunEvidenceAppended);
export const lightweightProfileRequestedSignal = wf.defineSignal<
  [LightweightProfileRequestedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.lightweightProfileRequested);
export const lightweightProfileEvaluatedSignal = wf.defineSignal<
  [LightweightProfileEvaluatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.lightweightProfileEvaluated);
export const epicMembershipSetSignal = wf.defineSignal<
  [EpicMembershipSetSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.epicMembershipSet);
export const epicMembershipClearedSignal = wf.defineSignal<
  [EpicMembershipClearedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.epicMembershipCleared);
export const updateArtifactMetadataSignal = wf.defineSignal<
  [
    {
      kind: import("./contracts").ArtifactKind;
      metadata: import("./contracts").ArtifactMetadata;
    },
  ]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.updateArtifactMetadata);
export const originRepairedSignal = wf.defineSignal<
  [import("../types").OriginRepairedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.originRepaired);
export const archiveChangeSignal = wf.defineSignal(
  CHANGE_WORKFLOW_SIGNAL_NAMES.archiveChange,
);
export const closeChangeSignal = wf.defineSignal<
  [import("../types").ChangeClosure]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.closeChange);

export const prepareBatchCloseSignal = wf.defineSignal<
  [import("../types").PrepareBatchCloseSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.prepareBatchClose);
export const commitBatchCloseSignal = wf.defineSignal<
  [import("../types").CommitBatchCloseSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.commitBatchClose);
export const abortBatchCloseSignal = wf.defineSignal<
  [import("../types").AbortBatchCloseSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.abortBatchClose);

export const workerBundleProvenanceRecordedSignal = wf.defineSignal<
  [WorkerBundleProvenanceRecordedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.workerBundleProvenanceRecorded);

export const workerBundleImpactSetSignal = wf.defineSignal<
  [WorkerBundleImpactSetSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.workerBundleImpactSet);

export const releaseNotesSetSignal = wf.defineSignal<
  [import("../types").ReleaseNotesSetSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.releaseNotesSet);

export const coordinationClaimSetSignal = wf.defineSignal<
  [import("../types").CoordinationClaimSetSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.coordinationClaimSet);

// Epic workflow bindings
export const getEpicStateQuery = wf.defineQuery<EpicWorkflowState>(
  EPIC_WORKFLOW_QUERY_NAMES.getState,
);
export const getEpicQuery = wf.defineQuery<EpicWorkflowState["epic"]>(
  EPIC_WORKFLOW_QUERY_NAMES.getEpic,
);

export const epicCreatedSignal = wf.defineSignal<[EpicCreatedSignalPayload]>(
  EPIC_WORKFLOW_SIGNAL_NAMES.epicCreated,
);
export const epicUpdatedSignal = wf.defineSignal<[EpicUpdatedSignalPayload]>(
  EPIC_WORKFLOW_SIGNAL_NAMES.epicUpdated,
);
export const epicScopeUpdatedSignal = wf.defineSignal<
  [EpicScopeUpdatedSignalPayload]
>(EPIC_WORKFLOW_SIGNAL_NAMES.epicScopeUpdated);
export const epicMergedSignal = wf.defineSignal<[EpicMergedSignalPayload]>(
  EPIC_WORKFLOW_SIGNAL_NAMES.epicMerged,
);
export const shellAddedSignal = wf.defineSignal<[ShellAddedSignalPayload]>(
  EPIC_WORKFLOW_SIGNAL_NAMES.shellAdded,
);
export const shellPromotedSignal = wf.defineSignal<
  [ShellPromotedSignalPayload]
>(EPIC_WORKFLOW_SIGNAL_NAMES.shellPromoted);
export const changeLinkedSignal = wf.defineSignal<[ChangeLinkedSignalPayload]>(
  EPIC_WORKFLOW_SIGNAL_NAMES.changeLinked,
);
export const changeRetargetedSignal = wf.defineSignal<
  [ChangeRetargetedSignalPayload]
>(EPIC_WORKFLOW_SIGNAL_NAMES.changeRetargeted);
export const changeProjectionStatusUpdatedSignal = wf.defineSignal<
  [ChangeProjectionStatusUpdatedSignalPayload]
>(EPIC_WORKFLOW_SIGNAL_NAMES.changeProjectionStatusUpdated);
export const changeUnlinkedSignal = wf.defineSignal<
  [ChangeUnlinkedSignalPayload]
>(EPIC_WORKFLOW_SIGNAL_NAMES.changeUnlinked);
export const entriesReorderedSignal = wf.defineSignal<
  [EntriesReorderedSignalPayload]
>(EPIC_WORKFLOW_SIGNAL_NAMES.entriesReordered);
export const entryTerminalSummarySignal = wf.defineSignal<
  [EntryTerminalSummarySignalPayload]
>(EPIC_WORKFLOW_SIGNAL_NAMES.entryTerminalSummary);
export const epicArchivedSignal = wf.defineSignal<[EpicArchivedSignalPayload]>(
  EPIC_WORKFLOW_SIGNAL_NAMES.epicArchived,
);
export const searchAttributesRefreshedSignal = wf.defineSignal<
  [import("../types").EpicSearchAttributesRefreshedSignalPayload]
>(EPIC_WORKFLOW_SIGNAL_NAMES.searchAttributesRefreshed);
