/**
 * Tool Adapter Helpers — Signal/Query Surface
 *
 * Thin wrappers around Temporal workflow handle operations.
 * Used by tool-layer code to fire signals and run queries against
 * change workflows, replacing the old executeUpdate-based mutation path.
 *
 * Requirement anchors: rq-changeWorkflowSignalOnly01 and rq-cacheRefresh01.
 */

import { buildChangeWorkflowId } from "../temporal/client";
import type { ChangeWorkflowInput } from "../temporal/contracts";
import { ensureChangeWorkflowStarted } from "../temporal/workflow-start";
import {
  getGuardedChangeHandle,
  type TemporalStoreBackendInput,
  type WorkflowHandleLike,
  runTemporal,
  runTemporalQuery,
} from "../storage/store-temporal/shared";
import type { Store } from "../storage/store";
import { getGateStatusQuery } from "../temporal/messages";
import type { GateCompletion, GateId } from "../types";

// Temporal signal processing + projection can take several seconds under load.
// 60 attempts × 500ms = 30s total gives adequate headroom for CI and local dev.
export const GATE_COMPLETION_POLL_ATTEMPTS = 60;
export const GATE_COMPLETION_POLL_DELAY_MS = 500;

const gatePollDelay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll a change workflow until a gate reaches a terminal status (done/stuck)
 * or the attempt budget is exhausted. Single source of truth for
 * gate-completion polling shared by the gate-completion and archive
 * release-gate-completion paths (STRUCT-003).
 */
export async function waitForGateCompletion(
  handle: WorkflowHandleLike,
  gateId: GateId,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<GateCompletion | undefined> {
  const attempts = opts.attempts ?? GATE_COMPLETION_POLL_ATTEMPTS;
  const delayMs = opts.delayMs ?? GATE_COMPLETION_POLL_DELAY_MS;
  let latest: GateCompletion | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    latest = await querySignal<GateCompletion>(
      handle,
      getGateStatusQuery,
      gateId,
    );
    if (latest?.status === "done" || latest?.status === "stuck") {
      return latest;
    }
    await gatePollDelay(delayMs);
  }
  return latest;
}

type SignalTarget = WorkflowHandleLike | TemporalStoreBackendInput;

function isWorkflowHandleLike(
  target: SignalTarget,
): target is WorkflowHandleLike {
  return (
    typeof (target as WorkflowHandleLike).signal === "function" &&
    typeof (target as WorkflowHandleLike).query === "function"
  );
}

async function resolveChangeHandle(
  target: SignalTarget,
  changeId?: string,
): Promise<WorkflowHandleLike> {
  if (isWorkflowHandleLike(target)) return target;
  if (!changeId) {
    throw new Error("changeId is required when resolving a workflow handle");
  }
  return getGuardedChangeHandle(target, changeId);
}

/**
 * Fire-and-forget signal to a change workflow handle.
 * Wrapped with Temporal retry (transient failures are retried).
 */
export async function fireSignal<Args extends unknown[]>(
  handle: WorkflowHandleLike,
  signal: unknown,
  ...args: Args
): Promise<void>;
export async function fireSignal<Args extends unknown[]>(
  input: TemporalStoreBackendInput,
  changeId: string,
  signal: unknown,
  ...args: Args
): Promise<void>;
export async function fireSignal<Args extends unknown[]>(
  target: SignalTarget,
  signalOrChangeId: unknown,
  ...args: Args
): Promise<void> {
  const handle = await resolveChangeHandle(
    target,
    isWorkflowHandleLike(target) ? undefined : String(signalOrChangeId),
  );
  const signal = isWorkflowHandleLike(target) ? signalOrChangeId : args[0];
  const signalArgs = isWorkflowHandleLike(target) ? args : args.slice(1);
  await runTemporal(() => handle.signal(signal, ...signalArgs));
}

/**
 * Synchronous query against a change workflow handle.
 * Wrapped with a 5-second per-attempt timeout to avoid hanging on dead workers.
 */
export async function querySignal<T>(
  handle: WorkflowHandleLike,
  query: unknown,
  ...args: unknown[]
): Promise<T>;
export async function querySignal<T>(
  input: TemporalStoreBackendInput,
  changeId: string,
  query: unknown,
  ...args: unknown[]
): Promise<T>;
export async function querySignal<T>(
  target: SignalTarget,
  queryOrChangeId: unknown,
  ...args: unknown[]
): Promise<T> {
  const handle = await resolveChangeHandle(
    target,
    isWorkflowHandleLike(target) ? undefined : String(queryOrChangeId),
  );
  const query = isWorkflowHandleLike(target) ? queryOrChangeId : args[0];
  const queryArgs = isWorkflowHandleLike(target) ? args : args.slice(1);
  return runTemporalQuery(() =>
    handle.query(query, ...queryArgs),
  ) as Promise<T>;
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
): Promise<T>;
export async function fireSignalAndQuery<T, SArgs extends unknown[]>(
  input: TemporalStoreBackendInput,
  changeId: string,
  signal: unknown,
  signalArgs: SArgs,
  query: unknown,
  ...queryArgs: unknown[]
): Promise<T>;
export async function fireSignalAndQuery<T, SArgs extends unknown[]>(
  target: SignalTarget,
  signalOrChangeId: unknown,
  signalArgsOrSignal: unknown,
  queryOrSignalArgs: SArgs | unknown,
  ...queryAndArgs: unknown[]
): Promise<T> {
  if (isWorkflowHandleLike(target)) {
    const signal = signalOrChangeId;
    const signalArgs = signalArgsOrSignal as SArgs;
    const query = queryOrSignalArgs;
    await fireSignal(target, signal, ...signalArgs);
    return querySignal<T>(target, query, ...queryAndArgs);
  }

  const changeId = String(signalOrChangeId);
  const signal = signalArgsOrSignal;
  const signalArgs = queryOrSignalArgs as SArgs;
  const [query, ...queryArgs] = queryAndArgs;
  await fireSignal(target, changeId, signal, ...signalArgs);
  return querySignal<T>(target, changeId, query, ...queryArgs);
}

/**
 * Fire a signal targeting a change workflow, then refresh the in-memory cache
 * for that change.
 *
 * Tool-layer code SHALL use this helper for any signal associated with a
 * `changeId`. Use `fireSignal` (without refresh) ONLY for signals not associated
 * with a single change (none currently exist; documented exemptions require a
 * `// rq-cacheRefresh01-exempt: <reason>` annotation at the call site).
 *
 * Failure to refresh produces silent stale reads on subsequent
 * `store.changes.get()` calls — the bug class this helper exists to prevent.
 *
 * Cross-project note: when mutating a change in another project via
 * `target_path`, the refresh invalidates the TARGET project's cache (resolved
 * via the `store` argument that wraps that project's StoreBackend), NOT the
 * calling project's. Use `withTargetPathStore(...)` upstream to obtain the
 * correct store reference before calling this helper.
 *
 * Behavior:
 *   1. Fire signal via `fireSignal()` (preserves transient retry semantics).
 *   2. After signal succeeds, call `store.changes.refresh(changeId)` (drops
 *      cache entry and re-fetches).
 *   3. The store contract guarantees `refresh` is best-effort and does not
 *      throw in production; if it throws (contract violation), this helper
 *      propagates so the bug surfaces rather than being swallowed.
 *   4. If the signal fails, refresh is NOT attempted (the workflow state has
 *      not advanced).
 */
export async function fireSignalAndRefresh<Args extends unknown[]>(
  handle: WorkflowHandleLike,
  store: Store,
  changeId: string,
  signal: unknown,
  ...args: Args
): Promise<void>;
export async function fireSignalAndRefresh<Args extends unknown[]>(
  input: TemporalStoreBackendInput,
  store: Store,
  changeId: string,
  signal: unknown,
  ...args: Args
): Promise<void>;
export async function fireSignalAndRefresh<Args extends unknown[]>(
  target: SignalTarget,
  store: Store,
  changeId: string,
  signal: unknown,
  ...args: Args
): Promise<void> {
  if (isWorkflowHandleLike(target)) {
    await fireSignal(target, signal, ...args);
  } else {
    await fireSignal(target, changeId, signal, ...args);
  }
  await store.changes.refresh(changeId);
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

/**
 * Injectable dependencies for {@link isChangeReachable}.
 * All I/O is performed by the caller-supplied functions so the helper stays
 * pure and fully testable.
 */
export interface ReachabilityDeps {
  visibilityLister: (projectId: string, changeId: string) => Promise<boolean>;
  diskChecker: (changesDir: string, changeId: string) => Promise<boolean>;
  workflowStateGetter: (changeId: string) => Promise<boolean>;
}

// rq-activeChangePointer01
/**
 * Three-tier reachability check for a changeId.
 *
 * Order (short-circuiting):
 *   1. Worker-free Visibility lister.
 *   2. Disk fallback (change.json present on disk).
 *   3. Workflow-state fallback.
 *
 * A rejected tier is treated as a miss and falls through to the next tier.
 * The function is pure: all I/O is injected via `deps`.
 */
export async function isChangeReachable(
  projectId: string,
  changeId: string,
  deps: ReachabilityDeps,
  changesDir: string,
): Promise<boolean> {
  try {
    if (await deps.visibilityLister(projectId, changeId)) {
      return true;
    }
  } catch {
    // Visibility failed; fall through to disk check.
  }

  try {
    if (await deps.diskChecker(changesDir, changeId)) {
      return true;
    }
  } catch {
    // Disk check failed; fall through to workflow check.
  }

  try {
    if (await deps.workflowStateGetter(changeId)) {
      return true;
    }
  } catch {
    // Workflow check failed; treat as unreachable.
  }

  return false;
}
