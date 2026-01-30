/**
 * SQLite Storage Layer
 *
 * Handles SQLite caching for fast queries.
 * JSON files remain source of truth; SQLite is derived.
 *
 * Uses bun:sqlite for Bun runtime compatibility.
 */

import { Database } from "bun:sqlite";
import { statSync } from "node:fs";
import type { Spec, Change, Task } from "../types";

// =============================================================================
// Database Schema
// =============================================================================

const SCHEMA = `
-- Specs (capabilities)
CREATE TABLE IF NOT EXISTS specs (
  name TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  purpose TEXT NOT NULL,
  version TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  json_path TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

-- Requirements
CREATE TABLE IF NOT EXISTS requirements (
  id TEXT PRIMARY KEY,
  spec_name TEXT NOT NULL REFERENCES specs(name) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('must', 'should', 'may')),
  tags TEXT,
  UNIQUE(spec_name, id)
);

-- Requirements FTS (Full-Text Search)
CREATE VIRTUAL TABLE IF NOT EXISTS requirements_fts USING fts5(
  id,
  title,
  body,
  tags,
  content=requirements,
  content_rowid=rowid
);

-- Triggers for FTS sync
CREATE TRIGGER IF NOT EXISTS requirements_ai AFTER INSERT ON requirements BEGIN
  INSERT INTO requirements_fts(rowid, id, title, body, tags) 
  VALUES (NEW.rowid, NEW.id, NEW.title, NEW.body, NEW.tags);
END;

CREATE TRIGGER IF NOT EXISTS requirements_ad AFTER DELETE ON requirements BEGIN
  INSERT INTO requirements_fts(requirements_fts, rowid, id, title, body, tags) 
  VALUES('delete', OLD.rowid, OLD.id, OLD.title, OLD.body, OLD.tags);
END;

CREATE TRIGGER IF NOT EXISTS requirements_au AFTER UPDATE ON requirements BEGIN
  INSERT INTO requirements_fts(requirements_fts, rowid, id, title, body, tags) 
  VALUES('delete', OLD.rowid, OLD.id, OLD.title, OLD.body, OLD.tags);
  INSERT INTO requirements_fts(rowid, id, title, body, tags) 
  VALUES (NEW.rowid, NEW.id, NEW.title, NEW.body, NEW.tags);
END;

-- Scenarios
CREATE TABLE IF NOT EXISTS scenarios (
  id TEXT PRIMARY KEY,
  requirement_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  given_json TEXT NOT NULL,
  when_clause TEXT NOT NULL,
  then_json TEXT NOT NULL
);

-- Changes
CREATE TABLE IF NOT EXISTS changes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending', 'active', 'archived')),
  created_at TEXT NOT NULL,
  created_by TEXT,
  json_path TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  change_id TEXT NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  section TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
  priority INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  completed_by TEXT
);

-- Task Dependencies
CREATE TABLE IF NOT EXISTS dependencies (
  source_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('blocked_by', 'related', 'discovered_from', 'parent')),
  PRIMARY KEY (source_id, target_id, type)
);

-- Deltas
CREATE TABLE IF NOT EXISTS deltas (
  id TEXT PRIMARY KEY,
  change_id TEXT NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('add', 'modify', 'remove')),
  target_id TEXT,
  requirement_json TEXT,
  changes_json TEXT,
  reason TEXT
);

-- Sync metadata
CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Sync files with triple-attribute tracking (mtime_ms, size, inode)
-- For reliable incremental sync: all three must match to skip re-sync
CREATE TABLE IF NOT EXISTS sync_files (
  path TEXT PRIMARY KEY,
  mtime_ms INTEGER NOT NULL,
  size INTEGER NOT NULL,
  inode INTEGER NOT NULL,
  synced_at TEXT NOT NULL
);
`;

// =============================================================================
// Database Interface
// =============================================================================

export interface SQLiteStore {
  db: Database;

  // Specs
  specs: {
    list: (filter?: { name?: string; tag?: string }) => SpecRow[];
    get: (name: string) => SpecRow | null;
    upsert: (spec: Spec, jsonPath: string) => void;
    delete: (name: string) => void;
  };

  // Requirements
  requirements: {
    list: (specName: string) => RequirementRow[];
    get: (id: string) => RequirementRow | null;
    search: (query: string, limit?: number) => SearchResult[];
  };

  // Changes
  changes: {
    list: (filter?: { status?: string }) => ChangeRow[];
    get: (id: string) => ChangeRow | null;
    upsert: (change: Change, jsonPath: string) => void;
    delete: (id: string) => void;
  };

  // Tasks
  tasks: {
    list: (changeId: string, status?: string) => TaskRow[];
    get: (id: string) => TaskRow | null;
    ready: (changeId: string) => { ready: TaskRow[]; blocked: BlockedTask[] };
    update: (id: string, updates: Partial<Task>) => void;
  };

  // Sync (legacy - key-value based)
  sync: {
    needsSync: (jsonPath: string) => boolean;
    markSynced: (jsonPath: string) => void;
    getLastSync: () => string | null;
  };

  // Sync files with triple-attribute tracking (mtime_ms, size, inode)
  syncFiles: {
    needsSync: (path: string, attrs?: FileAttrs) => boolean;
    markSynced: (path: string, attrs: FileAttrs) => void;
    getFileAttrs: (path: string) => FileAttrs | null;
    deleteFileRecord: (path: string) => void;
  };

  // Lifecycle
  close: () => void;
}

// Row types (what SQLite returns)
export interface SpecRow {
  name: string;
  title: string;
  purpose: string;
  version: string;
  updated_at: string;
  json_path: string;
  synced_at: string;
}

export interface RequirementRow {
  id: string;
  spec_name: string;
  title: string;
  body: string;
  priority: string;
  tags: string | null;
}

export interface ChangeRow {
  id: string;
  title: string;
  status: string;
  created_at: string;
  created_by: string | null;
  json_path: string;
  synced_at: string;
}

export interface TaskRow {
  id: string;
  change_id: string;
  title: string;
  section: string | null;
  status: string;
  priority: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
}

export interface SearchResult {
  id: string;
  spec_name: string;
  title: string;
  match: string;
  rank: number;
}

export interface BlockedTask {
  task: TaskRow;
  blockedBy: string[];
}

/**
 * File attributes for triple-attribute sync.
 * All three must match to consider a file unchanged.
 */
export interface FileAttrs {
  mtime_ms: number;
  size: number;
  inode: number;
}

// =============================================================================
// Create Store
// =============================================================================

export function createSQLiteStore(dbPath: string): SQLiteStore {
  const db = new Database(dbPath, { create: true });

  // Note: PRAGMA settings moved to initDatabase() in health.ts
  // to enable health checks before initialization
  // Health checks and auto-recovery are handled in store.ts

  // Run schema
  db.exec(SCHEMA);

  // Prepare statements using db.query() for bun:sqlite
  const stmts = {
    specsList: db.query("SELECT * FROM specs"),
    specsListByName: db.query("SELECT * FROM specs WHERE name = ?"),
    specsGet: db.query("SELECT * FROM specs WHERE name = ?"),
    specsUpsert: db.query(`
      INSERT INTO specs (name, title, purpose, version, updated_at, json_path, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        title = excluded.title,
        purpose = excluded.purpose,
        version = excluded.version,
        updated_at = excluded.updated_at,
        json_path = excluded.json_path,
        synced_at = excluded.synced_at
    `),
    specsDelete: db.query("DELETE FROM specs WHERE name = ?"),

    reqsList: db.query("SELECT * FROM requirements WHERE spec_name = ?"),
    reqsGet: db.query("SELECT * FROM requirements WHERE id = ?"),
    reqsInsert: db.query(`
      INSERT INTO requirements (id, spec_name, title, body, priority, tags)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    reqsDeleteBySpec: db.query("DELETE FROM requirements WHERE spec_name = ?"),
    reqsSearch: db.query(`
      SELECT r.id, r.spec_name, r.title, 
             snippet(requirements_fts, 2, '<mark>', '</mark>', '...', 32) as match,
             rank
      FROM requirements_fts
      JOIN requirements r ON requirements_fts.id = r.id
      WHERE requirements_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `),

    scenarioInsert: db.query(`
      INSERT INTO scenarios (id, requirement_id, title, given_json, when_clause, then_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `),

    changesList: db.query("SELECT * FROM changes ORDER BY created_at DESC"),
    changesListByStatus: db.query(
      "SELECT * FROM changes WHERE status = ? ORDER BY created_at DESC",
    ),
    changesGet: db.query("SELECT * FROM changes WHERE id = ?"),
    changesUpsert: db.query(`
      INSERT INTO changes (id, title, status, created_at, created_by, json_path, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        status = excluded.status,
        created_by = excluded.created_by,
        json_path = excluded.json_path,
        synced_at = excluded.synced_at
    `),
    changesDelete: db.query("DELETE FROM changes WHERE id = ?"),

    tasksList: db.query(
      "SELECT * FROM tasks WHERE change_id = ? ORDER BY priority, created_at",
    ),
    tasksListByStatus: db.query(
      "SELECT * FROM tasks WHERE change_id = ? AND status = ? ORDER BY priority, created_at",
    ),
    tasksGet: db.query("SELECT * FROM tasks WHERE id = ?"),
    tasksInsert: db.query(`
      INSERT INTO tasks (id, change_id, title, section, status, priority, created_at, started_at, completed_at, completed_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    tasksDeleteByChange: db.query("DELETE FROM tasks WHERE change_id = ?"),
    tasksPending: db.query(
      "SELECT * FROM tasks WHERE change_id = ? AND status = 'pending' ORDER BY priority",
    ),
    tasksBlockers: db.query(`
      SELECT d.target_id 
      FROM dependencies d
      JOIN tasks t ON d.target_id = t.id
      WHERE d.source_id = ? 
        AND d.type = 'blocked_by'
        AND t.status NOT IN ('done', 'cancelled')
    `),

    depInsert: db.query(
      "INSERT OR IGNORE INTO dependencies (source_id, target_id, type) VALUES (?, ?, ?)",
    ),

    deltaInsert: db.query(`
      INSERT INTO deltas (id, change_id, capability, operation, target_id, requirement_json, changes_json, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    deltasDeleteByChange: db.query("DELETE FROM deltas WHERE change_id = ?"),

    syncMetaGet: db.query("SELECT value FROM sync_meta WHERE key = ?"),
    syncMetaUpsert: db.query(`
      INSERT INTO sync_meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `),

    // Sync files with triple-attribute tracking
    syncFilesGet: db.query(
      "SELECT mtime_ms, size, inode FROM sync_files WHERE path = ?",
    ),
    syncFilesUpsert: db.query(`
      INSERT INTO sync_files (path, mtime_ms, size, inode, synced_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        mtime_ms = excluded.mtime_ms,
        size = excluded.size,
        inode = excluded.inode,
        synced_at = excluded.synced_at
    `),
    syncFilesDelete: db.query("DELETE FROM sync_files WHERE path = ?"),
  };

  return {
    db,

    specs: {
      list: (filter) => {
        if (filter?.name) {
          return stmts.specsListByName.all(filter.name) as SpecRow[];
        }
        return stmts.specsList.all() as SpecRow[];
      },

      get: (name) => {
        return stmts.specsGet.get(name) as SpecRow | null;
      },

      upsert: (spec, jsonPath) => {
        const now = new Date().toISOString();

        // Use transaction for atomic updates
        db.exec("BEGIN TRANSACTION");
        try {
          stmts.specsUpsert.run(
            spec.name,
            spec.title,
            spec.purpose,
            spec.version,
            spec.updated_at,
            jsonPath,
            now,
          );

          // Delete old requirements
          stmts.reqsDeleteBySpec.run(spec.name);

          // Insert requirements
          for (const req of spec.requirements) {
            stmts.reqsInsert.run(
              req.id,
              spec.name,
              req.title,
              req.body,
              req.priority,
              req.tags ? JSON.stringify(req.tags) : null,
            );

            // Insert scenarios
            for (const scenario of req.scenarios ?? []) {
              stmts.scenarioInsert.run(
                scenario.id,
                req.id,
                scenario.title,
                JSON.stringify(scenario.given),
                scenario.when,
                JSON.stringify(scenario.then),
              );
            }
          }
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },

      delete: (name) => {
        stmts.specsDelete.run(name);
      },
    },

    requirements: {
      list: (specName) => {
        return stmts.reqsList.all(specName) as RequirementRow[];
      },

      get: (id) => {
        return stmts.reqsGet.get(id) as RequirementRow | null;
      },

      search: (query, limit = 20) => {
        return stmts.reqsSearch.all(query, limit) as SearchResult[];
      },
    },

    changes: {
      list: (filter) => {
        if (filter?.status) {
          return stmts.changesListByStatus.all(filter.status) as ChangeRow[];
        }
        return stmts.changesList.all() as ChangeRow[];
      },

      get: (id) => {
        return stmts.changesGet.get(id) as ChangeRow | null;
      },

      upsert: (change, jsonPath) => {
        const now = new Date().toISOString();

        // Use transaction for atomic updates
        db.exec("BEGIN TRANSACTION");
        try {
          stmts.changesUpsert.run(
            change.id,
            change.title,
            change.status,
            change.created_at,
            change.created_by ?? null,
            jsonPath,
            now,
          );

          // Delete old tasks
          stmts.tasksDeleteByChange.run(change.id);

          // Insert tasks
          for (const task of change.tasks) {
            stmts.tasksInsert.run(
              task.id,
              change.id,
              task.title,
              task.section ?? null,
              task.status,
              task.priority ?? 0,
              task.created_at,
              task.started_at ?? null,
              task.completed_at ?? null,
              task.completed_by ?? null,
            );

            // Insert dependencies
            for (const dep of task.deps ?? []) {
              stmts.depInsert.run(task.id, dep.target, dep.type);
            }
          }

          // Delete old deltas
          stmts.deltasDeleteByChange.run(change.id);

          // Insert deltas
          for (const [capability, deltas] of Object.entries(change.deltas)) {
            for (const delta of deltas) {
              stmts.deltaInsert.run(
                delta.id,
                change.id,
                capability,
                delta.operation,
                "target_id" in delta ? delta.target_id : null,
                delta.operation === "add"
                  ? JSON.stringify(delta.requirement)
                  : null,
                delta.operation === "modify"
                  ? JSON.stringify(delta.changes)
                  : null,
                delta.operation === "remove" ? delta.reason : null,
              );
            }
          }
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },

      delete: (id) => {
        stmts.changesDelete.run(id);
      },
    },

    tasks: {
      list: (changeId, status) => {
        if (status) {
          return stmts.tasksListByStatus.all(changeId, status) as TaskRow[];
        }
        return stmts.tasksList.all(changeId) as TaskRow[];
      },

      get: (id) => {
        return stmts.tasksGet.get(id) as TaskRow | null;
      },

      ready: (changeId) => {
        const pending = stmts.tasksPending.all(changeId) as TaskRow[];

        const ready: TaskRow[] = [];
        const blocked: BlockedTask[] = [];

        for (const task of pending) {
          const blockers = stmts.tasksBlockers.all(task.id) as {
            target_id: string;
          }[];

          if (blockers.length === 0) {
            ready.push(task);
          } else {
            blocked.push({
              task,
              blockedBy: blockers.map((b) => b.target_id),
            });
          }
        }

        return { ready, blocked };
      },

      update: (id, updates) => {
        const fields: string[] = [];
        const values: (string | number | null)[] = [];

        if (updates.status !== undefined) {
          fields.push("status = ?");
          values.push(updates.status);
        }
        if (updates.started_at !== undefined) {
          fields.push("started_at = ?");
          values.push(updates.started_at ?? null);
        }
        if (updates.completed_at !== undefined) {
          fields.push("completed_at = ?");
          values.push(updates.completed_at ?? null);
        }
        if (updates.completed_by !== undefined) {
          fields.push("completed_by = ?");
          values.push(updates.completed_by ?? null);
        }

        if (fields.length > 0) {
          values.push(id);
          db.query(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`).run(
            ...values,
          );
        }
      },
    },

    sync: {
      needsSync: (path) => {
        try {
          const stats = statSync(path);
          const currentAttrs: FileAttrs = {
            mtime_ms: Math.floor(stats.mtimeMs),
            size: stats.size,
            inode: stats.ino,
          };
          const stored = stmts.syncFilesGet.get(path) as
            | { mtime_ms: number; size: number; inode: number }
            | undefined;
          
          if (!stored) return true;
          
          return (
            stored.mtime_ms !== currentAttrs.mtime_ms ||
            stored.size !== currentAttrs.size ||
            stored.inode !== currentAttrs.inode
          );
        } catch {
          return true;
        }
      },

      markSynced: (path) => {
        const stats = statSync(path);
        const attrs: FileAttrs = {
          mtime_ms: Math.floor(stats.mtimeMs),
          size: stats.size,
          inode: stats.ino,
        };
        const now = new Date().toISOString();
        stmts.syncFilesUpsert.run(
          path,
          attrs.mtime_ms,
          attrs.size,
          attrs.inode,
          now,
        );
      },

      getLastSync: () => {
        const result = stmts.syncMetaGet.get("last_sync") as
          | { value: string }
          | undefined;
        return result?.value ?? null;
      },
    },

    syncFiles: {
      needsSync: (path, attrs) => {
        const stored = stmts.syncFilesGet.get(path) as
          | { mtime_ms: number; size: number; inode: number }
          | undefined;

        // If no record exists, needs sync
        if (!stored) return true;

        // If no attrs provided (just checking existence), doesn't need sync
        if (!attrs) return false;

        // Triple-attribute comparison: all three must match
        return (
          stored.mtime_ms !== attrs.mtime_ms ||
          stored.size !== attrs.size ||
          stored.inode !== attrs.inode
        );
      },

      markSynced: (path, attrs) => {
        const now = new Date().toISOString();
        stmts.syncFilesUpsert.run(
          path,
          attrs.mtime_ms,
          attrs.size,
          attrs.inode,
          now,
        );
      },

      getFileAttrs: (path) => {
        const result = stmts.syncFilesGet.get(path) as
          | { mtime_ms: number; size: number; inode: number }
          | undefined;
        return result ?? null;
      },

      deleteFileRecord: (path) => {
        stmts.syncFilesDelete.run(path);
      },
    },

    close: () => {
      db.close();
    },
  };
}
