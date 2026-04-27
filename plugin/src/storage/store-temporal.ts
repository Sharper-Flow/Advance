import type {
  Change,
  ChangeClosure,
  GateId,
  Task,
  WisdomEntry,
  TddPhase,
  TddReclassification,
  WisdomType,
  BulkCloseResult,
} from "../types";
import { createDefaultGates } from "../types";
import { createLogger } from "../utils/debug-log";

const logger = createLogger("store-temporal");
import type { Store } from "./store-types";
import type { TemporalClientBundle } from "../temporal/client";
import {
  buildChangeWorkflowId,
  buildProjectWorkflowId,
} from "../temporal/client";
import {
  addChangeWisdomUpdate,
  addTaskUpdate,
  applyChangeSummarySignal,
  cancelTaskUpdate,
  changeStateQuery,
  changeTaskQuery,
  changeTaskRunQuery,
  changeTaskRunsQuery,
  changeTasksQuery,
  closeChangeUpdate,
  completeGateUpdate,
  projectStateQuery,
  recordTaskEvidenceUpdate,
  recordTaskRunEventUpdate,
  reclassifyTaskTddUpdate,
  reopenFromGateUpdate,
  setTaskPhaseUpdate,
  updateArtifactMetadataUpdate,
  updateTaskUpdate,
} from "../temporal/messages";
import type {
  ChangeWorkflowState,
  ProjectWorkflowState,
} from "../temporal/contracts";
import { ensureChangeWorkflowStarted } from "../temporal/migration";
import { getReadyTasksFromChangeState } from "../temporal/change-state";
import {
  classifyTemporalError,
  withTemporalRetry,
} from "../temporal/retry-wrapper";
import { reinitStsl } from "../temporal/service";
import { listChangeDirs, removeChangeDir } from "./json";
import { buildChangeRecency, computeLastActivity } from "./store-types";
import type { ChangeStatus, ProjectStatus, Spec } from "../types";
import { SpecSchema } from "../types";
import { listSpecsActivity, showSpecActivity } from "../temporal/activities";
import type { LoadResult } from "./json";
import { filterChanges } from "./content-search";
import { listChangeWorkflowIds } from "../temporal/list-change-workflows";
import {
  ChangeSummaryMemo,
  asGateStatus,
  type ChangeSummary,
} from "./store-temporal-memo";

interface WorkflowHandleLike {
  query: (definition: unknown, ...args: unknown[]) => Promise<unknown>;
  executeUpdate: (
    definition: unknown,
    options: { args?: unknown[] },
  ) => Promise<unknown>;
  signal: (definition: unknown, ...args: unknown[]) => Promise<void>;
}

interface TemporalHandleClient {
  workflow: {
    getHandle: (workflowId: string) => WorkflowHandleLike;
    start?: (...args: unknown[]) => Promise<WorkflowHandleLike>;
  };
}

interface TemporalStoreBackendInput {
  legacy: Store;
  temporal: { client: TemporalHandleClient } | TemporalClientBundle;
  projectId: string;
}

function mapTemporalChangeStateToChange(state: ChangeWorkflowState): Change {
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
    adv_project_id: state.projectId,
  };
}

function getChangeHandle(
  input: TemporalStoreBackendInput,
  changeId: string,
): WorkflowHandleLike {
  const workflowId = buildChangeWorkflowId(input.projectId, changeId);
  // Normalize both bundle shapes to the narrow WorkflowHandleLike surface
  // used by this adapter. The Temporal SDK's full WorkflowHandle is
  // structurally compatible — narrowing here keeps tests + fake handles
  // drop-in swappable without a double cast.
  const bundle = input.temporal as { client: TemporalHandleClient };
  return bundle.client.workflow.getHandle(workflowId);
}

/**
 * Typed error thrown when a change-scoped operation targets a change
 * owned by a different project than the current store binding.
 */
class AdvProjectContextMismatchError extends Error {
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
async function getGuardedChangeHandle(
  input: TemporalStoreBackendInput,
  changeId: string,
): Promise<WorkflowHandleLike> {
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
function makeReconnectingHook(): () => Promise<void> {
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

async function runTemporal<T>(op: () => Promise<T>): Promise<T> {
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

async function runTemporalQuery<T>(op: () => Promise<T>): Promise<T> {
  return withTemporalRetry(op, {
    timeoutMs: QUERY_TIMEOUT_MS,
    onTransientFailure: makeReconnectingHook(),
  });
}

export function createTemporalStoreBackend(
  input: TemporalStoreBackendInput,
): Store {
  const { legacy } = input;
  const changeCache = new Map<string, Change>();
  const changeOverlayCache = new Map<string, Partial<Change>>();
  const memo = new ChangeSummaryMemo();
  const sourceVersions = new Map<string, number>();

  // Reverse-lookup cache populated from any Temporal-observed tasks so
  // taskId-only methods can resolve the owning change without requiring the
  // legacy backend to have ever seen the task.
  const taskChangeIndex = new Map<string, string>();

  /**
   * Build a ChangeSummary from a full ChangeWorkflowState.
   * Used to populate the Memo whenever we do a direct query.
   */
  const buildSummary = (state: ChangeWorkflowState): ChangeSummary => {
    const tasks = state.tasks ?? [];
    return {
      id: state.changeId,
      title: state.title,
      status: state.status,
      gateProgress: {
        proposal: asGateStatus(state.gates?.proposal?.status),
        discovery: asGateStatus(state.gates?.discovery?.status),
        design: asGateStatus(state.gates?.design?.status),
        planning: asGateStatus(state.gates?.planning?.status),
        execution: asGateStatus(state.gates?.execution?.status),
        acceptance: asGateStatus(state.gates?.acceptance?.status),
        release: asGateStatus(state.gates?.release?.status),
      },
      taskCounts: {
        total: tasks.length,
        done: tasks.filter((t) => t.status === "done").length,
        pending: tasks.filter((t) => t.status === "pending").length,
      },
      lastActivityAt: state.createdAt,
      sourceVersion: 0, // Updated by PSW signals; 0 = direct-query sourced
    };
  };

  const setCachedChange = (state: ChangeWorkflowState): Change => {
    const overlay = changeOverlayCache.get(state.changeId);
    const mapped = {
      ...mapTemporalChangeStateToChange(state),
      ...(overlay ?? {}),
      tasks: state.tasks,
      wisdom: state.wisdom,
      gates: state.gates,
      reentry_history: state.reentry_history,
    };
    changeCache.set(state.changeId, mapped);
    memo.set(state.changeId, buildSummary(state));
    return mapped;
  };

  /**
   * Dual-write the latest workflow state to the disk snapshot
   * (`change.json`). Best-effort, fire-and-forget.
   *
   * Why this exists: Temporal Updates mutate workflow state but never
   * touch the disk file. If the workflow is terminated/evicted between
   * sessions, `reseedChangeFromDisk` rebuilds workflow state from the
   * disk snapshot — and any tasks/gates/wisdom updates persisted only
   * in Temporal are silently lost. Dual-writing keeps disk current so
   * reseeds preserve work.
   *
   * Failures are logged but never thrown — disk write is a durability
   * fallback, not a correctness gate. Temporal remains the source of
   * truth during the live session.
   */
  const persistStateToDisk = (
    changeId: string,
    state: ChangeWorkflowState,
  ): void => {
    void (async () => {
      try {
        const overlay = changeOverlayCache.get(changeId);
        const mapped: Change = {
          ...mapTemporalChangeStateToChange(state),
          ...(overlay ?? {}),
          tasks: state.tasks,
          wisdom: state.wisdom,
          gates: state.gates,
          reentry_history: state.reentry_history,
        };
        await legacy.changes.save(mapped);
      } catch (err) {
        logger.debug(
          `Disk dual-write skipped for change ${changeId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    })();
  };

  /**
   * Helper for task-level mutations that don't already fetch post-mutation
   * state. Queries the workflow once for the latest state, refreshes the
   * cache + memo + projectWorkflow signal, then dual-writes to disk.
   *
   * Best-effort: if the post-mutation query fails we skip the dual-write
   * rather than fail the original mutation. The workflow update has
   * already succeeded by the time we get here.
   */
  const dualWriteAfterMutation = async (changeId: string): Promise<void> => {
    try {
      const state = (await runTemporalQuery(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as ChangeWorkflowState;
      setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
      persistStateToDisk(changeId, state);
    } catch (err) {
      logger.debug(
        `Post-mutation state refresh failed for change ${changeId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  };

  const invalidateChange = (changeId: string): void => {
    changeCache.delete(changeId);
    memo.invalidate(changeId);
  };

  const updateOverlay = (changeId: string, patch: Partial<Change>): void => {
    const next = { ...(changeOverlayCache.get(changeId) ?? {}), ...patch };
    changeOverlayCache.set(changeId, next);
    const cached = changeCache.get(changeId);
    if (cached) {
      changeCache.set(changeId, { ...cached, ...patch });
    }
  };

  /**
   * Fire-and-forget signal to projectWorkflow with updated ChangeSummary.
   * Best-effort: logs errors but never throws. Skipped if no projectWorkflow
   * handle is available (e.g., STSL not initialized, PSW not started).
   */
  const emitChangeSummarySignal = (
    changeId: string,
    state: ChangeWorkflowState,
  ): void => {
    try {
      const version = (sourceVersions.get(changeId) ?? 0) + 1;
      sourceVersions.set(changeId, version);
      const summary = buildSummary(state);
      summary.sourceVersion = version;
      const projectHandle = getProjectHandle();
      if (!projectHandle) return;
      void projectHandle.signal(applyChangeSummarySignal, {
        changeId,
        summary,
        sourceVersion: version,
      });
    } catch (err) {
      // Best-effort: signal failure must not block mutations, but it should
      // remain observable when diagnosing stale project-workflow summaries.
      logger.debug(
        `ChangeSummary signal skipped for ${changeId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const getProjectHandle = (): WorkflowHandleLike | null => {
    try {
      const workflowId = buildProjectWorkflowId(input.projectId);
      const bundle = input.temporal as { client: TemporalHandleClient };
      return bundle.client.workflow.getHandle(workflowId);
    } catch {
      return null;
    }
  };

  const getTemporalWorkflowClient = (): {
    workflow: {
      start: (...args: unknown[]) => Promise<WorkflowHandleLike>;
      getHandle: (workflowId: string) => WorkflowHandleLike;
    };
  } => {
    const bundle = input.temporal as {
      client: {
        workflow: {
          start?: (...args: unknown[]) => Promise<WorkflowHandleLike>;
          getHandle: (workflowId: string) => WorkflowHandleLike;
        };
      };
    };
    if (typeof bundle.client.workflow.start !== "function") {
      throw new Error(
        "Temporal client bundle does not expose workflow.start; cannot create change workflows in Temporal-only mode",
      );
    }
    // Pass the full workflow object, NOT destructured methods.
    // @temporalio/client's WorkflowClient methods (start, getHandle, etc.)
    // rely on `this.getOrMakeInterceptors(...)` at call time. Destructuring
    // loses the prototype receiver and crashes with
    // "this.getOrMakeInterceptors is not a function". Forwarding the object
    // keeps `this` bound on method-invocation.
    return {
      workflow: bundle.client.workflow as {
        start: (...args: unknown[]) => Promise<WorkflowHandleLike>;
        getHandle: (workflowId: string) => WorkflowHandleLike;
      },
    };
  };

  /**
   * Extract projection from update result, falling back to a direct query
   * if the workflow returned void/null (older workflow versions).
   *
   * KD-7 (fresh-handle pattern): receives a `getHandle` thunk rather than
   * a pre-built handle so the fallback query inside `runTemporalQuery`
   * gets a fresh handle bound to the (possibly post-reconnect) client.
   */
  const resolveStateOrQuery = async (
    getHandle: () => WorkflowHandleLike | Promise<WorkflowHandleLike>,
    result: unknown,
  ): Promise<ChangeWorkflowState> => {
    if (result && typeof result === "object" && "changeId" in result) {
      return result as ChangeWorkflowState;
    }
    return (await runTemporalQuery(async () =>
      (await getHandle()).query(changeStateQuery),
    )) as ChangeWorkflowState;
  };

  const indexTasksFromState = (state: ChangeWorkflowState): void => {
    for (const task of state.tasks ?? []) {
      taskChangeIndex.set(task.id, state.changeId);
    }
  };

  const resolveChangeId = async (taskId: string): Promise<string | null> => {
    const cached = taskChangeIndex.get(taskId);
    if (cached) return cached;
    const shown = await legacy.tasks.show(taskId);
    if (shown) {
      taskChangeIndex.set(taskId, shown.changeId);
      return shown.changeId;
    }
    return null;
  };

  /**
   * Attempt to re-seed a missing change workflow from the disk snapshot.
   * Used by `getTemporalChange` / `changes.get` when the Temporal query
   * returns `WorkflowNotFoundError` (workflow terminated / evicted / never
   * started) but a `change.json` snapshot still exists on disk.
   *
   * On success, the fresh ChangeWorkflow state is returned and cached so
   * callers see the change instead of a hard error.
   * On failure (no snapshot, re-seed itself throws), returns `null`.
   */
  const reseedChangeFromDisk = async (
    changeId: string,
  ): Promise<Change | null> => {
    const legacyRead = await legacy.changes.get(changeId);
    if (!legacyRead.success || !legacyRead.data) return null;
    const change = legacyRead.data;
    try {
      const client = {
        workflow: input.temporal.client.workflow as {
          start: (...args: unknown[]) => Promise<WorkflowHandleLike>;
          getHandle: (workflowId: string) => WorkflowHandleLike;
        },
      };
      // Defensively fill in fields that the workflow seed schema requires
      // but an older / partial change.json may have omitted. Change
      // snapshots on disk can be minimal (draft state, no gates/tasks
      // yet); the workflow state machine still expects well-formed
      // collections, so supply empty defaults rather than undefined.
      await ensureChangeWorkflowStarted(client, {
        projectId: input.projectId,
        changeId: change.id,
        title: change.title,
        initializedAt: change.created_at,
        seedState: {
          status: change.status,
          tasks: change.tasks ?? [],
          wisdom: change.wisdom ?? [],
          gates: change.gates ?? createDefaultGates(),
          reentry_history: change.reentry_history ?? [],
        },
      });
    } catch (err) {
      // Re-seed itself failed — surface the original not-found to callers
      // rather than masking it with a seed error. Log so operators can
      // distinguish "orphan could not be recovered" from "orphan does
      // not exist on disk" without having to instrument locally.
      logger.warn(
        `Temporal re-seed failed for change ${changeId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
    try {
      const state = (await runTemporalQuery(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as ChangeWorkflowState;
      indexTasksFromState(state);
      return setCachedChange(state);
    } catch (err) {
      logger.warn(
        `Temporal re-seed succeeded but post-reseed query failed for change ${changeId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  };

  const getTemporalChange = async (
    changeId: string,
  ): Promise<ReturnType<Store["changes"]["get"]>> => {
    const cached = changeCache.get(changeId);
    if (cached) {
      return { success: true, data: cached };
    }
    try {
      const state = (await runTemporalQuery(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as ChangeWorkflowState;
      indexTasksFromState(state);
      return { success: true, data: setCachedChange(state) };
    } catch (error) {
      // P1.5 — orphan-tolerant changes.get with re-seed. When the
      // workflow is missing but a disk snapshot exists, seed a fresh
      // ChangeWorkflow from disk and return the hydrated state. This
      // prevents a single orphan from blocking adv_status /
      // adv_change_list / adv_change_show.
      if (classifyTemporalError(error) === "fallback") {
        const reseeded = await reseedChangeFromDisk(changeId);
        if (reseeded) {
          return { success: true, data: reseeded };
        }
      }
      throw error;
    }
  };

  /**
   * List all resolved changes. Uses the Memo for summary surfaces
   * (status, changes.list). Falls back to direct O(N) query only when
   * the Memo is empty (cold start) or individual entries are missing.
   */
  /**
   * Resolve all change records currently visible to this project.
   *
   * Two design constraints, learned the hard way:
   *
   * 1. Visibility-API status filter must match caller intent. The
   *    visibility query defaults to draft/pending/active only (P2.4).
   *    When the caller passes `includeArchived` or `includeClosed`, we
   *    drop the status filter entirely (`statuses: null`) so archived
   *    and closed workflows are returned by the visibility query. The
   *    post-filter at the call sites then narrows them back if needed.
   *    Without this, the post-filter operates on an already-narrowed set
   *    and `includeClosed: true` silently returns nothing.
   *
   * 2. Disk is the durable source of truth, visibility is a cache.
   *    A workflow registration can be lost (worker eviction, history
   *    truncation, manual termination) while its `change.json` snapshot
   *    survives on disk. We always union with a disk scan so orphaned-
   *    but-on-disk changes still surface. The per-change loader
   *    (`getTemporalChange`) already re-seeds missing workflows from
   *    disk, so listing them triggers self-healing.
   *
   * The Memo cache supplies the fast path for active changes that the
   * adapter has already touched. We seed result IDs from Memo too so
   * recently-closed entries (which `close()` repopulates into Memo
   * post-invalidate) still surface even when the caller's bundle has
   * no `workflow.list` capability.
   */
  const listResolvedChanges = async (filter?: {
    includeArchived?: boolean;
    includeClosed?: boolean;
  }): Promise<Change[]> => {
    const wantsTerminalStatuses = Boolean(
      filter?.includeArchived || filter?.includeClosed,
    );

    // Fast path: when no terminal statuses are requested AND Memo has
    // data, return Memo summaries directly (no per-change query). Mirrors
    // the original P2.4 fast path — preserved for active-change list perf.
    const memoAll = memo.getAll();
    if (memoAll.length > 0 && !wantsTerminalStatuses) {
      return memoAll.map(
        (summary): Change => ({
          id: summary.id,
          title: summary.title,
          status: summary.status,
          created_at: summary.lastActivityAt,
          tasks: [],
          deltas: {},
          wisdom: [],
          gates: Object.fromEntries(
            Object.entries(summary.gateProgress).map(([gate, status]) => [
              gate,
              { status: status as "pending" | "done" | "skipped" | "legacy" },
            ]),
          ) as Change["gates"],
        }),
      );
    }

    // Slow path: union three sources to find every change ID.
    //
    // (1) Memo — picks up changes the adapter has touched (e.g.
    //     recently-closed entries that close() repopulated). Survives
    //     when the bundle has no workflow.list capability.
    //
    // (2) Visibility API — canonical "which workflows exist right now"
    //     when the bundle exposes workflow.list. We pass statuses=null
    //     when caller wants archived/closed so the visibility query
    //     doesn't pre-narrow the result set.
    //
    // (3) Disk — durable source of truth. Catches changes whose workflow
    //     was evicted but whose change.json snapshot survives on disk
    //     (P1.5 orphan case, P2.4 follow-up bug B).
    //
    // Per-change load is wrapped in try/catch so one missing/terminated
    // workflow doesn't abort the batch; falls back to legacy disk read.
    const memoIds = memoAll.map((s) => s.id);

    const bundle = input.temporal as {
      client?: { workflow?: { list?: unknown } };
    };
    let visibilityIds: string[] = [];
    if (typeof bundle.client?.workflow?.list === "function") {
      try {
        visibilityIds = await listChangeWorkflowIds(
          bundle.client as Parameters<typeof listChangeWorkflowIds>[0],
          {
            projectId: input.projectId,
            // Drop the status filter when caller wants archived/closed
            // so the visibility query doesn't pre-narrow the result set.
            statuses: wantsTerminalStatuses ? null : undefined,
          },
        );
      } catch (err) {
        logger.warn(
          `[P2.4] Visibility list failed; falling back to legacy disk scan: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    let diskIds: string[] = [];
    try {
      diskIds = await listChangeDirs(legacy.paths.changes);
    } catch (err) {
      logger.warn(
        `Disk listChangeDirs failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const changeIds = Array.from(
      new Set([...memoIds, ...visibilityIds, ...diskIds]),
    );

    const BATCH_SIZE = 20;
    const changes: Change[] = [];

    for (let i = 0; i < changeIds.length; i += BATCH_SIZE) {
      const batch = changeIds.slice(i, i + BATCH_SIZE);
      const loaded = await Promise.all(
        batch.map(async (changeId) => {
          try {
            return await getTemporalChange(changeId);
          } catch {
            // Workflow may not exist (pre-Temporal, terminated, or evicted).
            // Fall back to legacy JSON store.
            try {
              return await legacy.changes.get(changeId);
            } catch {
              return { success: false } as const;
            }
          }
        }),
      );
      for (const result of loaded) {
        if (result.success && result.data) {
          changes.push(result.data);
        }
      }
    }
    return changes;
  };

  const buildTemporalStatus = async (): Promise<ProjectStatus> => {
    // P2.2: status no longer routes through legacy.status(). Specs come
    // from listSpecsActivity (disk read), changes come from Temporal-derived
    // listResolvedChanges, recommendations are an empty array (the doctor-
    // prefixed recs were generated by corruption-recovery.ts which is
    // deleted in P2.7 — no longer relevant in Temporal-only mode).
    const specsResult = await listSpecsActivity({
      specsDir: legacy.paths.specs,
    });
    const specCapabilities = specsResult.ok ? specsResult.specs : [];

    const changes = await listResolvedChanges();
    const now = new Date();
    const byStatus: Record<ChangeStatus, number> = {
      draft: 0,
      pending: 0,
      active: 0,
      archived: 0,
      closed: 0,
    };

    for (const change of changes) {
      byStatus[change.status]++;
    }

    const recent = changes
      .filter(
        (change) => change.status !== "archived" && change.status !== "closed",
      )
      .map((change) =>
        buildChangeRecency(
          change,
          {
            total: change.tasks.length,
            done: change.tasks.filter((task) => task.status === "done").length,
          },
          now,
        ),
      )
      .sort((a, b) => {
        const cmp = b.lastActivityAt.localeCompare(a.lastActivityAt);
        return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
      });

    return {
      specs: {
        count: specCapabilities.length,
        capabilities: specCapabilities,
      },
      changes: {
        active: recent.length,
        byStatus,
        recent,
      },
      recommendations: [],
    };
  };

  // P2.2: activity-backed specs surface. Reads disk via listSpecsActivity
  // and showSpecActivity instead of routing through legacy.specs.* (which
  // hit SQLite FTS). search/save still delegate to legacy until the spec
  // FTS replacement (P2.3) and write path (future task) land.
  const buildSpecsSurface = (): Store["specs"] => ({
    list: async (filter) => {
      const listing = await listSpecsActivity({
        specsDir: legacy.paths.specs,
      });
      if (!listing.ok) {
        return { specs: [] };
      }
      let names = listing.specs;
      if (filter?.capability) {
        names = names.filter((n) => n === filter.capability);
      }
      const out: Array<{
        name: string;
        title: string;
        version: string;
        requirementCount: number;
      }> = [];
      for (const name of names) {
        const spec = await loadSpecViaActivity(name);
        if (!spec.success || !spec.data) continue;
        if (filter?.tag) {
          const tags = (spec.data.tags ?? []) as string[];
          if (!tags.includes(filter.tag)) continue;
        }
        out.push({
          name: spec.data.name,
          title: spec.data.title ?? spec.data.name,
          version:
            typeof spec.data.version === "string"
              ? spec.data.version
              : String(spec.data.version ?? "1"),
          requirementCount: (spec.data.requirements ?? []).length,
        });
      }
      return { specs: out };
    },
    get: async (capability) => loadSpecViaActivity(capability),
    search: legacy.specs.search,
    save: legacy.specs.save,
  });

  /**
   * Helper: load a single spec via showSpecActivity + Zod validation.
   * Mirrors `loadSpec`'s LoadResult contract so it slots into Store.specs.get
   * without callers noticing the underlying source change.
   */
  const loadSpecViaActivity = async (
    capability: string,
  ): Promise<LoadResult<Spec | null>> => {
    const result = await showSpecActivity({
      specsDir: legacy.paths.specs,
      capability,
    });
    if (!result.ok) {
      // Treat any ENOENT-style miss as "not found, not an error" — matches
      // the loadSpec contract used by callers downstream.
      if (/not found|ENOENT/i.test(result.error)) {
        return { success: true, data: null };
      }
      return {
        success: false,
        error: result.error,
        type: "read_error",
      };
    }
    try {
      const parsed = SpecSchema.parse(JSON.parse(result.content));
      return { success: true, data: parsed };
    } catch (err) {
      return {
        success: false,
        error: `Failed to parse spec ${capability}: ${err instanceof Error ? err.message : String(err)}`,
        type: "schema_error",
      };
    }
  };

  const store: Store = {
    ...legacy,
    specs: buildSpecsSurface(),
    changes: {
      create: async (
        summary,
        capability,
        proposalContent,
        problemStatementContent,
        agreementContent,
        designContent,
      ) => {
        const result = await legacy.changes.create(
          summary,
          capability,
          proposalContent,
          problemStatementContent,
          agreementContent,
          designContent,
        );
        const created = await legacy.changes.get(result.changeId);
        if (!created.success || !created.data) {
          throw new Error(
            `Created change ${result.changeId} but could not reload scaffolded change state`,
          );
        }

        // P1.4 transactional guard: if Temporal workflow start fails,
        // the disk scaffold (proposal.md, change.json, etc.) would
        // otherwise persist as an orphan that confuses subsequent tool
        // calls. Remove the change dir on failure and re-throw the
        // ORIGINAL error — never mask it with rollback errors.
        //
        // See design.md § KD-7.
        try {
          const client = getTemporalWorkflowClient();
          await ensureChangeWorkflowStarted(client, {
            projectId: input.projectId,
            changeId: created.data.id,
            title: created.data.title,
            initializedAt: created.data.created_at,
            seedState: {
              status: created.data.status,
              tasks: created.data.tasks,
              wisdom: created.data.wisdom,
              gates: created.data.gates,
              reentry_history: created.data.reentry_history,
            },
          });
        } catch (err) {
          try {
            await removeChangeDir(legacy.paths.changes, created.data.id);
          } catch (rollbackErr) {
            // Rollback itself failed (disk unmounted, permissions, etc).
            // Log but don't mask the original Temporal error.
            logger.error(
              `P1.4 rollback failed for change '${created.data.id}' after Temporal-start error: ${
                rollbackErr instanceof Error
                  ? rollbackErr.message
                  : String(rollbackErr)
              }. Manual cleanup of the change directory may be required.`,
            );
          }
          throw err;
        }

        const changeWithOwner: Change = {
          ...created.data,
          adv_project_id: input.projectId,
        };
        try {
          await legacy.changes.save(changeWithOwner);
        } catch (saveErr) {
          logger.debug(
            `Disk save of adv_project_id skipped for change ${changeWithOwner.id}: ${
              saveErr instanceof Error ? saveErr.message : String(saveErr)
            }`,
          );
        }

        updateOverlay(created.data.id, {
          created_at: created.data.created_at,
          created_by: created.data.created_by,
          deltas: created.data.deltas,
          validation: created.data.validation,
          github_issues: created.data.github_issues,
          clarify_findings: created.data.clarify_findings,
          judgment_calls: created.data.judgment_calls,
          batch_surfaced_at: created.data.batch_surfaced_at,
          cross_project_origin: created.data.cross_project_origin,
          adv_project_id: input.projectId,
        });
        return result;
      },
      save: async (change) => {
        await legacy.changes.save(change);
        updateOverlay(change.id, {
          title: change.title,
          status: change.status,
          created_at: change.created_at,
          created_by: change.created_by,
          deltas: change.deltas,
          validation: change.validation,
          github_issues: change.github_issues,
          closure: change.closure,
          clarify_findings: change.clarify_findings,
          reentry_history: change.reentry_history,
          judgment_calls: change.judgment_calls,
          batch_surfaced_at: change.batch_surfaced_at,
          cross_project_origin: change.cross_project_origin,
          adv_project_id: change.adv_project_id,
        });
      },
      list: async (filter) => {
        // When status is explicitly "archived"/"closed", auto-enable the
        // corresponding include flag so the status filter isn't immediately
        // undone by the exclusion below.
        const effectiveIncludeArchived =
          filter?.includeArchived || filter?.status === "archived";
        const effectiveIncludeClosed =
          filter?.includeClosed || filter?.status === "closed";

        // Pass include flags into the resolver so the visibility query
        // widens its status filter to include archived/closed workflows
        // when the caller asked for them. Without this the post-filter
        // below operates on a pre-narrowed set and surfaces nothing.
        const changes = await listResolvedChanges({
          includeArchived: effectiveIncludeArchived,
          includeClosed: effectiveIncludeClosed,
        });
        let filtered = changes;

        if (filter?.status) {
          filtered = filtered.filter(
            (change) => change.status === filter.status,
          );
        }
        if (!effectiveIncludeArchived) {
          filtered = filtered.filter((change) => change.status !== "archived");
        }
        if (!effectiveIncludeClosed) {
          filtered = filtered.filter((change) => change.status !== "closed");
        }

        // P2.3: substring/prefix/timestamp filters via linear-scan
        // content-search helper. See `content-search.ts` and
        // `scripts/bench-content-search.ts` for the bench data backing
        // this strategy choice over MiniSearch.
        if (
          filter?.prefix ||
          filter?.titleContains ||
          filter?.createdBefore ||
          filter?.lastActivityBefore
        ) {
          const enriched = filtered.map((c) => ({
            ...c,
            lastActivityAt: computeLastActivity(c),
          }));
          filtered = filterChanges(enriched, {
            prefix: filter.prefix,
            titleContains: filter.titleContains,
            createdBefore: filter.createdBefore,
            lastActivityBefore: filter.lastActivityBefore,
          });
        }

        filtered.sort((a, b) => {
          const cmp = b.created_at.localeCompare(a.created_at);
          return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
        });

        return {
          changes: filtered.map((change) => ({
            id: change.id,
            title: change.title,
            status: change.status,
            taskCount: change.tasks.length,
            completedTasks: change.tasks.filter(
              (task) => task.status === "done",
            ).length,
          })),
        };
      },
      get: async (changeId: string) => {
        // Delegates to the shared orphan-tolerant path so adv_status,
        // adv_change_show, and adv_change_list all behave the same when
        // a workflow is missing: try to re-seed from disk, otherwise
        // return the not-found error.
        return getTemporalChange(changeId);
      },
      close: async (changeId: string, closure: ChangeClosure) => {
        invalidateChange(changeId);
        const raw = await runTemporal(async () =>
          (await getGuardedChangeHandle(input, changeId)).executeUpdate(
            closeChangeUpdate,
            {
              args: [closure],
            },
          ),
        );
        const result = await resolveStateOrQuery(
          async () => await getGuardedChangeHandle(input, changeId),
          raw,
        );
        indexTasksFromState(result);
        updateOverlay(changeId, { status: "closed", closure });
        const change = setCachedChange(result);
        emitChangeSummarySignal(changeId, result);
        return change;
      },

      closeBatch: async (
        changeIds: string[],
        closure: ChangeClosure,
      ): Promise<BulkCloseResult> => {
        // Pre-validate: fail-all if any target is invalid or protected
        for (const id of changeIds) {
          const change = await getTemporalChange(id);
          if (!change.success || !change.data) {
            return {
              success: false,
              closed: 0,
              results: changeIds.map((cid) => ({
                changeId: cid,
                success: false,
                error:
                  cid === id
                    ? change.success === false
                      ? change.error
                      : "Change not found"
                    : "Aborted due to sibling failure",
              })),
              message: `Bulk close aborted: Change "${id}" not found.`,
            };
          }
          if (
            change.data.status !== "draft" &&
            change.data.status !== "pending"
          ) {
            return {
              success: false,
              closed: 0,
              results: changeIds.map((cid) => ({
                changeId: cid,
                success: false,
                error:
                  cid === id
                    ? `Protected status "${change.data!.status}"`
                    : "Aborted due to sibling failure",
              })),
              message: `Bulk close aborted: Change "${id}" has protected status "${change.data.status}". Only draft or pending changes can be bulk-closed.`,
            };
          }
        }

        const results: {
          changeId: string;
          success: boolean;
          error?: string;
        }[] = [];
        let closed = 0;

        for (const id of changeIds) {
          try {
            invalidateChange(id);
            const raw = await runTemporal(async () =>
              (await getGuardedChangeHandle(input, id)).executeUpdate(
                closeChangeUpdate,
                {
                  args: [closure],
                },
              ),
            );
            const result = await resolveStateOrQuery(
              async () => await getGuardedChangeHandle(input, id),
              raw,
            );
            indexTasksFromState(result);
            updateOverlay(id, { status: "closed", closure });
            setCachedChange(result);
            emitChangeSummarySignal(id, result);
            results.push({ changeId: id, success: true });
            closed++;
          } catch (err) {
            results.push({
              changeId: id,
              success: false,
              error: String(err),
            });
          }
        }

        const allSuccess = closed === changeIds.length;
        return {
          success: allSuccess,
          closed,
          results,
          message: allSuccess
            ? `Successfully closed ${closed} change(s).`
            : `Closed ${closed} of ${changeIds.length} change(s). See results for details.`,
        };
      },
      updateArtifacts: async (
        changeId,
        proposalContent,
        problemStatementContent,
        agreementContent,
        designContent,
      ) => {
        const result = await legacy.changes.updateArtifacts(
          changeId,
          proposalContent,
          problemStatementContent,
          agreementContent,
          designContent,
        );
        if (!result.success) {
          return result;
        }
        const updates: Array<
          [
            "proposal" | "problemStatement" | "agreement" | "design",
            string | undefined,
          ]
        > = [
          ["proposal", result.proposalPath],
          ["problemStatement", result.problemStatementPath],
          ["agreement", result.agreementPath],
          ["design", result.designPath],
        ];
        for (const [kind, path] of updates) {
          if (!path) continue;
          await runTemporal(async () =>
            (await getGuardedChangeHandle(input, changeId)).executeUpdate(
              updateArtifactMetadataUpdate,
              {
                args: [kind, { path, updatedAt: new Date().toISOString() }],
              },
            ),
          );
        }
        return result;
      },
    },
    tasks: {
      ...legacy.tasks,
      list: async (changeId: string, status?: string, filter?: string) => {
        const tasks = (await runTemporalQuery(async () =>
          (await getGuardedChangeHandle(input, changeId)).query(
            changeTasksQuery,
            status,
            filter,
          ),
        )) as Awaited<ReturnType<Store["tasks"]["list"]>>;
        for (const task of tasks ?? []) {
          taskChangeIndex.set(task.id, changeId);
        }
        return tasks;
      },
      ready: async (changeId: string) => {
        const state = (await runTemporalQuery(async () =>
          (await getGuardedChangeHandle(input, changeId)).query(
            changeStateQuery,
          ),
        )) as ChangeWorkflowState;
        indexTasksFromState(state);
        return getReadyTasksFromChangeState(state);
      },
      update: async (
        taskId,
        status,
        notes,
        implementationSummary,
        errorRecovery,
      ) => {
        const changeId = await resolveChangeId(taskId);
        if (!changeId) return null;
        invalidateChange(changeId);
        const result = (await runTemporal(async () =>
          (await getGuardedChangeHandle(input, changeId)).executeUpdate(
            updateTaskUpdate,
            {
              args: [
                taskId,
                {
                  status: status as Task["status"],
                  notes,
                  implementationSummary,
                  errorRecovery,
                },
              ],
            },
          ),
        )) as Awaited<ReturnType<Store["tasks"]["update"]>>;
        await dualWriteAfterMutation(changeId);
        return result;
      },
      add: async (changeId, content, options) => {
        invalidateChange(changeId);
        const created = (await runTemporal(async () =>
          (await getGuardedChangeHandle(input, changeId)).executeUpdate(
            addTaskUpdate,
            {
              args: [
                {
                  title: content,
                  type: options?.type,
                  section: options?.section,
                  blockedBy: options?.blockedBy,
                  metadata: options?.metadata,
                },
              ],
            },
          ),
        )) as Awaited<ReturnType<Store["tasks"]["add"]>>;
        if (created && typeof created === "object" && "id" in created) {
          taskChangeIndex.set((created as { id: string }).id, changeId);
        }
        await dualWriteAfterMutation(changeId);
        return created;
      },
      get: async (taskId) => {
        const changeId = await resolveChangeId(taskId);
        if (!changeId) return null;
        return (await runTemporalQuery(async () =>
          (await getGuardedChangeHandle(input, changeId)).query(
            changeTaskQuery,
            taskId,
          ),
        )) as Awaited<ReturnType<Store["tasks"]["get"]>>;
      },
      show: async (taskId) => {
        const changeId = await resolveChangeId(taskId);
        if (!changeId) return null;
        const task = await runTemporalQuery(async () =>
          (await getGuardedChangeHandle(input, changeId)).query(
            changeTaskQuery,
            taskId,
          ),
        );
        if (!task) return null;
        return { task: task as Task, changeId };
      },
      getRun: async (taskId) => {
        const changeId = await resolveChangeId(taskId);
        if (!changeId) return null;
        return (await runTemporalQuery(async () =>
          (await getGuardedChangeHandle(input, changeId)).query(
            changeTaskRunQuery,
            taskId,
          ),
        )) as Awaited<ReturnType<Store["tasks"]["getRun"]>>;
      },
      listRuns: async (changeId) => {
        return (await runTemporalQuery(async () =>
          (await getGuardedChangeHandle(input, changeId)).query(
            changeTaskRunsQuery,
          ),
        )) as Awaited<ReturnType<Store["tasks"]["listRuns"]>>;
      },
      recordRunEvent: async (taskId, event) => {
        const changeId = await resolveChangeId(taskId);
        if (!changeId) return null;
        invalidateChange(changeId);
        const result = (await runTemporal(async () =>
          (await getGuardedChangeHandle(input, changeId)).executeUpdate(
            recordTaskRunEventUpdate,
            {
              args: [taskId, event],
            },
          ),
        )) as Awaited<ReturnType<Store["tasks"]["recordRunEvent"]>>;
        await dualWriteAfterMutation(changeId);
        return result;
      },
      recordEvidence: async (taskId, phase, evidence) => {
        const changeId = await resolveChangeId(taskId);
        if (!changeId) return null;
        invalidateChange(changeId);
        const result = (await runTemporal(async () =>
          (await getGuardedChangeHandle(input, changeId)).executeUpdate(
            recordTaskEvidenceUpdate,
            {
              args: [taskId, phase, evidence],
            },
          ),
        )) as Awaited<ReturnType<Store["tasks"]["recordEvidence"]>>;
        await dualWriteAfterMutation(changeId);
        return result;
      },
      setPhase: async (taskId, phase: TddPhase) => {
        const changeId = await resolveChangeId(taskId);
        if (!changeId) return null;
        invalidateChange(changeId);
        const result = (await runTemporal(async () =>
          (await getGuardedChangeHandle(input, changeId)).executeUpdate(
            setTaskPhaseUpdate,
            {
              args: [taskId, phase],
            },
          ),
        )) as Awaited<ReturnType<Store["tasks"]["setPhase"]>>;
        await dualWriteAfterMutation(changeId);
        return result;
      },
      cancel: async (taskId, cancellation) => {
        const changeId = await resolveChangeId(taskId);
        if (!changeId) return null;
        invalidateChange(changeId);
        const result = (await runTemporal(async () =>
          (await getGuardedChangeHandle(input, changeId)).executeUpdate(
            cancelTaskUpdate,
            {
              args: [taskId, cancellation],
            },
          ),
        )) as Awaited<ReturnType<Store["tasks"]["cancel"]>>;
        await dualWriteAfterMutation(changeId);
        return result;
      },
      reclassifyTdd: async (taskId, reclassification: TddReclassification) => {
        const changeId = await resolveChangeId(taskId);
        if (!changeId) return null;
        invalidateChange(changeId);
        const result = (await runTemporal(async () =>
          (await getGuardedChangeHandle(input, changeId)).executeUpdate(
            reclassifyTaskTddUpdate,
            {
              args: [taskId, reclassification],
            },
          ),
        )) as Awaited<ReturnType<Store["tasks"]["reclassifyTdd"]>>;
        await dualWriteAfterMutation(changeId);
        return result;
      },
    },
    wisdom: {
      ...legacy.wisdom,
      add: async (changeId, type: WisdomType, content, sourceTask) => {
        invalidateChange(changeId);
        const raw = await runTemporal(async () =>
          (await getGuardedChangeHandle(input, changeId)).executeUpdate(
            addChangeWisdomUpdate,
            {
              args: [type, content, sourceTask],
            },
          ),
        );
        const state = await resolveStateOrQuery(
          async () => await getGuardedChangeHandle(input, changeId),
          raw,
        );
        setCachedChange(state);
        emitChangeSummarySignal(changeId, state);
        persistStateToDisk(changeId, state);
        const latest = state.wisdom[state.wisdom.length - 1] as
          | WisdomEntry
          | undefined;
        if (!latest) {
          throw new Error(
            `Temporal wisdom update for change ${changeId} completed without returning an appended wisdom entry`,
          );
        }
        return latest;
      },
      list: async (changeId: string) => {
        const state = (await runTemporalQuery(async () =>
          (await getGuardedChangeHandle(input, changeId)).query(
            changeStateQuery,
          ),
        )) as ChangeWorkflowState;
        return state.wisdom;
      },
    },
    gates: {
      ...legacy.gates,
      get: async (changeId: string) => {
        const state = (await runTemporalQuery(async () =>
          (await getGuardedChangeHandle(input, changeId)).query(
            changeStateQuery,
          ),
        )) as ChangeWorkflowState;
        return state.gates;
      },
      complete: async (changeId: string, gateId: GateId, notes?: string) => {
        invalidateChange(changeId);
        const raw = await runTemporal(async () =>
          (await getGuardedChangeHandle(input, changeId)).executeUpdate(
            completeGateUpdate,
            {
              args: [gateId, notes, "agent"],
            },
          ),
        );
        const state = await resolveStateOrQuery(
          async () => await getGuardedChangeHandle(input, changeId),
          raw,
        );
        setCachedChange(state);
        emitChangeSummarySignal(changeId, state);
        persistStateToDisk(changeId, state);
      },
      reopenFrom: async (
        changeId,
        fromGate,
        reason,
        scopeDelta,
        reopenedBy,
        approvalEvidence,
      ) => {
        invalidateChange(changeId);
        const raw = await runTemporal(async () =>
          (await getGuardedChangeHandle(input, changeId)).executeUpdate(
            reopenFromGateUpdate,
            {
              args: [
                fromGate,
                reason,
                scopeDelta,
                approvalEvidence ?? reopenedBy,
              ],
            },
          ),
        );
        const state = await resolveStateOrQuery(
          async () => await getGuardedChangeHandle(input, changeId),
          raw,
        );
        setCachedChange(state);
        emitChangeSummarySignal(changeId, state);
        persistStateToDisk(changeId, state);
      },
    },
    status: async () => {
      return buildTemporalStatus();
    },
  };

  // Fire-and-forget PSW hydration: warm-start the Memo from projectWorkflow
  // state so first status/list calls hit Memo instead of O(N) fan-out.
  hydrateMemoFromPSW(input, memo);

  return store;
}

/**
 * Background hydration: query projectWorkflow.state and bulk-load
 * change_summaries into the Memo. Best-effort — failures are logged but
 * never block store creation.
 */
function hydrateMemoFromPSW(
  input: TemporalStoreBackendInput,
  memo: ChangeSummaryMemo,
): void {
  void (async () => {
    try {
      const pswState = (await runTemporalQuery(async () => {
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

function getProjectHandleForInput(
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
