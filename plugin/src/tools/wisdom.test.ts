/**
 * Wisdom Tools Tests
 *
 * TDD tests for wisdom management tools (cross-task learning)
 */

import { writeFile } from "fs/promises";
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { wisdomTools } from "./wisdom";
import { createStore, type Store } from "../storage/store";
import { createSQLiteStore, type SQLiteStore } from "../storage/sqlite";
import { initDatabase } from "../storage/health";
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

  describe("adv_project_wisdom_list (Leak #1)", () => {
    test("tool exists and is callable", () => {
      expect(wisdomTools.adv_project_wisdom_list).toBeDefined();
      expect(typeof wisdomTools.adv_project_wisdom_list.execute).toBe(
        "function",
      );
    });

    test("returns empty list when no project wisdom exists", async () => {
      const result = await wisdomTools.adv_project_wisdom_list.execute(
        {},
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed.entries).toEqual([]);
      expect(parsed.count).toBe(0);
      expect(parsed.byType).toBeDefined();
    });

    test("returns project wisdom entries with correct shape (mirrors adv_wisdom_list)", async () => {
      // Add project-level wisdom by promoting
      await addProjectWisdom(tempDir, {
        type: "convention",
        content: "Always use .optional() for backwards-compat schema changes",
        sourceChange: "addFeature",
        wisdomPath: store.paths.wisdom,
      });
      await addProjectWisdom(tempDir, {
        type: "gotcha",
        content: "node_modules must be symlinked in worktrees",
        sourceChange: "addFeature",
        wisdomPath: store.paths.wisdom,
      });

      const result = await wisdomTools.adv_project_wisdom_list.execute(
        {},
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.entries).toHaveLength(2);
      expect(parsed.count).toBe(2);
      expect(parsed.byType.convention).toBe(1);
      expect(parsed.byType.gotcha).toBe(1);

      // Verify entry shape mirrors adv_wisdom_list output
      const entry = parsed.entries[0];
      expect(entry.id).toBeDefined();
      expect(entry.type).toBeDefined();
      expect(entry.content).toBeDefined();
    });
  });
});

describe("Wisdom dedup + search + listAll (tk-Xxq9fNqw)", () => {
  let tempDir: string;
  let store: Store;
  let rawSqlite: SQLiteStore;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createStore(tempDir);
    // Open a second handle on the same DB for direct test seeding
    const dbPath = join(tempDir, ".adv", "db", "spec.db");
    rawSqlite = createSQLiteStore(dbPath);
    initDatabase(rawSqlite.db);
  });

  afterEach(async () => {
    rawSqlite.close();
    store.close();
    await cleanupTempDir(tempDir);
  });

  describe("dedup guard", () => {
    test("rejects exact-match (content, type) duplicate within same change", async () => {
      await store.wisdom.add(
        "addFeature",
        "pattern",
        "use dependency injection for testability",
      );

      await expect(
        store.wisdom.add(
          "addFeature",
          "pattern",
          "use dependency injection for testability",
        ),
      ).rejects.toThrow(/duplicate/i);
    });

    test("allows same content with different type", async () => {
      await store.wisdom.add(
        "addFeature",
        "pattern",
        "validate inputs at boundaries",
      );
      // Same content, different type — should succeed
      const entry = await store.wisdom.add(
        "addFeature",
        "gotcha",
        "validate inputs at boundaries",
      );
      expect(entry.type).toBe("gotcha");
    });

    test("dedup check trims whitespace before comparing", async () => {
      await store.wisdom.add(
        "addFeature",
        "pattern",
        "  leading and trailing spaces  ",
      );

      await expect(
        store.wisdom.add(
          "addFeature",
          "pattern",
          "leading and trailing spaces",
        ),
      ).rejects.toThrow(/duplicate/i);
    });
  });

  describe("search", () => {
    test("search returns FTS-ranked results matching query", async () => {
      // Seed SQLite directly to test routing logic independent of sync
      // (sync integration tested in tk-rD2wRJMK)
      rawSqlite.wisdom.upsertBatch("addFeature", [
        {
          id: "ws-jwt01",
          type: "pattern",
          content: "always validate JWT tokens on server side",
          recorded_at: new Date().toISOString(),
        },
        {
          id: "ws-db01",
          type: "gotcha",
          content: "connection pooling improves database throughput",
          recorded_at: new Date().toISOString(),
        },
      ]);

      const results = await store.wisdom.search("JWT tokens");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.content.includes("JWT"))).toBe(true);
    });

    test("search with changeId filters to that change only", async () => {
      rawSqlite.wisdom.upsertBatch("addFeature", [
        {
          id: "ws-auth1",
          type: "pattern",
          content: "auth pattern for service A",
          recorded_at: new Date().toISOString(),
        },
      ]);
      rawSqlite.wisdom.upsertBatch("anotherChange", [
        {
          id: "ws-auth2",
          type: "pattern",
          content: "auth pattern for service B",
          recorded_at: new Date().toISOString(),
        },
      ]);

      const results = await store.wisdom.search("auth pattern", {
        changeId: "addFeature",
      });
      expect(results.every((r) => r.change_id === "addFeature")).toBe(true);
    });
  });

  describe("listAll", () => {
    test("aggregates change-level and project-level wisdom", async () => {
      // Seed SQLite directly — bypasses sync dependency (tested in tk-rD2wRJMK)
      rawSqlite.wisdom.upsertBatch("addFeature", [
        {
          id: "ws-lf1",
          type: "pattern",
          content: "wisdom from feature change",
          recorded_at: new Date().toISOString(),
        },
      ]);
      await addProjectWisdom(tempDir, {
        type: "convention",
        content: "wisdom from project level",
        wisdomPath: store.paths.wisdom,
      });

      const all = await store.wisdom.listAll();
      const contents = all.map((e) => e.content);
      expect(contents).toContain("wisdom from feature change");
      expect(contents).toContain("wisdom from project level");
    });

    test("listAll deduplicates entries with same content and type", async () => {
      // Add same content at both change and project level
      rawSqlite.wisdom.upsertBatch("addFeature", [
        {
          id: "ws-dup1",
          type: "pattern",
          content: "shared wisdom across scopes",
          recorded_at: new Date().toISOString(),
        },
      ]);
      await addProjectWisdom(tempDir, {
        type: "pattern",
        content: "shared wisdom across scopes",
        wisdomPath: store.paths.wisdom,
      });

      const all = await store.wisdom.listAll();
      const matching = all.filter(
        (e) => e.content === "shared wisdom across scopes",
      );
      // Should appear once due to dedup
      expect(matching).toHaveLength(1);
    });

    test("listAll with type filter returns only matching type", async () => {
      rawSqlite.wisdom.upsertBatch("addFeature", [
        {
          id: "ws-pat1",
          type: "pattern",
          content: "a pattern entry",
          recorded_at: new Date().toISOString(),
        },
        {
          id: "ws-got1",
          type: "gotcha",
          content: "a gotcha entry",
          recorded_at: new Date().toISOString(),
        },
      ]);

      const patterns = await store.wisdom.listAll({ type: "pattern" });
      expect(patterns.every((e) => e.type === "pattern")).toBe(true);
      expect(patterns.some((e) => e.content === "a pattern entry")).toBe(true);
    });

    test("listAll picks up project wisdom added after initial sync in the same session", async () => {
      await store.wisdom.listAll();

      await addProjectWisdom(tempDir, {
        type: "convention",
        content: "project wisdom added after initial sync",
        wisdomPath: store.paths.wisdom,
      });

      const all = await store.wisdom.listAll();
      expect(
        all.some(
          (e) =>
            e.content === "project wisdom added after initial sync" &&
            e.scope === "project",
        ),
      ).toBe(true);
    });

    test("listAll drops stale project rows when the wisdom file becomes empty", async () => {
      await addProjectWisdom(tempDir, {
        type: "pattern",
        content: "stale project wisdom",
        wisdomPath: store.paths.wisdom,
      });

      let all = await store.wisdom.listAll();
      expect(all.some((e) => e.content === "stale project wisdom")).toBe(true);

      await writeFile(store.paths.wisdom, "", "utf-8");

      all = await store.wisdom.listAll();
      expect(all.some((e) => e.content === "stale project wisdom")).toBe(false);
    });
  });
});

describe("adv_wisdom_list tool expansion (tk-jmKscoDU)", () => {
  let tempDir: string;
  let store: Store;
  let rawDb: SQLiteStore;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createStore(tempDir);
    const dbPath = join(tempDir, ".adv", "db", "spec.db");
    rawDb = createSQLiteStore(dbPath);
    initDatabase(rawDb.db);
  });

  afterEach(async () => {
    rawDb.close();
    store.close();
    await cleanupTempDir(tempDir);
  });

  test("backwards-compatible: calling with only changeId still works identically", async () => {
    await store.wisdom.add("addFeature", "pattern", "existing pattern entry");
    const result = await wisdomTools.adv_wisdom_list.execute(
      { changeId: "addFeature" },
      store,
    );
    const parsed = JSON.parse(result);
    expect(parsed.count).toBe(1);
    expect(parsed.byType.pattern).toBe(1);
  });

  test("type filter returns only matching entries", async () => {
    await store.wisdom.add("addFeature", "pattern", "a pattern");
    await store.wisdom.add("addFeature", "gotcha", "a gotcha");
    await store.wisdom.add("addFeature", "convention", "a convention");

    const result = await wisdomTools.adv_wisdom_list.execute(
      { changeId: "addFeature", type: "gotcha" },
      store,
    );
    const parsed = JSON.parse(result);
    expect(parsed.count).toBe(1);
    expect(parsed.wisdom[0].type).toBe("gotcha");
  });

  test("query param routes to FTS search and returns ranked results", async () => {
    // Seed directly into SQLite for FTS to find
    rawDb.wisdom.upsertBatch("addFeature", [
      {
        id: "ws-q1",
        type: "pattern",
        content: "always validate authentication tokens",
        recorded_at: new Date().toISOString(),
      },
      {
        id: "ws-q2",
        type: "gotcha",
        content: "connection pooling for databases",
        recorded_at: new Date().toISOString(),
      },
    ]);

    const result = await wisdomTools.adv_wisdom_list.execute(
      { query: "authentication tokens" },
      store,
    );
    const parsed = JSON.parse(result);
    expect(parsed.count).toBeGreaterThan(0);
    expect(parsed.wisdom[0].content).toContain("authentication");
  });

  test("query sanitizes FTS operators before searching", async () => {
    rawDb.wisdom.upsertBatch("addFeature", [
      {
        id: "ws-q3",
        type: "pattern",
        content: "sanitize search tokens before FTS query",
        recorded_at: new Date().toISOString(),
      },
    ]);

    const result = await wisdomTools.adv_wisdom_list.execute(
      { query: "sanitize OR tokens*" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.count).toBeGreaterThan(0);
    expect(
      parsed.wisdom.some((w: { content: string }) =>
        w.content.includes("sanitize"),
      ),
    ).toBe(true);
  });

  test("no changeId and no query returns aggregated results via listAll", async () => {
    rawDb.wisdom.upsertBatch("addFeature", [
      {
        id: "ws-la1",
        type: "pattern",
        content: "pattern from change level",
        recorded_at: new Date().toISOString(),
      },
    ]);

    const result = await wisdomTools.adv_wisdom_list.execute({}, store);
    const parsed = JSON.parse(result);
    expect(parsed.wisdom.length).toBeGreaterThanOrEqual(1);
    expect(
      parsed.wisdom.some(
        (w: { content: string }) => w.content === "pattern from change level",
      ),
    ).toBe(true);
  });
});
