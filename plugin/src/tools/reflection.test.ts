import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { reflectionTools } from "./reflection";
import type { Store } from "../storage/store";

describe("reflection tool", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "reflection-tool-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
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
