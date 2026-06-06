import * as wf from "@temporalio/workflow";
import { bucketCtxFromState, deriveBucket } from "../utils/buckets";
import type { GateReadinessBlocker } from "../types";
import { applyAndUpsertSearchAttributes } from "./search-attributes";
import {
  ARTIFACT_BACKED_GATES,
  evaluateGateReadiness,
  MIN_GATE_ARTIFACT_NON_WHITESPACE_CHARS,
  renderAcceptanceProjection,
  stateBackedAcceptanceProof,
  stateBackedArtifactEvidence,
} from "./gate-readiness";
import {
  ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES,
  CHANGE_WORKFLOW_COMPAT_QUERY_NAMES,
  CHANGE_WORKFLOW_QUERY_NAMES,
  CHANGE_WORKFLOW_SIGNAL_NAMES,
  resolveHistoryThresholds,
  shouldContinueAsNewFromInfo,
  type ChangeWorkflowState,
  type ChangeWorkflowBootstrapState,
  type ChangeWorkflowInput,
} from "./contracts";
import {
  applyAcceptanceCriteriaSetToState,
  applyAgreementUpdatedToState,
  applyArchiveRequestedToState,
  applyChangeCancelledToState,
  applyConformanceLockedToState,
  applyConformanceOverriddenToState,
  applyConformanceVerdictToState,
  applyContractAmendedToState,
  applyContractReviewMatrixSetToState,
  applyContractSetToState,
  applyAcceptanceUpdatedToState,
  applyDesignUpdatedToState,
  applyExecutiveSummaryUpdatedToState,
  applyGateAwaitingApprovalToState,
  applyGateCompletedToState,
  applyGateInProgressToState,
  applyGateReenteredToState,
  applyGateStuckToState,
  applyProblemStatementUpdatedToState,
  applyProposalUpdatedToState,
  applyReflectionRecordedToState,
  applySignalRejectionToState,
  applySubagentReportSubmittedToState,
  applyTaskAddedToState,
  applyTaskAssignedToState,
  applyTaskBlockedToState,
  applyTaskCancelledToState,
  applyTaskCompletedToState,
  applyTaskRemovedToState,
  applyTaskUpdatedToState,
  applyWisdomAddedToState,
  applyWorktreeAttachedToState,
  applyWorktreeAutoManagedToState,
  applyWorktreeCreatedToState,
  applyWorktreeDeletedToState,
  archiveChangeInChangeState,
  closeChangeInChangeState,
  createChangeWorkflowState,
  getTaskFromChangeState,
  getReadyTasksFromChangeState,
  listTasksFromChangeState,
  updateArtifactMetadataInChangeState,
} from "./change-state";

type WriteChangeProjectionActivityResult =
  | { ok: true; path: string }
  | { ok: false; error: string; path?: undefined };

interface ChangeProjectionActivities {
  writeChangeProjection(input: {
    projectionChangesDir: string;
    state: ChangeWorkflowState;
    projectedAt: string;
  }): Promise<WriteChangeProjectionActivityResult>;
  archiveChangeActivity(input: {
    state: ChangeWorkflowState;
    projects: Array<{ projectPath: string }>;
    status: "archived" | "cancelled";
    archivedAt: string;
    approvalEvidence: string;
    approvedBy: string;
  }): Promise<
    | { ok: true; changeId: string; projects: unknown[] }
    | { ok: false; error: string; phase: string }
  >;
  inspectArtifactActivity(input: {
    changesDir: string;
    changeId: string;
    kind: Extract<
      import("../types").ArtifactKind,
      "proposal" | "agreement" | "design" | "acceptance" | "executiveSummary"
    >;
  }): Promise<
    | {
        ok: true;
        kind: Extract<
          import("../types").ArtifactKind,
          | "proposal"
          | "agreement"
          | "design"
          | "acceptance"
          | "executiveSummary"
        >;
        path: string;
        contentHash: string;
        nonWhitespaceChars: number;
        checkedAt: string;
      }
    | {
        ok: false;
        kind: Extract<
          import("../types").ArtifactKind,
          | "proposal"
          | "agreement"
          | "design"
          | "acceptance"
          | "executiveSummary"
        >;
        path: string;
        code: "missing" | "unreadable";
        error: string;
        checkedAt: string;
      }
  >;
  writeArtifactActivity(input: {
    changesDir: string;
    changeId: string;
    // executiveSummary added for state-backed acceptance materialization
    // (completeStateBackedGate AC7): the executive-summary.md disk file is
    // written at acceptance time so createArchive includes it in the bundle.
    kind:
      | "proposal"
      | "agreement"
      | "design"
      | "acceptance"
      | "executiveSummary";
    content: string;
  }): Promise<
    { ok: true; path: string } | { ok: false; error: string; path?: undefined }
  >;
}

const {
  archiveChangeActivity,
  inspectArtifactActivity,
  writeArtifactActivity,
  writeChangeProjection,
} = wf.proxyActivities<ChangeProjectionActivities>({
  startToCloseTimeout: "10 seconds",
  retry: { maximumAttempts: 3 },
});

const changeBootstrapQuery = wf.defineQuery<ChangeWorkflowBootstrapState>(
  CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.bootstrap,
);
const getStateQuery = wf.defineQuery<ChangeWorkflowState>(
  CHANGE_WORKFLOW_QUERY_NAMES.getState,
);
const getTasksQuery = wf.defineQuery<
  ChangeWorkflowState["tasks"],
  [
    ChangeWorkflowState["tasks"][number]["status"] | undefined,
    string | undefined,
  ]
>(CHANGE_WORKFLOW_QUERY_NAMES.getTasks);
const getGateStatusQuery = wf.defineQuery<
  | ChangeWorkflowState["gates"]
  | ChangeWorkflowState["gates"][keyof ChangeWorkflowState["gates"]],
  [keyof ChangeWorkflowState["gates"] | undefined]
>(CHANGE_WORKFLOW_QUERY_NAMES.getGateStatus);
const getWorktreesQuery = wf.defineQuery<
  NonNullable<ChangeWorkflowState["worktrees"]>
>(CHANGE_WORKFLOW_QUERY_NAMES.getWorktrees);
const getConformanceStateQuery = wf.defineQuery<
  ChangeWorkflowState["conformance"]
>(CHANGE_WORKFLOW_QUERY_NAMES.getConformanceState);
const changeTasksQuery = wf.defineQuery<
  ChangeWorkflowState["tasks"],
  [
    ChangeWorkflowState["tasks"][number]["status"] | undefined,
    string | undefined,
  ]
>(CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.tasks);
const changeReadyQuery = wf.defineQuery<
  ReturnType<typeof getReadyTasksFromChangeState>
>(CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.ready);
const getCurrentBucketQuery = wf.defineQuery<ReturnType<typeof deriveBucket>>(
  CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.getCurrentBucket,
);
const getInvestmentReportQuery = wf.defineQuery<{
  taskCounts: {
    total: number;
    done: number;
    pending: number;
    blocked: number;
    inProgress: number;
    cancelled: number;
  };
  retryCount: number;
}>(CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.getInvestmentReport);
const getReviewVerificationQuery = wf.defineQuery<{
  acceptanceCriteriaCount: number;
  incompleteTaskCount: number;
  gatesComplete: boolean;
  readyForAcceptance: boolean;
}>(CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.getReviewVerification);
const getTaskRunSummaryQuery = wf.defineQuery<
  Array<{
    taskId: string;
    status: ChangeWorkflowState["tasks"][number]["status"];
    startedAt?: string | null;
    completedAt?: string | null;
    verification?: string;
    checkpointSha?: string;
    attempts: number;
  }>
>(CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.getTaskRunSummary);
const changeTaskQuery = wf.defineQuery<
  ChangeWorkflowState["tasks"][number] | null,
  [string]
>(CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.task);
const proposalUpdatedSignal = wf.defineSignal<
  [import("../types").ProposalUpdatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.proposalUpdated);
const problemStatementUpdatedSignal = wf.defineSignal<
  [import("../types").ProblemStatementUpdatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.problemStatementUpdated);
const agreementUpdatedSignal = wf.defineSignal<
  [import("../types").AgreementUpdatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.agreementUpdated);
const designUpdatedSignal = wf.defineSignal<
  [import("../types").DesignUpdatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.designUpdated);
const executiveSummaryUpdatedSignal = wf.defineSignal<
  [import("../types").ExecutiveSummaryUpdatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.executiveSummaryUpdated);
const acceptanceUpdatedSignal = wf.defineSignal<
  [import("../types").AcceptanceUpdatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.acceptanceUpdated);
const acceptanceCriteriaSetSignal = wf.defineSignal<
  [import("../types").AcceptanceCriteriaSetSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.acceptanceCriteriaSet);
const contractSetSignal = wf.defineSignal<
  [import("../types").ContractSetSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.contractSet);
const contractAmendedSignal = wf.defineSignal<
  [import("../types").ContractAmendedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.contractAmended);
const contractReviewMatrixSetSignal = wf.defineSignal<
  [import("../types").ContractReviewMatrixSetSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.contractReviewMatrixSet);
const taskAddedSignal = wf.defineSignal<
  [import("../types").TaskAddedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.taskAdded);
const taskUpdatedSignal = wf.defineSignal<
  [import("../types").TaskUpdatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.taskUpdated);
const taskRemovedSignal = wf.defineSignal<
  [import("../types").TaskRemovedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.taskRemoved);
const taskAssignedSignal = wf.defineSignal<
  [import("../types").TaskAssignedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.taskAssigned);
const taskCompletedSignal = wf.defineSignal<
  [import("../types").TaskCompletedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.taskCompleted);
const subagentReportSubmittedSignal = wf.defineSignal<
  [import("../types").SubagentReportSubmittedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.subagentReportSubmitted);
const taskBlockedSignal = wf.defineSignal<
  [import("../types").TaskBlockedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.taskBlocked);
const taskCancelledSignal = wf.defineSignal<
  [import("../types").TaskCancelledSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.taskCancelled);
const gateInProgressSignal = wf.defineSignal<
  [import("../types").GateInProgressSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.gateInProgress);
const gateAwaitingApprovalSignal = wf.defineSignal<
  [import("../types").GateAwaitingApprovalSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.gateAwaitingApproval);
const gateStuckSignal = wf.defineSignal<
  [import("../types").GateStuckSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.gateStuck);
const gateCompletedSignal = wf.defineSignal<
  [import("../types").GateCompletedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.gateCompleted);
const gateReenteredSignal = wf.defineSignal<
  [import("../types").GateReenteredSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.gateReentered);
const wisdomAddedSignal = wf.defineSignal<
  [import("../types").WisdomAddedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.wisdomAdded);
const reflectionRecordedSignal = wf.defineSignal<
  [import("../types").ReflectionRecordedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.reflectionRecorded);
const worktreeCreatedSignal = wf.defineSignal<
  [import("../types").WorktreeCreatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.worktreeCreated);
const worktreeDeletedSignal = wf.defineSignal<
  [import("../types").WorktreeDeletedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.worktreeDeleted);
const worktreeAutoManagedSignal = wf.defineSignal<
  [import("../types").WorktreeAutoManagedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.worktreeAutoManaged);
const worktreeAttachedSignal = wf.defineSignal<
  [import("../types").WorktreeAttachedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.worktreeAttached);
const conformanceLockedSignal = wf.defineSignal<
  [import("../types").ConformanceLockedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.conformanceLocked);
const conformanceVerdictSignal = wf.defineSignal<
  [import("../types").ConformanceVerdictSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.conformanceVerdict);
const conformanceOverriddenSignal = wf.defineSignal<
  [import("../types").ConformanceOverriddenSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.conformanceOverridden);
const archiveRequestedSignal = wf.defineSignal<
  [import("../types").ArchiveRequestedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.archiveRequested);
const phase9StatusUpdatedSignal = wf.defineSignal<
  [import("../types").Phase9StatusUpdatedSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.phase9StatusUpdated);
const changeCancelledSignal = wf.defineSignal<
  [import("../types").ChangeCancelledSignalPayload]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.changeCancelled);
const updateArtifactMetadataSignal = wf.defineSignal<
  [
    {
      kind: import("./contracts").ArtifactKind;
      metadata: import("./contracts").ArtifactMetadata;
    },
  ]
>(CHANGE_WORKFLOW_SIGNAL_NAMES.updateArtifactMetadata);
const archiveChangeSignal = wf.defineSignal(
  CHANGE_WORKFLOW_SIGNAL_NAMES.archiveChange,
);
const closeChangeSignal = wf.defineSignal<[import("../types").ChangeClosure]>(
  CHANGE_WORKFLOW_SIGNAL_NAMES.closeChange,
);
// Update definitions removed — signal-only architecture (R1.1)

function deriveInvestmentReportFromState(state: ChangeWorkflowState): {
  taskCounts: {
    total: number;
    done: number;
    pending: number;
    blocked: number;
    inProgress: number;
    cancelled: number;
  };
  retryCount: number;
} {
  const taskCounts = {
    total: state.tasks.length,
    done: state.tasks.filter((task) => task.status === "done").length,
    pending: state.tasks.filter((task) => task.status === "pending").length,
    blocked: state.tasks.filter((task) => task.status === "blocked").length,
    inProgress: state.tasks.filter((task) => task.status === "in_progress")
      .length,
    cancelled: state.tasks.filter((task) => task.status === "cancelled").length,
  };
  const retryCount = state.tasks.reduce((sum, task) => {
    return (
      sum +
      (task.attempts?.length ?? 0) +
      (task.error_recovery?.attempts?.length ?? 0)
    );
  }, 0);

  return { taskCounts, retryCount };
}

function deriveReviewVerificationFromState(state: ChangeWorkflowState): {
  acceptanceCriteriaCount: number;
  incompleteTaskCount: number;
  gatesComplete: boolean;
  readyForAcceptance: boolean;
} {
  const incompleteTaskCount = state.tasks.filter(
    (task) => task.status !== "done" && task.status !== "cancelled",
  ).length;
  const gatesComplete = Object.entries(state.gates)
    .filter(([gateId]) => gateId !== "acceptance" && gateId !== "release")
    .every(([, gate]) => gate.status === "done");

  return {
    acceptanceCriteriaCount: state.acceptanceCriteria?.length ?? 0,
    incompleteTaskCount,
    gatesComplete,
    readyForAcceptance: gatesComplete && incompleteTaskCount === 0,
  };
}

function deriveTaskRunSummaryFromState(state: ChangeWorkflowState): Array<{
  taskId: string;
  status: ChangeWorkflowState["tasks"][number]["status"];
  startedAt?: string | null;
  completedAt?: string | null;
  verification?: string;
  checkpointSha?: string;
  attempts: number;
}> {
  return state.tasks.map((task) => ({
    taskId: task.id,
    status: task.status,
    startedAt: task.started_at,
    completedAt: task.completed_at ?? task.completedAt,
    verification: task.verification,
    checkpointSha: task.checkpointSha,
    attempts:
      (task.attempts?.length ?? 0) +
      (task.error_recovery?.attempts?.length ?? 0),
  }));
}

export async function changeWorkflow(
  input: ChangeWorkflowInput,
): Promise<void> {
  const workflowEpoch = wf.workflowInfo().runStartTime.getTime();
  let logicalTick = 0;
  const workflowNow = (): string =>
    new Date(workflowEpoch + logicalTick++).toISOString();
  const bootstrap: ChangeWorkflowBootstrapState = {
    projectId: input.projectId,
    changeId: input.changeId,
    title: input.title,
    initializedAt: input.initializedAt,
    projectionChangesDir: input.projectionChangesDir,
    archiveProjects: input.archiveProjects,
  };
  const state = createChangeWorkflowState({
    changeId: input.changeId,
    title: input.title,
    createdAt: input.initializedAt,
  });
  state.projectId = input.projectId;
  state.initializedAt = input.initializedAt;
  state.projectionChangesDir = input.projectionChangesDir;
  state.archiveProjects = input.archiveProjects;
  if (input.seedState) {
    if (input.seedState.status) state.status = input.seedState.status;
    if (input.seedState.tasks) state.tasks = input.seedState.tasks;
    if (input.seedState.subagent_reports) {
      state.subagent_reports = input.seedState.subagent_reports;
    }
    if (input.seedState.deltas) state.deltas = input.seedState.deltas;
    if (input.seedState.wisdom) state.wisdom = input.seedState.wisdom;
    if (input.seedState.gates) state.gates = input.seedState.gates;
    if (input.seedState.reentry_history) {
      state.reentry_history = input.seedState.reentry_history;
    }
    if (input.seedState.artifacts) state.artifacts = input.seedState.artifacts;
    if (input.seedState.fast_follow_of) {
      state.fast_follow_of = input.seedState.fast_follow_of;
    }
    if (input.seedState.affectedProjects) {
      state.affectedProjects = input.seedState.affectedProjects;
    }
    if (input.seedState.affectedPaths) {
      state.affectedPaths = input.seedState.affectedPaths;
    }
    if (input.seedState.lastSignalAt) {
      state.lastSignalAt = input.seedState.lastSignalAt;
    }
    if (typeof input.seedState.pendingCheckpoint !== "undefined") {
      state.pendingCheckpoint = input.seedState.pendingCheckpoint;
    }
    if (typeof input.seedState.terminated !== "undefined") {
      state.terminated = input.seedState.terminated;
    }
    if (input.seedState.acceptanceCriteria) {
      state.acceptanceCriteria = input.seedState.acceptanceCriteria;
    }
    if (input.seedState.contract) {
      state.contract = input.seedState.contract;
    }
    if (input.seedState.documents) state.documents = input.seedState.documents;
    if (input.seedState.reflections) {
      state.reflections = input.seedState.reflections;
    }
    if (input.seedState.worktrees) state.worktrees = input.seedState.worktrees;
    if (input.seedState.conformance) {
      state.conformance = input.seedState.conformance;
    }
    if (input.seedState.archiveRequest) {
      state.archiveRequest = input.seedState.archiveRequest;
    }
    if (input.seedState.phase9_status) {
      state.phase9_status = input.seedState.phase9_status;
    }
    if (input.seedState.origin) {
      state.origin = input.seedState.origin;
    }
    if (typeof input.seedState.worktree_auto_managed === "boolean") {
      state.worktree_auto_managed = input.seedState.worktree_auto_managed;
    }
    if (typeof input.seedState.target_worktree_path !== "undefined") {
      state.target_worktree_path = input.seedState.target_worktree_path;
    }
    if (input.seedState.scope_worktrees) {
      state.scope_worktrees = { ...input.seedState.scope_worktrees };
    }
    if (input.seedState.signal_rejections) {
      state.signal_rejections = [...input.seedState.signal_rejections];
    }
    if (typeof input.seedState.signal_rejections_total === "number") {
      state.signal_rejections_total = input.seedState.signal_rejections_total;
    }
  }

  wf.setHandler(changeBootstrapQuery, () => bootstrap);
  wf.setHandler(getStateQuery, () => state);
  wf.setHandler(
    getTasksQuery,
    (
      status: ChangeWorkflowState["tasks"][number]["status"] | undefined,
      filter: string | undefined,
    ) => listTasksFromChangeState(state, status, filter),
  );
  wf.setHandler(getGateStatusQuery, (gateId) =>
    gateId ? state.gates[gateId] : state.gates,
  );
  wf.setHandler(getWorktreesQuery, () => ({ ...(state.worktrees ?? {}) }));
  wf.setHandler(getConformanceStateQuery, () => state.conformance);
  wf.setHandler(
    changeTasksQuery,
    (
      status: ChangeWorkflowState["tasks"][number]["status"] | undefined,
      filter: string | undefined,
    ) => listTasksFromChangeState(state, status, filter),
  );
  wf.setHandler(changeReadyQuery, () => getReadyTasksFromChangeState(state));
  wf.setHandler(getCurrentBucketQuery, () =>
    deriveBucket(bucketCtxFromState(state, workflowEpoch)),
  );
  wf.setHandler(getInvestmentReportQuery, () =>
    deriveInvestmentReportFromState(state),
  );
  wf.setHandler(getReviewVerificationQuery, () =>
    deriveReviewVerificationFromState(state),
  );
  wf.setHandler(getTaskRunSummaryQuery, () =>
    deriveTaskRunSummaryFromState(state),
  );
  wf.setHandler(changeTaskQuery, (taskId: string) =>
    getTaskFromChangeState(state, taskId),
  );

  const projectionChangesDir = input.projectionChangesDir?.trim();
  const snapshotState = (): ChangeWorkflowState =>
    JSON.parse(JSON.stringify(state)) as ChangeWorkflowState;

  const upsertSignalSearchAttributes = (signalName: string): void => {
    if (input.searchAttributesEnabled === false) return;
    try {
      applyAndUpsertSearchAttributes(state);
    } catch (saErr) {
      wf.log.warn("search-attribute-upsert-failed", {
        op: `${signalName}Signal`,
        changeId: state.changeId,
        error: saErr instanceof Error ? saErr.message : String(saErr),
      });
    }
  };

  const projectChangeState = async (signalName: string): Promise<boolean> => {
    if (!projectionChangesDir) return true;
    let result: WriteChangeProjectionActivityResult;
    try {
      result = await writeChangeProjection({
        projectionChangesDir,
        state: snapshotState(),
        projectedAt: state.lastSignalAt ?? workflowNow(),
      });
    } catch (err) {
      wf.log.warn("change-projection-failed", {
        op: `${signalName}Signal`,
        changeId: state.changeId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
    if (!result.ok) {
      wf.log.warn("change-projection-failed", {
        op: `${signalName}Signal`,
        changeId: state.changeId,
        error: result.error,
      });
      return false;
    }
    return true;
  };

  const scheduleChangeProjection = (signalName: string): void => {
    if (!projectionChangesDir) return;
    void projectChangeState(signalName).catch((err) => {
      wf.log.warn("change-projection-failed", {
        op: `${signalName}Signal`,
        changeId: state.changeId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  };

  const runArchiveActivity = async (
    payload: import("../types").ArchiveRequestedSignalPayload,
  ): Promise<boolean> => {
    if (!input.archiveProjects || input.archiveProjects.length === 0)
      return true;
    const result = await archiveChangeActivity({
      state: snapshotState(),
      projects: input.archiveProjects,
      status: "archived",
      archivedAt: payload.requestedAt,
      approvalEvidence: payload.approvalEvidence,
      approvedBy: payload.requestedBy,
    });
    if (!result.ok) {
      wf.log.warn("archive-activity-failed", {
        changeId: state.changeId,
        phase: result.phase,
        error: result.error,
      });
      return false;
    }
    return true;
  };

  const runCancelArchiveActivity = async (
    payload: import("../types").ChangeCancelledSignalPayload,
  ): Promise<boolean> => {
    if (!input.archiveProjects || input.archiveProjects.length === 0)
      return true;
    const result = await archiveChangeActivity({
      state: snapshotState(),
      projects: input.archiveProjects,
      status: "cancelled",
      archivedAt: payload.cancelledAt,
      approvalEvidence: payload.approvalEvidence,
      approvedBy: payload.cancelledBy,
    });
    if (!result.ok) {
      wf.log.warn("cancel-archive-activity-failed", {
        changeId: state.changeId,
        phase: result.phase,
        error: result.error,
      });
      return false;
    }
    return true;
  };

  const isTemporalSystemFailure = (err: unknown): boolean =>
    err instanceof wf.CancelledFailure || err instanceof wf.TemporalFailure;

  const signalAsync = <Args extends unknown[]>(
    signalName: string,
    handler: (...args: Args) => void | Promise<void>,
    options?: { projectAfter?: boolean; afterSuccess?: boolean },
  ): ((...args: Args) => void | Promise<void>) => {
    const afterSuccess = (): void => {
      if (options?.afterSuccess === false) return;
      upsertSignalSearchAttributes(signalName);
      if (options?.projectAfter) scheduleChangeProjection(signalName);
    };

    const rejectSignal = (args: Args, err: unknown): void => {
      if (isTemporalSystemFailure(err)) throw err;
      applySignalRejectionToState(state, {
        signalName,
        error: err,
        payload: args.length === 1 ? args[0] : args,
        rejectedAt: workflowNow(),
      });
      const rejections = state.signal_rejections ?? [];
      const latest = rejections[rejections.length - 1];
      wf.log.warn("signal-rejected", {
        signalName,
        errorMessage: latest?.errorMessage ?? String(err),
        errorClass: latest?.errorClass,
        payloadDigest: latest?.payloadDigest,
      });
      upsertSignalSearchAttributes(`${signalName}Rejected`);
      if (options?.projectAfter)
        scheduleChangeProjection(`${signalName}Rejected`);
    };

    return (...args: Args) => {
      try {
        const result = handler(...args);
        if (
          result &&
          typeof result === "object" &&
          "then" in result &&
          typeof result.then === "function"
        ) {
          return Promise.resolve(result)
            .then(afterSuccess)
            .catch((err: unknown) => rejectSignal(args, err));
        }
        afterSuccess();
      } catch (err) {
        rejectSignal(args, err);
      }
    };
  };

  const signalMutation = <Payload>(
    signalName: string,
    handler: (payload: Payload) => ChangeWorkflowState,
    options?: { projectAfter?: boolean },
  ): ((payload: Payload) => void | Promise<void>) =>
    signalAsync(
      signalName,
      (payload: Payload) => {
        handler(payload);
      },
      options,
    );

  // Patch rationale: discovery contract enforcement was added after legacy
  // discovery gate histories already scheduled artifact inspection. During
  // replay, histories without this marker must take the old no-contract-blocker
  // branch so their command sequence still schedules inspectArtifactActivity.
  // Deprecation plan: keep until pre-contract discovery gate histories are
  // archived/closed and replay fixtures no longer cover that migration path;
  // then replace the marker with wf.deprecatePatch before final removal.
  const DISCOVERY_CONTRACT_READINESS_PATCH = "discovery-contract-readiness-v1";
  // Patch rationale: acceptance projection + executive-summary hash enforcement
  // adds activity commands to the acceptance gate-completion path. Existing
  // histories that already scheduled acceptance completion must replay the old
  // artifact-inspection sequence; new histories record this patch marker before
  // scheduling the new proof activities.
  const ACCEPTANCE_EXECUTIVE_SUMMARY_PROOF_PATCH =
    "acceptance-executive-summary-proof-v1";
  // Patch rationale: proposal/discovery/design artifact content moved to
  // workflow state.documents while legacy histories may have already scheduled
  // inspectArtifactActivity. New attempts use state-backed evidence; old
  // histories replay the legacy disk-read command sequence.
  const STATE_BACKED_GATE_ARTIFACT_PROOF_PATCH =
    "state-backed-gate-artifact-proof-v1";
  // Patch rationale (completeStateBackedGate, AC3): acceptance gate proof moved
  // from disk inspectArtifactActivity to workflow state.documents.executiveSummary
  // + state.artifacts.executiveSummary metadata. The Temporal-only store no
  // longer writes artifact .md files (no-disk-writes-invariant), so the legacy
  // ACCEPTANCE_EXECUTIVE_SUMMARY_PROOF_PATCH disk-read path leaves acceptance
  // stuck. New histories take the state-backed branch (and materialize
  // executive-summary.md to disk for the archive bundle via writeArtifactActivity
  // per AC7); old histories that already scheduled the disk inspect sequence
  // replay the legacy command sequence under the prior marker.
  // Deprecation plan: keep until pre-migration acceptance histories are
  // archived/closed and replay fixtures no longer cover the disk-inspect path;
  // then replace with wf.deprecatePatch before final removal.
  const STATE_BACKED_ACCEPTANCE_PROOF_PATCH =
    "state-backed-acceptance-proof-v1";

  const blockerText = (blockers: GateReadinessBlocker[]): string =>
    blockers.map((b) => `${b.code}: ${b.message}`).join("; ");

  const markGateStuckForBlockers = (
    payload: import("../types").GateCompletedSignalPayload,
    blockers: GateReadinessBlocker[],
  ): void => {
    applyGateStuckToState(state, {
      gateId: payload.gateId,
      reason: blockerText(blockers),
      readinessBlockers: blockers,
      triggeredAt: payload.completedAt,
    });
  };

  const gateArtifactBlocker = (
    payload: import("../types").GateCompletedSignalPayload,
    input: {
      code: string;
      artifactKind: GateReadinessBlocker["artifactKind"];
      message: string;
      remediation: string;
    },
  ): GateReadinessBlocker => ({
    code: input.code,
    gateId: payload.gateId,
    artifactKind: input.artifactKind,
    message: input.message,
    remediation: input.remediation,
  });

  const completeGateWithReadiness = async (
    payload: import("../types").GateCompletedSignalPayload,
  ): Promise<void> => {
    const readiness = evaluateGateReadiness(state, payload.gateId, {
      compatibilityReason: payload.compatibilityReason,
      enforceDiscoveryContract:
        payload.gateId === "discovery"
          ? wf.patched(DISCOVERY_CONTRACT_READINESS_PATCH)
          : true,
    });
    if (!readiness.ready) {
      markGateStuckForBlockers(payload, readiness.blockers);
      return;
    }

    let artifactEvidence = readiness.evidence;
    const artifactKind = ARTIFACT_BACKED_GATES[payload.gateId];
    if (artifactKind && !artifactEvidence) {
      if (
        artifactKind !== "acceptance" &&
        wf.patched(STATE_BACKED_GATE_ARTIFACT_PROOF_PATCH)
      ) {
        const stateArtifactReadiness = stateBackedArtifactEvidence(
          state,
          payload.gateId,
          artifactKind,
          workflowNow(),
        );
        if (!stateArtifactReadiness.ready) {
          markGateStuckForBlockers(payload, stateArtifactReadiness.blockers);
          return;
        }
        artifactEvidence = stateArtifactReadiness.evidence;
      } else if (
        artifactKind === "acceptance" &&
        wf.patched(STATE_BACKED_ACCEPTANCE_PROOF_PATCH)
      ) {
        // State-backed acceptance (completeStateBackedGate AC1/AC2/AC7).
        // Proof comes from workflow state, NOT disk inspection. The L1
        // readiness check (acceptanceContractBlockers) already verified that
        // state.artifacts.executiveSummary.{path,contentHash} are present and
        // the contract review matrix passes; here we validate the
        // state.documents.executiveSummary CONTENT (size + hash) and derive
        // the acceptance evidence from state. The recovery path in gate.ts
        // (poisoned_history) is untouched and still inspects disk per C2/C4.
        const stateProof = stateBackedAcceptanceProof(state, workflowNow());
        if (!stateProof.ready) {
          markGateStuckForBlockers(payload, stateProof.blockers);
          return;
        }
        const acceptanceContent = renderAcceptanceProjection(state);
        // T12: populate state.documents.acceptance to match the projection so
        // readArtifact / archive-bundle materialization see Temporal content.
        state.documents = {
          ...(state.documents ?? {}),
          acceptance: acceptanceContent,
        };
        // AC7: materialize executive-summary.md AND acceptance.md to disk so
        // createArchive/createInRepoArchive (readdir-based copy) include them
        // in the bundle. The Temporal-only store does not write artifact files
        // on the production update path, so this is the single materialization
        // point. Only attempted when a projection dir is configured; pure
        // state-only environments (unit fixtures without projectionChangesDir)
        // still complete acceptance from state proof.
        if (state.projectionChangesDir) {
          const esWrite = await writeArtifactActivity({
            changesDir: state.projectionChangesDir,
            changeId: state.changeId,
            kind: "executiveSummary",
            content: state.documents.executiveSummary ?? "",
          });
          if (!esWrite.ok) {
            markGateStuckForBlockers(payload, [
              gateArtifactBlocker(payload, {
                code: "ACCEPTANCE_EXECUTIVE_SUMMARY_MATERIALIZE_FAILED",
                artifactKind,
                message: esWrite.error,
                remediation:
                  "Fix executive-summary materialization before retrying acceptance.",
              }),
            ]);
            return;
          }
          const acceptanceWrite = await writeArtifactActivity({
            changesDir: state.projectionChangesDir,
            changeId: state.changeId,
            kind: "acceptance",
            content: acceptanceContent,
          });
          if (!acceptanceWrite.ok) {
            markGateStuckForBlockers(payload, [
              gateArtifactBlocker(payload, {
                code: "ACCEPTANCE_PROJECTION_WRITE_FAILED",
                artifactKind,
                message: acceptanceWrite.error,
                remediation:
                  "Fix acceptance projection generation before retrying gate completion.",
              }),
            ]);
            return;
          }
        }
        artifactEvidence = stateProof.evidence;
      } else if (state.projectionChangesDir) {
        if (
          artifactKind === "acceptance" &&
          wf.patched(ACCEPTANCE_EXECUTIVE_SUMMARY_PROOF_PATCH)
        ) {
          const acceptanceContent = renderAcceptanceProjection(state);
          const writeResult = await writeArtifactActivity({
            changesDir: state.projectionChangesDir,
            changeId: state.changeId,
            kind: "acceptance",
            content: acceptanceContent,
          });
          if (!writeResult.ok) {
            markGateStuckForBlockers(payload, [
              gateArtifactBlocker(payload, {
                code: "ACCEPTANCE_PROJECTION_WRITE_FAILED",
                artifactKind,
                message: writeResult.error,
                remediation:
                  "Fix acceptance projection generation before retrying gate completion.",
              }),
            ]);
            return;
          }
          // T12 (removePositionalArtifactApi): populate state.documents.acceptance
          // to match the just-written disk projection. Makes acceptance a
          // first-class member of state.documents so readArtifact /
          // archive-bundle materialization (KD-13) and consumer alignment
          // (gate-readiness, archive-summary) see Temporal-backed content
          // instead of empty. Disk projection retained per C12 (acceptance
          // recovery path requires inspectArtifactActivity to verify disk
          // contentHash).
          state.documents = {
            ...(state.documents ?? {}),
            acceptance: acceptanceContent,
          };
          const executiveSummary = await inspectArtifactActivity({
            changesDir: state.projectionChangesDir,
            changeId: state.changeId,
            kind: "executiveSummary",
          });
          if (!executiveSummary.ok) {
            markGateStuckForBlockers(payload, [
              gateArtifactBlocker(payload, {
                code:
                  executiveSummary.code === "missing"
                    ? "ACCEPTANCE_EXECUTIVE_SUMMARY_MISSING"
                    : "ACCEPTANCE_EXECUTIVE_SUMMARY_UNREADABLE",
                artifactKind,
                message: executiveSummary.error,
                remediation:
                  "Persist a readable executive-summary.md and update workflow metadata before retrying acceptance.",
              }),
            ]);
            return;
          }
          if (
            executiveSummary.nonWhitespaceChars <
            MIN_GATE_ARTIFACT_NON_WHITESPACE_CHARS
          ) {
            markGateStuckForBlockers(payload, [
              gateArtifactBlocker(payload, {
                code: "ACCEPTANCE_EXECUTIVE_SUMMARY_UNDERSIZED",
                artifactKind,
                message: `executive-summary artifact has ${executiveSummary.nonWhitespaceChars} non-whitespace characters; minimum is ${MIN_GATE_ARTIFACT_NON_WHITESPACE_CHARS}.`,
                remediation:
                  "Populate executive-summary.md with substantive acceptance evidence before retrying acceptance.",
              }),
            ]);
            return;
          }
          if (
            state.artifacts.executiveSummary?.contentHash !==
            executiveSummary.contentHash
          ) {
            markGateStuckForBlockers(payload, [
              gateArtifactBlocker(payload, {
                code: "ACCEPTANCE_EXECUTIVE_SUMMARY_HASH_STALE",
                artifactKind,
                message:
                  "executive-summary artifact contentHash does not match workflow metadata.",
                remediation:
                  "Re-persist executive-summary.md through the artifact update path so workflow metadata receives a fresh contentHash.",
              }),
            ]);
            return;
          }
        }
        const artifact = await inspectArtifactActivity({
          changesDir: state.projectionChangesDir,
          changeId: state.changeId,
          kind: artifactKind,
        });
        if (!artifact.ok) {
          markGateStuckForBlockers(payload, [
            gateArtifactBlocker(payload, {
              code:
                artifact.code === "missing"
                  ? "ARTIFACT_MISSING"
                  : "ARTIFACT_UNREADABLE",
              artifactKind,
              message: artifact.error,
              remediation:
                "Create or repair the required gate artifact before retrying gate completion.",
            }),
          ]);
          return;
        }
        if (
          artifact.nonWhitespaceChars < MIN_GATE_ARTIFACT_NON_WHITESPACE_CHARS
        ) {
          markGateStuckForBlockers(payload, [
            gateArtifactBlocker(payload, {
              code: "ARTIFACT_UNDERSIZED",
              artifactKind,
              message: `${artifact.kind} artifact has ${artifact.nonWhitespaceChars} non-whitespace characters; minimum is ${MIN_GATE_ARTIFACT_NON_WHITESPACE_CHARS}.`,
              remediation:
                "Populate the required artifact with substantive gate evidence before retrying gate completion.",
            }),
          ]);
          return;
        }
        artifactEvidence = {
          kind: artifactKind,
          path: artifact.path,
          content_hash: artifact.contentHash,
          non_whitespace_chars: artifact.nonWhitespaceChars,
          checked_at: artifact.checkedAt,
        };
      }
    }

    applyGateCompletedToState(state, {
      ...payload,
      artifactEvidence,
    });
  };

  let gateCompletionChain: Promise<void> = Promise.resolve();

  wf.setHandler(
    proposalUpdatedSignal,
    signalMutation("proposalUpdated", (payload) =>
      applyProposalUpdatedToState(state, payload),
    ),
  );
  wf.setHandler(
    problemStatementUpdatedSignal,
    signalMutation("problemStatementUpdated", (payload) =>
      applyProblemStatementUpdatedToState(state, payload),
    ),
  );
  wf.setHandler(
    agreementUpdatedSignal,
    signalMutation("agreementUpdated", (payload) =>
      applyAgreementUpdatedToState(state, payload),
    ),
  );
  wf.setHandler(
    designUpdatedSignal,
    signalMutation("designUpdated", (payload) =>
      applyDesignUpdatedToState(state, payload),
    ),
  );
  wf.setHandler(
    executiveSummaryUpdatedSignal,
    signalMutation("executiveSummaryUpdated", (payload) =>
      applyExecutiveSummaryUpdatedToState(state, payload),
    ),
  );
  wf.setHandler(
    acceptanceUpdatedSignal,
    signalMutation("acceptanceUpdated", (payload) =>
      applyAcceptanceUpdatedToState(state, payload),
    ),
  );
  wf.setHandler(
    acceptanceCriteriaSetSignal,
    signalMutation("acceptanceCriteriaSet", (payload) =>
      applyAcceptanceCriteriaSetToState(state, payload),
    ),
  );
  wf.setHandler(
    contractSetSignal,
    signalMutation("contractSet", (payload) =>
      applyContractSetToState(state, payload),
    ),
  );
  wf.setHandler(
    contractAmendedSignal,
    signalMutation("contractAmended", (payload) =>
      applyContractAmendedToState(state, payload),
    ),
  );
  wf.setHandler(
    contractReviewMatrixSetSignal,
    signalMutation("contractReviewMatrixSet", (payload) =>
      applyContractReviewMatrixSetToState(state, payload),
    ),
  );
  wf.setHandler(
    taskAddedSignal,
    signalMutation("taskAdded", (payload) =>
      applyTaskAddedToState(state, payload),
    ),
  );
  wf.setHandler(
    taskUpdatedSignal,
    signalMutation("taskUpdated", (payload) =>
      applyTaskUpdatedToState(state, payload),
    ),
  );
  wf.setHandler(
    taskRemovedSignal,
    signalMutation("taskRemoved", (payload) =>
      applyTaskRemovedToState(state, payload),
    ),
  );
  wf.setHandler(
    taskAssignedSignal,
    signalMutation("taskAssigned", (payload) =>
      applyTaskAssignedToState(state, payload),
    ),
  );
  wf.setHandler(
    taskCompletedSignal,
    signalMutation("taskCompleted", (payload) =>
      applyTaskCompletedToState(state, payload),
    ),
  );
  wf.setHandler(
    subagentReportSubmittedSignal,
    signalMutation("subagentReportSubmitted", (payload) =>
      applySubagentReportSubmittedToState(state, payload),
    ),
  );
  wf.setHandler(
    taskBlockedSignal,
    signalMutation("taskBlocked", (payload) =>
      applyTaskBlockedToState(state, payload),
    ),
  );
  wf.setHandler(
    taskCancelledSignal,
    signalMutation("taskCancelled", (payload) =>
      applyTaskCancelledToState(state, payload),
    ),
  );
  wf.setHandler(
    gateInProgressSignal,
    signalMutation("gateInProgress", (payload) =>
      applyGateInProgressToState(state, payload),
    ),
  );
  wf.setHandler(
    gateAwaitingApprovalSignal,
    signalMutation(
      "gateAwaitingApproval",
      (payload) => applyGateAwaitingApprovalToState(state, payload),
      { projectAfter: true },
    ),
  );
  wf.setHandler(
    gateStuckSignal,
    signalMutation(
      "gateStuck",
      (payload) => applyGateStuckToState(state, payload),
      { projectAfter: true },
    ),
  );
  wf.setHandler(
    gateCompletedSignal,
    signalAsync(
      "gateCompleted",
      async (payload) => {
        const previous = gateCompletionChain.catch(() => undefined);
        gateCompletionChain = previous.then(() =>
          completeGateWithReadiness(payload),
        );
        await gateCompletionChain;
        upsertSignalSearchAttributes("gateCompleted");
        scheduleChangeProjection("gateCompleted");
      },
      { afterSuccess: false },
    ),
  );
  wf.setHandler(
    gateReenteredSignal,
    signalMutation("gateReentered", (payload) =>
      applyGateReenteredToState(state, payload),
    ),
  );
  wf.setHandler(
    wisdomAddedSignal,
    signalMutation("wisdomAdded", (payload) =>
      applyWisdomAddedToState(state, payload),
    ),
  );
  wf.setHandler(
    reflectionRecordedSignal,
    signalMutation("reflectionRecorded", (payload) =>
      applyReflectionRecordedToState(state, payload),
    ),
  );
  wf.setHandler(
    worktreeCreatedSignal,
    signalMutation("worktreeCreated", (payload) =>
      applyWorktreeCreatedToState(state, payload),
    ),
  );
  wf.setHandler(
    worktreeDeletedSignal,
    signalMutation("worktreeDeleted", (payload) =>
      applyWorktreeDeletedToState(state, payload),
    ),
  );
  wf.setHandler(
    worktreeAutoManagedSignal,
    signalMutation("worktreeAutoManaged", (payload) =>
      applyWorktreeAutoManagedToState(state, payload),
    ),
  );
  wf.setHandler(
    worktreeAttachedSignal,
    signalMutation("worktreeAttached", (payload) =>
      applyWorktreeAttachedToState(state, payload),
    ),
  );
  wf.setHandler(
    conformanceLockedSignal,
    signalMutation("conformanceLocked", (payload) =>
      applyConformanceLockedToState(state, payload),
    ),
  );
  wf.setHandler(
    conformanceVerdictSignal,
    signalMutation("conformanceVerdict", (payload) =>
      applyConformanceVerdictToState(state, payload),
    ),
  );
  wf.setHandler(
    conformanceOverriddenSignal,
    signalMutation("conformanceOverridden", (payload) =>
      applyConformanceOverriddenToState(state, payload),
    ),
  );
  wf.setHandler(
    archiveRequestedSignal,
    signalAsync(
      "archiveRequested",
      async (payload) => {
        const previousStatus = state.status;
        const previousTerminated = state.terminated;
        applyArchiveRequestedToState(state, payload);
        upsertSignalSearchAttributes("archiveRequested");
        const archived = await runArchiveActivity(payload);
        const projected = archived
          ? await projectChangeState("archiveRequested")
          : false;
        if (!projected || !archived) {
          state.status = previousStatus;
          if (typeof previousTerminated === "undefined")
            delete state.terminated;
          else state.terminated = previousTerminated;
          applyGateStuckToState(state, {
            gateId: "release",
            reason: archived
              ? "Projection write failed before archive completion"
              : "Archive activity failed before workflow completion",
            triggeredAt: payload.requestedAt,
          });
          upsertSignalSearchAttributes("archiveRequestedProjectionFailure");
        }
      },
      { afterSuccess: false },
    ),
  );
  wf.setHandler(
    phase9StatusUpdatedSignal,
    signalMutation(
      "phase9StatusUpdated",
      (payload: import("../types").Phase9StatusUpdatedSignalPayload) => {
        state.phase9_status = payload.phase9_status;
        state.lastSignalAt = payload.updatedAt;
        return state;
      },
      { projectAfter: true },
    ),
  );
  wf.setHandler(
    changeCancelledSignal,
    signalAsync(
      "changeCancelled",
      async (payload) => {
        const previousStatus = state.status;
        const previousTerminated = state.terminated;
        const previousClosure = state.closure;
        applyChangeCancelledToState(state, payload);
        upsertSignalSearchAttributes("changeCancelled");
        const archived = await runCancelArchiveActivity(payload);
        const projected = archived
          ? await projectChangeState("changeCancelled")
          : false;
        if (!projected || !archived) {
          state.status = previousStatus;
          if (typeof previousTerminated === "undefined")
            delete state.terminated;
          else state.terminated = previousTerminated;
          if (typeof previousClosure === "undefined") delete state.closure;
          else state.closure = previousClosure;
          upsertSignalSearchAttributes("changeCancelledProjectionFailure");
        }
      },
      { afterSuccess: false },
    ),
  );
  wf.setHandler(
    updateArtifactMetadataSignal,
    signalMutation(
      "updateArtifactMetadata",
      (payload: {
        kind: import("./contracts").ArtifactKind;
        metadata: import("./contracts").ArtifactMetadata;
      }) => {
        wf.log.info("op:start", {
          op: "updateArtifactMetadataSignal",
          changeId: state.changeId,
          title: state.title?.slice(0, 80),
        });
        updateArtifactMetadataInChangeState(
          state,
          payload.kind,
          payload.metadata,
        );
        wf.log.info("op:end", {
          op: "updateArtifactMetadataSignal",
          changeId: state.changeId,
          kind: payload.kind,
        });
        return state;
      },
    ),
  );
  wf.setHandler(
    archiveChangeSignal,
    signalAsync(
      "archiveChange",
      () => {
        wf.log.info("op:start", {
          op: "archiveChangeSignal",
          changeId: state.changeId,
          title: state.title?.slice(0, 80),
        });
        archiveChangeInChangeState(state);
        if (input.searchAttributesEnabled !== false) {
          try {
            wf.upsertSearchAttributes({
              [ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.changeStatus]: ["archived"],
            });
          } catch (saErr) {
            wf.log.warn("search-attribute-upsert-failed", {
              op: "archiveChangeSignal",
              changeId: state.changeId,
              error: saErr instanceof Error ? saErr.message : String(saErr),
            });
          }
        }
        wf.log.info("op:end", {
          op: "archiveChangeSignal",
          changeId: state.changeId,
        });
        upsertSignalSearchAttributes("archiveChange");
      },
      { afterSuccess: false },
    ),
  );
  wf.setHandler(
    closeChangeSignal,
    signalMutation("closeChange", (closure) => {
      wf.log.info("op:start", {
        op: "closeChangeSignal",
        changeId: state.changeId,
        title: state.title?.slice(0, 80),
      });
      closeChangeInChangeState(state, closure);
      if (input.searchAttributesEnabled !== false) {
        try {
          wf.upsertSearchAttributes({
            [ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.changeStatus]: ["closed"],
          });
        } catch (saErr) {
          wf.log.warn("search-attribute-upsert-failed", {
            op: "closeChangeSignal",
            changeId: state.changeId,
            error: saErr instanceof Error ? saErr.message : String(saErr),
          });
        }
      }
      wf.log.info("op:end", {
        op: "closeChangeSignal",
        changeId: state.changeId,
        closureReason: closure.reason,
      });
      return state;
    }),
  );

  const thresholds = resolveHistoryThresholds();
  // Wake on either (a) terminal state reached via archive/close update,
  // or (b) history threshold for continue-as-new rotation. Predicate reads
  // only deterministic workflow state and `wf.workflowInfo()`, so it is
  // replay-safe. See change `terminatechangeworkflowonarchi` for design.
  await wf.condition(() => {
    if (state.status === "archived" || state.status === "closed") return true;
    if (shouldContinueAsNew(thresholds.changeHistoryThreshold)) return true;
    return false;
  });

  // Terminal-state path: workflow Completes after handlers drain.
  // Stops the zombie-workflow leak where archived/closed changes left
  // their workflow Running indefinitely.
  if (state.status === "archived" || state.status === "closed") {
    wf.log.info("workflow:completing", {
      changeId: state.changeId,
      status: state.status,
      reason: "terminal_status_detected",
    });
    // Drain any in-flight update/signal handlers before returning so we
    // do not interrupt e.g. a concurrent applyChangeSummary handler.
    await wf.condition(wf.allHandlersFinished);
    return;
  }

  // Continue-as-new: pass current state as seed
  const { changeId, projectId, initializedAt, title } = input;
  const seed: ChangeWorkflowInput = {
    changeId,
    projectId,
    initializedAt,
    title,
    searchAttributesEnabled: input.searchAttributesEnabled,
    projectionChangesDir: input.projectionChangesDir,
    archiveProjects: input.archiveProjects,
    seedState: {
      status: state.status,
      tasks: state.tasks,
      subagent_reports: state.subagent_reports,
      deltas: state.deltas,
      wisdom: state.wisdom,
      gates: state.gates,
      reentry_history: state.reentry_history,
      artifacts: state.artifacts,
      fast_follow_of: state.fast_follow_of,
      affectedProjects: state.affectedProjects,
      affectedPaths: state.affectedPaths,
      lastSignalAt: state.lastSignalAt,
      pendingCheckpoint: state.pendingCheckpoint,
      terminated: state.terminated,
      acceptanceCriteria: state.acceptanceCriteria,
      contract: state.contract,
      documents: state.documents,
      reflections: state.reflections,
      worktrees: state.worktrees,
      conformance: state.conformance,
      archiveRequest: state.archiveRequest,
      phase9_status: state.phase9_status,
      origin: state.origin,
      worktree_auto_managed: state.worktree_auto_managed,
      target_worktree_path: state.target_worktree_path,
      scope_worktrees: state.scope_worktrees,
      seenReportIds: state.seenReportIds,
      signal_rejections: state.signal_rejections,
      signal_rejections_total: state.signal_rejections_total,
    },
  };
  await wf.condition(wf.allHandlersFinished);
  await wf.continueAsNew<typeof changeWorkflow>(seed);
}

/**
 * History-length check helper. Returns true if the workflow should
 * continue-as-new to keep history size bounded.
 */
function shouldContinueAsNew(threshold: number): boolean {
  return shouldContinueAsNewFromInfo(wf.workflowInfo(), threshold);
}
