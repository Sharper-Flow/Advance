/**
 * Project-Level Wisdom Store Tests
 *
 * TDD tests for JSONL-based project-level wisdom storage.
 * Mirrors agenda.ts patterns: append-only, atomic writes, compaction.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import {
  getProjectWisdomPath,
  addProjectWisdom,
  listProjectWisdom,
  compactProjectWisdom,
  type ProjectWisdomEntry,
} from "./project-wisdom";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";

describe("Project-Level Wisdom Store", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await mkdir(join(tempDir, ".adv"), { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("getProjectWisdomPath", () => {
    test("returns path within .adv directory", () => {
      const path = getProjectWisdomPath(tempDir);
      expect(path).toBe(join(tempDir, ".adv", "wisdom.jsonl"));
    });
  });

  describe("addProjectWisdom", () => {
    test("creates file and adds first entry", async () => {
      const entry = await addProjectWisdom(tempDir, {
        type: "convention",
        content: "Always use atomic writes for JSONL files",
        sourceChange: "addFeature",
      });

      expect(entry.id).toMatch(/^pw-/);
      expect(entry.type).toBe("convention");
      expect(entry.content).toBe("Always use atomic writes for JSONL files");
      expect(entry.source_change).toBe("addFeature");
      expect(entry.promoted_at).toBeDefined();

      // Verify file exists
      const path = getProjectWisdomPath(tempDir);
      expect(existsSync(path)).toBe(true);
    });

    test("appends multiple entries", async () => {
      await addProjectWisdom(tempDir, {
        type: "pattern",
        content: "First wisdom",
      });
      // Small delay to ensure distinct timestamps for deterministic ordering
      await new Promise((r) => setTimeout(r, 5));
      await addProjectWisdom(tempDir, {
        type: "gotcha",
        content: "Second wisdom",
      });

      const entries = await listProjectWisdom(tempDir);
      expect(entries).toHaveLength(2);
      // listProjectWisdom returns newest first
      expect(entries[0].content).toBe("Second wisdom");
      expect(entries[1].content).toBe("First wisdom");
    });

    test("includes optional source task", async () => {
      const entry = await addProjectWisdom(tempDir, {
        type: "success",
        content: "TDD catches regressions early",
        sourceChange: "addFeature",
        sourceTask: "tk-abc123",
      });

      expect(entry.source_task).toBe("tk-abc123");
    });

    test("generates unique IDs", async () => {
      const entry1 = await addProjectWisdom(tempDir, {
        type: "pattern",
        content: "First",
      });
      const entry2 = await addProjectWisdom(tempDir, {
        type: "pattern",
        content: "Second",
      });

      expect(entry1.id).not.toBe(entry2.id);
    });

    test("validates content is not empty", async () => {
      await expect(
        addProjectWisdom(tempDir, {
          type: "pattern",
          content: "",
        }),
      ).rejects.toThrow();
    });

    test("validates type is a valid WisdomType", async () => {
      await expect(
        addProjectWisdom(tempDir, {
          type: "invalid" as any,
          content: "Some content",
        }),
      ).rejects.toThrow();
    });
  });

  describe("listProjectWisdom", () => {
    test("returns empty array when file does not exist", async () => {
      const entries = await listProjectWisdom(tempDir);
      expect(entries).toEqual([]);
    });

    test("returns entries sorted by recency (newest first)", async () => {
      await addProjectWisdom(tempDir, {
        type: "pattern",
        content: "Oldest",
      });
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      await addProjectWisdom(tempDir, {
        type: "convention",
        content: "Newest",
      });

      const entries = await listProjectWisdom(tempDir);
      expect(entries).toHaveLength(2);
      // Newest first
      expect(entries[0].content).toBe("Newest");
      expect(entries[1].content).toBe("Oldest");
    });

    test("skips malformed lines", async () => {
      const path = getProjectWisdomPath(tempDir);
      await mkdir(join(tempDir, ".adv"), { recursive: true });
      await writeFile(
        path,
        '{"id":"pw-abc","type":"pattern","content":"Valid","promoted_at":"2026-01-01T00:00:00Z"}\n' +
          "not valid json\n" +
          '{"id":"pw-def","type":"gotcha","content":"Also valid","promoted_at":"2026-01-02T00:00:00Z"}\n',
      );

      const entries = await listProjectWisdom(tempDir);
      expect(entries).toHaveLength(2);
    });

    test("returns at most maxEntries entries", async () => {
      // Add 5 entries
      for (let i = 0; i < 5; i++) {
        await addProjectWisdom(tempDir, {
          type: "pattern",
          content: `Wisdom ${i}`,
        });
      }

      const entries = await listProjectWisdom(tempDir, { maxEntries: 3 });
      expect(entries).toHaveLength(3);
    });
  });

  describe("compactProjectWisdom", () => {
    test("removes entries beyond cap (50 default)", async () => {
      // Add 55 entries
      for (let i = 0; i < 55; i++) {
        await addProjectWisdom(tempDir, {
          type: "pattern",
          content: `Wisdom entry ${i}`,
        });
      }

      const beforeCompact = await listProjectWisdom(tempDir);
      expect(beforeCompact).toHaveLength(55);

      await compactProjectWisdom(tempDir);

      const afterCompact = await listProjectWisdom(tempDir);
      expect(afterCompact).toHaveLength(50);
    });

    test("preserves newest entries when pruning", async () => {
      for (let i = 0; i < 55; i++) {
        await addProjectWisdom(tempDir, {
          type: "pattern",
          content: `Wisdom entry ${i}`,
        });
        // Small delay for ordering
        await new Promise((r) => setTimeout(r, 2));
      }

      await compactProjectWisdom(tempDir);

      const entries = await listProjectWisdom(tempDir);
      // Newest entries should be kept (entries 5-54 → 50 entries)
      expect(entries[0].content).toBe("Wisdom entry 54");
    });

    test("prioritizes convention and pattern entries during pruning", async () => {
      // Add 50 success entries (non-priority)
      for (let i = 0; i < 50; i++) {
        await addProjectWisdom(tempDir, {
          type: "success",
          content: `Success ${i}`,
        });
      }
      // Add 5 convention entries (priority)
      for (let i = 0; i < 5; i++) {
        await addProjectWisdom(tempDir, {
          type: "convention",
          content: `Convention ${i}`,
        });
      }
      // Add 3 pattern entries (priority)
      for (let i = 0; i < 3; i++) {
        await addProjectWisdom(tempDir, {
          type: "pattern",
          content: `Pattern ${i}`,
        });
      }

      // 58 total entries, cap at 50
      await compactProjectWisdom(tempDir);

      const entries = await listProjectWisdom(tempDir);
      expect(entries).toHaveLength(50);

      // All conventions should survive (priority)
      const conventions = entries.filter((e) => e.type === "convention");
      expect(conventions).toHaveLength(5);

      // All patterns should survive (priority)
      const patterns = entries.filter((e) => e.type === "pattern");
      expect(patterns).toHaveLength(3);

      // Success entries get trimmed from 50 to 42 (50 - 5 - 3)
      const successes = entries.filter((e) => e.type === "success");
      expect(successes).toHaveLength(42);
    });

    test("is a no-op when under cap", async () => {
      await addProjectWisdom(tempDir, {
        type: "pattern",
        content: "Only one entry",
      });

      await compactProjectWisdom(tempDir);

      const entries = await listProjectWisdom(tempDir);
      expect(entries).toHaveLength(1);
    });

    test("accepts custom cap", async () => {
      for (let i = 0; i < 10; i++) {
        await addProjectWisdom(tempDir, {
          type: "pattern",
          content: `Entry ${i}`,
        });
      }

      await compactProjectWisdom(tempDir, { maxEntries: 5 });

      const entries = await listProjectWisdom(tempDir);
      expect(entries).toHaveLength(5);
    });

    test("is a no-op when file does not exist", async () => {
      // Should not throw
      await compactProjectWisdom(tempDir);
    });
  });

  describe("Schema validation", () => {
    test("rejects entries with invalid wisdom type during loading", async () => {
      // Manually write a JSONL line with an invalid type
      const path = getProjectWisdomPath(tempDir);
      const badEntry = JSON.stringify({
        id: "pw-bad12345",
        type: "invalid_type",
        content: "Bad entry",
        promoted_at: new Date().toISOString(),
      });
      const goodEntry = JSON.stringify({
        id: "pw-good1234",
        type: "convention",
        content: "Good entry",
        promoted_at: new Date().toISOString(),
      });
      await writeFile(path, `${badEntry}\n${goodEntry}\n`, "utf-8");

      const entries = await listProjectWisdom(tempDir);
      // Bad entry should be filtered out by schema validation
      expect(entries).toHaveLength(1);
      expect(entries[0].content).toBe("Good entry");
    });

    test("rejects entries with missing required fields during loading", async () => {
      const path = getProjectWisdomPath(tempDir);
      const missingId = JSON.stringify({
        type: "pattern",
        content: "No ID",
        promoted_at: new Date().toISOString(),
      });
      const missingContent = JSON.stringify({
        id: "pw-nocon123",
        type: "pattern",
        promoted_at: new Date().toISOString(),
      });
      const valid = JSON.stringify({
        id: "pw-valid123",
        type: "pattern",
        content: "Valid entry",
        promoted_at: new Date().toISOString(),
      });
      await writeFile(path, `${missingId}\n${missingContent}\n${valid}\n`, "utf-8");

      const entries = await listProjectWisdom(tempDir);
      expect(entries).toHaveLength(1);
      expect(entries[0].content).toBe("Valid entry");
    });

    test("rejects entries with invalid promoted_at during loading", async () => {
      const path = getProjectWisdomPath(tempDir);
      const badDate = JSON.stringify({
        id: "pw-baddate1",
        type: "pattern",
        content: "Bad date",
        promoted_at: "not-a-date",
      });
      const valid = JSON.stringify({
        id: "pw-valid123",
        type: "convention",
        content: "Valid entry",
        promoted_at: new Date().toISOString(),
      });
      await writeFile(path, `${badDate}\n${valid}\n`, "utf-8");

      const entries = await listProjectWisdom(tempDir);
      // Bad date should be filtered out by schema validation
      expect(entries).toHaveLength(1);
      expect(entries[0].content).toBe("Valid entry");
    });
  });

  describe("Concurrency safety", () => {
    test("concurrent addProjectWisdom calls produce valid JSONL", async () => {
      // Fire 10 concurrent adds — all should succeed without corruption
      const promises = Array.from({ length: 10 }, (_, i) =>
        addProjectWisdom(tempDir, {
          type: "pattern",
          content: `Concurrent entry ${i}`,
          sourceChange: "concurrencyTest",
        }),
      );

      const results = await Promise.all(promises);

      // All should return valid entries
      expect(results).toHaveLength(10);
      for (const entry of results) {
        expect(entry.id).toMatch(/^pw-/);
      }

      // All should be readable and valid
      const entries = await listProjectWisdom(tempDir);
      expect(entries).toHaveLength(10);
    });

    test("concurrent add and compact don't corrupt the file", async () => {
      // Pre-fill with 55 entries
      for (let i = 0; i < 55; i++) {
        await addProjectWisdom(tempDir, {
          type: "pattern",
          content: `Prefill ${i}`,
        });
      }

      // Run compact and add concurrently
      const [, addResult] = await Promise.all([
        compactProjectWisdom(tempDir),
        addProjectWisdom(tempDir, {
          type: "convention",
          content: "Added during compaction",
        }),
      ]);

      expect(addResult.id).toMatch(/^pw-/);

      // File should be valid JSONL — every line should parse
      const entries = await listProjectWisdom(tempDir);
      expect(entries.length).toBeGreaterThan(0);
      // Convention entry should be findable
      expect(entries.some((e) => e.content === "Added during compaction")).toBe(true);
    });
  });
});
