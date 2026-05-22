import type { Change } from "../../types";
import type { ChangeWorkflowState } from "../../temporal/contracts";
import { buildChangeWorkflowId } from "../../temporal/client";
import {
  classifyTemporalError,
  collectErrorText,
  type TemporalErrorClass,
  withTemporalRetry,
} from "../../temporal/retry-wrapper";
import { recoveryReasonFromError } from "../../temporal/recovery-classification";
import { reinitStsl } from "../../temporal/service";
import { createLogger } from "../../utils/debug-log";
import type { ChangeSummaryMemo, ChangeSummary } from "../store-temporal-memo";
import type { Store } from "../store-types";
import type { TemporalClientBundle } from "../../temporal/client";

const logger = createLogger("store-temporal-shared");

const ownerGuardCache = new WeakMap<
  TemporalStoreBackendInput,
  Map<string, string>
>();

function getOwnerGuardCache(
  input: TemporalStoreBackendInput,
): Map<string, string> {
  let cache = ownerGuardCache.get(input);
  if (!cache) {
    cache = new Map<string, string>();
    ownerGuardCache.set(input, cache);
  }
  return cache;
}

export interface WorkflowHandleLike {
  query: (definition: unknown, ...args: unknown[]) => Promise<unknown>;
  describe?: () => Promise<unknown>;
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
    deltas: state.deltas,
    wisdom: state.wisdom,
    gates: state.gates,
    reentry_history: state.reentry_history,
    fast_follow_of: state.fast_follow_of,
    origin: state.origin,
    contract: state.contract,
    acceptanceCriteria: state.acceptanceCriteria,
    documents: state.documents,
    artifacts: state.artifacts,
    lastSignalAt: state.lastSignalAt,
    adv_project_id: state.projectId,
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
 * Typed error thrown when a change-scoped operation targets a change
 * owned by a different project than the current store binding.
 */
export class AdvProjectContextMismatchError extends Error {
  readonly name = "AdvProjectContextMismatch";
  constructor(
    readonly changeId: string,
    readonly owningProjectId: string,
    readonly currentProjectId: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Shared guard: before returning a Temporal workflow handle for a change,
 * verify the change's owner (via legacy disk snapshot) matches the
 * current store's project binding. Ownerless legacy changes are
 * best-effort compatible — the guard passes through silently.
 */
export async function getGuardedChangeHandle(
  input: TemporalStoreBackendInput,
  changeId: string,
): Promise<WorkflowHandleLike> {
  const cachedOwner = ownerGuardCache.get(input)?.get(changeId);
  if (cachedOwner === input.projectId) {
    return getChangeHandle(input, changeId);
  }

  let legacyResult: Awaited<ReturnType<typeof input.legacy.changes.get>>;
  try {
    legacyResult = await input.legacy.changes.get(changeId);
  } catch (err) {
    // Best-effort: legacy disk read failure (transient I/O, missing
    // file, permissions) MUST NOT cascade as a guard rejection. Pass
    // through to Temporal — the underlying error will surface from
    // the actual workflow call if it's persistent.
    logger.debug(
      `Owner guard skipped for change ${changeId}: legacy read failed (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
    return getChangeHandle(input, changeId);
  }
  if (legacyResult.success && legacyResult.data?.adv_project_id) {
    const owningProjectId = legacyResult.data.adv_project_id;
    if (owningProjectId !== input.projectId) {
      throw new AdvProjectContextMismatchError(
        changeId,
        owningProjectId,
        input.projectId,
        `Change '${changeId}' is owned by project '${owningProjectId}' (current: '${input.projectId}'). ` +
          `Open the change in its owning project's context, or verify the linked-project configuration.`,
      );
    }
    getOwnerGuardCache(input).set(changeId, owningProjectId);
  }
  return getChangeHandle(input, changeId);
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

export interface RunTemporalOptions {
  /** Per-operation type label for telemetry aggregation (KD-3). */
  opType?: string;
  /** Per-attempt timeout in milliseconds. Omit for long-running ops. */
  timeoutMs?: number;
}

export async function runTemporal<T>(
  op: () => Promise<T>,
  options?: RunTemporalOptions,
): Promise<T> {
  return withTemporalRetry(op, {
    opType: options?.opType,
    timeoutMs: options?.timeoutMs,
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

/**
 * Thin alias for query calls. Preserves backward compat with existing
 * shard callers. `runTemporal` is the single implementation entry point.
 */
export async function runTemporalQuery<T>(op: () => Promise<T>): Promise<T> {
  return runTemporal(op, { timeoutMs: QUERY_TIMEOUT_MS });
}

const GENERIC_QUERY_FAILURE_RE = /Failed to query Workflow|query Workflow/i;
const POISONED_WORKFLOW_EVIDENCE_RE =
  /WorkflowTaskFailedCauseNonDeterministicError|Nondeterminism|TMPRL1100|No command scheduled/i;

function stringifyEvidence(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function hasPoisonedWorkflowDescription(
  input: TemporalStoreBackendInput,
  changeId: string,
): Promise<boolean> {
  const handle = getChangeHandle(input, changeId);
  if (typeof handle.describe !== "function") return false;
  try {
    const description = await runTemporal(async () => handle.describe?.(), {
      timeoutMs: QUERY_TIMEOUT_MS,
    });
    return POISONED_WORKFLOW_EVIDENCE_RE.test(stringifyEvidence(description));
  } catch (error) {
    logger.debug(
      `Poisoned workflow describe probe failed for change ${changeId}: ${collectErrorText(error)}`,
    );
    return false;
  }
}

export interface TemporalReadFailureClassification {
  errorClass: TemporalErrorClass;
  recoveryReason?: "missing_workflow" | "poisoned_history";
}

export async function classifyTemporalReadFailure(
  input: TemporalStoreBackendInput,
  changeId: string,
  error: unknown,
): Promise<TemporalReadFailureClassification> {
  const errorClass = classifyTemporalError(error);
  if (errorClass === "fallback") {
    return {
      errorClass,
      recoveryReason: recoveryReasonFromError(error),
    };
  }

  if (
    errorClass === "fatal" &&
    GENERIC_QUERY_FAILURE_RE.test(collectErrorText(error)) &&
    (await hasPoisonedWorkflowDescription(input, changeId))
  ) {
    return { errorClass: "fallback", recoveryReason: "poisoned_history" };
  }

  return { errorClass };
}

export interface StoreDeps {
  input: TemporalStoreBackendInput;
  legacy: Store;

  // Shared state maps
  changeCache: Map<string, Change>;
  changeOverlayCache: Map<string, Partial<Change>>;
  memo: ChangeSummaryMemo;
  taskChangeIndex: Map<string, string>;

  // Shared helpers (closures over the maps above)
  buildSummary: (state: ChangeWorkflowState) => ChangeSummary;
  setCachedChange: (state: ChangeWorkflowState) => Change;
  invalidateChange: (changeId: string) => void;
  updateOverlay: (changeId: string, patch: Partial<Change>) => void;
  emitChangeSummarySignal: (
    changeId: string,
    state: ChangeWorkflowState,
  ) => void;
  persistStateToDisk: (changeId: string, state: ChangeWorkflowState) => void;
  dualWriteAfterMutation: (changeId: string) => Promise<void>;
  getTemporalWorkflowClient: () => {
    workflow: {
      start: (...args: unknown[]) => Promise<WorkflowHandleLike>;
      getHandle: (workflowId: string) => WorkflowHandleLike;
    };
  };
  resolveStateOrQuery: (
    getHandle: () => WorkflowHandleLike | Promise<WorkflowHandleLike>,
    result: unknown,
  ) => Promise<ChangeWorkflowState>;
  indexTasksFromState: (state: ChangeWorkflowState) => void;
  resolveChangeId: (taskId: string) => Promise<string | null>;
  getTemporalChange: (
    changeId: string,
  ) => Promise<ReturnType<Store["changes"]["get"]>>;
  listResolvedChanges: (filter?: {
    includeArchived?: boolean;
    includeClosed?: boolean;
  }) => Promise<Change[]>;
  reseedChangeFromDisk: (
    changeId: string,
    reason?: "missing_workflow" | "poisoned_history",
  ) => Promise<Change | null>;
}
