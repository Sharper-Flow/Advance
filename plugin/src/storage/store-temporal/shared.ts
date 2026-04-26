import type { Change } from "../../types";
import type {
  ChangeWorkflowState,
  ProjectWorkflowState,
} from "../../temporal/contracts";
import {
  buildChangeWorkflowId,
  buildProjectWorkflowId,
} from "../../temporal/client";
import { projectStateQuery } from "../../temporal/messages";
import { withTemporalRetry } from "../../temporal/retry-wrapper";
import { reinitStsl } from "../../temporal/service";
import { createLogger } from "../../utils/debug-log";
import type { ChangeSummaryMemo, ChangeSummary } from "../store-temporal-memo";
import type { Store } from "../store-types";
import type { TemporalClientBundle } from "../../temporal/client";

const logger = createLogger("store-temporal-shared");

export interface WorkflowHandleLike {
  query: (definition: unknown, ...args: unknown[]) => Promise<unknown>;
  executeUpdate: (
    definition: unknown,
    options: { args?: unknown[] },
  ) => Promise<unknown>;
  signal: (definition: unknown, ...args: unknown[]) => Promise<void>;
}

export interface TemporalHandleClient {
  workflow: {
    getHandle: (workflowId: string) => WorkflowHandleLike;
    start?: (...args: unknown[]) => Promise<WorkflowHandleLike>;
  };
}

export interface TemporalStoreBackendInput {
  legacy: Store;
  temporal: { client: TemporalHandleClient } | TemporalClientBundle;
  projectId: string;
}

export function mapTemporalChangeStateToChange(
  state: ChangeWorkflowState,
): Change {
  return {
    id: state.changeId,
    title: state.title,
    status: state.status,
    created_at: state.createdAt,
    tasks: state.tasks,
    deltas: {},
    wisdom: state.wisdom,
    gates: state.gates,
    reentry_history: state.reentry_history,
  };
}

export function getChangeHandle(
  input: TemporalStoreBackendInput,
  changeId: string,
): WorkflowHandleLike {
  const workflowId = buildChangeWorkflowId(input.projectId, changeId);
  const bundle = input.temporal as { client: TemporalHandleClient };
  return bundle.client.workflow.getHandle(workflowId);
}

/**
 * Build an idempotent `onTransientFailure` hook that calls `reinitStsl`
 * at most once per outer op (KD-2, KD-4). `withTemporalRetry` fires its
 * hook on every transient failure — without per-op idempotency, a
 * 3-attempt failure cycle would close + reopen the connection twice,
 * closing the freshly-opened socket from the first reconnect. The
 * `reconnected` flag is local to this closure so two parallel ops each
 * get their own gate; STSL's own single-flight guard collapses
 * concurrent triggers into one Connection.connect.
 *
 * Reconnect failure is non-fatal — the original op error propagates
 * after the retry budget. `reinitStsl` already records the failure in
 * `StslStats.reconnectFailureCount`, so swallowing here keeps the
 * retry loop intact without losing observability.
 */
export function makeReconnectingHook(): () => Promise<void> {
  let reconnected = false;
  return async () => {
    if (reconnected) return;
    reconnected = true;
    try {
      await reinitStsl();
    } catch (err) {
      logger.debug(
        `STSL reinit failed during retry: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
}

export async function runTemporal<T>(op: () => Promise<T>): Promise<T> {
  return withTemporalRetry(op, {
    onTransientFailure: makeReconnectingHook(),
  });
}

/**
 * Per-attempt 5s timeout for `handle.query(...)` calls. Without this,
 * a dead worker causes the query to hang indefinitely and all tool
 * calls through that path stall with it.
 *
 * Applied ONLY to query callsites — `executeUpdate`, `workflow.start`,
 * and `getHandle` keep the unbounded `runTemporal` so long-running
 * legitimate operations don't get interrupted. See design.md § KD-2,
 * P1.3.8.
 */
const QUERY_TIMEOUT_MS = 5_000;

export async function runTemporalQuery<T>(
  op: () => Promise<T>,
): Promise<T> {
  return withTemporalRetry(op, {
    timeoutMs: QUERY_TIMEOUT_MS,
    onTransientFailure: makeReconnectingHook(),
  });
}

/**
 * Background hydration: query projectWorkflow.state and bulk-load
 * change_summaries into the Memo. Best-effort — failures are logged but
 * never block store creation.
 */
export function hydrateMemoFromPSW(
  input: TemporalStoreBackendInput,
  memo: ChangeSummaryMemo,
): void {
  void (async () => {
    try {
      const pswState = (await runTemporalQuery(() => {
        const handle = getProjectHandleForInput(input);
        if (!handle) {
          throw new Error("hydrateMemoFromPSW: no project handle available");
        }
        return handle.query(projectStateQuery);
      })) as ProjectWorkflowState | null;
      if (!pswState?.change_summaries) return;
      const entries: Array<[string, ChangeSummary]> = [];
      for (const [changeId, summary] of Object.entries(
        pswState.change_summaries,
      )) {
        if (summary && typeof summary === "object" && "id" in summary) {
          entries.push([changeId, summary as ChangeSummary]);
        }
      }
      if (entries.length > 0) {
        memo.bulkSet(entries);
      }
    } catch {
      // PSW may not be running; hydration is best-effort
    }
  })();
}

export function getProjectHandleForInput(
  input: TemporalStoreBackendInput,
): WorkflowHandleLike | null {
  try {
    const workflowId = buildProjectWorkflowId(input.projectId);
    const bundle = input.temporal as { client: TemporalHandleClient };
    return bundle.client.workflow.getHandle(workflowId);
  } catch {
    return null;
  }
}
