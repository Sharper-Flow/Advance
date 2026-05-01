/**
 * Temporal Migration / Recovery Helpers
 *
 * Bootstrap and recovery surface for Temporal-backed ADV storage.
 *
 * Key semantics:
 *   - `ensureProjectWorkflowStarted` / `ensureChangeWorkflowStarted` are
 *     idempotent: if the target workflow is already running, the existing
 *     handle is returned instead of attempting a duplicate start.
 *   - `migrateProjectState` writes only **terminal** ledger entries
 *     (`status: "done"` on success, `status: "failed"` on error). It does
 *     not emit an intermediate `pending` entry so there is no stale window
 *     to reconcile.
 *   - `reImportChangeState` seeds a ChangeWorkflow from an existing
 *     `Change` payload (typically the legacy JSON backend's view) so a
 *     workflow can resume from historical state.
 *   - `rebuildProjectWorkflowState` is an explicit re-seed path for
 *     recovery.
 *
 * All functions here are **non-destructive** — they neither delete legacy
 * files nor overwrite existing workflow state; they only attempt to start
 * or re-seed workflows safely.
 */
import type { Change } from "../types";
import {
  buildChangeWorkflowId,
  buildProjectTaskQueue,
  buildProjectWorkflowId,
} from "./client";
import type {
  ArtifactMetadata,
  ChangeWorkflowInput,
  ChangeWorkflowState,
  MigrationLedgerEntry,
  ProjectWisdomEntry,
  ProjectWorkflowInput,
  ProjectWorkflowState,
} from "./contracts";
import {
  changeStateQuery,
  projectStateQuery,
  recordMigrationEntryUpdate,
} from "./messages";
import { buildTemporalSearchAttributes } from "./observability";
import { changeWorkflow, projectWorkflow } from "./workflows";

export interface WorkflowHandleLike {
  query: (definition: unknown, ...args: unknown[]) => Promise<unknown>;
  executeUpdate: (
    definition: unknown,
    options: { args?: unknown[] },
  ) => Promise<unknown>;
}

export interface WorkflowClientLike {
  start: (
    workflow: unknown,
    options: {
      workflowId: string;
      taskQueue: string;
      args: [unknown];
      searchAttributes?: Record<string, unknown[]>;
    },
  ) => Promise<WorkflowHandleLike>;
  getHandle: (workflowId: string) => WorkflowHandleLike;
}

function isAlreadyStartedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already started|already exists|Workflow execution already started/i.test(
    message,
  );
}

export async function ensureProjectWorkflowStarted(
  client: { workflow: WorkflowClientLike },
  input: ProjectWorkflowInput & {
    agenda?: ProjectWorkflowState["agenda"];
    projectWisdom?: ProjectWisdomEntry[];
    migrationLedger?: MigrationLedgerEntry[];
  },
): Promise<WorkflowHandleLike> {
  const workflowId = buildProjectWorkflowId(input.projectId);
  const taskQueue = buildProjectTaskQueue(input.projectId);
  const args: [
    ProjectWorkflowInput & {
      agenda?: ProjectWorkflowState["agenda"];
      projectWisdom?: ProjectWisdomEntry[];
      migrationLedger?: MigrationLedgerEntry[];
    },
  ] = [input];

  try {
    return await client.workflow.start(projectWorkflow, {
      workflowId,
      taskQueue,
      args,
    });
  } catch (error) {
    if (isAlreadyStartedError(error)) {
      return client.workflow.getHandle(workflowId);
    }
    throw error;
  }
}

export async function ensureChangeWorkflowStarted(
  client: { workflow: WorkflowClientLike },
  input: ChangeWorkflowInput & {
    seedState?: Partial<
      Pick<
        ChangeWorkflowState,
        | "status"
        | "tasks"
        | "wisdom"
        | "gates"
        | "reentry_history"
        | "artifacts"
        | "task_runs"
      >
    >;
  },
): Promise<WorkflowHandleLike> {
  const workflowId = buildChangeWorkflowId(input.projectId, input.changeId);
  const taskQueue = buildProjectTaskQueue(input.projectId);
  const args: [
    ChangeWorkflowInput & {
      seedState?: Partial<
        Pick<
          ChangeWorkflowState,
          | "status"
          | "tasks"
          | "wisdom"
          | "gates"
          | "reentry_history"
          | "artifacts"
          | "task_runs"
        >
      >;
    },
  ] = [input];

  try {
    const startOpts: {
      workflowId: string;
      taskQueue: string;
      args: [unknown];
      searchAttributes?: Record<string, unknown[]>;
    } = {
      workflowId,
      taskQueue,
      args,
    };
    if (input.searchAttributesEnabled !== false) {
      startOpts.searchAttributes = buildTemporalSearchAttributes({
        projectId: input.projectId,
        changeId: input.changeId,
        changeStatus: "draft",
        activeGate: "proposal",
      });
    }
    return await client.workflow.start(changeWorkflow, startOpts);
  } catch (error) {
    if (isAlreadyStartedError(error)) {
      return client.workflow.getHandle(workflowId);
    }
    throw error;
  }
}

export async function migrateProjectState(
  client: { workflow: WorkflowClientLike },
  input: ProjectWorkflowInput & {
    agenda?: ProjectWorkflowState["agenda"];
    projectWisdom?: ProjectWisdomEntry[];
    migrationLedger?: MigrationLedgerEntry[];
  },
  ledger: {
    key: string;
    source: MigrationLedgerEntry["source"];
    detail?: string;
  },
): Promise<WorkflowHandleLike> {
  const handle = await ensureProjectWorkflowStarted(client, input);
  try {
    const done: MigrationLedgerEntry = {
      key: ledger.key,
      source: ledger.source,
      status: "done",
      recordedAt: new Date().toISOString(),
      detail: ledger.detail,
    };
    await handle.executeUpdate(recordMigrationEntryUpdate, { args: [done] });
    return handle;
  } catch (error) {
    const failed: MigrationLedgerEntry = {
      key: ledger.key,
      source: ledger.source,
      status: "failed",
      recordedAt: new Date().toISOString(),
      detail:
        ledger.detail ??
        (error instanceof Error
          ? error.message
          : String(error ?? "migration failed")),
    };
    await handle.executeUpdate(recordMigrationEntryUpdate, { args: [failed] });
    throw error;
  }
}

export async function reImportChangeState(
  client: { workflow: WorkflowClientLike },
  input: {
    projectId: string;
    change: Change;
    initializedAt?: string;
  },
): Promise<WorkflowHandleLike> {
  return ensureChangeWorkflowStarted(client, {
    projectId: input.projectId,
    changeId: input.change.id,
    title: input.change.title,
    initializedAt: input.initializedAt ?? input.change.created_at,
    seedState: {
      status: input.change.status,
      tasks: input.change.tasks,
      wisdom: input.change.wisdom,
      gates: input.change.gates,
      reentry_history: input.change.reentry_history,
      task_runs: (
        input.change as Change & {
          task_runs?: ChangeWorkflowState["task_runs"];
        }
      ).task_runs,
    },
  });
}

export async function rebuildProjectWorkflowState(
  client: { workflow: WorkflowClientLike },
  input: ProjectWorkflowInput & {
    agenda?: ProjectWorkflowState["agenda"];
    projectWisdom?: ProjectWisdomEntry[];
    migrationLedger?: MigrationLedgerEntry[];
  },
): Promise<WorkflowHandleLike> {
  return ensureProjectWorkflowStarted(client, input);
}

export async function reExportChangeArtifacts(
  client: { workflow: WorkflowClientLike },
  input: { projectId: string; changeId: string },
): Promise<
  Partial<Record<keyof ChangeWorkflowState["artifacts"], ArtifactMetadata>>
> {
  const handle = client.workflow.getHandle(
    buildChangeWorkflowId(input.projectId, input.changeId),
  );
  const state = (await handle.query(changeStateQuery)) as Pick<
    ChangeWorkflowState,
    "artifacts"
  >;
  return state.artifacts ?? {};
}

export async function loadProjectWorkflowState(
  client: { workflow: WorkflowClientLike },
  input: { projectId: string },
): Promise<ProjectWorkflowState> {
  const handle = client.workflow.getHandle(
    buildProjectWorkflowId(input.projectId),
  );
  return (await handle.query(projectStateQuery)) as ProjectWorkflowState;
}
