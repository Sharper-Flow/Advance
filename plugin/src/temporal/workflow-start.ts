import type { Change } from "../types";
import {
  buildChangeWorkflowId,
  buildEpicWorkflowId,
  buildProjectTaskQueue,
} from "./client";
import type { ChangeWorkflowInput, EpicWorkflowInput } from "./contracts";
import { changeSeedStateFromChange } from "./change-state";
import { buildTemporalSearchAttributes } from "./observability";
import { readDiskArtifactsForHydration } from "../storage/store-temporal/hydrate-documents";
import { changeWorkflow, epicWorkflow } from "./workflows";

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

export async function ensureChangeWorkflowStarted(
  client: { workflow: WorkflowClientLike },
  input: ChangeWorkflowInput,
): Promise<WorkflowHandleLike> {
  const workflowId = buildChangeWorkflowId(input.projectId, input.changeId);
  const taskQueue = buildProjectTaskQueue(input.projectId);

  // KD-5 workflow-start hydration: when starting a workflow for a pre-
  // migration change whose disk artifacts pre-date Temporal-first writes,
  // populate `seedState.documents` from disk so the first read sees
  // Temporal-backed content. Idempotent + cold-start-only (re-runs after
  // `already started` reuse the existing workflow's state.documents).
  //
  // Hydration is a no-op when:
  //   - `seedState.documents` is already populated by the caller (new
  //     change with content via options-object API).
  //   - No `projectionChangesDir` is provided (tests / no-disk fixtures).
  //   - The change directory doesn't exist on disk (brand-new change).
  //   - No artifact file on disk has >=1 non-whitespace char (partial-write
  //     robustness).
  let inputWithHydration = input;
  if (
    !input.seedState?.documents &&
    input.projectionChangesDir &&
    input.changeId
  ) {
    const hydrated = await readDiskArtifactsForHydration(
      input.projectionChangesDir,
      input.changeId,
    );
    if (hydrated) {
      inputWithHydration = {
        ...input,
        seedState: { ...(input.seedState ?? {}), documents: hydrated },
      };
    }
  }

  try {
    const startOpts: {
      workflowId: string;
      taskQueue: string;
      args: [unknown];
      searchAttributes?: Record<string, unknown[]>;
    } = {
      workflowId,
      taskQueue,
      args: [inputWithHydration],
    };
    if (inputWithHydration.searchAttributesEnabled !== false) {
      startOpts.searchAttributes = buildTemporalSearchAttributes({
        projectId: inputWithHydration.projectId,
        changeId: inputWithHydration.changeId,
        changeStatus: "draft",
        activeGate: "proposal",
        backlogIssueNumber: inputWithHydration.seedState?.origin?.issue_number,
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
    seedState: changeSeedStateFromChange(input.change),
  });
}

export async function ensureEpicWorkflowStarted(
  client: { workflow: WorkflowClientLike },
  input: EpicWorkflowInput,
): Promise<WorkflowHandleLike> {
  const workflowId = buildEpicWorkflowId(input.projectId, input.epicId);
  const taskQueue = buildProjectTaskQueue(input.projectId);

  try {
    const startOpts: {
      workflowId: string;
      taskQueue: string;
      args: [unknown];
    } = {
      workflowId,
      taskQueue,
      args: [input],
    };
    return await client.workflow.start(epicWorkflow, startOpts);
  } catch (error) {
    if (isAlreadyStartedError(error)) {
      return client.workflow.getHandle(workflowId);
    }
    throw error;
  }
}
