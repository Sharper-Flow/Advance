/**
 * Temporal Query/Update Definitions — Client-Side Bindings
 *
 * These `wf.defineQuery` / `wf.defineUpdate` calls MUST duplicate the
 * definitions used inside `workflows.ts`. Temporal's workflow bundle is
 * compiled in isolation, so handler tokens created inside the workflow
 * cannot be imported by the outer client/adapter layer. The string names
 * (e.g. `"adv.change.state"`) are the actual wire contract; the handler
 * *tokens* are local bindings.
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

export const changeBootstrapQuery =
  wf.defineQuery<ChangeWorkflowBootstrapState>("adv.change.bootstrap");
export const changeStateQuery =
  wf.defineQuery<ChangeWorkflowState>("adv.change.state");
export const changeTasksQuery = wf.defineQuery<
  ChangeWorkflowState["tasks"],
  [
    ChangeWorkflowState["tasks"][number]["status"] | undefined,
    string | undefined,
  ]
>("adv.change.tasks");
export const changeReadyQuery =
  wf.defineQuery<
    ReturnType<typeof import("./change-state").getReadyTasksFromChangeState>
  >("adv.change.ready");
export const changeTaskQuery = wf.defineQuery<
  ChangeWorkflowState["tasks"][number] | null,
  [string]
>("adv.change.task");

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
>("adv.change.addTask");
export const updateTaskUpdate = wf.defineUpdate<
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
>("adv.change.updateTask");
export const recordTaskEvidenceUpdate = wf.defineUpdate<
  ChangeWorkflowState["tasks"][number],
  [string, "red" | "green", TddPhaseEvidence]
>("adv.change.recordTaskEvidence");
export const setTaskPhaseUpdate = wf.defineUpdate<
  ChangeWorkflowState["tasks"][number],
  [string, TddPhase]
>("adv.change.setTaskPhase");
export const cancelTaskUpdate = wf.defineUpdate<
  ChangeWorkflowState["tasks"][number],
  [string, import("../types").Cancellation]
>("adv.change.cancelTask");
export const reclassifyTaskTddUpdate = wf.defineUpdate<
  ChangeWorkflowState["tasks"][number],
  [string, TddReclassification]
>("adv.change.reclassifyTaskTdd");
export const completeGateUpdate = wf.defineUpdate<
  ChangeWorkflowState["gates"][GateId],
  [GateId, string | undefined, string | undefined]
>("adv.change.completeGate");
export const reopenFromGateUpdate = wf.defineUpdate<
  void,
  [GateId, string, string | undefined, string | undefined]
>("adv.change.reopenFromGate");
export const addChangeWisdomUpdate = wf.defineUpdate<
  void,
  [WisdomType, string, string | undefined]
>("adv.change.addWisdom");
export const updateArtifactMetadataUpdate = wf.defineUpdate<
  void,
  [ArtifactKind, ArtifactMetadata]
>("adv.change.updateArtifactMetadata");
export const closeChangeUpdate = wf.defineUpdate<void, [ChangeClosure]>(
  "adv.change.closeChange",
);

export const projectBootstrapQuery =
  wf.defineQuery<ProjectWorkflowBootstrapState>("adv.project.bootstrap");
export const projectStateQuery =
  wf.defineQuery<ProjectWorkflowState>("adv.project.state");
export const projectAgendaQuery = wf.defineQuery<
  ProjectWorkflowState["agenda"],
  [ProjectWorkflowState["agenda"][number]["status"] | undefined]
>("adv.project.agenda");
export const projectWisdomQuery = wf.defineQuery<
  ProjectWorkflowState["project_wisdom"],
  [WisdomType | undefined]
>("adv.project.wisdom");
export const projectMigrationLedgerQuery = wf.defineQuery<
  ProjectWorkflowState["migration_ledger"]
>("adv.project.migrationLedger");

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
>("adv.project.addAgendaItem");
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
>("adv.project.updateAgendaItem");
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
>("adv.project.addWisdom");
export const recordMigrationEntryUpdate = wf.defineUpdate<
  MigrationLedgerEntry,
  [MigrationLedgerEntry]
>("adv.project.recordMigrationEntry");

// Signal: fire-and-forget change summary propagation from changeWorkflow
export const applyChangeSummarySignal = wf.defineSignal<[ChangeSummaryPayload]>(
  "adv.change.applyChangeSummary",
);
