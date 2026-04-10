/**
 * Unified Store Interface
 *
 * Combines JSON file storage (source of truth) with SQLite caching.
 * Domain operations are delegated to focused modules:
 *   store-specs.ts, store-changes.ts, store-tasks.ts, store-gates.ts
 */

import { join } from "path";
import { mkdir } from "fs/promises";
import type {
  Change,
  ProjectConfig,
  ChangeStatus,
  ChangeRecency,
} from "../types";
import { createSQLiteStore, type SQLiteStore } from "./sqlite";
import {
  checkpointWAL,
  getWALSize,
  shouldCheckpoint,
  initDatabase,
  closeDatabase,
} from "./health";
import {
  loadProjectConfig,
  saveProjectConfig,
  loadChange,
  saveChange,
  getProjectPaths,
} from "./json";
import { createStoreContext } from "./store-context";
import {
  ensureSpecSynced as _ensureSpecSynced,
  ensureAllSpecsSynced as _ensureAllSpecsSynced,
  ensureChangeSynced as _ensureChangeSynced,
  ensureAllChangesSynced as _ensureAllChangesSynced,
} from "./store-sync";
import { createSpecsOps } from "./store-specs";
import { createChangesOps } from "./store-changes";
import { createTasksOps, createWisdomOps } from "./store-tasks";
import { createGatesOps } from "./store-gates";
import {
  Store,
  SearchResult,
  classifyRecency,
  computeLastActivity,
  buildChangeRecency,
} from "./store-types";
export type { Store, SearchResult };
export { classifyRecency, computeLastActivity, buildChangeRecency };

// =============================================================================
// Create Store
// =============================================================================

export async function createStore(
  directory: string,
  options?: { externalRoot?: string },
): Promise<Store> {
  const config = await loadProjectConfig(directory);
  const paths = getProjectPaths(directory, config ?? undefined, {
    externalRoot: options?.externalRoot,
  });

  await mkdir(paths.db, { recursive: true });

  const dbPath = join(paths.db, "spec.db");
  const sqlite: SQLiteStore = createSQLiteStore(dbPath);

  try {
    initDatabase(sqlite.db);
  } catch (e) {
    const error = e as Error;
    const isCorruption =
      error.message.includes("corrupted") ||
      error.message.includes("malformed") ||
      error.message.includes("corrupt");

    if (isCorruption) {
      console.warn(
        `⚠️  Database corrupted: ${error.message}\n` +
          "   Deleting corrupted database and rebuilding from JSON...",
      );
      const { rm } = await import("fs/promises");
      await rm(dbPath, { force: true });
      await rm(`${dbPath}-wal`, { force: true });
      await rm(`${dbPath}-shm`, { force: true });
      const newStore = createSQLiteStore(dbPath);
      sqlite.db = newStore.db;
      initDatabase(sqlite.db);
    } else {
      throw e;
    }
  }

  const ctx = createStoreContext(paths, sqlite, dbPath, config);
  let synced = false;

  // Bind sync helpers with ctx for convenience
  const ensureSpecSynced = (capability: string) =>
    _ensureSpecSynced(ctx, capability);
  const ensureAllSpecsSynced = () => _ensureAllSpecsSynced(ctx);
  const ensureChangeSynced = (changeId: string) =>
    _ensureChangeSynced(ctx, changeId);
  const ensureAllChangesSynced = () => _ensureAllChangesSynced(ctx);

  // saveFn: shared save operation used by all domain factories
  const saveFn = async (change: Change): Promise<void> => {
    const jsonPath = await saveChange(paths.changes, change);
    ctx.sqlite.changes.upsert(change, jsonPath);
    if (shouldCheckpoint(dbPath)) checkpointWAL(ctx.sqlite.db);
  };

  const store: Store = {
    paths,
    config,

    init: async () => {
      await mkdir(paths.specs, { recursive: true });
      await mkdir(paths.changes, { recursive: true });
      await mkdir(paths.archive, { recursive: true });
      await mkdir(paths.docs, { recursive: true });

      if (!config) {
        const defaultConfig: ProjectConfig = {
          name: directory.split("/").pop() ?? "project",
          version: "0.1.0",
          specs_dir: ".adv/specs",
          changes_dir: ".adv/changes",
          archive_dir: ".adv/archive",
          docs_dir: "docs/specs",
          db_dir: ".adv/db",
          project_file: "project.md",
          features: {
            tdd_enforcement: "strict",
            worktree_auto_create: true,
            gate_enforcement: "strict",
            wisdom_accumulation: true,
            clarify_enforcement: "advisory",
            slop_scan: {
              nesting_depth_threshold: 4,
              defensive_guard_threshold: 3,
              complexity_threshold: 10,
              ast_timeout_ms: 10000,
            },
          },
        };
        await saveProjectConfig(directory, defaultConfig);
      }
    },

    sync: async () => {
      if (synced || ctx.closed) return;
      await ensureAllSpecsSynced();
      await ensureAllChangesSynced();
      synced = true;
    },

    close: () => {
      if (ctx.closed) return;
      ctx.closed = true;
      closeDatabase(ctx.sqlite.db);
    },

    flush: async () => {
      if (ctx.closed) return;
      try {
        checkpointWAL(ctx.sqlite.db);
      } catch (error) {
        if (process.env.ADV_DEBUG) {
          console.error(
            `[ADV:store] flush checkpointWAL failed: ${String(error)}`,
          );
        }
      }
    },

    specs: createSpecsOps(ctx, ensureSpecSynced, ensureAllSpecsSynced),
    changes: createChangesOps(ctx, ensureAllChangesSynced, saveFn),
    tasks: createTasksOps(
      ctx,
      ensureAllChangesSynced,
      ensureChangeSynced,
      saveFn,
    ),
    wisdom: createWisdomOps(ctx, saveFn),
    gates: createGatesOps(ctx, ensureChangeSynced, saveFn),

    status: async () => {
      await ensureAllSpecsSynced();
      await ensureAllChangesSynced();

      const specRows = ctx.sqlite.specs.list();
      const changeRows = ctx.sqlite.changes.list();

      const byStatus: Record<ChangeStatus, number> = {
        draft: 0,
        pending: 0,
        active: 0,
        archived: 0,
        closed: 0,
      };
      for (const change of changeRows) {
        byStatus[change.status as ChangeStatus]++;
      }

      const recommendations: string[] = [];
      const now = new Date();
      const recentChanges: ChangeRecency[] = [];

      for (const change of changeRows) {
        const jsonResult = await loadChange(paths.changes, change.id);
        if (!jsonResult.success || !jsonResult.data) {
          recommendations.push(
            `[doctor] JSON/SQLite inconsistency: change \`${change.id}\` exists in SQLite cache but change.json could not be loaded`,
          );
          continue;
        }

        const sqliteTasks = ctx.sqlite.tasks.list(change.id);
        const sqliteTaskIds = sqliteTasks.map((t) => t.id);
        const jsonTasks = jsonResult.data.tasks.map((t) => t.id);
        const sqliteOnly = sqliteTaskIds.filter(
          (id) => !jsonTasks.includes(id),
        );
        const jsonOnly = jsonTasks.filter((id) => !sqliteTaskIds.includes(id));
        if (sqliteOnly.length > 0 || jsonOnly.length > 0) {
          recommendations.push(
            `[doctor] JSON/SQLite inconsistency: task index mismatch for change \`${change.id}\` (sqlite_only=${sqliteOnly.length}, json_only=${jsonOnly.length})`,
          );
        }

        if (change.status !== "archived" && change.status !== "closed") {
          const tasks = jsonResult.data.tasks;
          recentChanges.push(
            buildChangeRecency(
              jsonResult.data,
              {
                total: tasks.length,
                done: tasks.filter((t) => t.status === "done").length,
              },
              now,
            ),
          );
        }

        if (change.status === "active") {
          const allDone = sqliteTasks.every(
            (t) => t.status === "done" || t.status === "cancelled",
          );
          if (allDone && sqliteTasks.length > 0) {
            recommendations.push(
              `Ready to archive: \`/adv-archive ${change.id}\``,
            );
          }
        }
      }

      recentChanges.sort((a, b) => {
        const cmp = b.lastActivityAt.localeCompare(a.lastActivityAt);
        return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
      });

      const danglingTaskRefs = ctx.sqlite.db
        .query(
          `SELECT t.id as task_id, t.change_id FROM tasks t LEFT JOIN changes c ON c.id = t.change_id WHERE c.id IS NULL`,
        )
        .all() as Array<{ task_id: string; change_id: string }>;
      if (danglingTaskRefs.length > 0) {
        recommendations.push(
          `[doctor] Broken task->change refs: ${danglingTaskRefs.length} task(s) reference missing change rows in SQLite cache`,
        );
      }

      const walBytes = getWALSize(dbPath);
      if (walBytes > 0) {
        recommendations.push(
          `[doctor] Pending WAL checkpoint: ${walBytes} bytes in WAL file (run flush/checkpoint before archive)`,
        );
      }

      return {
        specs: {
          count: specRows.length,
          capabilities: specRows.map((s) => s.name),
        },
        changes: {
          active: changeRows.filter(
            (c) => c.status !== "archived" && c.status !== "closed",
          ).length,
          byStatus,
          recent: recentChanges,
        },
        recommendations,
      };
    },
  };

  return store;
}
