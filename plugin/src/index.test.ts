/**
 * Advance Plugin SDK Integration Tests
 *
 * TDD tests for the plugin's SDK compliance.
 * These tests verify the plugin correctly implements the @opencode-ai/plugin interface.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  AdvancePlugin,
  extractCompletedTask,
  extractCreatedChangeId,
  isLongRunningTool,
} from "./index";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  parseToolOutput,
} from "./__tests__/setup";
import { addProjectWisdom } from "./storage/project-wisdom";
import { ADV_TOOL_NAMES } from "./tool-registry";

// =============================================================================
// Mock Plugin Input
// =============================================================================

// Using inline types to avoid SDK import issues during testing
interface MockPluginInput {
  client: unknown;
  project: {
    id: string;
    worktree: string;
    vcsDir?: string;
    vcs?: "git";
    time: { created: number };
  };
  directory: string;
  worktree: string;
  serverUrl: URL;
  $: unknown;
}

interface MockToolContext {
  sessionID: string;
  messageID: string;
  agent: string;
  abort: AbortSignal;
  metadata: () => void;
  ask: () => Promise<void>;
}

interface MockEvent {
  type: string;
  properties: Record<string, unknown>;
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

/**
 * Create plugin hooks and track them for cleanup.
 * Each test should use this instead of calling AdvancePlugin directly
 * to ensure process listeners are removed in afterEach.
 */
const createTrackedPlugin = async (
  directory: string,
  tracker: Awaited<ReturnType<typeof AdvancePlugin>>[],
): Promise<Awaited<ReturnType<typeof AdvancePlugin>>> => {
  const input = createMockPluginInput(directory);
  const hooks = await AdvancePlugin(input);
  tracker.push(hooks);
  return hooks;
};

// Mock ToolContext for execute calls
const createMockToolContext = (): MockToolContext => ({
  sessionID: "test-session",
  messageID: "test-message",
  agent: "test-agent",
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {},
});

// =============================================================================
// Tests
// =============================================================================

describe("Advance Plugin SDK Integration", () => {
  let tempDir: string;
  // Track plugin hooks for cleanup to prevent listener leaks
  const pluginInstances: any[] = [];

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
  });

  afterEach(async () => {
    // Fire session.deleted on all plugin instances to remove process listeners
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

  // ===========================================================================
  // Plugin Export Tests
  // ===========================================================================

  describe("Plugin Export", () => {
    test("exports AdvancePlugin as named export", () => {
      expect(AdvancePlugin).toBeDefined();
      expect(typeof AdvancePlugin).toBe("function");
    });

    test("AdvancePlugin is async function", () => {
      expect(AdvancePlugin.constructor.name).toBe("AsyncFunction");
    });

    test("extractCreatedChangeId reads banner-wrapped tool output", () => {
      const output = [
        "╔══════════════════════════════════╗",
        "║ ✨ adv_change_create              ║",
        "║    Target: addFeature            ║",
        "╚══════════════════════════════════╝",
        "",
        '{"changeId":"addFeature"}',
      ].join("\n");

      expect(extractCreatedChangeId(output)).toBe("addFeature");
    });

    test("isLongRunningTool matches tracked tools only", () => {
      expect(isLongRunningTool("adv_run_test")).toBe(true);
      expect(isLongRunningTool("adv_task_evidence")).toBe(true);
      expect(isLongRunningTool("adv_change_show")).toBe(false);
    });

    test("extractCompletedTask returns completed task payload only for done status", () => {
      expect(
        extractCompletedTask(
          JSON.stringify({
            success: true,
            task: { id: "tk-1", title: "Ship fix", status: "done" },
          }),
        ),
      ).toEqual({ id: "tk-1", title: "Ship fix" });

      expect(
        extractCompletedTask(
          JSON.stringify({
            success: true,
            task: { id: "tk-2", title: "In progress", status: "in_progress" },
          }),
        ),
      ).toBeNull();
    });
  });

  // ===========================================================================
  // Hooks Structure Tests
  // ===========================================================================

  describe("Hooks Structure", () => {
    test("returns Hooks object with tool key", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      expect(hooks).toHaveProperty("tool");
      expect(typeof hooks.tool).toBe("object");
      expect(hooks.tool).not.toBeNull();
    });

    test("returns Hooks object with event function", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      expect(hooks).toHaveProperty("event");
      expect(typeof hooks.event).toBe("function");
    });

    test("returns Hooks with tool.execute.before hook", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      expect(hooks["tool.execute.before"]).toBeDefined();
      expect(typeof hooks["tool.execute.before"]).toBe("function");
    });

    test("returns Hooks with tool.execute.after hook", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      expect(hooks["tool.execute.after"]).toBeDefined();
      expect(typeof hooks["tool.execute.after"]).toBe("function");
    });

    test("returns Hooks with experimental.session.compacting hook", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      expect(hooks["experimental.session.compacting"]).toBeDefined();
      expect(typeof hooks["experimental.session.compacting"]).toBe("function");
    });
  });

  // ===========================================================================
  // Tool Registration Tests
  // ===========================================================================

  describe("Tool Registration", () => {
    test("registers every tool in ADV_TOOL_NAMES", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      const toolNames = Object.keys(hooks.tool!);
      expect(toolNames).toHaveLength(ADV_TOOL_NAMES.length);
    });

    test("registers spec tools", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      const toolNames = Object.keys(hooks.tool!);
      expect(toolNames).toContain("adv_spec");
    });

    test("registers change tools", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      const toolNames = Object.keys(hooks.tool!);
      expect(toolNames).toContain("adv_change_list");
      expect(toolNames).toContain("adv_change_show");
      expect(toolNames).not.toContain("adv_change_summary");
      expect(toolNames).toContain("adv_change_create");
      expect(toolNames).toContain("adv_change_update");
      expect(toolNames).toContain("adv_change_close");
      expect(toolNames).toContain("adv_change_validate");
      expect(toolNames).toContain("adv_change_archive");
      expect(toolNames).toContain("adv_change_update_issues");
      expect(toolNames).not.toContain("adv_change_add_issue");
      expect(toolNames).not.toContain("adv_change_remove_issue");
    });

    test("registers task tools", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      const toolNames = Object.keys(hooks.tool!);
      expect(toolNames).toContain("adv_task_list");
      expect(toolNames).toContain("adv_task_ready");
      expect(toolNames).toContain("adv_task_update");
      expect(toolNames).toContain("adv_task_add");
      expect(toolNames).toContain("adv_task_evidence");
      expect(toolNames).toContain("adv_task_tdd");
      expect(toolNames).not.toContain("adv_task_tdd_phase");
      expect(toolNames).not.toContain("adv_task_skip_tdd");
      expect(toolNames).not.toContain("adv_task_tdd_status");
      expect(toolNames).toContain("adv_task_cancel");
      expect(toolNames).toContain("adv_task_reclassify_tdd");
    });

    test("registers wisdom tools", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      const toolNames = Object.keys(hooks.tool!);
      expect(toolNames).toContain("adv_wisdom_add");
      expect(toolNames).toContain("adv_wisdom_list");
      expect(toolNames).not.toContain("adv_wisdom_promote");
    });

    test("registers agenda tools", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      const toolNames = Object.keys(hooks.tool!);
      expect(toolNames).toContain("adv_agenda_list");
      expect(toolNames).toContain("adv_agenda_add");
      expect(toolNames).toContain("adv_agenda_start");
      expect(toolNames).toContain("adv_agenda_complete");
      expect(toolNames).toContain("adv_agenda_cancel");
      expect(toolNames).toContain("adv_agenda_prioritize");
      expect(toolNames).not.toContain("adv_agenda_next");
      expect(toolNames).not.toContain("adv_agenda_stats");
      expect(toolNames).toContain("adv_agenda_evidence");
      expect(toolNames).not.toContain("adv_agenda_compact");
    });

    test("registers status and project tools", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      const toolNames = Object.keys(hooks.tool!);
      expect(toolNames).toContain("adv_status");
      expect(toolNames).toContain("adv_project_context");
    });
  });

  // ===========================================================================
  // Tool Definition Tests
  // ===========================================================================

  describe("Tool Definition Structure", () => {
    test("each tool has description, args, execute", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      for (const [_name, toolDef] of Object.entries(hooks.tool!)) {
        expect(toolDef).toHaveProperty("description", expect.any(String));
        expect(toolDef).toHaveProperty("args");
        expect(toolDef).toHaveProperty("execute");
        expect(typeof toolDef.execute).toBe("function");
      }
    });

    test("adv_task_add exposes metadata in its registered args", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      expect((hooks.tool!.adv_task_add as any).args).toHaveProperty("metadata");
    });

    test("tool descriptions are non-empty strings", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      for (const [_name, toolDef] of Object.entries(hooks.tool!)) {
        expect(toolDef.description.length).toBeGreaterThan(10);
      }
    });
  });

  // ===========================================================================
  // Tool Execution Tests
  // ===========================================================================

  describe("Tool Execution", () => {
    test("adv_spec executes list action and returns JSON", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);
      const context = createMockToolContext();

      const result = await hooks.tool!.adv_spec.execute(
        { action: "list" },
        context,
      );

      expect(typeof result).toBe("string");
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("specs");
      expect(Array.isArray(parsed.specs)).toBe(true);
    });

    test("adv_status executes and returns project status", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);
      const context = createMockToolContext();

      const result = await hooks.tool!.adv_status.execute({}, context);

      expect(typeof result).toBe("string");
      const parsed = parseToolOutput(result);
      expect(parsed).toHaveProperty("specs");
      expect(parsed).toHaveProperty("changes");
    });

    test("adv_status warns when running without external state (legacy mode)", async () => {
      // createTestProject does NOT run git init, so the temp dir has no
      // project ID and the plugin falls back to legacy in-repo paths.
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);
      const context = createMockToolContext();

      const result = await hooks.tool!.adv_status.execute({}, context);

      const parsed = parseToolOutput(result);
      expect(parsed).toHaveProperty("recommendations");
      expect(
        (parsed as any).recommendations.some(
          (r: string) =>
            r.includes("Running without external state") &&
            r.includes("Worktree sharing"),
        ),
      ).toBe(true);
    });

    test("adv_change_create creates a new change", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);
      const context = createMockToolContext();

      const result = await hooks.tool!.adv_change_create.execute(
        { summary: "Test change" },
        context,
      );

      expect(typeof result).toBe("string");
      const parsed = parseToolOutput(result);
      expect(parsed).toHaveProperty("changeId");
    });
  });

  // ===========================================================================
  // Event Hook Tests
  // ===========================================================================

  describe("Event Hooks", () => {
    test("event hook handles session.status without error", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      // Should complete without throwing
      await hooks.event!({
        event: {
          type: "session.status",
          properties: { status: { type: "busy" } },
        } as MockEvent as any,
      });
    });

    test("event hook handles unknown event types gracefully", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      // Should complete without throwing
      await hooks.event!({
        event: {
          type: "unknown.event.type",
          properties: {},
        } as MockEvent as any,
      });
    });
  });

  describe("Hooks", () => {
    test("experimental.chat.system.transform injects provider hint for OpenAI models", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      const transformHook = hooks["experimental.chat.system.transform"]!;
      const hookOutput = { system: [] as string[] };
      await transformHook(
        { sessionID: "test", model: { providerID: "openai" } } as any,
        hookOutput as any,
      );

      expect(
        hookOutput.system.some((s) => s.includes("[ADV:PROVIDER_HINT]")),
      ).toBe(true);
      expect(
        hookOutput.system.some((s) => s.includes("structured formats")),
      ).toBe(true);
    });

    test("experimental.chat.system.transform injects provider hint for ZAI models", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      const transformHook = hooks["experimental.chat.system.transform"]!;
      const hookOutput = { system: [] as string[] };
      await transformHook(
        { sessionID: "test", model: { providerID: "zai-coding-plan" } } as any,
        hookOutput as any,
      );

      expect(
        hookOutput.system.some((s) => s.includes("[ADV:PROVIDER_HINT]")),
      ).toBe(true);
      expect(
        hookOutput.system.some((s) =>
          s.includes("restate the task before acting"),
        ),
      ).toBe(true);
    });

    test("experimental.chat.system.transform does not inject provider hint for baseline providers", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      const transformHook = hooks["experimental.chat.system.transform"]!;
      const hookOutput = { system: [] as string[] };
      await transformHook(
        { sessionID: "test", model: { providerID: "anthropic" } } as any,
        hookOutput as any,
      );

      expect(
        hookOutput.system.some((s) => s.includes("[ADV:PROVIDER_HINT]")),
      ).toBe(false);
    });

    test("experimental.chat.system.transform does not inject provider hint for unknown providers", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      const transformHook = hooks["experimental.chat.system.transform"]!;
      for (const providerID of ["google", "unknown-provider", "mistral"]) {
        const hookOutput = { system: [] as string[] };
        await transformHook(
          { sessionID: "test", model: { providerID } } as any,
          hookOutput as any,
        );

        expect(
          hookOutput.system.some((s) => s.includes("[ADV:PROVIDER_HINT]")),
        ).toBe(false);
      }
    });

    test("experimental.chat.system.transform does not inject provider hint when providerID is missing", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      const transformHook = hooks["experimental.chat.system.transform"]!;

      // undefined providerID
      const hookOutput1 = { system: [] as string[] };
      await transformHook(
        { sessionID: "test", model: {} } as any,
        hookOutput1 as any,
      );
      expect(
        hookOutput1.system.some((s) => s.includes("[ADV:PROVIDER_HINT]")),
      ).toBe(false);

      // missing model entirely
      const hookOutput2 = { system: [] as string[] };
      await transformHook({ sessionID: "test" } as any, hookOutput2 as any);
      expect(
        hookOutput2.system.some((s) => s.includes("[ADV:PROVIDER_HINT]")),
      ).toBe(false);
    });

    test("experimental.chat.system.transform does NOT inject dynamic wisdom or continuation", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      // 1. Set active change ID by calling a tool with it (args are in before hook)
      const changeId = "addFeature";
      await hooks["tool.execute.before"]!(
        { tool: "adv_task_list" } as any,
        { args: { changeId } } as any,
      );

      // 2. Add some wisdom
      const context = createMockToolContext();
      await hooks.tool!.adv_wisdom_add.execute(
        { changeId, type: "success", content: "Test wisdom" },
        context,
      );

      // 3. Call the hook
      const transformHook = hooks["experimental.chat.system.transform"]!;
      const hookOutput = { system: [] as string[] };
      await transformHook({ sessionID: "test" } as any, hookOutput as any);

      // 4. Verify dynamic context injection is NOT happening (removed for prompt caching)
      expect(
        hookOutput.system.some((s) => s.includes("[ADV:ACCUMULATED_WISDOM]")),
      ).toBe(false);
      expect(
        hookOutput.system.some((s) => s.includes("[ADV:TODO_CONTINUATION]")),
      ).toBe(false);
    });

    test("experimental.chat.system.transform injects wisdom recording prompt after task completion", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);
      const changeId = "addFeature";
      const taskId = "tk-task0001";

      // 1. Set active change (args are in before hook)
      await hooks["tool.execute.before"]!(
        { tool: "adv_task_list" } as any,
        { args: { changeId } } as any,
      );

      // 2. Mock task completion
      const toolOutput = JSON.stringify({
        success: true,
        task: { id: taskId, title: "Test Task", status: "done" },
      });
      await hooks["tool.execute.after"]!(
        { tool: "adv_task_update" } as any,
        { args: { taskId, status: "done" }, output: toolOutput } as any,
      );

      // 3. Call hook
      const transformHook = hooks["experimental.chat.system.transform"]!;
      const hookOutput = { system: [] as string[] };
      await transformHook({ sessionID: "test" } as any, hookOutput as any);

      // 4. Verify prompt
      expect(
        hookOutput.system.some((s) => s.includes("[ADV:RECORD_WISDOM]")),
      ).toBe(true);
      expect(hookOutput.system.some((s) => s.includes("Test Task"))).toBe(true);

      // 5. Verify it's cleared (call again)
      const secondOutput = { system: [] as string[] };
      await transformHook({ sessionID: "test" } as any, secondOutput as any);
      expect(
        secondOutput.system.some((s) => s.includes("[ADV:RECORD_WISDOM]")),
      ).toBe(false);
    });

    test("experimental.chat.system.transform does NOT inject dynamic wisdom (removed for prompt caching)", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);
      const changeId = "addFeature";

      // 1. Set active change (args are in before hook)
      await hooks["tool.execute.before"]!(
        { tool: "adv_task_list" } as any,
        { args: { changeId } } as any,
      );

      // 2. Add wisdom entries
      const context = createMockToolContext();
      for (let i = 1; i <= 5; i++) {
        await hooks.tool!.adv_wisdom_add.execute(
          { changeId, type: "pattern", content: `Wisdom entry ${i}` },
          context,
        );
      }

      // 3. Add project-level wisdom
      await addProjectWisdom(tempDir, {
        type: "convention",
        content: "Project-level convention: always use TDD",
        sourceChange: "previousChange",
      });

      // 4. Call hook
      const transformHook = hooks["experimental.chat.system.transform"]!;
      const hookOutput = { system: [] as string[] };
      await transformHook({ sessionID: "test" } as any, hookOutput as any);

      // 5. Verify NO dynamic injection (agents should explicitly call tools instead)
      expect(
        hookOutput.system.some((s) => s.includes("[ADV:ACCUMULATED_WISDOM]")),
      ).toBe(false);
      expect(
        hookOutput.system.some((s) => s.includes("[ADV:PROJECT_WISDOM]")),
      ).toBe(false);
      expect(
        hookOutput.system.some((s) => s.includes("[ADV:TODO_CONTINUATION]")),
      ).toBe(false);
    });
  });

  describe("Internal SDK Hooks", () => {
    test("tool.execute.before hook handles tool input", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      const toolInput = {
        tool: "bash",
        sessionID: "test-session",
        callID: "test-call",
      };
      const toolOutput = { args: { command: "echo test" } };

      // Should complete without throwing
      await hooks["tool.execute.before"]!(toolInput, toolOutput);
    });

    test("tool.execute.after hook handles tool output", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      const toolInput = {
        tool: "bash",
        sessionID: "test-session",
        callID: "test-call",
      };
      const toolOutput = {
        title: "bash",
        output: "test output",
        metadata: {},
      };

      // Should complete without throwing
      await hooks["tool.execute.after"]!(toolInput, toolOutput);
    });

    test("experimental.session.compacting hook adds context", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      const input = { sessionID: "test-session" };
      const output = { context: [] as string[], prompt: undefined };

      await hooks["experimental.session.compacting"]!(input, output);

      // Should not throw, context may or may not be added depending on state
      expect(Array.isArray(output.context)).toBe(true);
    });
  });

  // ===========================================================================
  // Status Transition Consistency
  // ===========================================================================

  describe("Status Transition Consistency", () => {
    test("adv_run_test red phase sets TOOLING status", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);
      const changeId = "addFeature";
      const taskId = "tk-task0001";

      // Set active change
      await hooks["tool.execute.before"]!(
        { tool: "adv_task_list" } as any,
        { args: { changeId } } as any,
      );

      // Simulate adv_run_test tool call with red phase in before hook
      await hooks["tool.execute.before"]!(
        { tool: "adv_run_test" } as any,
        { args: { taskId, phase: "red", command: "bun test" } } as any,
      );

      // Should be TOOLING now — not ROCKET
      const { getStatus } = await import("./events");
      expect(getStatus().currentStatus).toBe("TOOLING");
    });

    test("adv_run_test green phase sets TOOLING status", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);
      const changeId = "addFeature";
      const taskId = "tk-task0001";

      await hooks["tool.execute.before"]!(
        { tool: "adv_task_list" } as any,
        { args: { changeId } } as any,
      );

      await hooks["tool.execute.before"]!(
        { tool: "adv_run_test" } as any,
        { args: { taskId, phase: "green", command: "bun test" } } as any,
      );

      const { getStatus } = await import("./events");
      expect(getStatus().currentStatus).toBe("TOOLING");
    });

    test("adv_task_evidence red phase sets TOOLING status", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      await hooks["tool.execute.before"]!(
        { tool: "adv_task_evidence" } as any,
        { args: { taskId: "tk-x", phase: "red" } } as any,
      );

      const { getStatus } = await import("./events");
      expect(getStatus().currentStatus).toBe("TOOLING");
    });

    test("adv_task_evidence green phase sets TOOLING status", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      await hooks["tool.execute.before"]!(
        { tool: "adv_task_evidence" } as any,
        { args: { taskId: "tk-x", phase: "green" } } as any,
      );

      const { getStatus } = await import("./events");
      expect(getStatus().currentStatus).toBe("TOOLING");
    });

    test("task tool sets TOOLING and session.status busy does not overwrite it", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      // Sub-agent spawned → TOOLING
      await hooks["tool.execute.before"]!(
        { tool: "task" } as any,
        { args: {} } as any,
      );

      // session.status busy fires while sub-agent is still running
      await hooks.event!({
        event: {
          type: "session.status",
          properties: { status: { type: "busy" } },
        } as any,
      });

      const { getStatus } = await import("./events");
      expect(getStatus().currentStatus).toBe("TOOLING");
    });

    test("task tool sets TOOLING and session.status idle does not prematurely set ATTN", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      // Sub-agent spawned → TOOLING
      await hooks["tool.execute.before"]!(
        { tool: "task" } as any,
        { args: {} } as any,
      );

      // session.status idle fires while sub-agent still running (before task after hook)
      await hooks.event!({
        event: {
          type: "session.status",
          properties: { status: { type: "idle" } },
        } as any,
      });

      const { getStatus } = await import("./events");
      expect(getStatus().currentStatus).toBe("TOOLING");
    });

    test("permission.asked sets ATTN status", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      await hooks.event!({
        event: {
          type: "permission.asked",
          properties: {},
        } as any,
      });

      const { getStatus } = await import("./events");
      expect(getStatus().currentStatus).toBe("ATTN");
    });

    test("permission.replied returns to WORK when no sub-agents", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      // Set ATTN first
      await hooks.event!({
        event: { type: "permission.asked", properties: {} } as any,
      });

      // Reply
      await hooks.event!({
        event: { type: "permission.replied", properties: {} } as any,
      });

      const { getStatus } = await import("./events");
      expect(getStatus().currentStatus).toBe("WORK");
    });

    test("task tool completion clears permissionPending even if question tool fired inside sub-agent", async () => {
      // Regression: general sub-agent uses question tool internally → ATTN gets stuck
      // after sub-agent completes because task after-hook didn't reset permissionPending.
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      // 1. Sub-agent spawned → TOOLING
      await hooks["tool.execute.before"]!(
        { tool: "task" } as any,
        { args: {} } as any,
      );

      // 2. Sub-agent internally calls question tool → ATTN (overrides TOOLING via precedence)
      await hooks["tool.execute.before"]!(
        { tool: "question" } as any,
        { args: {} } as any,
      );

      const { getStatus } = await import("./events");
      expect(getStatus().currentStatus).toBe("ATTN");

      // 3. Question tool completes → permissionPending cleared, back to TOOLING
      await hooks["tool.execute.after"]!(
        { tool: "question" } as any,
        { args: {}, output: "" } as any,
      );
      expect(getStatus().currentStatus).toBe("TOOLING");

      // 4. Sub-agent task completes → should return to WORK (not stuck on ATTN)
      await hooks["tool.execute.after"]!(
        { tool: "task" } as any,
        { args: {}, output: "" } as any,
      );
      expect(getStatus().currentStatus).toBe("WORK");
    });

    test("task tool completion clears permissionPending when question after-hook was missed", async () => {
      // Regression: if question after-hook fires out of order or is missed,
      // task completion must still clear permissionPending to avoid stuck ATTN.
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      // 1. Sub-agent spawned → TOOLING
      await hooks["tool.execute.before"]!(
        { tool: "task" } as any,
        { args: {} } as any,
      );

      // 2. Sub-agent internally calls question tool → ATTN
      await hooks["tool.execute.before"]!(
        { tool: "question" } as any,
        { args: {} } as any,
      );

      const { getStatus } = await import("./events");
      expect(getStatus().currentStatus).toBe("ATTN");

      // 3. question after-hook is NOT fired (missed/out-of-order)
      // 4. Task completes — must still clear permissionPending
      await hooks["tool.execute.after"]!(
        { tool: "task" } as any,
        { args: {}, output: "" } as any,
      );
      expect(getStatus().currentStatus).toBe("WORK");
    });

    test("long tool (adv_run_test) resets status after session becomes idle with no sub-agents", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      // Start a long tool run → TOOLING
      await hooks["tool.execute.before"]!(
        { tool: "adv_run_test" } as any,
        { args: { taskId: "tk-x", phase: "red", command: "bun test" } } as any,
      );

      const { getStatus } = await import("./events");
      expect(getStatus().currentStatus).toBe("TOOLING");

      // Tool completes
      await hooks["tool.execute.after"]!(
        { tool: "adv_run_test" } as any,
        { args: {}, output: "{}" } as any,
      );

      // Session goes idle
      await hooks.event!({
        event: {
          type: "session.status",
          properties: { status: { type: "idle" } },
        } as any,
      });

      expect(getStatus().currentStatus).toBe("ATTN");
    });
  });
});

// =============================================================================
// system.transform change ID injection (Leak #2)
// =============================================================================

describe("system.transform change ID injection (Leak #2)", () => {
  let tempDir5: string;
  const pluginInstances5: Array<ReturnType<typeof plugin>> = [];

  beforeEach(async () => {
    tempDir5 = await createTempDir();
    await createTestProject(tempDir5);
  });

  afterEach(async () => {
    for (const p of pluginInstances5) {
      try {
        await p.onClose?.();
      } catch {
        // Non-fatal
      }
    }
    pluginInstances5.length = 0;
    await cleanupTempDir(tempDir5);
  });

  test("system.transform injects minimal change ID context when active change exists (Leak #2)", async () => {
    const hooks = await createTrackedPlugin(tempDir5, pluginInstances5);

    // Set active change via tool call
    await hooks["tool.execute.before"]!(
      { tool: "adv_task_list" } as any,
      { args: { changeId: "addFeature" } } as any,
    );

    const transformHook = hooks["experimental.chat.system.transform"]!;
    const hookOutput = { system: [] as string[] };
    await transformHook(
      { sessionID: "test-session" } as any,
      hookOutput as any,
    );

    // Should inject minimal change context (~20 tokens)
    const hasChangeContext = hookOutput.system.some(
      (s) => s.includes("[ADV]") && s.includes("addFeature"),
    );
    expect(hasChangeContext).toBe(true);

    // Should NOT inject bulk data (wisdom, tasks, etc.)
    expect(
      hookOutput.system.some((s) => s.includes("[ADV:ACCUMULATED_WISDOM]")),
    ).toBe(false);
    expect(
      hookOutput.system.some((s) => s.includes("[ADV:TODO_CONTINUATION]")),
    ).toBe(false);
  });

  test("system.transform is no-op when no active change (Leak #2)", async () => {
    const hooks = await createTrackedPlugin(tempDir5, pluginInstances5);

    // No active change set
    const transformHook = hooks["experimental.chat.system.transform"]!;
    const hookOutput = { system: [] as string[] };
    await transformHook(
      { sessionID: "test-session" } as any,
      hookOutput as any,
    );

    // No change context should be injected (worktree marker also absent since not in worktree)
    expect(
      hookOutput.system.some(
        (s) => s.includes("[ADV]") && s.includes("Active change"),
      ),
    ).toBe(false);
  });
});

// =============================================================================
// Plugin init resilience — degraded mode when init throws
// =============================================================================

describe("Plugin init resilience: degraded mode", () => {
  let tempDir: string;
  const pluginInstances: any[] = [];

  beforeEach(async () => {
    tempDir = await createTempDir();
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

  test("malformed project.json: plugin still returns hooks with stub tools", async () => {
    // Write project.json with invalid JSON syntax to force loadProjectConfig to throw.
    // This is the exact failure mode that previously killed all adv_* tools silently.
    const { writeFile } = await import("fs/promises");
    await writeFile(`${tempDir}/project.json`, "{ not valid json {{");

    const hooks = await createTrackedPlugin(tempDir, pluginInstances);

    // Plugin must still register a tool map — never throw out of AdvancePlugin
    expect(hooks).toHaveProperty("tool");
    expect(hooks.tool).not.toBeNull();

    // All standard ADV tool names must be registered as stubs so agents
    // discover the failure through any tool call rather than seeing "tool missing"
    const toolNames = Object.keys(hooks.tool!);
    expect(toolNames).toContain("adv_status");
    expect(toolNames).toContain("adv_change_list");
    expect(toolNames).toContain("adv_change_create");
    expect(toolNames).toContain("adv_task_list");
    expect(toolNames).toContain("adv_gate_complete");
  });

  test("malformed project.json: stub tools return structured init-error payload", async () => {
    const { writeFile } = await import("fs/promises");
    await writeFile(`${tempDir}/project.json`, "{ not valid json {{");

    const hooks = await createTrackedPlugin(tempDir, pluginInstances);
    const context = createMockToolContext();

    const result = await hooks.tool!.adv_change_list.execute({}, context);
    const parsed = parseToolOutput(result) as Record<string, unknown>;

    expect(parsed.status).toBe("ADV_PLUGIN_INIT_FAILED");
    expect(typeof parsed.error).toBe("string");
    expect((parsed.error as string).length).toBeGreaterThan(0);
    expect(Array.isArray(parsed.remediation)).toBe(true);
    expect((parsed.remediation as string[]).length).toBeGreaterThan(0);
  });

  test("malformed project.json: every stub tool reports the same failure", async () => {
    const { writeFile } = await import("fs/promises");
    await writeFile(`${tempDir}/project.json`, "{ not valid json {{");

    const hooks = await createTrackedPlugin(tempDir, pluginInstances);
    const context = createMockToolContext();

    // adv_status is the canonical probe — it must never throw and must report failure
    const statusResult = await hooks.tool!.adv_status.execute({}, context);
    const statusParsed = parseToolOutput(statusResult) as Record<
      string,
      unknown
    >;
    expect(statusParsed.status).toBe("ADV_PLUGIN_INIT_FAILED");

    // A second tool call returns the same diagnostic — proves all stubs are wired
    const createResult = await hooks.tool!.adv_change_create.execute(
      { summary: "test" },
      context,
    );
    const createParsed = parseToolOutput(createResult) as Record<
      string,
      unknown
    >;
    expect(createParsed.status).toBe("ADV_PLUGIN_INIT_FAILED");
  });

  test("malformed project.json: hooks (event, before, after, transform) are no-op safe", async () => {
    const { writeFile } = await import("fs/promises");
    await writeFile(`${tempDir}/project.json`, "{ not valid json {{");

    const hooks = await createTrackedPlugin(tempDir, pluginInstances);

    // None of these may throw even though store is null
    await expect(
      hooks.event!({
        event: {
          type: "session.status",
          properties: { status: { type: "idle" } },
        },
      } as any),
    ).resolves.not.toThrow();

    await expect(
      hooks["tool.execute.before"]!(
        { tool: "adv_change_list" } as any,
        { args: { changeId: "addFeature" } } as any,
      ),
    ).resolves.not.toThrow();

    await expect(
      hooks["tool.execute.after"]!(
        { tool: "adv_change_create" } as any,
        { args: {}, output: "{}" } as any,
      ),
    ).resolves.not.toThrow();

    const transformOut = { system: [] as string[] };
    await expect(
      hooks["experimental.chat.system.transform"]!(
        { sessionID: "test" } as any,
        transformOut as any,
      ),
    ).resolves.not.toThrow();
  });
});

// =============================================================================
// project.path fallback tests
// =============================================================================

describe("Plugin init: project.path fallback", () => {
  let tempDir: string;
  let gitDir: string;
  const pluginInstances: any[] = [];

  beforeEach(async () => {
    tempDir = await createTempDir();
    // Create a second temp dir with git init so it has a project ID
    gitDir = await createTempDir();
    await createTestProject(gitDir);
    // Initialize git so getProjectId returns a real ID
    const { execFile } = await import("child_process");
    await new Promise<void>((resolve, reject) => {
      execFile("git", ["init"], { cwd: gitDir }, (err) =>
        err ? reject(err) : resolve(),
      );
    });
    await new Promise<void>((resolve, reject) => {
      execFile("git", ["add", "-A"], { cwd: gitDir }, (err) =>
        err ? reject(err) : resolve(),
      );
    });
    await new Promise<void>((resolve, reject) => {
      execFile(
        "git",
        ["commit", "-m", "init", "--author", "test <test@test.com>"],
        {
          cwd: gitDir,
          env: {
            ...process.env,
            GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
            GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
          },
        },
        (err) => (err ? reject(err) : resolve()),
      );
    });
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
    await cleanupTempDir(gitDir);
  });

  test("falls back to project.vcsDir when directory is not a git repo", async () => {
    // directory = tempDir (no git), project.vcsDir = gitDir (has git).
    // This test asserts path resolution; disable Temporal bootstrap to keep
    // runtime under the 5s default timeout — gitDir is a real git repo so
    // getProjectId returns an ID, which would otherwise trigger
    // ensureTemporalRuntime (worker bundle compile adds several seconds).
    const prevDisable = process.env.ADV_DISABLE_TEMPORAL;
    process.env.ADV_DISABLE_TEMPORAL = "1";
    try {
      const input: MockPluginInput = {
        client: {},
        project: {
          id: "test-project",
          worktree: gitDir,
          vcsDir: gitDir,
          time: { created: Date.now() },
        },
        directory: tempDir,
        worktree: tempDir,
        serverUrl: TEST_SERVER_URL,
        $: {},
      };

      const hooks = await AdvancePlugin(input);
      pluginInstances.push(hooks);

      // Plugin should initialize without error and use gitDir's external state
      expect(hooks).toHaveProperty("tool");
      expect(hooks.tool).not.toBeNull();
    } finally {
      if (prevDisable === undefined) {
        delete process.env.ADV_DISABLE_TEMPORAL;
      } else {
        process.env.ADV_DISABLE_TEMPORAL = prevDisable;
      }
    }
  });

  test("initializes with legacy paths when neither directory nor project.vcsDir is a git repo", async () => {
    // Both are non-git paths
    const input: MockPluginInput = {
      client: {},
      project: {
        id: "test-project",
        worktree: tempDir,
        time: { created: Date.now() },
      },
      directory: tempDir,
      worktree: tempDir,
      serverUrl: TEST_SERVER_URL,
      $: {},
    };

    // Create minimal project structure so init doesn't fail
    await createTestProject(tempDir);

    const hooks = await AdvancePlugin(input);
    pluginInstances.push(hooks);

    expect(hooks).toHaveProperty("tool");
    expect(hooks.tool).not.toBeNull();

    // adv_status should show the legacy warning
    const context = createMockToolContext();
    const result = await hooks.tool!.adv_status.execute({}, context);
    const parsed = parseToolOutput(result);
    expect(
      (parsed as any).recommendations.some((r: string) =>
        r.includes("Running without external state"),
      ),
    ).toBe(true);
  });

  test("does not fall back when project.vcsDir equals directory", async () => {
    // Same path for both — should behave identically to existing tests
    await createTestProject(tempDir);

    const input: MockPluginInput = {
      client: {},
      project: {
        id: "test-project",
        worktree: tempDir,
        vcsDir: tempDir,
        time: { created: Date.now() },
      },
      directory: tempDir,
      worktree: tempDir,
      serverUrl: TEST_SERVER_URL,
      $: {},
    };

    const hooks = await AdvancePlugin(input);
    pluginInstances.push(hooks);

    expect(hooks).toHaveProperty("tool");
    // Still legacy mode (no git) but no crash
    const context = createMockToolContext();
    const result = await hooks.tool!.adv_status.execute({}, context);
    const parsed = parseToolOutput(result);
    expect(parsed).toHaveProperty("specs");
  });
});
