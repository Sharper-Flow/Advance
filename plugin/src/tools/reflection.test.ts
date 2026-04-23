/**
 * Reflection Tool Tests
 *
 * TDD tests for adv_reflect — produces structured two-plane reflection reports.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { reflectionTools } from "./reflection";
import { createStore, type Store } from "../storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  parseToolOutput,
} from "../__tests__/setup";
import { getReflectionsPath } from "../storage/reflection";
import { addProjectWisdom } from "../storage/project-wisdom";

// Archived change fixture with completed tasks and wisdom
const ARCHIVED_CHANGE = {
  $schema: "https://advance.dev/schemas/change.v1.json",
  id: "archivedChange",
  title: "Archived Feature",
  status: "archived",
  created_at: "2026-01-21T00:00:00Z",
  created_by: "test-user",
  tasks: [
    {
      id: "tk-task0001",
      title: "Implement core logic",
      section: "Core",
      status: "done",
      priority: 0,
      deps: [],
      created_at: "2026-01-21T00:00:00Z",
      started_at: "2026-01-21T01:00:00Z",
      completed_at: "2026-01-21T02:00:00Z",
      tdd_phase: "complete",
      tdd_evidence: { red: { exit_code: 1 }, green: { exit_code: 0 } },
    },
    {
      id: "tk-task0002",
      title: "Write tests",
      section: "Testing",
      status: "done",
      priority: 1,
      deps: [{ type: "blocked_by", target: "tk-task0001" }],
      created_at: "2026-01-21T00:00:00Z",
      started_at: "2026-01-21T02:00:00Z",
      completed_at: "2026-01-21T03:00:00Z",
      tdd_phase: "complete",
    },
    {
      id: "tk-task0003",
      title: "Update documentation",
      section: "Docs",
      status: "done",
      priority: 2,
      deps: [{ type: "blocked_by", target: "tk-task0002" }],
      created_at: "2026-01-21T00:00:00Z",
      completed_at: "2026-01-21T04:00:00Z",
    },
  ],
  gates: {
    proposal: { status: "done", completed_at: "2026-01-21T00:30:00Z" },
    discovery: { status: "done", completed_at: "2026-01-21T01:00:00Z" },
    design: { status: "done", completed_at: "2026-01-21T01:30:00Z" },
    planning: { status: "done", completed_at: "2026-01-21T02:00:00Z" },
    execution: { status: "done", completed_at: "2026-01-21T04:00:00Z" },
    acceptance: { status: "done", completed_at: "2026-01-21T04:30:00Z" },
    release: { status: "done", completed_at: "2026-01-21T05:00:00Z" },
  },
  wisdom: [
    {
      id: "ws-test001",
      type: "pattern",
      content: "Use JSONL for append-only storage",
      source_task: "tk-task0001",
      recorded_at: "2026-01-21T02:00:00Z",
    },
    {
      id: "ws-test002",
      type: "gotcha",
      content: "Zod v4 record keys behave differently",
      source_task: "tk-task0002",
      recorded_at: "2026-01-21T03:00:00Z",
    },
  ],
  deltas: {},
};

describe("Reflection Tools", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createStore(tempDir);

    // Write archived change fixture
    const fs = await import("fs/promises");
    await fs.mkdir(`${tempDir}/.adv/changes/archivedChange`, { recursive: true });
    await fs.writeFile(
      `${tempDir}/.adv/changes/archivedChange/change.json`,
      JSON.stringify(ARCHIVED_CHANGE, null, 2),
    );
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
  });

  describe("adv_reflect", () => {
    test("happy path: produces reflection report for archived change", async () => {
      const result = await reflectionTools.adv_reflect.execute(
        { changeId: "archivedChange" },
        store,
      );
      const parsed = parseToolOutput<{
        reflection: {
          id: string;
          change_id: string;
          plane1: {
            efficiency: {
              task_count: number;
              tasks_done: number;
              threshold_tier: string;
            };
            quality: { tdd_compliance: number };
            process: { gate_completion_rate: number };
            wisdom: { entries_captured: number };
          };
          plane2: {
            friction_items: Array<{ category: string; description: string }>;
            highlights: string[];
          };
        };
      }>(result);

      expect(parsed.reflection.change_id).toBe("archivedChange");
      expect(parsed.reflection.plane1.efficiency.task_count).toBe(3);
      expect(parsed.reflection.plane1.efficiency.tasks_done).toBe(3);
      expect(parsed.reflection.plane1.quality.tdd_compliance).toBeGreaterThan(0);
      expect(parsed.reflection.plane1.process.gate_completion_rate).toBe(1);
      expect(parsed.reflection.plane1.wisdom.entries_captured).toBe(2);
      expect(parsed.reflection.plane2.friction_items).toBeInstanceOf(Array);
      expect(parsed.reflection.plane2.highlights.length).toBeGreaterThan(0);
    });

    test("persists reflection to reflections.jsonl", async () => {
      await reflectionTools.adv_reflect.execute(
        { changeId: "archivedChange" },
        store,
      );

      const path = getReflectionsPath(tempDir);
      const content = readFileSync(path, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0]);
      expect(parsed.change_id).toBe("archivedChange");
      expect(parsed.plane1.efficiency.task_count).toBe(3);
    });

    test("returns error for non-existent change", async () => {
      const result = await reflectionTools.adv_reflect.execute(
        { changeId: "doesNotExist" },
        store,
      );
      expect(result).toContain("error");
      expect(result).toContain("not found");
    });

    test("returns error for non-archived change", async () => {
      // SAMPLE_CHANGE is active, not archived
      const result = await reflectionTools.adv_reflect.execute(
        { changeId: "addFeature" },
        store,
      );
      expect(result).toContain("error");
      expect(result).toContain("archived");
    });

    test("Plane 1 efficiency includes per-gate durations", async () => {
      const result = await reflectionTools.adv_reflect.execute(
        { changeId: "archivedChange" },
        store,
      );
      const parsed = parseToolOutput<{
        reflection: {
          plane1: {
            efficiency: {
              per_gate_ms: Record<string, number>;
            };
          };
        };
      }>(result);

      expect(Object.keys(parsed.reflection.plane1.efficiency.per_gate_ms)).toContain("proposal");
    });

    test("Plane 2 includes friction from wisdom patterns/gotchas", async () => {
      const result = await reflectionTools.adv_reflect.execute(
        { changeId: "archivedChange" },
        store,
      );
      const parsed = parseToolOutput<{
        reflection: {
          plane2: {
            friction_items: Array<{
              category: string;
              description: string;
            }>;
          };
        };
      }>(result);

      // Friction items are generated from wisdom + error_recovery
      // The exact count depends on the heuristic
      expect(parsed.reflection.plane2.friction_items).toBeInstanceOf(Array);
    });

    test("writes REFLECTION.md to archive dir when it exists", async () => {
      const fs = await import("fs/promises");
      const archiveDir = join(tempDir, ".adv", "archive", "2026-01-21-archivedChange");
      await fs.mkdir(archiveDir, { recursive: true });

      await reflectionTools.adv_reflect.execute(
        { changeId: "archivedChange" },
        store,
      );

      const mdPath = join(archiveDir, "REFLECTION.md");
      const mdContent = readFileSync(mdPath, "utf-8");
      expect(mdContent).toContain("# Reflection: archivedChange");
      expect(mdContent).toContain("## Plane 1: Project Execution");
      expect(mdContent).toContain("## Plane 2: System Friction");
    });

    test("sanitizes secrets in friction items", async () => {
      const fs = await import("fs/promises");
      const changeWithSecrets = {
        ...ARCHIVED_CHANGE,
        wisdom: [
          {
            id: "ws-secret001",
            type: "gotcha",
            content: "API key is abc123secret and bearer token xyz789",
            recorded_at: "2026-01-21T02:00:00Z",
          },
        ],
      };
      await fs.writeFile(
        `${tempDir}/.adv/changes/archivedChange/change.json`,
        JSON.stringify(changeWithSecrets, null, 2),
      );

      const result = await reflectionTools.adv_reflect.execute(
        { changeId: "archivedChange" },
        store,
      );
      const parsed = parseToolOutput<{
        reflection: {
          plane2: {
            friction_items: Array<{ description: string }>;
          };
        };
      }>(result);

      const desc = parsed.reflection.plane2.friction_items[0]?.description ?? "";
      expect(desc).toContain("[REDACTED]");
      expect(desc).not.toContain("abc123secret");
      expect(desc).not.toContain("xyz789");
    });

    test("detects provider-specific friction from wisdom", async () => {
      const fs = await import("fs/promises");
      const changeWithProvider = {
        ...ARCHIVED_CHANGE,
        wisdom: [
          {
            id: "ws-provider001",
            type: "gotcha",
            content: "Bun runtime behaves differently for fs promises",
            recorded_at: "2026-01-21T02:00:00Z",
          },
        ],
      };
      await fs.writeFile(
        `${tempDir}/.adv/changes/archivedChange/change.json`,
        JSON.stringify(changeWithProvider, null, 2),
      );

      const result = await reflectionTools.adv_reflect.execute(
        { changeId: "archivedChange" },
        store,
      );
      const parsed = parseToolOutput<{
        reflection: {
          plane2: {
            friction_items: Array<{
              category: string;
              provider_specific?: { provider: string };
            }>;
          };
        };
      }>(result);

      const item = parsed.reflection.plane2.friction_items.find(
        (f) => f.category === "docs_gap",
      );
      expect(item).toBeDefined();
      expect(item?.provider_specific?.provider).toBe("Bun");
    });

    test("computes wisdom_reuse_hits from project wisdom", async () => {
      // Add project wisdom that overlaps with change/task keywords
      await addProjectWisdom(tempDir, {
        type: "pattern",
        content: "Implement core logic using JSONL append-only storage",
      });

      const result = await reflectionTools.adv_reflect.execute(
        { changeId: "archivedChange" },
        store,
      );
      const parsed = parseToolOutput<{
        reflection: {
          plane1: {
            wisdom: { wisdom_reuse_hits: number };
          };
        };
      }>(result);

      expect(parsed.reflection.plane1.wisdom.wisdom_reuse_hits).toBeGreaterThanOrEqual(1);
    });
  });
});
