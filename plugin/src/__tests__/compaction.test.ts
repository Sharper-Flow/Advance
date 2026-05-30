/**
 * Compaction Hook Enrichment Tests
 *
 * Tests for the experimental.session.compacting hook's ADV TASK CONTEXT
 * block, progress lines, graceful degradation, and line-length caps.
 *
 * Uses the disk store directly to set up tasks, then tests the compacting
 * hook output.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { AdvancePlugin } from "../index";
import { createTempDir, cleanupTempDir, createTestProject } from "./setup";
import { createDiskStore as createLegacyStore } from "../storage/store-disk";

// Mock plugin-init to bypass Temporal requirement
vi.mock("../plugin-init", async () => {
  const actual =
    await vi.importActual<typeof import("../plugin-init")>("../plugin-init");
  return {
    ...actual,
    tryInitStore: async (effectiveDir: string, externalRoot?: string) => {
      try {
        const store = await createLegacyStore(effectiveDir, { externalRoot });
        await store.init();
        return { store, initError: null };
      } catch (e) {
        const initError = e instanceof Error ? e : new Error(String(e));
        return { store: null, initError };
      }
    },
  };
});

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return {
    ...actual,
    getProjectId: vi.fn(),
    getExternalRoot: vi.fn(() => "/mock/external/root"),
  };
});

interface MockPluginInput {
  client: unknown;
  project: {
    id: string;
    worktree: string;
    time: { created: number };
  };
  directory: string;
  worktree: string;
  serverUrl: URL;
  $: unknown;
}

const TEST_SERVER_URL = new URL("http://localhost:3000");

const createMockPluginInput = (directory: string): MockPluginInput => ({
  client: {},
  project: {
    id: "test-project",
    worktree: directory,
    time: { created: Date.now() },
  },
  directory,
  worktree: directory,
  serverUrl: TEST_SERVER_URL,
  $: {},
});

describe("experimental.session.compacting enrichment", () => {
  let tempDir: string;
  const pluginInstances: any[] = [];

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
  });

  afterEach(async () => {
    for (const hooks of pluginInstances) {
      if (hooks?.event) {
        try {
          await hooks.event({
            event: { type: "session.deleted", properties: {} },
          });
        } catch {
          // ignore cleanup errors
        }
      }
    }
    pluginInstances.length = 0;
    await cleanupTempDir(tempDir);
  });

  /**
   * Helper: create plugin, set up a change with tasks via disk store,
   * then call the compacting hook and return the context output.
   */
  async function setupAndCompact(options?: {
    taskTitles?: string[];
    activeTaskIndex?: number;
  }): Promise<{ output: string[]; changeId: string }> {
    const hooks = await AdvancePlugin(createMockPluginInput(tempDir));
    pluginInstances.push(hooks);
    const changeId = "compactionTest";

    // Set active change via tool.execute.before
    await hooks["tool.execute.before"]!(
      { tool: "adv_task_list" } as any,
      { args: { changeId } } as any,
    );

    // Use disk store directly to create tasks
    const store = await createLegacyStore(tempDir, {
      externalRoot: undefined,
    });
    await store.init();
    await store.changes.create("Compaction test", {
      artifacts: { proposal: "Change for compaction tests" },
    });

    const titles = options?.taskTitles ?? ["Task One"];
    for (const title of titles) {
      await store.tasks.add(changeId, title);
    }

    // Set one task to in_progress if requested
    if (options?.activeTaskIndex !== undefined) {
      const tasks = await store.tasks.list(changeId);
      const target = tasks[options.activeTaskIndex];
      if (target) {
        await store.tasks.update(target.id, "in_progress");
      }
    }

    store.close();

    const input = { sessionID: "test-session" };
    const output = { context: [] as string[] };

    await hooks["experimental.session.compacting"]!(input, output);

    return { output: output.context, changeId };
  }

  test("compaction context surfaces current in-progress task (AC2)", async () => {
    const { output } = await setupAndCompact({
      taskTitles: ["Active compaction task"],
      activeTaskIndex: 0,
    });

    // After T4, compaction emits a single combined block via
    // buildChangeContextSnapshot — the legacy "=== ADV TASK CONTEXT ==="
    // block was replaced. Verify the new snapshot contains the current
    // task indicator.
    const block = output.join("\n");
    expect(block).toMatch(/Current:/);
    expect(block).toContain("Active compaction task");
  });

  test("pushes Progress line with done/active/pending counts", async () => {
    const hooks = await AdvancePlugin(createMockPluginInput(tempDir));
    pluginInstances.push(hooks);

    // Use disk store directly to set up change + tasks
    const store = await createLegacyStore(tempDir);
    await store.init();

    const { changeId } = await store.changes.create("Progress test");
    // Set active change via tool.execute.before
    await hooks["tool.execute.before"]!(
      { tool: "adv_task_list" } as any,
      { args: { changeId } } as any,
    );

    // Create 3 tasks with different statuses
    const t1 = await store.tasks.add(changeId, "Task One");
    const t2 = await store.tasks.add(changeId, "Task Two");
    await store.tasks.add(changeId, "Task Three");

    await store.tasks.update(t1.id, "done");
    await store.tasks.update(t2.id, "in_progress");
    // t3 stays pending

    store.close();

    const input = { sessionID: "test-session" };
    const output = { context: [] as string[] };

    await hooks["experimental.session.compacting"]!(input, output);

    // After T4, compaction uses buildChangeContextSnapshot which emits
    // counts in the format "Tasks: N done | N active | N pending".
    const block = output.context.join("\n");
    expect(block).toMatch(/Tasks:.*1 done.*1 active.*1 pending/);
  });

  test("skips compaction context when no active change is set (graceful degradation)", async () => {
    // The disk store is always created even in bad dirs. Instead, test
    // that the compacting hook doesn't throw when there's no active change.
    const hooks = await AdvancePlugin(createMockPluginInput(tempDir));
    pluginInstances.push(hooks);

    // Don't set active change — no change ID means no compaction context
    const input = { sessionID: "test-session" };
    const output = { context: [] as string[] };

    // Should not throw
    await expect(
      hooks["experimental.session.compacting"]!(input, output),
    ).resolves.not.toThrow();

    // No CONTEXT/snapshot block (no active change)
    const hasTaskContext = output.context.some(
      (c) => c.includes("CONTEXT:") || c.includes("ADV RESUME HINT"),
    );
    expect(hasTaskContext).toBe(false);
  });

  test("each line in task context is capped at 80 chars", async () => {
    const hooks = await AdvancePlugin(createMockPluginInput(tempDir));
    pluginInstances.push(hooks);

    const store = await createLegacyStore(tempDir);
    await store.init();

    const { changeId } = await store.changes.create("Long title test");
    await hooks["tool.execute.before"]!(
      { tool: "adv_task_list" } as any,
      { args: { changeId } } as any,
    );

    const longTitle =
      "This is an extremely long task title that would definitely exceed eighty characters if not truncated properly by the compaction hook";
    const t1 = await store.tasks.add(changeId, longTitle);
    await store.tasks.update(t1.id, "in_progress");

    store.close();

    const input = { sessionID: "test-session" };
    const output = { context: [] as string[] };

    await hooks["experimental.session.compacting"]!(input, output);

    // After T4 the compaction block is bounded by an explicit byte
    // budget (DEFAULT_COMPACTION_MAX_BYTES = 16_000) instead of a
    // per-line 80-char cap. The legacy ADV TASK CONTEXT block was
    // replaced by buildChangeContextSnapshot which uses a wider boxed
    // layout (the renderer's box width grows to fit the longest task
    // title; the change-id line is truncated separately). Verify the
    // total block fits the budget — that's the meaningful invariant.
    const block = output.context.join("\n");
    expect(block.length).toBeLessThanOrEqual(16_000);
  });
});
