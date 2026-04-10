/**
 * SQLite Storage Tests
 *
 * Test SQLite CRUD operations and FTS5 search
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { writeFileSync } from "fs";
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

  describe("sync (automatic file attribute fetching)", () => {
    test("needsSync returns true for non-existent file", () => {
      expect(store.sync.needsSync("/nonexistent/path.json")).toBe(true);
    });

    test("needsSync returns true for new path after marking", () => {
      const testPath = join(tempDir, "test-file.json");
      writeFileSync(testPath, "test content");

      store.sync.markSynced(testPath);

      expect(store.sync.needsSync(testPath)).toBe(false);
    });

    test("needsSync returns true when file content changes (size differs)", () => {
      const testPath = join(tempDir, "test-file.json");
      writeFileSync(testPath, "original content");

      store.sync.markSynced(testPath);

      writeFileSync(testPath, "modified content with different size");

      expect(store.sync.needsSync(testPath)).toBe(true);
    });

    test("markSynced stores current file attributes", () => {
      const testPath = join(tempDir, "test-file.json");
      writeFileSync(testPath, "test content");

      store.sync.markSynced(testPath);

      const attrs = store.syncFiles.getFileAttrs(testPath);
      expect(attrs).not.toBeNull();
      expect(attrs!.size).toBeGreaterThan(0);
      expect(attrs!.mtime_ms).toBeGreaterThan(0);
      expect(attrs!.inode).toBeGreaterThan(0);
    });

    test("needsSync uses triple-attribute comparison (mtime, size, inode)", () => {
      const testPath = join(tempDir, "test-file.json");
      writeFileSync(testPath, "test content");

      store.sync.markSynced(testPath);

      const attrs1 = store.syncFiles.getFileAttrs(testPath);
      expect(store.sync.needsSync(testPath)).toBe(false);

      store.sync.markSynced(testPath);
      const attrs2 = store.syncFiles.getFileAttrs(testPath);
      expect(attrs2).toEqual(attrs1);
    });
  });

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
