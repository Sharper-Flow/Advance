/**
 * Tool Adapter Helpers — Signal/Query Surface
 *
 * Thin wrappers around Temporal workflow handle operations.
 * Used by tool-layer code to fire signals and run queries against
 * change workflows, replacing the old executeUpdate-based mutation path.
 *
 * Design: docs/decisions/2026-05-04-signal-driven-change-workflows.md § Section 6
 */

import { buildChangeWorkflowId } from "../temporal/client";
import type { ChangeWorkflowInput } from "../temporal/contracts";
import { ensureChangeWorkflowStarted } from "../temporal/migration";
import {
  type WorkflowHandleLike,
  runTemporal,
  runTemporalQuery,
} from "../storage/store-temporal/shared";

/**
 * Fire-and-forget signal to a change workflow handle.
 * Wrapped with Temporal retry (transient failures are retried).
 */
export async function fireSignal<Args extends unknown[]>(
  handle: WorkflowHandleLike,
  signal: unknown,
  ...args: Args
): Promise<void> {
  await runTemporal(() => handle.signal(signal, ...args));
}

/**
 * Synchronous query against a change workflow handle.
 * Wrapped with a 5-second per-attempt timeout to avoid hanging on dead workers.
 */
export async function querySignal<T>(
  handle: WorkflowHandleLike,
  query: unknown,
  ...args: unknown[]
): Promise<T> {
  return runTemporalQuery(() => handle.query(query, ...args)) as Promise<T>;
}

/**
 * Fire a signal then immediately query for fresh state.
 * The query is issued after the signal Promise resolves; Temporal's
 * query semantics guarantee the query runs on the latest workflow state
 * (including any signal handlers that have completed).
 */
export async function fireSignalAndQuery<T, SArgs extends unknown[]>(
  handle: WorkflowHandleLike,
  signal: unknown,
  signalArgs: SArgs,
  query: unknown,
  ...queryArgs: unknown[]
): Promise<T> {
  await fireSignal(handle, signal, ...signalArgs);
  return querySignal<T>(handle, query, ...queryArgs);
}

/**
 * Build a workflow handle for a specific change within a project.
 */
export function getChangeHandle(
  client: { workflow: { getHandle: (workflowId: string) => unknown } },
  projectId: string,
  changeId: string,
): WorkflowHandleLike {
  const workflowId = buildChangeWorkflowId(projectId, changeId);
  return client.workflow.getHandle(workflowId) as WorkflowHandleLike;
}

/**
 * Start a change workflow (idempotent — returns existing handle if already running).
 * Requires the client to expose `workflow.start`.
 */
export async function startChangeWorkflow(
  client: {
    workflow: {
      start?: (...args: unknown[]) => Promise<unknown>;
      getHandle: (workflowId: string) => unknown;
    };
  },
  input: ChangeWorkflowInput,
): Promise<WorkflowHandleLike> {
  if (typeof client.workflow.start !== "function") {
    throw new Error(
      "Temporal client does not expose workflow.start; cannot start change workflows",
    );
  }

  const handle = await ensureChangeWorkflowStarted(
    {
      workflow: client.workflow as unknown as {
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
      },
    },
    input,
  );
  return handle as WorkflowHandleLike;
}
