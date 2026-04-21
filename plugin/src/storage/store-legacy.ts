/**
 * Legacy Store — JSON+SQLite Backend
 *
 * Provides the full Store interface backed by JSON files and a SQLite derived
 * cache. Extracted from the original unified store to allow optional Temporal
 * wrapping via `store-temporal.ts` without the composition root itself
 * touching workflow concerns.
 *
 * This file is the fallback / default backend — it must always be runnable on
 * its own. `store.ts` is the thin selector that chooses between this backend
 * and the Temporal adapter overlay.
 */

import { basename, join } from "path";
import { mkdir } from "fs/promises";
import type { Change, ChangeStatus } from "../types";
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
import { createLogger } from "../utils/debug-log";
import {
  recoverCorruptedDatabase,
  isCorruptionError,
} from "./corruption-recovery";

const logger = createLogger("store");

// Re-export public types and helpers
export {
  type Store,
  type SearchResult,
  classifyRecency,
  computeLastActivity,
  buildChangeRecency,
} from "./store-types";

import type { Store } from "./store-types";
import { buildChangeRecency } from "./store-types";

// Decomposition modules
import { createStoreContext } from "./store-context";
import {
  ensureSpecSynced,
  ensureAllSpecsSynced,
  ensureChangeSynced,
  ensureAllChangesSynced,
} from "./store-sync";
import { createSpecsOps } from "./store-specs";
import { createChangesOps } from "./store-changes";
import { createTasksOps, createWisdomOps } from "./store-tasks";
import { createGatesOps } from "./store-gates";

// =============================================================================
// Create Store
// =============================================================================

export async function createLegacyStore(
  directory: string,
  options?: { externalRoot?: string },
): Promise<Store> {
  // Load project config
  const config = await loadProjectConfig(directory);
  const paths = getProjectPaths(directory, config ?? undefined, {
    externalRoot: options?.externalRoot,
  });

  // Ensure db directory exists
  await mkdir(paths.db, { recursive: true });

  // Initialize SQLite
  const dbPath = join(paths.db, "spec.db");
  let sqlite: SQLiteStore = createSQLiteStore(dbPath);

  // Health check with bounded corruption recovery
  try {
    initDatabase(sqlite.db);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    if (!isCorruptionError(error)) {
      throw e;
    }

    logger.warn(
      `Database corrupted (${error.message}); rebuilding from JSON with bounded retry`,
    );

    const { rm } = await import("fs/promises");
    await recoverCorruptedDatabase({
      maxAttempts: 2,
      backoffMs: 100,
      reset: async () => {
        try {
          sqlite.close();
        } catch {
          // best-effort — the old handle may already be broken
        }
        await rm(dbPath, { force: true });
        await rm(`${dbPath}-wal`, { force: true });
        await rm(`${dbPath}-shm`, { force: true });
      },
      attempt: async () => {
        sqlite = createSQLiteStore(dbPath);
        initDatabase(sqlite.db);
      },
    });
  }

  // Create shared context
  const ctx = createStoreContext(paths, sqlite, dbPath, config);

  // ---------------------------------------------------------------------------
  // Bound sync helpers (close over ctx)
  // ---------------------------------------------------------------------------
  const boundEnsureSpecSynced = (cap: string) => ensureSpecSynced(ctx, cap);
  const boundEnsureAllSpecsSynced = () => ensureAllSpecsSynced(ctx);
  const boundEnsureChangeSynced = (id: string) => ensureChangeSynced(ctx, id);
  const boundEnsureAllChangesSynced = () => ensureAllChangesSynced(ctx);

  // ---------------------------------------------------------------------------
  // Raw save (no file lock — callers wrap in withChangeLock)
  // ---------------------------------------------------------------------------
  const saveFn = async (change: Change): Promise<void> => {
    const jsonPath = await saveChange(paths.changes, change);
    ctx.sqlite.changes.upsert(change, jsonPath);
    ctx.sqlite.wisdom.deleteByChange(change.id);
    ctx.sqlite.wisdom.upsertBatch(change.id, change.wisdom ?? []);
    // Invalidate sync cache so subsequent reads pick up the change from disk
    ctx.syncedChanges.add(change.id);
    if (shouldCheckpoint(ctx.dbPath)) {
      checkpointWAL(ctx.sqlite.db);
    }
  };

  // ---------------------------------------------------------------------------
  // Compose domain namespaces
  // ---------------------------------------------------------------------------
  const specs = createSpecsOps(
    ctx,
    boundEnsureSpecSynced,
    boundEnsureAllSpecsSynced,
  );
  const changes = createChangesOps(ctx, boundEnsureAllChangesSynced, saveFn);
  const tasks = createTasksOps(
    ctx,
    boundEnsureAllChangesSynced,
    boundEnsureChangeSynced,
    saveFn,
  );
  const wisdom = createWisdomOps(ctx, saveFn);
  const gates = createGatesOps(ctx, boundEnsureChangeSynced, saveFn);

  // ---------------------------------------------------------------------------
  // Assemble Store
  // ---------------------------------------------------------------------------
  const store: Store = {
    paths,
    config,

    // Lifecycle
    init: async () => {
      if (!config) {
        await saveProjectConfig(directory, {
          name: basename(directory) || "project",
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
              nesting_depth_threshold: 8,
              defensive_guard_threshold: 3,
              complexity_threshold: 12,
              ast_timeout_ms: 10000,
            },
          },
        });
      }
      await boundEnsureAllSpecsSynced();
      await boundEnsureAllChangesSynced();
    },

    sync: async () => {
      // Reset session caches to force re-sync
      ctx.syncedSpecs.clear();
      ctx.syncedChanges.clear();
      ctx.allSpecsSyncPromise = null;
      ctx.allChangesSyncPromise = null;
      ctx.projectWisdomSynced = false;
      await boundEnsureAllSpecsSynced();
      await boundEnsureAllChangesSynced();
    },

    close: () => {
      if (ctx.closed) return;
      ctx.closed = true;
      closeDatabase(sqlite.db);
    },

    flush: async () => {
      if (ctx.closed) return;
      checkpointWAL(sqlite.db);
    },

    // Domain namespaces
    specs,
    changes,
    tasks,
    wisdom,
    gates,

    // Status
    status: async () => {
      await boundEnsureAllSpecsSynced();
      await boundEnsureAllChangesSynced();

      const specRows = sqlite.specs.list();
      const changeRows = sqlite.changes.list();

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
      const recentChanges: import("../types").ChangeRecency[] = [];

      // Doctor-lite integrity checks + recency + archive readiness
      for (const change of changeRows) {
        const jsonResult = await loadChange(paths.changes, change.id);
        if (!jsonResult.success || !jsonResult.data) {
          recommendations.push(
            `[doctor] JSON/SQLite inconsistency: change \`${change.id}\` exists in SQLite cache but change.json could not be loaded`,
          );
          continue;
        }

        const sqliteTasks = sqlite.tasks.list(change.id);
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
          const jsonTaskList = jsonResult.data.tasks;
          recentChanges.push(
            buildChangeRecency(
              jsonResult.data,
              {
                total: jsonTaskList.length,
                done: jsonTaskList.filter((t) => t.status === "done").length,
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

      const danglingTaskRefs = sqlite.db
        .query(
          `SELECT t.id as task_id, t.change_id
           FROM tasks t
           LEFT JOIN changes c ON c.id = t.change_id
           WHERE c.id IS NULL`,
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
