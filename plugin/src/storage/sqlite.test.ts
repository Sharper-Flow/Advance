/**
 * SQLite Storage Tests
 *
 * Test SQLite CRUD operations and FTS5 search
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createSQLiteStore, type SQLiteStore } from "./sqlite";
import { initDatabase } from "./health";
import type { Change, Spec } from "../types";
import {
  createTempDir,
  cleanupTempDir,
  SAMPLE_SPEC,
  SAMPLE_CHANGE,
} from "../__tests__/setup";

describe("SQLiteStore", () => {
  let tempDir: string;
  let store: SQLiteStore;

  beforeEach(async () => {
    tempDir = await createTempDir();
    const dbPath = join(tempDir, "test.db");
    store = createSQLiteStore(dbPath);
    // Enable foreign keys for CASCADE to work
    initDatabase(store.db);
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
  });

  describe("specs", () => {
    test("list returns empty array initially", () => {
      const specs = store.specs.list();
      expect(specs).toEqual([]);
    });

    test("upsert creates new spec", () => {
      store.specs.upsert(SAMPLE_SPEC as Spec, "/path/to/spec.json");

      const specs = store.specs.list();
      expect(specs).toHaveLength(1);
      expect(specs[0].name).toBe("test-capability");
    });

    test("get returns spec by name", () => {
      store.specs.upsert(SAMPLE_SPEC as Spec, "/path/to/spec.json");

      const spec = store.specs.get("test-capability");
      expect(spec).not.toBeNull();
      expect(spec!.title).toBe("Test Capability");
    });

    test("get returns null for missing spec", () => {
      const spec = store.specs.get("nonexistent");
      expect(spec).toBeNull();
    });

    test("upsert updates existing spec", () => {
      store.specs.upsert(SAMPLE_SPEC as Spec, "/path/to/spec.json");

      const updated = { ...SAMPLE_SPEC, title: "Updated Title" } as Spec;
      store.specs.upsert(updated, "/path/to/spec.json");

      const spec = store.specs.get("test-capability");
      expect(spec!.title).toBe("Updated Title");
    });

    test("delete removes spec", () => {
      store.specs.upsert(SAMPLE_SPEC as Spec, "/path/to/spec.json");
      store.specs.delete("test-capability");

      expect(store.specs.list()).toHaveLength(0);
    });

    test("list filters by name", () => {
      store.specs.upsert(SAMPLE_SPEC as Spec, "/path/1.json");

      // Create a different spec with different requirement IDs
      const otherSpec = {
        ...SAMPLE_SPEC,
        name: "other-cap",
        requirements: SAMPLE_SPEC.requirements.map((r, i) => ({
          ...r,
          id: `rq-other${i}`,
          scenarios:
            r.scenarios?.map((s, j) => ({ ...s, id: `rq-other${i}.${j}` })) ??
            [],
        })),
      };
      store.specs.upsert(otherSpec as Spec, "/path/2.json");

      const filtered = store.specs.list({ name: "test-capability" });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe("test-capability");
    });
  });

  describe("requirements", () => {
    beforeEach(() => {
      store.specs.upsert(SAMPLE_SPEC as Spec, "/path/to/spec.json");
    });

    test("list returns requirements for spec", () => {
      const reqs = store.requirements.list("test-capability");
      expect(reqs).toHaveLength(2);
    });

    test("get returns requirement by id", () => {
      const req = store.requirements.get("rq-test0001");
      expect(req).not.toBeNull();
      expect(req!.title).toBe("Sample Requirement");
    });

    test("search finds requirements by text", () => {
      const results = store.requirements.search("authentication");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("rq-test0002");
    });

    test("search finds requirements by title", () => {
      const results = store.requirements.search("Sample");
      expect(results.length).toBeGreaterThan(0);
    });

    test("search respects limit", () => {
      const results = store.requirements.search("requirement", 1);
      expect(results).toHaveLength(1);
    });
  });

  describe("changes", () => {
    test("list returns empty array initially", () => {
      const changes = store.changes.list();
      expect(changes).toEqual([]);
    });

    test("upsert creates new change", () => {
      store.changes.upsert(SAMPLE_CHANGE as Change, "/path/to/change.json");

      const changes = store.changes.list();
      expect(changes).toHaveLength(1);
      expect(changes[0].id).toBe("addFeature");
    });

    test("list filters by status", () => {
      store.changes.upsert(SAMPLE_CHANGE as Change, "/path/1.json");

      // Create archived change with different task and delta IDs
      const archivedChange = {
        ...SAMPLE_CHANGE,
        id: "archived-xyz",
        status: "archived",
        tasks: SAMPLE_CHANGE.tasks.map((t, i) => ({
          ...t,
          id: `tk-archived${i}`,
        })),
        deltas: Object.fromEntries(
          Object.entries(SAMPLE_CHANGE.deltas).map(([cap, deltas]) => [
            cap,
            deltas.map((d, i) => ({ ...d, id: `dl-archived${i}` })),
          ]),
        ),
      };
      store.changes.upsert(archivedChange as Change, "/path/2.json");

      const active = store.changes.list({ status: "active" });
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe("addFeature");
    });

    test("get returns change by id", () => {
      store.changes.upsert(SAMPLE_CHANGE as Change, "/path/to/change.json");

      const change = store.changes.get("addFeature");
      expect(change).not.toBeNull();
      expect(change!.title).toBe("Add New Feature");
    });

    test("delete removes change", () => {
      store.changes.upsert(SAMPLE_CHANGE as Change, "/path/to/change.json");
      store.changes.delete("addFeature");

      expect(store.changes.list()).toHaveLength(0);
    });

    test("upsert handles change with rename deltas", () => {
      const changeWithRename: Change = {
        id: "rename-test",
        title: "Rename Test",
        status: "active",
        created_at: new Date().toISOString(),
        tasks: [
          {
            id: "tk-ren001",
            title: "Rename task",
            status: "pending",
            priority: 0,
            created_at: new Date().toISOString(),
          },
        ],
        deltas: {
          "test-capability": [
            {
              id: "dl-ren001",
              operation: "rename" as const,
              target_id: "rq-test0001",
              new_title: "Renamed Requirement",
              new_id: "rq-renamed1",
            },
          ],
        },
      };

      // Should not throw — rename operation is accepted by the schema
      expect(() => {
        store.changes.upsert(changeWithRename, "/path/to/rename.json");
      }).not.toThrow();

      const change = store.changes.get("rename-test");
      expect(change).not.toBeNull();
      expect(change!.title).toBe("Rename Test");

      // Verify the delta was stored by querying the deltas table directly
      const deltas = store.db
        .query("SELECT * FROM deltas WHERE change_id = ?")
        .all("rename-test") as Array<{
        id: string;
        operation: string;
        target_id: string;
        changes_json: string | null;
      }>;
      expect(deltas).toHaveLength(1);
      expect(deltas[0].operation).toBe("rename");
      expect(deltas[0].target_id).toBe("rq-test0001");

      // Rename data stored in changes_json
      const renameData = JSON.parse(deltas[0].changes_json!);
      expect(renameData.new_title).toBe("Renamed Requirement");
      expect(renameData.new_id).toBe("rq-renamed1");
    });
  });

  describe("tasks", () => {
    beforeEach(() => {
      store.changes.upsert(SAMPLE_CHANGE as Change, "/path/to/change.json");
    });

    test("list returns tasks for change", () => {
      const tasks = store.tasks.list("addFeature");
      expect(tasks).toHaveLength(3);
    });

    test("list filters by status", () => {
      // First update a task
      store.tasks.update("tk-task0001", { status: "in_progress" });

      const pending = store.tasks.list("addFeature", "pending");
      expect(pending).toHaveLength(2);

      const inProgress = store.tasks.list("addFeature", "in_progress");
      expect(inProgress).toHaveLength(1);
    });

    test("get returns task by id", () => {
      const task = store.tasks.get("tk-task0001");
      expect(task).not.toBeNull();
      expect(task!.title).toBe("Implement core logic");
    });

    test("update modifies task", () => {
      store.tasks.update("tk-task0001", {
        status: "done",
        completed_at: "2026-01-21T12:00:00Z",
      });

      const task = store.tasks.get("tk-task0001");
      expect(task!.status).toBe("done");
      expect(task!.completed_at).toBe("2026-01-21T12:00:00Z");
    });

    test("ready returns unblocked tasks", () => {
      const { ready, blocked } = store.tasks.ready("addFeature");

      // Only tk-task0001 has no blockers
      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe("tk-task0001");

      // tk-task0002 and tk-task0003 are blocked
      expect(blocked).toHaveLength(2);
    });

    test("ready updates when blocker completes", () => {
      // Complete the first task
      store.tasks.update("tk-task0001", { status: "done" });

      const { ready, blocked } = store.tasks.ready("addFeature");

      // Now tk-task0002 should be ready
      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe("tk-task0002");

      // Only tk-task0003 still blocked
      expect(blocked).toHaveLength(1);
      expect(blocked[0].task.id).toBe("tk-task0003");
      expect(blocked[0].blockedBy).toContain("tk-task0002");
    });

    test("ready includes cancelled blocker context (Leak #8)", () => {
      // Upsert a change where tk-task0001 is cancelled with a reason
      const changeWithCancelledBlocker = {
        ...SAMPLE_CHANGE,
        tasks: [
          {
            ...SAMPLE_CHANGE.tasks[0], // tk-task0001
            status: "cancelled" as const,
            completed_at: new Date().toISOString(),
            cancellation: {
              reason: "Absorbed into tk-task0002 (scope reduced)",
              approved_by_user: true as const,
              approval_evidence: "User approved in question tool",
              approved_at: new Date().toISOString(),
            },
          },
          SAMPLE_CHANGE.tasks[1], // tk-task0002 (blocked by tk-task0001)
          SAMPLE_CHANGE.tasks[2], // tk-task0003 (blocked by tk-task0002)
        ],
      };
      store.changes.upsert(
        changeWithCancelledBlocker as Change,
        "/path/to/change.json",
      );

      const { ready, cancelledBlockerContext } =
        store.tasks.ready("addFeature");

      // tk-task0002 is now ready (its blocker was cancelled)
      expect(ready.some((t) => t.id === "tk-task0002")).toBe(true);

      // cancelledBlockerContext should include why tk-task0002 was unblocked
      expect(cancelledBlockerContext).toBeDefined();
      const ctx = cancelledBlockerContext?.find(
        (c) => c.taskId === "tk-task0002",
      );
      expect(ctx).toBeDefined();
      expect(ctx?.cancelledBlockerId).toBe("tk-task0001");
      expect(ctx?.cancellationReason).toBe(
        "Absorbed into tk-task0002 (scope reduced)",
      );
    });
  });

  // Note: legacy `sync` namespace removed. All sync tests now use `syncFiles` — see below.

  describe("syncFiles (triple-attribute tracking)", () => {
    test("needsSyncTriple returns true for new path", () => {
      expect(store.syncFiles.needsSync("/some/new/path.json")).toBe(true);
    });

    test("needsSyncTriple returns false when attributes match", () => {
      const attrs = { mtime_ms: 1234567890123, size: 1024, inode: 9876543 };
      store.syncFiles.markSynced("/some/path.json", attrs);

      expect(store.syncFiles.needsSync("/some/path.json", attrs)).toBe(false);
    });

    test("needsSyncTriple returns true when mtime differs", () => {
      const originalAttrs = {
        mtime_ms: 1234567890123,
        size: 1024,
        inode: 9876543,
      };
      store.syncFiles.markSynced("/some/path.json", originalAttrs);

      const newAttrs = { mtime_ms: 1234567899999, size: 1024, inode: 9876543 };
      expect(store.syncFiles.needsSync("/some/path.json", newAttrs)).toBe(true);
    });

    test("needsSyncTriple returns true when size differs", () => {
      const originalAttrs = {
        mtime_ms: 1234567890123,
        size: 1024,
        inode: 9876543,
      };
      store.syncFiles.markSynced("/some/path.json", originalAttrs);

      const newAttrs = { mtime_ms: 1234567890123, size: 2048, inode: 9876543 };
      expect(store.syncFiles.needsSync("/some/path.json", newAttrs)).toBe(true);
    });

    test("needsSyncTriple returns true when inode differs", () => {
      const originalAttrs = {
        mtime_ms: 1234567890123,
        size: 1024,
        inode: 9876543,
      };
      store.syncFiles.markSynced("/some/path.json", originalAttrs);

      const newAttrs = { mtime_ms: 1234567890123, size: 1024, inode: 1111111 };
      expect(store.syncFiles.needsSync("/some/path.json", newAttrs)).toBe(true);
    });

    test("getFileAttrs returns null for unknown path", () => {
      expect(store.syncFiles.getFileAttrs("/unknown/path.json")).toBeNull();
    });

    test("getFileAttrs returns stored attributes", () => {
      const attrs = { mtime_ms: 1234567890123, size: 1024, inode: 9876543 };
      store.syncFiles.markSynced("/some/path.json", attrs);

      const stored = store.syncFiles.getFileAttrs("/some/path.json");
      expect(stored).toEqual(attrs);
    });

    test("deleteFileRecord removes sync record", () => {
      const attrs = { mtime_ms: 1234567890123, size: 1024, inode: 9876543 };
      store.syncFiles.markSynced("/some/path.json", attrs);
      expect(store.syncFiles.needsSync("/some/path.json", attrs)).toBe(false);

      store.syncFiles.deleteFileRecord("/some/path.json");
      expect(store.syncFiles.needsSync("/some/path.json", attrs)).toBe(true);
    });
  });

  describe("busy-wait retry removal contract", () => {
    test("sqlite source has no busy-wait helper and keeps immediate transactions", () => {
      const sqliteSource = readFileSync(
        new URL("./sqlite.ts", import.meta.url),
        "utf8",
      );

      expect(sqliteSource).not.toContain("function withRetry<");
      expect(sqliteSource).not.toContain("while (Date.now() - start < delay)");
      expect(sqliteSource.match(/BEGIN IMMEDIATE TRANSACTION/g)).toHaveLength(
        2,
      );
    });
  });

  describe("sync namespace removal contract", () => {
    test("legacy sync namespace is not present on the store", () => {
      // After migration, the store should not expose a `sync` property;
      // only `syncFiles` should exist for sync operations.
      expect(store).not.toHaveProperty("sync");
    });

    test("store source does not call sqlite.sync.needsSync or sqlite.sync.markSynced", () => {
      const storeSource = readFileSync(
        new URL("./store.ts", import.meta.url),
        "utf8",
      );
      expect(storeSource).not.toContain("sqlite.sync.needsSync");
      expect(storeSource).not.toContain("sqlite.sync.markSynced");
    });
  });

  describe("task_metadata", () => {
    const changeWithMeta: Change = {
      ...(SAMPLE_CHANGE as Change),
      id: "metaChange",
      tasks: [
        {
          ...(SAMPLE_CHANGE.tasks[0] as Change["tasks"][0]),
          id: "tk-meta001",
          metadata: { env: "production", team: "backend" },
        },
        {
          ...(SAMPLE_CHANGE.tasks[1] as Change["tasks"][0]),
          id: "tk-meta002",
          metadata: { env: "staging" },
        },
        {
          ...(SAMPLE_CHANGE.tasks[2] as Change["tasks"][0]),
          id: "tk-meta003",
          // no metadata
        },
      ],
    };

    test("task_metadata table exists after schema init", () => {
      const result = store.db
        .query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='task_metadata'",
        )
        .get() as { name: string } | null;
      expect(result).not.toBeNull();
      expect(result?.name).toBe("task_metadata");
    });

    test("upsert syncs task metadata to task_metadata table", () => {
      store.changes.upsert(changeWithMeta, "/path/to/change.json");

      const rows = store.db
        .query("SELECT * FROM task_metadata WHERE task_id = 'tk-meta001'")
        .all() as Array<{ task_id: string; key: string; value: string }>;

      expect(rows.length).toBe(2);
      const envRow = rows.find((r) => r.key === "env");
      expect(envRow?.value).toBe("production");
    });

    test("has_metadata_key query returns tasks with that key", () => {
      store.changes.upsert(changeWithMeta, "/path/to/change.json");

      const rows = store.db
        .query(
          "SELECT DISTINCT task_id FROM task_metadata WHERE key = ? AND change_id = ?",
        )
        .all("env", "metaChange") as Array<{ task_id: string }>;

      // tk-meta001 and tk-meta002 both have env key
      expect(rows.length).toBe(2);
      const ids = rows.map((r) => r.task_id);
      expect(ids).toContain("tk-meta001");
      expect(ids).toContain("tk-meta002");
    });

    test("metadata:key=value query returns only matching tasks", () => {
      store.changes.upsert(changeWithMeta, "/path/to/change.json");

      const rows = store.db
        .query(
          "SELECT task_id FROM task_metadata WHERE key = ? AND value = ? AND change_id = ?",
        )
        .all("env", "production", "metaChange") as Array<{ task_id: string }>;

      expect(rows.length).toBe(1);
      expect(rows[0].task_id).toBe("tk-meta001");
    });

    test("metadata is deleted when change is deleted (CASCADE)", () => {
      store.changes.upsert(changeWithMeta, "/path/to/change.json");
      store.changes.delete("metaChange");

      const rows = store.db
        .query("SELECT * FROM task_metadata WHERE change_id = 'metaChange'")
        .all();
      expect(rows.length).toBe(0);
    });

    test("task with no metadata has no rows in task_metadata", () => {
      store.changes.upsert(changeWithMeta, "/path/to/change.json");

      const rows = store.db
        .query("SELECT * FROM task_metadata WHERE task_id = 'tk-meta003'")
        .all();
      expect(rows.length).toBe(0);
    });

    test("EXPLAIN QUERY PLAN: has_metadata_key query uses index (no full-table scan)", () => {
      // Verify idx_task_metadata_change_key is used for has_metadata_key queries
      const plan = store.db
        .query(
          "EXPLAIN QUERY PLAN SELECT DISTINCT task_id FROM task_metadata WHERE key = ? AND change_id = ?",
        )
        .all("env", "metaChange") as Array<{
        id: number;
        parent: number;
        notused: number;
        detail: string;
      }>;

      // The plan should use an index, not a full-table scan (SCAN TABLE)
      const details = plan.map((row) => row.detail).join(" ");
      expect(details).not.toMatch(/SCAN task_metadata(?! USING)/);
      // Should use the index
      expect(details).toMatch(/USING INDEX idx_task_metadata_change_key/);
    });

    test("EXPLAIN QUERY PLAN: metadata:key=value query uses covering index (no full-table scan)", () => {
      // Verify idx_task_metadata_change_key_value is used for key=value queries
      const plan = store.db
        .query(
          "EXPLAIN QUERY PLAN SELECT task_id FROM task_metadata WHERE key = ? AND value = ? AND change_id = ?",
        )
        .all("env", "production", "metaChange") as Array<{
        id: number;
        parent: number;
        notused: number;
        detail: string;
      }>;

      const details = plan.map((row) => row.detail).join(" ");
      expect(details).not.toMatch(/SCAN task_metadata(?! USING)/);
      // Should use an index (either the covering index or the change_key_value index)
      expect(details).toMatch(/USING INDEX idx_task_metadata/);
    });
  });
});

// ============================================================================
// store-context / store-locks extraction contract
// ============================================================================

describe("store decomposition contract (context + locks)", () => {
  const storageDir = resolve(new URL(".", import.meta.url).pathname);

  test("store-context.ts module exists", () => {
    expect(existsSync(resolve(storageDir, "store-context.ts"))).toBe(true);
  });

  test("store-locks.ts module exists", () => {
    expect(existsSync(resolve(storageDir, "store-locks.ts"))).toBe(true);
  });

  test("store.ts does not define withChangeLock function body inline", () => {
    const src = readFileSync(resolve(storageDir, "store.ts"), "utf8");
    expect(src).not.toContain("const withChangeLock = async <T>(");
  });

  test("store.ts does not define withTaskLock function body inline", () => {
    const src = readFileSync(resolve(storageDir, "store.ts"), "utf8");
    expect(src).not.toContain("const withTaskLock = async <T>(");
  });
});

describe("wisdom schema (tk-GPqLihyR)", () => {
  let tempDir2: string;
  let wStore: SQLiteStore;

  beforeEach(async () => {
    tempDir2 = await createTempDir();
    const dbPath = join(tempDir2, "wisdom-test.db");
    wStore = createSQLiteStore(dbPath);
    initDatabase(wStore.db);
  });

  afterEach(async () => {
    wStore.close();
    await cleanupTempDir(tempDir2);
  });

  test("wisdom table is created on store init", () => {
    const result = wStore.db
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='wisdom'",
      )
      .get() as { name: string } | null;
    expect(result?.name).toBe("wisdom");
  });

  test("wisdom_fts virtual table exists", () => {
    const result = wStore.db
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='wisdom_fts'",
      )
      .get() as { name: string } | null;
    expect(result?.name).toBe("wisdom_fts");
  });

  test("wisdom table has required columns", () => {
    const cols = wStore.db.query("PRAGMA table_info(wisdom)").all() as {
      name: string;
    }[];
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain("id");
    expect(colNames).toContain("scope");
    expect(colNames).toContain("change_id");
    expect(colNames).toContain("type");
    expect(colNames).toContain("content");
    expect(colNames).toContain("source_task");
    expect(colNames).toContain("source_change");
    expect(colNames).toContain("recorded_at");
  });

  test("idx_wisdom_change_id index exists", () => {
    const result = wStore.db
      .query(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_wisdom_change_id'",
      )
      .get() as { name: string } | null;
    expect(result?.name).toBe("idx_wisdom_change_id");
  });

  test("idx_wisdom_scope index exists", () => {
    const result = wStore.db
      .query(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_wisdom_scope'",
      )
      .get() as { name: string } | null;
    expect(result?.name).toBe("idx_wisdom_scope");
  });

  test("FTS trigger fires on INSERT — entry is searchable", () => {
    wStore.db.run(
      "INSERT INTO wisdom (id, scope, change_id, type, content, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        "ws-test01",
        "change",
        "ch1",
        "pattern",
        "use dependency injection for testability",
        new Date().toISOString(),
      ],
    );
    const result = wStore.db
      .query("SELECT id FROM wisdom_fts WHERE wisdom_fts MATCH ?")
      .get("dependency injection") as { id: string } | null;
    expect(result?.id).toBe("ws-test01");
  });

  test("FTS trigger fires on DELETE — entry no longer searchable", () => {
    wStore.db.run(
      "INSERT INTO wisdom (id, scope, change_id, type, content, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        "ws-del01",
        "change",
        "ch1",
        "gotcha",
        "always check for null before accessing properties",
        new Date().toISOString(),
      ],
    );
    wStore.db.run("DELETE FROM wisdom WHERE id = ?", ["ws-del01"]);
    const result = wStore.db
      .query("SELECT id FROM wisdom_fts WHERE wisdom_fts MATCH ?")
      .get("null") as { id: string } | null;
    expect(result).toBeNull();
  });
});

describe("SQLiteStore wisdom namespace (tk-MDmM9SAH)", () => {
  let tempDir3: string;
  let wStore: SQLiteStore;

  beforeEach(async () => {
    tempDir3 = await createTempDir();
    const dbPath = join(tempDir3, "wisdom-ns-test.db");
    wStore = createSQLiteStore(dbPath);
    initDatabase(wStore.db);
  });

  afterEach(async () => {
    wStore.close();
    await cleanupTempDir(tempDir3);
  });

  const makeEntry = (
    id: string,
    type = "pattern",
    content = "test content",
  ) => ({
    id,
    type: type as "pattern",
    content,
    recorded_at: new Date().toISOString(),
  });

  test("upsertBatch inserts change-level entries into wisdom table", () => {
    const entries = [
      makeEntry("ws-001", "pattern", "use dependency injection"),
      makeEntry("ws-002", "gotcha", "always check for null"),
    ];
    wStore.wisdom.upsertBatch("ch-abc", entries);

    const rows = wStore.db
      .query("SELECT * FROM wisdom WHERE change_id = ?")
      .all("ch-abc") as { id: string }[];
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id)).toContain("ws-001");
    expect(rows.map((r) => r.id)).toContain("ws-002");
  });

  test("upsertBatch sets scope to 'change' for all entries", () => {
    wStore.wisdom.upsertBatch("ch-abc", [makeEntry("ws-003")]);
    const row = wStore.db
      .query("SELECT scope FROM wisdom WHERE id = ?")
      .get("ws-003") as { scope: string };
    expect(row.scope).toBe("change");
  });

  test("upsertProject inserts project-level entries with scope 'project'", () => {
    wStore.wisdom.upsertProject([
      {
        id: "pw-001",
        type: "convention",
        content: "always use atomic writes",
        promoted_at: new Date().toISOString(),
      },
    ]);
    const row = wStore.db
      .query("SELECT scope FROM wisdom WHERE id = ?")
      .get("pw-001") as { scope: string } | null;
    expect(row?.scope).toBe("project");
  });

  test("deleteByChange removes only that change's entries", () => {
    wStore.wisdom.upsertBatch("ch-del", [
      makeEntry("ws-del1"),
      makeEntry("ws-del2"),
    ]);
    wStore.wisdom.upsertBatch("ch-keep", [makeEntry("ws-keep1")]);
    wStore.wisdom.deleteByChange("ch-del");

    const deleted = wStore.db
      .query("SELECT id FROM wisdom WHERE change_id = ?")
      .all("ch-del");
    expect(deleted).toHaveLength(0);

    const kept = wStore.db
      .query("SELECT id FROM wisdom WHERE change_id = ?")
      .all("ch-keep") as { id: string }[];
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe("ws-keep1");
  });

  test("deleteProjectScope removes only project-scoped entries", () => {
    wStore.wisdom.upsertBatch("ch-abc", [makeEntry("ws-change1")]);
    wStore.wisdom.upsertProject([
      {
        id: "pw-999",
        type: "pattern",
        content: "project entry",
        promoted_at: new Date().toISOString(),
      },
    ]);

    wStore.wisdom.deleteProjectScope();

    const projectEntries = wStore.db
      .query("SELECT id FROM wisdom WHERE scope = 'project'")
      .all();
    expect(projectEntries).toHaveLength(0);

    const changeEntries = wStore.db
      .query("SELECT id FROM wisdom WHERE scope = 'change'")
      .all() as { id: string }[];
    expect(changeEntries).toHaveLength(1);
    expect(changeEntries[0].id).toBe("ws-change1");
  });

  test("search returns FTS-ranked results matching query", () => {
    wStore.wisdom.upsertBatch("ch-s1", [
      makeEntry(
        "ws-auth1",
        "pattern",
        "always validate JWT tokens on the server",
      ),
      makeEntry("ws-noauth", "gotcha", "use connection pooling for databases"),
    ]);

    const results = wStore.wisdom.search("JWT tokens");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("ws-auth1");
  });

  test("search with changeId filters to that change only", () => {
    wStore.wisdom.upsertBatch("ch-a", [
      makeEntry("ws-a1", "pattern", "auth pattern for service A"),
    ]);
    wStore.wisdom.upsertBatch("ch-b", [
      makeEntry("ws-b1", "pattern", "auth pattern for service B"),
    ]);

    const results = wStore.wisdom.search("auth pattern", { changeId: "ch-a" });
    expect(results.every((r) => r.change_id === "ch-a")).toBe(true);
  });

  test("search with type filter returns only matching type (SQL-side filtering)", () => {
    wStore.wisdom.upsertBatch("ch-typetest", [
      makeEntry("ws-pat1", "pattern", "caching pattern for responses"),
      makeEntry("ws-got1", "gotcha", "caching gotcha watch out"),
    ]);

    const patternResults = wStore.wisdom.search("caching", { type: "pattern" });
    expect(patternResults.every((r) => r.type === "pattern")).toBe(true);
    expect(patternResults.some((r) => r.id === "ws-pat1")).toBe(true);
    expect(patternResults.some((r) => r.id === "ws-got1")).toBe(false);
  });

  test("listAll returns all entries across scopes", () => {
    wStore.wisdom.upsertBatch("ch-x", [makeEntry("ws-x1"), makeEntry("ws-x2")]);
    wStore.wisdom.upsertProject([
      {
        id: "pw-x1",
        type: "convention",
        content: "project level",
        promoted_at: new Date().toISOString(),
      },
    ]);

    const all = wStore.wisdom.listAll();
    expect(all.length).toBe(3);
  });

  test("listAll with type filter returns only matching type", () => {
    wStore.wisdom.upsertBatch("ch-t", [
      makeEntry("ws-t1", "pattern", "pattern entry"),
      makeEntry("ws-t2", "gotcha", "gotcha entry"),
    ]);

    const patterns = wStore.wisdom.listAll({ type: "pattern" });
    expect(patterns).toHaveLength(1);
    expect(patterns[0].id).toBe("ws-t1");
  });
});

describe("store decomposition contract (sync helpers)", () => {
  const storageDir = resolve(new URL(".", import.meta.url).pathname);

  test("store-sync.ts module exists", () => {
    expect(existsSync(resolve(storageDir, "store-sync.ts"))).toBe(true);
  });

  test("store.ts does not define ensureSpecSynced function body inline", () => {
    const src = readFileSync(resolve(storageDir, "store.ts"), "utf8");
    expect(src).not.toContain("const ensureSpecSynced = async (");
  });

  test("store.ts does not define ensureChangeSynced function body inline", () => {
    const src = readFileSync(resolve(storageDir, "store.ts"), "utf8");
    expect(src).not.toContain("const ensureChangeSynced = async (");
  });
});

describe("store decomposition contract (domain modules)", () => {
  const storageDir = resolve(new URL(".", import.meta.url).pathname);

  test("store-specs.ts module exists", () => {
    expect(existsSync(resolve(storageDir, "store-specs.ts"))).toBe(true);
  });

  test("store-changes.ts module exists", () => {
    expect(existsSync(resolve(storageDir, "store-changes.ts"))).toBe(true);
  });

  test("store-tasks.ts module exists", () => {
    expect(existsSync(resolve(storageDir, "store-tasks.ts"))).toBe(true);
  });

  test("store-gates.ts module exists", () => {
    expect(existsSync(resolve(storageDir, "store-gates.ts"))).toBe(true);
  });

  test("store.ts is significantly smaller (under 350 lines)", () => {
    // 319 lines: ~90 imports + 9 re-exports + 220-line createStore function.
    // The original was 1491 lines; this is a 78% reduction.
    const src = readFileSync(resolve(storageDir, "store.ts"), "utf8");
    const lineCount = src.split("\n").length;
    expect(lineCount).toBeLessThan(350);
  });
});
