/**
 * Change Tools Tests
 *
 * TDD tests for change management tools
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { changeTools } from "./change";
import { createStore, type Store } from "../storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  parseToolOutput,
} from "../__tests__/setup";

describe("Change Tools", () => {
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

  describe("adv_change_list", () => {
    test("returns active changes with task counts", async () => {
      const result = await changeTools.adv_change_list.execute({}, store);
      const parsed = JSON.parse(result);

      expect(parsed.changes).toHaveLength(1);
      expect(parsed.changes[0]).toMatchObject({
        id: "add-feature-abc123",
        title: "Add New Feature",
        status: "active",
        taskCount: 3,
        completedTasks: 0,
      });
    });

    test("filters by status", async () => {
      const result = await changeTools.adv_change_list.execute(
        { status: "draft" },
        store,
      );
      const parsed = JSON.parse(result);

      // No draft changes in sample data
      expect(parsed.changes).toHaveLength(0);
    });

    test("excludes archived by default", async () => {
      // Archive the existing change
      const changeResult = await store.changes.get("add-feature-abc123");
      expect(changeResult.success).toBe(true);
      changeResult.data!.status = "archived";
      await store.changes.save(changeResult.data!);

      const result = await changeTools.adv_change_list.execute({}, store);
      const parsed = JSON.parse(result);

      expect(parsed.changes).toHaveLength(0);
    });

    test("includes archived when requested", async () => {
      const changeResult = await store.changes.get("add-feature-abc123");
      expect(changeResult.success).toBe(true);
      changeResult.data!.status = "archived";
      await store.changes.save(changeResult.data!);

      const result = await changeTools.adv_change_list.execute(
        { includeArchived: true },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.changes).toHaveLength(1);
    });
  });

  describe("adv_change_show", () => {
    test("returns full change with tasks and deltas", async () => {
      const result = await changeTools.adv_change_show.execute(
        { changeId: "add-feature-abc123" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.id).toBe("add-feature-abc123");
      expect(parsed.title).toBe("Add New Feature");
      expect(parsed.tasks).toHaveLength(3);
      expect(parsed.deltas["test-capability"]).toHaveLength(1);
    });

    test("returns error for nonexistent change", async () => {
      const result = await changeTools.adv_change_show.execute(
        { changeId: "nonexistent" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("not found");
    });
  });

  describe("adv_change_create", () => {
    test("creates new change with generated ID", async () => {
      const result = await changeTools.adv_change_create.execute(
        { summary: "Add user authentication" },
        store,
      );
      const parsed = parseToolOutput(result);

      // ID format: 15-char max slug + 4-char nanoid
      expect(parsed.changeId).toMatch(/^add-user-authen-[a-zA-Z0-9_-]{4}$/);
      expect(parsed.path).toContain("proposal.md");
    });

    test("creates change.json with draft status", async () => {
      const result = await changeTools.adv_change_create.execute(
        { summary: "New feature" },
        store,
      );
      const parsed = parseToolOutput(result);

      const changeResult = await store.changes.get(parsed.changeId);
      expect(changeResult.success).toBe(true);
      expect(changeResult.data).not.toBeNull();
      expect(changeResult.data!.status).toBe("draft");
      expect(changeResult.data!.tasks).toEqual([]);
      expect(changeResult.data!.deltas).toEqual({});
    });

    test("truncates long summaries in ID", async () => {
      const result = await changeTools.adv_change_create.execute(
        {
          summary:
            "This is a very long summary that should be truncated in the change ID",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      // ID should be truncated to 15 chars + 4-char nanoid (max ~20 chars)
      expect(parsed.changeId.length).toBeLessThanOrEqual(20);
    });
  });

  describe("adv_change_validate", () => {
    test("passes for valid change", async () => {
      const result = await changeTools.adv_change_validate.execute(
        { changeId: "add-feature-abc123" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.passed).toBe(true);
      expect(parsed.errors).toHaveLength(0);
    });

    test("warns when no tasks defined", async () => {
      // Create a change with no tasks
      const createResult = await changeTools.adv_change_create.execute(
        { summary: "Empty change" },
        store,
      );
      const { changeId } = parseToolOutput(createResult);

      const result = await changeTools.adv_change_validate.execute(
        { changeId },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.passed).toBe(true); // Warnings don't fail by default
      expect(
        parsed.warnings.some((w: { code: string }) => w.code === "NO_TASKS"),
      ).toBe(true);
    });

    test("warns when no deltas defined", async () => {
      const createResult = await changeTools.adv_change_create.execute(
        { summary: "No deltas change" },
        store,
      );
      const { changeId } = parseToolOutput(createResult);

      const result = await changeTools.adv_change_validate.execute(
        { changeId },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(
        parsed.warnings.some((w: { code: string }) => w.code === "NO_DELTAS"),
      ).toBe(true);
    });

    test("fails in strict mode with warnings", async () => {
      const createResult = await changeTools.adv_change_create.execute(
        { summary: "Empty change" },
        store,
      );
      const { changeId } = parseToolOutput(createResult);

      const result = await changeTools.adv_change_validate.execute(
        { changeId, strict: true },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.passed).toBe(false);
    });

    test("returns error for nonexistent change", async () => {
      const result = await changeTools.adv_change_validate.execute(
        { changeId: "nonexistent" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("not found");
    });
  });

  describe("adv_change_archive", () => {
    test("archives change with all tasks and gates completed", async () => {
      // Complete all tasks
      await store.tasks.update("tk-task0001", "done");
      await store.tasks.update("tk-task0002", "done");
      await store.tasks.update("tk-task0003", "done");

      // Complete all gates (required for archive)
      const change = (await store.changes.get("add-feature-abc123")).data!;
      change.gates = {
        research: { status: "done", completed_at: new Date().toISOString() },
        prep: { status: "done", completed_at: new Date().toISOString() },
        implementation: { status: "done", completed_at: new Date().toISOString() },
        review: { status: "done", completed_at: new Date().toISOString() },
        harden: { status: "done", completed_at: new Date().toISOString() },
        signoff: { status: "done", completed_at: new Date().toISOString() },
      };
      await store.changes.save(change);

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "add-feature-abc123" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(
        parsed.specsUpdated.map((s: { capability: string }) => s.capability),
      ).toContain("test-capability");
    });

    test("fails when tasks are incomplete", async () => {
      const result = await changeTools.adv_change_archive.execute(
        { changeId: "add-feature-abc123" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("incomplete tasks");
      expect(parsed.incompleteTasks).toHaveLength(3);
    });

    test("returns error for nonexistent change", async () => {
      const result = await changeTools.adv_change_archive.execute(
        { changeId: "nonexistent" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("not found");
    });

    test("blocks archive when gates are incomplete", async () => {
      // Complete all tasks
      await store.tasks.update("tk-task0001", "done");
      await store.tasks.update("tk-task0002", "done");
      await store.tasks.update("tk-task0003", "done");

      // Don't complete any gates - they should block archive
      const result = await changeTools.adv_change_archive.execute(
        { changeId: "add-feature-abc123" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("gate");
      expect(parsed.incompleteGates).toBeDefined();
      expect(parsed.incompleteGates.length).toBeGreaterThan(0);
    });
  });
});
