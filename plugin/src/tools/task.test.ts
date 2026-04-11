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
  parseToolOutput,
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

    test("metadata field is preserved on tasks that have it", async () => {
      // Add a task with metadata
      const task = await store.tasks.add("addFeature", "Task with metadata", {
        metadata: { env: "production", team: "backend" },
      });

      expect(task.metadata).toBeDefined();
      expect(task.metadata?.env).toBe("production");
      expect(task.metadata?.team).toBe("backend");

      // Verify it round-trips through list
      const tasks = await store.tasks.list("addFeature");
      const found = tasks.find((t) => t.id === task.id);
      expect(found?.metadata?.env).toBe("production");
    });

    test("filter: has_metadata_key returns only tasks with that key", async () => {
      // Add tasks with and without metadata
      await store.tasks.add("addFeature", "Task with target_repo", {
        metadata: { target_repo: "backend" },
      });
      await store.tasks.add("addFeature", "Task without metadata");

      const result = await taskTools.adv_task_list.execute(
        { changeId: "addFeature", filter: "has_metadata_key:target_repo" },
        store,
      );
      const parsed = JSON.parse(result);

      // Only the task with target_repo metadata should be returned
      expect(parsed.tasks.length).toBeGreaterThan(0);
      for (const t of parsed.tasks) {
        expect(t.metadata?.target_repo).toBeDefined();
      }
    });

    test("filter: metadata:key=value returns only tasks matching that pair", async () => {
      await store.tasks.add("addFeature", "Production task", {
        metadata: { env: "production" },
      });
      await store.tasks.add("addFeature", "Staging task", {
        metadata: { env: "staging" },
      });

      const result = await taskTools.adv_task_list.execute(
        { changeId: "addFeature", filter: "metadata:env=production" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.tasks.length).toBeGreaterThan(0);
      for (const t of parsed.tasks) {
        expect(t.metadata?.env).toBe("production");
      }
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

    test("rejects direct cancellation via adv_task_update", async () => {
      const result = await taskTools.adv_task_update.execute(
        {
          taskId: "tk-task0001",
          status: "cancelled",
          notes: "No longer needed",
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("Direct task cancellation is not allowed");
      expect(parsed.hint).toContain("adv_task_cancel");

      // Verify task was NOT cancelled
      const task = await store.tasks.get("tk-task0001");
      expect(task!.status).not.toBe("cancelled");
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

    test("preserves metadata.tdd_intent during status update (rq-TDD007req.5)", async () => {
      // Set up a task with tdd_intent metadata
      const changeResult = await store.changes.get("addFeature");
      const change = changeResult.data!;
      const taskInChange = change.tasks.find((t) => t.id === "tk-task0001");
      taskInChange!.metadata = { tdd_intent: "inline" };
      await store.changes.save(change);

      // Update status — should NOT touch metadata
      await taskTools.adv_task_update.execute(
        { taskId: "tk-task0001", status: "in_progress" },
        store,
      );

      // Verify metadata.tdd_intent is preserved
      const updated = await store.tasks.get("tk-task0001");
      expect(updated!.metadata?.tdd_intent).toBe("inline");

      // Also verify after done transition
      await taskTools.adv_task_update.execute(
        { taskId: "tk-task0001", status: "done", notes: "Complete" },
        store,
      );

      const final = await store.tasks.get("tk-task0001");
      expect(final!.metadata?.tdd_intent).toBe("inline");
    });
  });

  describe("adv_task_add", () => {
    test("adds new task to change", async () => {
      const result = await taskTools.adv_task_add.execute(
        { changeId: "addFeature", content: "Write integration tests" },
        store,
      );
      const parsed = parseToolOutput(result);

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
      const parsed = parseToolOutput(result);

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
      const parsed = parseToolOutput(result);

      expect(parsed.task.deps).toHaveLength(1);
      expect(parsed.task.deps[0].type).toBe("blocked_by");
      expect(parsed.task.deps[0].target).toBe("tk-task0003");
    });

    test("adds task with metadata", async () => {
      const result = await taskTools.adv_task_add.execute(
        {
          changeId: "addFeature",
          content: "Run cross-cutting verification",
          metadata: { tdd_intent: "separate_verification", env: "test" },
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.task.metadata).toEqual({
        tdd_intent: "separate_verification",
        env: "test",
      });

      const persisted = await store.tasks.get(parsed.taskId);
      expect(persisted?.metadata).toEqual({
        tdd_intent: "separate_verification",
        env: "test",
      });
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
      const parsed = parseToolOutput(result);

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
      const parsed = parseToolOutput(result);

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
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("not found");
    });

    test("rejects task creation when planning gate is complete", async () => {
      await store.gates.complete("addFeature", "proposal");
      await store.gates.complete("addFeature", "discovery");
      await store.gates.complete("addFeature", "design");
      await store.gates.complete("addFeature", "planning");

      const result = await taskTools.adv_task_add.execute(
        { changeId: "addFeature", content: "Should be rejected" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain("planning gate");
      expect(parsed.error).toContain("adv_change_reenter");
    });

    test("allows task creation when planning gate is pending", async () => {
      // Default fixture has no gates (undefined) — should allow
      const result = await taskTools.adv_task_add.execute(
        { changeId: "addFeature", content: "Should succeed with no gates" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toBeUndefined();
      expect(parsed.taskId).toMatch(/^tk-/);
    });

    test("store.gates exposes migrate helper", () => {
      expect("migrate" in store.gates).toBe(true);
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

      // 80 chars + "\n... [truncated]" suffix = max 96 chars
      expect(
        parsed.task.tdd_evidence.red.output_snippet.length,
      ).toBeLessThanOrEqual(96);
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

    test("rejects red phase with exitCode=0 (test should be failing)", async () => {
      const result = await taskTools.adv_task_evidence.execute(
        {
          taskId: "tk-task0001",
          phase: "red",
          command: "pnpm test",
          exitCode: 0,
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("Evidence rejected");
      expect(parsed.error).toContain("Red phase expects a failing test");
      expect(parsed.phase).toBe("red");
      expect(parsed.exitCode).toBe(0);
    });

    test("rejects green phase with exitCode=1 (test should be passing)", async () => {
      const result = await taskTools.adv_task_evidence.execute(
        {
          taskId: "tk-task0001",
          phase: "green",
          command: "pnpm test",
          exitCode: 1,
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("Evidence rejected");
      expect(parsed.error).toContain("Green phase expects a passing test");
      expect(parsed.phase).toBe("green");
      expect(parsed.exitCode).toBe(1);
    });

    test("allows evidence without exitCode (backward compat)", async () => {
      const result = await taskTools.adv_task_evidence.execute(
        {
          taskId: "tk-task0001",
          phase: "red",
          command: "pnpm test",
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.error).toBeUndefined();
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

  describe("adv_task_show", () => {
    test("returns full task with changeId for existing task", async () => {
      const result = await taskTools.adv_task_show.execute(
        { taskId: "tk-task0001" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.task).toBeDefined();
      expect(parsed.changeId).toBe("addFeature");
      expect(parsed.task.id).toBe("tk-task0001");
      expect(parsed.task.title).toBe("Implement core logic");
      expect(parsed.task.status).toBe("pending");
      expect(parsed.task.tdd_phase).toBeDefined();
    });

    test("returns all task fields", async () => {
      const result = await taskTools.adv_task_show.execute(
        { taskId: "tk-task0002" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.task.id).toBe("tk-task0002");
      expect(parsed.task.deps).toBeDefined();
      expect(parsed.task.created_at).toBeDefined();
    });

    test("returns error for nonexistent task", async () => {
      const result = await taskTools.adv_task_show.execute(
        { taskId: "tk-nonexistent" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("Task not found");
      expect(parsed.error).toContain("tk-nonexistent");
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

    test("returns compliant for task with skipped tdd_evidence (backward compat)", async () => {
      // Simulate legacy skipped evidence without the removed tool
      const changeResult = await store.changes.get("addFeature");
      const task = changeResult.data!.tasks.find((t) => t.id === "tk-task0001");
      task!.tdd_evidence = { skipped: true, skip_reason: "test" };
      await store.changes.save(changeResult.data!);

      const result = await taskTools.adv_task_tdd_status.execute(
        { taskId: "tk-task0001" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.analysis.compliance).toBe("compliant");
    });

    test("uses metadata.tdd_intent before title heuristics", async () => {
      const task = await store.tasks.add(
        "addFeature",
        "Coordinate release notes",
        {
          metadata: { tdd_intent: "inline" },
        },
      );

      const result = await taskTools.adv_task_tdd_status.execute(
        { taskId: task.id },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.analysis.requires_tdd).toBe(true);
      expect(parsed.analysis.compliance).toBe("missing");
      expect(parsed.recommendation).toContain("Record TDD evidence");
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

  describe("adv_task_cancel", () => {
    test("cancels a single task with full approval metadata", async () => {
      const result = await taskTools.adv_task_cancel.execute(
        {
          taskIds: ["tk-task0001"],
          reasons: { "tk-task0001": "Absorbed into tk-task0002" },
          approvedByUser: true,
          approvalEvidence:
            "User approved via question tool: selected 'Approve cancellations'",
          supersededBy: { "tk-task0001": "tk-task0002" },
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.cancelled).toHaveLength(1);
      expect(parsed.cancelled[0].id).toBe("tk-task0001");

      // Verify task was actually cancelled with metadata
      const task = await store.tasks.get("tk-task0001");
      expect(task!.status).toBe("cancelled");
      expect(task!.cancellation).toBeDefined();
      expect(task!.cancellation!.reason).toBe("Absorbed into tk-task0002");
      expect(task!.cancellation!.approved_by_user).toBe(true);
      expect(task!.cancellation!.approval_evidence).toContain("question tool");
      expect(task!.cancellation!.superseded_by).toBe("tk-task0002");
      expect(task!.cancellation!.approved_at).toBeDefined();
      expect(task!.completed_at).toBeDefined();
    });

    test("cancels multiple tasks in batch", async () => {
      const result = await taskTools.adv_task_cancel.execute(
        {
          taskIds: ["tk-task0001", "tk-task0002"],
          reasons: {
            "tk-task0001": "Out of scope per user decision",
            "tk-task0002": "Superseded by new approach",
          },
          approvedByUser: true,
          approvalEvidence: "User confirmed batch cancellation in chat",
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.cancelled).toHaveLength(2);

      const task1 = await store.tasks.get("tk-task0001");
      const task2 = await store.tasks.get("tk-task0002");
      expect(task1!.status).toBe("cancelled");
      expect(task2!.status).toBe("cancelled");
      expect(task1!.cancellation!.reason).toBe(
        "Out of scope per user decision",
      );
      expect(task2!.cancellation!.reason).toBe("Superseded by new approach");
    });

    test("rejects when missing per-task reason", async () => {
      const result = await taskTools.adv_task_cancel.execute(
        {
          taskIds: ["tk-task0001", "tk-task0002"],
          reasons: {
            "tk-task0001": "Has a reason",
            // tk-task0002 missing
          },
          approvedByUser: true,
          approvalEvidence: "User approved",
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("Missing cancellation reason");
      expect(parsed.error).toContain("tk-task0002");

      // Verify neither task was cancelled
      const task1 = await store.tasks.get("tk-task0001");
      const task2 = await store.tasks.get("tk-task0002");
      expect(task1!.status).not.toBe("cancelled");
      expect(task2!.status).not.toBe("cancelled");
    });

    test("rejects when approval evidence is empty", async () => {
      const result = await taskTools.adv_task_cancel.execute(
        {
          taskIds: ["tk-task0001"],
          reasons: { "tk-task0001": "Some reason" },
          approvedByUser: true,
          approvalEvidence: "   ",
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("approvalEvidence is required");
    });

    test("handles nonexistent task in batch gracefully", async () => {
      const result = await taskTools.adv_task_cancel.execute(
        {
          taskIds: ["tk-task0001", "nonexistent"],
          reasons: {
            "tk-task0001": "Valid cancellation",
            nonexistent: "Does not exist",
          },
          approvedByUser: true,
          approvalEvidence: "User approved",
        },
        store,
      );
      const parsed = JSON.parse(result);

      // Partial success
      expect(parsed.success).toBe(false);
      expect(parsed.cancelled).toHaveLength(1);
      expect(parsed.results).toHaveLength(2);
      expect(parsed.results[0].success).toBe(true);
      expect(parsed.results[1].success).toBe(false);
      expect(parsed.results[1].error).toContain("not found");
    });
  });

  // ===========================================================================
  // adv_task_reclassify_tdd
  // ===========================================================================

  describe("adv_task_reclassify_tdd", () => {
    test("reclassifies tdd_intent with audit trail", async () => {
      // Set up a task with existing tdd_intent metadata
      await store.tasks.update("tk-task0001", "in_progress");
      const changeResult = await store.changes.get("addFeature");
      const change = changeResult.data!;
      const taskInChange = change.tasks.find((t) => t.id === "tk-task0001");
      taskInChange!.metadata = { tdd_intent: "inline" };
      await store.changes.save(change);

      const result = await taskTools.adv_task_reclassify_tdd.execute(
        {
          taskId: "tk-task0001",
          toIntent: "not_applicable",
          reason: "Task turned out to be config-only, no logic to test",
          approvedByUser: true as const,
          approvalEvidence: "User approved via question tool",
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.task.metadata.tdd_intent).toBe("not_applicable");
      expect(parsed.task.tdd_reclassification).toBeDefined();
      expect(parsed.task.tdd_reclassification.from_intent).toBe("inline");
      expect(parsed.task.tdd_reclassification.to_intent).toBe("not_applicable");
      expect(parsed.task.tdd_reclassification.reason).toBe(
        "Task turned out to be config-only, no logic to test",
      );
      expect(parsed.task.tdd_reclassification.approved_by_user).toBe(true);
      expect(parsed.task.tdd_reclassification.approval_evidence).toBe(
        "User approved via question tool",
      );
      expect(parsed.task.tdd_reclassification.approved_at).toBeDefined();
    });

    test("rejects when task has no tdd_intent metadata", async () => {
      // tk-task0001 has no metadata.tdd_intent by default
      const result = await taskTools.adv_task_reclassify_tdd.execute(
        {
          taskId: "tk-task0001",
          toIntent: "not_applicable",
          reason: "Some reason",
          approvedByUser: true as const,
          approvalEvidence: "User approved",
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("tdd_intent");
    });

    test("rejects when approvalEvidence is empty", async () => {
      const changeResult = await store.changes.get("addFeature");
      const change = changeResult.data!;
      const taskInChange = change.tasks.find((t) => t.id === "tk-task0001");
      taskInChange!.metadata = { tdd_intent: "inline" };
      await store.changes.save(change);

      const result = await taskTools.adv_task_reclassify_tdd.execute(
        {
          taskId: "tk-task0001",
          toIntent: "not_applicable",
          reason: "Some reason",
          approvedByUser: true as const,
          approvalEvidence: "   ",
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("approvalEvidence");
    });

    test("rejects when task not found", async () => {
      const result = await taskTools.adv_task_reclassify_tdd.execute(
        {
          taskId: "nonexistent",
          toIntent: "not_applicable",
          reason: "Some reason",
          approvedByUser: true as const,
          approvalEvidence: "User approved",
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("not found");
    });

    test("rejects when reclassifying to same intent", async () => {
      const changeResult = await store.changes.get("addFeature");
      const change = changeResult.data!;
      const taskInChange = change.tasks.find((t) => t.id === "tk-task0001");
      taskInChange!.metadata = { tdd_intent: "inline" };
      await store.changes.save(change);

      const result = await taskTools.adv_task_reclassify_tdd.execute(
        {
          taskId: "tk-task0001",
          toIntent: "inline",
          reason: "No change needed",
          approvedByUser: true as const,
          approvalEvidence: "User approved",
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("already");
    });

    test("rejects reclassification when task is cancelled", async () => {
      // Set up a cancelled task with tdd_intent
      const changeResult = await store.changes.get("addFeature");
      const change = changeResult.data!;
      const taskInChange = change.tasks.find((t) => t.id === "tk-task0001");
      taskInChange!.metadata = { tdd_intent: "inline" };
      taskInChange!.status = "cancelled";
      taskInChange!.cancellation = {
        reason: "No longer needed",
        approved_by_user: true,
        approval_evidence: "User approved",
        approved_at: new Date().toISOString(),
      };
      await store.changes.save(change);

      const result = await taskTools.adv_task_reclassify_tdd.execute(
        {
          taskId: "tk-task0001",
          toIntent: "not_applicable",
          reason: "Task cancelled anyway",
          approvedByUser: true as const,
          approvalEvidence: "User approved",
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain("cancelled");
    });

    test("persists reclassification to store", async () => {
      // Set up metadata
      const changeResult = await store.changes.get("addFeature");
      const change = changeResult.data!;
      const taskInChange = change.tasks.find((t) => t.id === "tk-task0001");
      taskInChange!.metadata = { tdd_intent: "separate_verification" };
      await store.changes.save(change);

      await taskTools.adv_task_reclassify_tdd.execute(
        {
          taskId: "tk-task0001",
          toIntent: "inline",
          reason: "Discovered logic requires inline TDD",
          approvedByUser: true as const,
          approvalEvidence: "User approved",
        },
        store,
      );

      // Verify persistence via fresh read
      const updated = await store.tasks.get("tk-task0001");
      expect(updated!.metadata!.tdd_intent).toBe("inline");
      expect(updated!.tdd_reclassification).toBeDefined();
      expect(updated!.tdd_reclassification!.from_intent).toBe(
        "separate_verification",
      );
    });
  });
});

// =============================================================================
// Leak #6: implementation_summary on adv_task_update
// Leak #8: cancelledBlockerContext in adv_task_ready
// =============================================================================

describe("implementation_summary on adv_task_update (Leak #6)", () => {
  let tempDir2: string;
  let store2: Store;

  beforeEach(async () => {
    tempDir2 = await createTempDir();
    await createTestProject(tempDir2);
    store2 = await createStore(tempDir2);
    await store2.init();
    await store2.sync();
  });

  afterEach(async () => {
    store2.close();
    await cleanupTempDir(tempDir2);
  });

  test("adv_task_update args has implementation_summary field", () => {
    expect(taskTools.adv_task_update.args.implementation_summary).toBeDefined();
  });

  test("adv_task_update persists implementation_summary when provided", async () => {
    const summary =
      "Extended GateCompletionSchema with optional notes field per KD4";
    const result = await taskTools.adv_task_update.execute(
      {
        taskId: "tk-task0001",
        status: "done",
        implementation_summary: summary,
      },
      store2,
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);

    // Verify persisted
    const task = await store2.tasks.get("tk-task0001");
    expect(task!.implementation_summary).toBe(summary);
  });

  test("adv_task_update works without implementation_summary (backwards compat)", async () => {
    const result = await taskTools.adv_task_update.execute(
      { taskId: "tk-task0001", status: "done" },
      store2,
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    const task = await store2.tasks.get("tk-task0001");
    expect(task!.implementation_summary).toBeUndefined();
  });

  test("adv_task_update persists error_recovery attempts history (Leak #9)", async () => {
    const result = await taskTools.adv_task_update.execute(
      {
        taskId: "tk-task0001",
        status: "in_progress",
        notes: "RETRY 2/3 - SEMANTIC: type mismatch",
        error_recovery: {
          last_error: "Type 'string' is not assignable to type 'number'",
          retry_count: 2,
          max_retries: 3,
          error_class: "SEMANTIC",
          next_strategy: "Tighten the type narrowing in change.ts",
          attempts: [
            {
              attempt_number: 1,
              error: "Initial type mismatch",
              diagnosis: "Union not narrowed",
              fix_tried: "Added success guard",
              outcome: "failed",
              attempted_at: new Date().toISOString(),
            },
            {
              attempt_number: 2,
              error: "Second type mismatch",
              diagnosis: "Interface return type stale",
              fix_tried: "Updated sqlite ready return type",
              outcome: "failed",
              attempted_at: new Date().toISOString(),
            },
          ],
        },
      },
      store2,
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);

    const task = await store2.tasks.get("tk-task0001");
    expect(task!.error_recovery?.retry_count).toBe(2);
    expect(task!.error_recovery?.attempts).toHaveLength(2);
    expect(task!.error_recovery?.attempts?.[1].diagnosis).toBe(
      "Interface return type stale",
    );
  });
});

describe("cancelledBlockerContext in adv_task_ready (Leak #8)", () => {
  let tempDir3: string;
  let store3: Store;

  beforeEach(async () => {
    tempDir3 = await createTempDir();
    await createTestProject(tempDir3);
    store3 = await createStore(tempDir3);
    await store3.init();
    await store3.sync();
  });

  afterEach(async () => {
    store3.close();
    await cleanupTempDir(tempDir3);
  });

  test("adv_task_ready includes cancelledBlockerContext when blocker was cancelled", async () => {
    // Cancel tk-task0001 via store (to populate cancellation_reason in SQLite)
    await store3.tasks.cancel("tk-task0001", {
      reason: "Scope reduced — logic absorbed into tk-task0002",
      approved_by_user: true,
      approval_evidence: "User approved cancellation",
      approved_at: new Date().toISOString(),
    });

    const result = await taskTools.adv_task_ready.execute(
      { changeId: "addFeature" },
      store3,
    );
    const parsed = JSON.parse(result);

    // tk-task0002 is now ready (blocker was cancelled)
    const readyIds = parsed.ready.map((t: { id: string }) => t.id);
    expect(readyIds).toContain("tk-task0002");

    // cancelledBlockerContext should include the reason
    expect(parsed.cancelledBlockerContext).toBeDefined();
    const ctx = parsed.cancelledBlockerContext?.find(
      (c: { taskId: string }) => c.taskId === "tk-task0002",
    );
    expect(ctx).toBeDefined();
    expect(ctx?.cancellationReason).toBe(
      "Scope reduced — logic absorbed into tk-task0002",
    );
  });
});
