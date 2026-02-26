/**
 * Advance Plugin SDK Integration Tests
 *
 * TDD tests for the plugin's SDK compliance.
 * These tests verify the plugin correctly implements the @opencode-ai/plugin interface.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { AdvancePlugin } from "./index";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  parseToolOutput,
} from "./__tests__/setup";
import { addProjectWisdom } from "./storage/project-wisdom";

// =============================================================================
// Mock Plugin Input
// =============================================================================

// Using inline types to avoid SDK import issues during testing
interface MockPluginInput {
  client: unknown;
  project: { name: string; path: string };
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

const createMockPluginInput = (directory: string): MockPluginInput => ({
  client: {},
  project: { name: "test-project", path: directory },
  directory,
  worktree: directory,
  serverUrl: new URL("http://localhost:3000"),
  $: {},
});

/**
 * Create plugin hooks and track them for cleanup.
 * Each test should use this instead of calling AdvancePlugin directly
 * to ensure process listeners are removed in afterEach.
 */
const createTrackedPlugin = async (
  directory: string,
  tracker: any[],
): Promise<any> => {
  const input = createMockPluginInput(directory);
  const hooks = await AdvancePlugin(input as any);
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
    test("registers all 36 tools", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      const toolNames = Object.keys(hooks.tool!);
      expect(toolNames).toHaveLength(36);
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
      expect(toolNames).toContain("adv_change_create");
      expect(toolNames).toContain("adv_change_validate");
      expect(toolNames).toContain("adv_change_archive");
      expect(toolNames).toContain("adv_change_add_issue");
      expect(toolNames).toContain("adv_change_remove_issue");
    });

    test("registers task tools", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      const toolNames = Object.keys(hooks.tool!);
      expect(toolNames).toContain("adv_task_list");
      expect(toolNames).toContain("adv_task_ready");
      expect(toolNames).toContain("adv_task_update");
      expect(toolNames).toContain("adv_task_add");
      expect(toolNames).toContain("adv_task_evidence");
      expect(toolNames).toContain("adv_task_tdd_phase");
      expect(toolNames).toContain("adv_task_skip_tdd");
      expect(toolNames).toContain("adv_task_tdd_status");
      expect(toolNames).toContain("adv_task_cancel");
    });

    test("registers wisdom tools", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      const toolNames = Object.keys(hooks.tool!);
      expect(toolNames).toContain("adv_wisdom_add");
      expect(toolNames).toContain("adv_wisdom_list");
      expect(toolNames).toContain("adv_wisdom_promote");
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
      expect(toolNames).toContain("adv_agenda_next");
      expect(toolNames).toContain("adv_agenda_stats");
      expect(toolNames).toContain("adv_agenda_evidence");
      expect(toolNames).toContain("adv_agenda_compact");
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
    test("adv_run_test red phase sets TDD_RED status", async () => {
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

      // Should be TDD_RED now — not ROCKET
      const { getStatus } = await import("./events");
      expect(getStatus().currentStatus).toBe("TDD_RED");
    });

    test("adv_run_test green phase sets TDD_GREEN status", async () => {
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
      expect(getStatus().currentStatus).toBe("TDD_GREEN");
    });

    test("adv_task_evidence red phase sets TDD_RED status", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      await hooks["tool.execute.before"]!(
        { tool: "adv_task_evidence" } as any,
        { args: { taskId: "tk-x", phase: "red" } } as any,
      );

      const { getStatus } = await import("./events");
      expect(getStatus().currentStatus).toBe("TDD_RED");
    });

    test("adv_task_evidence green phase sets TDD_GREEN status", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      await hooks["tool.execute.before"]!(
        { tool: "adv_task_evidence" } as any,
        { args: { taskId: "tk-x", phase: "green" } } as any,
      );

      const { getStatus } = await import("./events");
      expect(getStatus().currentStatus).toBe("TDD_GREEN");
    });

    test("task tool sets MOON and session.status busy does not overwrite it", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      // Sub-agent spawned → MOON
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
      expect(getStatus().currentStatus).toBe("MOON");
    });

    test("task tool sets MOON and session.status idle does not prematurely set EARTH", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      // Sub-agent spawned → MOON
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
      expect(getStatus().currentStatus).toBe("MOON");
    });

    test("permission.asked sets MIC status", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      await hooks.event!({
        event: {
          type: "permission.asked",
          properties: {},
        } as any,
      });

      const { getStatus } = await import("./events");
      expect(getStatus().currentStatus).toBe("MIC");
    });

    test("permission.replied returns to ROCKET when no sub-agents", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      // Set MIC first
      await hooks.event!({
        event: { type: "permission.asked", properties: {} } as any,
      });

      // Reply
      await hooks.event!({
        event: { type: "permission.replied", properties: {} } as any,
      });

      const { getStatus } = await import("./events");
      expect(getStatus().currentStatus).toBe("ROCKET");
    });

    test("task tool completion clears permissionPending even if question tool fired inside sub-agent", async () => {
      // Regression: general sub-agent uses question tool internally → MIC gets stuck
      // after sub-agent completes because task after-hook didn't reset permissionPending.
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      // 1. Sub-agent spawned → MOON
      await hooks["tool.execute.before"]!(
        { tool: "task" } as any,
        { args: {} } as any,
      );

      // 2. Sub-agent internally calls question tool → MIC (overrides MOON via precedence)
      await hooks["tool.execute.before"]!(
        { tool: "question" } as any,
        { args: {} } as any,
      );

      const { getStatus } = await import("./events");
      expect(getStatus().currentStatus).toBe("MIC");

      // 3. Question tool completes → permissionPending cleared, back to MOON
      await hooks["tool.execute.after"]!(
        { tool: "question" } as any,
        { args: {}, output: "" } as any,
      );
      expect(getStatus().currentStatus).toBe("MOON");

      // 4. Sub-agent task completes → should return to ROCKET (not stuck on MIC)
      await hooks["tool.execute.after"]!(
        { tool: "task" } as any,
        { args: {}, output: "" } as any,
      );
      expect(getStatus().currentStatus).toBe("ROCKET");
    });

    test("task tool completion clears permissionPending when question after-hook was missed", async () => {
      // Regression: if question after-hook fires out of order or is missed,
      // task completion must still clear permissionPending to avoid stuck MIC.
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      // 1. Sub-agent spawned → MOON
      await hooks["tool.execute.before"]!(
        { tool: "task" } as any,
        { args: {} } as any,
      );

      // 2. Sub-agent internally calls question tool → MIC
      await hooks["tool.execute.before"]!(
        { tool: "question" } as any,
        { args: {} } as any,
      );

      const { getStatus } = await import("./events");
      expect(getStatus().currentStatus).toBe("MIC");

      // 3. question after-hook is NOT fired (missed/out-of-order)
      // 4. Task completes — must still clear permissionPending
      await hooks["tool.execute.after"]!(
        { tool: "task" } as any,
        { args: {}, output: "" } as any,
      );
      expect(getStatus().currentStatus).toBe("ROCKET");
    });

    test("TDD phase resets to ROCKET after session becomes idle with no sub-agents", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);

      // Start a TDD phase
      await hooks["tool.execute.before"]!(
        { tool: "adv_run_test" } as any,
        { args: { taskId: "tk-x", phase: "red", command: "bun test" } } as any,
      );

      const { getStatus } = await import("./events");
      expect(getStatus().currentStatus).toBe("TDD_RED");

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

      expect(getStatus().currentStatus).toBe("EARTH");
    });
  });
});
