/**
 * Task Tools Tests
 *
 * TDD tests for task management tools
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { taskTools } from "./task";
import { createStore, type Store } from "../storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
} from "../__tests__/setup";

describe("Task Tools", () => {
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

  describe("adv_task_list", () => {
    test("returns all tasks for a change", async () => {
      const result = await taskTools.adv_task_list.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.tasks).toHaveLength(3);
      expect(parsed.tasks[0].id).toBe("tk-task0001");
    });

    test("filters by status", async () => {
      // Mark one task as done
      await store.tasks.update("tk-task0001", "done");

      const result = await taskTools.adv_task_list.execute(
        { changeId: "addFeature", status: "pending" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.tasks).toHaveLength(2);
    });

    test("returns empty array for change with no tasks", async () => {
      // Create empty change
      await store.changes.create("Empty change");
      const changes = await store.changes.list();
      const emptyChange = changes.changes.find(
        (c) => c.title === "Empty change",
      );

      const result = await taskTools.adv_task_list.execute(
        { changeId: emptyChange!.id },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.tasks).toHaveLength(0);
    });
  });

  describe("adv_task_ready", () => {
    test("returns unblocked pending tasks", async () => {
      const result = await taskTools.adv_task_ready.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      // Only tk-task0001 has no blockers
      expect(parsed.ready).toHaveLength(1);
      expect(parsed.ready[0].id).toBe("tk-task0001");
    });

    test("returns blocked tasks with blockers list", async () => {
      const result = await taskTools.adv_task_ready.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.blocked).toHaveLength(2);

      const task2 = parsed.blocked.find(
        (b: { task: { id: string } }) => b.task.id === "tk-task0002",
      );
      expect(task2.blockedBy).toContain("tk-task0001");
    });

    test("updates when blocker completes", async () => {
      // Complete first task
      await store.tasks.update("tk-task0001", "done");

      const result = await taskTools.adv_task_ready.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      // Now tk-task0002 should be ready
      expect(parsed.ready).toHaveLength(1);
      expect(parsed.ready[0].id).toBe("tk-task0002");
    });

    test("handles cancelled blockers", async () => {
      // Cancel first task instead of completing
      await store.tasks.update("tk-task0001", "cancelled");

      const result = await taskTools.adv_task_ready.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      // tk-task0002 should be ready (cancelled counts as resolved)
      expect(parsed.ready).toHaveLength(1);
      expect(parsed.ready[0].id).toBe("tk-task0002");
    });
  });

  describe("adv_task_update", () => {
    test("updates task status to in_progress", async () => {
      const result = await taskTools.adv_task_update.execute(
        { taskId: "tk-task0001", status: "in_progress" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.task.status).toBe("in_progress");
      expect(parsed.task.started_at).toBeDefined();
    });

    test("updates task status to done with notes", async () => {
      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-task0001",
          status: "done",
          notes: "Implementation complete",
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.task.status).toBe("done");
      expect(parsed.task.completed_at).toBeDefined();
      expect(parsed.task.completed_by).toBe("Implementation complete");
    });

    test("updates task status to cancelled", async () => {
      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-task0001",
          status: "cancelled",
          notes: "No longer needed",
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.task.status).toBe("cancelled");
    });

    test("persists changes to JSON file", async () => {
      await taskTools.adv_task_update.execute(
        { taskId: "tk-task0001", status: "done" },
        store,
      );

      // Reload from store
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      const task = changeResult.data!.tasks.find((t) => t.id === "tk-task0001");
      expect(task!.status).toBe("done");
    });

    test("returns error for nonexistent task", async () => {
      const result = await taskTools.adv_task_update.execute(
        { taskId: "nonexistent", status: "done" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("not found");
    });
  });

  describe("adv_task_add", () => {
    test("adds new task to change", async () => {
      const result = await taskTools.adv_task_add.execute(
        { changeId: "addFeature", content: "Write integration tests" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.taskId).toMatch(/^tk-/);
      expect(parsed.task.title).toBe("Write integration tests");
      expect(parsed.task.status).toBe("pending");
    });

    test("adds task with section", async () => {
      const result = await taskTools.adv_task_add.execute(
        {
          changeId: "addFeature",
          content: "Add error handling",
          section: "Error Handling",
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.task.section).toBe("Error Handling");
    });

    test("adds task with blocked_by dependency", async () => {
      const result = await taskTools.adv_task_add.execute(
        {
          changeId: "addFeature",
          content: "Final review",
          blockedBy: ["tk-task0003"],
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.task.deps).toHaveLength(1);
      expect(parsed.task.deps[0].type).toBe("blocked_by");
      expect(parsed.task.deps[0].target).toBe("tk-task0003");
    });

    test("new task appears in blocked list when dependency exists", async () => {
      await taskTools.adv_task_add.execute(
        {
          changeId: "addFeature",
          content: "Blocked task",
          blockedBy: ["tk-task0001"],
        },
        store,
      );

      const result = await taskTools.adv_task_ready.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      const newTaskBlocked = parsed.blocked.find(
        (b: { task: { title: string } }) => b.task.title === "Blocked task",
      );
      expect(newTaskBlocked).toBeDefined();
      expect(newTaskBlocked.blockedBy).toContain("tk-task0001");
    });

    test("persists new task to JSON file", async () => {
      const result = await taskTools.adv_task_add.execute(
        { changeId: "addFeature", content: "Persisted task" },
        store,
      );
      const parsed = JSON.parse(result);

      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      const task = changeResult.data!.tasks.find((t) => t.id === parsed.taskId);
      expect(task).toBeDefined();
      expect(task!.title).toBe("Persisted task");
    });

    test("returns error for nonexistent change", async () => {
      const result = await taskTools.adv_task_add.execute(
        { changeId: "nonexistent", content: "Some task" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("not found");
    });
  });

  describe("adv_task_evidence", () => {
    test("records red phase evidence", async () => {
      const result = await taskTools.adv_task_evidence.execute(
        {
          taskId: "tk-task0001",
          phase: "red",
          testFile: "test/feature.test.ts",
          command: "pnpm test",
          output: "FAIL: expected true, got false",
          exitCode: 1,
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.task.tdd_phase).toBe("red");
      expect(parsed.task.tdd_evidence.red.test_file).toBe(
        "test/feature.test.ts",
      );
      expect(parsed.task.tdd_evidence.red.exit_code).toBe(1);
      expect(parsed.task.tdd_evidence.red.recorded_at).toBeDefined();
    });

    test("records green phase evidence and marks complete", async () => {
      // First record red
      await taskTools.adv_task_evidence.execute(
        {
          taskId: "tk-task0001",
          phase: "red",
          exitCode: 1,
        },
        store,
      );

      // Then record green
      const result = await taskTools.adv_task_evidence.execute(
        {
          taskId: "tk-task0001",
          phase: "green",
          testFile: "test/feature.test.ts",
          command: "pnpm test",
          output: "PASS: all tests passed",
          exitCode: 0,
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.task.tdd_phase).toBe("complete");
      expect(parsed.task.tdd_evidence.green.exit_code).toBe(0);
      expect(parsed.compliance).toBe("compliant");
    });

    test("truncates long output", async () => {
      const longOutput = "x".repeat(1000);
      const result = await taskTools.adv_task_evidence.execute(
        {
          taskId: "tk-task0001",
          phase: "red",
          output: longOutput,
          exitCode: 1,
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.task.tdd_evidence.red.output_snippet.length).toBeLessThan(
        600,
      );
      expect(parsed.task.tdd_evidence.red.output_snippet).toContain(
        "[truncated]",
      );
    });

    test("persists evidence to JSON", async () => {
      await taskTools.adv_task_evidence.execute(
        {
          taskId: "tk-task0001",
          phase: "red",
          command: "npm test",
          exitCode: 1,
        },
        store,
      );

      // Reload from store
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      const task = changeResult.data!.tasks.find((t) => t.id === "tk-task0001");
      expect(task!.tdd_evidence?.red?.command).toBe("npm test");
    });

    test("returns error for nonexistent task", async () => {
      const result = await taskTools.adv_task_evidence.execute(
        { taskId: "nonexistent", phase: "red" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("not found");
    });
  });

  describe("adv_task_tdd_phase", () => {
    test("sets TDD phase", async () => {
      const result = await taskTools.adv_task_tdd_phase.execute(
        { taskId: "tk-task0001", phase: "refactor" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.task.tdd_phase).toBe("refactor");
    });

    test("returns error for nonexistent task", async () => {
      const result = await taskTools.adv_task_tdd_phase.execute(
        { taskId: "nonexistent", phase: "red" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("not found");
    });
  });

  describe("adv_task_skip_tdd", () => {
    test("skips TDD with reason", async () => {
      const result = await taskTools.adv_task_skip_tdd.execute(
        { taskId: "tk-task0001", reason: "trivial: config change" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.task.tdd_evidence.skipped).toBe(true);
      expect(parsed.task.tdd_evidence.skip_reason).toBe(
        "trivial: config change",
      );
      expect(parsed.task.tdd_phase).toBe("none");
      expect(parsed.compliance).toBe("compliant");
    });

    test("persists skip to JSON", async () => {
      await taskTools.adv_task_skip_tdd.execute(
        { taskId: "tk-task0001", reason: "legacy code" },
        store,
      );

      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      const task = changeResult.data!.tasks.find((t) => t.id === "tk-task0001");
      expect(task!.tdd_evidence?.skipped).toBe(true);
    });

    test("returns error for nonexistent task", async () => {
      const result = await taskTools.adv_task_skip_tdd.execute(
        { taskId: "nonexistent", reason: "test" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("not found");
    });
  });

  describe("adv_task_tdd_status", () => {
    test("returns TDD status for logic task", async () => {
      // Task title is "Implement the feature" - should require TDD
      const result = await taskTools.adv_task_tdd_status.execute(
        { taskId: "tk-task0001" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.analysis.requires_tdd).toBe(true);
      expect(parsed.analysis.is_trivial).toBe(false);
      expect(parsed.analysis.compliance).toBe("missing");
      expect(parsed.recommendation).toContain("Record TDD evidence");
    });

    test("returns compliant after evidence recorded", async () => {
      // Record both phases
      await taskTools.adv_task_evidence.execute(
        { taskId: "tk-task0001", phase: "red", exitCode: 1 },
        store,
      );
      await taskTools.adv_task_evidence.execute(
        { taskId: "tk-task0001", phase: "green", exitCode: 0 },
        store,
      );

      const result = await taskTools.adv_task_tdd_status.execute(
        { taskId: "tk-task0001" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.analysis.compliance).toBe("compliant");
      expect(parsed.recommendation).toContain("satisfied");
    });

    test("returns compliant after skip", async () => {
      await taskTools.adv_task_skip_tdd.execute(
        { taskId: "tk-task0001", reason: "test" },
        store,
      );

      const result = await taskTools.adv_task_tdd_status.execute(
        { taskId: "tk-task0001" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.analysis.compliance).toBe("compliant");
    });

    test("returns error for nonexistent task", async () => {
      const result = await taskTools.adv_task_tdd_status.execute(
        { taskId: "nonexistent" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("not found");
    });
  });
});
