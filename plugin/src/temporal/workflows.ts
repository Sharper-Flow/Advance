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
import { ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES } from "./observability";
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
  applyChangeSummaryToProjectState,
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
  ChangeWorkflowState,
  [import("../types").GateId, string | undefined, string | undefined]
>(CHANGE_WORKFLOW_UPDATE_NAMES.completeGate);
const reopenFromGateUpdate = wf.defineUpdate<
  ChangeWorkflowState,
  [import("../types").GateId, string, string | undefined, string | undefined]
>(CHANGE_WORKFLOW_UPDATE_NAMES.reopenFromGate);
const addWisdomUpdate = wf.defineUpdate<
  ChangeWorkflowState,
  [import("../types").WisdomType, string, string | undefined]
>(CHANGE_WORKFLOW_UPDATE_NAMES.addWisdom);
const updateArtifactMetadataUpdate = wf.defineUpdate<
  void,
  [import("./contracts").ArtifactKind, import("./contracts").ArtifactMetadata]
>(CHANGE_WORKFLOW_UPDATE_NAMES.updateArtifactMetadata);
const closeChangeUpdate = wf.defineUpdate<
  ChangeWorkflowState,
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

const applyChangeSummarySignalDef = wf.defineSignal<
  [import("./contracts").ChangeSummaryPayload]
>("adv.change.applyChangeSummary");
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
  wf.setHandler(
    changeTasksQuery,
    (
      status: ChangeWorkflowState["tasks"][number]["status"] | undefined,
      filter: string | undefined,
    ) => listTasksFromChangeState(state, status, filter),
  );
  wf.setHandler(changeReadyQuery, () => getReadyTasksFromChangeState(state));
  wf.setHandler(changeTaskQuery, (taskId: string) =>
    getTaskFromChangeState(state, taskId),
  );
  wf.setHandler(
    addTaskUpdate,
    (taskInput: {
      title: string;
      type?: ChangeWorkflowState["tasks"][number]["type"];
      section?: string;
      blockedBy?: string[];
      metadata?: Record<string, string>;
    }) =>
      addTaskToChangeState(state, taskInput, {
        now: workflowNow(),
        uuid: wf.uuid4,
      }),
  );
  wf.setHandler(
    updateTaskUpdate,
    (
      taskId: string,
      update: {
        status: ChangeWorkflowState["tasks"][number]["status"];
        notes?: string;
        implementationSummary?: string;
        errorRecovery?: ChangeWorkflowState["tasks"][number]["error_recovery"];
      },
    ) =>
      updateTaskInChangeState(state, taskId, {
        status: update.status,
        now: workflowNow(),
        notes: update.notes,
        implementationSummary: update.implementationSummary,
        errorRecovery: update.errorRecovery,
      }),
  );
  wf.setHandler(
    recordTaskEvidenceUpdate,
    (
      taskId: string,
      phase: "red" | "green",
      evidence: import("../types").TddPhaseEvidence,
    ) => recordTaskEvidenceInChangeState(state, taskId, phase, evidence),
  );
  wf.setHandler(
    setTaskPhaseUpdate,
    (taskId: string, phase: import("../types").TddPhase) =>
      setTaskPhaseInChangeState(state, taskId, phase),
  );
  wf.setHandler(
    cancelTaskUpdate,
    (taskId: string, cancellation: import("../types").Cancellation) =>
      cancelTaskInChangeState(state, taskId, cancellation, workflowNow()),
  );
  wf.setHandler(
    reclassifyTaskTddUpdate,
    (
      taskId: string,
      reclassification: import("../types").TddReclassification,
    ) => reclassifyTaskTddInChangeState(state, taskId, reclassification),
  );
  wf.setHandler(
    completeGateUpdate,
    (
      gateId: import("../types").GateId,
      notes: string | undefined,
      completedBy: string | undefined,
    ) => {
      const result = completeGateInChangeState(state, gateId, {
        now: workflowNow(),
        completedBy: completedBy ?? "agent",
        notes,
      });
      // Update search attributes with the next active gate
      const gateOrder: import("../types").GateId[] = [
        "proposal", "discovery", "design", "planning",
        "execution", "acceptance", "release",
      ];
      const currentIdx = gateOrder.indexOf(gateId);
      const nextGate = gateOrder[currentIdx + 1];
      wf.upsertSearchAttributes({
        [ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.activeGate]: [nextGate ?? "done"],
      });
      return result;
    },
  );
  wf.setHandler(
    reopenFromGateUpdate,
    (
      fromGate: import("../types").GateId,
      reason: string,
      scopeDelta: string | undefined,
      approvalEvidence: string | undefined,
    ) =>
      reopenFromGateInChangeState(state, fromGate, {
        now: workflowNow(),
        reason,
        scopeDelta,
        approvalEvidence,
        reopenedBy: "agent",
      }),
  );
  wf.setHandler(
    addWisdomUpdate,
    (
      type: import("../types").WisdomType,
      content: string,
      sourceTask: string | undefined,
    ) =>
      addChangeWisdom(
        state,
        { type, content, sourceTask },
        { now: workflowNow(), uuid: wf.uuid4 },
      ),
  );
  wf.setHandler(
    updateArtifactMetadataUpdate,
    (
      kind: import("./contracts").ArtifactKind,
      metadata: import("./contracts").ArtifactMetadata,
    ) => updateArtifactMetadataInChangeState(state, kind, metadata),
  );
  wf.setHandler(
    closeChangeUpdate,
    (closure: import("../types").ChangeClosure) => {
      const result = closeChangeInChangeState(state, closure);
      wf.upsertSearchAttributes({
        [ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.changeStatus]: ["closed"],
      });
      return result;
    },
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
  wf.setHandler(
    projectAgendaQuery,
    (status: ProjectWorkflowState["agenda"][number]["status"] | undefined) =>
      listAgendaItemsFromProjectState(state, status),
  );
  wf.setHandler(
    projectWisdomQuery,
    (type: import("../types").WisdomType | undefined) =>
      listProjectWisdomFromProjectState(state, type),
  );
  wf.setHandler(projectMigrationLedgerQuery, () => state.migration_ledger);
  wf.setHandler(
    addAgendaItemUpdate,
    (itemInput: {
      title: string;
      description?: string;
      priority?: ProjectWorkflowState["agenda"][number]["priority"];
      category?: string;
      blocked_by?: string;
    }) =>
      addAgendaItemToProjectState(state, itemInput, {
        now: workflowNow(),
        uuid: wf.uuid4,
      }),
  );
  wf.setHandler(
    updateAgendaItemUpdate,
    (
      itemId: string,
      update: {
        status?: ProjectWorkflowState["agenda"][number]["status"];
        description?: string;
        priority?: ProjectWorkflowState["agenda"][number]["priority"];
        category?: string;
        blocked_by?: string;
        completion_notes?: string;
      },
    ) =>
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
  wf.setHandler(
    addProjectWisdomUpdate,
    (input: {
      type: import("../types").WisdomType;
      content: string;
      sourceChange?: string;
      sourceTask?: string;
      tags?: string[];
      invalidatedBy?: string;
    }) =>
      addProjectWisdomToProjectState(state, input, {
        now: workflowNow(),
        uuid: wf.uuid4,
      }),
  );
  wf.setHandler(recordMigrationEntryUpdate, (entry: MigrationLedgerEntry) =>
    recordMigrationEntryInProjectState(state, entry),
  );
  wf.setHandler(
    applyChangeSummarySignalDef,
    (payload: import("./contracts").ChangeSummaryPayload) =>
      applyChangeSummaryToProjectState(state, payload),
  );

  await wf.condition(() => false);
}
