import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import {
  ReflectionEntry,
  appendReflection,
  getReflection,
  listReflections,
  getReflectionsPath,
} from "./reflection";

const createTestEntry = (changeId: string): ReflectionEntry => ({
  id: `rf-test001`,
  change_id: changeId,
  created_at: new Date().toISOString(),
  plane1: {
    efficiency: {
      task_count: 3,
      tasks_done: 3,
      tasks_cancelled: 0,
      retry_total: 1,
      retry_density: 0.33,
      elapsed_ms: 3600000,
      per_gate_ms: { proposal: 300000, discovery: 600000 },
    },
    quality: {
      review_findings_count: 2,
      harden_findings_count: 0,
      tdd_compliance: 1.0,
    },
    process: {
      gate_completion_rate: 1.0,
      tdd_intent_distribution: { inline: 2, separate_verification: 1 },
      delegation_count: 0,
      drift_triggers: 0,
    },
    wisdom: {
      entries_captured: 2,
      entries_promoted: 1,
      wisdom_reuse_hits: 1,
    },
  },
  plane2: {
    friction_items: [
      {
        category: "tool_gap",
        tool_name: "adv_reflect",
        description: "Missing reflection tool",
        workaround: "Used manual analysis",
      },
    ],
    highlights: ["Completed on time", "Zero drift"],
    improvement_suggestions: ["Add reflection system"],
  },
});

describe("reflection storage", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "reflection-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("getReflectionsPath", () => {
    test("returns override path when provided", () => {
      const result = getReflectionsPath(
        "/project",
        "/custom/reflections.jsonl",
      );
      expect(result).toBe("/custom/reflections.jsonl");
    });

    test("returns project .adv path by default", () => {
      const result = getReflectionsPath("/project");
      expect(result).toBe("/project/.adv/reflections.jsonl");
    });
  });

  describe("appendReflection", () => {
    test("creates file and appends entry", async () => {
      const entry = createTestEntry("change-1");
      const result = await appendReflection(tempDir, entry);

      expect(result.id).toMatch(/^rf-/);
      expect(result.change_id).toBe("change-1");

      const path = getReflectionsPath(tempDir);
      expect(existsSync(path)).toBe(true);

      const content = readFileSync(path, "utf-8");
      const parsed = JSON.parse(content.trim());
      expect(parsed.change_id).toBe("change-1");
      expect(parsed.plane1.efficiency.task_count).toBe(3);
    });

    test("appends multiple entries to same file", async () => {
      const entry1 = createTestEntry("change-1");
      const entry2 = createTestEntry("change-2");

      await appendReflection(tempDir, entry1);
      await appendReflection(tempDir, entry2);

      const path = getReflectionsPath(tempDir);
      const lines = readFileSync(path, "utf-8").trim().split("\n");
      expect(lines).toHaveLength(2);

      const parsed1 = JSON.parse(lines[0]);
      const parsed2 = JSON.parse(lines[1]);
      expect(parsed1.change_id).toBe("change-1");
      expect(parsed2.change_id).toBe("change-2");
    });

    test("writes to flat override path without creating nested .adv", async () => {
      const entry = createTestEntry("change-flat");
      const flatPath = join(tempDir, "reflections.jsonl");

      await appendReflection(tempDir, entry, flatPath);

      expect(existsSync(flatPath)).toBe(true);
      expect(existsSync(join(tempDir, ".adv"))).toBe(false);
    });
  });

  describe("getReflection", () => {
    test("returns null when file does not exist", async () => {
      const result = await getReflection(tempDir, "change-1");
      expect(result).toBeNull();
    });

    test("returns null when change_id not found", async () => {
      const entry = createTestEntry("change-1");
      await appendReflection(tempDir, entry);

      const result = await getReflection(tempDir, "change-2");
      expect(result).toBeNull();
    });

    test("returns entry when change_id found", async () => {
      const entry = createTestEntry("change-1");
      const appended = await appendReflection(tempDir, entry);

      const result = await getReflection(tempDir, "change-1");
      expect(result).not.toBeNull();
      expect(result?.change_id).toBe("change-1");
      expect(result?.id).toBe(appended.id);
      expect(result?.plane2.friction_items[0].category).toBe("tool_gap");
    });

    test("falls back to legacy nested .adv path when flat override is missing", async () => {
      const fs = await import("fs/promises");
      const legacyPath = join(tempDir, ".adv", "reflections.jsonl");
      await fs.mkdir(join(tempDir, ".adv"), { recursive: true });
      await fs.writeFile(
        legacyPath,
        JSON.stringify(createTestEntry("change-legacy")) + "\n",
        "utf-8",
      );

      const result = await getReflection(
        tempDir,
        "change-legacy",
        join(tempDir, "reflections.jsonl"),
      );

      expect(result?.change_id).toBe("change-legacy");
    });
  });

  describe("listReflections", () => {
    test("returns empty array when file does not exist", async () => {
      const result = await listReflections(tempDir);
      expect(result).toEqual([]);
    });

    test("returns all entries sorted by recency", async () => {
      const entry1 = {
        ...createTestEntry("change-1"),
        created_at: "2024-01-01T00:00:00.000Z",
      };
      const entry2 = {
        ...createTestEntry("change-2"),
        created_at: "2024-01-02T00:00:00.000Z",
      };
      const entry3 = {
        ...createTestEntry("change-3"),
        created_at: "2024-01-03T00:00:00.000Z",
      };

      await appendReflection(tempDir, entry1);
      await appendReflection(tempDir, entry2);
      await appendReflection(tempDir, entry3);

      const result = await listReflections(tempDir);
      expect(result).toHaveLength(3);
      expect(result[0].change_id).toBe("change-3");
      expect(result[1].change_id).toBe("change-2");
      expect(result[2].change_id).toBe("change-1");
    });

    test("filters by change_id when provided", async () => {
      const entry1 = createTestEntry("change-1");
      const entry2 = createTestEntry("change-2");

      await appendReflection(tempDir, entry1);
      await appendReflection(tempDir, entry2);

      const result = await listReflections(tempDir, { changeId: "change-1" });
      expect(result).toHaveLength(1);
      expect(result[0].change_id).toBe("change-1");
    });

    test("flat override path wins over legacy nested .adv path", async () => {
      const fs = await import("fs/promises");
      const flatPath = join(tempDir, "reflections.jsonl");
      const legacyPath = join(tempDir, ".adv", "reflections.jsonl");
      await fs.mkdir(join(tempDir, ".adv"), { recursive: true });
      await fs.writeFile(
        flatPath,
        JSON.stringify(createTestEntry("change-flat")) + "\n",
        "utf-8",
      );
      await fs.writeFile(
        legacyPath,
        JSON.stringify(createTestEntry("change-legacy")) + "\n",
        "utf-8",
      );

      const result = await listReflections(tempDir, {
        reflectionsPath: flatPath,
      });

      expect(result.map((entry) => entry.change_id)).toEqual(["change-flat"]);
    });

    test("ignores malformed JSON lines", async () => {
      const entry = createTestEntry("change-1");
      await appendReflection(tempDir, entry);

      const path = getReflectionsPath(tempDir);
      // Append a malformed line
      const fs = await import("fs/promises");
      await fs.appendFile(path, "not-json\n", "utf-8");

      const result = await listReflections(tempDir);
      expect(result).toHaveLength(1);
    });

    test("ignores invalid entry schema lines", async () => {
      const entry = createTestEntry("change-1");
      await appendReflection(tempDir, entry);

      const path = getReflectionsPath(tempDir);
      const fs = await import("fs/promises");
      await fs.appendFile(
        path,
        JSON.stringify({ id: "bad", change_id: "x" }) + "\n",
        "utf-8",
      );

      const result = await listReflections(tempDir);
      expect(result).toHaveLength(1);
    });
  });
});
