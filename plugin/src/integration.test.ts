/**
 * ADV Wisdom Lifecycle Integration Test
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { AdvancePlugin } from "./index";
import { getStatus } from "./events/status";
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
      project: { id: "test", worktree: tempDir, time: { created: Date.now() } },
      directory: tempDir,
      worktree: tempDir,
      serverUrl: new URL("http://localhost"),
    } as any);

    const changeId = "addFeature";
    const taskId = "tk-task0001";
    const transformHook = hooks["experimental.chat.system.transform"]!;

    // 1. Initial state - no active change tracked yet.
    // Filter out the [ADV:DEGRADED] banner, which is injected when this
    // integration test runs against an environment without the full
    // Temporal-backed init path (createDegradedToolMap is wired but no
    // active change is tracked). The assertion is about active-change
    // tracking, not init-mode signaling.
    const out1 = { system: [] as string[] };
    await transformHook({ sessionID: "test" } as any, out1 as any);
    const out1Filtered = out1.system.filter(
      (s) => !s.includes("[ADV:DEGRADED]"),
    );
    expect(out1Filtered).toHaveLength(0);

    // 2. Start working on a task (sets active change via before hook)
    await hooks["tool.execute.before"]!(
      { tool: "adv_task_list" } as any,
      { args: { changeId } } as any,
    );

    const out2 = { system: [] as string[] };
    await transformHook({ sessionID: "test" } as any, out2 as any);
    // Dynamic injection removed for prompt caching — no TODO_CONTINUATION
    expect(out2.system.some((s) => s.includes("[ADV:TODO_CONTINUATION]"))).toBe(
      false,
    );

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

    // 6. Hook should NOT inject accumulated wisdom (removed for prompt caching)
    const out4 = { system: [] as string[] };
    await transformHook({ sessionID: "test" } as any, out4 as any);
    expect(
      out4.system.some((s) => s.includes("[ADV:ACCUMULATED_WISDOM]")),
    ).toBe(false);
  });
});

describe("Active Change Title Update on adv_change_create", () => {
  let tempDir: string;
  let hooks: any;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
  });

  afterEach(async () => {
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

  test("after adv_change_create, activeChangeId is set to the new change ID", async () => {
    hooks = await AdvancePlugin({
      project: { id: "test", worktree: tempDir, time: { created: Date.now() } },
      directory: tempDir,
      worktree: tempDir,
      serverUrl: new URL("http://localhost"),
    } as any);

    // Simulate the output of adv_change_create (banner-wrapped JSON)
    const newChangeId = "addNewFeature";
    const bannerWrappedOutput = [
      "╔══════════════════════════════════════╗",
      "║ ✨ adv_change_create                  ║",
      `║    Target: ${newChangeId}             ║`,
      "╚══════════════════════════════════════╝",
      "",
      JSON.stringify({ changeId: newChangeId, path: "/some/path/proposal.md" }),
    ].join("\n");

    // Before the after-hook fires, activeChangeId should be null
    expect(getStatus().activeChangeId).toBeNull();

    // Fire the after hook as if adv_change_create just completed
    await hooks["tool.execute.after"]!(
      { tool: "adv_change_create" } as any,
      {
        args: { summary: "Add new feature" },
        output: bannerWrappedOutput,
      } as any,
    );

    // The active change should now reflect the newly created change
    expect(getStatus().activeChangeId).toBe(newChangeId);
  });

  test("after adv_change_create with plain JSON output (no banner), activeChangeId is still set", async () => {
    hooks = await AdvancePlugin({
      project: { id: "test", worktree: tempDir, time: { created: Date.now() } },
      directory: tempDir,
      worktree: tempDir,
      serverUrl: new URL("http://localhost"),
    } as any);

    const newChangeId = "fixAuthBug";
    const plainOutput = JSON.stringify({
      changeId: newChangeId,
      path: "/some/path/proposal.md",
    });

    await hooks["tool.execute.after"]!(
      { tool: "adv_change_create" } as any,
      { args: { summary: "Fix auth bug" }, output: plainOutput } as any,
    );

    expect(getStatus().activeChangeId).toBe(newChangeId);
  });

  test("after adv_change_create with braces inside path string, activeChangeId is still set", async () => {
    hooks = await AdvancePlugin({
      project: { id: "test", worktree: tempDir, time: { created: Date.now() } },
      directory: tempDir,
      worktree: tempDir,
      serverUrl: new URL("http://localhost"),
    } as any);

    const newChangeId = "updateTabTitle";
    const bannerWrappedOutput = [
      "╔══════════════════════════════════════╗",
      "║ ✨ adv_change_create                  ║",
      `║    Target: ${newChangeId}             ║`,
      "╚══════════════════════════════════════╝",
      "",
      JSON.stringify({
        changeId: newChangeId,
        path: "/tmp/{sandbox}/proposal.md",
      }),
    ].join("\n");

    await hooks["tool.execute.after"]!(
      { tool: "adv_change_create" } as any,
      {
        args: { summary: "Update tab title" },
        output: bannerWrappedOutput,
      } as any,
    );

    expect(getStatus().activeChangeId).toBe(newChangeId);
  });

  test("switching from one change to another via adv_change_create updates the title", async () => {
    hooks = await AdvancePlugin({
      project: { id: "test", worktree: tempDir, time: { created: Date.now() } },
      directory: tempDir,
      worktree: tempDir,
      serverUrl: new URL("http://localhost"),
    } as any);

    // First, set an active change via the before hook (simulating prior work)
    await hooks["tool.execute.before"]!(
      { tool: "adv_task_list" } as any,
      { args: { changeId: "oldChange" } } as any,
    );
    expect(getStatus().activeChangeId).toBe("oldChange");

    // Now create a new change — the title should switch to the new one
    const newChangeId = "addNewFeature";
    const output = JSON.stringify({
      changeId: newChangeId,
      path: "/some/path/proposal.md",
    });

    await hooks["tool.execute.after"]!(
      { tool: "adv_change_create" } as any,
      { args: { summary: "Add new feature" }, output } as any,
    );

    expect(getStatus().activeChangeId).toBe(newChangeId);
  });

  test("malformed adv_change_create output does not clear existing active change", async () => {
    hooks = await AdvancePlugin({
      project: { id: "test", worktree: tempDir, time: { created: Date.now() } },
      directory: tempDir,
      worktree: tempDir,
      serverUrl: new URL("http://localhost"),
    } as any);

    await hooks["tool.execute.before"]!(
      { tool: "adv_task_list" } as any,
      { args: { changeId: "existingChange" } } as any,
    );
    expect(getStatus().activeChangeId).toBe("existingChange");

    await hooks["tool.execute.after"]!(
      { tool: "adv_change_create" } as any,
      { args: { summary: "Bad output" }, output: "not-json" } as any,
    );

    expect(getStatus().activeChangeId).toBe("existingChange");
  });
});

describe("Trunk Write Firewall: tool.execute.before interception", () => {
  let tempDir: string;
  let hooks: any;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
  });

  afterEach(async () => {
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

  async function initGitRepo() {
    const { execSync } = await import("child_process");
    const { mkdirSync, writeFileSync } = await import("fs");
    const { join } = await import("path");

    execSync("git init -b main", { cwd: tempDir });
    execSync("git config user.email 'test@test.com'", { cwd: tempDir });
    execSync("git config user.name 'Test'", { cwd: tempDir });
    execSync("git config init.defaultBranch main", { cwd: tempDir });
    mkdirSync(join(tempDir, "src"), { recursive: true });
    writeFileSync(join(tempDir, "README.md"), "initial");
    execSync("git add README.md", { cwd: tempDir });
    execSync("git commit -m 'initial'", { cwd: tempDir });
  }

  test("blocks write tool targeting trunk checkout on default branch", async () => {
    await initGitRepo();
    hooks = await AdvancePlugin({
      project: { id: "test", worktree: tempDir, time: { created: Date.now() } },
      directory: tempDir,
      worktree: tempDir,
      serverUrl: new URL("http://localhost"),
    } as any);

    await expect(
      hooks["tool.execute.before"]!(
        { tool: "write", sessionID: "test" } as any,
        { args: { filePath: `${tempDir}/src/file.ts` } } as any,
      ),
    ).rejects.toThrow(/Trunk write firewall/);
  });

  test("allows write tool targeting an active worktree path", async () => {
    const { execSync } = await import("child_process");
    const { mkdirSync } = await import("fs");
    const { join } = await import("path");

    await initGitRepo();
    const worktreePath = `${tempDir}-wt`;
    execSync(`git worktree add -b change/test ${worktreePath}`, { cwd: tempDir });
    mkdirSync(join(worktreePath, "src"), { recursive: true });

    hooks = await AdvancePlugin({
      project: { id: "test", worktree: tempDir, time: { created: Date.now() } },
      directory: tempDir,
      worktree: tempDir,
      serverUrl: new URL("http://localhost"),
    } as any);

    await expect(
      hooks["tool.execute.before"]!(
        { tool: "write", sessionID: "test" } as any,
        { args: { filePath: join(worktreePath, "src/file.ts") } } as any,
      ),
    ).resolves.toBeUndefined();
  }, 15_000);

  test("blocks destructive bash targeting trunk checkout", async () => {
    await initGitRepo();
    hooks = await AdvancePlugin({
      project: { id: "test", worktree: tempDir, time: { created: Date.now() } },
      directory: tempDir,
      worktree: tempDir,
      serverUrl: new URL("http://localhost"),
    } as any);

    await expect(
      hooks["tool.execute.before"]!(
        { tool: "bash", sessionID: "test" } as any,
        { args: { command: `echo hello > ${tempDir}/src/file.ts` } } as any,
      ),
    ).rejects.toThrow(/Trunk write firewall/);
  });

  test("allows all git commands without firewall classification", async () => {
    await initGitRepo();
    hooks = await AdvancePlugin({
      project: { id: "test", worktree: tempDir, time: { created: Date.now() } },
      directory: tempDir,
      worktree: tempDir,
      serverUrl: new URL("http://localhost"),
    } as any);

    await expect(
      hooks["tool.execute.before"]!(
        { tool: "bash", sessionID: "test" } as any,
        { args: { command: "git commit -m 'test' && git pull --ff-only" } } as any,
      ),
    ).resolves.toBeUndefined();
  });

  test("allows trunk writes during merge recovery", async () => {
    const { execSync } = await import("child_process");
    const { writeFileSync } = await import("fs");
    const { join } = await import("path");

    await initGitRepo();
    const headSha = execSync("git rev-parse HEAD", { cwd: tempDir })
      .toString()
      .trim();
    writeFileSync(join(tempDir, ".git", "MERGE_HEAD"), `${headSha}\n`);
    hooks = await AdvancePlugin({
      project: { id: "test", worktree: tempDir, time: { created: Date.now() } },
      directory: tempDir,
      worktree: tempDir,
      serverUrl: new URL("http://localhost"),
    } as any);

    await expect(
      hooks["tool.execute.before"]!(
        { tool: "write", sessionID: "test" } as any,
        { args: { filePath: join(tempDir, "src/file.ts") } } as any,
      ),
    ).resolves.toBeUndefined();
  });

  test("guard does not interfere with existing hook responsibilities", async () => {
    hooks = await AdvancePlugin({
      project: { id: "test", worktree: tempDir, time: { created: Date.now() } },
      directory: tempDir,
      worktree: tempDir,
      serverUrl: new URL("http://localhost"),
    } as any);

    // Change tracking should still work
    await hooks["tool.execute.before"]!(
      { tool: "adv_task_list", sessionID: "test" } as any,
      { args: { changeId: "guardTest" } } as any,
    );
    expect(getStatus().activeChangeId).toBe("guardTest");
  });
});
