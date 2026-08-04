import { join } from "node:path";
import type { Store } from "../store-types";
import type { Change } from "../../types";
import { createLogger } from "../../utils/debug-log";
import { hasArchiveBundle } from "../json";
import {
  isSchemaError,
  listChangeDirs,
  loadChange,
  readBoundedProjectionDocument,
} from "../change-projection-reader";
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
import { listSpecsFilesystem, readSpecFilesystem } from "../spec-filesystem";
import type { LoadResult } from "../change-projection-reader";
import { buildVisibilityQuery } from "../../temporal/list-change-workflows";
import { CHANGE_WORKFLOW_PREFIX } from "../../temporal/contracts";
import {
  listSourceRankedCandidates,
  type SourceRankedCandidate,
} from "../../temporal/list-source-ranked-candidates";
import { listSummaryChanges } from "../change-summary-shard-reader";
import { mapWithConcurrency } from "../../utils/concurrency";
import {
  ChangeSummaryMemo,
  asGateStatus,
  type ChangeSummary,
} from "../store-temporal-memo";
import {
  type TemporalStoreBackendInput,
  type TemporalWorkflowHandle,
  type StoreDeps,
  mapTemporalChangeStateToChange,
  projectTemporalStateOntoLatest,
  getGuardedChangeHandle,
  getTemporalOwner,
  classifyTemporalReadFailure,
  raceWithTemporalDeadline,
  remainingDeadlineMs,
  TemporalQueryTimeoutError,
  type TemporalReadDeadline,
  createTemporalReadContext,
  type TemporalReadContext,
  isTemporalReadExpired,
  runTemporal,
  runTemporalQuery,
  QUERY_TIMEOUT_MS,
  withProjectionRecovery,
} from "./shared";
import {
  type TemporalOperations,
  makeTemporalOperationContext,
} from "../../temporal/operations";
import { changeStateQuery } from "../../temporal/messages";
import { isPoisonedWorkflowForChange } from "./poisoned-workflow-cache";
import type { ChangeWorkflowState } from "../../temporal/contracts";
import type { ProjectionRecoveryReason } from "../../temporal/recovery-classification";
import { composeTypedMutationResult } from "../../temporal/mutation-safety";
import {
  TemporalListOutcomeError,
  TemporalReadOutcomeError,
} from "../../temporal/outcome-errors";
import { assertDurablePersist, type DiskPersistOutcome } from "./disk-persist";
import { commitChangeProjection } from "../change-projection-transaction";

import { createChangeOps } from "./changes";
import { createTaskOps } from "./tasks";
import {
  readChangeSnapshot,
  type ChangeReadSnapshot,
  snapshotToLoadResult,
} from "./read-model";
import { createGateOps } from "./gates";
import { createWisdomOps } from "./wisdom";
import { createSpecDeltaOps } from "./spec-deltas";
import { createEpicOps } from "./epics";

const logger = createLogger("store-temporal");

export function createTemporalStoreBackend(
  input: TemporalStoreBackendInput,
): Store {
  const { legacy } = input;

  // Shared state
  const changeCache = new Map<string, Change>();
  const changeOverlayCache = new Map<string, Partial<Change>>();
  const memo = new ChangeSummaryMemo();
  const loadedDiskProjectionIds = new Set<string>();
  const markLoadedDiskProjection = (changeId: string): void => {
    loadedDiskProjectionIds.add(changeId);
  };

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

  // Routine reads are disk/read-model authoritative. This closure has no
  // Temporal dependency and only populates advisory caches after validating a
  // fresh projection read.
  const readProjectionSnapshot = async (changeId: string) => {
    const readArchiveBundle = async (
      changeId: string,
    ): Promise<ChangeReadSnapshot | undefined> => {
      if (!legacy.paths.archive) return undefined;

      const direct = await readChangeSnapshot(
        legacy.paths.archive,
        changeId,
        "archive",
      );
      if (direct.found) return direct;

      const dirs = await listChangeDirs(legacy.paths.archive);
      for (const dir of dirs) {
        if (dir === changeId) continue;
        const loaded = await loadChange(legacy.paths.archive, dir);
        if (loaded.success && loaded.data?.id === changeId) {
          return {
            found: true,
            snapshot: loaded.data,
            stateRevision: loaded.data.state_revision ?? 0,
            projectionRevision: loaded.data.projection_revision ?? 0,
            source: "archive",
          };
        }
      }
      return undefined;
    };

    const diskSnapshot = await readChangeSnapshot(
      legacy.paths.changes,
      changeId,
      "disk",
    );
    const archiveSnapshot = await readArchiveBundle(changeId);

    if (archiveSnapshot?.found) {
      const archived = {
        ...archiveSnapshot.snapshot,
        status: "archived" as const,
      };
      markLoadedDiskProjection(changeId);
      setCachedProjection(archived);
      return { ...archiveSnapshot, snapshot: archived };
    }

    if (diskSnapshot.found) {
      markLoadedDiskProjection(changeId);
      setCachedProjection(diskSnapshot.snapshot);
      return diskSnapshot;
    }

    return diskSnapshot;
  };

  /**
   * Dual-write the latest workflow state to the disk snapshot
   * (`change.json`). Best-effort, fire-and-forget.
   *
   * Why this exists: Temporal signals mutate workflow state but never
   * touch the disk file. The disk snapshot is the authoritative read model
   * for routine reads; workflow re-creation is an explicit command, not a
   * side effect of a read. Dual-writing keeps disk current so reads and
   * explicit recovery commands see the latest state.
   *
   * Returns a typed {@link DiskPersistOutcome} (persisted | skipped:archived |
   * failed) and never throws itself. Durability-critical callers route through
   * `persistStateToDiskDurable` (await + throw on failure) so `success:true`
   * means durable on disk; non-critical hot paths use `voidPersist` to keep
   * the explicit best-effort behavior. This replaces the previous
   * unawaited/swallow-on-failure dual-write that let success outrun disk
   * durability (change gateMutationSuccessDisk).
   */
  const persistStateToDisk = async (
    changeId: string,
    state: ChangeWorkflowState,
  ): Promise<DiskPersistOutcome> => {
    if (state.status === "archived") {
      logger.debug(
        `Disk dual-write skipped for archived change ${changeId}: archive bundle is the durable snapshot`,
      );
      return { kind: "skipped", reason: "archived" };
    }
    try {
      const commit = await commitChangeProjection({
        changesDir: legacy.paths.changes,
        changeId,
        authority: { kind: "temporal", mutationReceiptId: state.changeId },
        mutationKind: "temporal_dual_write_projection",
        mutateLatest: (latest) => projectTemporalStateOntoLatest(latest, state),
        verify: ({ readback }) =>
          readback.status === state.status &&
          readback.lifecycleState === state.lifecycleState,
      });
      if (commit.kind !== "committed") {
        return {
          kind: "failed",
          error: new Error(
            `Dual-write commit failed for ${changeId}: ${commit.kind}`,
          ),
        };
      }
      return { kind: "persisted" };
    } catch (err) {
      logger.debug(
        `Disk dual-write failed for change ${changeId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { kind: "failed", error: err };
    }
  };

  /**
   * Durability-critical variant: await the projection write and throw a typed
   * `DiskProjectionPersistError` if it failed, so a durable-mutation caller
   * never returns `success:true` without a durable disk projection
   * (AC2/AC5/AC7). Used by spec-delta, gate-completion, wisdom, and task
   * mutations via the durable dual-write path.
   */
  const persistStateToDiskDurable = async (
    changeId: string,
    state: ChangeWorkflowState,
  ): Promise<void> => {
    assertDurablePersist(changeId, await persistStateToDisk(changeId, state));
  };

  /**
   * Explicit best-effort variant for non-durability-critical hot paths: fire
   * the projection write without gating the caller's success. Failure is
   * logged at debug inside `persistStateToDisk` and never thrown. Making the
   * fire-and-forget choice explicit at the call site is the AC6 boundary.
   */
  const voidPersist = (changeId: string, state: ChangeWorkflowState): void => {
    void persistStateToDisk(changeId, state);
  };

  /**
   * Best-effort cache-refresh dual-write for NON-durability-critical
   * mutations (changes.refresh, epic-membership set/clear). Queries the
   * workflow once for the latest state, refreshes the cache + memo, then
   * fires an explicit best-effort disk write via `voidPersist`.
   *
   * Best-effort: if the post-mutation query fails we skip the dual-write
   * rather than fail the original mutation. The workflow update has
   * already succeeded by the time we get here. Durability-critical
   * mutations (spec deltas, gates, wisdom, tasks) do NOT use this path —
   * they persist their own confirmed state via `persistStateToDiskDurable`
   * / `persistAndRefreshDurable` so success is gated on disk durability.
   *
   * SC6 wiring: the readback outcome is composed via
   * `composeTypedMutationResult` so an ambiguous readback
   * (`outcome_unknown_readback_unavailable`) is reported at debug level
   * rather than being swallowed as a generic post-mutation refresh error.
   * The classification surfaces the typed outcome to operators and to
   * any caller that observes the cached value.
   */
  const dualWriteAfterMutation = async (changeId: string): Promise<void> => {
    if (isPoisonedWorkflowForChange(input.projectId, changeId)) {
      logger.debug(
        `dualWriteAfterMutation(${changeId}): workflow is known poisoned; skipping post-mutation readback.`,
      );
      return;
    }
    let readbackError: unknown;
    let readbackValue: ChangeWorkflowState | undefined;
    try {
      const owner = getOwner();
      const handle = await getGuardedChangeHandle(input, changeId);
      const ctx = makeTemporalOperationContext(
        input.projectId,
        handle.workflowId,
        "query",
        "dualWriteAfterMutation",
        QUERY_TIMEOUT_MS,
      );
      const outcome = await runTemporalQuery(async () =>
        owner.query(ctx, handle, changeStateQuery),
      );
      if (outcome.kind !== "complete") {
        throw new TemporalReadOutcomeError(outcome);
      }
      readbackValue = outcome.value as ChangeWorkflowState;
    } catch (err) {
      readbackError = err;
    }
    const typed = composeTypedMutationResult({
      ...(readbackError !== undefined ? { readbackError } : {}),
      ...(readbackValue !== undefined ? { readbackValue } : {}),
    });
    if (typed.outcome !== "confirmed") {
      logger.debug(
        `dualWriteAfterMutation(${changeId}): post-mutation readback classified as ${typed.outcome}; skipping dual-write to avoid masking an ambiguous mutation outcome.`,
      );
      return;
    }
    if (!readbackValue) {
      logger.debug(
        `dualWriteAfterMutation(${changeId}): post-mutation readback returned no value; skipping dual-write.`,
      );
      return;
    }
    const state = readbackValue;
    setCachedChange(state);
    emitChangeSummarySignal(changeId, state);
    // Best-effort by design: this is a cache-refresh path (changes.refresh,
    // epic-membership) whose owning mutation is already Temporal-durable.
    // Durability-critical mutations persist their own confirmed state via
    // persistAndRefreshDurable / persistStateToDiskDurable instead.
    voidPersist(changeId, state);
  };

  /**
   * Durable persist + cache refresh for mutations that already hold confirmed
   * post-mutation state (notably task mutations, which previously routed
   * through the best-effort `dualWriteAfterMutation` redundant re-query). Uses
   * the caller's confirmed state directly — avoiding a redundant readback that
   * could yield a false-negative — refreshes the cache + summary, then durably
   * persists, throwing `DiskProjectionPersistError` on disk failure so success
   * never outruns disk durability (AC2/AC5/AC7).
   */
  const persistAndRefreshDurable = async (
    changeId: string,
    state: ChangeWorkflowState,
  ): Promise<void> => {
    setCachedChange(state);
    emitChangeSummarySignal(changeId, state);
    await persistStateToDiskDurable(changeId, state);
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

  const getOwner = (): TemporalOperations => getTemporalOwner(input);

  /**
   * Extract projection from update result, falling back to a direct query
   * if the workflow returned void/null (older workflow versions).
   *
   * KD-7 (fresh-handle pattern): receives a `getHandle` thunk rather than
   * a pre-built handle so the fallback query inside `runTemporalQuery`
   * gets a fresh handle bound to the (possibly post-reconnect) client.
   */
  const resolveStateOrQuery = async (
    getHandle: () => TemporalWorkflowHandle | Promise<TemporalWorkflowHandle>,
    result: unknown,
  ): Promise<ChangeWorkflowState> => {
    if (result && typeof result === "object" && "changeId" in result) {
      return result as ChangeWorkflowState;
    }
    const owner = getOwner();
    const handle = await getHandle();
    const ctx = makeTemporalOperationContext(
      input.projectId,
      handle.workflowId,
      "query",
      "resolveStateOrQuery",
      QUERY_TIMEOUT_MS,
    );
    const outcome = await runTemporalQuery(async () =>
      owner.query(ctx, handle, changeStateQuery),
    );
    if (outcome.kind !== "complete") {
      throw new TemporalReadOutcomeError(outcome);
    }
    return outcome.value as ChangeWorkflowState;
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
   * Load a missing change's archived projection when the active disk snapshot
   * is absent. Used by the terminal-projection fallback so a `change.json`
   * snapshot (archive bundle) still surfaces without a live workflow round-trip.
   *
   * On success the archived projection is returned with a recovery marker.
   * On failure (no snapshot, read itself throws), returns `null`.
   */
  const loadArchiveProjection = async (
    changeId: string,
    reason: ProjectionRecoveryReason,
    deadline?: TemporalReadDeadline,
  ): Promise<Change | null> => {
    if (!legacy.paths.archive) return null;

    const exact = await loadChange(legacy.paths.archive, changeId);
    // Note: schema_error in archive bundles is intentionally NOT propagated
    // here. Archive bundles are write-targets for recovery (split-brain
    // scenario: corrupt/empty bundle overwritten by in-memory state).
    // Throwing on schema-invalid bundles would break reconcileArchivedBundleRetry.
    // The active change.json path (loadDiskTerminalProjection) still surfaces
    // schema errors verbatim — that's the read path users/agents need to see.
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
      // Archive-bundle schema errors are recoverable (see comment above);
      // do not throw here either.
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
    if (isSchemaError(diskProjection)) {
      throw new Error(diskProjection.error);
    }
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

  /**
   * Load the durable on-disk projection for a change, bounded by the aggregate
   * deadline. Returns `null` when the change is not on disk or the read is
   * expired; throws on schema errors so they propagate verbatim.
   */
  const loadDiskProjection = async (
    changeId: string,
    deadline: TemporalReadDeadline,
  ): Promise<Change | null> => {
    let diskResult: Awaited<ReturnType<typeof legacy.changes.get>>;
    try {
      diskResult = await raceWithTemporalDeadline(
        legacy.changes.get(changeId),
        deadline,
      );
    } catch {
      // Genuine I/O / deadline failures degrade to the Temporal path rather
      // than aborting the whole read.
      return null;
    }
    // Schema errors are not recoverable through a workflow round-trip;
    // rethrow them verbatim instead of masking them as a missing projection.
    if (isSchemaError(diskResult)) {
      throw new Error(diskResult.error);
    }
    return diskResult.success && diskResult.data ? diskResult.data : null;
  };

  const getTemporalChange = async (
    changeId: string,
    opts?: { deadline?: TemporalReadDeadline; context?: TemporalReadContext },
  ): Promise<ReturnType<Store["changes"]["get"]>> => {
    const ctx =
      opts?.context ??
      createTemporalReadContext(
        opts?.deadline ? opts.deadline.budgetMs : undefined,
      );
    // When a caller supplied only a deadline, align the context's absolute
    // deadline with the supplied one so a shared request budget is honored.
    if (opts?.deadline && !opts.context) {
      ctx.deadline = opts.deadline;
    }

    // Aggregate-deadline admission (KD1/KD5): once the request budget is
    // exhausted, no further read stage may begin. The caller records the
    // resulting TemporalQueryTimeoutError as typed incompleteness rather
    // than re-entering another retry loop.
    if (isTemporalReadExpired(ctx)) {
      throw new TemporalQueryTimeoutError(ctx.deadline.budgetMs);
    }
    // rq-terminalProjectionTruth01: durable terminal projection dominates
    // stale non-terminal shadows before any live workflow round-trip.
    const terminalProjection = await loadTerminalProjection(
      changeId,
      "missing_workflow",
      ctx.deadline,
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

    // Poisoned-workflow short-circuit: once a workflow has been classified as
    // poisoned-history (TMPRL1100 / nondeterminism), never issue another query
    // or signal against it. Serve the durable disk/archive projection directly
    // and annotate the result so callers (e.g. adv_change_show) can surface the
    // poisoned state without paying a timeout.
    if (isPoisonedWorkflowForChange(input.projectId, changeId)) {
      const snapshot = await readProjectionSnapshot(changeId);
      const result = snapshotToLoadResult(snapshot);
      if (result.success && result.data) {
        (result.data as Change & { _poisoned?: true })._poisoned = true;
        setCachedProjection(result.data);
        indexTasksFromChange(result.data);
      }
      return result;
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

    // Circuit-breaker: once three consecutive per-member queries have been
    // unresponsive, skip further workflow round-trips and fall back to disk.
    if (ctx.isCircuitBreakerTripped()) {
      const diskChange = await loadDiskProjection(changeId, ctx.deadline);
      if (diskChange) {
        indexTasksFromChange(diskChange);
        return {
          success: true,
          data: withProjectionRecovery(
            diskChange,
            "disk",
            "workflow_unresponsive",
          ),
          source: "disk",
        };
      }
      throw new TemporalQueryTimeoutError(ctx.deadline.budgetMs);
    }

    // Leg A: disk-authoritative load. The disk projection is the read model
    // the workflow writes on every signal; resolve it first so a wedged
    // workflow can never hang the read.
    const diskChange = await loadDiskProjection(changeId, ctx.deadline);

    // Leg B: Temporal enrichment-only. Lowered per-member cap (1500ms) plus
    // the aggregate deadline keeps a single slow member inside the request
    // budget. A timeout/unresponsive outcome degrades to the disk projection
    // with a typed advisory rather than throwing/hanging.
    try {
      const owner = getOwner();
      const handle = await getGuardedChangeHandle(input, changeId);
      const queryCtx = makeTemporalOperationContext(
        input.projectId,
        handle.workflowId,
        "query",
        "changeStateQuery",
        1_500,
      );
      const outcome = await runTemporalQuery(
        async () => owner.query(queryCtx, handle, changeStateQuery),
        { deadline: ctx.deadline, timeoutMs: 1_500 },
      );
      if (outcome.kind !== "complete") {
        throw new TemporalReadOutcomeError(outcome);
      }
      ctx.recordResponsiveMember();
      const state = outcome.value as ChangeWorkflowState;
      indexTasksFromState(state);
      return {
        success: true,
        data: setCachedChange(state),
        source: "workflow",
      };
    } catch (error) {
      // Routine reads are projection-only. Never start, signal, reseed, or
      // write recovery state from the read path. Degrade to the durable disk
      // projection when available; otherwise return a typed LoadResult.
      const failure = await classifyTemporalReadFailure(
        input,
        changeId,
        error,
        ctx.deadline,
      );

      if (failure.recoveryReason === "workflow_unresponsive") {
        ctx.recordUnresponsiveMember();
      }

      const recoveryReason: ProjectionRecoveryReason =
        failure.recoveryReason === "workflow_unresponsive" ||
        failure.recoveryReason === "poisoned_history" ||
        failure.recoveryReason === "missing_workflow"
          ? failure.recoveryReason
          : "missing_workflow";
      if (diskChange) {
        indexTasksFromChange(diskChange);
        return {
          success: true,
          data: withProjectionRecovery(diskChange, "disk", recoveryReason),
          source: "disk",
        };
      }

      // No durable projection to serve. Preserve hard deadline / transient
      // errors by rethrowing our own typed error; for fallback-classified
      // missing/poisoned workflows, surface as not_found instead of mutating.
      if (failure.errorClass !== "fallback") {
        throw error;
      }

      return {
        success: false,
        error: `No durable projection and workflow is ${failure.recoveryReason ?? "unreachable"} for change ${changeId}`,
        type: "not_found",
        degraded: failure,
      };
    }
  };

  const loadDiskTerminalProjection = async (
    changeId: string,
  ): Promise<Change | null> => {
    // rq-schemaErrorPropagation01 (issue #258 Defect 1): the disk read is
    // pulled OUT of the swallow try/catch below so schema errors can
    // propagate. The catch remains for genuine I/O / unreadable-state
    // failures (transient fs errors, ENOENT, permissions); those still fall
    // through to Temporal/missing-workflow logic. A schema_error is not
    // transient — it must surface verbatim, not be masked as a generic
    // "Failed to query Workflow" by the workflow round-trip that follows.
    let result;
    try {
      result = await legacy.changes.get(changeId);
    } catch {
      // Disk projection is only a terminal-state dominance check. Missing or
      // unreadable disk state falls through to Temporal/missing-workflow logic.
      return null;
    }
    if (isSchemaError(result)) {
      throw new Error(result.error);
    }
    // rq-terminalProjectionTruth01 / poison read-resilience: a terminal
    // change.json (archived OR closed) is disk-authoritative and MUST be
    // served without a live workflow round-trip. Archived previously relied
    // solely on loadArchiveBundleDominantProjection (bundle-present); when the
    // archive bundle is missing/raced, an archived change fell through to the
    // live query and could hit a poisoned/terminated workflow (TMPRL1100),
    // paying a wasteful query + describe() probe per candidate before the
    // fallback finally returned the same disk data. Short-circuiting both
    // terminal statuses here mirrors that fallback and keeps enumeration/status
    // reads fast even against poisoned terminal workflows.
    if (
      result.success &&
      result.data &&
      (result.data.status === "closed" || result.data.status === "archived")
    ) {
      // Mark the disk source so callers report source "disk" (matching the
      // prior catch→fallback path). This is terminal-projection dominance,
      // NOT a temporal_query_fallback recovery, so it does not carry the
      // _recovery reconciliation marker.
      return { ...result.data, _source: "disk" } as Change;
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
   *    (`getTemporalChange`) now returns the durable disk projection for
   *    missing workflows instead of re-seeding them; self-healing is only
   *    initiated by explicit mutation commands.
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
    contextOrDeadline:
      | TemporalReadContext
      | TemporalReadDeadline = createTemporalReadContext(),
    options?: {
      candidateLimit?: number;
      hydrationConcurrency?: number;
      sourceRanked?: boolean;
    },
  ): Promise<import("../store-types").ResolvedChangeList> => {
    const ctx =
      "abortController" in contextOrDeadline
        ? contextOrDeadline
        : createTemporalReadContext(
            contextOrDeadline ? contextOrDeadline.budgetMs : undefined,
          );
    // If the caller supplied a plain deadline, align the context's absolute
    // deadline so the shared request budget is honored.
    if (contextOrDeadline && !("abortController" in contextOrDeadline)) {
      ctx.deadline = contextOrDeadline;
    }

    const deadline = ctx.deadline;
    const expired = (): boolean => isTemporalReadExpired(ctx);
    const wantsTerminalStatuses = Boolean(
      filter?.includeArchived || filter?.includeClosed,
    );

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
      source?:
        | "workflow"
        | "disk"
        | "archive"
        | "retired_projection"
        | "active_projection";
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

    let visibilityIds: string[] = [];
    const visibilityRecords: Array<{
      id: string;
      searchAttributes?: Record<string, unknown>;
    }> = [];
    try {
      const owner = getOwner();
      const listCtx = makeTemporalOperationContext(
        input.projectId,
        "visibility-list",
        "list",
        "visibilityList",
        5_000,
      );
      const projectPrefix = `${CHANGE_WORKFLOW_PREFIX}${input.projectId}/`;
      const query = buildVisibilityQuery({
        projectId: input.projectId,
        statuses: wantsTerminalStatuses ? null : undefined,
      });
      visibilityIds = await runTemporal(
        async () => {
          const ids: string[] = [];
          const outcome = await owner.list<{
            workflowId: string;
            searchAttributes?: Record<string, unknown>;
          }>(listCtx, query);
          if (outcome.kind !== "complete") {
            throw new TemporalListOutcomeError(outcome);
          }
          for (const wf of outcome.value) {
            const wfid = wf.workflowId;
            if (!wfid.startsWith(projectPrefix)) continue;
            const changeId = wfid.slice(projectPrefix.length);
            if (changeId.length === 0) continue;
            ids.push(changeId);
            visibilityRecords.push({
              id: changeId,
              searchAttributes: wf.searchAttributes,
            });
          }
          return ids;
        },
        { deadline: ctx.deadline, timeoutMs: 5_000 },
      );
    } catch (err) {
      const hitDeadline = err instanceof TemporalQueryTimeoutError || expired();
      logger.warn(
        `[P2.4] Visibility list ${
          hitDeadline ? "exceeded the aggregate read deadline" : "failed"
        }; falling back to legacy disk scan: ${err instanceof Error ? err.message : String(err)}`,
      );
      degradedSources.add("visibility");
      if (hitDeadline) markDeadline("visibility");
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

    const candidateLimit = options?.candidateLimit;
    let hydrationIds = changeIds;
    let sourceRankedIds: string[] | undefined;
    let sourceRankingMissingIds: string[] = [];

    if (
      options?.sourceRanked &&
      candidateLimit !== undefined &&
      !wantsTerminalStatuses
    ) {
      // Visibility already supplies source-backed descriptors for the IDs it
      // knows about. Do not re-read those IDs from change.json: only disk-only
      // candidates need disk projection metadata for source ranking.
      const visibleIdSet = new Set(visibilityIds);
      const diskOnlyIds = diskIds.filter((id) => !visibleIdSet.has(id));

      // Prefer the durable summary index, whose last_activity_at is the same
      // source-backed recency signal used by the projection. listSummaryChanges
      // reads pointer/shard JSON, not change.json, so it can orient an entire
      // indexed disk corpus without violating the bounded hydration budget.
      const summaryCandidates: SourceRankedCandidate[] = [];
      const indexedDiskIds = new Set<string>();
      try {
        const summaryResult = await raceWithTemporalDeadline(
          listSummaryChanges({
            changesDir: legacy.paths.changes,
            summariesDir: legacy.paths.summariesDir,
          }),
          deadline,
        );
        if (summaryResult.kind === "ok") {
          const diskOnlySet = new Set(diskOnlyIds);
          for (const summary of summaryResult.summaries) {
            if (!diskOnlySet.has(summary.id)) continue;
            indexedDiskIds.add(summary.id);
            summaryCandidates.push({
              id: summary.id,
              source: "disk",
              lastSignalAt: summary.last_activity_at,
              createdAt: summary.created_at,
            });
          }
        } else {
          degradedSources.add("active_disk");
        }
      } catch (err) {
        const hitDeadline =
          err instanceof TemporalQueryTimeoutError || expired();
        degradedSources.add("active_disk");
        if (hitDeadline) markDeadline("active_disk");
      }

      // Unindexed disk projections have no source-backed ordering metadata.
      // Hydrate at most candidateLimit of them as a bounded fallback, and
      // classify the remainder as omitted rather than claiming global
      // completeness. This preserves exact ranking whenever the summary index
      // covers the disk-only corpus, while making the incomplete case visible.
      const unindexedDiskIds = diskOnlyIds.filter(
        (id) => !indexedDiskIds.has(id),
      );
      const fallbackDiskIds = unindexedDiskIds.slice(0, candidateLimit);
      for (const id of unindexedDiskIds.slice(candidateLimit)) {
        candidateResolutions.push({
          id,
          terminal: false,
          omitted: true,
          omissionReason: "bounded",
        });
      }

      const fallbackDiskCandidates = await mapWithConcurrency(
        fallbackDiskIds,
        4,
        async (id): Promise<SourceRankedCandidate> => {
          if (expired()) return { id, source: "disk" };
          try {
            const readResult = await raceWithTemporalDeadline(
              readBoundedProjectionDocument(
                join(legacy.paths.changes, id, "change.json"),
              ),
              deadline,
            );
            if (readResult.kind !== "ok") {
              return { id, source: "disk" };
            }
            const parsed = JSON.parse(readResult.content) as Record<
              string,
              unknown
            >;
            return {
              id,
              source: "disk",
              lastSignalAt:
                typeof parsed.lastSignalAt === "string"
                  ? parsed.lastSignalAt
                  : undefined,
              createdAt:
                typeof parsed.created_at === "string"
                  ? parsed.created_at
                  : undefined,
            };
          } catch {
            return { id, source: "disk" };
          }
        },
      );
      const diskCandidates = [...summaryCandidates, ...fallbackDiskCandidates];
      try {
        const ranked = await raceWithTemporalDeadline(
          listSourceRankedCandidates(getOwner(), {
            projectId: input.projectId,
            statuses: undefined,
            limit: candidateLimit,
            diskCandidates,
            visibilityRecords,
          }),
          deadline,
        );
        hydrationIds = ranked.admitted.map((candidate) => candidate.id);
        sourceRankedIds = [...hydrationIds];
        sourceRankingMissingIds = ranked.missingTimestampIds;
        for (const candidate of ranked.omittedCandidates) {
          candidateResolutions.push({
            id: candidate.id,
            terminal: false,
            omitted: true,
            omissionReason: "bounded",
          });
        }
      } catch (err) {
        const hitDeadline =
          err instanceof TemporalQueryTimeoutError || expired();
        degradedSources.add("visibility");
        if (hitDeadline) markDeadline("visibility");
        hydrationIds = [];
        for (const id of diskIds) {
          candidateResolutions.push({
            id,
            terminal: false,
            omitted: true,
            omissionReason: hitDeadline ? "deadline" : "bounded",
          });
        }
      }
    } else if (
      candidateLimit !== undefined &&
      changeIds.length > candidateLimit
    ) {
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

      // bl-HiZJbUuy / disk-authoritative active reads: resolve each NON-archive
      // candidate from its durable on-disk change.json projection BEFORE any
      // per-workflow Temporal query. The disk projection is the eventually-
      // consistent read model the change workflow writes on every signal;
      // enumeration (list/status/wip_state) tolerates its lag, and reading it
      // first eliminates the per-workflow query N+1 that saturates the single
      // project worker under multi-session load (94 workflows × cold replay >
      // the 8s aggregate deadline). Mutation preconditions still call
      // getTemporalChange/get directly (Temporal-fresh) — this disk-first
      // reorder is scoped to the read-only listResolvedChanges path. A disk
      // miss (brand-new change not yet projected, or a Temporal/memo-only
      // entry) falls through to the getTemporalChange hydration below.
      if (!isArchiveCandidate && !expired()) {
        try {
          const diskResult = await raceWithTemporalDeadline(
            legacy.changes.get(changeId),
            deadline,
          );
          if (isSchemaError(diskResult)) {
            throw new Error(diskResult.error);
          }
          if (diskResult.success && diskResult.data) {
            const terminalOnDisk =
              diskResult.data.status === "archived" ||
              diskResult.data.status === "closed";
            // Layer A1 terminal override: a non-terminal disk status with a
            // present archive bundle IS archived (the bundle is durable truth).
            if (
              !terminalOnDisk &&
              (await raceWithTemporalDeadline(
                checkArchiveBundle(changeId),
                deadline,
              ))
            ) {
              const archived = {
                ...diskResult.data,
                status: "archived" as const,
              };
              indexTasksFromChange(archived);
              return {
                change: archived,
                resolution: {
                  id: changeId,
                  terminal: true,
                  source: "archive",
                  omitted: false,
                },
              };
            }
            indexTasksFromChange(diskResult.data);
            return {
              change: diskResult.data,
              resolution: {
                id: changeId,
                terminal: terminalOnDisk,
                source: "disk",
                omitted: false,
              },
            };
          }
        } catch {
          // Disk miss / unreadable — fall through to the getTemporalChange
          // hydration below (covers Temporal/memo-only and cache-warm cases).
        }
      }

      // If the disk-first read exhausted the aggregate budget, do NOT begin a
      // workflow query: getTemporalChange would immediately reject as expired
      // and, racing an already-expired deadline, orphan its rejection. Record
      // typed incompleteness and stop (mirrors the post-query expiry guard).
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
          getTemporalChange(changeId, { context: ctx }),
          deadline,
        );
        if (isSchemaError(result)) {
          throw new Error(result.error);
        }
        if (result.success && result.data) {
          return {
            change: result.data,
            resolution: {
              id: changeId,
              terminal:
                result.data.status === "archived" ||
                result.data.status === "closed",
              // getTemporalChange is a workflow/preflight helper, but the
              // public LoadResult union also admits read_model provenance.
              // Terminal reconciliation treats a durable projection as disk.
              source: result.source === "read_model" ? "disk" : result.source,
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
        if (isSchemaError(result)) {
          throw new Error(result.error);
        }
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
            if (isSchemaError(archiveLoad)) {
              throw new Error(archiveLoad.error);
            }
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
    if (sourceRankingMissingIds.length > 0) {
      warnings.push({
        code: "SOURCE_RANKING_DEGRADED",
        source: "visibility",
        message: `${sourceRankingMissingIds.length} candidate(s) lacked source-backed ranking timestamps; orientation is degraded.`,
        omittedCount: sourceRankingMissingIds.length,
        omittedIds: sourceRankingMissingIds.slice(0, 20),
      });
    }

    // Active/default path: no terminal degraded metadata (preserved
    // compatibility), but deadline and bound degradation always surface.
    if (!wantsTerminalStatuses) {
      if (warnings.length === 0) {
        return {
          changes: resolvedChanges,
          ...(sourceRankedIds ? { rankedIds: sourceRankedIds } : {}),
        };
      }
      return {
        changes: resolvedChanges,
        ...(sourceRankedIds ? { rankedIds: sourceRankedIds } : {}),
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
      ...(sourceRankedIds ? { rankedIds: sourceRankedIds } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(terminalResolutions.length > 0 ||
      deadlineExceeded ||
      boundedOmissions.length > 0
        ? { hydrationStats }
        : {}),
    };
  };

  const buildTemporalStatus = async (
    options?: import("../store-types").StatusReadOptions,
  ): Promise<ProjectStatus> => {
    // Status is a routine read: use immutable summary pointers rather than
    // Visibility enumeration or per-change workflow hydration.
    const specsResult = await listSpecsFilesystem({
      specsDir: legacy.paths.specs,
    });
    const specCapabilities = specsResult.ok ? specsResult.specs : [];

    // Source-ranked health orientation: rank globally from Visibility + disk
    // before hydrating only the bounded top-N. This prevents the old path
    // from hydrating every candidate and then slicing afterwards.
    if (options?.sourceRanked) {
      const rawLimit = options.recentLimit ?? 10;
      if (!Number.isInteger(rawLimit) || rawLimit <= 0) {
        throw new Error(
          `sourceRanked status requires a positive integer recentLimit; received ${String(rawLimit)}`,
        );
      }
      const candidateLimit = Math.min(rawLimit, 10);
      const resolved = await listResolvedChanges(
        { includeArchived: false, includeClosed: false },
        options.deadline ?? createTemporalReadContext(),
        { candidateLimit, sourceRanked: true },
      );

      const changesById = new Map(
        resolved.changes.map((change) => [change.id, change]),
      );
      const rankedIds = resolved.rankedIds ?? [];
      const now = new Date();
      const recent = rankedIds
        .filter((id) => changesById.has(id))
        .map((id) => {
          const change = changesById.get(id)!;
          const completedTasks =
            change.tasks?.filter((task) => task.status === "done").length ?? 0;
          const taskCount = change.tasks?.length ?? 0;
          const lastActivityAt =
            (change as { lastSignalAt?: string }).lastSignalAt ??
            change.created_at;
          return {
            id: change.id,
            title: change.title,
            status: change.status,
            completedTasks,
            taskCount,
            lastActivityAt,
            minutesSinceActivity: Math.max(
              0,
              Math.floor(
                (now.getTime() - new Date(lastActivityAt).getTime()) / 60_000,
              ),
            ),
          };
        });

      const byStatus: Record<ChangeStatus, number> = {
        draft: 0,
        archived: 0,
        closed: 0,
      };
      for (const change of resolved.changes) {
        byStatus[change.status] = (byStatus[change.status] ?? 0) + 1;
      }

      const warnings = resolved.warnings ?? [];
      const hydrationStats = resolved.hydrationStats ?? {};

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
        resolvedChanges: new Map(),
        ...(warnings.length > 0 ? { warnings } : {}),
        ...(Object.keys(hydrationStats).length > 0 ? { hydrationStats } : {}),
      };
    }

    // Summary shards carry lifecycle status, so counts do not require deep
    // hydration of the full change corpus. The caller-provided recent limit
    // is applied by listSummary before candidate hydration.
    const summary = await changeOps.listSummary!({
      sort: "recency",
      ...(options?.recentLimit !== undefined
        ? { limit: options.recentLimit }
        : {}),
      ...(options?.deadline ? { deadline: options.deadline } : {}),
    });
    const {
      changes,
      warnings: summaryWarnings,
      hydrationStats,
      boundedOmittedIds,
    } = summary;
    const now = new Date();
    const byStatus: Record<ChangeStatus, number> = summary.statusCounts ?? {
      draft: 0,
      archived: 0,
      closed: 0,
    };

    const sortedRecent = changes
      .filter(
        (change) => change.status !== "archived" && change.status !== "closed",
      )
      .map((change) => ({
        id: change.id,
        title: change.title,
        status: change.status,
        completedTasks: change.completedTasks,
        taskCount: change.taskCount,
        lastActivityAt: change.lastActivityAt,
        minutesSinceActivity: Math.max(
          0,
          Math.floor(
            (now.getTime() - new Date(change.lastActivityAt).getTime()) /
              60_000,
          ),
        ),
      }))
      .sort((a, b) => {
        const cmp = b.lastActivityAt.localeCompare(a.lastActivityAt);
        return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
      });

    const recent = sortedRecent;

    const warnings: import("../../types").TerminalWarning[] = [
      ...(summaryWarnings ?? []),
    ];
    let boundedOmitted = 0;
    if (
      options?.recentLimit !== undefined &&
      boundedOmittedIds &&
      boundedOmittedIds.length > 0
    ) {
      boundedOmitted = boundedOmittedIds.length;
      warnings.push({
        code: "SOURCE_BOUND_EXCEEDED",
        source: "active_disk",
        message: `Read bound (${options.recentLimit} candidate(s)) limited recent change hydration; ${boundedOmitted} recent candidate(s) were omitted while lifecycle counts remained sourced from summary shards.`,
        omittedCount: boundedOmitted,
        omittedIds: boundedOmittedIds.slice(0, 20),
      });
    }

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
      // Summary-only routine reads intentionally do not hydrate full changes.
      resolvedChanges: new Map(),
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(hydrationStats || boundedOmitted > 0
        ? {
            hydrationStats: {
              ...hydrationStats,
              ...(boundedOmitted > 0 ? { boundedOmitted } : {}),
            },
          }
        : {}),
    };
  };

  // P2.2: activity-backed specs surface. Reads disk via listSpecsFilesystem
  // and readSpecFilesystem instead of routing through legacy.specs.* (which
  // hit disk content search). search/save still delegate to legacy until the spec
  // FTS replacement (P2.3) and write path (future task) land.
  const buildSpecsSurface = (): Store["specs"] => ({
    list: async (filter) => {
      const listing = await listSpecsFilesystem({
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
   * Helper: load a single spec via readSpecFilesystem + Zod validation.
   * Mirrors `loadSpec`'s LoadResult contract so it slots into Store.specs.get
   * without callers noticing the underlying source change.
   */
  const loadSpecViaActivity = async (
    capability: string,
  ): Promise<LoadResult<Spec | null>> => {
    const result = await readSpecFilesystem({
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
    markLoadedDiskProjection,
    buildSummary,
    setCachedChange,
    invalidateChange,
    updateOverlay,
    emitChangeSummarySignal,
    persistStateToDisk,
    persistStateToDiskDurable,
    persistAndRefreshDurable,
    dualWriteAfterMutation,
    getTemporalOwner: getOwner,
    resolveStateOrQuery,
    indexTasksFromState,
    resolveChangeId,
    readChangeSnapshot: readProjectionSnapshot,
    getTemporalChange,
    listResolvedChanges,
  };
  const changeOps = createChangeOps(deps);

  const store: Store = {
    ...legacy,
    hasLoadedDiskProjection: () => loadedDiskProjectionIds.size > 0,
    specs: buildSpecsSurface(),
    changes: changeOps,
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
