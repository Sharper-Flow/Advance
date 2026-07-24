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

/**
 * Hard cap on inspected workflows (safety bound). FIFO selection is
 * best-effort past this cap: with >500 active workflows on a project, the
 * truly-oldest orphans beyond the first inspected page may be deferred to a
 * later heartbeat. Bounded by realistic project sizes (tens to low hundreds).
 */
const INSPECTION_LIMIT = 500;

/**
 * Minimal client shape for Visibility enumeration.
 * `@temporalio/client` Client satisfies this structurally.
 */
export interface OrphanListClient {
  workflow: {
    list: (opts: { query: string }) => AsyncIterable<{
      workflowId: string;
      taskQueue: string;
      startTime: Date;
      status: { name: string };
    }>;
  };
}

export interface OrphanSessionQueue {
  /** Session-scoped task queue name (advance-{P}-sess_{id}). */
  queue: string;
  /** Oldest workflow startTime on this queue (for FIFO sort). */
  oldestStartTime: Date;
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
  client: OrphanListClient,
  projectId: string,
  polledQueues: readonly string[],
): Promise<OrphanSessionQueue[]> {
  const safeProjectId = escapeVisibilityValue(projectId);
  const query = `AdvAffectedProjects = "${safeProjectId}"`;

  const projectPrefix = `${CHANGE_WORKFLOW_PREFIX}${projectId}/`;
  const sessionPrefix = buildSessionQueuePrefix(projectId);
  const polled = new Set(polledQueues);

  // Collect per-queue oldest startTime
  const queueOldestStart = new Map<string, Date>();
  let inspected = 0;

  for await (const wf of client.workflow.list({ query })) {
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
    const existing = queueOldestStart.get(wf.taskQueue);
    if (!existing || wf.startTime < existing) {
      queueOldestStart.set(wf.taskQueue, wf.startTime);
    }
  }

  // Sort by oldest startTime ascending (FIFO — oldest orphans first)
  const result = [...queueOldestStart.entries()].map(
    ([queue, oldestStartTime]) => ({
      queue,
      oldestStartTime,
    }),
  );
  result.sort(
    (a, b) => a.oldestStartTime.getTime() - b.oldestStartTime.getTime(),
  );

  return result;
}
