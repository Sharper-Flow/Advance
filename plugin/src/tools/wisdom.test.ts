/**
 * Wisdom Tools Tests
 *
 * TDD tests for wisdom management tools (cross-task learning)
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { wisdomTools } from "./wisdom";
import { createStore, type Store } from "../storage/store";
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
});
