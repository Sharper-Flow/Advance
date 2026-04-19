import * as wf from "@temporalio/workflow";
import {
  CHANGE_WORKFLOW_UPDATE_NAMES,
  CHANGE_WORKFLOW_QUERY_NAMES,
  type ChangeWorkflowState,
  type ChangeWorkflowBootstrapState,
  type ChangeWorkflowInput,
  PROJECT_WORKFLOW_QUERY_NAMES,
  PROJECT_WORKFLOW_UPDATE_NAMES,
  type MigrationLedgerEntry,
  type ProjectWorkflowBootstrapState,
  type ProjectWorkflowInput,
  type ProjectWorkflowState,
  type ProjectWisdomEntry,
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
import {
  addAgendaItemToProjectState,
  addProjectWisdomToProjectState,
  createProjectWorkflowState,
  listAgendaItemsFromProjectState,
  listProjectWisdomFromProjectState,
  recordMigrationEntryInProjectState,
  updateAgendaItemInProjectState,
} from "./project-state";

const changeBootstrapQuery = wf.defineQuery<ChangeWorkflowBootstrapState>(
  CHANGE_WORKFLOW_QUERY_NAMES.bootstrap,
);
const changeStateQuery = wf.defineQuery<ChangeWorkflowState>(
  CHANGE_WORKFLOW_QUERY_NAMES.state,
);
const changeTasksQuery = wf.defineQuery<
  ChangeWorkflowState["tasks"],
  [
    ChangeWorkflowState["tasks"][number]["status"] | undefined,
    string | undefined,
  ]
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
  [import("./contracts").ArtifactKind, import("./contracts").ArtifactMetadata]
>(CHANGE_WORKFLOW_UPDATE_NAMES.updateArtifactMetadata);
const closeChangeUpdate = wf.defineUpdate<
  void,
  [import("../types").ChangeClosure]
>(CHANGE_WORKFLOW_UPDATE_NAMES.closeChange);
const projectBootstrapQuery = wf.defineQuery<ProjectWorkflowBootstrapState>(
  PROJECT_WORKFLOW_QUERY_NAMES.bootstrap,
);
const projectStateQuery = wf.defineQuery<ProjectWorkflowState>(
  PROJECT_WORKFLOW_QUERY_NAMES.state,
);
const projectAgendaQuery = wf.defineQuery<
  ProjectWorkflowState["agenda"],
  [ProjectWorkflowState["agenda"][number]["status"] | undefined]
>(PROJECT_WORKFLOW_QUERY_NAMES.agenda);
const projectWisdomQuery = wf.defineQuery<
  ProjectWorkflowState["project_wisdom"],
  [import("../types").WisdomType | undefined]
>(PROJECT_WORKFLOW_QUERY_NAMES.wisdom);
const projectMigrationLedgerQuery = wf.defineQuery<
  ProjectWorkflowState["migration_ledger"]
>(PROJECT_WORKFLOW_QUERY_NAMES.migrationLedger);

const addAgendaItemUpdate = wf.defineUpdate<
  ProjectWorkflowState["agenda"][number],
  [
    {
      title: string;
      description?: string;
      priority?: ProjectWorkflowState["agenda"][number]["priority"];
      category?: string;
      blocked_by?: string;
    },
  ]
>(PROJECT_WORKFLOW_UPDATE_NAMES.addAgendaItem);
const updateAgendaItemUpdate = wf.defineUpdate<
  ProjectWorkflowState["agenda"][number],
  [
    string,
    {
      status?: ProjectWorkflowState["agenda"][number]["status"];
      description?: string;
      priority?: ProjectWorkflowState["agenda"][number]["priority"];
      category?: string;
      blocked_by?: string;
      completion_notes?: string;
    },
  ]
>(PROJECT_WORKFLOW_UPDATE_NAMES.updateAgendaItem);
const addProjectWisdomUpdate = wf.defineUpdate<
  ProjectWisdomEntry,
  [
    {
      type: import("../types").WisdomType;
      content: string;
      sourceChange?: string;
      sourceTask?: string;
      tags?: string[];
      invalidatedBy?: string;
    },
  ]
>(PROJECT_WORKFLOW_UPDATE_NAMES.addWisdom);
const recordMigrationEntryUpdate = wf.defineUpdate<
  MigrationLedgerEntry,
  [MigrationLedgerEntry]
>(PROJECT_WORKFLOW_UPDATE_NAMES.recordMigrationEntry);

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
  };
  const state = createChangeWorkflowState({
    changeId: input.changeId,
    title: input.title,
    createdAt: input.initializedAt,
  });
  state.projectId = input.projectId;
  state.initializedAt = input.initializedAt;
  if (input.seedState) {
    if (input.seedState.status) state.status = input.seedState.status;
    if (input.seedState.tasks) state.tasks = input.seedState.tasks;
    if (input.seedState.wisdom) state.wisdom = input.seedState.wisdom;
    if (input.seedState.gates) state.gates = input.seedState.gates;
    if (input.seedState.reentry_history) {
      state.reentry_history = input.seedState.reentry_history;
    }
    if (input.seedState.artifacts) state.artifacts = input.seedState.artifacts;
  }

  wf.setHandler(changeBootstrapQuery, () => bootstrap);
  wf.setHandler(changeStateQuery, () => state);
  wf.setHandler(changeTasksQuery, (status, filter) =>
    listTasksFromChangeState(state, status, filter),
  );
  wf.setHandler(changeReadyQuery, () => getReadyTasksFromChangeState(state));
  wf.setHandler(changeTaskQuery, (taskId) =>
    getTaskFromChangeState(state, taskId),
  );
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
  wf.setHandler(
    reopenFromGateUpdate,
    (fromGate, reason, scopeDelta, approvalEvidence) =>
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
  const workflowEpoch = wf.workflowInfo().runStartTime.getTime();
  let logicalTick = 0;
  const workflowNow = (): string =>
    new Date(workflowEpoch + logicalTick++).toISOString();

  const bootstrap: ProjectWorkflowBootstrapState = {
    projectId: input.projectId,
    initializedAt: input.initializedAt,
  };
  const state = createProjectWorkflowState(input);
  if (input.agenda) state.agenda = input.agenda;
  if (input.projectWisdom) state.project_wisdom = input.projectWisdom;
  if (input.migrationLedger) state.migration_ledger = input.migrationLedger;

  wf.setHandler(projectBootstrapQuery, () => bootstrap);
  wf.setHandler(projectStateQuery, () => state);
  wf.setHandler(projectAgendaQuery, (status) =>
    listAgendaItemsFromProjectState(state, status),
  );
  wf.setHandler(projectWisdomQuery, (type) =>
    listProjectWisdomFromProjectState(state, type),
  );
  wf.setHandler(projectMigrationLedgerQuery, () => state.migration_ledger);
  wf.setHandler(addAgendaItemUpdate, (itemInput) =>
    addAgendaItemToProjectState(state, itemInput, {
      now: workflowNow(),
      uuid: wf.uuid4,
    }),
  );
  wf.setHandler(updateAgendaItemUpdate, (itemId, update) =>
    updateAgendaItemInProjectState(state, itemId, {
      now: workflowNow(),
      status: update.status,
      description: update.description,
      priority: update.priority,
      category: update.category,
      blocked_by: update.blocked_by,
      completion_notes: update.completion_notes,
    }),
  );
  wf.setHandler(addProjectWisdomUpdate, (input) =>
    addProjectWisdomToProjectState(state, input, {
      now: workflowNow(),
      uuid: wf.uuid4,
    }),
  );
  wf.setHandler(recordMigrationEntryUpdate, (entry) =>
    recordMigrationEntryInProjectState(state, entry),
  );

  await wf.condition(() => false);
}
