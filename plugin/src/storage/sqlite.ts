/**
 * SQLite Storage Layer
 *
 * Handles SQLite caching for fast queries.
 * JSON files remain source of truth; SQLite is derived.
 *
 * Uses bun:sqlite for Bun runtime compatibility.
 */

import { Database } from "bun:sqlite";
import type { Spec, Change, Task } from "../types";
import { createLogger } from "../utils/debug-log";

const logger = createLogger("sqlite");

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
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending', 'active', 'archived', 'closed')),
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
  type TEXT NOT NULL DEFAULT 'code' CHECK (type IN ('code', 'docs', 'ops', 'research', 'approval', 'verification')),
  section TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
  priority INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  completed_by TEXT,
  cancellation_reason TEXT
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
  operation TEXT NOT NULL CHECK (operation IN ('add', 'modify', 'remove', 'rename')),
  target_id TEXT,
  requirement_json TEXT,
  changes_json TEXT,
  reason TEXT
);

-- Task Metadata (key-value pairs for agent-driven filtering)
CREATE TABLE IF NOT EXISTS task_metadata (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  change_id TEXT NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (task_id, key)
);

-- Index for has_metadata_key:<key> queries (by change + key)
CREATE INDEX IF NOT EXISTS idx_task_metadata_change_key ON task_metadata (change_id, key);

-- Index for metadata:<key>=<value> queries (by change + key + value)
CREATE INDEX IF NOT EXISTS idx_task_metadata_change_key_value ON task_metadata (change_id, key, value);

-- Wisdom (derived cache from change.json.wisdom[] and wisdom.jsonl)
CREATE TABLE IF NOT EXISTS wisdom (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('change', 'project')),
  change_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('pattern', 'success', 'failure', 'gotcha', 'convention')),
  content TEXT NOT NULL,
  source_task TEXT,
  source_change TEXT,
  recorded_at TEXT NOT NULL
);

-- Wisdom FTS (Full-Text Search)
CREATE VIRTUAL TABLE IF NOT EXISTS wisdom_fts USING fts5(
  id,
  content,
  type,
  content=wisdom,
  content_rowid=rowid
);

-- Triggers for wisdom FTS sync
CREATE TRIGGER IF NOT EXISTS wisdom_ai AFTER INSERT ON wisdom BEGIN
  INSERT INTO wisdom_fts(rowid, id, content, type)
  VALUES (NEW.rowid, NEW.id, NEW.content, NEW.type);
END;

CREATE TRIGGER IF NOT EXISTS wisdom_ad AFTER DELETE ON wisdom BEGIN
  INSERT INTO wisdom_fts(wisdom_fts, rowid, id, content, type)
  VALUES ('delete', OLD.rowid, OLD.id, OLD.content, OLD.type);
END;

CREATE TRIGGER IF NOT EXISTS wisdom_au AFTER UPDATE ON wisdom BEGIN
  INSERT INTO wisdom_fts(wisdom_fts, rowid, id, content, type)
  VALUES ('delete', OLD.rowid, OLD.id, OLD.content, OLD.type);
  INSERT INTO wisdom_fts(rowid, id, content, type)
  VALUES (NEW.rowid, NEW.id, NEW.content, NEW.type);
END;

-- Index for per-change wisdom queries
CREATE INDEX IF NOT EXISTS idx_wisdom_change_id ON wisdom (change_id);

-- Index for scope-based queries
CREATE INDEX IF NOT EXISTS idx_wisdom_scope ON wisdom (scope);

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
    specsByTag: (tag: string) => string[];
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
    ready: (changeId: string) => {
      ready: TaskRow[];
      blocked: BlockedTask[];
      cancelledBlockerContext?: CancelledBlockerContext[];
    };
    update: (id: string, updates: Partial<Task>) => void;
    countByChange: () => { change_id: string; total: number; done: number }[];
  };

  // Wisdom (derived cache from change.json.wisdom[] and wisdom.jsonl)
  wisdom: {
    upsertBatch: (
      changeId: string,
      entries: {
        id: string;
        type: string;
        content: string;
        source_task?: string;
        recorded_at: string;
      }[],
    ) => void;
    upsertProject: (
      entries: {
        id: string;
        type: string;
        content: string;
        source_change?: string;
        source_task?: string;
        promoted_at: string;
      }[],
    ) => void;
    deleteByChange: (changeId: string) => void;
    deleteProjectScope: () => void;
    search: (
      query: string,
      options?: {
        changeId?: string;
        scope?: string;
        type?: string;
        limit?: number;
      },
    ) => WisdomSearchResult[];
    listAll: (options?: { scope?: string; type?: string }) => WisdomRow[];
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
  type: string;
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

export interface WisdomRow {
  id: string;
  scope: string;
  change_id: string | null;
  type: string;
  content: string;
  source_task: string | null;
  source_change: string | null;
  recorded_at: string;
}

export interface WisdomSearchResult {
  id: string;
  scope: string;
  change_id: string | null;
  type: string;
  content: string;
  match: string;
  rank: number;
}

function sanitizeFtsQuery(query: string): string {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/["'()*:]/g, ""))
    .filter(
      (token) =>
        token.length > 0 &&
        !["AND", "OR", "NOT", "NEAR"].includes(token.toUpperCase()),
    );

  return tokens.map((token) => `"${token}"`).join(" ");
}

/** Context for a pending task that was unblocked by a cancelled blocker */
export interface CancelledBlockerContext {
  /** The pending task that was unblocked */
  taskId: string;
  /** The blocker task that was cancelled */
  cancelledBlockerId: string;
  /** The cancellation reason from the cancelled blocker */
  cancellationReason: string;
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
// FTS Snippet Constants
// =============================================================================

/** Column index for the `title` column in the requirements_fts virtual table. */
const FTS_REQ_SNIPPET_COL = 2;
/** Column index for the `content` column in the wisdom_fts virtual table. */
const FTS_WISDOM_SNIPPET_COL = 1;
/** Max tokens in FTS snippet output. */
const FTS_SNIPPET_TOKENS = 32;
/** Opening mark tag for FTS snippet highlights. */
const FTS_MARK_START = "<mark>";
/** Closing mark tag for FTS snippet highlights. */
const FTS_MARK_END = "</mark>";
/** Ellipsis shown at snippet boundaries. */
const FTS_ELLIPSIS = "...";

// =============================================================================
// Create Store
// =============================================================================

/**
 * Run a single migration step inside a driver-native transaction.
 *
 * The body is invoked via `db.transaction(fn)()`, which commits on
 * success and rolls back on any thrown error. Failures are logged and
 * swallowed — migrations are idempotent and the caller continues to the
 * next step (SQLite is a derived cache; JSON remains the source of
 * truth).
 *
 * Exported for focused test coverage; production callers reach it via
 * `runMigrations`.
 */
export function runMigrationStep(
  db: Database,
  name: string,
  fn: () => void,
): void {
  try {
    const tx = db.transaction(fn);
    tx();
  } catch (err) {
    logger.warn(`Migration ${name} failed: ${(err as Error).message}`);
  }
}

/**
 * Run all schema migrations. Safe to call on every DB open.
 * SQLite is a derived cache — all migrations are idempotent.
 */
function runMigrations(db: Database): void {
  // Migration: update deltas CHECK constraint to include 'rename'.
  // SQLite doesn't support ALTER TABLE ... ALTER COLUMN, so we recreate
  // the table if the old constraint is present. This is safe because
  // SQLite is a derived cache — data will be re-synced from JSON.
  runMigrationStep(db, "deltas-constraint-rename", () => {
    const tableInfo = db
      .query(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='deltas'",
      )
      .get() as { sql: string } | null;
    if (tableInfo?.sql && !tableInfo.sql.includes("'rename'")) {
      db.exec("DROP TABLE IF EXISTS deltas");
      db.exec(`
        CREATE TABLE deltas (
          id TEXT PRIMARY KEY,
          change_id TEXT NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
          capability TEXT NOT NULL,
          operation TEXT NOT NULL CHECK (operation IN ('add', 'modify', 'remove', 'rename')),
          target_id TEXT,
          requirement_json TEXT,
          changes_json TEXT,
          reason TEXT
        )
      `);
    }
  });

  // Migration: update changes CHECK constraint to include 'closed'.
  runMigrationStep(db, "changes-constraint-closed", () => {
    const tableInfo = db
      .query(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='changes'",
      )
      .get() as { sql: string } | null;
    if (tableInfo?.sql && !tableInfo.sql.includes("'closed'")) {
      db.exec("DROP TABLE IF EXISTS changes");
      db.exec(`
        CREATE TABLE changes (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('draft', 'pending', 'active', 'archived', 'closed')),
          created_at TEXT NOT NULL,
          created_by TEXT,
          json_path TEXT NOT NULL,
          synced_at TEXT NOT NULL
        )
      `);
    }
  });

  // Migration: add 'type' column to tasks table.
  runMigrationStep(db, "tasks-type-column", () => {
    const tableInfo = db
      .query(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'",
      )
      .get() as { sql: string } | null;
    if (tableInfo?.sql && !tableInfo.sql.includes("'verification'")) {
      db.exec("DROP TABLE IF EXISTS tasks");
      db.exec(`
        CREATE TABLE tasks (
          id TEXT PRIMARY KEY,
          change_id TEXT NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'code' CHECK (type IN ('code', 'docs', 'ops', 'research', 'approval', 'verification')),
          section TEXT,
          status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
          priority INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT,
          completed_by TEXT,
          cancellation_reason TEXT
        )
      `);
    }
  });

  // Migration: add cancellation_reason column to pre-existing tasks tables.
  runMigrationStep(db, "tasks-cancellation-reason-column", () => {
    const taskCols = db.query("PRAGMA table_info(tasks)").all() as Array<{
      name: string;
    }>;
    const hasCol = taskCols.some((c) => c.name === "cancellation_reason");
    if (!hasCol) {
      db.exec("ALTER TABLE tasks ADD COLUMN cancellation_reason TEXT");
    }
  });

  // Migration: remove legacy sync_meta table.
  runMigrationStep(db, "drop-legacy-sync-meta", () => {
    const hasSyncMeta = db
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='sync_meta'",
      )
      .get();
    if (hasSyncMeta) {
      db.exec("DROP TABLE sync_meta");
    }
  });
}

/** Return type for prepareStatements — inferred from the factory. */
type _Statements = ReturnType<typeof prepareStatements>;

/**
 * Prepare all SQL statements for the lifetime of this store instance.
 * Called once after schema creation and migrations.
 */
function prepareStatements(db: Database) {
  return {
    specsList: db.query("SELECT * FROM specs"),
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
             snippet(requirements_fts, ${FTS_REQ_SNIPPET_COL}, '${FTS_MARK_START}', '${FTS_MARK_END}', '${FTS_ELLIPSIS}', ${FTS_SNIPPET_TOKENS}) as match,
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
      INSERT INTO tasks (id, change_id, title, type, section, status, priority, created_at, started_at, completed_at, completed_by, cancellation_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    tasksDeleteByChange: db.query("DELETE FROM tasks WHERE change_id = ?"),
    taskMetadataInsert: db.query(
      "INSERT OR REPLACE INTO task_metadata (task_id, change_id, key, value) VALUES (?, ?, ?, ?)",
    ),
    taskMetadataDeleteByChange: db.query(
      "DELETE FROM task_metadata WHERE change_id = ?",
    ),
    tasksPending: db.query(
      "SELECT * FROM tasks WHERE change_id = ? AND status = 'pending' ORDER BY priority",
    ),
    depInsert: db.query(
      "INSERT OR IGNORE INTO dependencies (source_id, target_id, type) VALUES (?, ?, ?)",
    ),

    deltaInsert: db.query(`
      INSERT INTO deltas (id, change_id, capability, operation, target_id, requirement_json, changes_json, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    deltasDeleteByChange: db.query("DELETE FROM deltas WHERE change_id = ?"),

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

    tasksCountByChange: db.query(`
      SELECT change_id,
             COUNT(*) AS total,
             SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
      FROM tasks
      GROUP BY change_id
    `),

    reqsSpecsByTag: db.query(`
      SELECT DISTINCT spec_name FROM requirements WHERE tags LIKE ?
    `),

    allBlockersForChange: db.query(`
      SELECT d.source_id, d.target_id
      FROM dependencies d
      JOIN tasks blocker_task ON d.target_id = blocker_task.id
      JOIN tasks pending_task ON d.source_id = pending_task.id
      WHERE pending_task.change_id = ?
        AND pending_task.status = 'pending'
        AND d.type = 'blocked_by'
        AND blocker_task.status NOT IN ('done', 'cancelled')
    `),

    cancelledBlockersForChange: db.query(`
      SELECT d.source_id AS task_id, d.target_id AS cancelled_blocker_id, blocker_task.cancellation_reason
      FROM dependencies d
      JOIN tasks blocker_task ON d.target_id = blocker_task.id
      JOIN tasks pending_task ON d.source_id = pending_task.id
      WHERE pending_task.change_id = ?
        AND pending_task.status = 'pending'
        AND d.type = 'blocked_by'
        AND blocker_task.status = 'cancelled'
        AND blocker_task.cancellation_reason IS NOT NULL
    `),

    wisdomUpsert: db.query(`
      INSERT OR REPLACE INTO wisdom (id, scope, change_id, type, content, source_task, source_change, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    wisdomDeleteByChange: db.query("DELETE FROM wisdom WHERE change_id = ?"),
    wisdomDeleteProjectScope: db.query(
      "DELETE FROM wisdom WHERE scope = 'project'",
    ),
    wisdomListAll: db.query("SELECT * FROM wisdom ORDER BY recorded_at DESC"),
    wisdomListByScope: db.query(
      "SELECT * FROM wisdom WHERE scope = ? ORDER BY recorded_at DESC",
    ),
    wisdomListByType: db.query(
      "SELECT * FROM wisdom WHERE type = ? ORDER BY recorded_at DESC",
    ),
    wisdomListByScopeAndType: db.query(
      "SELECT * FROM wisdom WHERE scope = ? AND type = ? ORDER BY recorded_at DESC",
    ),
  };
}

export function createSQLiteStore(dbPath: string): SQLiteStore {
  const db = new Database(dbPath, { create: true });

  // Note: PRAGMA settings moved to initDatabase() in health.ts
  db.exec(SCHEMA);
  runMigrations(db);
  const stmts = prepareStatements(db);

  return {
    db,

    specs: {
      list: (filter) => {
        if (filter?.name) {
          return stmts.specsGet.all(filter.name) as SpecRow[];
        }
        return stmts.specsList.all() as SpecRow[];
      },

      get: (name) => {
        return stmts.specsGet.get(name) as SpecRow | null;
      },

      upsert: (spec, jsonPath) => {
        const now = new Date().toISOString();

        // Use IMMEDIATE transaction to acquire write lock upfront
        db.exec("BEGIN IMMEDIATE TRANSACTION");
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

      specsByTag: (tag: string) => {
        // Escape SQL LIKE wildcards (%, _) in the tag value before wrapping
        const escaped = tag.replace(/%/g, "\\%").replace(/_/g, "\\_");
        const pattern = `%"${escaped}"%`;
        return (
          stmts.reqsSpecsByTag.all(pattern) as { spec_name: string }[]
        ).map((r) => r.spec_name);
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

        // Use IMMEDIATE transaction to acquire write lock upfront
        db.exec("BEGIN IMMEDIATE TRANSACTION");
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

          // Delete old tasks (and their metadata via CASCADE)
          stmts.tasksDeleteByChange.run(change.id);
          stmts.taskMetadataDeleteByChange.run(change.id);

          // Insert tasks
          for (const task of change.tasks) {
            stmts.tasksInsert.run(
              task.id,
              change.id,
              task.title,
              task.type ?? "code",
              task.section ?? null,
              task.status,
              task.priority ?? 0,
              task.created_at,
              task.started_at ?? null,
              task.completed_at ?? null,
              task.completed_by ?? null,
              task.cancellation?.reason ?? null,
            );

            // Insert dependencies
            for (const dep of task.deps ?? []) {
              stmts.depInsert.run(task.id, dep.target, dep.type);
            }

            // Insert metadata key-value pairs
            if (task.metadata) {
              for (const [key, value] of Object.entries(task.metadata)) {
                stmts.taskMetadataInsert.run(task.id, change.id, key, value);
              }
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
                  : delta.operation === "rename"
                    ? JSON.stringify({
                        new_title: delta.new_title,
                        ...(delta.new_id ? { new_id: delta.new_id } : {}),
                      })
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

      countByChange: () => {
        return stmts.tasksCountByChange.all() as {
          change_id: string;
          total: number;
          done: number;
        }[];
      },

      ready: (changeId) => {
        const pending = stmts.tasksPending.all(changeId) as TaskRow[];

        // Batch-fetch all active blockers for this change's pending tasks
        const blockerRows = stmts.allBlockersForChange.all(changeId) as {
          source_id: string;
          target_id: string;
        }[];
        const blockerMap = new Map<string, string[]>();
        for (const row of blockerRows) {
          const existing = blockerMap.get(row.source_id) ?? [];
          existing.push(row.target_id);
          blockerMap.set(row.source_id, existing);
        }

        // Fetch cancelled blocker context for tasks unblocked by cancellation
        const cancelledRows = stmts.cancelledBlockersForChange.all(
          changeId,
        ) as {
          task_id: string;
          cancelled_blocker_id: string;
          cancellation_reason: string | null;
        }[];
        const cancelledContextMap = new Map<
          string,
          { cancelledBlockerId: string; cancellationReason: string }[]
        >();
        for (const row of cancelledRows) {
          if (row.cancellation_reason) {
            const existing = cancelledContextMap.get(row.task_id) ?? [];
            existing.push({
              cancelledBlockerId: row.cancelled_blocker_id,
              cancellationReason: row.cancellation_reason,
            });
            cancelledContextMap.set(row.task_id, existing);
          }
        }

        const ready: TaskRow[] = [];
        const blocked: BlockedTask[] = [];

        for (const task of pending) {
          const taskBlockers = blockerMap.get(task.id);
          if (!taskBlockers || taskBlockers.length === 0) {
            ready.push(task);
          } else {
            blocked.push({
              task,
              blockedBy: taskBlockers,
            });
          }
        }

        // Build cancelled context for ready tasks that were unblocked by cancellation
        const cancelledBlockerContext: CancelledBlockerContext[] = [];
        for (const task of ready) {
          const ctxList = cancelledContextMap.get(task.id);
          if (ctxList) {
            for (const ctx of ctxList) {
              cancelledBlockerContext.push({ taskId: task.id, ...ctx });
            }
          }
        }

        return {
          ready,
          blocked,
          cancelledBlockerContext:
            cancelledBlockerContext.length > 0
              ? cancelledBlockerContext
              : undefined,
        };
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

    wisdom: {
      upsertBatch: (changeId, entries) => {
        for (const entry of entries) {
          stmts.wisdomUpsert.run(
            entry.id,
            "change",
            changeId,
            entry.type,
            entry.content,
            entry.source_task ?? null,
            null, // source_change is null for change-level entries
            entry.recorded_at,
          );
        }
      },

      upsertProject: (entries) => {
        for (const entry of entries) {
          stmts.wisdomUpsert.run(
            entry.id,
            "project",
            null, // change_id is null for project-level entries
            entry.type,
            entry.content,
            entry.source_task ?? null,
            entry.source_change ?? null,
            entry.promoted_at,
          );
        }
      },

      deleteByChange: (changeId) => {
        stmts.wisdomDeleteByChange.run(changeId);
      },

      deleteProjectScope: () => {
        stmts.wisdomDeleteProjectScope.run();
      },

      search: (query, options) => {
        const limit = options?.limit ?? 20;
        const sanitizedQuery = sanitizeFtsQuery(query);
        if (!sanitizedQuery) {
          return [];
        }

        const conditions: string[] = ["wisdom_fts MATCH ?"];
        const params: (string | number)[] = [sanitizedQuery];

        if (options?.changeId) {
          conditions.push("w.change_id = ?");
          params.push(options.changeId);
        }
        if (options?.scope) {
          conditions.push("w.scope = ?");
          params.push(options.scope);
        }
        if (options?.type) {
          conditions.push("w.type = ?");
          params.push(options.type);
        }
        params.push(limit);

        const sql = `
          SELECT w.id, w.scope, w.change_id, w.type, w.content,
                 snippet(wisdom_fts, ${FTS_WISDOM_SNIPPET_COL}, '${FTS_MARK_START}', '${FTS_MARK_END}', '${FTS_ELLIPSIS}', ${FTS_SNIPPET_TOKENS}) as match,
                 rank
          FROM wisdom_fts
          JOIN wisdom w ON wisdom_fts.id = w.id
          WHERE ${conditions.join(" AND ")}
          ORDER BY rank
          LIMIT ?
        `;
        return db.query(sql).all(...params) as WisdomSearchResult[];
      },

      listAll: (options) => {
        if (options?.scope && options?.type) {
          return stmts.wisdomListByScopeAndType.all(
            options.scope,
            options.type,
          ) as WisdomRow[];
        }
        if (options?.scope) {
          return stmts.wisdomListByScope.all(options.scope) as WisdomRow[];
        }
        if (options?.type) {
          return stmts.wisdomListByType.all(options.type) as WisdomRow[];
        }
        return stmts.wisdomListAll.all() as WisdomRow[];
      },
    },

    close: () => {
      db.close();
    },
  };
}
