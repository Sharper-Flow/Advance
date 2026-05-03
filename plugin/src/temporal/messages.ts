/**
 * Temporal Query/Update Definitions — Client-Side Bindings
 *
 * These `wf.defineQuery` / `wf.defineUpdate` calls MUST declare client-side
 * bindings for the definitions used inside `workflows.ts`. Temporal's
 * workflow bundle is compiled in isolation, so handler tokens created inside
 * the workflow cannot be imported by the outer client/adapter layer. The
 * string names are the actual wire contract; the handler *tokens* are local
 * bindings.
 *
 * When adding or renaming a query/update:
 *   1. Update the name constant in `contracts.ts` (single source of truth).
 *   2. Update both this file and `workflows.ts` so every call site uses the
 *      same constant, not a raw string literal.
 *   3. Prefer the constants from `contracts.ts` over inline string literals
 *      so drift between the two files is impossible.
 */
import * as wf from "@temporalio/workflow";
import type {
  ChangeClosure,
  GateId,
  TddPhase,
  TddPhaseEvidence,
  TddReclassification,
  WisdomType,
} from "../types";
import type {
  ArtifactMetadata,
  ArtifactKind,
  ChangeWorkflowBootstrapState,
  ChangeWorkflowState,
  MigrationLedgerEntry,
  ProjectWisdomEntry,
  ProjectWorkflowBootstrapState,
  ProjectWorkflowState,
  ChangeSummaryPayload,
} from "./contracts";
import {
  CHANGE_WORKFLOW_QUERY_NAMES,
  CHANGE_WORKFLOW_SIGNAL_NAMES,
  CHANGE_WORKFLOW_UPDATE_NAMES,
  PROJECT_WORKFLOW_QUERY_NAMES,
  PROJECT_WORKFLOW_UPDATE_NAMES,
} from "./contracts";
import type { TaskRunEvent } from "../types";

export const changeBootstrapQuery =
  wf.defineQuery<ChangeWorkflowBootstrapState>(
    CHANGE_WORKFLOW_QUERY_NAMES.bootstrap,
  );
export const changeStateQuery = wf.defineQuery<ChangeWorkflowState>(
  CHANGE_WORKFLOW_QUERY_NAMES.state,
);
export const changeTasksQuery = wf.defineQuery<
  ChangeWorkflowState["tasks"],
  [
    ChangeWorkflowState["tasks"][number]["status"] | undefined,
    string | undefined,
  ]
>(CHANGE_WORKFLOW_QUERY_NAMES.tasks);
export const changeReadyQuery = wf.defineQuery<
  ReturnType<typeof import("./change-state").getReadyTasksFromChangeState>
>(CHANGE_WORKFLOW_QUERY_NAMES.ready);
export const changeTaskQuery = wf.defineQuery<
  ChangeWorkflowState["tasks"][number] | null,
  [string]
>(CHANGE_WORKFLOW_QUERY_NAMES.task);
export const changeTaskRunQuery = wf.defineQuery<
  NonNullable<ChangeWorkflowState["task_runs"]>[string] | null,
  [string]
>(CHANGE_WORKFLOW_QUERY_NAMES.taskRun);
export const changeTaskRunsQuery = wf.defineQuery<
  NonNullable<ChangeWorkflowState["task_runs"]>[string][]
>(CHANGE_WORKFLOW_QUERY_NAMES.taskRuns);

export const addTaskUpdate = wf.defineUpdate<
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
export const updateTaskUpdate = wf.defineUpdate<
  ChangeWorkflowState["tasks"][number],
  [
    string,
    {
      status: ChangeWorkflowState["tasks"][number]["status"];
      notes?: string;
      implementationSummary?: string;
      errorRecovery?: ChangeWorkflowState["tasks"][number]["error_recovery"];
      touchedFiles?: string[];
    },
  ]
>(CHANGE_WORKFLOW_UPDATE_NAMES.updateTask);
export const recordTaskEvidenceUpdate = wf.defineUpdate<
  ChangeWorkflowState["tasks"][number],
  [
    string,
    "red" | "green",
    TddPhaseEvidence,
    { correctionReason?: string } | undefined,
  ]
>(CHANGE_WORKFLOW_UPDATE_NAMES.recordTaskEvidence);
export const recordTaskRunEventUpdate = wf.defineUpdate<
  {
    duplicate: boolean;
    run: NonNullable<ChangeWorkflowState["task_runs"]>[string];
  },
  [string, TaskRunEvent]
>(CHANGE_WORKFLOW_UPDATE_NAMES.recordTaskRunEvent);
export const setTaskPhaseUpdate = wf.defineUpdate<
  ChangeWorkflowState["tasks"][number],
  [string, TddPhase]
>(CHANGE_WORKFLOW_UPDATE_NAMES.setTaskPhase);
export const cancelTaskUpdate = wf.defineUpdate<
  ChangeWorkflowState["tasks"][number],
  [string, import("../types").Cancellation]
>(CHANGE_WORKFLOW_UPDATE_NAMES.cancelTask);
export const reclassifyTaskTddUpdate = wf.defineUpdate<
  ChangeWorkflowState["tasks"][number],
  [string, TddReclassification]
>(CHANGE_WORKFLOW_UPDATE_NAMES.reclassifyTaskTdd);
export const completeGateUpdate = wf.defineUpdate<
  ChangeWorkflowState,
  [GateId, string | undefined, string | undefined]
>(CHANGE_WORKFLOW_UPDATE_NAMES.completeGate);
export const reopenFromGateUpdate = wf.defineUpdate<
  ChangeWorkflowState,
  [GateId, string, string | undefined, string | undefined]
>(CHANGE_WORKFLOW_UPDATE_NAMES.reopenFromGate);
export const addChangeWisdomUpdate = wf.defineUpdate<
  ChangeWorkflowState,
  [WisdomType, string, string | undefined]
>(CHANGE_WORKFLOW_UPDATE_NAMES.addWisdom);
export const updateArtifactMetadataUpdate = wf.defineUpdate<
  void,
  [ArtifactKind, ArtifactMetadata]
>(CHANGE_WORKFLOW_UPDATE_NAMES.updateArtifactMetadata);
export const archiveChangeUpdate = wf.defineUpdate<ChangeWorkflowState>(
  CHANGE_WORKFLOW_UPDATE_NAMES.archiveChange,
);
export const closeChangeUpdate = wf.defineUpdate<
  ChangeWorkflowState,
  [ChangeClosure]
>(CHANGE_WORKFLOW_UPDATE_NAMES.closeChange);

export const projectBootstrapQuery =
  wf.defineQuery<ProjectWorkflowBootstrapState>(
    PROJECT_WORKFLOW_QUERY_NAMES.bootstrap,
  );
export const projectStateQuery = wf.defineQuery<ProjectWorkflowState>(
  PROJECT_WORKFLOW_QUERY_NAMES.state,
);
export const projectAgendaQuery = wf.defineQuery<
  ProjectWorkflowState["agenda"],
  [ProjectWorkflowState["agenda"][number]["status"] | undefined]
>(PROJECT_WORKFLOW_QUERY_NAMES.agenda);
export const projectWisdomQuery = wf.defineQuery<
  ProjectWorkflowState["project_wisdom"],
  [WisdomType | undefined]
>(PROJECT_WORKFLOW_QUERY_NAMES.wisdom);
export const projectMigrationLedgerQuery = wf.defineQuery<
  ProjectWorkflowState["migration_ledger"]
>(PROJECT_WORKFLOW_QUERY_NAMES.migrationLedger);

export const addAgendaItemUpdate = wf.defineUpdate<
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
export const updateAgendaItemUpdate = wf.defineUpdate<
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
export const addProjectWisdomUpdate = wf.defineUpdate<
  ProjectWisdomEntry,
  [
    {
      type: WisdomType;
      content: string;
      sourceChange?: string;
      sourceTask?: string;
      tags?: string[];
      invalidatedBy?: string;
    },
  ]
>(PROJECT_WORKFLOW_UPDATE_NAMES.addWisdom);
export const recordMigrationEntryUpdate = wf.defineUpdate<
  MigrationLedgerEntry,
  [MigrationLedgerEntry]
>(PROJECT_WORKFLOW_UPDATE_NAMES.recordMigrationEntry);

// adv_archive_purge support: terminate child workflow first via Temporal
// client, then signal parent project workflow to drop the entry from the
// in-memory change_summaries / source_versions registry. Idempotent —
// purging an unknown changeId is a no-op. See rq-archivePurge01.
export const purgeChangeSummaryUpdate = wf.defineUpdate<
  void,
  [{ changeId: string }]
>(PROJECT_WORKFLOW_UPDATE_NAMES.purgeChangeSummary);

// T5 (KD-1): worktree + session lifecycle update bindings.
// Client-side definitions for the 8 mutators wired in workflows.ts.
// Spec anchors: rq-worktreeRegistry01, rq-multiSessionCoordination01.
import type {
  AddWorktreeSessionPayload,
  ClearPendingWorktreeDeletePayload,
  IncrementPendingWorktreeDeleteAttemptsPayload,
  RegisterSessionPayload,
  RemoveWorktreeSessionPayload,
  SetPendingWorktreeDeletePayload,
  UnregisterSessionPayload,
  UpdateSessionActivityPayload,
} from "./project-state";
import type {
  PendingWorktreeDelete,
  SessionRecord,
  WorktreeRecord,
} from "./contracts";

export const addWorktreeSessionUpdate = wf.defineUpdate<
  WorktreeRecord,
  [AddWorktreeSessionPayload]
>(PROJECT_WORKFLOW_UPDATE_NAMES.addWorktreeSession);

export const removeWorktreeSessionUpdate = wf.defineUpdate<
  WorktreeRecord | null,
  [RemoveWorktreeSessionPayload]
>(PROJECT_WORKFLOW_UPDATE_NAMES.removeWorktreeSession);

export const setPendingWorktreeDeleteUpdate = wf.defineUpdate<
  PendingWorktreeDelete,
  [SetPendingWorktreeDeletePayload]
>(PROJECT_WORKFLOW_UPDATE_NAMES.setPendingWorktreeDelete);

export const clearPendingWorktreeDeleteUpdate = wf.defineUpdate<
  void,
  [ClearPendingWorktreeDeletePayload]
>(PROJECT_WORKFLOW_UPDATE_NAMES.clearPendingWorktreeDelete);

export const incrementPendingWorktreeDeleteAttemptsUpdate = wf.defineUpdate<
  PendingWorktreeDelete | null,
  [IncrementPendingWorktreeDeleteAttemptsPayload]
>(PROJECT_WORKFLOW_UPDATE_NAMES.incrementPendingWorktreeDeleteAttempts);

export const registerSessionUpdate = wf.defineUpdate<
  SessionRecord,
  [RegisterSessionPayload]
>(PROJECT_WORKFLOW_UPDATE_NAMES.registerSession);

export const unregisterSessionUpdate = wf.defineUpdate<
  void,
  [UnregisterSessionPayload]
>(PROJECT_WORKFLOW_UPDATE_NAMES.unregisterSession);

export const updateSessionActivityUpdate = wf.defineUpdate<
  SessionRecord | null,
  [UpdateSessionActivityPayload]
>(PROJECT_WORKFLOW_UPDATE_NAMES.updateSessionActivity);

// Signal: fire-and-forget change summary propagation from changeWorkflow
export const applyChangeSummarySignal = wf.defineSignal<[ChangeSummaryPayload]>(
  CHANGE_WORKFLOW_SIGNAL_NAMES.applyChangeSummary,
);
