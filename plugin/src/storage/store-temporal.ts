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
import { buildChangeWorkflowId } from "../temporal/client";
import {
  addChangeWisdomUpdate,
  addTaskUpdate,
  cancelTaskUpdate,
  changeStateQuery,
  changeTaskQuery,
  changeTasksQuery,
  closeChangeUpdate,
  completeGateUpdate,
  recordTaskEvidenceUpdate,
  reclassifyTaskTddUpdate,
  reopenFromGateUpdate,
  setTaskPhaseUpdate,
  updateTaskUpdate,
} from "../temporal/messages";
import type { ChangeWorkflowState } from "../temporal/contracts";
import { getReadyTasksFromChangeState } from "../temporal/change-state";
import { withTemporalRetry } from "../temporal/retry-wrapper";
import { listChangeDirs } from "./json";
import { buildChangeRecency } from "./store-types";
import type { ChangeStatus, ProjectStatus } from "../types";
import {
  ChangeSummaryMemo,
  asGateStatus,
  type ChangeSummary,
} from "./store-temporal-memo";

// Collect the error message and every cause-chain message so we can match
// against the *underlying* gRPC / Temporal error even when it is wrapped
// inside a generic ServiceError by the SDK.
function collectErrorMessages(err: unknown): string[] {
  const messages: string[] = [];
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      messages.push(current.message ?? "");
      // Also collect constructor.name / .name for class-based matching
      messages.push(current.constructor.name ?? current.name ?? "");
      current = (current as Error & { cause?: unknown }).cause;
    } else {
      messages.push(String(current ?? ""));
      break;
    }
  }
  return messages;
}

// Errors that should legitimately fall back to the legacy backend. Anything
// else (NonDeterministicWorkflowError, update validation failure, connection
// errors, etc.) is a real problem and should propagate.
function isExpectedFallbackError(err: unknown): boolean {
  const messages = collectErrorMessages(err);
  const combined = messages.join(" | ");
  return (
    /WorkflowNotFound|WorkflowExecutionNotFound|Workflow execution not found|workflow not found|not[_ ]found|NOT_FOUND/i.test(
      combined,
    ) || /QueryNotRegistered|UpdateNotRegistered|not registered/i.test(combined)
  );
}

interface WorkflowHandleLike {
  query: (definition: unknown, ...args: unknown[]) => Promise<unknown>;
  executeUpdate: (
    definition: unknown,
    options: { args?: unknown[] },
  ) => Promise<unknown>;
}

interface TemporalHandleClient {
  workflow: { getHandle: (workflowId: string) => WorkflowHandleLike };
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
      gateProgress: {
        proposal: state.gates?.proposal?.status ?? "pending",
        discovery: state.gates?.discovery?.status ?? "pending",
        design: state.gates?.design?.status ?? "pending",
        planning: state.gates?.planning?.status ?? "pending",
        execution: state.gates?.execution?.status ?? "pending",
        acceptance: state.gates?.acceptance?.status ?? "pending",
        release: state.gates?.release?.status ?? "pending",
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
    const mapped = mapTemporalChangeStateToChange(state);
    changeCache.set(state.changeId, mapped);
    memo.set(state.changeId, buildSummary(state));
    return mapped;
  };

  const invalidateChange = (changeId: string): void => {
    changeCache.delete(changeId);
    memo.invalidate(changeId);
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

  const getTemporalOrLegacyChange = async (
    changeId: string,
  ): Promise<ReturnType<Store["changes"]["get"]>> => {
    const cached = changeCache.get(changeId);
    if (cached) {
      return { success: true, data: cached };
    }
    try {
      const handle = getChangeHandle(input, changeId);
      const state = (await runTemporal(() =>
        handle.query(changeStateQuery),
      )) as ChangeWorkflowState;
      indexTasksFromState(state);
      return { success: true, data: setCachedChange(state) };
    } catch (err) {
      if (!isExpectedFallbackError(err)) throw err;
      return legacy.changes.get(changeId);
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

    // Cold start — fall back to O(N) fan-out to populate the Memo
    const changeIds = await listChangeDirs(legacy.paths.changes);
    const loaded = await Promise.all(
      changeIds.map(async (changeId) => ({
        changeId,
        result: await getTemporalOrLegacyChange(changeId),
      })),
    );

    const changes: Change[] = [];
    for (const entry of loaded) {
      if (entry.result.success && entry.result.data) {
        changes.push(entry.result.data);
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

  return {
    ...legacy,
    changes: {
      ...legacy.changes,
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
        return getTemporalOrLegacyChange(changeId);
      },
      close: async (changeId: string, closure: ChangeClosure) => {
        try {
          invalidateChange(changeId);
          const handle = getChangeHandle(input, changeId);
          await runTemporal(() =>
            handle.executeUpdate(closeChangeUpdate, { args: [closure] }),
          );
          const result = await runTemporal(() =>
            handle.query(changeStateQuery),
          );
          indexTasksFromState(result as ChangeWorkflowState);
          return setCachedChange(result as ChangeWorkflowState);
        } catch (err) {
          if (!isExpectedFallbackError(err)) throw err;
          return legacy.changes.close(changeId, closure);
        }
      },

      closeBatch: async (
        changeIds: string[],
        closure: ChangeClosure,
      ): Promise<BulkCloseResult> => {
        // Pre-validate: fail-all if any target is invalid or protected
        for (const id of changeIds) {
          const change = await getTemporalOrLegacyChange(id);
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
            await runTemporal(() =>
              handle.executeUpdate(closeChangeUpdate, { args: [closure] }),
            );
            const result = await runTemporal(() =>
              handle.query(changeStateQuery),
            );
            indexTasksFromState(result as ChangeWorkflowState);
            setCachedChange(result as ChangeWorkflowState);
            results.push({ changeId: id, success: true });
            closed++;
          } catch (err) {
            if (!isExpectedFallbackError(err)) {
              results.push({
                changeId: id,
                success: false,
                error: String(err),
              });
              continue;
            }
            try {
              await legacy.changes.close(id, closure);
              results.push({ changeId: id, success: true });
              closed++;
            } catch (e) {
              results.push({
                changeId: id,
                success: false,
                error: String(e),
              });
            }
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
    },
    tasks: {
      ...legacy.tasks,
      list: async (changeId: string, status?: string, filter?: string) => {
        try {
          const handle = getChangeHandle(input, changeId);
          const tasks = (await runTemporal(() =>
            handle.query(changeTasksQuery, status, filter),
          )) as Awaited<ReturnType<Store["tasks"]["list"]>>;
          for (const task of tasks ?? []) {
            taskChangeIndex.set(task.id, changeId);
          }
          return tasks;
        } catch (err) {
          if (!isExpectedFallbackError(err)) throw err;
          return legacy.tasks.list(changeId, status, filter);
        }
      },
      ready: async (changeId: string) => {
        try {
          const handle = getChangeHandle(input, changeId);
          const state = (await runTemporal(() =>
            handle.query(changeStateQuery),
          )) as ChangeWorkflowState;
          indexTasksFromState(state);
          return getReadyTasksFromChangeState(state);
        } catch (err) {
          if (!isExpectedFallbackError(err)) throw err;
          return legacy.tasks.ready(changeId);
        }
      },
      update: async (
        taskId,
        status,
        notes,
        implementationSummary,
        errorRecovery,
      ) => {
        try {
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
        } catch (err) {
          if (!isExpectedFallbackError(err)) throw err;
          return legacy.tasks.update(
            taskId,
            status,
            notes,
            implementationSummary,
            errorRecovery,
          );
        }
      },
      add: async (changeId, content, options) => {
        try {
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
        } catch (err) {
          if (!isExpectedFallbackError(err)) throw err;
          return legacy.tasks.add(changeId, content, options);
        }
      },
      get: async (taskId) => {
        try {
          const changeId = await resolveChangeId(taskId);
          if (!changeId) return null;
          const handle = getChangeHandle(input, changeId);
          return (await runTemporal(() =>
            handle.query(changeTaskQuery, taskId),
          )) as Awaited<ReturnType<Store["tasks"]["get"]>>;
        } catch (err) {
          if (!isExpectedFallbackError(err)) throw err;
          return legacy.tasks.get(taskId);
        }
      },
      show: async (taskId) => {
        try {
          const changeId = await resolveChangeId(taskId);
          if (!changeId) return null;
          const handle = getChangeHandle(input, changeId);
          const task = await runTemporal(() =>
            handle.query(changeTaskQuery, taskId),
          );
          if (!task) return null;
          return { task: task as Task, changeId };
        } catch (err) {
          if (!isExpectedFallbackError(err)) throw err;
          return legacy.tasks.show(taskId);
        }
      },
      recordEvidence: async (taskId, phase, evidence) => {
        try {
          const changeId = await resolveChangeId(taskId);
          if (!changeId) return null;
          invalidateChange(changeId);
          const handle = getChangeHandle(input, changeId);
          return (await runTemporal(() =>
            handle.executeUpdate(recordTaskEvidenceUpdate, {
              args: [taskId, phase, evidence],
            }),
          )) as Awaited<ReturnType<Store["tasks"]["recordEvidence"]>>;
        } catch (err) {
          if (!isExpectedFallbackError(err)) throw err;
          return legacy.tasks.recordEvidence(taskId, phase, evidence);
        }
      },
      setPhase: async (taskId, phase: TddPhase) => {
        try {
          const changeId = await resolveChangeId(taskId);
          if (!changeId) return null;
          invalidateChange(changeId);
          const handle = getChangeHandle(input, changeId);
          return (await runTemporal(() =>
            handle.executeUpdate(setTaskPhaseUpdate, {
              args: [taskId, phase],
            }),
          )) as Awaited<ReturnType<Store["tasks"]["setPhase"]>>;
        } catch (err) {
          if (!isExpectedFallbackError(err)) throw err;
          return legacy.tasks.setPhase(taskId, phase);
        }
      },
      cancel: async (taskId, cancellation) => {
        try {
          const changeId = await resolveChangeId(taskId);
          if (!changeId) return null;
          invalidateChange(changeId);
          const handle = getChangeHandle(input, changeId);
          return (await runTemporal(() =>
            handle.executeUpdate(cancelTaskUpdate, {
              args: [taskId, cancellation],
            }),
          )) as Awaited<ReturnType<Store["tasks"]["cancel"]>>;
        } catch (err) {
          if (!isExpectedFallbackError(err)) throw err;
          return legacy.tasks.cancel(taskId, cancellation);
        }
      },
      reclassifyTdd: async (taskId, reclassification: TddReclassification) => {
        try {
          const changeId = await resolveChangeId(taskId);
          if (!changeId) return null;
          invalidateChange(changeId);
          const handle = getChangeHandle(input, changeId);
          return (await runTemporal(() =>
            handle.executeUpdate(reclassifyTaskTddUpdate, {
              args: [taskId, reclassification],
            }),
          )) as Awaited<ReturnType<Store["tasks"]["reclassifyTdd"]>>;
        } catch (err) {
          if (!isExpectedFallbackError(err)) throw err;
          return legacy.tasks.reclassifyTdd(taskId, reclassification);
        }
      },
    },
    wisdom: {
      ...legacy.wisdom,
      add: async (changeId, type: WisdomType, content, sourceTask) => {
        try {
          invalidateChange(changeId);
          const handle = getChangeHandle(input, changeId);
          await runTemporal(() =>
            handle.executeUpdate(addChangeWisdomUpdate, {
              args: [type, content, sourceTask],
            }),
          );
          const state = (await runTemporal(() =>
            handle.query(changeStateQuery),
          )) as ChangeWorkflowState;
          setCachedChange(state);
          return (
            (state.wisdom[state.wisdom.length - 1] as
              | WisdomEntry
              | undefined) ??
            (await legacy.wisdom.add(changeId, type, content, sourceTask))
          );
        } catch (err) {
          if (!isExpectedFallbackError(err)) throw err;
          return legacy.wisdom.add(changeId, type, content, sourceTask);
        }
      },
      list: async (changeId: string) => {
        try {
          const handle = getChangeHandle(input, changeId);
          const state = (await runTemporal(() =>
            handle.query(changeStateQuery),
          )) as ChangeWorkflowState;
          return state.wisdom;
        } catch (err) {
          if (!isExpectedFallbackError(err)) throw err;
          return legacy.wisdom.list(changeId);
        }
      },
    },
    gates: {
      ...legacy.gates,
      get: async (changeId: string) => {
        try {
          const handle = getChangeHandle(input, changeId);
          const state = (await runTemporal(() =>
            handle.query(changeStateQuery),
          )) as ChangeWorkflowState;
          return state.gates;
        } catch (err) {
          if (!isExpectedFallbackError(err)) throw err;
          return legacy.gates.get(changeId);
        }
      },
      complete: async (changeId: string, gateId: GateId, notes?: string) => {
        try {
          invalidateChange(changeId);
          const handle = getChangeHandle(input, changeId);
          await runTemporal(() =>
            handle.executeUpdate(completeGateUpdate, {
              args: [gateId, notes, "agent"],
            }),
          );
        } catch (err) {
          if (!isExpectedFallbackError(err)) throw err;
          await legacy.gates.complete(changeId, gateId, notes);
        }
      },
      reopenFrom: async (
        changeId,
        fromGate,
        reason,
        scopeDelta,
        reopenedBy,
        approvalEvidence,
      ) => {
        try {
          invalidateChange(changeId);
          const handle = getChangeHandle(input, changeId);
          await runTemporal(() =>
            handle.executeUpdate(reopenFromGateUpdate, {
              args: [
                fromGate,
                reason,
                scopeDelta,
                approvalEvidence ?? reopenedBy,
              ],
            }),
          );
        } catch (err) {
          if (!isExpectedFallbackError(err)) throw err;
          await legacy.gates.reopenFrom(
            changeId,
            fromGate,
            reason,
            scopeDelta,
            reopenedBy,
            approvalEvidence,
          );
        }
      },
    },
    status: async () => {
      return buildTemporalStatus();
    },
  };
}
