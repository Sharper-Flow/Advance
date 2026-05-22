/**
 * Disk-projection recovery writers for poisoned-history fallback.
 *
 * These helpers write mutations directly to the disk projection through
 * `store.changes.save` when the Temporal workflow is poisoned and cannot
 * accept signals. Every recovery write must be authorized by an explicit
 * `recoveryMode: "poisoned_history"` (with evidence) or `compatibilityReason`
 * at the calling tool, and confirmed by `workflowHasPoisonedDescription`.
 *
 * The writers do NOT enforce that gate — callers are responsible for the
 * authorization check. The writers only ensure the disk write is atomic and
 * the in-memory cache is invalidated.
 */
import type { Store } from "../storage/store-types";
import type { Change, Gates } from "../types";
import { saveChange } from "../storage/json";

async function bestEffortRefresh(
  store: Store,
  changeId: string,
): Promise<void> {
  try {
    await store.changes.refresh(changeId);
  } catch {
    // Recovery writes are disk-projection repairs. A poisoned workflow may
    // still make refresh fail; the disk save above is the important effect.
  }
}

/**
 * Replace a task's fields in-place inside `change.tasks` and persist the
 * change to disk. Throws if the task is not present in the change.
 */
export async function saveRecoveredTaskMutation(input: {
  store: Store;
  change: Change;
  taskId: string;
  mutate: (task: Change["tasks"][number]) => Change["tasks"][number];
}): Promise<Change> {
  const idx = input.change.tasks.findIndex((t) => t.id === input.taskId);
  if (idx < 0) {
    throw new Error(
      `Cannot recover task ${input.taskId}: not present in change ${input.change.id}`,
    );
  }
  const updatedTasks = [...input.change.tasks];
  updatedTasks[idx] = input.mutate(updatedTasks[idx]);
  const updated = { ...input.change, tasks: updatedTasks } as Change;
  await input.store.changes.save(updated);
  await bestEffortRefresh(input.store, input.change.id);
  return updated;
}

/**
 * Append a new task to `change.tasks` and persist the change to disk.
 */
export async function saveRecoveredTaskAdd(input: {
  store: Store;
  change: Change;
  task: Change["tasks"][number];
}): Promise<Change> {
  if (input.change.tasks.some((t) => t.id === input.task.id)) {
    throw new Error(
      `Cannot recover-add task ${input.task.id}: already present in change ${input.change.id}`,
    );
  }
  const updated = {
    ...input.change,
    tasks: [...input.change.tasks, input.task],
  } as Change;
  await input.store.changes.save(updated);
  await bestEffortRefresh(input.store, input.change.id);
  return updated;
}

/**
 * Replace the gate completion fields for a specific gate and persist through
 * disk-direct saveChange. This bypasses store.changes.save because archived
 * workflow recovery often happens after the workflow has already completed;
 * calling store.changes.save would route through Temporal again.
 * The caller supplies the full completion record (status + completed_at +
 * completed_by + approval_evidence + optional artifact_evidence).
 */
export async function saveRecoveredGateCompletion(input: {
  store: Store;
  change: Change;
  gateId: keyof Gates;
  completion: Gates[keyof Gates];
}): Promise<Change> {
  const gates = (input.change.gates ?? {}) as Gates;
  const updatedGates = { ...gates, [input.gateId]: input.completion } as Gates;
  const updated = { ...input.change, gates: updatedGates } as Change;
  await saveChange(input.store.paths.changes, updated);
  await bestEffortRefresh(input.store, input.change.id);
  return updated;
}

/**
 * Transition the change's `status` field (typically draft → archived) on
 * disk projection when the terminating workflow signal cannot be processed.
 *
 * rq-fix-archive-recovery-disk-write: bypass `store.changes.save` because
 * for `status: "archived"` the temporal store routes through
 * `archiveChangeSignal` on the workflow — which is exactly what we are
 * recovering from. Write the disk projection directly via `saveChange`
 * and best-effort invalidate the in-memory cache so subsequent reads
 * pull the fresh disk state.
 */
export async function saveRecoveredChangeStatus(input: {
  store: Store;
  change: Change;
  status: Change["status"];
}): Promise<Change> {
  const updated = { ...input.change, status: input.status } as Change;
  await saveChange(input.store.paths.changes, updated);
  await bestEffortRefresh(input.store, input.change.id);
  return updated;
}
