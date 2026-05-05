import type { Store } from "../store-types";
import type { Task, TddReclassification } from "../../types";
import {
  addTaskUpdate,
  updateTaskUpdate,
  cancelTaskUpdate,
  reclassifyTaskTddUpdate,
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
                touchedFiles,
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
  };
}
