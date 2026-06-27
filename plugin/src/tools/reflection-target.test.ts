import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { Store } from "../storage/store";
import { appendReflection, type ReflectionEntry } from "../storage/reflection";

const mocks = vi.hoisted(() => ({
  targetStore: null as Store | null,
  withOptionalTargetPathStore: vi.fn(async (_input: unknown, fn: any) =>
    fn(mocks.targetStore, {
      root: "/target/project",
      projectId: "a".repeat(40),
      trusted: false,
      trustSource: "explicit",
      stateMode: "snapshot",
      warning:
        "Read-only untrusted target_path snapshot. Mutations require explicit target confirmation.",
    }),
  ),
}));

vi.mock("./target-project", () => ({
  withOptionalTargetPathStore: mocks.withOptionalTargetPathStore,
}));

import { reflectionTools } from "./reflection";

describe("reflection target_path reads", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "reflection-target-test-"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    mocks.targetStore = null;
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("reads target project reflections and returns project context", async () => {
    const reflectionsPath = join(tempDir, "target-reflections.jsonl");
    const reflection: ReflectionEntry = {
      id: "rf-target",
      change_id: "target-change",
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
        friction_items: [
          { category: "tool_gap", description: "manual read needed" },
        ],
        highlights: [],
        improvement_suggestions: [],
      },
    };
    await appendReflection(tempDir, reflection, reflectionsPath);
    mocks.targetStore = {
      paths: {
        root: tempDir,
        external: tempDir,
        reflections: reflectionsPath,
      },
    } as unknown as Store;

    const output = await reflectionTools.adv_reflection_list.execute(
      { target_path: "/target/project" },
      { paths: { root: "/source/project" } } as unknown as Store,
    );
    const parsed = JSON.parse(output);

    expect(mocks.withOptionalTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({ target_path: "/target/project" }),
      expect.any(Function),
    );
    expect(parsed.entries).toEqual([
      expect.objectContaining({ id: "rf-target", change_id: "target-change" }),
    ]);
    expect(parsed._projectContext).toMatchObject({
      root: "/target/project",
      trusted: false,
      warning: expect.stringContaining("Read-only untrusted target_path"),
    });
  });
});
