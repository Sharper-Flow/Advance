import type { Store } from "../store-types";
import type { Task, TddReclassification } from "../../types";
import {
  taskAddedSignal,
  taskUpdatedSignal,
  taskCancelledSignal,
} from "../../temporal/messages";
import { getReadyTasksFromChangeState } from "../../temporal/change-state";
import { filterProjectionTasks } from "./read-model";
import {
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
  const {
    legacy,
    taskChangeIndex,
    resolveChangeId,
    invalidateChange,
    readChangeSnapshot,
  } = deps;

  return {
    ...legacy.tasks,
    list: async (changeId: string, status?: string, filter?: string) => {
      const snapshot = await readChangeSnapshot(changeId);
      const tasks = snapshot.found
        ? filterProjectionTasks(snapshot.snapshot.tasks ?? [], status, filter)
        : [];
      for (const task of tasks) {
        taskChangeIndex.set(task.id, changeId);
      }
      return tasks;
    },
    ready: async (changeId: string) => {
      const snapshot = await readChangeSnapshot(changeId);
      if (!snapshot.found) return { ready: [], blocked: [] };
      const tasks = snapshot.snapshot.tasks ?? [];
      for (const task of tasks) {
        taskChangeIndex.set(task.id, changeId);
      }
      return getReadyTasksFromChangeState({
        tasks,
      } as import("../../temporal/contracts").ChangeWorkflowState);
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
      const snapshot = await readChangeSnapshot(changeId);
      if (!snapshot.found) return null;
      for (const task of snapshot.snapshot.tasks ?? []) {
        taskChangeIndex.set(task.id, changeId);
      }
      return (
        snapshot.snapshot.tasks?.find((task) => task.id === taskId) ?? null
      );
    },
    show: async (taskId) => {
      const changeId = await resolveChangeId(taskId);
      if (!changeId) return null;
      const snapshot = await readChangeSnapshot(changeId);
      if (!snapshot.found) return null;
      for (const candidate of snapshot.snapshot.tasks ?? []) {
        taskChangeIndex.set(candidate.id, changeId);
      }
      const task = snapshot.snapshot.tasks?.find(
        (candidate) => candidate.id === taskId,
      );
      if (!task) return null;
      return { task, changeId };
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
