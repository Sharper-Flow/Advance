import type { Change } from "../types";
import {
  buildChangeWorkflowId,
  buildProjectTaskQueue,
  buildProjectWorkflowId,
} from "./client";
import type {
  ChangeWorkflowInput,
  ChangeWorkflowState,
  MigrationLedgerEntry,
  ProjectWisdomEntry,
  ProjectWorkflowInput,
  ProjectWorkflowState,
} from "./contracts";
import { buildTemporalSearchAttributes } from "./observability";
import { changeWorkflow, projectWorkflow } from "./workflows";

export interface WorkflowHandleLike {
  query: (definition: unknown, ...args: unknown[]) => Promise<unknown>;
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

  try {
    return await client.workflow.start(projectWorkflow, {
      workflowId,
      taskQueue,
      args: [input],
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
        | "deltas"
        | "wisdom"
        | "gates"
        | "reentry_history"
        | "artifacts"
      >
    >;
  },
): Promise<WorkflowHandleLike> {
  const workflowId = buildChangeWorkflowId(input.projectId, input.changeId);
  const taskQueue = buildProjectTaskQueue(input.projectId);

  try {
    const startOpts: {
      workflowId: string;
      taskQueue: string;
      args: [unknown];
      searchAttributes?: Record<string, unknown[]>;
    } = {
      workflowId,
      taskQueue,
      args: [input],
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

export async function reImportChangeState(
  client: { workflow: WorkflowClientLike },
  input: {
    projectId: string;
    change: Change;
    initializedAt?: string;
    projectionChangesDir?: string;
    archiveProjects?: Array<{ projectPath: string }>;
  },
): Promise<WorkflowHandleLike> {
  return ensureChangeWorkflowStarted(client, {
    projectId: input.projectId,
    changeId: input.change.id,
    title: input.change.title,
    initializedAt: input.initializedAt ?? input.change.created_at,
    projectionChangesDir: input.projectionChangesDir,
    archiveProjects: input.archiveProjects,
    seedState: {
      status: input.change.status,
      tasks: input.change.tasks,
      deltas: input.change.deltas,
      wisdom: input.change.wisdom,
      gates: input.change.gates,
      reentry_history: input.change.reentry_history,
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
