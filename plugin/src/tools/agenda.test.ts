/**
 * Agenda Tools Tests
 *
 * TDD tests for lightweight agenda management tools.
 * These tests cover all 10 agenda MCP tools:
 * adv_agenda_list, adv_agenda_add, adv_agenda_start, adv_agenda_complete,
 * adv_agenda_cancel, adv_agenda_prioritize, adv_agenda_next, adv_agenda_stats,
 * adv_agenda_evidence, adv_agenda_compact
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { agendaTools } from "./agenda";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  parseToolOutput,
} from "../__tests__/setup";
describe("Agenda Tools", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir, {
      withSpecs: false,
      withChanges: false,
      withConfig: true,
    });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  // =============================================================================
  // adv_agenda_add
  // =============================================================================

  describe("adv_agenda_add", () => {
    test("adds a new agenda item and returns it with an id", async () => {
      const result = await agendaTools.adv_agenda_add.execute(
        { title: "Write documentation" },
        tempDir,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.item).toBeDefined();
      expect(parsed.item.id).toMatch(/^ag-/);
      expect(parsed.item.title).toBe("Write documentation");
      expect(parsed.item.status).toBe("pending");
      expect(parsed.item.priority).toBe("medium");
    });

    test("adds item with description", async () => {
      const result = await agendaTools.adv_agenda_add.execute(
        {
          title: "Refactor auth module",
          description: "Extract JWT logic into separate package",
        },
        tempDir,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.item.description).toBe(
        "Extract JWT logic into separate package",
      );
    });

    test("adds item with priority", async () => {
      const result = await agendaTools.adv_agenda_add.execute(
        { title: "Critical hotfix", priority: "critical" },
        tempDir,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.item.priority).toBe("critical");
    });

    test("adds item with category", async () => {
      const result = await agendaTools.adv_agenda_add.execute(
        { title: "Add tests", category: "tests" },
        tempDir,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.item.category).toBe("tests");
    });

    test("adds item with blocked_by", async () => {
      const addResult = await agendaTools.adv_agenda_add.execute(
        { title: "Write tests", category: "tests" },
        tempDir,
      );
      const addParsed = parseToolOutput(addResult);

      const result = await agendaTools.adv_agenda_add.execute(
        {
          title: "Review tests",
          blocked_by: addParsed.item.id,
        },
        tempDir,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.item.blocked_by).toBe(addParsed.item.id);
    });

    test("persists item to agenda file", async () => {
      const addResult = await agendaTools.adv_agenda_add.execute(
        { title: "Persisted item" },
        tempDir,
      );
      const addParsed = parseToolOutput(addResult);

      const listResult = await agendaTools.adv_agenda_list.execute({}, tempDir);
      const listParsed = parseToolOutput(listResult);

      const found = listParsed.items.find(
        (i: { id: string }) => i.id === addParsed.item.id,
      );
      expect(found).toBeDefined();
      expect(found.title).toBe("Persisted item");
    });
  });

  // =============================================================================
  // adv_agenda_list
  // =============================================================================

  describe("adv_agenda_list", () => {
    test("returns empty list when no agenda items exist", async () => {
      const result = await agendaTools.adv_agenda_list.execute({}, tempDir);
      const parsed = parseToolOutput(result);

      expect(parsed.count).toBe(0);
      expect(parsed.items).toHaveLength(0);
    });

    test("returns all non-completed items by default", async () => {
      await agendaTools.adv_agenda_add.execute({ title: "Task 1" }, tempDir);
      await agendaTools.adv_agenda_add.execute({ title: "Task 2" }, tempDir);
      await agendaTools.adv_agenda_add.execute({ title: "Task 3" }, tempDir);

      const result = await agendaTools.adv_agenda_list.execute({}, tempDir);
      const parsed = parseToolOutput(result);

      expect(parsed.count).toBe(3);
      expect(parsed.items).toHaveLength(3);
    });

    test("filters by status", async () => {
      const addResult1 = await agendaTools.adv_agenda_add.execute(
        { title: "Pending task" },
        tempDir,
      );
      const addResult2 = await agendaTools.adv_agenda_add.execute(
        { title: "Active task" },
        tempDir,
      );

      const p1 = JSON.parse(addResult1);
      expect(p1.item).toBeDefined();
      const p2 = JSON.parse(addResult2);
      expect(p2.item).toBeDefined();

      await agendaTools.adv_agenda_start.execute(
        { itemId: p2.item.id },
        tempDir,
      );

      const result = await agendaTools.adv_agenda_list.execute(
        { status: "pending" },
        tempDir,
      );
      const parsed = JSON.parse(result);

      expect(parsed.count).toBe(1);
      expect(parsed.items[0].title).toBe("Pending task");
    });

    test("includes done/cancelled when includeCompleted=true", async () => {
      const addResult1 = await agendaTools.adv_agenda_add.execute(
        { title: "Pending task" },
        tempDir,
      );
      const addResult2 = await agendaTools.adv_agenda_add.execute(
        { title: "Done task" },
        tempDir,
      );

      const p1 = JSON.parse(addResult1);
      expect(p1.item).toBeDefined();
      const p2 = JSON.parse(addResult2);
      expect(p2.item).toBeDefined();

      await agendaTools.adv_agenda_complete.execute(
        { itemId: p2.item.id },
        tempDir,
      );

      const result = await agendaTools.adv_agenda_list.execute(
        { includeCompleted: true },
        tempDir,
      );
      const parsed = JSON.parse(result);

      expect(parsed.count).toBe(2);
    });
  });

  // =============================================================================
  // adv_agenda_start
  // =============================================================================

  describe("adv_agenda_start", () => {
    test("starts an agenda item and marks it active", async () => {
      const addResult = await agendaTools.adv_agenda_add.execute(
        { title: "Start me" },
        tempDir,
      );
      const addParsed = parseToolOutput(addResult);

      const result = await agendaTools.adv_agenda_start.execute(
        { itemId: addParsed.item.id },
        tempDir,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.item.status).toBe("active");
      expect(parsed.item.started_at).toBeDefined();
    });

    test("returns error for nonexistent item", async () => {
      const result = await agendaTools.adv_agenda_start.execute(
        { itemId: "ag-nonexistent" },
        tempDir,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("not found");
    });
  });

  // =============================================================================
  // adv_agenda_complete
  // =============================================================================

  describe("adv_agenda_complete", () => {
    test("completes an agenda item with notes", async () => {
      const addResult = await agendaTools.adv_agenda_add.execute(
        { title: "Complete me" },
        tempDir,
      );
      const addParsed = parseToolOutput(addResult);

      const result = await agendaTools.adv_agenda_complete.execute(
        { itemId: addParsed.item.id, notes: "All done!" },
        tempDir,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.item.status).toBe("done");
      expect(parsed.item.completed_at).toBeDefined();
      expect(parsed.item.completion_notes).toBe("All done!");
    });

    test("returns error for nonexistent item", async () => {
      const result = await agendaTools.adv_agenda_complete.execute(
        { itemId: "ag-nonexistent" },
        tempDir,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("not found");
    });
  });

  // =============================================================================
  // adv_agenda_cancel
  // =============================================================================

  describe("adv_agenda_cancel", () => {
    test("cancels an agenda item with reason", async () => {
      const addResult = await agendaTools.adv_agenda_add.execute(
        { title: "Cancel me" },
        tempDir,
      );
      const addParsed = parseToolOutput(addResult);

      const result = await agendaTools.adv_agenda_cancel.execute(
        { itemId: addParsed.item.id, reason: "No longer needed" },
        tempDir,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.item.status).toBe("cancelled");
      expect(parsed.item.completion_notes).toBe("No longer needed");
    });

    test("returns error for nonexistent item", async () => {
      const result = await agendaTools.adv_agenda_cancel.execute(
        { itemId: "ag-nonexistent" },
        tempDir,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("not found");
    });
  });

  // =============================================================================
  // adv_agenda_prioritize
  // =============================================================================

  describe("adv_agenda_prioritize", () => {
    test("changes item priority", async () => {
      const addResult = await agendaTools.adv_agenda_add.execute(
        { title: "Reprioritize me", priority: "low" },
        tempDir,
      );
      const addParsed = parseToolOutput(addResult);

      const result = await agendaTools.adv_agenda_prioritize.execute(
        { itemId: addParsed.item.id, priority: "high" },
        tempDir,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.item.priority).toBe("high");
    });

    test("returns error for nonexistent item", async () => {
      const result = await agendaTools.adv_agenda_prioritize.execute(
        { itemId: "ag-nonexistent", priority: "high" },
        tempDir,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("not found");
    });
  });

  // =============================================================================
  // adv_agenda_next
  // =============================================================================

  describe("adv_agenda_next", () => {
    test("returns highest priority pending item", async () => {
      await agendaTools.adv_agenda_add.execute(
        { title: "Low priority", priority: "low" },
        tempDir,
      );
      await agendaTools.adv_agenda_add.execute(
        { title: "High priority", priority: "high" },
        tempDir,
      );

      const result = await agendaTools.adv_agenda_next.execute({}, tempDir);
      const parsed = parseToolOutput(result);

      expect(parsed.next).toBeDefined();
      expect(parsed.next.title).toBe("High priority");
    });

    test("returns active item if one exists", async () => {
      const addResult = await agendaTools.adv_agenda_add.execute(
        { title: "I will be active" },
        tempDir,
      );
      const addParsed = parseToolOutput(addResult);
      await agendaTools.adv_agenda_start.execute(
        { itemId: addParsed.item.id },
        tempDir,
      );

      const result = await agendaTools.adv_agenda_next.execute({}, tempDir);
      const parsed = parseToolOutput(result);

      expect(parsed.next.id).toBe(addParsed.item.id);
      expect(parsed.next.title).toBe("I will be active");
    });

    test("returns message when agenda is empty", async () => {
      const result = await agendaTools.adv_agenda_next.execute({}, tempDir);
      const parsed = parseToolOutput(result);

      expect(parsed.message).toBeDefined();
      expect(parsed.suggestion).toContain("adv_agenda_add");
    });
  });

  // =============================================================================
  // adv_agenda_stats
  // =============================================================================

  describe("adv_agenda_stats", () => {
    test("returns zero counts for empty agenda", async () => {
      const result = await agendaTools.adv_agenda_stats.execute({}, tempDir);
      const parsed = parseToolOutput(result);

      expect(parsed.total).toBe(0);
      expect(parsed.byStatus.pending).toBe(0);
      expect(parsed.byPriority).toBeDefined();
    });

    test("returns correct counts after adding items", async () => {
      await agendaTools.adv_agenda_add.execute(
        { title: "Task 1", priority: "high" },
        tempDir,
      );
      await agendaTools.adv_agenda_add.execute(
        { title: "Task 2", priority: "critical", category: "bugfix" },
        tempDir,
      );

      const result = await agendaTools.adv_agenda_stats.execute({}, tempDir);
      const parsed = parseToolOutput(result);

      expect(parsed.total).toBe(2);
      expect(parsed.byStatus.pending).toBe(2);
      expect(parsed.byPriority.critical).toBe(1);
      expect(parsed.byPriority.high).toBe(1);
      expect(parsed.byCategory.bugfix).toBe(1);
    });
  });

  // =============================================================================
  // adv_agenda_evidence
  // =============================================================================

  describe("adv_agenda_evidence", () => {
    test("records red phase evidence", async () => {
      const addResult = await agendaTools.adv_agenda_add.execute(
        { title: "Test me with TDD" },
        tempDir,
      );
      const addParsed = parseToolOutput(addResult);

      const result = await agendaTools.adv_agenda_evidence.execute(
        {
          itemId: addParsed.item.id,
          phase: "red",
          testFile: "test/feature.test.ts",
          command: "pnpm test",
          output: "FAIL: expected true, got false",
          exitCode: 1,
        },
        tempDir,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.item.tdd_phase).toBe("red");
      expect(parsed.item.tdd_evidence.red.test_file).toBe(
        "test/feature.test.ts",
      );
      expect(parsed.item.tdd_evidence.red.exit_code).toBe(1);
    });

    test("records green phase and sets phase to complete", async () => {
      const addResult = await agendaTools.adv_agenda_add.execute(
        { title: "Test me with TDD" },
        tempDir,
      );
      const addParsed = parseToolOutput(addResult);

      // Record red first
      await agendaTools.adv_agenda_evidence.execute(
        {
          itemId: addParsed.item.id,
          phase: "red",
          exitCode: 1,
        },
        tempDir,
      );

      // Then green
      const result = await agendaTools.adv_agenda_evidence.execute(
        {
          itemId: addParsed.item.id,
          phase: "green",
          testFile: "test/feature.test.ts",
          command: "pnpm test",
          output: "PASS: all tests passed",
          exitCode: 0,
        },
        tempDir,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.item.tdd_phase).toBe("complete");
      expect(parsed.item.tdd_evidence.green.exit_code).toBe(0);
    });

    test("returns error for nonexistent item", async () => {
      const result = await agendaTools.adv_agenda_evidence.execute(
        { itemId: "ag-nonexistent", phase: "red" },
        tempDir,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("not found");
    });
  });

  // =============================================================================
  // adv_agenda_compact
  // =============================================================================

  describe("adv_agenda_compact", () => {
    test("compacts agenda file and returns total item count", async () => {
      await agendaTools.adv_agenda_add.execute({ title: "Task 1" }, tempDir);
      await agendaTools.adv_agenda_add.execute({ title: "Task 2" }, tempDir);

      const result = await agendaTools.adv_agenda_compact.execute({}, tempDir);
      const parsed = parseToolOutput(result);

      expect(parsed.success).toBe(true);
      expect(parsed.message).toBe("Agenda compacted");
      expect(parsed.items).toBe(2);
    });
  });

  // =============================================================================
  // Integration: full agenda lifecycle
  // =============================================================================

  describe("full agenda lifecycle", () => {
    test("supports add → start → evidence → complete lifecycle", async () => {
      // Add
      const addResult = await agendaTools.adv_agenda_add.execute(
        { title: "Build feature", priority: "high" },
        tempDir,
      );
      const addParsed = parseToolOutput(addResult);

      // Start
      await agendaTools.adv_agenda_start.execute(
        { itemId: addParsed.item.id },
        tempDir,
      );

      // Evidence red
      await agendaTools.adv_agenda_evidence.execute(
        {
          itemId: addParsed.item.id,
          phase: "red",
          exitCode: 1,
        },
        tempDir,
      );

      // Evidence green
      await agendaTools.adv_agenda_evidence.execute(
        {
          itemId: addParsed.item.id,
          phase: "green",
          exitCode: 0,
        },
        tempDir,
      );

      // Complete
      const completeResult = await agendaTools.adv_agenda_complete.execute(
        { itemId: addParsed.item.id, notes: "Feature built" },
        tempDir,
      );
      const completeParsed = parseToolOutput(completeResult);

      expect(completeParsed.item.status).toBe("done");
      // Agenda items lack type field, so getTddComplianceStatus returns "not_required"
      // (this is expected behavior — use adv_task_* tools for TDD-tracked work)
      expect(completeParsed.compliance).toBe("not_required");

      // Verify it's gone from default list
      const listResult = await agendaTools.adv_agenda_list.execute({}, tempDir);
      const listParsed = parseToolOutput(listResult);
      expect(listParsed.count).toBe(0);
    });

    test("blocked item is skipped by adv_agenda_next until blocker completes", async () => {
      // Add blocker item
      const blockerResult = await agendaTools.adv_agenda_add.execute(
        { title: "Blocker item", priority: "low" },
        tempDir,
      );
      const blockerParsed = parseToolOutput(blockerResult);
      expect(blockerParsed.item).toBeDefined();

      // Add blocked item (depends on blocker)
      const blockedResult = await agendaTools.adv_agenda_add.execute(
        {
          title: "Blocked item",
          priority: "critical",
          blocked_by: blockerParsed.item.id,
        },
        tempDir,
      );
      const blockedParsed = parseToolOutput(blockedResult);
      expect(blockedParsed.item).toBeDefined();

      // Next should return blocker (blocked item is skipped even at critical priority)
      const nextResult = await agendaTools.adv_agenda_next.execute({}, tempDir);
      const nextParsed = parseToolOutput(nextResult);
      expect(nextParsed.next?.title).toBe("Blocker item");

      // Complete the blocker
      await agendaTools.adv_agenda_complete.execute(
        { itemId: blockerParsed.item.id },
        tempDir,
      );

      // Now next should return the previously blocked item
      const nextResult2 = await agendaTools.adv_agenda_next.execute(
        {},
        tempDir,
      );
      const nextParsed2 = parseToolOutput(nextResult2);
      expect(nextParsed2.next?.title).toBe("Blocked item");
    });
  });
});
