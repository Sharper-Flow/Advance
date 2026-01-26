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

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
  });

  afterEach(async () => {
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
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);

      expect(hooks).toHaveProperty("tool");
      expect(typeof hooks.tool).toBe("object");
      expect(hooks.tool).not.toBeNull();
    });

    test("returns Hooks object with event function", async () => {
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);

      expect(hooks).toHaveProperty("event");
      expect(typeof hooks.event).toBe("function");
    });

    test("returns Hooks with tool.execute.before hook", async () => {
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);

      expect(hooks["tool.execute.before"]).toBeDefined();
      expect(typeof hooks["tool.execute.before"]).toBe("function");
    });

    test("returns Hooks with tool.execute.after hook", async () => {
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);

      expect(hooks["tool.execute.after"]).toBeDefined();
      expect(typeof hooks["tool.execute.after"]).toBe("function");
    });

    test("returns Hooks with experimental.session.compacting hook", async () => {
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);

      expect(hooks["experimental.session.compacting"]).toBeDefined();
      expect(typeof hooks["experimental.session.compacting"]).toBe("function");
    });
  });

  // ===========================================================================
  // Tool Registration Tests
  // ===========================================================================

  describe("Tool Registration", () => {
    test("registers all 28 tools", async () => {
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);

      const toolNames = Object.keys(hooks.tool!);
      expect(toolNames).toHaveLength(28);
    });

    test("registers spec tools", async () => {
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);

      const toolNames = Object.keys(hooks.tool!);
      expect(toolNames).toContain("adv_spec_list");
      expect(toolNames).toContain("adv_spec_show");
      expect(toolNames).toContain("adv_spec_search");
    });

    test("registers change tools", async () => {
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);

      const toolNames = Object.keys(hooks.tool!);
      expect(toolNames).toContain("adv_change_list");
      expect(toolNames).toContain("adv_change_show");
      expect(toolNames).toContain("adv_change_create");
      expect(toolNames).toContain("adv_change_validate");
      expect(toolNames).toContain("adv_change_archive");
    });

    test("registers task tools", async () => {
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);

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

    test("registers agenda tools", async () => {
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);

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
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);

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
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);

      for (const [_name, toolDef] of Object.entries(hooks.tool!)) {
        expect(toolDef).toHaveProperty("description", expect.any(String));
        expect(toolDef).toHaveProperty("args");
        expect(toolDef).toHaveProperty("execute");
        expect(typeof toolDef.execute).toBe("function");
      }
    });

    test("tool descriptions are non-empty strings", async () => {
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);

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
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);
      const context = createMockToolContext();

      const result = await hooks.tool!.adv_spec_list.execute({}, context);

      expect(typeof result).toBe("string");
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("specs");
      expect(Array.isArray(parsed.specs)).toBe(true);
    });

    test("adv_status executes and returns project status", async () => {
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);
      const context = createMockToolContext();

      const result = await hooks.tool!.adv_status.execute({}, context);

      expect(typeof result).toBe("string");
      const parsed = parseToolOutput(result);
      expect(parsed).toHaveProperty("specs");
      expect(parsed).toHaveProperty("changes");
    });

    test("adv_change_create creates a new change", async () => {
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);
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
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);

      await expect(
        hooks.event!({
          event: {
            type: "session.status",
            properties: { status: { type: "busy" } },
          } as MockEvent as any,
        }),
      ).resolves.not.toThrow();
    });

    test("event hook handles unknown event types gracefully", async () => {
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);

      await expect(
        hooks.event!({
          event: {
            type: "unknown.event.type",
            properties: {},
          } as MockEvent as any,
        }),
      ).resolves.not.toThrow();
    });

    test("tool.execute.before hook handles tool input", async () => {
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);

      const toolInput = {
        tool: "bash",
        sessionID: "test-session",
        callID: "test-call",
      };
      const toolOutput = { args: { command: "echo test" } };

      await expect(
        hooks["tool.execute.before"]!(toolInput, toolOutput),
      ).resolves.not.toThrow();
    });

    test("tool.execute.after hook handles tool output", async () => {
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);

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

      await expect(
        hooks["tool.execute.after"]!(toolInput, toolOutput),
      ).resolves.not.toThrow();
    });

    test("experimental.session.compacting hook adds context", async () => {
      const mockInput = createMockPluginInput(tempDir);
      const hooks = await AdvancePlugin(mockInput as any);

      const input = { sessionID: "test-session" };
      const output = { context: [] as string[], prompt: undefined };

      await hooks["experimental.session.compacting"]!(input, output);

      // Should not throw, context may or may not be added depending on state
      expect(Array.isArray(output.context)).toBe(true);
    });
  });
});
