/**
 * Store Lock Helpers
 *
 * File-lock wrappers and resolution helpers for the store closure.
 * Each function accepts a StoreContext so it can be extracted from the
 * createStore closure without changing external behaviour.
 */

import { join } from "path";
import type { Change, Task } from "../types";
import { loadChange } from "./json";
import { acquireFileLock } from "../utils/fs";
import type { StoreContext } from "./store-context";

/**
 * Execute a function within a file lock for a specific change.json.
 * Prevents read-modify-write race conditions on the JSON source of truth.
 */
export async function withChangeLock<T>(
  ctx: StoreContext,
  changeId: string,
  fn: (change: Change) => Promise<T>,
): Promise<T> {
  const changePath = join(ctx.paths.changes, changeId, "change.json");

  let release;
  try {
    release = await acquireFileLock(changePath);
  } catch (e) {
    const error = e as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      throw new Error(`Change not found: ${changeId}`);
    }
    throw e;
  }

  try {
    const result = await loadChange(ctx.paths.changes, changeId);
    if (!result.success || !result.data) {
      throw new Error(`Change not found: ${changeId}`);
    }
    return await fn(result.data);
  } finally {
    await release();
  }
}

/**
 * Execute a function within a file lock for the change containing a task.
 * Resolves the task and change under the lock.
 */
export async function withTaskLock<T>(
  ctx: StoreContext,
  taskId: string,
  ensureAllChangesSynced: () => Promise<void>,
  fn: (task: Task, change: Change, changeId: string) => Promise<T>,
): Promise<T | null> {
  await ensureAllChangesSynced();
  const taskRow = ctx.sqlite.tasks.get(taskId);
  if (!taskRow) return null;

  const changeId = taskRow.change_id;
  return withChangeLock(ctx, changeId, async (change) => {
    const task = change.tasks.find((t) => t.id === taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found in change ${changeId}`);
    }
    return await fn(task, change, changeId);
  });
}

/**
 * Resolve a taskId to its Task, parent Change, and changeId.
 * Returns null if the task is not found.
 */
export async function resolveTask(
  ctx: StoreContext,
  taskId: string,
  ensureAllChangesSynced: () => Promise<void>,
): Promise<{ task: Task; change: Change; changeId: string } | null> {
  await ensureAllChangesSynced();

  const taskRow = ctx.sqlite.tasks.get(taskId);
  if (!taskRow) return null;

  const result = await loadChange(ctx.paths.changes, taskRow.change_id);
  if (!result.success || !result.data) return null;

  const task = result.data.tasks.find((t) => t.id === taskId);
  if (!task) return null;

  return { task, change: result.data, changeId: taskRow.change_id };
}

/**
 * Load a change from JSON, returning null if missing or on read failure.
 */
export async function loadChangeOrNull(
  ctx: StoreContext,
  changeId: string,
): Promise<Change | null> {
  const result = await loadChange(ctx.paths.changes, changeId);
  if (!result.success || !result.data) return null;
  return result.data;
}

/**
 * Load a change from JSON, throwing on any failure.
 */
export async function loadChangeOrThrow(
  ctx: StoreContext,
  changeId: string,
): Promise<Change> {
  const result = await loadChange(ctx.paths.changes, changeId);
  if (!result.success) {
    throw new Error(result.error);
  }
  if (!result.data) {
    throw new Error(`Change not found: ${changeId}`);
  }
  return result.data;
}
