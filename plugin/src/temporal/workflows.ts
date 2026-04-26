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
import { resolveHistoryThresholds } from "./contracts";
import {
  addChangeWisdom,
  addTaskToChangeState,
  cancelTaskInChangeState,
  closeChangeInChangeState,
  completeGateInChangeState,
  createChangeWorkflowState,
  getTaskFromChangeState,
  getTaskRunFromChangeState,
  getReadyTasksFromChangeState,
  listTaskRunsFromChangeState,
  listTasksFromChangeState,
  recordTaskEvidenceInChangeState,
  recordTaskRunEventInChangeState,
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
const changeTaskRunQuery = wf.defineQuery<
  NonNullable<ChangeWorkflowState["task_runs"]>[string] | null,
  [string]
>(CHANGE_WORKFLOW_QUERY_NAMES.taskRun);
const changeTaskRunsQuery = wf.defineQuery<
  NonNullable<ChangeWorkflowState["task_runs"]>[string][]
>(CHANGE_WORKFLOW_QUERY_NAMES.taskRuns);

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
const recordTaskRunEventUpdate = wf.defineUpdate<
  {
    duplicate: boolean;
    run: NonNullable<ChangeWorkflowState["task_runs"]>[string];
  },
  [string, import("../types").TaskRunEvent]
>(CHANGE_WORKFLOW_UPDATE_NAMES.recordTaskRunEvent);
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

/**
 * Wrap a workflow update handler so domain errors propagate as
 * `wf.ApplicationFailure` (non-retryable, surfaces as a clean update
 * rejection on the client) instead of escaping as
 * `WorkflowWorkerUnhandledFailure` (which permanently wedges the
 * workflow).
 *
 * **Why this exists:** Temporal Update handlers that throw a plain
 * `Error` mark the workflow task as failed. The workflow then loops
 * trying to replay the same input, fails again, and becomes
 * permanently unqueryable. A single bad input — e.g., an invalid
 * task-run state transition (see `recordTaskRunEventInChangeState`) —
 * could brick an entire change.
 *
 * `wf.ApplicationFailure` is the Temporal-native way to signal
 * "this update failed for a domain reason, do not retry, surface to
 * the client". The workflow continues running normally; only the
 * specific update call rejects with the error.
 *
 * Reliability rationale: this is defense-in-depth. Even if a future
 * domain validator throws, the workflow stays healthy and the agent
 * sees a clean error instead of a wedged change.
 *
 * Usage:
 * ```
 * wf.setHandler(myUpdate, safeUpdateHandler("myUpdate", (...args) => {
 *   return doSomethingThatMightThrow(args);
 * }));
 * ```
 */
function safeUpdateHandler<Args extends unknown[], R>(
  updateName: string,
  handler: (...args: Args) => R,
): (...args: Args) => R {
  return (...args: Args) => {
    try {
      return handler(...args);
    } catch (err) {
      // Re-throw as ApplicationFailure (non-retryable) so the caller's
      // executeUpdate rejects cleanly. ApplicationFailure does NOT
      // count as a workflow task failure — the workflow keeps running.
      const message = err instanceof Error ? err.message : String(err);
      throw wf.ApplicationFailure.nonRetryable(
        message,
        `${updateName}_DOMAIN_ERROR`,
      );
    }
  };
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
    if (input.seedState.task_runs) state.task_runs = input.seedState.task_runs;
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
  wf.setHandler(changeTaskRunQuery, (taskId: string) =>
    getTaskRunFromChangeState(state, taskId),
  );
  wf.setHandler(changeTaskRunsQuery, () => listTaskRunsFromChangeState(state));
  wf.setHandler(
    addTaskUpdate,
    safeUpdateHandler(
      "addTask",
      (taskInput: {
        title: string;
        type?: ChangeWorkflowState["tasks"][number]["type"];
        section?: string;
        blockedBy?: string[];
        metadata?: Record<string, string>;
      }) => {
        wf.log.info("op:start", {
          op: "addTaskUpdate",
          changeId: state.changeId,
          title: state.title?.slice(0, 80),
        });
        const newTask = addTaskToChangeState(state, taskInput, {
          now: workflowNow(),
          uuid: wf.uuid4,
        });
        wf.log.info("op:end", {
          op: "addTaskUpdate",
          changeId: state.changeId,
          taskId: newTask.id,
          taskCount: state.tasks.length,
        });
        return newTask;
      },
    ),
  );
  wf.setHandler(
    updateTaskUpdate,
    safeUpdateHandler(
      "updateTask",
      (
        taskId: string,
        update: {
          status: ChangeWorkflowState["tasks"][number]["status"];
          notes?: string;
          implementationSummary?: string;
          errorRecovery?: ChangeWorkflowState["tasks"][number]["error_recovery"];
        },
      ) => {
        wf.log.info("op:start", {
          op: "updateTaskUpdate",
          changeId: state.changeId,
          title: state.title?.slice(0, 80),
        });
        const result = updateTaskInChangeState(state, taskId, {
          status: update.status,
          now: workflowNow(),
          notes: update.notes,
          implementationSummary: update.implementationSummary,
          errorRecovery: update.errorRecovery,
        });
        wf.log.info("op:end", {
          op: "updateTaskUpdate",
          changeId: state.changeId,
          taskId,
          status: update.status,
        });
        return result;
      },
    ),
  );
  wf.setHandler(
    recordTaskEvidenceUpdate,
    safeUpdateHandler(
      "recordTaskEvidence",
      (
        taskId: string,
        phase: "red" | "green",
        evidence: import("../types").TddPhaseEvidence,
      ) => {
        wf.log.info("op:start", {
          op: "recordTaskEvidenceUpdate",
          changeId: state.changeId,
          title: state.title?.slice(0, 80),
        });
        const result = recordTaskEvidenceInChangeState(
          state,
          taskId,
          phase,
          evidence,
        );
        wf.log.info("op:end", {
          op: "recordTaskEvidenceUpdate",
          changeId: state.changeId,
          taskId,
          phase,
        });
        return result;
      },
    ),
  );
  wf.setHandler(
    recordTaskRunEventUpdate,
    safeUpdateHandler(
      "recordTaskRunEvent",
      (taskId: string, event: import("../types").TaskRunEvent) => {
        wf.log.info("op:start", {
          op: "recordTaskRunEventUpdate",
          changeId: state.changeId,
          title: state.title?.slice(0, 80),
        });
        const result = recordTaskRunEventInChangeState(state, taskId, event);
        wf.log.info("op:end", {
          op: "recordTaskRunEventUpdate",
          changeId: state.changeId,
          taskId,
        });
        return result;
      },
    ),
  );
  wf.setHandler(
    setTaskPhaseUpdate,
    safeUpdateHandler(
      "setTaskPhase",
      (taskId: string, phase: import("../types").TddPhase) => {
        wf.log.info("op:start", {
          op: "setTaskPhaseUpdate",
          changeId: state.changeId,
          title: state.title?.slice(0, 80),
        });
        const result = setTaskPhaseInChangeState(state, taskId, phase);
        wf.log.info("op:end", {
          op: "setTaskPhaseUpdate",
          changeId: state.changeId,
          taskId,
          phase,
        });
        return result;
      },
    ),
  );
  wf.setHandler(
    cancelTaskUpdate,
    safeUpdateHandler(
      "cancelTask",
      (taskId: string, cancellation: import("../types").Cancellation) => {
        wf.log.info("op:start", {
          op: "cancelTaskUpdate",
          changeId: state.changeId,
          title: state.title?.slice(0, 80),
        });
        const result = cancelTaskInChangeState(
          state,
          taskId,
          cancellation,
          workflowNow(),
        );
        wf.log.info("op:end", {
          op: "cancelTaskUpdate",
          changeId: state.changeId,
          taskId,
        });
        return result;
      },
    ),
  );
  wf.setHandler(
    reclassifyTaskTddUpdate,
    safeUpdateHandler(
      "reclassifyTaskTdd",
      (
        taskId: string,
        reclassification: import("../types").TddReclassification,
      ) => {
        wf.log.info("op:start", {
          op: "reclassifyTaskTddUpdate",
          changeId: state.changeId,
          title: state.title?.slice(0, 80),
        });
        const result = reclassifyTaskTddInChangeState(
          state,
          taskId,
          reclassification,
        );
        wf.log.info("op:end", {
          op: "reclassifyTaskTddUpdate",
          changeId: state.changeId,
          taskId,
          toIntent: reclassification.to_intent,
        });
        return result;
      },
    ),
  );
  wf.setHandler(
    completeGateUpdate,
    safeUpdateHandler(
      "completeGate",
      (
        gateId: import("../types").GateId,
        notes: string | undefined,
        completedBy: string | undefined,
      ) => {
        wf.log.info("op:start", {
          op: "completeGateUpdate",
          changeId: state.changeId,
          title: state.title?.slice(0, 80),
        });
        const result = completeGateInChangeState(state, gateId, {
          now: workflowNow(),
          completedBy: completedBy ?? "agent",
          notes,
        });
        // Update search attributes with the next active gate
        const gateOrder: import("../types").GateId[] = [
          "proposal",
          "discovery",
          "design",
          "planning",
          "execution",
          "acceptance",
          "release",
        ];
        const currentIdx = gateOrder.indexOf(gateId);
        const nextGate = gateOrder[currentIdx + 1];
        wf.upsertSearchAttributes({
          [ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.activeGate]: [nextGate ?? "done"],
        });
        wf.log.info("op:end", {
          op: "completeGateUpdate",
          changeId: state.changeId,
          gateId,
          gateStatus: state.gates[gateId]?.status,
        });
        return result;
      },
    ),
  );
  wf.setHandler(
    reopenFromGateUpdate,
    safeUpdateHandler(
      "reopenFromGate",
      (
        fromGate: import("../types").GateId,
        reason: string,
        scopeDelta: string | undefined,
        approvalEvidence: string | undefined,
      ) => {
        wf.log.info("op:start", {
          op: "reopenFromGateUpdate",
          changeId: state.changeId,
          title: state.title?.slice(0, 80),
        });
        const result = reopenFromGateInChangeState(state, fromGate, {
          now: workflowNow(),
          reason,
          scopeDelta,
          approvalEvidence,
          reopenedBy: "agent",
        });
        wf.log.info("op:end", {
          op: "reopenFromGateUpdate",
          changeId: state.changeId,
          fromGate,
        });
        return result;
      },
    ),
  );
  wf.setHandler(
    addWisdomUpdate,
    safeUpdateHandler(
      "addWisdom",
      (
        type: import("../types").WisdomType,
        content: string,
        sourceTask: string | undefined,
      ) => {
        wf.log.info("op:start", {
          op: "addWisdomUpdate",
          changeId: state.changeId,
          title: state.title?.slice(0, 80),
        });
        const result = addChangeWisdom(
          state,
          { type, content, sourceTask },
          { now: workflowNow(), uuid: wf.uuid4 },
        );
        wf.log.info("op:end", {
          op: "addWisdomUpdate",
          changeId: state.changeId,
          wisdomType: type,
          wisdomCount: state.wisdom.length,
        });
        return result;
      },
    ),
  );
  wf.setHandler(
    updateArtifactMetadataUpdate,
    safeUpdateHandler(
      "updateArtifactMetadata",
      (
        kind: import("./contracts").ArtifactKind,
        metadata: import("./contracts").ArtifactMetadata,
      ) => {
        wf.log.info("op:start", {
          op: "updateArtifactMetadataUpdate",
          changeId: state.changeId,
          title: state.title?.slice(0, 80),
        });
        updateArtifactMetadataInChangeState(state, kind, metadata);
        wf.log.info("op:end", {
          op: "updateArtifactMetadataUpdate",
          changeId: state.changeId,
          kind,
        });
      },
    ),
  );
  wf.setHandler(
    closeChangeUpdate,
    safeUpdateHandler(
      "closeChange",
      (closure: import("../types").ChangeClosure) => {
        wf.log.info("op:start", {
          op: "closeChangeUpdate",
          changeId: state.changeId,
          title: state.title?.slice(0, 80),
        });
        const result = closeChangeInChangeState(state, closure);
        wf.upsertSearchAttributes({
          [ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.changeStatus]: ["closed"],
        });
        wf.log.info("op:end", {
          op: "closeChangeUpdate",
          changeId: state.changeId,
          closureReason: closure.reason,
        });
        return result;
      },
    ),
  );

  const thresholds = resolveHistoryThresholds();
  // Check history length on each wakeup; continue-as-new when threshold hit
  await wf.condition(() => {
    if (shouldContinueAsNew(thresholds.changeHistoryThreshold)) return true;
    return false;
  });

  // Continue-as-new: pass current state as seed
  const { changeId, projectId, initializedAt, title } = input;
  const seed: ChangeWorkflowInput = {
    changeId,
    projectId,
    initializedAt,
    title,
    seedState: {
      status: state.status,
      tasks: state.tasks,
      wisdom: state.wisdom,
      gates: state.gates,
      reentry_history: state.reentry_history,
      artifacts: state.artifacts,
      task_runs: state.task_runs,
    },
  };
  await wf.continueAsNew<typeof changeWorkflow>(seed);
}

/**
 * History-length check helper. Returns true if the workflow should
 * continue-as-new to keep history size bounded.
 */
function shouldContinueAsNew(threshold: number): boolean {
  const info = wf.workflowInfo() as wf.WorkflowInfo & {
    continueAsNewSuggested?: unknown;
    historyLength?: unknown;
  };
  if (info.continueAsNewSuggested === true) return true;
  return (
    typeof info.historyLength === "number" && info.historyLength >= threshold
  );
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
    safeUpdateHandler(
      "addAgendaItem",
      (itemInput: {
        title: string;
        description?: string;
        priority?: ProjectWorkflowState["agenda"][number]["priority"];
        category?: string;
        blocked_by?: string;
      }) => {
        wf.log.info("op:start", {
          op: "addAgendaItemUpdate",
          projectId: state.projectId,
        });
        const newItem = addAgendaItemToProjectState(state, itemInput, {
          now: workflowNow(),
          uuid: wf.uuid4,
        });
        wf.log.info("op:end", {
          op: "addAgendaItemUpdate",
          projectId: state.projectId,
          itemId: newItem.id,
          agendaCount: state.agenda.length,
        });
        return newItem;
      },
    ),
  );
  wf.setHandler(
    updateAgendaItemUpdate,
    safeUpdateHandler(
      "updateAgendaItem",
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
      ) => {
        wf.log.info("op:start", {
          op: "updateAgendaItemUpdate",
          projectId: state.projectId,
        });
        const result = updateAgendaItemInProjectState(state, itemId, {
          now: workflowNow(),
          status: update.status,
          description: update.description,
          priority: update.priority,
          category: update.category,
          blocked_by: update.blocked_by,
          completion_notes: update.completion_notes,
        });
        wf.log.info("op:end", {
          op: "updateAgendaItemUpdate",
          projectId: state.projectId,
          itemId,
          status: update.status,
        });
        return result;
      },
    ),
  );
  wf.setHandler(
    addProjectWisdomUpdate,
    safeUpdateHandler(
      "addProjectWisdom",
      (input: {
        type: import("../types").WisdomType;
        content: string;
        sourceChange?: string;
        sourceTask?: string;
        tags?: string[];
        invalidatedBy?: string;
      }) => {
        wf.log.info("op:start", {
          op: "addProjectWisdomUpdate",
          projectId: state.projectId,
        });
        const result = addProjectWisdomToProjectState(state, input, {
          now: workflowNow(),
          uuid: wf.uuid4,
        });
        wf.log.info("op:end", {
          op: "addProjectWisdomUpdate",
          projectId: state.projectId,
          wisdomCount: state.project_wisdom.length,
        });
        return result;
      },
    ),
  );
  wf.setHandler(
    recordMigrationEntryUpdate,
    safeUpdateHandler("recordMigrationEntry", (entry: MigrationLedgerEntry) => {
      wf.log.info("op:start", {
        op: "recordMigrationEntryUpdate",
        projectId: state.projectId,
      });
      const result = recordMigrationEntryInProjectState(state, entry);
      wf.log.info("op:end", {
        op: "recordMigrationEntryUpdate",
        projectId: state.projectId,
        entryCount: state.migration_ledger.length,
      });
      return result;
    }),
  );
  wf.setHandler(
    applyChangeSummarySignalDef,
    safeUpdateHandler(
      "applyChangeSummary",
      (payload: import("./contracts").ChangeSummaryPayload) => {
        wf.log.info("op:start", {
          op: "applyChangeSummarySignalDef",
          projectId: state.projectId,
        });
        const result = applyChangeSummaryToProjectState(state, payload);
        wf.log.info("op:end", {
          op: "applyChangeSummarySignalDef",
          projectId: state.projectId,
          changeId: payload.changeId,
          sourceVersion: payload.sourceVersion,
        });
        return result;
      },
    ),
  );

  const thresholds = resolveHistoryThresholds();
  await wf.condition(() => {
    if (shouldContinueAsNew(thresholds.projectHistoryThreshold)) return true;
    return false;
  });

  // Continue-as-new: pass current state as seed
  const seed: ProjectWorkflowInput = {
    projectId: input.projectId,
    initializedAt: input.initializedAt,
    agenda: state.agenda,
    projectWisdom: state.project_wisdom,
    migrationLedger: state.migration_ledger,
    changeSummaries: state.change_summaries,
    sourceVersions: state.source_versions,
  };
  await wf.continueAsNew<typeof projectWorkflow>(seed);
}
