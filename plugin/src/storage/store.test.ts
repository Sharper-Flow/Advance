/**
 * Unified Store Tests
 *
 * Integration tests for the complete storage layer
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { access } from "fs/promises";
import { createStore, type Store } from "./store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  SAMPLE_SPEC,
} from "../__tests__/setup";

describe("Store", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createStore(tempDir);
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
  });

  describe("lifecycle", () => {
    test("createStore initializes with project paths", async () => {
      expect(store.paths.root).toBe(tempDir);
      expect(store.paths.specs).toBe(join(tempDir, ".adv/specs"));
    });

    test("init creates directory structure", async () => {
      const emptyDir = await createTempDir();
      const newStore = await createStore(emptyDir);
      await newStore.init();

      // Check if project.json exists
      let exists = false;
      try {
        await access(join(emptyDir, "project.json"));
        exists = true;
      } catch {
        exists = false;
      }
      expect(exists).toBe(true);

      newStore.close();
      await cleanupTempDir(emptyDir);
    });

    test("sync populates SQLite from JSON files", async () => {
      await store.sync();

      const result = await store.specs.list();
      expect(result.specs).toHaveLength(1);
      expect(result.specs[0].name).toBe("test-capability");
    });
  });

  describe("specs", () => {
    test("list returns all specs", async () => {
      const result = await store.specs.list();
      expect(result.specs).toHaveLength(1);
      expect(result.specs[0].requirementCount).toBe(2);
    });

    test("list filters by capability", async () => {
      const result = await store.specs.list({ capability: "test-capability" });
      expect(result.specs).toHaveLength(1);

      const empty = await store.specs.list({ capability: "nonexistent" });
      expect(empty.specs).toHaveLength(0);
    });

    test("get returns full spec", async () => {
      const result = await store.specs.get("test-capability");
      expect(result.success).toBe(true);
      expect(result.data).not.toBeNull();
      expect(result.data!.requirements).toHaveLength(2);
    });

    test("search finds requirements", async () => {
      const results = await store.specs.search("authentication");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].spec).toBe("test-capability");
    });

    test("save persists spec to JSON and SQLite", async () => {
      // Create a new spec with unique requirement IDs
      const newSpec = {
        ...SAMPLE_SPEC,
        name: "new-cap",
        title: "New",
        requirements: SAMPLE_SPEC.requirements.map((r, i) => ({
          ...r,
          id: `rq-newcap${i}`,
          scenarios:
            r.scenarios?.map((s, j) => ({ ...s, id: `rq-newcap${i}.${j}` })) ??
            [],
        })),
      };
      await store.specs.save(newSpec);

      const result = await store.specs.list();
      expect(result.specs).toHaveLength(2);

      const loadedResult = await store.specs.get("new-cap");
      expect(loadedResult.success).toBe(true);
      expect(loadedResult.data!.title).toBe("New");
    });
  });

  describe("changes", () => {
    test("list returns active changes", async () => {
      const result = await store.changes.list();
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].id).toBe("addFeature");
    });

    test("list excludes archived by default", async () => {
      // First get the change and archive it
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      changeResult.data!.status = "archived";
      await store.changes.save(changeResult.data!);

      const result = await store.changes.list();
      expect(result.changes).toHaveLength(0);

      const withArchived = await store.changes.list({ includeArchived: true });
      expect(withArchived.changes).toHaveLength(1);
    });

    test("get returns full change", async () => {
      const result = await store.changes.get("addFeature");
      expect(result.success).toBe(true);
      expect(result.data).not.toBeNull();
      expect(result.data!.tasks).toHaveLength(3);
    });

    test("create generates new change", async () => {
      const result = await store.changes.create("Test new feature");

      // ID format: camelCase title
      expect(result.changeId).toBe("testNewFeature");
      expect(result.path).toContain("proposal.md");

      const loadedResult = await store.changes.get(result.changeId);
      expect(loadedResult.success).toBe(true);
      expect(loadedResult.data).not.toBeNull();
      expect(loadedResult.data!.status).toBe("draft");
    });
  });

  describe("tasks", () => {
    test("list returns tasks for change", async () => {
      const tasks = await store.tasks.list("addFeature");
      expect(tasks).toHaveLength(3);
    });

    test("list filters by status", async () => {
      const pending = await store.tasks.list("addFeature", "pending");
      expect(pending).toHaveLength(3);
    });

    test("ready returns unblocked tasks", async () => {
      const result = await store.tasks.ready("addFeature");
      expect(result.ready).toHaveLength(1);
      expect(result.ready[0].id).toBe("tk-task0001");
      expect(result.blocked).toHaveLength(2);
    });

    test("update changes task status", async () => {
      const task = await store.tasks.update("tk-task0001", "done", "Completed");

      expect(task).not.toBeNull();
      expect(task!.status).toBe("done");
      expect(task!.completed_at).toBeDefined();

      // Verify persistence
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      const updatedTask = changeResult.data!.tasks.find(
        (t) => t.id === "tk-task0001",
      );
      expect(updatedTask!.status).toBe("done");
    });

    test("update unlocks dependent tasks", async () => {
      // Complete first task
      await store.tasks.update("tk-task0001", "done");

      // Check that second task is now ready
      const result = await store.tasks.ready("addFeature");
      expect(result.ready).toHaveLength(1);
      expect(result.ready[0].id).toBe("tk-task0002");
    });

    test("add creates new task", async () => {
      const task = await store.tasks.add("addFeature", "New task content", {
        section: "Testing",
      });

      expect(task.id).toMatch(/^tk-/);
      expect(task.title).toBe("New task content");
      expect(task.section).toBe("Testing");

      const tasks = await store.tasks.list("addFeature");
      expect(tasks).toHaveLength(4);
    });

    test("add with blockedBy creates dependency", async () => {
      const task = await store.tasks.add("addFeature", "Blocked task", {
        blockedBy: ["tk-task0001"],
      });

      expect(task.deps).toHaveLength(1);
      expect(task.deps![0].type).toBe("blocked_by");
      expect(task.deps![0].target).toBe("tk-task0001");
    });
  });

  describe("status", () => {
    test("returns project overview", async () => {
      const status = await store.status();

      expect(status.specs.count).toBe(1);
      expect(status.specs.capabilities).toContain("test-capability");
      expect(status.changes.active).toBe(1);
      expect(status.changes.byStatus.active).toBe(1);
    });

    test("generates recommendations", async () => {
      // Complete all tasks to trigger recommendation
      await store.tasks.update("tk-task0001", "done");
      await store.tasks.update("tk-task0002", "done");
      await store.tasks.update("tk-task0003", "done");

      const status = await store.status();
      expect(status.recommendations.length).toBeGreaterThan(0);
      const archiveRec = status.recommendations.find((r) =>
        r.includes("Ready to archive"),
      );
      expect(archiveRec).toBeDefined();
    });
  });

  describe("wisdom", () => {
    test("add wisdom entry to change", async () => {
      const entry = await store.wisdom.add(
        "addFeature",
        "pattern",
        "Use factory pattern for store creation",
      );

      expect(entry.id).toMatch(/^ws-/);
      expect(entry.type).toBe("pattern");
      expect(entry.content).toBe("Use factory pattern for store creation");
      expect(entry.recorded_at).toBeDefined();

      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      expect(changeResult.data!.wisdom).toContainEqual(entry);
    });

    test("add wisdom with invalid content (exceeds max length) throws error", async () => {
      const longContent = "x".repeat(2001);
      await expect(
        store.wisdom.add("addFeature", "pattern", longContent),
      ).rejects.toThrow(/max.*2000/);
    });

    test("list wisdom returns all entries for a change", async () => {
      await store.wisdom.add("addFeature", "success", "Test 1");
      await store.wisdom.add("addFeature", "gotcha", "Test 2");

      const wisdom = await store.wisdom.list("addFeature");
      expect(wisdom).toHaveLength(2);
      expect(wisdom[0].content).toBe("Test 1");
      expect(wisdom[1].content).toBe("Test 2");
    });

    test("list wisdom for nonexistent change throws error", async () => {
      await expect(store.wisdom.list("nonexistent")).rejects.toThrow(
        /not found/,
      );
    });
  });

  describe("flush", () => {
    test("store has a flush() method", () => {
      expect(typeof store.flush).toBe("function");
    });

    test("flush() resolves without error", async () => {
      // Should complete without throwing
      await expect(store.flush()).resolves.toBeUndefined();
    });

    test("flush() can be called multiple times safely (idempotent)", async () => {
      await store.flush();
      await store.flush();
      // No error thrown
    });

    test("flush() completes within 3 seconds", async () => {
      const start = Date.now();
      await store.flush();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(3000);
    });
  });
});
