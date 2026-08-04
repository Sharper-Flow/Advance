/**
 * Pure helper: enumerate orphaned session-scoped task queues via Temporal
 * Visibility (rq-isolSessionTaskQueue05 / D1).
 *
 * Queries `AdvAffectedProjects = "{P}"` for RUNNING workflows, collects ALL
 * results (Visibility may return unordered pages), groups by taskQueue
 * client-side, filters to session-scoped queues not already polled, and
 * sorts by oldest workflow startTime for deterministic FIFO selection.
 *
 * Used by `OrphanQueueAdopter` to pick the next orphan to adopt.
 */

import {
  ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX,
  CHANGE_WORKFLOW_PREFIX,
} from "./contracts";
import { escapeVisibilityValue } from "./lifecycle-visibility";
import type {
  TemporalListOutcome,
  TemporalOperations,
  TemporalReadOutcome,
  TemporalLifecycleContext,
} from "./operations";
import { makeTemporalOperationContext } from "./operations";

/**
 * Hard cap on inspected workflows (safety bound). FIFO selection is
 * best-effort past this cap: with >500 active workflows on a project, the
 * truly-oldest orphans beyond the first inspected page may be deferred to a
 * later heartbeat. Bounded by realistic project sizes (tens to low hundreds).
 */
const INSPECTION_LIMIT = 500;

export interface OrphanSessionQueue {
  /** Session-scoped task queue name (advance-{P}-sess_{id}). */
  queue: string;
  /** Oldest workflow startTime on this queue (for FIFO sort). */
  oldestStartTime: Date;
  /** Non-terminal workflow ids currently stranded on this queue. */
  workflowIds?: string[];
}

/**
 * True if any open change workflow is pinned to a session-scoped task queue.
 *
 * Used by KD-2 singleton routing to refuse project-queue activation while
 * existing session-pinned workflows would be stranded without a poller.
 */
export async function hasActiveSessionPinnedWorkflows(
  owner: TemporalOperations,
  projectId: string,
  preflightCtx?: TemporalLifecycleContext,
): Promise<TemporalReadOutcome<boolean>> {
  const projectPrefix = `${CHANGE_WORKFLOW_PREFIX}${projectId}/`;
  const sessionPrefix = buildSessionQueuePrefix(projectId);
  const safeProjectId = escapeVisibilityValue(projectId);
  const query = `AdvAffectedProjects = "${safeProjectId}"`;
  const placeholderWorkflowId = `${projectPrefix}session-pin-check`;

  const ctx = makeTemporalOperationContext(
    projectId,
    placeholderWorkflowId,
    "list",
    "hasActiveSessionPinnedWorkflows",
    preflightCtx?.budgetMs ?? 10_000,
    preflightCtx?.abortSignal,
  );
  const outcome = await owner.list<{
    workflowId: string;
    taskQueue: string;
    status: { name: string };
  }>(ctx, query);
  if (outcome.kind !== "complete") {
    return {
      kind: "degraded",
      error: outcome.error,
      diagnostic: outcome.diagnostic,
    };
  }
  for (const wf of outcome.value) {
    if (wf.status.name !== "RUNNING") continue;
    if (!wf.workflowId.startsWith(projectPrefix)) continue;
    if (!wf.taskQueue.startsWith(sessionPrefix)) continue;
    return { kind: "complete", value: true };
  }
  return { kind: "complete", value: false };
}

export interface ListOrphanSessionQueuesOptions {
  /**
   * Cancels the underlying Visibility gRPC calls when aborted (routed through
   * the TemporalOperations owner). Also breaks the collection loop.
   */
  signal?: AbortSignal;
  /**
   * Wall-clock bound checked between yielded records. Partial results are
   * returned rather than thrown — a truncated orphan list is still adoptable,
   * and the caller re-enumerates on the next tick.
   *
   * NB: this bound only fires between records. A stream that stalls before
   * yielding anything is the caller's responsibility to bound (see
   * `OrphanQueueAdopter.enumerateOrphansBounded`).
   */
  deadlineMs?: number;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
  /** Include workflow ids for bounded diagnostic reporting. */
  includeWorkflowDetails?: boolean;
}

function buildSessionQueuePrefix(projectId: string): string {
  return `${ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX}-${projectId}-sess_`;
}

/**
 * List session-scoped task queues that have RUNNING change workflows but
 * are not in the already-polled set.
 *
 * @returns Array sorted by oldestStartTime ascending (FIFO). Empty if no
 * orphans found.
 */
export async function listOrphanSessionQueues(
  owner: TemporalOperations,
  projectId: string,
  polledQueues: readonly string[],
  options: ListOrphanSessionQueuesOptions = {},
): Promise<TemporalListOutcome<OrphanSessionQueue[]>> {
  const {
    signal,
    deadlineMs,
    now = () => Date.now(),
    includeWorkflowDetails = false,
  } = options;
  const startedAt = now();

  const safeProjectId = escapeVisibilityValue(projectId);
  const query = `AdvAffectedProjects = "${safeProjectId}"`;

  const projectPrefix = `${CHANGE_WORKFLOW_PREFIX}${projectId}/`;
  const sessionPrefix = buildSessionQueuePrefix(projectId);
  const polled = new Set(polledQueues);
  const placeholderWorkflowId = `${projectPrefix}orphan-session-queues`;

  // Collect per-queue oldest startTime
  const queueDetails = new Map<
    string,
    { oldestStartTime: Date; workflowIds: string[] }
  >();
  let inspected = 0;

  const ctx = makeTemporalOperationContext(
    projectId,
    placeholderWorkflowId,
    "list",
    "listOrphanSessionQueues",
    10_000,
    signal,
  );
  const outcome = await owner.list<{
    workflowId: string;
    taskQueue: string;
    startTime: Date;
    status: { name: string };
  }>(ctx, query, { limit: INSPECTION_LIMIT });
  if (outcome.kind !== "complete") {
    return outcome;
  }
  for (const wf of outcome.value) {
    if (signal?.aborted) break;
    if (deadlineMs !== undefined && now() - startedAt >= deadlineMs) break;
    if (inspected >= INSPECTION_LIMIT) break;
    inspected++;

    // Only change workflows (exclude epics)
    if (!wf.workflowId.startsWith(projectPrefix)) continue;

    // Only RUNNING workflows need a poller
    if (wf.status.name !== "RUNNING") continue;

    // Only session-scoped queues can be orphaned
    if (!wf.taskQueue.startsWith(sessionPrefix)) continue;

    // Skip queues already being polled
    if (polled.has(wf.taskQueue)) continue;

    // Keep the oldest startTime per queue (for deterministic FIFO sort)
    const existing = queueDetails.get(wf.taskQueue);
    if (!existing) {
      queueDetails.set(wf.taskQueue, {
        oldestStartTime: wf.startTime,
        workflowIds: includeWorkflowDetails ? [wf.workflowId] : [],
      });
    } else {
      if (wf.startTime < existing.oldestStartTime) {
        existing.oldestStartTime = wf.startTime;
      }
      if (includeWorkflowDetails) existing.workflowIds.push(wf.workflowId);
    }
  }

  // Sort by oldest startTime ascending (FIFO — oldest orphans first)
  const orphans = [...queueDetails.entries()].map(([queue, details]) => ({
    queue,
    oldestStartTime: details.oldestStartTime,
    ...(includeWorkflowDetails ? { workflowIds: details.workflowIds } : {}),
  }));
  orphans.sort(
    (a, b) => a.oldestStartTime.getTime() - b.oldestStartTime.getTime(),
  );

  return { kind: "complete", value: orphans, truncated: outcome.truncated };
}
