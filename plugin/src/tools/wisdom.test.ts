/**
 * Wisdom Tools Tests
 *
 * TDD tests for wisdom management tools (cross-task learning)
 */

import { writeFile } from "fs/promises";
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { wisdomTools } from "./wisdom";
import { createLegacyStore, type Store } from "../storage/store";
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
    store = await createLegacyStore(tempDir);
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

    test("adds and promotes when promote=true", async () => {
      const result = await wisdomTools.adv_wisdom_add.execute(
        {
          changeId: "addFeature",
          type: "convention",
          content: "Always validate inputs at boundary",
          sourceTask: "tk-task0001",
          promote: true,
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.promoted.id).toMatch(/^pw-/);
      expect(parsed.promoted.type).toBe("convention");
      expect(parsed.promoted.source_change).toBe("addFeature");
      expect(parsed.promoted.source_task).toBe("tk-task0001");
    });

    test("rejects duplicate add+promote when the change already contains identical wisdom", async () => {
      await wisdomTools.adv_wisdom_add.execute(
        {
          changeId: "addFeature",
          type: "convention",
          content: "Always validate inputs at boundary",
          sourceTask: "tk-task0001",
          promote: true,
        },
        store,
      );

      const result = await wisdomTools.adv_wisdom_add.execute(
        {
          changeId: "addFeature",
          type: "convention",
          content: "Always validate inputs at boundary",
          sourceTask: "tk-task0001",
          promote: true,
        },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("Duplicate wisdom entry");
    });

    test("triggers compaction after add+promote when over 50-entry cap", async () => {
      for (let i = 1; i <= 50; i++) {
        await addProjectWisdom(tempDir, {
          type: "pattern",
          content: `Prefilled wisdom ${i}`,
          sourceChange: "oldChange",
        });
      }

      let projectWisdom = await listProjectWisdom(tempDir);
      expect(projectWisdom).toHaveLength(50);

      await wisdomTools.adv_wisdom_add.execute(
        {
          changeId: "addFeature",
          type: "convention",
          content: "New promoted learning",
          promote: true,
        },
        store,
      );

      projectWisdom = await listProjectWisdom(tempDir);
      expect(projectWisdom).toHaveLength(50);
      expect(
        projectWisdom.some((e) => e.content === "New promoted learning"),
      ).toBe(true);
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
    store = await createLegacyStore(tempDir);
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
    store = await createLegacyStore(tempDir);
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
