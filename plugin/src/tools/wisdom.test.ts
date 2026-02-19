/**
 * Wisdom Tools Tests
 *
 * TDD tests for wisdom management tools (cross-task learning)
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { wisdomTools } from "./wisdom";
import { createStore, type Store } from "../storage/store";
import { listProjectWisdom, addProjectWisdom } from "../storage/project-wisdom";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
} from "../__tests__/setup";

describe("Wisdom Tools", () => {
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

  describe("adv_wisdom_add", () => {
    test("adds wisdom entry to change", async () => {
      const result = await wisdomTools.adv_wisdom_add.execute(
        {
          changeId: "addFeature",
          type: "pattern",
          content: "Use dependency injection for testability",
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.entry.id).toMatch(/^ws-/);
      expect(parsed.entry.type).toBe("pattern");
      expect(parsed.entry.content).toBe(
        "Use dependency injection for testability",
      );
      expect(parsed.entry.recorded_at).toBeDefined();
    });

    test("adds wisdom entry with source task", async () => {
      const result = await wisdomTools.adv_wisdom_add.execute(
        {
          changeId: "addFeature",
          type: "gotcha",
          content: "SQLite requires explicit transaction commit",
          sourceTask: "tk-task0001",
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.entry.source_task).toBe("tk-task0001");
    });

    test("validates wisdom type enum", async () => {
      // Valid types: pattern, success, failure, gotcha, convention
      for (const type of [
        "pattern",
        "success",
        "failure",
        "gotcha",
        "convention",
      ]) {
        const result = await wisdomTools.adv_wisdom_add.execute(
          {
            changeId: "addFeature",
            type: type as
              | "pattern"
              | "success"
              | "failure"
              | "gotcha"
              | "convention",
            content: `Test ${type}`,
          },
          store,
        );
        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(true);
      }
    });

    test("persists wisdom to JSON file", async () => {
      await wisdomTools.adv_wisdom_add.execute(
        {
          changeId: "addFeature",
          type: "success",
          content: "Early validation prevents downstream errors",
        },
        store,
      );

      // Reload from store
      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      expect(changeResult.data!.wisdom).toHaveLength(1);
      expect(changeResult.data!.wisdom![0].content).toBe(
        "Early validation prevents downstream errors",
      );
    });

    test("returns error for nonexistent change", async () => {
      const result = await wisdomTools.adv_wisdom_add.execute(
        {
          changeId: "nonexistent",
          type: "pattern",
          content: "Some wisdom",
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("not found");
    });

    test("allows multiple wisdom entries", async () => {
      await wisdomTools.adv_wisdom_add.execute(
        {
          changeId: "addFeature",
          type: "pattern",
          content: "First wisdom",
        },
        store,
      );
      await wisdomTools.adv_wisdom_add.execute(
        {
          changeId: "addFeature",
          type: "gotcha",
          content: "Second wisdom",
        },
        store,
      );

      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      expect(changeResult.data!.wisdom).toHaveLength(2);
    });
  });

  describe("adv_wisdom_list", () => {
    test("returns empty array when no wisdom exists", async () => {
      const result = await wisdomTools.adv_wisdom_list.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.wisdom).toEqual([]);
      expect(parsed.count).toBe(0);
    });

    test("returns all wisdom entries for a change", async () => {
      // Add some wisdom first
      await store.wisdom.add("addFeature", "pattern", "Pattern wisdom");
      await store.wisdom.add(
        "addFeature",
        "gotcha",
        "Gotcha wisdom",
        "tk-task0001",
      );

      const result = await wisdomTools.adv_wisdom_list.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.wisdom).toHaveLength(2);
      expect(parsed.count).toBe(2);
      expect(parsed.wisdom[0].type).toBe("pattern");
      expect(parsed.wisdom[1].type).toBe("gotcha");
    });

    test("returns error for nonexistent change", async () => {
      const result = await wisdomTools.adv_wisdom_list.execute(
        { changeId: "nonexistent" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("not found");
    });

    test("includes summary by type", async () => {
      await store.wisdom.add("addFeature", "pattern", "Pattern 1");
      await store.wisdom.add("addFeature", "pattern", "Pattern 2");
      await store.wisdom.add("addFeature", "gotcha", "Gotcha 1");

      const result = await wisdomTools.adv_wisdom_list.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.byType.pattern).toBe(2);
      expect(parsed.byType.gotcha).toBe(1);
    });
  });

  describe("adv_wisdom_promote", () => {
    test("promotes a change-level wisdom entry to project level", async () => {
      // Add wisdom to change first
      const addResult = await store.wisdom.add(
        "addFeature",
        "convention",
        "Always validate inputs at boundary",
        "tk-task0001",
      );

      const result = await wisdomTools.adv_wisdom_promote.execute(
        {
          changeId: "addFeature",
          wisdomId: addResult.id,
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.promoted.id).toMatch(/^pw-/);
      expect(parsed.promoted.type).toBe("convention");
      expect(parsed.promoted.content).toBe(
        "Always validate inputs at boundary",
      );
      expect(parsed.promoted.source_change).toBe("addFeature");
      expect(parsed.promoted.source_task).toBe("tk-task0001");
    });

    test("persists promoted entry to project wisdom JSONL", async () => {
      await store.wisdom.add(
        "addFeature",
        "convention",
        "Use atomic writes for JSONL",
      );
      const entries = await store.wisdom.list("addFeature");
      const wisdomId = entries[0].id;

      await wisdomTools.adv_wisdom_promote.execute(
        { changeId: "addFeature", wisdomId },
        store,
      );

      // Verify it's in the project-level store
      const projectWisdom = await listProjectWisdom(tempDir);
      expect(projectWisdom).toHaveLength(1);
      expect(projectWisdom[0].content).toBe("Use atomic writes for JSONL");
    });

    test("returns error for nonexistent change", async () => {
      const result = await wisdomTools.adv_wisdom_promote.execute(
        { changeId: "nonexistent", wisdomId: "ws-abc123" },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
    });

    test("returns error for nonexistent wisdom entry", async () => {
      const result = await wisdomTools.adv_wisdom_promote.execute(
        { changeId: "addFeature", wisdomId: "ws-nonexist" },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("not found");
    });

    test("promotes entries of any type", async () => {
      // All types should be promotable (the tool doesn't restrict)
      for (const type of [
        "pattern",
        "success",
        "failure",
        "gotcha",
        "convention",
      ] as const) {
        await store.wisdom.add("addFeature", type, `${type} learning`);
      }
      const entries = await store.wisdom.list("addFeature");

      for (const entry of entries) {
        const result = await wisdomTools.adv_wisdom_promote.execute(
          { changeId: "addFeature", wisdomId: entry.id },
          store,
        );
        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(true);
      }

      const projectWisdom = await listProjectWisdom(tempDir);
      expect(projectWisdom).toHaveLength(5);
    });

    test("rejects duplicate promotion of same wisdom entry", async () => {
      await store.wisdom.add(
        "addFeature",
        "convention",
        "Always validate inputs at boundary",
        "tk-task0001",
      );
      const entries = await store.wisdom.list("addFeature");
      const wisdomId = entries[0].id;

      // First promote should succeed
      const firstResult = await wisdomTools.adv_wisdom_promote.execute(
        { changeId: "addFeature", wisdomId },
        store,
      );
      const firstParsed = JSON.parse(firstResult);
      expect(firstParsed.success).toBe(true);

      // Second promote of same entry should be rejected as duplicate
      const secondResult = await wisdomTools.adv_wisdom_promote.execute(
        { changeId: "addFeature", wisdomId },
        store,
      );
      const secondParsed = JSON.parse(secondResult);
      expect(secondParsed.error).toBeDefined();
      expect(secondParsed.error).toContain("already promoted");

      // Should only have 1 entry in project wisdom, not 2
      const projectWisdom = await listProjectWisdom(tempDir);
      expect(projectWisdom).toHaveLength(1);
    });

    test("triggers compaction after promotion when over 50-entry cap", async () => {
      // Pre-fill project wisdom with 50 entries (at the cap)
      for (let i = 1; i <= 50; i++) {
        await addProjectWisdom(tempDir, {
          type: "pattern",
          content: `Prefilled wisdom ${i}`,
          sourceChange: "oldChange",
        });
      }

      // Verify we have exactly 50
      let projectWisdom = await listProjectWisdom(tempDir);
      expect(projectWisdom).toHaveLength(50);

      // Add a change-level entry and promote it (should go to 51, then compact to 50)
      await store.wisdom.add(
        "addFeature",
        "convention",
        "New promoted learning",
      );
      const entries = await store.wisdom.list("addFeature");
      const wisdomId = entries[0].id;

      await wisdomTools.adv_wisdom_promote.execute(
        { changeId: "addFeature", wisdomId },
        store,
      );

      // After compaction, should still be at 50 (not 51)
      projectWisdom = await listProjectWisdom(tempDir);
      expect(projectWisdom).toHaveLength(50);

      // The promoted convention entry should be retained (conventions are prioritized)
      expect(
        projectWisdom.some((e) => e.content === "New promoted learning"),
      ).toBe(true);
    });
  });
});
