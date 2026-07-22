/**
 * Orphaned session-queue discovery and adoption
 * (rq-orphanSessionAdoption01).
 *
 * When per-session task queues are used (advance-{P}-sess_{id}), workflows
 * started on a session's queue become unreachable when that session's
 * worker dies — no poller remains on the dead queue. This module
 * discovers session-scoped queues that still have RUNNING change workflows
 * but are not currently polled, and adopts them by registering them with
 * the live worker.
 *
 * Discovery uses Temporal Visibility (client.workflow.list) to enumerate
 * running change workflows for the project, extracts their taskQueue, and
 * filters for session-scoped queues not in the already-registered set.
 * Adoption calls worker.registerQueue for each discovered queue.
 *
 * Performance: bounded by the number of running workflows for the project
 * (typically <100). The Visibility query paginates automatically via the
 * SDK's async iterable. A hard cap prevents pathological cases.
 */

import {
  ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX,
  CHANGE_WORKFLOW_PREFIX,
} from "./contracts";
import { escapeVisibilityValue } from "./lifecycle-visibility";

/** Hard cap on workflows inspected during discovery. */
const DISCOVERY_LIMIT = 500;

/**
 * Minimal client shape for Visibility enumeration. The real
 * `@temporalio/client` Client satisfies this structurally.
 */
export interface OrphanDiscoveryClient {
  workflow: {
    list: (opts: { query: string }) => AsyncIterable<{
      workflowId: string;
      taskQueue: string;
      status: { name: string };
    }>;
  };
}

/** Minimal worker shape for queue adoption. */
export interface QueueAdoptableWorker {
  registerQueue(taskQueue: string): Promise<void>;
}

export interface OrphanQueueAdoptionResult {
  discovered: string[];
  adopted: string[];
  failed: Array<{ queue: string; error: string }>;
}

/**
 * Build the session-queue prefix for this project.
 * Session queues follow the pattern: advance-{projectId}-sess_{sessionId}
 */
function buildSessionQueuePrefix(projectId: string): string {
  return `${ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX}-${projectId}-sess_`;
}

/**
 * Discover session-scoped task queues that have RUNNING change workflows
 * but are not currently being polled by any registered worker.
 *
 * @returns Array of orphaned session-queue names to adopt.
 */
export async function discoverOrphanedSessionQueues(
  client: OrphanDiscoveryClient,
  projectId: string,
  registeredQueues: readonly string[],
): Promise<string[]> {
  const safeProjectId = escapeVisibilityValue(projectId);
  const query = `AdvAffectedProjects = "${safeProjectId}"`;

  const projectPrefix = `${CHANGE_WORKFLOW_PREFIX}${projectId}/`;
  const sessionPrefix = buildSessionQueuePrefix(projectId);
  const registered = new Set(registeredQueues);
  const orphanQueues = new Set<string>();
  let inspected = 0;

  for await (const wf of client.workflow.list({ query })) {
    if (inspected >= DISCOVERY_LIMIT) break;
    inspected++;

    // Only change workflows (exclude epic workflows with adv/epic/ prefix)
    if (!wf.workflowId.startsWith(projectPrefix)) continue;

    // Only RUNNING workflows need a poller
    if (wf.status.name !== "RUNNING") continue;

    // Only session-scoped queues can be orphaned
    if (!wf.taskQueue.startsWith(sessionPrefix)) continue;

    // Skip queues already being polled
    if (registered.has(wf.taskQueue)) continue;

    orphanQueues.add(wf.taskQueue);
  }

  return [...orphanQueues];
}

/**
 * Adopt orphaned session queues by registering them with the live worker.
 *
 * Each queue adoption is independent — a failure on one queue does not
 * prevent adoption of others. Results include both successful and failed
 * adoptions for observability.
 */
export async function adoptOrphanedSessionQueues(
  worker: QueueAdoptableWorker,
  orphanQueues: readonly string[],
): Promise<OrphanQueueAdoptionResult> {
  const adopted: string[] = [];
  const failed: Array<{ queue: string; error: string }> = [];

  for (const queue of orphanQueues) {
    try {
      await worker.registerQueue(queue);
      adopted.push(queue);
    } catch (err) {
      failed.push({
        queue,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { discovered: [...orphanQueues], adopted, failed };
}
