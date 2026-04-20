/**
 * Agenda Storage Tests
 *
 * Tests for lightweight task agenda functionality.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import {
  loadAgenda,
  initAgenda,
  addAgendaItem,
  updateAgendaItem,
  startAgendaItem,
  completeAgendaItem,
  cancelAgendaItem,
  reprioritizeAgendaItem,
  getActiveAgenda,
  getNextAgendaItem,
  getAgendaStats,
  compactAgenda,
  getAgendaPath,
  AGENDA_AUTO_COMPACT_MAX_LINES,
} from "./agenda";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";

describe("Agenda Storage", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("initAgenda", () => {
    test("creates agenda file with meta", async () => {
      const meta = await initAgenda(tempDir, "test-project");

      expect(meta.type).toBe("meta");
      expect(meta.version).toBe("1.0");
      expect(meta.project).toBe("test-project");
      expect(existsSync(getAgendaPath(tempDir))).toBe(true);
    });

    test("creates .adv directory if missing", async () => {
      await initAgenda(tempDir);
      expect(existsSync(join(tempDir, ".adv"))).toBe(true);
    });
  });

  describe("loadAgenda", () => {
    test("returns empty agenda for missing file", async () => {
      const { meta, items } = await loadAgenda(tempDir);
      expect(meta).toBeNull();
      expect(items).toHaveLength(0);
    });

    test("loads existing agenda with items", async () => {
      await initAgenda(tempDir);
      await addAgendaItem(tempDir, "Task 1", { priority: "high" });
      await addAgendaItem(tempDir, "Task 2", { priority: "low" });

      const { meta, items } = await loadAgenda(tempDir);

      expect(meta).not.toBeNull();
      expect(items).toHaveLength(2);
      // High priority should come first
      expect(items[0].title).toBe("Task 1");
      expect(items[1].title).toBe("Task 2");
    });

    test("handles updates via append (latest wins)", async () => {
      await initAgenda(tempDir);
      const item = await addAgendaItem(tempDir, "Original title");
      await updateAgendaItem(tempDir, item.id, { title: "Updated title" });

      const { items } = await loadAgenda(tempDir);

      expect(items).toHaveLength(1);
      expect(items[0].title).toBe("Updated title");
    });
  });

  describe("addAgendaItem", () => {
    test("adds item with defaults", async () => {
      const item = await addAgendaItem(tempDir, "Test task");

      expect(item.id).toMatch(/^ag-/);
      expect(item.title).toBe("Test task");
      expect(item.priority).toBe("medium");
      expect(item.status).toBe("pending");
      expect(item.tdd_phase).toBe("none");
    });

    test("adds item with custom options", async () => {
      const item = await addAgendaItem(tempDir, "Critical bug", {
        priority: "critical",
        category: "bugfix",
        description: "Fix ASAP",
      });

      expect(item.priority).toBe("critical");
      expect(item.category).toBe("bugfix");
      expect(item.description).toBe("Fix ASAP");
    });

    test("initializes agenda if not exists", async () => {
      // Don't call initAgenda first
      const item = await addAgendaItem(tempDir, "First task");

      expect(item).toBeDefined();
      expect(existsSync(getAgendaPath(tempDir))).toBe(true);
    });
  });

  describe("startAgendaItem", () => {
    test("marks item as active with timestamp", async () => {
      const item = await addAgendaItem(tempDir, "Task to start");
      const started = await startAgendaItem(tempDir, item.id);

      expect(started?.status).toBe("active");
      expect(started?.started_at).toBeDefined();
    });

    test("returns null for nonexistent item", async () => {
      const result = await startAgendaItem(tempDir, "ag-nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("completeAgendaItem", () => {
    test("marks item as done with timestamp", async () => {
      const item = await addAgendaItem(tempDir, "Task to complete");
      const completed = await completeAgendaItem(
        tempDir,
        item.id,
        "All tests pass",
      );

      expect(completed?.status).toBe("done");
      expect(completed?.completed_at).toBeDefined();
      expect(completed?.completion_notes).toBe("All tests pass");
    });
  });

  describe("cancelAgendaItem", () => {
    test("marks item as cancelled with reason", async () => {
      const item = await addAgendaItem(tempDir, "Task to cancel");
      const cancelled = await cancelAgendaItem(
        tempDir,
        item.id,
        "No longer needed",
      );

      expect(cancelled?.status).toBe("cancelled");
      expect(cancelled?.completion_notes).toBe("No longer needed");
    });
  });

  describe("reprioritizeAgendaItem", () => {
    test("changes item priority", async () => {
      const item = await addAgendaItem(tempDir, "Task", { priority: "low" });
      const updated = await reprioritizeAgendaItem(
        tempDir,
        item.id,
        "critical",
      );

      expect(updated?.priority).toBe("critical");
    });

    test("affects sort order", async () => {
      await addAgendaItem(tempDir, "Task A", { priority: "high" });
      const taskB = await addAgendaItem(tempDir, "Task B", { priority: "low" });

      // Task A should be first initially
      let { items } = await loadAgenda(tempDir);
      expect(items[0].title).toBe("Task A");

      // Raise Task B to critical
      await reprioritizeAgendaItem(tempDir, taskB.id, "critical");

      // Now Task B should be first
      ({ items } = await loadAgenda(tempDir));
      expect(items[0].title).toBe("Task B");
    });
  });

  describe("getActiveAgenda", () => {
    test("returns only pending and active items", async () => {
      await addAgendaItem(tempDir, "Pending");
      const item2 = await addAgendaItem(tempDir, "Active");
      const item3 = await addAgendaItem(tempDir, "Done");

      await startAgendaItem(tempDir, item2.id);
      await completeAgendaItem(tempDir, item3.id);

      const active = await getActiveAgenda(tempDir);

      expect(active).toHaveLength(2);
      expect(active.map((i) => i.title)).toContain("Pending");
      expect(active.map((i) => i.title)).toContain("Active");
      expect(active.map((i) => i.title)).not.toContain("Done");
    });
  });

  describe("getNextAgendaItem", () => {
    test("returns active item if exists", async () => {
      await addAgendaItem(tempDir, "Pending", {
        priority: "critical",
      });
      const item2 = await addAgendaItem(tempDir, "Active", { priority: "low" });
      await startAgendaItem(tempDir, item2.id);

      const next = await getNextAgendaItem(tempDir);

      // Should return active item even though pending is higher priority
      expect(next?.title).toBe("Active");
    });

    test("returns highest priority pending if no active", async () => {
      await addAgendaItem(tempDir, "Low priority", { priority: "low" });
      await addAgendaItem(tempDir, "High priority", { priority: "high" });

      const next = await getNextAgendaItem(tempDir);

      expect(next?.title).toBe("High priority");
    });

    test("skips blocked items", async () => {
      const blocker = await addAgendaItem(tempDir, "Blocker", {
        priority: "low",
      });
      await addAgendaItem(tempDir, "Blocked task", {
        priority: "critical",
        blocked_by: blocker.id,
      });

      const next = await getNextAgendaItem(tempDir);

      // Should return blocker, not the blocked critical task
      expect(next?.title).toBe("Blocker");
    });

    test("returns null when agenda is empty", async () => {
      const next = await getNextAgendaItem(tempDir);
      expect(next).toBeNull();
    });
  });

  describe("getAgendaStats", () => {
    test("returns correct statistics", async () => {
      await addAgendaItem(tempDir, "Pending high", {
        priority: "high",
        category: "tests",
      });
      const item2 = await addAgendaItem(tempDir, "Active low", {
        priority: "low",
        category: "bugfix",
      });
      const item3 = await addAgendaItem(tempDir, "Done medium", {
        priority: "medium",
        category: "tests",
      });

      await startAgendaItem(tempDir, item2.id);
      await completeAgendaItem(tempDir, item3.id);

      const stats = await getAgendaStats(tempDir);

      expect(stats.total).toBe(3);
      expect(stats.byStatus.pending).toBe(1);
      expect(stats.byStatus.active).toBe(1);
      expect(stats.byStatus.done).toBe(1);
      expect(stats.byPriority.high).toBe(1);
      expect(stats.byPriority.medium).toBe(1);
      expect(stats.byPriority.low).toBe(1);
      expect(stats.byCategory.tests).toBe(2);
      expect(stats.byCategory.bugfix).toBe(1);
    });
  });

  describe("compactAgenda", () => {
    test("removes duplicate entries keeping latest", async () => {
      const item = await addAgendaItem(tempDir, "Original");

      // Make several updates (creates multiple JSONL lines)
      await updateAgendaItem(tempDir, item.id, { title: "Update 1" });
      await updateAgendaItem(tempDir, item.id, { title: "Update 2" });
      await updateAgendaItem(tempDir, item.id, { title: "Final" });

      // Read raw file - should have multiple lines
      const beforeContent = await readFile(getAgendaPath(tempDir), "utf-8");
      const beforeLines = beforeContent.trim().split("\n").length;
      expect(beforeLines).toBeGreaterThan(2); // meta + multiple updates

      // Compact
      await compactAgenda(tempDir);

      // Should only have meta + 1 item now
      const afterContent = await readFile(getAgendaPath(tempDir), "utf-8");
      const afterLines = afterContent.trim().split("\n").length;
      expect(afterLines).toBe(2); // meta + 1 item

      // Item should have final value
      const { items } = await loadAgenda(tempDir);
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe("Final");
    });

    test("auto-compacts after append count exceeds threshold", async () => {
      const item = await addAgendaItem(tempDir, "Original");

      for (let i = 1; i <= AGENDA_AUTO_COMPACT_MAX_LINES + 2; i++) {
        await updateAgendaItem(tempDir, item.id, { title: `Update ${i}` });
      }

      const content = await readFile(getAgendaPath(tempDir), "utf-8");
      const lines = content
        .trim()
        .split("\n")
        .filter((line) => line.trim().length > 0);

      expect(lines.length).toBeLessThan(AGENDA_AUTO_COMPACT_MAX_LINES);

      const { items } = await loadAgenda(tempDir);
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe(
        `Update ${AGENDA_AUTO_COMPACT_MAX_LINES + 2}`,
      );
    });
  });
});
