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
      expect(store.paths.specs).toBe(join(tempDir, "specs"));
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
      const spec = await store.specs.get("test-capability");
      expect(spec).not.toBeNull();
      expect(spec!.requirements).toHaveLength(2);
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

      const loaded = await store.specs.get("new-cap");
      expect(loaded!.title).toBe("New");
    });
  });

  describe("changes", () => {
    test("list returns active changes", async () => {
      const result = await store.changes.list();
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].id).toBe("add-feature-abc123");
    });

    test("list excludes archived by default", async () => {
      // First get the change and archive it
      const change = await store.changes.get("add-feature-abc123");
      change!.status = "archived";
      await store.changes.save(change!);

      const result = await store.changes.list();
      expect(result.changes).toHaveLength(0);

      const withArchived = await store.changes.list({ includeArchived: true });
      expect(withArchived.changes).toHaveLength(1);
    });

    test("get returns full change", async () => {
      const change = await store.changes.get("add-feature-abc123");
      expect(change).not.toBeNull();
      expect(change!.tasks).toHaveLength(3);
    });

    test("create generates new change", async () => {
      const result = await store.changes.create("Test new feature");

      expect(result.changeId).toMatch(/^test-new-feature-[a-zA-Z0-9_-]+$/);
      expect(result.path).toContain("proposal.md");

      const loaded = await store.changes.get(result.changeId);
      expect(loaded).not.toBeNull();
      expect(loaded!.status).toBe("draft");
    });
  });

  describe("tasks", () => {
    test("list returns tasks for change", async () => {
      const tasks = await store.tasks.list("add-feature-abc123");
      expect(tasks).toHaveLength(3);
    });

    test("list filters by status", async () => {
      const pending = await store.tasks.list("add-feature-abc123", "pending");
      expect(pending).toHaveLength(3);
    });

    test("ready returns unblocked tasks", async () => {
      const result = await store.tasks.ready("add-feature-abc123");
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
      const change = await store.changes.get("add-feature-abc123");
      const updatedTask = change!.tasks.find((t) => t.id === "tk-task0001");
      expect(updatedTask!.status).toBe("done");
    });

    test("update unlocks dependent tasks", async () => {
      // Complete first task
      await store.tasks.update("tk-task0001", "done");

      // Check that second task is now ready
      const result = await store.tasks.ready("add-feature-abc123");
      expect(result.ready).toHaveLength(1);
      expect(result.ready[0].id).toBe("tk-task0002");
    });

    test("add creates new task", async () => {
      const task = await store.tasks.add(
        "add-feature-abc123",
        "New task content",
        { section: "Testing" },
      );

      expect(task.id).toMatch(/^tk-/);
      expect(task.title).toBe("New task content");
      expect(task.section).toBe("Testing");

      const tasks = await store.tasks.list("add-feature-abc123");
      expect(tasks).toHaveLength(4);
    });

    test("add with blockedBy creates dependency", async () => {
      const task = await store.tasks.add("add-feature-abc123", "Blocked task", {
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
      expect(status.recommendations[0]).toContain("Ready to archive");
    });
  });
});
