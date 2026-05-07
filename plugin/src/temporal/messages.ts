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
  AcceptanceCriteriaSetSignalPayload,
  AgreementUpdatedSignalPayload,
  ArchiveRequestedSignalPayload,
  ChangeCancelledSignalPayload,
  ConformanceLockedSignalPayload,
  ConformanceOverriddenSignalPayload,
  ConformanceVerdictSignalPayload,
  DesignUpdatedSignalPayload,
  GateAwaitingApprovalSignalPayload,
  GateCompletedSignalPayload,
  GateInProgressSignalPayload,
  GateReenteredSignalPayload,
  GateStuckSignalPayload,
  ProblemStatementUpdatedSignalPayload,
  ProposalUpdatedSignalPayload,
  ReflectionRecordedSignalPayload,
  TaskAddedSignalPayload,
  TaskAssignedSignalPayload,
  TaskBlockedSignalPayload,
  TaskCancelledSignalPayload,
  TaskCompletedSignalPayload,
  TaskRemovedSignalPayload,
  TaskUpdatedSignalPayload,
  WisdomAddedSignalPayload,
  WorktreeCreatedSignalPayload,
  WorktreeDeletedSignalPayload,
} from "../types";
import type {
  ChangeWorkflowBootstrapState,
  ChangeWorkflowState,
} from "./contracts";
import {
  CHANGE_WORKFLOW_COMPAT_QUERY_NAMES,
  CHANGE_WORKFLOW_QUERY_NAMES,
  CHANGE_WORKFLOW_SIGNAL_NAMES,
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
export const getWorktreesQuery = wf.defineQuery<
  NonNullable<ChangeWorkflowState["worktrees"]>
>(CHANGE_WORKFLOW_QUERY_NAMES.getWorktrees);
export const getConformanceStateQuery = wf.defineQuery<
  ChangeWorkflowState["conformance"]
>(CHANGE_WORKFLOW_QUERY_NAMES.getConformanceState);
export const getCurrentBucketQuery = wf.defineQuery<string>(
  CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.getCurrentBucket,
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
export const acceptanceCriteriaSetSignal = wf.defineSignal<
  [AcceptanceCriteriaSetSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.acceptanceCriteriaSet);
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
export const taskBlockedSignal = wf.defineSignal<[TaskBlockedSignalPayload]>(
  CHANGE_WORKFLOW_SIGNAL_NAMES.taskBlocked,
);
export const taskCancelledSignal = wf.defineSignal<
  [TaskCancelledSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.taskCancelled);
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
export const reflectionRecordedSignal = wf.defineSignal<
  [ReflectionRecordedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.reflectionRecorded);
export const worktreeCreatedSignal = wf.defineSignal<
  [WorktreeCreatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.worktreeCreated);
export const worktreeDeletedSignal = wf.defineSignal<
  [WorktreeDeletedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.worktreeDeleted);
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
export const changeCancelledSignal = wf.defineSignal<
  [ChangeCancelledSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.changeCancelled);
export const updateArtifactMetadataSignal = wf.defineSignal<
  [
    {
      kind: import("./contracts").ArtifactKind;
      metadata: import("./contracts").ArtifactMetadata;
    },
  ]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.updateArtifactMetadata);
export const archiveChangeSignal = wf.defineSignal(
  CHANGE_WORKFLOW_SIGNAL_NAMES.archiveChange,
);
export const closeChangeSignal = wf.defineSignal<
  [import("../types").ChangeClosure]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.closeChange);
