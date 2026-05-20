/**
 * Events Module Tests
 *
 * Tests for status markers and terminal utilities.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { STATUS_MARKERS } from "../types";
import {
  getStatusMarker,
  initializeStatus,
  setStatus,
  setActiveChange,
  setTaskProgress,
  getStatus,
  resetStatus,
  resetStatusForTest,
  trackRetry,
  clearRetry,
  cleanup as cleanupStatus,
  getDoomLoopInfo,
  getEffectiveDoomLoopInfo,
} from "./status";
import { getProjectName, isTmux } from "./terminal";
import { buildTabTitle } from "./terminal";
import { updateTerminalStatus, cleanupTerminal } from "./terminal";

describe("Status Markers", () => {
  describe("getStatusMarker", () => {
    it("returns correct marker for WORK", () => {
      expect(getStatusMarker("WORK")).toBe("[ADV:WORK]");
    });

    it("returns correct marker for TOOLING", () => {
      expect(getStatusMarker("TOOLING")).toBe("[ADV:TOOLING]");
    });

    it("returns correct marker for ATTN", () => {
      expect(getStatusMarker("ATTN")).toBe("[ADV:ATTN]");
    });

    it("returns correct marker for BLOCKED", () => {
      expect(getStatusMarker("BLOCKED")).toBe("[ADV:BLOCKED]");
    });

    it("all markers match STATUS_MARKERS constant", () => {
      for (const [key, value] of Object.entries(STATUS_MARKERS)) {
        expect(getStatusMarker(key as keyof typeof STATUS_MARKERS)).toBe(value);
      }
    });
  });
});

describe("Status State Management", () => {
  beforeEach(() => {
    // Full reset (clears idempotency sentinel) so each test gets a fresh init.
    resetStatusForTest();
  });

  describe("initializeStatus", () => {
    it("sets project name and default status (IDLE)", () => {
      initializeStatus("test-project");
      const status = getStatus();
      expect(status.projectName).toBe("test-project");
      expect(status.currentStatus).toBe("IDLE");
    });

    // Idempotency tests for change `fixWorktreeSessionRoot` task tk-f96182eff2ad.
    //
    // Required because OpenCode's InstanceState cache is keyed by directory.
    // In post-warp scenarios, ADV's plugin is instantiated twice (once for
    // trunk, once for the worktree). The second instantiation calls
    // initializeStatus(projectName) again — must preserve in-flight state.

    it("preserves activeChangeId on second init with same projectName", () => {
      initializeStatus("test-project");
      setActiveChange("change-X");
      initializeStatus("test-project");
      expect(getStatus().activeChangeId).toBe("change-X");
    });

    it("preserves activeChangeId on second init with DIFFERENT projectName (e.g. trunk → worktree)", () => {
      initializeStatus("trunk-basename");
      setActiveChange("change-X");
      // Simulate warp: same project (same root commit SHA) but different
      // basename due to worktree path.
      initializeStatus("worktree-basename");
      expect(getStatus().activeChangeId).toBe("change-X");
    });

    it("preserves currentStatus on second init", () => {
      initializeStatus("test-project");
      setStatus("WORK");
      initializeStatus("test-project");
      expect(getStatus().currentStatus).toBe("WORK");
    });

    it("preserves taskProgress on second init", () => {
      initializeStatus("test-project");
      setTaskProgress(3, 10);
      initializeStatus("test-project");
      expect(getStatus().taskProgress).toBe("3/10");
    });

    it("preserves projectName on second init (keeps initial simple tab identity)", () => {
      initializeStatus("trunk-basename");
      initializeStatus("worktree-basename");
      expect(getStatus().projectName).toBe("trunk-basename");
    });

    it("updates lastUpdated on every init call", () => {
      initializeStatus("test-project");
      const before = getStatus().lastUpdated;

      vi.useFakeTimers();
      vi.advanceTimersByTime(50);
      initializeStatus("test-project");
      vi.useRealTimers();

      expect(getStatus().lastUpdated).toBeGreaterThan(before);
    });

    it("resetStatusForTest restores destructive-init behavior", () => {
      initializeStatus("test-project");
      setActiveChange("change-X");
      resetStatusForTest();
      initializeStatus("test-project");
      // After resetStatusForTest, init reverts to destructive reset
      expect(getStatus().activeChangeId).toBeNull();
    });

    it("cleanup resets status state and the idempotency sentinel", () => {
      initializeStatus("trunk-basename");
      setActiveChange("change-X");
      setStatus("WORK");
      setTaskProgress(2, 4);

      cleanupStatus();
      initializeStatus("fresh-session");

      expect(getStatus()).toMatchObject({
        projectName: "fresh-session",
        currentStatus: "IDLE",
        activeChangeId: null,
        taskProgress: null,
      });
    });
  });

  describe("setStatus", () => {
    it("updates current status", () => {
      initializeStatus("test-project");
      setStatus("WORK");
      expect(getStatus().currentStatus).toBe("WORK");
    });

    it("updates lastUpdated timestamp", () => {
      initializeStatus("test-project");
      const before = getStatus().lastUpdated;

      // Small delay to ensure timestamp changes
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);
      setStatus("WORK");
      vi.useRealTimers();

      expect(getStatus().lastUpdated).toBeGreaterThanOrEqual(before);
    });
  });

  describe("setActiveChange", () => {
    it("sets active change ID", () => {
      initializeStatus("test-project");
      setActiveChange("my-change-123");
      expect(getStatus().activeChangeId).toBe("my-change-123");
    });

    it("clears active change with null", () => {
      initializeStatus("test-project");
      setActiveChange("my-change-123");
      setActiveChange(null);
      expect(getStatus().activeChangeId).toBeNull();
    });
  });

  describe("setTaskProgress", () => {
    it("sets progress string", () => {
      initializeStatus("test-project");
      setTaskProgress(3, 10);
      expect(getStatus().taskProgress).toBe("3/10");
    });

    it("clears progress when total is 0", () => {
      initializeStatus("test-project");
      setTaskProgress(0, 0);
      expect(getStatus().taskProgress).toBeNull();
    });
  });

  describe("resetStatus", () => {
    it("resets to default values", () => {
      initializeStatus("test-project");
      setStatus("WORK");
      setActiveChange("change-123");
      setTaskProgress(5, 10);

      resetStatus();

      const status = getStatus();
      expect(status.currentStatus).toBe("IDLE");
      expect(status.activeChangeId).toBeNull();
      expect(status.taskProgress).toBeNull();
      expect(status.projectName).toBe("test-project"); // Preserved
    });
  });
});

describe("Doom Loop Detection", () => {
  beforeEach(() => {
    // Clear any existing trackers by clearing retries
    clearRetry("test-task-1");
    clearRetry("test-task-2");
    resetStatus();
  });

  describe("trackRetry", () => {
    it("returns false on first attempt", () => {
      const result = trackRetry("test-task-1", "Error message");
      expect(result).toBe(false);
    });

    it("returns false on second attempt", () => {
      trackRetry("test-task-1");
      const result = trackRetry("test-task-1");
      expect(result).toBe(false);
    });

    it("returns true on third attempt (doom loop)", () => {
      trackRetry("test-task-1");
      trackRetry("test-task-1");
      const result = trackRetry("test-task-1");
      expect(result).toBe(true);
    });

    it("sets BLOCKED status on detection", () => {
      initializeStatus("test-project");
      trackRetry("test-task-1");
      trackRetry("test-task-1");
      trackRetry("test-task-1");
      expect(getStatus().currentStatus).toBe("BLOCKED");
    });

    it("tracks different tasks independently", () => {
      trackRetry("test-task-1");
      trackRetry("test-task-1");
      const result1 = trackRetry("test-task-2"); // First attempt for task-2
      expect(result1).toBe(false);
    });
  });

  describe("clearRetry", () => {
    it("resets attempt count for task", () => {
      trackRetry("test-task-1");
      trackRetry("test-task-1");
      clearRetry("test-task-1");

      const info = getDoomLoopInfo("test-task-1");
      expect(info.attempts).toBe(0);
    });
  });

  describe("getDoomLoopInfo", () => {
    it("returns info for tracked task", () => {
      trackRetry("test-task-1", "Test error");
      trackRetry("test-task-1", "Another error");

      const info = getDoomLoopInfo("test-task-1");
      expect(info.attempts).toBe(2);
      expect(info.lastError).toBe("Another error");
      expect(info.inDoomLoop).toBe(false);
    });

    it("returns defaults for unknown task", () => {
      const info = getDoomLoopInfo("unknown-task");
      expect(info.attempts).toBe(0);
      expect(info.lastError).toBeNull();
      expect(info.inDoomLoop).toBe(false);
    });

    it("indicates doom loop when threshold reached", () => {
      trackRetry("test-task-1");
      trackRetry("test-task-1");
      trackRetry("test-task-1");

      const info = getDoomLoopInfo("test-task-1");
      expect(info.inDoomLoop).toBe(true);
    });
  });
});

describe("Terminal Utilities", () => {
  describe("getProjectName", () => {
    it("extracts project name from path", () => {
      expect(getProjectName("/home/user/projects/my-project")).toBe(
        "my-project",
      );
    });

    it("handles simple directory name", () => {
      expect(getProjectName("my-project")).toBe("my-project");
    });

    it("handles trailing slash", () => {
      // Trailing slash results in empty last part, which returns "Unknown"
      expect(getProjectName("/home/user/projects/my-project/")).toBe("Unknown");
    });

    it("returns Unknown for empty path", () => {
      expect(getProjectName("")).toBe("Unknown");
    });
  });

  describe("isTmux", () => {
    it("returns boolean based on TMUX env var", () => {
      // Can't reliably test this without mocking process.env
      expect(typeof isTmux()).toBe("boolean");
    });
  });
});

// =============================================================================
// buildTabTitle
// =============================================================================

describe("buildTabTitle", () => {
  it("shows raw project and raw change ID when both present", () => {
    expect(buildTabTitle("🟩", "Jester", "working-on-adv-change-x")).toBe(
      "Jester: working-on-adv-change-x",
    );
  });

  it("shows raw project only when no active change", () => {
    expect(buildTabTitle("🟩", "Jester", undefined)).toBe("Jester");
  });

  it("shows raw project only when change ID is empty string", () => {
    expect(buildTabTitle("🟩", "Jester", "")).toBe("Jester");
  });

  it("does not acronymize multi-word project names", () => {
    expect(buildTabTitle("🟩", "my-cool-project", "fixAuthTimeout")).toBe(
      "my-cool-project: fixAuthTimeout",
    );
  });

  it("shows empty title when project name is empty and no change", () => {
    expect(buildTabTitle("🟩", "", undefined)).toBe("");
  });

  it("shows raw change only when project name is empty", () => {
    expect(buildTabTitle("🟩", "", "addFeatureX")).toBe("addFeatureX");
  });

  it("trims leading and trailing whitespace without semantic normalization", () => {
    expect(buildTabTitle("🟩", "  Jester  ", "  changeX  ")).toBe(
      "Jester: changeX",
    );
  });

  it("never includes progress text", () => {
    const title = buildTabTitle("🟩", "Jester", "changeX");
    expect(title).not.toMatch(/\[\d+\/\d+\]/);
  });

  it("ignores BLOCKED/status prefix for the simple identity title", () => {
    expect(buildTabTitle("🟥", "Jester", "changeX", "💀")).toBe(
      "Jester: changeX",
    );
  });

  it("shows project only when BLOCKED/status prefix is provided without active change", () => {
    expect(buildTabTitle("🟥", "Jester", undefined, "💀")).toBe("Jester");
  });

  it("ignores status emoji in the tab title", () => {
    expect(buildTabTitle("🟩", "Jester", "changeX")).toBe("Jester: changeX");
  });
});

// =============================================================================
// Terminal status updates are non-audible
// =============================================================================

describe("Terminal status updates are non-audible", () => {
  const originalTmux = process.env.TMUX;
  const originalStdoutIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    delete process.env.TMUX;
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      configurable: true,
    });
    cleanupTerminal();
  });

  afterEach(() => {
    if (originalTmux === undefined) {
      delete process.env.TMUX;
    } else {
      process.env.TMUX = originalTmux;
    }
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalStdoutIsTTY,
      configurable: true,
    });
    vi.restoreAllMocks();
    cleanupTerminal();
  });

  const expectNoBellForTransition = (
    ...statuses: Array<Parameters<typeof updateTerminalStatus>[0]>
  ): void => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true as never);

    for (const status of statuses) {
      updateTerminalStatus(status, "test-project");
    }

    const writes = stdoutSpy.mock.calls.map((call) => String(call[0]));
    expect(writes.some((write) => write.includes("\x07"))).toBe(false);
  };

  it("WORK → ATTN does not emit BEL", () => {
    expectNoBellForTransition("WORK", "ATTN");
  });

  it("WORK → IDLE does not emit BEL", () => {
    expectNoBellForTransition("WORK", "IDLE");
  });

  it("ATTN → IDLE does not emit BEL", () => {
    expectNoBellForTransition("ATTN", "IDLE");
  });

  it("BLOCKED → ATTN does not emit BEL", () => {
    expectNoBellForTransition("BLOCKED", "ATTN");
  });
});

describe("Effective Doom Loop Detection", () => {
  beforeEach(() => {
    clearRetry("persisted-task");
    clearRetry("memory-task");
  });

  it("treats persisted retry_count >= 3 as doom loop even after restart", () => {
    const info = getEffectiveDoomLoopInfo("persisted-task", {
      retry_count: 3,
      attempts: [
        { attempt_number: 1 },
        { attempt_number: 2 },
        { attempt_number: 3 },
      ] as any,
    } as any);
    expect(info.inDoomLoop).toBe(true);
    expect(info.attempts).toBe(3);
  });

  it("prefers in-memory tracker when it has higher attempt count", () => {
    trackRetry("memory-task", "e1");
    trackRetry("memory-task", "e2");
    trackRetry("memory-task", "e3");

    const info = getEffectiveDoomLoopInfo("memory-task", {
      retry_count: 1,
      attempts: [{ attempt_number: 1 }] as any,
    } as any);
    expect(info.inDoomLoop).toBe(true);
    expect(info.attempts).toBe(3);
  });
});
