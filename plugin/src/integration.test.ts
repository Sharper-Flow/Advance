/**
 * ADV Wisdom Lifecycle Integration Test
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { AdvancePlugin } from "./index";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
} from "./__tests__/setup";

describe("Wisdom Lifecycle Integration", () => {
  let tempDir: string;
  let hooks: any;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
  });

  afterEach(async () => {
    // Fire session.deleted to remove process listeners and prevent memory leaks
    if (hooks?.event) {
      try {
        await hooks.event({
          event: { type: "session.deleted", properties: {} },
        });
      } catch {
        // ignore cleanup errors
      }
    }
    hooks = null;
    await cleanupTempDir(tempDir);
  });

  test("full wisdom lifecycle: tool calls and hook responses", async () => {
    hooks = await AdvancePlugin({
      project: { name: "test", path: tempDir },
      directory: tempDir,
      worktree: tempDir,
      serverUrl: new URL("http://localhost"),
    } as any);

    const changeId = "add-feature-abc123";
    const taskId = "tk-task0001";
    const transformHook = hooks["experimental.chat.system.transform"]!;

    // 1. Initial state - no active change tracked yet
    const out1 = { system: [] as string[] };
    await transformHook({ sessionID: "test" } as any, out1 as any);
    expect(out1.system).toHaveLength(0);

    // 2. Start working on a task (sets active change via before hook)
    await hooks["tool.execute.before"]!(
      { tool: "adv_task_list" } as any,
      { args: { changeId } } as any,
    );

    const out2 = { system: [] as string[] };
    await transformHook({ sessionID: "test" } as any, out2 as any);
    expect(out2.system.some((s) => s.includes("[ADV:TODO_CONTINUATION]"))).toBe(
      true,
    );
    expect(out2.system.some((s) => s.includes("remaining"))).toBe(true);

    // 3. Complete a task
    const completeOutput = JSON.stringify({
      success: true,
      task: { id: taskId, title: "Initial Task", status: "done" },
    });
    await hooks["tool.execute.after"]!(
      { tool: "adv_task_update" } as any,
      { args: { taskId, status: "done" }, output: completeOutput } as any,
    );

    // 4. Hook should now inject recording prompt
    const out3 = { system: [] as string[] };
    await transformHook({ sessionID: "test" } as any, out3 as any);
    expect(out3.system.some((s) => s.includes("[ADV:RECORD_WISDOM]"))).toBe(
      true,
    );
    expect(out3.system.some((s) => s.includes("Initial Task"))).toBe(true);

    // 5. Add wisdom
    await hooks.tool!.adv_wisdom_add.execute(
      { changeId, type: "success", content: "Persistence pays off" },
      {} as any,
    );

    // 6. Hook should now inject accumulated wisdom
    const out4 = { system: [] as string[] };
    await transformHook({ sessionID: "test" } as any, out4 as any);
    expect(
      out4.system.some((s) => s.includes("[ADV:ACCUMULATED_WISDOM]")),
    ).toBe(true);
    expect(out4.system.some((s) => s.includes("Persistence pays off"))).toBe(
      true,
    );
  });
});
