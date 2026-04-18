import * as wf from "@temporalio/workflow";
import {
  CHANGE_WORKFLOW_UPDATE_NAMES,
  CHANGE_WORKFLOW_QUERY_NAMES,
  type ChangeWorkflowState,
  type ChangeWorkflowBootstrapState,
  type ChangeWorkflowInput,
  PROJECT_WORKFLOW_QUERY_NAMES,
  type ProjectWorkflowBootstrapState,
  type ProjectWorkflowInput,
} from "./contracts";
import {
  addChangeWisdom,
  addTaskToChangeState,
  cancelTaskInChangeState,
  closeChangeInChangeState,
  completeGateInChangeState,
  createChangeWorkflowState,
  getTaskFromChangeState,
  getReadyTasksFromChangeState,
  listTasksFromChangeState,
  recordTaskEvidenceInChangeState,
  reclassifyTaskTddInChangeState,
  reopenFromGateInChangeState,
  setTaskPhaseInChangeState,
  updateArtifactMetadataInChangeState,
  updateTaskInChangeState,
} from "./change-state";

const changeBootstrapQuery = wf.defineQuery<ChangeWorkflowBootstrapState>(
  CHANGE_WORKFLOW_QUERY_NAMES.bootstrap,
);
const changeStateQuery = wf.defineQuery<ChangeWorkflowState>(
  CHANGE_WORKFLOW_QUERY_NAMES.state,
);
const changeTasksQuery = wf.defineQuery<
  ChangeWorkflowState["tasks"],
  [ChangeWorkflowState["tasks"][number]["status"] | undefined, string | undefined]
>(CHANGE_WORKFLOW_QUERY_NAMES.tasks);
const changeReadyQuery = wf.defineQuery<
  ReturnType<typeof getReadyTasksFromChangeState>
>(CHANGE_WORKFLOW_QUERY_NAMES.ready);
const changeTaskQuery = wf.defineQuery<
  ChangeWorkflowState["tasks"][number] | null,
  [string]
>(CHANGE_WORKFLOW_QUERY_NAMES.task);

const addTaskUpdate = wf.defineUpdate<
  ChangeWorkflowState["tasks"][number],
  [
    {
      title: string;
      type?: ChangeWorkflowState["tasks"][number]["type"];
      section?: string;
      blockedBy?: string[];
      metadata?: Record<string, string>;
    },
  ]
>(CHANGE_WORKFLOW_UPDATE_NAMES.addTask);
const updateTaskUpdate = wf.defineUpdate<
  ChangeWorkflowState["tasks"][number],
  [
    string,
    {
      status: ChangeWorkflowState["tasks"][number]["status"];
      notes?: string;
      implementationSummary?: string;
      errorRecovery?: ChangeWorkflowState["tasks"][number]["error_recovery"];
    },
  ]
>(CHANGE_WORKFLOW_UPDATE_NAMES.updateTask);
const recordTaskEvidenceUpdate = wf.defineUpdate<
  ChangeWorkflowState["tasks"][number],
  [string, "red" | "green", import("../types").TddPhaseEvidence]
>(CHANGE_WORKFLOW_UPDATE_NAMES.recordTaskEvidence);
const setTaskPhaseUpdate = wf.defineUpdate<
  ChangeWorkflowState["tasks"][number],
  [string, import("../types").TddPhase]
>(CHANGE_WORKFLOW_UPDATE_NAMES.setTaskPhase);
const cancelTaskUpdate = wf.defineUpdate<
  ChangeWorkflowState["tasks"][number],
  [string, import("../types").Cancellation]
>(CHANGE_WORKFLOW_UPDATE_NAMES.cancelTask);
const reclassifyTaskTddUpdate = wf.defineUpdate<
  ChangeWorkflowState["tasks"][number],
  [string, import("../types").TddReclassification]
>(CHANGE_WORKFLOW_UPDATE_NAMES.reclassifyTaskTdd);
const completeGateUpdate = wf.defineUpdate<
  ChangeWorkflowState["gates"][import("../types").GateId],
  [import("../types").GateId, string | undefined, string | undefined]
>(CHANGE_WORKFLOW_UPDATE_NAMES.completeGate);
const reopenFromGateUpdate = wf.defineUpdate<
  void,
  [import("../types").GateId, string, string | undefined, string | undefined]
>(CHANGE_WORKFLOW_UPDATE_NAMES.reopenFromGate);
const addWisdomUpdate = wf.defineUpdate<
  void,
  [import("../types").WisdomType, string, string | undefined]
>(CHANGE_WORKFLOW_UPDATE_NAMES.addWisdom);
const updateArtifactMetadataUpdate = wf.defineUpdate<
  void,
  [
    import("./contracts").ArtifactKind,
    import("./contracts").ArtifactMetadata,
  ]
>(CHANGE_WORKFLOW_UPDATE_NAMES.updateArtifactMetadata);
const closeChangeUpdate = wf.defineUpdate<
  void,
  [import("../types").ChangeClosure]
>(CHANGE_WORKFLOW_UPDATE_NAMES.closeChange);
const projectBootstrapQuery = wf.defineQuery<ProjectWorkflowBootstrapState>(
  PROJECT_WORKFLOW_QUERY_NAMES.bootstrap,
);

const workflowNow = (): string => new Date().toISOString();

export async function changeWorkflow(
  input: ChangeWorkflowInput,
): Promise<void> {
  const bootstrap: ChangeWorkflowBootstrapState = {
    projectId: input.projectId,
    changeId: input.changeId,
    title: input.title,
    initializedAt: input.initializedAt,
  };
  const state = createChangeWorkflowState({
    changeId: input.changeId,
    title: input.title,
    createdAt: input.initializedAt,
  });
  state.projectId = input.projectId;
  state.initializedAt = input.initializedAt;

  wf.setHandler(changeBootstrapQuery, () => bootstrap);
  wf.setHandler(changeStateQuery, () => state);
  wf.setHandler(changeTasksQuery, (status, filter) =>
    listTasksFromChangeState(state, status, filter),
  );
  wf.setHandler(changeReadyQuery, () => getReadyTasksFromChangeState(state));
  wf.setHandler(changeTaskQuery, (taskId) => getTaskFromChangeState(state, taskId));
  wf.setHandler(addTaskUpdate, (taskInput) =>
    addTaskToChangeState(state, taskInput, {
      now: workflowNow(),
      uuid: wf.uuid4,
    }),
  );
  wf.setHandler(updateTaskUpdate, (taskId, update) =>
    updateTaskInChangeState(state, taskId, {
      status: update.status,
      now: workflowNow(),
      notes: update.notes,
      implementationSummary: update.implementationSummary,
      errorRecovery: update.errorRecovery,
    }),
  );
  wf.setHandler(recordTaskEvidenceUpdate, (taskId, phase, evidence) =>
    recordTaskEvidenceInChangeState(state, taskId, phase, evidence),
  );
  wf.setHandler(setTaskPhaseUpdate, (taskId, phase) =>
    setTaskPhaseInChangeState(state, taskId, phase),
  );
  wf.setHandler(cancelTaskUpdate, (taskId, cancellation) =>
    cancelTaskInChangeState(state, taskId, cancellation, workflowNow()),
  );
  wf.setHandler(reclassifyTaskTddUpdate, (taskId, reclassification) =>
    reclassifyTaskTddInChangeState(state, taskId, reclassification),
  );
  wf.setHandler(completeGateUpdate, (gateId, notes, completedBy) =>
    completeGateInChangeState(state, gateId, {
      now: workflowNow(),
      completedBy: completedBy ?? "agent",
      notes,
    }),
  );
  wf.setHandler(reopenFromGateUpdate, (fromGate, reason, scopeDelta, approvalEvidence) =>
    reopenFromGateInChangeState(state, fromGate, {
      now: workflowNow(),
      reason,
      scopeDelta,
      approvalEvidence,
      reopenedBy: "agent",
    }),
  );
  wf.setHandler(addWisdomUpdate, (type, content, sourceTask) =>
    addChangeWisdom(
      state,
      { type, content, sourceTask },
      { now: workflowNow(), uuid: wf.uuid4 },
    ),
  );
  wf.setHandler(updateArtifactMetadataUpdate, (kind, metadata) =>
    updateArtifactMetadataInChangeState(state, kind, metadata),
  );
  wf.setHandler(closeChangeUpdate, (closure) =>
    closeChangeInChangeState(state, closure),
  );

  await wf.condition(() => false);
}

export async function projectWorkflow(
  input: ProjectWorkflowInput,
): Promise<void> {
  const state: ProjectWorkflowBootstrapState = {
    projectId: input.projectId,
    initializedAt: input.initializedAt,
  };

  wf.setHandler(projectBootstrapQuery, () => state);
  await wf.condition(() => false);
}
