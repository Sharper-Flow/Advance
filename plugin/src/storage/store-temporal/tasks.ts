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
  runTemporalQuery,
  getGuardedChangeHandle,
  changeCommand,
  fallbackOperationId,
  buildSummaryCommitProjection,
  type ChangeCommandOutcome,
  type StoreDeps,
} from "./shared";
import {
  computeHostCommandPayloadHash,
  sha256Hex,
} from "../../utils/command-payload-hash";

// Command outcomes surfaced by the changeCommand primitive:
// accepted, idempotent_replay, rejected, projection_failure,
// operator_required, outcome_unknown_readback_unavailable.

function buildTaskCommandIdentity(
  commandKind: string,
  payload: Record<string, unknown>,
  callerOperationId?: string,
): { operationId: string; payloadHash: string } {
  const payloadHash = computeHostCommandPayloadHash(payload);
  const operationId =
    callerOperationId ?? fallbackOperationId(commandKind, payload);
  return { operationId, payloadHash };
}

function unwrapCommandOutcome(
  outcome: ChangeCommandOutcome,
  context: string,
): import("../../temporal/contracts").ChangeWorkflowState {
  if (outcome.kind === "accepted" || outcome.kind === "idempotent_replay") {
    return outcome.state;
  }
  throw new Error(`${context}: ${outcome.kind} — ${outcome.reason}`);
}

export function createTaskOps(deps: StoreDeps): Store["tasks"] {
  const { input, legacy, taskChangeIndex, resolveChangeId, invalidateChange } =
    deps;

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
      for (const task of state.tasks ?? []) {
        taskChangeIndex.set(task.id, changeId);
      }
      return getReadyTasksFromChangeState(state);
    },
    update: async (
      taskId,
      status,
      notes,
      implementationSummary,
      errorRecovery,
      touchedFiles,
      options?: { operationId?: string },
    ) => {
      const changeId = await resolveChangeId(taskId);
      if (!changeId) return null;
      invalidateChange(changeId);
      const commandKind = "taskUpdated";
      const payload = {
        taskId,
        partial: {
          status: status as Task["status"],
          notes,
          implementationSummary,
          errorRecovery,
          touchedFiles,
        },
        updatedAt: new Date().toISOString(),
      };
      const { operationId, payloadHash } = buildTaskCommandIdentity(
        commandKind,
        payload,
        options?.operationId,
      );
      const outcome = await changeCommand({
        deps,
        changeId,
        operationId,
        commandKind,
        payloadHash,
        signal: taskUpdatedSignal,
        signalArgs: [
          {
            ...payload,
            operation_id: operationId,
            command_kind: commandKind,
            payload_hash: payloadHash,
          },
        ],
        commitProjection: buildSummaryCommitProjection(
          legacy,
          changeId,
          operationId,
          payloadHash,
          commandKind,
        ),
      });
      const state = unwrapCommandOutcome(
        outcome,
        `tasks.update(${changeId}, ${taskId})`,
      );
      const task = state.tasks.find((t) => t.id === taskId) ?? null;
      return task;
    },
    add: async (
      changeId,
      content,
      options,
      commandOptions?: { operationId?: string },
    ) => {
      invalidateChange(changeId);
      const commandKind = "taskAdded";
      const now = new Date().toISOString();
      const operationIdHint =
        commandOptions?.operationId ??
        fallbackOperationId(commandKind, { changeId, content, options });
      // The task id is adapter-generated transport state. Tie it to the
      // operation identity so a same-host retry has the same ledger hash.
      const tempId = `tmp-${sha256Hex(operationIdHint).slice(0, 16)}`;
      const payload = {
        task: {
          id: tempId,
          title: content,
          type: options?.type ?? "code",
          section: options?.section,
          status: "pending" as const,
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
      };
      const { operationId, payloadHash } = buildTaskCommandIdentity(
        commandKind,
        payload,
        operationIdHint,
      );
      const outcome = await changeCommand({
        deps,
        changeId,
        operationId,
        commandKind,
        payloadHash,
        signal: taskAddedSignal,
        signalArgs: [
          {
            ...payload,
            operation_id: operationId,
            command_kind: commandKind,
            payload_hash: payloadHash,
          },
        ],
        commitProjection: buildSummaryCommitProjection(
          legacy,
          changeId,
          operationId,
          payloadHash,
          commandKind,
        ),
      });
      const state = unwrapCommandOutcome(outcome, `tasks.add(${changeId})`);
      const created = state.tasks[state.tasks.length - 1] ?? null;
      if (created && typeof created === "object" && "id" in created) {
        taskChangeIndex.set((created as { id: string }).id, changeId);
      }
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
    cancel: async (
      taskId,
      cancellation,
      options?: { operationId?: string },
    ) => {
      const changeId = await resolveChangeId(taskId);
      if (!changeId) return null;
      invalidateChange(changeId);
      const commandKind = "taskCancelled";
      const payload = {
        taskId,
        approvalEvidence: cancellation.approval_evidence ?? "cancelled",
        reason: cancellation.reason ?? "cancelled",
        cancelledAt: new Date().toISOString(),
      };
      const { operationId, payloadHash } = buildTaskCommandIdentity(
        commandKind,
        payload,
        options?.operationId,
      );
      const outcome = await changeCommand({
        deps,
        changeId,
        operationId,
        commandKind,
        payloadHash,
        signal: taskCancelledSignal,
        signalArgs: [
          {
            ...payload,
            operation_id: operationId,
            command_kind: commandKind,
            payload_hash: payloadHash,
          },
        ],
        commitProjection: buildSummaryCommitProjection(
          legacy,
          changeId,
          operationId,
          payloadHash,
          commandKind,
        ),
      });
      const state = unwrapCommandOutcome(
        outcome,
        `tasks.cancel(${changeId}, ${taskId})`,
      );
      const task = state.tasks.find((t) => t.id === taskId) ?? null;
      return task;
    },
    reclassifyTdd: async (
      taskId,
      reclassification: TddReclassification,
      options?: { operationId?: string },
    ) => {
      const changeId = await resolveChangeId(taskId);
      if (!changeId) return null;
      invalidateChange(changeId);
      const commandKind = "taskUpdated";
      const payload = {
        taskId,
        partial: {
          metadata: {
            tdd_intent: reclassification.to_intent,
          },
        },
        updatedAt: new Date().toISOString(),
      };
      const { operationId, payloadHash } = buildTaskCommandIdentity(
        commandKind,
        payload,
        options?.operationId,
      );
      const outcome = await changeCommand({
        deps,
        changeId,
        operationId,
        commandKind,
        payloadHash,
        signal: taskUpdatedSignal,
        signalArgs: [
          {
            ...payload,
            operation_id: operationId,
            command_kind: commandKind,
            payload_hash: payloadHash,
          },
        ],
        commitProjection: buildSummaryCommitProjection(
          legacy,
          changeId,
          operationId,
          payloadHash,
          commandKind,
        ),
      });
      const state = unwrapCommandOutcome(
        outcome,
        `tasks.reclassifyTdd(${changeId}, ${taskId})`,
      );
      const task = state.tasks.find((t) => t.id === taskId) ?? null;
      return task;
    },
  };
}
