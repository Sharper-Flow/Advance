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
      expect(toolNames).toContain("adv_spec_list");
      expect(toolNames).toContain("adv_spec_show");
      expect(toolNames).toContain("adv_spec_search");
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
    test("adv_spec_list executes and returns JSON", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);
      const context = createMockToolContext();

      const result = await hooks.tool!.adv_spec_list.execute({}, context);

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
    test("experimental.chat.system.transform injects wisdom and continuation", async () => {
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

      // 4. Verify injections
      expect(
        hookOutput.system.some((s) => s.includes("[ADV:ACCUMULATED_WISDOM]")),
      ).toBe(true);
      expect(hookOutput.system.some((s) => s.includes("Test wisdom"))).toBe(
        true,
      );
      expect(
        hookOutput.system.some((s) => s.includes("[ADV:TODO_CONTINUATION]")),
      ).toBe(true);
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

    test("experimental.chat.system.transform truncates wisdom to most recent 10 entries", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);
      const changeId = "addFeature";

      // 1. Set active change (args are in before hook)
      await hooks["tool.execute.before"]!(
        { tool: "adv_task_list" } as any,
        { args: { changeId } } as any,
      );

      // 2. Add 12 wisdom entries
      const context = createMockToolContext();
      for (let i = 1; i <= 12; i++) {
        await hooks.tool!.adv_wisdom_add.execute(
          { changeId, type: "pattern", content: `Wisdom entry ${i}` },
          context,
        );
      }

      // 3. Call hook
      const transformHook = hooks["experimental.chat.system.transform"]!;
      const hookOutput = { system: [] as string[] };
      await transformHook({ sessionID: "test" } as any, hookOutput as any);

      // 4. Verify truncation
      const wisdomMessage = hookOutput.system.find((s) =>
        s.includes("[ADV:ACCUMULATED_WISDOM]"),
      );
      expect(wisdomMessage).toBeDefined();
      expect(wisdomMessage).toContain("Showing 10 of 12 most recent entries");
      expect(wisdomMessage).not.toContain("Wisdom entry 1\n"); // Oldest should be gone
      expect(wisdomMessage).not.toContain("Wisdom entry 2\n"); // 2nd oldest should be gone
      expect(wisdomMessage).toContain("Wisdom entry 3"); // 3rd oldest (entry 3) should be the first shown
      expect(wisdomMessage).toContain("Wisdom entry 12"); // Newest should be present
    });

    test("experimental.chat.system.transform injects project-level wisdom alongside change wisdom", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);
      const changeId = "addFeature";

      // 1. Set active change
      await hooks["tool.execute.before"]!(
        { tool: "adv_task_list" } as any,
        { args: { changeId } } as any,
      );

      // 2. Add change-level wisdom
      const context = createMockToolContext();
      await hooks.tool!.adv_wisdom_add.execute(
        { changeId, type: "success", content: "Change-level insight" },
        context,
      );

      // 3. Add project-level wisdom directly to JSONL
      await addProjectWisdom(tempDir, {
        type: "convention",
        content: "Project-level convention: always use TDD",
        sourceChange: "previousChange",
      });
      await addProjectWisdom(tempDir, {
        type: "pattern",
        content: "Project-level pattern: prefer JSONL for append logs",
        sourceChange: "anotherChange",
      });

      // 4. Call the hook
      const transformHook = hooks["experimental.chat.system.transform"]!;
      const hookOutput = { system: [] as string[] };
      await transformHook({ sessionID: "test" } as any, hookOutput as any);

      // 5. Verify both change-level AND project-level wisdom are injected
      expect(
        hookOutput.system.some((s) => s.includes("[ADV:ACCUMULATED_WISDOM]")),
      ).toBe(true);
      expect(
        hookOutput.system.some((s) => s.includes("Change-level insight")),
      ).toBe(true);

      // Project wisdom should appear in a separate section
      const projectWisdomMsg = hookOutput.system.find((s) =>
        s.includes("[ADV:PROJECT_WISDOM]"),
      );
      expect(projectWisdomMsg).toBeDefined();
      expect(projectWisdomMsg).toContain("Project-level convention: always use TDD");
      expect(projectWisdomMsg).toContain("Project-level pattern: prefer JSONL for append logs");
    });

    test("experimental.chat.system.transform limits project wisdom to 10 entries", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);
      const changeId = "addFeature";

      // 1. Set active change
      await hooks["tool.execute.before"]!(
        { tool: "adv_task_list" } as any,
        { args: { changeId } } as any,
      );

      // 2. Add 15 project-level wisdom entries
      for (let i = 1; i <= 15; i++) {
        await addProjectWisdom(tempDir, {
          type: "pattern",
          content: `Project wisdom ${i}`,
          sourceChange: "someChange",
        });
      }

      // 3. Call the hook
      const transformHook = hooks["experimental.chat.system.transform"]!;
      const hookOutput = { system: [] as string[] };
      await transformHook({ sessionID: "test" } as any, hookOutput as any);

      // 4. Verify truncation — only 10 of 15 shown
      const projectWisdomMsg = hookOutput.system.find((s) =>
        s.includes("[ADV:PROJECT_WISDOM]"),
      );
      expect(projectWisdomMsg).toBeDefined();
      expect(projectWisdomMsg).toContain("Showing 10 of 15");
      // Most recent should be present (listProjectWisdom returns newest first)
      expect(projectWisdomMsg).toContain("Project wisdom 15");
    });

    test("experimental.chat.system.transform skips project wisdom when none exist", async () => {
      const hooks = await createTrackedPlugin(tempDir, pluginInstances);
      const changeId = "addFeature";

      // 1. Set active change
      await hooks["tool.execute.before"]!(
        { tool: "adv_task_list" } as any,
        { args: { changeId } } as any,
      );

      // 2. Add change-level wisdom only (no project wisdom)
      const context = createMockToolContext();
      await hooks.tool!.adv_wisdom_add.execute(
        { changeId, type: "success", content: "Change-only insight" },
        context,
      );

      // 3. Call the hook
      const transformHook = hooks["experimental.chat.system.transform"]!;
      const hookOutput = { system: [] as string[] };
      await transformHook({ sessionID: "test" } as any, hookOutput as any);

      // 4. Verify no project wisdom section (no JSONL file exists)
      expect(
        hookOutput.system.some((s) => s.includes("[ADV:PROJECT_WISDOM]")),
      ).toBe(false);
      // But change-level wisdom should still be there
      expect(
        hookOutput.system.some((s) => s.includes("[ADV:ACCUMULATED_WISDOM]")),
      ).toBe(true);
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
});
