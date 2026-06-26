/**
 * Disk-projection recovery writers for poisoned-history fallback.
 *
 * These helpers write poisoned/completed-workflow recovery mutations to the
 * disk projection. Task mutation writers route through `store.changes.save`;
 * gate-completion and status-transition writers use disk-direct `saveChange`
 * because the Temporal-backed store path can re-invoke a completed workflow.
 * Every recovery write must be authorized by an explicit
 * `recoveryMode: "poisoned_history"` (with evidence), completed-workflow
 * evidence, or `compatibilityReason` at the calling tool.
 *
 * The disk-direct writers structurally require an authorization reason and
 * evidence. Callers remain responsible for proving that evidence before
 * invoking the writer; the writers ensure the disk write is atomic.
 *
 * Cache refresh policy:
 * - Task writers (mutation/add) use `store.changes.save` + `bestEffortRefresh`.
 *   `store.changes.save` already routes through Temporal on the regular path.
 * - Gate completion (`saveRecoveredGateCompletion`) and artifact metadata
 *   (`saveRecoveredArtifactMetadata`) use disk-direct `saveChange` WITHOUT
 *   `bestEffortRefresh`. These target workflows that may still be actively
 *   processing; refreshing could pull in an intermediate state that overwrites
 *   the disk repair.
 * - Status transition (`saveRecoveredChangeStatus`) uses disk-direct
 *   `saveChange` only. `store.changes.refresh()` re-queries Temporal, which can
 *   still contain stale non-terminal state for a wedged release workflow and
 *   overwrite the disk repair. The Temporal read path treats archive bundles as
 *   terminal/dominant and invalidates stale active cache entries there.
 */
import type { Store } from "../storage/store-types";
import type { Change, DesignConcernDisposition, Gates } from "../types";
import { saveChange } from "../storage/json";
import type { ArtifactMetadata } from "../temporal/contracts";

interface RecoveryWriteAuthorization {
  reason: string;
  evidence: string;
}

function assertRecoveryAuthorization(
  authorization: RecoveryWriteAuthorization | undefined,
): asserts authorization is RecoveryWriteAuthorization {
  if (!authorization?.reason.trim() || !authorization.evidence.trim()) {
    throw new Error(
      "disk-projection recovery authorization with reason and evidence is required",
    );
  }
}

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
 *
 * A recovery authorization object is required so future call sites cannot use
 * this bypass without structurally carrying the recovery reason/evidence.
 * The caller supplies the full completion record (status + completed_at +
 * completed_by + approval_evidence + optional artifact_evidence).
 */
export async function saveRecoveredGateCompletion(input: {
  store: Store;
  change: Change;
  authorization: RecoveryWriteAuthorization;
  gateId: keyof Gates;
  completion: Gates[keyof Gates];
}): Promise<Change> {
  assertRecoveryAuthorization(input.authorization);
  const gates = (input.change.gates ?? {}) as Gates;
  const auditedCompletion = {
    ...input.completion,
    recovery_audit: {
      reason: input.authorization.reason,
      evidence: input.authorization.evidence,
      recovered_at: new Date().toISOString(),
    },
  } as Gates[keyof Gates];
  const updatedGates = { ...gates, [input.gateId]: auditedCompletion } as Gates;
  const updated = { ...input.change, gates: updatedGates } as Change;
  await saveChange(input.store.paths.changes, updated);
  return updated;
}

/**
 * Repair workflow artifact metadata on the disk projection when a completed or
 * poisoned workflow cannot accept `updateArtifactMetadataSignal`.
 */
export async function saveRecoveredArtifactMetadata(input: {
  store: Store;
  change: Change;
  authorization: RecoveryWriteAuthorization;
  kind: string;
  metadata: ArtifactMetadata;
}): Promise<Change> {
  assertRecoveryAuthorization(input.authorization);
  const updated = {
    ...input.change,
    artifacts: {
      ...(input.change.artifacts ?? {}),
      [input.kind]: input.metadata,
    },
  } as Change;
  await saveChange(input.store.paths.changes, updated);
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
 * without refreshing stale workflow state back over the disk repair.
 */
export async function saveRecoveredChangeStatus(input: {
  store: Store;
  change: Change;
  authorization: RecoveryWriteAuthorization;
  status: Change["status"];
  closure?: Change["closure"];
}): Promise<Change> {
  assertRecoveryAuthorization(input.authorization);
  const updated = {
    ...input.change,
    status: input.status,
    ...(input.closure ? { closure: input.closure } : {}),
  } as Change;
  await saveChange(input.store.paths.changes, updated);
  return updated;
}

/**
 * Record a typed design-concern disposition on the disk projection when the
 * owning change workflow is already completed and cannot accept the normal
 * `designConcernDispositionedSignal`.
 *
 * The same latest-wins semantics as `applyDesignConcernDispositionedToState`
 * are preserved for `(taskId, concernKey)`. This is intentionally disk-direct:
 * completed-workflow recovery must not call `store.changes.save` because that
 * can route back through the workflow being recovered.
 */
export async function saveRecoveredDesignConcernDisposition(input: {
  store: Store;
  change: Change;
  authorization: RecoveryWriteAuthorization;
  disposition: DesignConcernDisposition;
}): Promise<Change> {
  assertRecoveryAuthorization(input.authorization);
  const existing = input.change.design_concern_dispositions ?? [];
  const next = existing.filter(
    (d) =>
      !(
        d.taskId === input.disposition.taskId &&
        d.concernKey === input.disposition.concernKey
      ),
  );
  const updated = {
    ...input.change,
    design_concern_dispositions: [
      ...next,
      {
        ...input.disposition,
        recovery_audit: {
          reason: input.authorization.reason,
          evidence: input.authorization.evidence,
          recovered_at: new Date().toISOString(),
        },
      },
    ],
  } as Change;
  await saveChange(input.store.paths.changes, updated);
  return updated;
}
