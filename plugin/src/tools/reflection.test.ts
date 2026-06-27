import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { reflectionTools } from "./reflection";
import type { Store } from "../storage/store";
import { appendReflection, type ReflectionEntry } from "../storage/reflection";

describe("reflection tool", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "reflection-tool-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const makeReflection = (
    overrides: Partial<ReflectionEntry>,
  ): ReflectionEntry => ({
    id: "rf-fixture",
    change_id: "change-fixture",
    created_at: "2026-01-01T00:00:00.000Z",
    plane1: {
      efficiency: {
        task_count: 1,
        tasks_done: 1,
        tasks_cancelled: 0,
        retry_total: 0,
        retry_density: 0,
        elapsed_ms: 1000,
        per_gate_ms: {},
      },
      quality: { tdd_compliance: 1 },
      process: {
        gate_completion_rate: 1,
        tdd_intent_distribution: { inline: 1 },
        delegation_count: 0,
        drift_triggers: 0,
      },
      wisdom: {
        entries_captured: 0,
        entries_promoted: 0,
        wisdom_reuse_hits: 0,
      },
    },
    plane2: {
      friction_items: [],
      highlights: [],
      improvement_suggestions: [],
    },
    ...overrides,
  });

  test("lists bounded reflection summaries with category and suggestion counts", async () => {
    const reflectionsPath = join(tempDir, "reflections.jsonl");
    await appendReflection(
      tempDir,
      makeReflection({
        id: "rf-old",
        change_id: "old-change",
        created_at: "2026-01-01T00:00:00.000Z",
        plane2: {
          friction_items: [
            { category: "tool_gap", description: "manual retry needed" },
          ],
          highlights: ["Old highlight"],
          improvement_suggestions: ["Add a reader"],
        },
      }),
      reflectionsPath,
    );
    await appendReflection(
      tempDir,
      makeReflection({
        id: "rf-new",
        change_id: "new-change",
        created_at: "2026-01-02T00:00:00.000Z",
        plane2: {
          friction_items: [
            { category: "docs_gap", description: "missing usage docs" },
            { category: "tool_gap", description: "manual sampling needed" },
          ],
          highlights: ["New highlight"],
          improvement_suggestions: ["Add a reader", "Document it"],
        },
      }),
      reflectionsPath,
    );

    const store = {
      paths: { root: tempDir, external: tempDir, reflections: reflectionsPath },
    } as unknown as Store;

    const output = await reflectionTools.adv_reflection_list.execute(
      { maxEntries: 1 },
      store,
    );
    const parsed = JSON.parse(output);

    expect(parsed.total).toBe(2);
    expect(parsed.count).toBe(1);
    expect(parsed.omitted).toBe(1);
    expect(parsed.entries[0]).toMatchObject({
      id: "rf-new",
      change_id: "new-change",
      friction_items: [
        expect.objectContaining({ category: "docs_gap" }),
        expect.objectContaining({ category: "tool_gap" }),
      ],
    });
    expect(parsed.byFrictionCategory).toEqual({ docs_gap: 1, tool_gap: 2 });
    expect(parsed.bySuggestion).toMatchObject({
      "Add a reader": 2,
      "Document it": 1,
    });
  });

  test("reflection list returns explicit empty state for missing file", async () => {
    const store = {
      paths: {
        root: tempDir,
        external: tempDir,
        reflections: join(tempDir, "missing-reflections.jsonl"),
      },
    } as unknown as Store;

    const output = await reflectionTools.adv_reflection_list.execute({}, store);
    const parsed = JSON.parse(output);

    expect(parsed).toMatchObject({
      entries: [],
      count: 0,
      total: 0,
      omitted: 0,
      byFrictionCategory: {},
      bySuggestion: {},
    });
  });

  test("persists task-derived work-time metrics in plane1 efficiency", async () => {
    const change = {
      id: "timed-reflection-change",
      title: "Timed reflection change",
      status: "archived",
      created_at: "2026-01-01T00:00:00.000Z",
      gates: {
        proposal: {
          status: "done",
          completed_at: "2026-01-01T00:10:00.000Z",
        },
        discovery: {
          status: "done",
          completed_at: "2026-01-01T00:20:00.000Z",
        },
      },
      tasks: [
        {
          id: "tk-one",
          title: "First task",
          status: "done",
          started_at: "2026-01-01T00:02:00.000Z",
          completed_at: "2026-01-01T00:08:00.000Z",
          metadata: { tdd_intent: "inline" },
        },
        {
          id: "tk-two",
          title: "Second task",
          status: "cancelled",
          started_at: "2026-01-01T00:12:00.000Z",
          completed_at: "2026-01-01T00:18:00.000Z",
          metadata: { tdd_intent: "inline" },
          cancellation: { reason: "not needed" },
        },
      ],
      wisdom: [],
    };

    const store = {
      paths: {
        root: tempDir,
        external: tempDir,
        archive: join(tempDir, "archive"),
        reflections: join(tempDir, "reflections.jsonl"),
      },
      changes: {
        get: async () => ({ success: true, data: change }),
      },
    } as unknown as Store;

    const output = await reflectionTools.adv_reflect.execute(
      { changeId: change.id },
      store,
    );
    const parsed = JSON.parse(output);
    const efficiency = parsed.reflection.plane1.efficiency;

    expect(efficiency.per_gate_work_ms).toEqual({
      proposal: 6 * 60 * 1000,
      discovery: 6 * 60 * 1000,
    });
    expect(efficiency.active_work_ms).toBe(12 * 60 * 1000);
  });

  test("uses category-specific improvement suggestions with fallback for unknown categories", async () => {
    const change = {
      id: "suggestion-reflection-change",
      title: "Suggestion reflection change",
      status: "archived",
      created_at: "2026-01-01T00:00:00.000Z",
      gates: {},
      tasks: [
        {
          id: "tk-retry",
          title: "Retrying task",
          status: "done",
          metadata: { tdd_intent: "inline" },
          error_recovery: {
            attempts: [
              {
                outcome: "failed",
                fix_tried: "tool timeout required manual retry",
              },
            ],
          },
        },
        {
          id: "tk-cancel",
          title: "Cancelled task",
          status: "cancelled",
          metadata: { tdd_intent: "inline" },
          cancellation: { reason: "confusing user flow" },
        },
      ],
      wisdom: [
        {
          id: "w-docs",
          type: "gotcha",
          content: "Missing docs for release handoff",
        },
        {
          id: "w-pattern",
          type: "pattern",
          content: "Repeated manual evidence collection",
        },
      ],
    };

    const store = {
      paths: {
        root: tempDir,
        external: tempDir,
        archive: join(tempDir, "archive"),
        reflections: join(tempDir, "reflections.jsonl"),
      },
      changes: {
        get: async () => ({ success: true, data: change }),
      },
    } as unknown as Store;

    const output = await reflectionTools.adv_reflect.execute(
      { changeId: change.id },
      store,
    );
    const parsed = JSON.parse(output);
    const suggestions = parsed.reflection.plane2.improvement_suggestions;

    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Tooling"),
        expect.stringContaining("Documentation"),
        expect.stringContaining("capability"),
        expect.stringContaining("UX"),
      ]),
    );
    expect(suggestions).not.toContain(
      "4 friction items identified — review for process/tool improvements",
    );
  });

  test("tags linked-product reflections with origin repo metadata", async () => {
    const change = {
      id: "product-reflection-change",
      title: "Product reflection change",
      status: "archived",
      created_at: "2026-01-01T00:00:00.000Z",
      gates: {},
      tasks: [],
      wisdom: [],
    };

    const store = {
      paths: {
        root: tempDir,
        external: tempDir,
        archive: join(tempDir, "archive"),
        reflections: join(tempDir, "reflections.jsonl"),
      },
      changes: {
        get: async () => ({ success: true, data: change }),
      },
      productContext: {
        currentRoot: "/repo/web",
        currentRepoId: "web",
        repoProjectId: "w".repeat(40),
        productId: "example-product",
        productProjectId: "b".repeat(40),
        primaryRoot: "/repo/backend",
        primaryRepoId: "backend",
        repos: {
          web: { id: "web", root: "/repo/web", repoProjectId: "w".repeat(40) },
          backend: {
            id: "backend",
            root: "/repo/backend",
            repoProjectId: "b".repeat(40),
          },
        },
        mode: "secondary",
        missingPrimaryPolicy: "block",
      },
    } as unknown as Store;

    const output = await reflectionTools.adv_reflect.execute(
      { changeId: change.id },
      store,
    );
    const parsed = JSON.parse(output);

    expect(parsed.reflection).toMatchObject({
      product_id: "example-product",
      origin_repo_id: "web",
      origin_repo_project_id: "w".repeat(40),
      origin_repo_path: "/repo/web",
    });
  });
});
