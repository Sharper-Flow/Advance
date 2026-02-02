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
        id: "addFeature",
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
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      changeResult.data!.status = "archived";
      await store.changes.save(changeResult.data!);

      const result = await changeTools.adv_change_list.execute({}, store);
      const parsed = JSON.parse(result);

      expect(parsed.changes).toHaveLength(0);
    });

    test("includes archived when requested", async () => {
      const changeResult = await store.changes.get("addFeature");
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
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.id).toBe("addFeature");
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

    test("displays github_issues prominently in output", async () => {
      // Add github issues to the change
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      changeResult.data!.github_issues = [
        "https://github.com/anomalyco/test/issues/123",
        "https://github.com/anomalyco/test/issues/456",
      ];
      await store.changes.save(changeResult.data!);

      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      // github_issues should be present in the output
      expect(parsed.github_issues).toBeDefined();
      expect(parsed.github_issues).toHaveLength(2);
      expect(parsed.github_issues).toContain(
        "https://github.com/anomalyco/test/issues/123",
      );
      expect(parsed.github_issues).toContain(
        "https://github.com/anomalyco/test/issues/456",
      );
    });

    test("displays empty github_issues array when none linked", async () => {
      // addFeature has no github_issues by default
      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      // Should have github_issues field (empty or undefined is acceptable)
      // When displayed, it should be clear there are no linked issues
      expect(
        parsed.github_issues === undefined ||
          Array.isArray(parsed.github_issues),
      ).toBe(true);
    });
  });

  describe("adv_change_create", () => {
    test("creates new change with generated ID", async () => {
      const result = await changeTools.adv_change_create.execute(
        { summary: "Add user authentication" },
        store,
      );
      const parsed = parseToolOutput(result);

      // ID format: camelCase title
      expect(parsed.changeId).toBe("addUserAuthentication");
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

      // ID should be truncated to 30 chars
      expect(parsed.changeId.length).toBeLessThanOrEqual(30);
    });
  });

  describe("adv_change_validate", () => {
    test("passes for valid change", async () => {
      const result = await changeTools.adv_change_validate.execute(
        { changeId: "addFeature" },
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
      const change = (await store.changes.get("addFeature")).data!;
      change.gates = {
        research: { status: "done", completed_at: new Date().toISOString() },
        prep: { status: "done", completed_at: new Date().toISOString() },
        implementation: {
          status: "done",
          completed_at: new Date().toISOString(),
        },
        review: { status: "done", completed_at: new Date().toISOString() },
        harden: { status: "done", completed_at: new Date().toISOString() },
        signoff: { status: "done", completed_at: new Date().toISOString() },
      };
      await store.changes.save(change);

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "addFeature" },
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
        { changeId: "addFeature" },
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
        { changeId: "addFeature" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("gate");
      expect(parsed.incompleteGates).toBeDefined();
      expect(parsed.incompleteGates.length).toBeGreaterThan(0);
    });
  });

  describe("adv_change_add_issue", () => {
    test("adds issue URL to change without existing issues", async () => {
      const result = await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.github_issues).toContain(
        "https://github.com/org/repo/issues/123",
      );
    });

    test("adds issue URL to change with existing issues", async () => {
      // Add first issue
      await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );

      // Add second issue
      const result = await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/456",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.github_issues).toHaveLength(2);
      expect(parsed.github_issues).toContain(
        "https://github.com/org/repo/issues/123",
      );
      expect(parsed.github_issues).toContain(
        "https://github.com/org/repo/issues/456",
      );
    });

    test("prevents duplicate issue URLs", async () => {
      // Add issue
      await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );

      // Try to add same issue again
      const result = await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.github_issues).toHaveLength(1);
      expect(parsed.message).toContain("already linked");
    });

    test("returns error for nonexistent change", async () => {
      const result = await changeTools.adv_change_add_issue.execute(
        {
          changeId: "nonexistent",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("not found");
    });

    // Note: URL validation is handled by Zod schema in safeExecute wrapper (index.ts),
    // not by the raw execute function. Invalid URLs are rejected at the MCP tool level.

    test("persists issue to JSON file", async () => {
      await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );

      // Verify persisted by reloading
      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.github_issues).toContain(
        "https://github.com/org/repo/issues/123",
      );
    });
  });

  describe("adv_change_remove_issue", () => {
    test("removes issue URL from change", async () => {
      // Add issue first
      await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );

      // Remove it
      const result = await changeTools.adv_change_remove_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.github_issues).not.toContain(
        "https://github.com/org/repo/issues/123",
      );
    });

    test("removes only specified issue, keeps others", async () => {
      // Add two issues
      await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );
      await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/456",
        },
        store,
      );

      // Remove one
      const result = await changeTools.adv_change_remove_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.github_issues).toHaveLength(1);
      expect(parsed.github_issues).not.toContain(
        "https://github.com/org/repo/issues/123",
      );
      expect(parsed.github_issues).toContain(
        "https://github.com/org/repo/issues/456",
      );
    });

    test("handles removing non-existent issue gracefully", async () => {
      const result = await changeTools.adv_change_remove_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/999",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.message).toContain("not linked");
    });

    test("returns error for nonexistent change", async () => {
      const result = await changeTools.adv_change_remove_issue.execute(
        {
          changeId: "nonexistent",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("not found");
    });

    test("persists removal to JSON file", async () => {
      // Add issue
      await changeTools.adv_change_add_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );

      // Remove issue
      await changeTools.adv_change_remove_issue.execute(
        {
          changeId: "addFeature",
          issueUrl: "https://github.com/org/repo/issues/123",
        },
        store,
      );

      // Verify persisted by reloading
      const result = await changeTools.adv_change_show.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.github_issues || []).not.toContain(
        "https://github.com/org/repo/issues/123",
      );
    });
  });
});
