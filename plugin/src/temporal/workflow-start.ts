import type { Change } from "../types";
import {
  buildChangeWorkflowId,
  buildEpicWorkflowId,
  buildProjectTaskQueue,
  buildSessionTaskQueue,
} from "./client";
import type { ChangeWorkflowInput, EpicWorkflowInput } from "./contracts";
import { changeSeedStateFromChange } from "./change-state";
import { buildTemporalSearchAttributes } from "./observability";
import { readDiskArtifactsForHydration } from "../storage/store-temporal/hydrate-documents";
import { changeStateQuery } from "./messages";
import { changeWorkflow, epicWorkflow } from "./workflows";
import { enforceMutationEligibilityForError } from "./mutation-safety";
import { createLogger } from "../utils/debug-log";
import {
  resolveCreationIdempotency,
  ChangeCreationHashConflictError,
} from "../storage/store-temporal/creation-hash";
import {
  hasActiveSessionPinnedWorkflows,
  type OrphanListClient,
} from "./list-orphan-session-queues";

const logger = createLogger("workflow-start");

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
  /**
   * Optional Visibility enumeration surface. When present and
   * `workflowQueueMode` is `project`, `ensureChangeWorkflowStarted` checks
   * for active session-pinned workflows before entering singleton mode.
   */
  list?: (opts: { query: string }) => AsyncIterable<{
    workflowId: string;
    taskQueue: string;
    status: { name: string };
  }>;
}

/**
 * Thrown when explicit singleton routing would strand existing session-pinned
 * workflows by moving new workflows to the project queue while a session
 * queue still has running workflows and no poller.
 */
export class IncompatibleActiveSessionQueuesError extends Error {
  readonly name = "IncompatibleActiveSessionQueuesError";
  readonly code = "INCOMPATIBLE_ACTIVE_SESSION_QUEUES";
  constructor(
    message = "Cannot activate project-queue singleton mode while session-pinned workflows are still running.",
  ) {
    super(message);
  }
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
  options?: { workflowQueueMode?: "session" | "project" },
): Promise<WorkflowHandleLike> {
  const workflowId = buildChangeWorkflowId(input.projectId, input.changeId);
  // KD-10 / rq-isolSessionTaskQueue01: route to per-session task queue when
  // the caller provides a sessionId. rq-isolSessionTaskQueue05: orphaned
  // session queues (from dead sessions) are adopted at runtime by the
  // OrphanQueueAdopter heartbeat coordinator.
  // KD-2: explicit singleton mode (`workflowQueueMode: "project"`) routes
  // new workflows to the permanent project queue so the single elected host
  // can poll them.
  const taskQueue =
    options?.workflowQueueMode === "project" || !input.sessionId
      ? buildProjectTaskQueue(input.projectId)
      : buildSessionTaskQueue(input.projectId, input.sessionId);

  if (options?.workflowQueueMode === "project" && client.workflow.list) {
    const hasSessionPinned = await hasActiveSessionPinnedWorkflows(
      client as unknown as OrphanListClient,
      input.projectId,
    );
    if (hasSessionPinned) {
      throw new IncompatibleActiveSessionQueuesError(
        `Project-queue singleton mode is incompatible with active session-pinned workflows for project ${input.projectId}.`,
      );
    }
  }

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
    if (hydrated.documents) {
      inputWithHydration = {
        ...input,
        seedState: {
          ...(input.seedState ?? {}),
          documents: hydrated.documents,
        },
      };
    }
    if (hydrated.warnings.length > 0) {
      logger.warn(
        `Hydration warnings for ${input.changeId}: ${hydrated.warnings.map((w) => `${w.kind} ${w.path}${w.actual ? ` (${w.actual} bytes)` : ""}`).join(", ")}`,
      );
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
        epicId: inputWithHydration.seedState?.epic_membership?.epic_id,
      });
    }
    return await client.workflow.start(changeWorkflow, startOpts);
  } catch (error) {
    if (isAlreadyStartedError(error)) {
      const handle = client.workflow.getHandle(workflowId);
      // rq-creationRequestHash01 (tk-74c358188ffb): when the caller supplies
      // a canonical hash, verify the existing workflow's recorded hash before
      // silently reusing its handle. This closes the post-commit-timeout
      // duplicate-creation defect class — a retry whose business intent
      // differs from the original (e.g. different capability, origin, or
      // parent linkage) refuses with a typed conflict instead of silently
      // masking the original request. A matching hash is the idempotent
      // success path. When the caller omits the hash, the legacy silent-
      // reuse behavior is preserved.
      if (input.creationRequestHash) {
        const state = (await handle.query(changeStateQuery)) as {
          creation_request_hash?: string;
        };
        const decision = resolveCreationIdempotency({
          existingHash: state?.creation_request_hash,
          computedHash: input.creationRequestHash,
        });
        if (decision.kind === "hash_conflict") {
          throw new ChangeCreationHashConflictError({
            changeId: input.changeId,
            existingHash: decision.existing_hash,
            computedHash: decision.computed_hash,
          });
        }
      }
      return handle;
    }
    // SC4 mutation-eligibility guard: a workflow-start failure classified
    // as mutation-ineligible (no-poller / query_failed_or_not_registered /
    // deadline / unknown) must not be retried via the outer path. Surface
    // `TemporalMutationIneligibleError` so callers can require an operator
    // recovery action before retrying.
    enforceMutationEligibilityForError(error);
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
