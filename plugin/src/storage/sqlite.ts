/**
 * SQLite Storage Layer
 *
 * Handles SQLite caching for fast queries.
 * JSON files remain source of truth; SQLite is derived.
 */

import { Database } from "bun:sqlite";
import type {
  Spec,
  Requirement,
  Scenario,
  Change,
  Task,
  Delta,
} from "../types";

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
  tags TEXT, -- JSON array
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
  given_json TEXT NOT NULL, -- JSON array
  when_clause TEXT NOT NULL,
  then_json TEXT NOT NULL -- JSON array
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
  requirement_json TEXT, -- For 'add' operations
  changes_json TEXT, -- For 'modify' operations
  reason TEXT -- For 'remove' operations
);

-- Sync metadata
CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
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

  // Sync
  sync: {
    needsSync: (jsonPath: string) => boolean;
    markSynced: (jsonPath: string) => void;
    getLastSync: () => string | null;
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

// =============================================================================
// Create Store
// =============================================================================

export function createSQLiteStore(dbPath: string): SQLiteStore {
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");

  // Run schema
  db.run(SCHEMA);

  return {
    db,

    specs: {
      list: (filter) => {
        let query = "SELECT * FROM specs";
        const params: string[] = [];

        if (filter?.name) {
          query += " WHERE name = ?";
          params.push(filter.name);
        }

        return db.query(query).all(...params) as SpecRow[];
      },

      get: (name) => {
        return db.query("SELECT * FROM specs WHERE name = ?").get(name) as SpecRow | null;
      },

      upsert: (spec, jsonPath) => {
        const now = new Date().toISOString();

        db.run(
          `INSERT INTO specs (name, title, purpose, version, updated_at, json_path, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(name) DO UPDATE SET
             title = excluded.title,
             purpose = excluded.purpose,
             version = excluded.version,
             updated_at = excluded.updated_at,
             json_path = excluded.json_path,
             synced_at = excluded.synced_at`,
          [spec.name, spec.title, spec.purpose, spec.version, spec.updated_at, jsonPath, now]
        );

        // Sync requirements
        db.run("DELETE FROM requirements WHERE spec_name = ?", [spec.name]);

        for (const req of spec.requirements) {
          db.run(
            `INSERT INTO requirements (id, spec_name, title, body, priority, tags)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              req.id,
              spec.name,
              req.title,
              req.body,
              req.priority,
              req.tags ? JSON.stringify(req.tags) : null,
            ]
          );

          // Sync scenarios
          for (const scenario of req.scenarios ?? []) {
            db.run(
              `INSERT INTO scenarios (id, requirement_id, title, given_json, when_clause, then_json)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                scenario.id,
                req.id,
                scenario.title,
                JSON.stringify(scenario.given),
                scenario.when,
                JSON.stringify(scenario.then),
              ]
            );
          }
        }
      },

      delete: (name) => {
        db.run("DELETE FROM specs WHERE name = ?", [name]);
      },
    },

    requirements: {
      list: (specName) => {
        return db
          .query("SELECT * FROM requirements WHERE spec_name = ?")
          .all(specName) as RequirementRow[];
      },

      get: (id) => {
        return db.query("SELECT * FROM requirements WHERE id = ?").get(id) as RequirementRow | null;
      },

      search: (query, limit = 20) => {
        return db
          .query(
            `SELECT r.id, r.spec_name, r.title, 
                    snippet(requirements_fts, 2, '<mark>', '</mark>', '...', 32) as match,
                    rank
             FROM requirements_fts
             JOIN requirements r ON requirements_fts.id = r.id
             WHERE requirements_fts MATCH ?
             ORDER BY rank
             LIMIT ?`
          )
          .all(query, limit) as SearchResult[];
      },
    },

    changes: {
      list: (filter) => {
        let query = "SELECT * FROM changes";
        const params: string[] = [];

        if (filter?.status) {
          query += " WHERE status = ?";
          params.push(filter.status);
        }

        query += " ORDER BY created_at DESC";

        return db.query(query).all(...params) as ChangeRow[];
      },

      get: (id) => {
        return db.query("SELECT * FROM changes WHERE id = ?").get(id) as ChangeRow | null;
      },

      upsert: (change, jsonPath) => {
        const now = new Date().toISOString();

        db.run(
          `INSERT INTO changes (id, title, status, created_at, created_by, json_path, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             status = excluded.status,
             created_by = excluded.created_by,
             json_path = excluded.json_path,
             synced_at = excluded.synced_at`,
          [
            change.id,
            change.title,
            change.status,
            change.created_at,
            change.created_by ?? null,
            jsonPath,
            now,
          ]
        );

        // Sync tasks
        db.run("DELETE FROM tasks WHERE change_id = ?", [change.id]);

        for (const task of change.tasks) {
          db.run(
            `INSERT INTO tasks (id, change_id, title, section, status, priority, created_at, started_at, completed_at, completed_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
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
            ]
          );

          // Sync dependencies
          for (const dep of task.deps ?? []) {
            db.run(
              `INSERT OR IGNORE INTO dependencies (source_id, target_id, type)
               VALUES (?, ?, ?)`,
              [task.id, dep.target, dep.type]
            );
          }
        }

        // Sync deltas
        db.run("DELETE FROM deltas WHERE change_id = ?", [change.id]);

        for (const [capability, deltas] of Object.entries(change.deltas)) {
          for (const delta of deltas) {
            db.run(
              `INSERT INTO deltas (id, change_id, capability, operation, target_id, requirement_json, changes_json, reason)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                delta.id,
                change.id,
                capability,
                delta.operation,
                "target_id" in delta ? delta.target_id : null,
                delta.operation === "add" ? JSON.stringify(delta.requirement) : null,
                delta.operation === "modify" ? JSON.stringify(delta.changes) : null,
                delta.operation === "remove" ? delta.reason : null,
              ]
            );
          }
        }
      },

      delete: (id) => {
        db.run("DELETE FROM changes WHERE id = ?", [id]);
      },
    },

    tasks: {
      list: (changeId, status) => {
        let query = "SELECT * FROM tasks WHERE change_id = ?";
        const params: (string | number)[] = [changeId];

        if (status) {
          query += " AND status = ?";
          params.push(status);
        }

        query += " ORDER BY priority, created_at";

        return db.query(query).all(...params) as TaskRow[];
      },

      get: (id) => {
        return db.query("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | null;
      },

      ready: (changeId) => {
        // Get all pending tasks
        const pending = db
          .query("SELECT * FROM tasks WHERE change_id = ? AND status = 'pending' ORDER BY priority")
          .all(changeId) as TaskRow[];

        const ready: TaskRow[] = [];
        const blocked: BlockedTask[] = [];

        for (const task of pending) {
          // Check if blocked by incomplete tasks
          const blockers = db
            .query(
              `SELECT d.target_id 
               FROM dependencies d
               JOIN tasks t ON d.target_id = t.id
               WHERE d.source_id = ? 
                 AND d.type = 'blocked_by'
                 AND t.status NOT IN ('done', 'cancelled')`
            )
            .all(task.id) as { target_id: string }[];

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
          db.run(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`, values);
        }
      },
    },

    sync: {
      needsSync: (jsonPath) => {
        const result = db
          .query("SELECT value FROM sync_meta WHERE key = ?")
          .get(`mtime:${jsonPath}`) as { value: string } | null;

        if (!result) return true;

        try {
          const file = Bun.file(jsonPath);
          const stat = file.size; // Check if file exists
          return stat > 0; // Simple check - in production, compare mtimes
        } catch {
          return true;
        }
      },

      markSynced: (jsonPath) => {
        const now = new Date().toISOString();
        db.run(
          `INSERT INTO sync_meta (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [`mtime:${jsonPath}`, now]
        );
      },

      getLastSync: () => {
        const result = db
          .query("SELECT value FROM sync_meta WHERE key = 'last_sync'")
          .get() as { value: string } | null;
        return result?.value ?? null;
      },
    },

    close: () => {
      db.close();
    },
  };
}
