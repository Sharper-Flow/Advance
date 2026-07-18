import type { Store } from "../store-types";
import type { Change } from "../../types";
import { createLogger } from "../../utils/debug-log";
import { hasArchiveBundle, listChangeDirs, loadChange } from "../json";
import { buildChangeRecency } from "../store-types";
import type {
  ChangeStatus,
  EpicMembership,
  ProjectStatus,
  Spec,
  TerminalSource,
  TerminalWarning,
  TerminalWarningCode,
  HydrationStats,
} from "../../types";
import { SpecSchema } from "../../types";
import { listSpecsActivity, showSpecActivity } from "../../temporal/activities";
import type { LoadResult } from "../json";
import { listChangeWorkflowIds } from "../../temporal/list-change-workflows";
import {
  ChangeSummaryMemo,
  asGateStatus,
  type ChangeSummary,
} from "../store-temporal-memo";
import {
  type TemporalStoreBackendInput,
  type WorkflowHandleLike,
  type StoreDeps,
  mapTemporalChangeStateToChange,
  getGuardedChangeHandle,
  runTemporalQuery,
  classifyTemporalReadFailure,
  createTemporalReadDeadline,
  raceWithTemporalDeadline,
  remainingDeadlineMs,
  TemporalQueryTimeoutError,
  type TemporalReadDeadline,
} from "./shared";
import {
  changeStateQuery,
  worktreeAutoManagedSignal,
} from "../../temporal/messages";
import { ensureChangeWorkflowStarted } from "../../temporal/workflow-start";
import { changeSeedStateFromChange } from "../../temporal/change-state";
import type { ChangeWorkflowState } from "../../temporal/contracts";
import type { ProjectionRecoveryReason } from "../../temporal/recovery-classification";

import { createChangeOps } from "./changes";
import { createTaskOps } from "./tasks";
import { createGateOps } from "./gates";
import { createWisdomOps } from "./wisdom";
import { createSpecDeltaOps } from "./spec-deltas";
import { createEpicOps } from "./epics";

const logger = createLogger("store-temporal");

type ProjectionSource = "disk" | "archive";

function withProjectionRecovery(
  change: Change,
  source: ProjectionSource,
  reason: ProjectionRecoveryReason,
): Change & {
  _source: ProjectionSource;
  _recovery: {
    mode: "temporal_query_fallback";
    reason: ProjectionRecoveryReason;
  };
} {
  return {
    ...change,
    _source: source,
    _recovery: { mode: "temporal_query_fallback", reason },
  };
}

export function createTemporalStoreBackend(
  input: TemporalStoreBackendInput,
): Store {
  const { legacy } = input;

  // Shared state
  const changeCache = new Map<string, Change>();
  const changeOverlayCache = new Map<string, Partial<Change>>();
  const memo = new ChangeSummaryMemo();

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
      lifecycleState: state.lifecycleState,
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
      fast_follow_of: state.fast_follow_of,
      ops_followup: state.ops_followup,
      ops_followup_links: state.ops_followup_links,
      epic_membership: (state as { epic_membership?: EpicMembership })
        .epic_membership,
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
    // rq-reentryTaskLookup01: every workflow-state cache refresh must also
    // hydrate the reverse task→change index. Tool-layer task additions and
    // gate re-entry refresh via setCachedChange(), not store.tasks.add(), so
    // ad-hoc indexing only at individual call sites leaves task-id-only tools
    // unable to resolve newly visible workflow tasks.
    for (const task of state.tasks ?? []) {
      taskChangeIndex.set(task.id, state.changeId);
    }
    return mapped;
  };

  const setCachedProjection = (change: Change): Change => {
    changeCache.set(change.id, change);
    memo.set(change.id, {
      id: change.id,
      title: change.title,
      status: change.status,
      gateProgress: {
        proposal: asGateStatus(change.gates?.proposal?.status),
        discovery: asGateStatus(change.gates?.discovery?.status),
        design: asGateStatus(change.gates?.design?.status),
        planning: asGateStatus(change.gates?.planning?.status),
        execution: asGateStatus(change.gates?.execution?.status),
        acceptance: asGateStatus(change.gates?.acceptance?.status),
        release: asGateStatus(change.gates?.release?.status),
      },
      taskCounts: {
        total: change.tasks?.length ?? 0,
        done: (change.tasks ?? []).filter((t) => t.status === "done").length,
        pending: (change.tasks ?? []).filter((t) => t.status === "pending")
          .length,
      },
      lastActivityAt: change.created_at,
      fast_follow_of: change.fast_follow_of,
      ops_followup: change.ops_followup,
      ops_followup_links: change.ops_followup_links,
      epic_membership: change.epic_membership,
    });
    indexTasksFromChange(change);
    return change;
  };

  /**
   * Dual-write the latest workflow state to the disk snapshot
   * (`change.json`). Best-effort, fire-and-forget.
   *
   * Why this exists: Temporal signals mutate workflow state but never
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
    if (state.status === "archived") {
      logger.debug(
        `Disk dual-write skipped for archived change ${changeId}: archive bundle is the durable snapshot`,
      );
      return;
    }
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
          fast_follow_of: state.fast_follow_of,
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
   * cache + memo, then dual-writes to disk.
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

  /**
   * rq-autoManageAdvWorktrees AC3 — lazy migration of legacy changes.
   *
   * On first read of a change whose workflow state lacks
   * `worktree_auto_managed`, fire `worktreeAutoManagedSignal` best-effort
   * with `value: false, source: "migrate"`. The signal handler is sticky
   * (`applyWorktreeAutoManagedToState`) so concurrent migrations from
   * peer sessions are idempotent. Failures log at `debug` and do NOT
   * block the read — the next read retries automatically.
   *
   * Lazy by design (DONT3): never fires at plugin load. Only triggers
   * when a tool actually requests a change.
   *
   * Pre-A3 detection: any change with the marker undefined is necessarily
   * legacy (new changes get the marker stamped at create per A3, across
   * workflow seedState + disk + Memo overlay simultaneously).
   */
  const fireWorktreeAutoManagedMigrationIfNeeded = (
    changeId: string,
    workflowMarker: boolean | undefined,
    diskMarker: boolean | undefined,
  ): void => {
    if (
      typeof workflowMarker === "boolean" ||
      typeof diskMarker === "boolean"
    ) {
      return;
    }
    void (async () => {
      try {
        const handle = await getGuardedChangeHandle(input, changeId);
        await handle.signal(worktreeAutoManagedSignal, {
          value: false,
          source: "migrate",
          recordedAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.debug(
          `Lazy worktree_auto_managed migration skipped for change ${changeId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    })();
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
   * Retired projectWorkflow summary signal hook.
   *
   * ProjectStateWorkflow (PSW) no longer owns change summaries after the
   * per-change workflow cutover; summaries now live in workflow state and the
   * local memo. Keep this no-op until callers no longer share the old hook.
   */
  const emitChangeSummarySignal = (
    _changeId: string,
    _state: ChangeWorkflowState,
  ): void => {
    // No-op: projectWorkflow retired; change summaries live in workflow state.
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

  const indexTasksFromChange = (change: Change): void => {
    for (const task of change.tasks ?? []) {
      taskChangeIndex.set(task.id, change.id);
    }
  };

  const resolveChangeId = async (taskId: string): Promise<string | null> => {
    const cached = taskChangeIndex.get(taskId);
    if (cached) return cached;
    for (const change of changeCache.values()) {
      if ((change.tasks ?? []).some((task) => task.id === taskId)) {
        taskChangeIndex.set(taskId, change.id);
        return change.id;
      }
    }
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
  const loadArchiveProjection = async (
    changeId: string,
    reason: ProjectionRecoveryReason,
    deadline?: TemporalReadDeadline,
  ): Promise<Change | null> => {
    if (!legacy.paths.archive) return null;

    const exact = await loadChange(legacy.paths.archive, changeId);
    if (exact.success && exact.data?.id === changeId) {
      return withProjectionRecovery(exact.data, "archive", reason);
    }

    // The scan below is the archive-inventory × candidate product (DONT3):
    // once the aggregate deadline is exhausted it must not begin.
    // rq-readSourceAttribution01: archive/visibility candidate sources are
    // bounded and attributed — per-iteration deadline admission, typed source
    // degradation naming the incomplete source, and no unbounded scan.
    if (deadline && remainingDeadlineMs(deadline) <= 0) return null;

    let archiveDirs: string[];
    try {
      archiveDirs = await listChangeDirs(legacy.paths.archive);
    } catch (err) {
      logger.warn(
        `Archive projection list failed for change ${changeId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }

    for (const archiveDir of archiveDirs) {
      if (deadline && remainingDeadlineMs(deadline) <= 0) return null;
      if (archiveDir === changeId) continue;
      const loaded = await loadChange(legacy.paths.archive, archiveDir);
      if (loaded.success && loaded.data?.id === changeId) {
        return withProjectionRecovery(loaded.data, "archive", reason);
      }
    }

    return null;
  };

  const loadArchiveBundleDominantProjection = async (
    changeId: string,
    reason: ProjectionRecoveryReason,
    deadline?: TemporalReadDeadline,
  ): Promise<Change | null> => {
    if (!legacy.paths.archive) return null;
    if (!(await hasArchiveBundle(legacy.paths.archive, changeId))) return null;

    const archivedProjection = await loadArchiveProjection(
      changeId,
      reason,
      deadline,
    );
    if (archivedProjection) {
      return setCachedProjection({ ...archivedProjection, status: "archived" });
    }

    const diskProjection = await legacy.changes.get(changeId);
    if (diskProjection.success && diskProjection.data?.id === changeId) {
      return setCachedProjection(
        withProjectionRecovery(
          { ...diskProjection.data, status: "archived" },
          "disk",
          reason,
        ),
      );
    }

    return null;
  };

  /**
   * rq-terminalProjectionTruth01: durable terminal projection dominates stale
   * non-terminal workflow, memo, disk, and visibility projections. Check the
   * archive bundle first, then a closed disk snapshot. Active/missing changes
   * fall through to the live workflow path.
   */
  const loadTerminalProjection = async (
    changeId: string,
    reason: ProjectionRecoveryReason = "missing_workflow",
    deadline?: TemporalReadDeadline,
  ): Promise<Change | null> => {
    const archiveProjection = await loadArchiveBundleDominantProjection(
      changeId,
      reason,
      deadline,
    );
    if (archiveProjection) return archiveProjection;

    const diskClosed = await loadDiskTerminalProjection(changeId);
    if (diskClosed) return setCachedProjection(diskClosed);

    return null;
  };

  const reseedChangeFromDisk = async (
    changeId: string,
    reason: ProjectionRecoveryReason = "missing_workflow",
    deadline?: TemporalReadDeadline,
  ): Promise<Change | null> => {
    // rq-replayFallback01: poisoned or missing workflow reads fall back to
    // durable disk/archive projections instead of forcing manual bundle work.
    const legacyRead = await legacy.changes.get(changeId);
    if (!legacyRead.success || !legacyRead.data) {
      return loadArchiveProjection(changeId, reason, deadline);
    }
    const change = legacyRead.data;

    // (A5 / rq-archivePurge01.1, M2b/terminatechangeworkflowonarchi)
    // Archived AND closed changes are terminal — return the on-disk
    // projection directly WITHOUT re-creating the workflow.
    //   - For archived: re-seeding would re-emit a ChangeSummary signal
    //     and undo adv_archive_purge on the very next read.
    //   - For closed: change workflows now Complete on close (terminal-
    //     state branch in workflows.ts). Re-seeding would create a new
    //     run that immediately Completes — pointless churn.
    // Mark the result so callers (and tests) can identify disk-sourced
    // returns.
    if (change.status === "archived" || change.status === "closed") {
      return withProjectionRecovery(change, "disk", reason);
    }
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
        projectionChangesDir: legacy.paths.changes,
        archiveProjects: [{ projectPath: legacy.paths.root }],
        seedState: changeSeedStateFromChange(change),
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
      // rq-replayFallback01.3: when re-seed of a non-terminal change fails
      // AND the original trigger error was a known poisoned-history class
      // (TMPRL1100 / nondeterminism / no-command-replay), fall back to the
      // durable disk projection. Mirrors the post-reseed-query fallback in
      // the next try/catch. Missing-workflow re-seed failures still return
      // null so callers see the real WorkflowNotFoundError instead of a
      // synthetically-recovered stale projection.
      if (reason === "poisoned_history") {
        return withProjectionRecovery(change, "disk", reason);
      }
      return null;
    }
    try {
      const state = (await runTemporalQuery(
        async () =>
          (await getGuardedChangeHandle(input, changeId)).query(
            changeStateQuery,
          ),
        { deadline },
      )) as ChangeWorkflowState;
      indexTasksFromState(state);
      return setCachedChange(state);
    } catch (err) {
      logger.warn(
        `Temporal re-seed succeeded but post-reseed query failed for change ${changeId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      const failure = await classifyTemporalReadFailure(
        input,
        changeId,
        err,
        deadline,
      );
      // query_failed never authorizes projection recovery: the post-reseed
      // workflow state is unknown, so surface the original failure instead
      // of masking it with a stale disk projection.
      if (
        failure.errorClass === "fallback" &&
        failure.recoveryReason !== "query_failed"
      ) {
        return withProjectionRecovery(
          change,
          "disk",
          failure.recoveryReason ?? "missing_workflow",
        );
      }
      return null;
    }
  };

  const getTemporalChange = async (
    changeId: string,
    opts?: { deadline?: TemporalReadDeadline },
  ): Promise<ReturnType<Store["changes"]["get"]>> => {
    const deadline = opts?.deadline;
    // Aggregate-deadline admission (KD1/KD5): once the request budget is
    // exhausted, no further read stage may begin. The caller records the
    // resulting TemporalQueryTimeoutError as typed incompleteness rather
    // than re-entering another retry loop.
    if (deadline && remainingDeadlineMs(deadline) <= 0) {
      throw new TemporalQueryTimeoutError(deadline.budgetMs);
    }
    // rq-terminalProjectionTruth01: durable terminal projection dominates
    // stale non-terminal shadows before any live workflow round-trip.
    const terminalProjection = await loadTerminalProjection(
      changeId,
      "missing_workflow",
      deadline,
    );
    if (terminalProjection) {
      indexTasksFromChange(terminalProjection);
      const source =
        (terminalProjection as Change & { _source?: "disk" | "archive" })
          ._source ?? "archive";
      return {
        success: true,
        data: terminalProjection,
        source,
      };
    }

    const cached = changeCache.get(changeId);
    if (cached) {
      indexTasksFromChange(cached);
      return {
        success: true,
        data: cached,
        source:
          (cached as Change & { _source?: "disk" | "archive" })._source ??
          "workflow",
      };
    }
    try {
      const state = (await runTemporalQuery(
        async () =>
          (await getGuardedChangeHandle(input, changeId)).query(
            changeStateQuery,
          ),
        { deadline },
      )) as ChangeWorkflowState;
      indexTasksFromState(state);
      // rq-autoManageAdvWorktrees AC3 — lazy migration trigger.
      // Fires once on legacy reads; sticky handler dedupes concurrent races.
      fireWorktreeAutoManagedMigrationIfNeeded(
        changeId,
        state.worktree_auto_managed,
        undefined,
      );
      return {
        success: true,
        data: setCachedChange(state),
        source: "workflow",
      };
    } catch (error) {
      // P1.5 — orphan-tolerant changes.get with re-seed. When the
      // workflow is missing but a disk snapshot exists, seed a fresh
      // ChangeWorkflow from disk and return the hydrated state. This
      // prevents a single orphan from blocking adv_status /
      // adv_change_list / adv_change_show.
      //
      // (A5 / rq-archivePurge01.1) For archived changes specifically,
      // reseedChangeFromDisk short-circuits and returns the on-disk
      // projection without re-creating the workflow — re-seeding would
      // re-emit a summary signal and undo adv_archive_purge.
      const failure = await classifyTemporalReadFailure(
        input,
        changeId,
        error,
        deadline,
      );
      // query_failed never authorizes mutation: re-seed may start a new
      // workflow run, which is only safe when the workflow is known missing
      // or its history is known poisoned.
      if (
        failure.errorClass === "fallback" &&
        failure.recoveryReason !== "query_failed"
      ) {
        const reseeded = await reseedChangeFromDisk(
          changeId,
          failure.recoveryReason ?? "missing_workflow",
          deadline,
        );
        if (reseeded) {
          // rq-autoManageAdvWorktrees AC3 — lazy migration after reseed.
          // The disk projection may lack the marker for legacy changes
          // that pre-date this field; signal the workflow once so the
          // marker becomes sticky in the freshly-seeded state.
          fireWorktreeAutoManagedMigrationIfNeeded(
            changeId,
            undefined,
            reseeded.worktree_auto_managed,
          );
          return {
            success: true,
            data: reseeded,
            source:
              (reseeded as Change & { _source?: "disk" | "archive" })._source ??
              "disk",
          };
        }
      }
      throw error;
    }
  };

  const loadDiskTerminalProjection = async (
    changeId: string,
  ): Promise<Change | null> => {
    try {
      const result = await legacy.changes.get(changeId);
      // rq-terminalProjectionTruth01 / poison read-resilience: a terminal
      // change.json (archived OR closed) is disk-authoritative and MUST be
      // served without a live workflow round-trip. Archived previously relied
      // solely on loadArchiveBundleDominantProjection (bundle-present); when the
      // archive bundle is missing/raced, an archived change fell through to the
      // live query and could hit a poisoned/terminated workflow (TMPRL1100),
      // paying a wasteful query + describe() probe per candidate before the
      // catch→reseedChangeFromDisk path finally returned the same disk data.
      // Short-circuiting both terminal statuses here mirrors reseedChangeFromDisk
      // and keeps enumeration/status reads fast even against poisoned terminal
      // workflows.
      if (
        result.success &&
        result.data &&
        (result.data.status === "closed" || result.data.status === "archived")
      ) {
        // Mark the disk source so callers report source "disk" (matching the
        // prior catch→reseedChangeFromDisk path). This is terminal-projection
        // dominance, NOT a temporal_query_fallback recovery, so it does not
        // carry the _recovery reconciliation marker.
        return { ...result.data, _source: "disk" } as Change;
      }
    } catch {
      // Disk projection is only a terminal-state dominance check. Missing or
      // unreadable disk state falls through to Temporal/missing-workflow logic.
    }
    return null;
  };

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
  const listResolvedChanges = async (
    filter?: {
      includeArchived?: boolean;
      includeClosed?: boolean;
    },
    deadline: TemporalReadDeadline = createTemporalReadDeadline(),
    options?: { candidateLimit?: number; hydrationConcurrency?: number },
  ): Promise<import("../store-types").ResolvedChangeList> => {
    const wantsTerminalStatuses = Boolean(
      filter?.includeArchived || filter?.includeClosed,
    );
    const expired = (): boolean => remainingDeadlineMs(deadline) <= 0;

    // Track source-class failures and per-candidate outcomes so aggregate
    // reads can surface structured degraded metadata instead of
    // masquerading as complete success. Both are recorded in ONE load
    // pass — terminal classification no longer re-runs the per-candidate
    // load chain (KD2).
    const degradedSources = new Set<TerminalSource>();
    let deadlineExceeded = false;
    const deadlineSources = new Set<TerminalSource>();
    const markDeadline = (source: TerminalSource): void => {
      deadlineExceeded = true;
      deadlineSources.add(source);
    };
    type CandidateResolution = {
      id: string;
      terminal: boolean;
      source?: "workflow" | "disk" | "archive" | "retired_projection";
      omitted: boolean;
      omissionReason?: "load_failed" | "deadline" | "bounded";
    };
    const candidateResolutions: CandidateResolution[] = [];

    // Union three sources to find every change ID. Memo is used as a
    // cache within per-change hydration (getTemporalChange), not as a
    // completeness authority, so we always merge memo IDs with visibility
    // and disk to avoid omitting active changes or flattening task counts.
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
    const memoAll = memo.getAll();
    const memoIds = memoAll.map((s) => s.id);

    const bundle = input.temporal as {
      client?: { workflow?: { list?: unknown } };
    };
    let visibilityIds: string[] = [];
    if (typeof bundle.client?.workflow?.list === "function") {
      try {
        visibilityIds = await raceWithTemporalDeadline(
          listChangeWorkflowIds(
            bundle.client as Parameters<typeof listChangeWorkflowIds>[0],
            {
              projectId: input.projectId,
              // Drop the status filter when caller wants archived/closed
              // so the visibility query doesn't pre-narrow the result set.
              statuses: wantsTerminalStatuses ? null : undefined,
            },
          ),
          deadline,
        );
      } catch (err) {
        const hitDeadline =
          err instanceof TemporalQueryTimeoutError || expired();
        logger.warn(
          `[P2.4] Visibility list ${
            hitDeadline ? "exceeded the aggregate read deadline" : "failed"
          }; falling back to legacy disk scan: ${err instanceof Error ? err.message : String(err)}`,
        );
        degradedSources.add("visibility");
        if (hitDeadline) markDeadline("visibility");
      }
    }

    // Disk enumeration is typically fast local I/O (one readdir per path)
    // but can hang on slow network/FUSE/NFS-backed project roots or
    // transiently-stalled filesystems. Route it through the same
    // aggregate-deadline admission gate as visibility (AC1/AC5/C2) so a
    // slow readdir degrades with typed source-specific incompleteness
    // rather than outliving the request budget. Disk still stays
    // available as an omission-evidence source on Temporal-side
    // degradation; the deadline gates the potentially-unbounded stages.
    let diskIds: string[] = [];
    try {
      diskIds = await raceWithTemporalDeadline(
        listChangeDirs(legacy.paths.changes),
        deadline,
      );
    } catch (err) {
      const hitDeadline = err instanceof TemporalQueryTimeoutError || expired();
      logger.warn(
        `Disk listChangeDirs ${
          hitDeadline ? "exceeded the aggregate read deadline" : "failed"
        }: ${err instanceof Error ? err.message : String(err)}`,
      );
      degradedSources.add("active_disk");
      if (hitDeadline) markDeadline("active_disk");
    }

    // (4) Archive bundles — required when caller asks for terminal statuses.
    //
    // After rq-archiveRetirement01.1, archived changes have their active
    // source dir removed, so they aren't in `diskIds`. Their workflow may
    // also be evicted from Temporal so `visibilityIds` skips them too. Without
    // this listing, archive-only changes are invisible to
    // `adv_change_list({ status: "archived" })` and `includeArchived: true`.
    let archiveIds: string[] = [];
    if (wantsTerminalStatuses && legacy.paths.archive) {
      try {
        archiveIds = await raceWithTemporalDeadline(
          listChangeDirs(legacy.paths.archive),
          deadline,
        );
      } catch (err) {
        const hitDeadline =
          err instanceof TemporalQueryTimeoutError || expired();
        logger.warn(
          `Disk listChangeDirs(archive) ${
            hitDeadline ? "exceeded the aggregate read deadline" : "failed"
          }: ${err instanceof Error ? err.message : String(err)}`,
        );
        degradedSources.add("archive");
        if (hitDeadline) markDeadline("archive");
      }
    }

    const changeIds = Array.from(
      new Set([...memoIds, ...visibilityIds, ...diskIds, ...archiveIds]),
    );
    const archiveIdSet = new Set(archiveIds);

    // Caller-supplied read bound (fixChangeListTimeouts KD4 / AC3): the
    // summary view bounds deep hydration UPSTREAM instead of hydrating
    // every candidate and slicing the output afterwards. Memo-warm
    // candidates sort by recency first so the bounded set is the most
    // recent one rather than an arbitrary enumeration prefix; candidates
    // without a memo signal keep their (stable) enumeration order. The
    // truncated tail becomes typed bounded omissions — never silently
    // dropped, never counted as complete (C2).
    const candidateLimit = options?.candidateLimit;
    let hydrationIds = changeIds;
    if (candidateLimit !== undefined && changeIds.length > candidateLimit) {
      const memoActivity = new Map(
        memoAll.map((summary) => [summary.id, summary.lastActivityAt] as const),
      );
      const ordered = [...changeIds].sort((a, b) => {
        const aActivity = memoActivity.get(a);
        const bActivity = memoActivity.get(b);
        if (aActivity && bActivity) {
          const cmp = bActivity.localeCompare(aActivity);
          return cmp !== 0 ? cmp : a.localeCompare(b);
        }
        if (aActivity) return -1;
        if (bActivity) return 1;
        return 0;
      });
      hydrationIds = ordered.slice(0, candidateLimit);
      for (const changeId of ordered.slice(candidateLimit)) {
        candidateResolutions.push({
          id: changeId,
          terminal: archiveIdSet.has(changeId),
          omitted: true,
          omissionReason: "bounded",
        });
      }
    }

    // rq-inventoryDiskBudget01 / fixArchiveConflictInventory: process archive
    // candidates FIRST within the hydration set. An archive candidate resolves
    // from its durable on-disk bundle (a cheap, bounded local read via
    // getTemporalChange's terminal-projection short-circuit) with no live
    // workflow round-trip, whereas non-archive candidates may issue slow or
    // poisoned workflow queries that consume the shared aggregate read
    // deadline. Loading the cheap archived candidates before the expensive
    // live queries prevents a query budget exhausted by slow/poisoned
    // workflows from STARVING archived changes that already exist on disk —
    // the root cause of the 8s conflict-inventory / includeArchived
    // enumeration timeout (74/118 archived candidates omitted despite their
    // bundles being present on disk). Stable sort preserves within-partition
    // order (recency for the memo-warm active set, enumeration order otherwise).
    if (archiveIdSet.size > 0) {
      hydrationIds = [...hydrationIds].sort(
        (a, b) => (archiveIdSet.has(a) ? 0 : 1) - (archiveIdSet.has(b) ? 0 : 1),
      );
    }

    // Batch size for loading changes — balances Temporal query parallelism
    // against memory usage. 20 keeps per-batch latency under ~200ms with
    // typical Temporal backends while avoiding excessive concurrent signals.
    const CHANGE_LIST_BATCH_SIZE = 20;
    const hydrationConcurrency = Math.max(
      1,
      Math.floor(options?.hydrationConcurrency ?? CHANGE_LIST_BATCH_SIZE),
    );
    const changes: Change[] = [];

    // Layer A1 (rq-archiveRetirement01.1): per-list-call cache for archive
    // bundle existence. When `getTemporalChange` throws and we fall back to
    // legacy disk read, the loaded change.json may carry a stale `draft`
    // status because save(archived) intentionally skips disk writes (per
    // rq-archiveRetirement01.2) and `removeChangeDir` is best-effort. If a
    // matching archive bundle exists for that id, the change IS archived
    // — override the status so default lists exclude the zombie shadow.
    const archiveBundleCache = new Map<string, boolean>();
    const checkArchiveBundle = async (id: string): Promise<boolean> => {
      // Guard: if no archive path is configured (test fixtures, partial
      // store init), skip the bundle check entirely — there's no archive
      // to consult, so no override is possible.
      if (!legacy.paths.archive) return false;
      const cached = archiveBundleCache.get(id);
      if (cached !== undefined) return cached;
      const exists = await hasArchiveBundle(legacy.paths.archive, id);
      archiveBundleCache.set(id, exists);
      return exists;
    };

    // Pre-scan memo for stale terminal-state entries (rq-crossSessionCacheConsistency01)
    for (const summary of memoAll) {
      // Deadline admission (KD5): stop the archive-bundle pre-scan once
      // the aggregate budget is gone and record typed incompleteness.
      if (expired()) {
        markDeadline("archive");
        break;
      }
      if (summary.status === "archived" || summary.status === "closed")
        continue;
      if (await checkArchiveBundle(summary.id)) {
        memo.invalidate(summary.id);
        invalidateChange(summary.id);
      }
    }

    // One-pass candidate load + classification (KD2). Each candidate is
    // loaded at most once; document, provenance, terminal state, and
    // omission/deadline outcome are recorded during the same pass.
    const loadCandidate = async (
      changeId: string,
    ): Promise<{ change?: Change; resolution?: CandidateResolution }> => {
      const isArchiveCandidate = archiveIdSet.has(changeId);
      try {
        const result = await raceWithTemporalDeadline(
          getTemporalChange(changeId, { deadline }),
          deadline,
        );
        if (result.success && result.data) {
          return {
            change: result.data,
            resolution: {
              id: changeId,
              terminal:
                result.data.status === "archived" ||
                result.data.status === "closed",
              source: result.source,
              omitted: false,
            },
          };
        }
      } catch {
        // rq-terminalAggregateRead01: per-candidate failure is bounded;
        // one bad/missing workflow does not abort the aggregate read.
        // Fall through to the fallback chain below.
      }

      // Once the aggregate budget is gone no fallback stage may begin;
      // record typed incompleteness instead of initiating more reads
      // (design execution note 2 — never re-enter a retry loop).
      if (expired()) {
        markDeadline("workflow_query");
        return {
          resolution: {
            id: changeId,
            terminal: isArchiveCandidate,
            omitted: true,
            omissionReason: "deadline",
          },
        };
      }

      try {
        const result = await raceWithTemporalDeadline(
          legacy.changes.get(changeId),
          deadline,
        );
        if (result.success && result.data) {
          const terminal =
            result.data.status === "archived" ||
            result.data.status === "closed";

          // Layer A1 defensive override: if disk-fallback returned a
          // non-terminal status but an archive bundle exists, treat
          // as archived (the bundle is the durable terminal record).
          if (
            !terminal &&
            (await raceWithTemporalDeadline(
              checkArchiveBundle(changeId),
              deadline,
            ))
          ) {
            return {
              change: { ...result.data, status: "archived" },
              resolution: {
                id: changeId,
                terminal: true,
                source: "archive",
                omitted: false,
              },
            };
          }

          return {
            change: result.data,
            resolution: {
              id: changeId,
              terminal,
              source: "disk",
              omitted: false,
            },
          };
        }

        // Archive-only fallback: when there is no source-dir shadow
        // (legacy.changes.get returned success: false) but an archive
        // bundle exists, load the change directly from the bundle.
        // The bundle is the durable terminal record per
        // rq-archiveRetirement01.1.
        if (
          !result.success &&
          legacy.paths.archive &&
          (await raceWithTemporalDeadline(
            checkArchiveBundle(changeId),
            deadline,
          ))
        ) {
          try {
            const archiveLoad = await raceWithTemporalDeadline(
              loadChange(legacy.paths.archive, changeId),
              deadline,
            );
            if (archiveLoad.success && archiveLoad.data) {
              return {
                change: archiveLoad.data,
                resolution: {
                  id: changeId,
                  terminal: true,
                  source: "archive",
                  omitted: false,
                },
              };
            }
          } catch {
            // fall through to omission
          }
        }
      } catch {
        // fall through to omission
      }

      // Omissions are recorded for terminal candidates (existing
      // rq-terminalAggregateRead01 semantics) and for any candidate lost
      // to deadline expiry (new typed incompleteness).
      const hitDeadline = expired();
      if (hitDeadline) markDeadline("workflow_query");
      if (isArchiveCandidate || hitDeadline) {
        return {
          resolution: {
            id: changeId,
            terminal: isArchiveCandidate,
            omitted: true,
            omissionReason: hitDeadline ? "deadline" : "load_failed",
          },
        };
      }
      return {};
    };

    for (let i = 0; i < hydrationIds.length; i += hydrationConcurrency) {
      // Batch admission: no new load work begins after expiry. Remaining
      // candidates become typed omissions rather than hanging the read.
      if (expired()) {
        markDeadline("workflow_query");
        for (const changeId of hydrationIds.slice(i)) {
          candidateResolutions.push({
            id: changeId,
            terminal: archiveIdSet.has(changeId),
            omitted: true,
            omissionReason: "deadline",
          });
        }
        break;
      }
      const batch = hydrationIds.slice(i, i + hydrationConcurrency);
      const loaded = await Promise.all(batch.map(loadCandidate));
      for (const entry of loaded) {
        if (entry.change) changes.push(entry.change);
        if (entry.resolution) candidateResolutions.push(entry.resolution);
      }
    }

    // Archive bundle directory names are not canonical: older bundles may be
    // stored as `{date}-{changeId}` while `change.json.id` remains the stable
    // change identifier. Deduplicate on loaded canonical id so terminal lists
    // do not show duplicates when both directory forms exist.
    const byCanonicalId = new Map<string, Change>();
    for (const change of changes) {
      const existing = byCanonicalId.get(change.id);
      if (!existing) {
        byCanonicalId.set(change.id, change);
        continue;
      }
      const existingTerminal =
        existing.status === "archived" || existing.status === "closed";
      const candidateTerminal =
        change.status === "archived" || change.status === "closed";
      if (!existingTerminal && candidateTerminal) {
        byCanonicalId.set(change.id, change);
      }
    }
    const resolvedChanges = Array.from(byCanonicalId.values());

    // Terminal provenance/omission classification was recorded during the
    // single load pass above — there is intentionally no second per-
    // candidate load loop (KD2; previously this section re-ran the whole
    // load chain for classification only).

    const terminalResolutions = candidateResolutions.filter((r) => r.terminal);
    // Bounded omissions carry their own warning code; they must not
    // inflate the terminal load-failure omission count.
    const omittedResolutions = terminalResolutions.filter(
      (r) => r.omitted && r.omissionReason !== "bounded",
    );
    const omitted = omittedResolutions.length;
    const terminalFromArchive = terminalResolutions.filter(
      (r) => !r.omitted && r.source === "archive",
    ).length;
    const terminalFromDisk = terminalResolutions.filter(
      (r) => !r.omitted && r.source === "disk",
    ).length;
    const terminalFromWorkflow = terminalResolutions.filter(
      (r) => !r.omitted && r.source === "workflow",
    ).length;
    const deadlineOmissions = candidateResolutions.filter(
      (r) => r.omitted && r.omissionReason === "deadline",
    );
    const boundedOmissions = candidateResolutions.filter(
      (r) => r.omitted && r.omissionReason === "bounded",
    );

    const warnings: TerminalWarning[] = [];
    if (wantsTerminalStatuses) {
      for (const source of degradedSources) {
        warnings.push({
          code: "TERMINAL_SOURCE_DEGRADED" as TerminalWarningCode,
          source,
          message: `Terminal ${source} source could not be enumerated; rows may be incomplete.`,
        });
      }
      if (omitted > 0) {
        warnings.push({
          code: "TERMINAL_CANDIDATE_OMITTED" as TerminalWarningCode,
          source: "workflow_query",
          message: `${omitted} terminal candidate(s) could not be loaded from any available source.`,
          omittedCount: omitted,
          omittedIds: omittedResolutions.map((r) => r.id).slice(0, 20),
        });
      }
    }
    // Deadline-triggered incompleteness is typed on BOTH active and
    // terminal paths — a deadline-truncated result must never look
    // complete (C2). Source failures keep their terminal-only warning
    // semantics for compatibility.
    if (deadlineExceeded) {
      const sources =
        deadlineSources.size > 0
          ? Array.from(deadlineSources)
          : (["workflow_query"] as TerminalSource[]);
      for (const source of sources) {
        warnings.push({
          code: "SOURCE_DEADLINE_EXCEEDED" as TerminalWarningCode,
          source,
          message: `Aggregate read deadline (${deadline.budgetMs}ms) exceeded while resolving ${source}; results are incomplete.`,
          ...(deadlineOmissions.length > 0
            ? {
                omittedCount: deadlineOmissions.length,
                omittedIds: deadlineOmissions.map((r) => r.id).slice(0, 20),
              }
            : {}),
        });
      }
    }
    // Caller-bound truncation is typed on BOTH active and terminal paths:
    // a bound-truncated result must never look complete (C2), and counts/
    // recency derived from it are explicitly partial (KD4 risk row).
    if (boundedOmissions.length > 0) {
      warnings.push({
        code: "SOURCE_BOUND_EXCEEDED" as TerminalWarningCode,
        source: "workflow_query",
        message: `Read bound (${candidateLimit} candidate(s)) truncated ${boundedOmissions.length} candidate(s); counts and recency are incomplete.`,
        omittedCount: boundedOmissions.length,
        omittedIds: boundedOmissions.map((r) => r.id).slice(0, 20),
      });
    }

    // Active/default path: no terminal degraded metadata (preserved
    // compatibility), but deadline and bound degradation always surface.
    if (!wantsTerminalStatuses) {
      if (warnings.length === 0) {
        return { changes: resolvedChanges };
      }
      return {
        changes: resolvedChanges,
        warnings,
        hydrationStats: {
          ...(deadlineExceeded ? { deadlineExceeded: true } : {}),
          ...(deadlineOmissions.length > 0
            ? { omitted: deadlineOmissions.length }
            : {}),
          ...(boundedOmissions.length > 0
            ? { boundedOmitted: boundedOmissions.length }
            : {}),
        },
      };
    }

    const hydrationStats: HydrationStats = {
      terminalCandidates: terminalResolutions.length,
      terminalFromArchive,
      terminalFromDisk,
      terminalFromWorkflow,
      omitted,
      ...(deadlineExceeded ? { deadlineExceeded: true } : {}),
      ...(boundedOmissions.length > 0
        ? { boundedOmitted: boundedOmissions.length }
        : {}),
    };

    return {
      changes: resolvedChanges,
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(terminalResolutions.length > 0 || deadlineExceeded
        ? { hydrationStats }
        : {}),
    };
  };

  const buildTemporalStatus = async (
    options?: import("../store-types").StatusReadOptions,
  ): Promise<ProjectStatus> => {
    // P2.2: status no longer routes through legacy.status(). Specs come
    // from listSpecsActivity (disk read), changes come from Temporal-derived
    // listResolvedChanges, recommendations are an empty array (the doctor-
    // prefixed recs were generated by corruption-recovery.ts which is
    // deleted in P2.7 — no longer relevant in Temporal-only mode).
    //
    // One request-scoped aggregate deadline covers this status read
    // (KD1/KD5); callers may share their own via options. The summary
    // bound (recentLimit) travels into the resolver as a candidate limit
    // so deep hydration stops at the bound instead of hydrating every
    // candidate and slicing afterwards (KD4 / AC3).
    const deadline = options?.deadline ?? createTemporalReadDeadline();
    const specsResult = await listSpecsActivity({
      specsDir: legacy.paths.specs,
    });
    const specCapabilities = specsResult.ok ? specsResult.specs : [];

    const resolved = await listResolvedChanges(
      undefined,
      deadline,
      options?.recentLimit !== undefined
        ? { candidateLimit: options.recentLimit }
        : undefined,
    );
    const { changes, warnings, hydrationStats } = resolved;
    const now = new Date();
    const byStatus: Record<ChangeStatus, number> = {
      draft: 0,
      archived: 0,
      closed: 0,
    };

    for (const change of changes) {
      // Finite-accumulation guard: stay NaN-safe even if a status key is
      // ever missing from the initializer above (e.g. enum narrowing).
      byStatus[change.status] = (byStatus[change.status] ?? 0) + 1;
    }

    const sortedRecent = changes
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
    // Defensive projection bound: the resolver already bounded candidates
    // when recentLimit was supplied, so this slice is a no-op on that
    // path; it keeps the read model honest for any future caller that
    // passes a limit without resolver support.
    const recent =
      options?.recentLimit !== undefined
        ? sortedRecent.slice(0, options.recentLimit)
        : sortedRecent;

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
      // Request-local resolved documents for enrichment reuse (KD4/AC4).
      // Transport-only; adv_status strips this before serializing output.
      resolvedChanges: new Map(
        changes.map((change) => [change.id, change] as const),
      ),
      ...(warnings && warnings.length > 0 ? { warnings } : {}),
      ...(hydrationStats ? { hydrationStats } : {}),
    };
  };

  // P2.2: activity-backed specs surface. Reads disk via listSpecsActivity
  // and showSpecActivity instead of routing through legacy.specs.* (which
  // hit disk content search). search/save still delegate to legacy until the spec
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
    taskChangeIndex,
    buildSummary,
    setCachedChange,
    invalidateChange,
    updateOverlay,
    emitChangeSummarySignal,
    persistStateToDisk,
    dualWriteAfterMutation,
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
    specDeltas: createSpecDeltaOps(deps),
    status: async (options) => buildTemporalStatus(options),
    epics: createEpicOps(deps),
  };

  return store;
}

// Re-export for any direct importers
export type { StoreDeps } from "./shared";
export { createChangeOps } from "./changes";
export { createTaskOps } from "./tasks";
export { createGateOps } from "./gates";
export { createWisdomOps } from "./wisdom";
export { createSpecDeltaOps } from "./spec-deltas";
