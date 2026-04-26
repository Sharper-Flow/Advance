import type { Store } from "../store-types";
import type { Change } from "../../types";
import { createDefaultGates } from "../../types";
import { createLogger } from "../../utils/debug-log";
import { buildProjectWorkflowId } from "../../temporal/client";
import { classifyTemporalError } from "../../temporal/retry-wrapper";
import { listChangeDirs } from "../json";
import { buildChangeRecency } from "../store-types";
import type { ChangeStatus, ProjectStatus, Spec } from "../../types";
import { SpecSchema } from "../../types";
import { listSpecsActivity, showSpecActivity } from "../../temporal/activities";
import type { LoadResult } from "../json";
import { filterChanges } from "../content-search";
import { listChangeWorkflowIds } from "../../temporal/list-change-workflows";
import {
  ChangeSummaryMemo,
  asGateStatus,
  type ChangeSummary,
} from "../store-temporal-memo";
import {
  type TemporalStoreBackendInput,
  type TemporalHandleClient,
  type WorkflowHandleLike,
  type StoreDeps,
  mapTemporalChangeStateToChange,
  getChangeHandle,
  runTemporal,
  runTemporalQuery,
  hydrateMemoFromPSW,
} from "./shared";
import {
  applyChangeSummarySignal,
  changeStateQuery,
} from "../../temporal/messages";
import { ensureChangeWorkflowStarted } from "../../temporal/migration";
import type { ChangeWorkflowState } from "../../temporal/contracts";

import { createChangeOps } from "./changes";
import { createTaskOps } from "./tasks";
import { createGateOps } from "./gates";
import { createWisdomOps } from "./wisdom";

const logger = createLogger("store-temporal");

export function createTemporalStoreBackend(
  input: TemporalStoreBackendInput,
): Store {
  const { legacy } = input;

  // Shared state
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
      const state = (await runTemporalQuery(() =>
        getChangeHandle(input, changeId).query(changeStateQuery),
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
    getHandle: () => WorkflowHandleLike,
    result: unknown,
  ): Promise<ChangeWorkflowState> => {
    if (result && typeof result === "object" && "changeId" in result) {
      return result as ChangeWorkflowState;
    }
    return (await runTemporalQuery(() =>
      getHandle().query(changeStateQuery),
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
      const state = (await runTemporalQuery(() =>
        getChangeHandle(input, changeId).query(changeStateQuery),
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
      const state = (await runTemporalQuery(() =>
        getChangeHandle(input, changeId).query(changeStateQuery),
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

  // Assemble deps
  const deps: StoreDeps = {
    input,
    legacy,
    changeCache,
    changeOverlayCache,
    memo,
    sourceVersions,
    taskChangeIndex,
    buildSummary,
    setCachedChange,
    invalidateChange,
    updateOverlay,
    emitChangeSummarySignal,
    persistStateToDisk,
    dualWriteAfterMutation,
    getProjectHandle,
    getTemporalWorkflowClient,
    resolveStateOrQuery,
    indexTasksFromState,
    resolveChangeId,
    getTemporalChange,
    listResolvedChanges,
    reseedChangeFromDisk,
  };

  const store: Store = {
    ...legacy,
    specs: buildSpecsSurface(),
    changes: createChangeOps(deps),
    tasks: createTaskOps(deps),
    gates: createGateOps(deps),
    wisdom: createWisdomOps(deps),
    status: async () => buildTemporalStatus(),
  };

  hydrateMemoFromPSW(input, memo);
  return store;
}

// Re-export for any direct importers
export { StoreDeps } from "./shared";
export { createChangeOps } from "./changes";
export { createTaskOps } from "./tasks";
export { createGateOps } from "./gates";
export { createWisdomOps } from "./wisdom";
