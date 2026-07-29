import type { Change, Task } from "../../types";
import { loadChange, type LoadResult } from "../change-projection-reader";
import type { ReadSnapshot } from "../store-types";

/**
 * A full active-change projection is the authority for routine reads. This
 * module intentionally has no Temporal dependency: callers can therefore use
 * it safely when a workflow is missing, poisoned, or otherwise unreachable.
 *
 * This is the enforcement point for projection-first routine reads: routine
 * reads resolve from schema-versioned durable projections here and never issue
 * a workflow Query. Query/Visibility/Describe remain reserved for command
 * confirmation, reconciliation, diagnostics and repair.
 * rq-projectionReadModel02
 */
export type ChangeReadSnapshot =
  | ReadSnapshot<Change>
  | {
      found: false;
      reason: "not_found";
      source: "read_model";
    }
  | {
      found: false;
      reason: "corrupt";
      source: "read_model";
      error: string;
      degraded: { reason: "corrupt_projection"; repair: "repair_snapshot" };
    }
  | {
      found: false;
      reason: "schema_error";
      source: "read_model";
      error: string;
      degraded: { reason: "corrupt_projection"; repair: "repair_snapshot" };
    };

export async function readChangeSnapshot(
  changesDir: string,
  changeId: string,
): Promise<ChangeReadSnapshot> {
  const result = await loadChange(changesDir, changeId);
  if (result.success && result.data) {
    const snapshot = result.data;
    return {
      found: true,
      snapshot,
      stateRevision: snapshot.state_revision ?? 0,
      projectionRevision: snapshot.projection_revision ?? 0,
      source: "read_model",
    };
  }
  if (result.success) {
    return { found: false, reason: "not_found", source: "read_model" };
  }
  if (!result.success && result.type === "not_found") {
    return { found: false, reason: "not_found", source: "read_model" };
  }
  if (!result.success && result.type === "schema_error") {
    return {
      found: false,
      reason: "schema_error",
      source: "read_model",
      error: result.error,
      degraded: { reason: "corrupt_projection", repair: "repair_snapshot" },
    };
  }
  return {
    found: false,
    reason: "corrupt",
    source: "read_model",
    error: result.error,
    degraded: { reason: "corrupt_projection", repair: "repair_snapshot" },
  };
}

/** Preserve the public LoadResult envelope while retaining read-model source. */
export function snapshotToLoadResult(
  snapshot: ChangeReadSnapshot,
): LoadResult<Change | null> & { source?: "read_model"; degraded?: unknown } {
  if (snapshot.found) {
    return { success: true, data: snapshot.snapshot, source: "read_model" };
  }
  if (snapshot.reason === "not_found") {
    return {
      success: false,
      error: "not_found",
      type: "not_found",
      source: "read_model",
    };
  }
  if (snapshot.reason === "schema_error") {
    return {
      success: false,
      error: snapshot.error,
      type: "schema_error",
      source: "read_model",
      degraded: snapshot.degraded,
    };
  }
  return {
    success: false,
    error: snapshot.error,
    type: "read_error",
    source: "read_model",
    degraded: snapshot.degraded,
  };
}

/** The disk-store filter contract used by adv_task_list. */
export function filterProjectionTasks(
  tasks: Task[],
  status?: string,
  filter?: string,
): Task[] {
  let filtered = tasks;
  if (status) filtered = filtered.filter((task) => task.status === status);
  if (!filter) return filtered;

  const hasKey = filter.match(/^has_metadata_key:(.+)$/);
  const keyValue = filter.match(/^metadata:([^=]+)=(.+)$/);
  if (hasKey) {
    return filtered.filter(
      (task) => task.metadata && hasKey[1] in task.metadata,
    );
  }
  if (keyValue) {
    return filtered.filter(
      (task) => task.metadata?.[keyValue[1]] === keyValue[2],
    );
  }
  return filtered;
}
