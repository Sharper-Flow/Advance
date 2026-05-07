import type { Store } from "../store-types";
import type { Task, TddReclassification } from "../../types";
import {
  taskAddedSignal,
  taskUpdatedSignal,
  taskCancelledSignal,
  changeTasksQuery,
  changeTaskQuery,
  changeStateQuery,
} from "../../temporal/messages";
import { getReadyTasksFromChangeState } from "../../temporal/change-state";
import {
  runTemporal,
  runTemporalQuery,
  getGuardedChangeHandle,
  type StoreDeps,
} from "./shared";

export function createTaskOps(deps: StoreDeps): Store["tasks"] {
  const {
    input,
    legacy,
    taskChangeIndex,
    resolveChangeId,
    invalidateChange,
    dualWriteAfterMutation,
    indexTasksFromState,
  } = deps;

  return {
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
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as import("../../temporal/contracts").ChangeWorkflowState;
      indexTasksFromState(state);
      return getReadyTasksFromChangeState(state);
    },
    update: async (
      taskId,
      status,
      notes,
      implementationSummary,
      errorRecovery,
      touchedFiles,
    ) => {
      const changeId = await resolveChangeId(taskId);
      if (!changeId) return null;
      invalidateChange(changeId);
      await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).signal(
          taskUpdatedSignal,
          {
            taskId,
            partial: {
              status: status as Task["status"],
              notes,
              implementationSummary,
              errorRecovery,
              touchedFiles,
            },
            updatedAt: new Date().toISOString(),
          },
        ),
      );
      const state = (await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as import("../../temporal/contracts").ChangeWorkflowState;
      const task = state.tasks.find((t) => t.id === taskId) ?? null;
      await dualWriteAfterMutation(changeId);
      return task;
    },
    add: async (changeId, content, options) => {
      invalidateChange(changeId);
      const now = new Date().toISOString();
      const tempId = `tmp-${Date.now()}`;
      await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).signal(
          taskAddedSignal,
          {
            task: {
              id: tempId,
              title: content,
              type: options?.type ?? "code",
              section: options?.section,
              status: "pending",
              priority: 0,
              created_at: now,
              deps: options?.blockedBy
                ? options.blockedBy.map((target) => ({
                    type: "blocked_by" as const,
                    target,
                  }))
                : [],
              metadata: options?.metadata,
            },
            addedAt: now,
          },
        ),
      );
      const state = (await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as import("../../temporal/contracts").ChangeWorkflowState;
      const created = state.tasks[state.tasks.length - 1] ?? null;
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
    cancel: async (taskId, cancellation) => {
      const changeId = await resolveChangeId(taskId);
      if (!changeId) return null;
      invalidateChange(changeId);
      await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).signal(
          taskCancelledSignal,
          {
            taskId,
            approvalEvidence: cancellation.approval_evidence ?? "cancelled",
            reason: cancellation.reason ?? "cancelled",
            cancelledAt: new Date().toISOString(),
          },
        ),
      );
      const state = (await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as import("../../temporal/contracts").ChangeWorkflowState;
      const task = state.tasks.find((t) => t.id === taskId) ?? null;
      await dualWriteAfterMutation(changeId);
      return task;
    },
    reclassifyTdd: async (taskId, reclassification: TddReclassification) => {
      const changeId = await resolveChangeId(taskId);
      if (!changeId) return null;
      invalidateChange(changeId);
      await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).signal(
          taskUpdatedSignal,
          {
            taskId,
            partial: {
              metadata: {
                tdd_intent: reclassification.to_intent,
              },
            },
            updatedAt: new Date().toISOString(),
          },
        ),
      );
      const state = (await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as import("../../temporal/contracts").ChangeWorkflowState;
      const task = state.tasks.find((t) => t.id === taskId) ?? null;
      await dualWriteAfterMutation(changeId);
      return task;
    },
  };
}
