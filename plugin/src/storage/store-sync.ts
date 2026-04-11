/**
 * Store Sync Helpers
 *
 * Lazy JSON→SQLite synchronisation helpers extracted from createStore.
 * All functions accept StoreContext so they can be independently tested
 * and do not depend on closure state.
 *
 * Design principles:
 * - All sync operations use syncFiles.* exclusively (no legacy sync namespace).
 * - File attrs are obtained via statSync at each call site so the comparison
 *   is always against the current on-disk state.
 * - Promise-singleton patterns (allSpecsSyncPromise, allChangesSyncPromise)
 *   prevent redundant parallel sync work within the same session.
 */

import { join } from "path";
import { statSync } from "node:fs";
import type { Change } from "../types";
import { loadAllSpecs, loadSpec, loadAllChanges, loadChange } from "./json";
import { checkpointWAL, shouldCheckpoint } from "./health";
import type { StoreContext } from "./store-context";
import { listProjectWisdom } from "./project-wisdom";

// ---------------------------------------------------------------------------
// Cache reconciliation
// ---------------------------------------------------------------------------

/**
 * Reconcile the derived SQLite change/task cache against JSON source of truth.
 *
 * Self-heals two classes of drift:
 *  1. Missing SQLite change rows for JSON-backed active changes
 *  2. Stale/dangling SQLite rows for changes no longer in the active directory
 */
export async function reconcileActiveChangeCache(
  ctx: StoreContext,
  changes: Map<string, Change>,
): Promise<{ resyncRequired: boolean }> {
  const changeRows = ctx.sqlite.changes.list();
  const jsonIds = new Set(changes.keys());
  const cachedIds = new Set(changeRows.map((row) => row.id));
  let resyncRequired = false;

  for (const id of jsonIds) {
    if (!cachedIds.has(id)) {
      ctx.syncedChanges.delete(id);
      resyncRequired = true;
    }
  }

  const activeChangePrefix = `${ctx.paths.changes}/`;
  let repaired = false;
  for (const row of changeRows) {
    if (row.json_path.startsWith(activeChangePrefix) && !jsonIds.has(row.id)) {
      ctx.sqlite.changes.delete(row.id);
      ctx.syncedChanges.delete(row.id);
      repaired = true;
      resyncRequired = true;
    }
  }

  const removedTasks = ctx.sqlite.db
    .query("DELETE FROM tasks WHERE change_id NOT IN (SELECT id FROM changes)")
    .run();
  const removedDeps = ctx.sqlite.db
    .query(
      "DELETE FROM dependencies WHERE target_id NOT IN (SELECT id FROM tasks)",
    )
    .run();

  if (
    repaired ||
    Number(removedTasks.changes ?? 0) > 0 ||
    Number(removedDeps.changes ?? 0) > 0
  ) {
    checkpointWAL(ctx.sqlite.db);
  }

  return { resyncRequired };
}

// ---------------------------------------------------------------------------
// Spec sync helpers
// ---------------------------------------------------------------------------

/**
 * Ensure a single spec is synced to SQLite (lazy, on-demand).
 * Uses a pending-promise map to deduplicate concurrent requests.
 */
export function ensureSpecSynced(
  ctx: StoreContext,
  capability: string,
): Promise<void> {
  if (ctx.closed) return Promise.resolve();
  if (ctx.syncedSpecs.has(capability)) return Promise.resolve();

  let pending = ctx.pendingSpecSyncs.get(capability);
  if (pending) return pending;

  pending = (async () => {
    try {
      const jsonPath = join(ctx.paths.specs, capability, "spec.json");
      let attrs;
      try {
        const s = statSync(jsonPath);
        attrs = { mtime_ms: Math.floor(s.mtimeMs), size: s.size, inode: s.ino };
      } catch {
        attrs = undefined;
      }

      if (!attrs || ctx.sqlite.syncFiles.needsSync(jsonPath, attrs)) {
        const result = await loadSpec(ctx.paths.specs, capability);
        if (result.success && result.data) {
          ctx.sqlite.specs.upsert(result.data, jsonPath);
          if (attrs) ctx.sqlite.syncFiles.markSynced(jsonPath, attrs);
          if (shouldCheckpoint(ctx.dbPath)) checkpointWAL(ctx.sqlite.db);
        }
      }
      ctx.syncedSpecs.add(capability);
    } finally {
      ctx.pendingSpecSyncs.delete(capability);
    }
  })();

  ctx.pendingSpecSyncs.set(capability, pending);
  return pending;
}

/**
 * Ensure ALL specs are synced to SQLite.
 * Required for list() and search() operations. Uses a singleton promise
 * so the work only runs once per session.
 */
export function ensureAllSpecsSynced(ctx: StoreContext): Promise<void> {
  if (ctx.closed) return Promise.resolve();
  if (ctx.allSpecsSyncPromise) return ctx.allSpecsSyncPromise;

  ctx.allSpecsSyncPromise = (async () => {
    const specs = await loadAllSpecs(ctx.paths.specs);
    for (const [name, spec] of specs) {
      if (ctx.syncedSpecs.has(name)) continue;

      const jsonPath = join(ctx.paths.specs, name, "spec.json");
      let attrs;
      try {
        const s = statSync(jsonPath);
        attrs = { mtime_ms: Math.floor(s.mtimeMs), size: s.size, inode: s.ino };
      } catch {
        attrs = undefined;
      }

      if (!attrs || ctx.sqlite.syncFiles.needsSync(jsonPath, attrs)) {
        ctx.sqlite.specs.upsert(spec, jsonPath);
        if (attrs) ctx.sqlite.syncFiles.markSynced(jsonPath, attrs);
        if (shouldCheckpoint(ctx.dbPath)) checkpointWAL(ctx.sqlite.db);
      }
      ctx.syncedSpecs.add(name);
    }
  })();

  return ctx.allSpecsSyncPromise;
}

// ---------------------------------------------------------------------------
// Change sync helpers
// ---------------------------------------------------------------------------

/**
 * Ensure a single change is synced to SQLite (lazy, on-demand).
 */
export function ensureChangeSynced(
  ctx: StoreContext,
  changeId: string,
): Promise<void> {
  if (ctx.closed) return Promise.resolve();
  if (ctx.syncedChanges.has(changeId)) return Promise.resolve();

  let pending = ctx.pendingChangeSyncs.get(changeId);
  if (pending) return pending;

  pending = (async () => {
    try {
      const jsonPath = join(ctx.paths.changes, changeId, "change.json");
      let attrs;
      try {
        const s = statSync(jsonPath);
        attrs = { mtime_ms: Math.floor(s.mtimeMs), size: s.size, inode: s.ino };
      } catch {
        attrs = undefined;
      }

      if (!attrs || ctx.sqlite.syncFiles.needsSync(jsonPath, attrs)) {
        const result = await loadChange(ctx.paths.changes, changeId);
        if (result.success && result.data) {
          ctx.sqlite.changes.upsert(result.data, jsonPath);
          if (attrs) ctx.sqlite.syncFiles.markSynced(jsonPath, attrs);
          if (shouldCheckpoint(ctx.dbPath)) checkpointWAL(ctx.sqlite.db);
        }
      }
      ctx.syncedChanges.add(changeId);
    } finally {
      ctx.pendingChangeSyncs.delete(changeId);
    }
  })();

  ctx.pendingChangeSyncs.set(changeId, pending);
  return pending;
}

/**
 * Ensure ALL changes are synced to SQLite.
 * Required for list() operations. Uses a singleton promise pattern.
 */
export async function ensureAllChangesSynced(ctx: StoreContext): Promise<void> {
  if (ctx.closed) return;

  const changes = await loadAllChanges(ctx.paths.changes);
  const { resyncRequired } = await reconcileActiveChangeCache(ctx, changes);

  if (resyncRequired) {
    ctx.allChangesSyncPromise = null;
  }

  if (ctx.allChangesSyncPromise) return ctx.allChangesSyncPromise;

  ctx.allChangesSyncPromise = (async () => {
    for (const [id, change] of changes) {
      if (ctx.syncedChanges.has(id)) continue;

      const jsonPath = join(ctx.paths.changes, id, "change.json");
      let attrs;
      try {
        const s = statSync(jsonPath);
        attrs = { mtime_ms: Math.floor(s.mtimeMs), size: s.size, inode: s.ino };
      } catch {
        attrs = undefined;
      }

      if (!attrs || ctx.sqlite.syncFiles.needsSync(jsonPath, attrs)) {
        ctx.sqlite.changes.upsert(change, jsonPath);
        if (attrs) ctx.sqlite.syncFiles.markSynced(jsonPath, attrs);
        if (shouldCheckpoint(ctx.dbPath)) checkpointWAL(ctx.sqlite.db);
      }
      ctx.syncedChanges.add(id);
    }
  })();

  return ctx.allChangesSyncPromise;
}

/**
 * Ensure project-level wisdom.jsonl is synced to SQLite.
 * Lazy — synced once per session, tracked via ctx.projectWisdomSynced.
 */
export async function ensureProjectWisdomSynced(
  ctx: StoreContext,
): Promise<void> {
  if (ctx.closed) return;

  const wisdomPath = ctx.paths.wisdom;
  let attrs;
  try {
    const s = statSync(wisdomPath);
    attrs = { mtime_ms: Math.floor(s.mtimeMs), size: s.size, inode: s.ino };
  } catch {
    attrs = undefined;
  }

  if (!attrs) {
    ctx.sqlite.wisdom.deleteProjectScope();
    ctx.sqlite.syncFiles.deleteFileRecord(wisdomPath);
    ctx.projectWisdomSynced = true;
    return;
  }

  if (
    ctx.projectWisdomSynced &&
    !ctx.sqlite.syncFiles.needsSync(wisdomPath, attrs)
  ) {
    return;
  }

  try {
    const entries = await listProjectWisdom(ctx.paths.root, {
      wisdomPath,
    });

    ctx.sqlite.wisdom.deleteProjectScope();
    if (entries.length > 0) {
      ctx.sqlite.wisdom.upsertProject(
        entries.map((e) => ({
          id: e.id,
          type: e.type,
          content: e.content,
          source_change: e.source_change,
          source_task: e.source_task,
          promoted_at: e.promoted_at,
        })),
      );
    }
    ctx.sqlite.syncFiles.markSynced(wisdomPath, attrs);
    ctx.projectWisdomSynced = true;
  } catch {
    // Project wisdom sync is best-effort — don't fail the operation
    ctx.projectWisdomSynced = false; // allow retry on next call
  }
}
