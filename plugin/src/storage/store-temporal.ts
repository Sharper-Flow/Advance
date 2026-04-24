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
  changeTasksQuery,
  closeChangeUpdate,
  completeGateUpdate,
  projectStateQuery,
  recordTaskEvidenceUpdate,
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
import { listChangeDirs } from "./json";
import { buildChangeRecency } from "./store-types";
import type { ChangeStatus, ProjectStatus } from "../types";
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

async function runTemporal<T>(op: () => Promise<T>): Promise<T> {
  return withTemporalRetry(op);
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
    } catch {
      // Best-effort: signal failure must not block mutations
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
   */
  const resolveStateOrQuery = async (
    handle: WorkflowHandleLike,
    result: unknown,
  ): Promise<ChangeWorkflowState> => {
    if (result && typeof result === "object" && "changeId" in result) {
      return result as ChangeWorkflowState;
    }
    return (await runTemporal(() =>
      handle.query(changeStateQuery),
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
      await ensureChangeWorkflowStarted(client, {
        projectId: input.projectId,
        changeId: change.id,
        title: change.title,
        initializedAt: change.created_at,
        seedState: {
          status: change.status,
          tasks: change.tasks,
          wisdom: change.wisdom,
          gates: change.gates,
          reentry_history: change.reentry_history,
        },
      });
    } catch {
      // Re-seed itself failed — surface the original not-found to callers
      // rather than masking it with a seed error.
      return null;
    }
    try {
      const handle = getChangeHandle(input, changeId);
      const state = (await runTemporal(() =>
        handle.query(changeStateQuery),
      )) as ChangeWorkflowState;
      indexTasksFromState(state);
      return setCachedChange(state);
    } catch {
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
    const handle = getChangeHandle(input, changeId);
    try {
      const state = (await runTemporal(() =>
        handle.query(changeStateQuery),
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
  const listResolvedChanges = async (): Promise<Change[]> => {
    const memoAll = memo.getAll();
    if (memoAll.length > 0) {
      // Memo has data — convert summaries to the Change shape expected by callers.
      // Critical surfaces (get, task ops, gates) still use direct queries.
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

    // Cold start — fall back to O(N) fan-out to populate the Memo.
    // Each query is wrapped in try/catch so one missing/terminated workflow
    // doesn't abort the entire batch. Falls back to legacy JSON on failure.
    const changeIds = await listChangeDirs(legacy.paths.changes);
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
    const legacyStatus = await legacy.status();
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
      ...legacyStatus,
      changes: {
        active: recent.length,
        byStatus,
        recent,
      },
      recommendations: legacyStatus.recommendations.filter((rec) =>
        rec.startsWith("[doctor]"),
      ),
    };
  };

  const store: Store = {
    ...legacy,
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
        });
      },
      list: async (filter) => {
        const changes = await listResolvedChanges();
        let filtered = changes;

        if (filter?.status) {
          filtered = filtered.filter(
            (change) => change.status === filter.status,
          );
        }
        if (!filter?.includeArchived) {
          filtered = filtered.filter((change) => change.status !== "archived");
        }
        if (!filter?.includeClosed) {
          filtered = filtered.filter((change) => change.status !== "closed");
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
        const handle = getChangeHandle(input, changeId);
        const raw = await runTemporal(() =>
          handle.executeUpdate(closeChangeUpdate, { args: [closure] }),
        );
        const result = await resolveStateOrQuery(handle, raw);
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
            const handle = getChangeHandle(input, id);
            const raw = await runTemporal(() =>
              handle.executeUpdate(closeChangeUpdate, { args: [closure] }),
            );
            const result = await resolveStateOrQuery(handle, raw);
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
        const handle = getChangeHandle(input, changeId);
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
          await runTemporal(() =>
            handle.executeUpdate(updateArtifactMetadataUpdate, {
              args: [kind, { path, updatedAt: new Date().toISOString() }],
            }),
          );
        }
        return result;
      },
    },
    tasks: {
      ...legacy.tasks,
      list: async (changeId: string, status?: string, filter?: string) => {
        const handle = getChangeHandle(input, changeId);
        const tasks = (await runTemporal(() =>
          handle.query(changeTasksQuery, status, filter),
        )) as Awaited<ReturnType<Store["tasks"]["list"]>>;
        for (const task of tasks ?? []) {
          taskChangeIndex.set(task.id, changeId);
        }
        return tasks;
      },
      ready: async (changeId: string) => {
        const handle = getChangeHandle(input, changeId);
        const state = (await runTemporal(() =>
          handle.query(changeStateQuery),
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
        const handle = getChangeHandle(input, changeId);
        return (await runTemporal(() =>
          handle.executeUpdate(updateTaskUpdate, {
            args: [
              taskId,
              {
                status: status as Task["status"],
                notes,
                implementationSummary,
                errorRecovery,
              },
            ],
          }),
        )) as Awaited<ReturnType<Store["tasks"]["update"]>>;
      },
      add: async (changeId, content, options) => {
        invalidateChange(changeId);
        const handle = getChangeHandle(input, changeId);
        const created = (await runTemporal(() =>
          handle.executeUpdate(addTaskUpdate, {
            args: [
              {
                title: content,
                type: options?.type,
                section: options?.section,
                blockedBy: options?.blockedBy,
                metadata: options?.metadata,
              },
            ],
          }),
        )) as Awaited<ReturnType<Store["tasks"]["add"]>>;
        if (created && typeof created === "object" && "id" in created) {
          taskChangeIndex.set((created as { id: string }).id, changeId);
        }
        return created;
      },
      get: async (taskId) => {
        const changeId = await resolveChangeId(taskId);
        if (!changeId) return null;
        const handle = getChangeHandle(input, changeId);
        return (await runTemporal(() =>
          handle.query(changeTaskQuery, taskId),
        )) as Awaited<ReturnType<Store["tasks"]["get"]>>;
      },
      show: async (taskId) => {
        const changeId = await resolveChangeId(taskId);
        if (!changeId) return null;
        const handle = getChangeHandle(input, changeId);
        const task = await runTemporal(() =>
          handle.query(changeTaskQuery, taskId),
        );
        if (!task) return null;
        return { task: task as Task, changeId };
      },
      recordEvidence: async (taskId, phase, evidence) => {
        const changeId = await resolveChangeId(taskId);
        if (!changeId) return null;
        invalidateChange(changeId);
        const handle = getChangeHandle(input, changeId);
        return (await runTemporal(() =>
          handle.executeUpdate(recordTaskEvidenceUpdate, {
            args: [taskId, phase, evidence],
          }),
        )) as Awaited<ReturnType<Store["tasks"]["recordEvidence"]>>;
      },
      setPhase: async (taskId, phase: TddPhase) => {
        const changeId = await resolveChangeId(taskId);
        if (!changeId) return null;
        invalidateChange(changeId);
        const handle = getChangeHandle(input, changeId);
        return (await runTemporal(() =>
          handle.executeUpdate(setTaskPhaseUpdate, {
            args: [taskId, phase],
          }),
        )) as Awaited<ReturnType<Store["tasks"]["setPhase"]>>;
      },
      cancel: async (taskId, cancellation) => {
        const changeId = await resolveChangeId(taskId);
        if (!changeId) return null;
        invalidateChange(changeId);
        const handle = getChangeHandle(input, changeId);
        return (await runTemporal(() =>
          handle.executeUpdate(cancelTaskUpdate, {
            args: [taskId, cancellation],
          }),
        )) as Awaited<ReturnType<Store["tasks"]["cancel"]>>;
      },
      reclassifyTdd: async (taskId, reclassification: TddReclassification) => {
        const changeId = await resolveChangeId(taskId);
        if (!changeId) return null;
        invalidateChange(changeId);
        const handle = getChangeHandle(input, changeId);
        return (await runTemporal(() =>
          handle.executeUpdate(reclassifyTaskTddUpdate, {
            args: [taskId, reclassification],
          }),
        )) as Awaited<ReturnType<Store["tasks"]["reclassifyTdd"]>>;
      },
    },
    wisdom: {
      ...legacy.wisdom,
      add: async (changeId, type: WisdomType, content, sourceTask) => {
        invalidateChange(changeId);
        const handle = getChangeHandle(input, changeId);
        const raw = await runTemporal(() =>
          handle.executeUpdate(addChangeWisdomUpdate, {
            args: [type, content, sourceTask],
          }),
        );
        const state = await resolveStateOrQuery(handle, raw);
        setCachedChange(state);
        emitChangeSummarySignal(changeId, state);
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
        const handle = getChangeHandle(input, changeId);
        const state = (await runTemporal(() =>
          handle.query(changeStateQuery),
        )) as ChangeWorkflowState;
        return state.wisdom;
      },
    },
    gates: {
      ...legacy.gates,
      get: async (changeId: string) => {
        const handle = getChangeHandle(input, changeId);
        const state = (await runTemporal(() =>
          handle.query(changeStateQuery),
        )) as ChangeWorkflowState;
        return state.gates;
      },
      complete: async (changeId: string, gateId: GateId, notes?: string) => {
        invalidateChange(changeId);
        const handle = getChangeHandle(input, changeId);
        const raw = await runTemporal(() =>
          handle.executeUpdate(completeGateUpdate, {
            args: [gateId, notes, "agent"],
          }),
        );
        const state = await resolveStateOrQuery(handle, raw);
        setCachedChange(state);
        emitChangeSummarySignal(changeId, state);
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
        const handle = getChangeHandle(input, changeId);
        const raw = await runTemporal(() =>
          handle.executeUpdate(reopenFromGateUpdate, {
            args: [
              fromGate,
              reason,
              scopeDelta,
              approvalEvidence ?? reopenedBy,
            ],
          }),
        );
        const state = await resolveStateOrQuery(handle, raw);
        setCachedChange(state);
        emitChangeSummarySignal(changeId, state);
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
      const handle = getProjectHandleForInput(input);
      if (!handle) return;
      const pswState = (await runTemporal(() =>
        handle.query(projectStateQuery),
      )) as ProjectWorkflowState | null;
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
