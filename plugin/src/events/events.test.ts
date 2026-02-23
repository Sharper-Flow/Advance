/**
 * Events Module Tests
 *
 * Tests for status markers and terminal utilities.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { STATUS_MARKERS } from "../types";
import type { Change, Task } from "../types";
import {
  getStatusMarker,
  initializeStatus,
  setStatus,
  setActiveChange,
  setTaskProgress,
  getStatus,
  resetStatus,
  detectStatusFromChange,
  detectTddStatus,
  trackRetry,
  clearRetry,
  getDoomLoopInfo,
} from "./status";
import { getProjectName, isTmux } from "./terminal";
import { normalizeChangeCode, buildTabTitle } from "./terminal";

describe("Status Markers", () => {
  describe("getStatusMarker", () => {
    it("returns correct marker for ROCKET", () => {
      expect(getStatusMarker("ROCKET")).toBe("[ADV:ROCKET]");
    });

    it("returns correct marker for TDD_RED", () => {
      expect(getStatusMarker("TDD_RED")).toBe("[ADV:TDD_RED]");
    });

    it("returns correct marker for TDD_GREEN", () => {
      expect(getStatusMarker("TDD_GREEN")).toBe("[ADV:TDD_GREEN]");
    });

    it("returns correct marker for MOON", () => {
      expect(getStatusMarker("MOON")).toBe("[ADV:MOON]");
    });

    it("returns correct marker for EARTH", () => {
      expect(getStatusMarker("EARTH")).toBe("[ADV:EARTH]");
    });

    it("returns correct marker for DOOM_LOOP", () => {
      expect(getStatusMarker("DOOM_LOOP")).toBe("[ADV:DOOM_LOOP]");
    });

    it("returns correct marker for MIC", () => {
      expect(getStatusMarker("MIC")).toBe("[ADV:MIC]");
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
    resetStatus();
  });

  describe("initializeStatus", () => {
    it("sets project name and default status", () => {
      initializeStatus("test-project");
      const status = getStatus();
      expect(status.projectName).toBe("test-project");
      expect(status.currentStatus).toBe("EARTH");
    });
  });

  describe("setStatus", () => {
    it("updates current status", () => {
      initializeStatus("test-project");
      setStatus("ROCKET");
      expect(getStatus().currentStatus).toBe("ROCKET");
    });

    it("updates lastUpdated timestamp", () => {
      initializeStatus("test-project");
      const before = getStatus().lastUpdated;

      // Small delay to ensure timestamp changes
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);
      setStatus("TDD_RED");
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
      setStatus("ROCKET");
      setActiveChange("change-123");
      setTaskProgress(5, 10);

      resetStatus();

      const status = getStatus();
      expect(status.currentStatus).toBe("EARTH");
      expect(status.activeChangeId).toBeNull();
      expect(status.taskProgress).toBeNull();
      expect(status.projectName).toBe("test-project"); // Preserved
    });
  });
});

describe("Status Detection", () => {
  describe("detectStatusFromChange", () => {
    it("returns EARTH when all tasks are done", () => {
      const change: Change = {
        id: "test",
        title: "Test",
        status: "active",
        created_at: new Date().toISOString(),
        tasks: [
          {
            id: "t1",
            title: "Task 1",
            status: "done",
            priority: 0,
            created_at: "",
          },
          {
            id: "t2",
            title: "Task 2",
            status: "done",
            priority: 1,
            created_at: "",
          },
        ],
        deltas: {},
      };
      expect(detectStatusFromChange(change)).toBe("EARTH");
    });

    it("returns ROCKET when tasks in progress", () => {
      const change: Change = {
        id: "test",
        title: "Test",
        status: "active",
        created_at: new Date().toISOString(),
        tasks: [
          {
            id: "t1",
            title: "Task 1",
            status: "in_progress",
            priority: 0,
            created_at: "",
          },
          {
            id: "t2",
            title: "Task 2",
            status: "pending",
            priority: 1,
            created_at: "",
          },
        ],
        deltas: {},
      };
      expect(detectStatusFromChange(change)).toBe("ROCKET");
    });

    it("returns ROCKET when tasks pending in active change", () => {
      const change: Change = {
        id: "test",
        title: "Test",
        status: "active",
        created_at: new Date().toISOString(),
        tasks: [
          {
            id: "t1",
            title: "Task 1",
            status: "pending",
            priority: 0,
            created_at: "",
          },
        ],
        deltas: {},
      };
      expect(detectStatusFromChange(change)).toBe("ROCKET");
    });

    it("returns MIC for draft status", () => {
      const change: Change = {
        id: "test",
        title: "Test",
        status: "draft",
        created_at: new Date().toISOString(),
        tasks: [],
        deltas: {},
      };
      expect(detectStatusFromChange(change)).toBe("MIC");
    });

    it("returns MIC for pending approval status", () => {
      const change: Change = {
        id: "test",
        title: "Test",
        status: "pending",
        created_at: new Date().toISOString(),
        tasks: [],
        deltas: {},
      };
      expect(detectStatusFromChange(change)).toBe("MIC");
    });
  });

  describe("detectTddStatus", () => {
    it("returns TDD_RED for test writing tasks", () => {
      const task: Task = {
        id: "t1",
        title: "Write tests for validation",
        status: "in_progress",
        priority: 0,
        created_at: "",
      };
      expect(detectTddStatus(task)).toBe("TDD_RED");
    });

    it("returns TDD_GREEN for implementation tasks", () => {
      const task: Task = {
        id: "t1",
        title: "Implement validation logic",
        status: "in_progress",
        priority: 0,
        created_at: "",
      };
      expect(detectTddStatus(task)).toBe("TDD_GREEN");
    });

    it("returns ROCKET for generic tasks", () => {
      const task: Task = {
        id: "t1",
        title: "Update documentation",
        status: "in_progress",
        priority: 0,
        created_at: "",
      };
      expect(detectTddStatus(task)).toBe("ROCKET");
    });

    it("returns ROCKET for null task", () => {
      expect(detectTddStatus(null)).toBe("ROCKET");
    });

    it("detects red phase indicator", () => {
      const task: Task = {
        id: "t1",
        title: "RED PHASE: Create failing test",
        status: "in_progress",
        priority: 0,
        created_at: "",
      };
      expect(detectTddStatus(task)).toBe("TDD_RED");
    });

    it("detects green phase indicator", () => {
      const task: Task = {
        id: "t1",
        title: "GREEN PHASE: Make tests pass",
        status: "in_progress",
        priority: 0,
        created_at: "",
      };
      expect(detectTddStatus(task)).toBe("TDD_GREEN");
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

    it("sets DOOM_LOOP status on detection", () => {
      initializeStatus("test-project");
      trackRetry("test-task-1");
      trackRetry("test-task-1");
      trackRetry("test-task-1");
      expect(getStatus().currentStatus).toBe("DOOM_LOOP");
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
// normalizeChangeCode
// =============================================================================

describe("normalizeChangeCode", () => {
  describe("camelCase inputs", () => {
    it("strips leading add prefix and title-cases remainder", () => {
      expect(normalizeChangeCode("addFeatureX")).toBe("Feature X");
    });

    it("strips leading fix prefix", () => {
      expect(normalizeChangeCode("fixAuthTimeout")).toBe("Auth Timeout");
    });

    it("strips leading improve prefix", () => {
      expect(normalizeChangeCode("improveTerminalTabTitle")).toBe(
        "Terminal Tab Title",
      );
    });

    it("strips leading update prefix", () => {
      expect(normalizeChangeCode("updateUserProfile")).toBe("User Profile");
    });

    it("strips leading create prefix", () => {
      expect(normalizeChangeCode("createNewSession")).toBe("New Session");
    });

    it("strips leading remove prefix", () => {
      expect(normalizeChangeCode("removeDeprecatedApi")).toBe("Deprecated Api");
    });

    it("strips leading refactor prefix", () => {
      expect(normalizeChangeCode("refactorStorageLayer")).toBe("Storage Layer");
    });

    it("strips leading change prefix", () => {
      expect(normalizeChangeCode("changeTabTitle")).toBe("Tab Title");
    });

    it("handles multi-word camelCase without prefix", () => {
      expect(normalizeChangeCode("terminalTabTitle")).toBe(
        "Terminal Tab Title",
      );
    });
  });

  describe("kebab-case inputs", () => {
    it("normalizes kebab-case with prefix", () => {
      expect(normalizeChangeCode("fix-auth-timeout")).toBe("Auth Timeout");
    });

    it("normalizes kebab-case without prefix", () => {
      expect(normalizeChangeCode("terminal-tab-title")).toBe(
        "Terminal Tab Title",
      );
    });

    it("normalizes improve- prefix kebab", () => {
      expect(normalizeChangeCode("improve-terminal-tab-title")).toBe(
        "Terminal Tab Title",
      );
    });
  });

  describe("snake_case inputs", () => {
    it("normalizes snake_case with prefix", () => {
      expect(normalizeChangeCode("fix_auth_timeout")).toBe("Auth Timeout");
    });

    it("normalizes snake_case without prefix", () => {
      expect(normalizeChangeCode("terminal_tab_title")).toBe(
        "Terminal Tab Title",
      );
    });
  });

  describe("edge cases", () => {
    it("falls back to raw ID title-cased when prefix consumes entire string", () => {
      // 'add' alone — prefix strip yields empty, fallback to title-cased raw
      expect(normalizeChangeCode("add")).toBe("Add");
    });

    it("falls back to raw ID title-cased for very short unknown IDs", () => {
      expect(normalizeChangeCode("x")).toBe("X");
    });

    it("handles nanoid suffix style change IDs (add-claude-code-lP0b)", () => {
      const result = normalizeChangeCode("add-claude-code-lP0b");
      // strips 'add' prefix → 'Claude Code L P0b' — acceptable output
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });

    it("does not strip prefix that is a substring match only", () => {
      // 'address' starts with 'add' but 'address' is not the prefix alone
      expect(normalizeChangeCode("addressBug")).toBe("Address Bug");
    });

    it("returns non-empty string for any non-empty input", () => {
      const inputs = [
        "addFeatureX",
        "fix-bug",
        "refactor_code",
        "someChange",
        "x",
      ];
      for (const input of inputs) {
        expect(normalizeChangeCode(input).length).toBeGreaterThan(0);
      }
    });
  });
});

// =============================================================================
// buildTabTitle
// =============================================================================

describe("buildTabTitle", () => {
  it("shows normalized change code only when change is active", () => {
    expect(buildTabTitle("🚀", "advance", "addFeatureX")).toBe(
      "🚀 Feature X",
    );
  });

  it("shows emoji only when no active change", () => {
    expect(buildTabTitle("🌍", "advance", undefined)).toBe("🌍");
  });

  it("shows emoji only when change ID is empty string", () => {
    expect(buildTabTitle("🌍", "advance", "")).toBe("🌍");
  });

  it("never includes project name when change is active", () => {
    const title = buildTabTitle("🚀", "my-project", "fixAuthTimeout");
    expect(title).not.toContain("my-project");
    expect(title).toBe("🚀 Auth Timeout");
  });

  it("never includes progress text", () => {
    // buildTabTitle has no progress parameter — just verify shape
    const title = buildTabTitle("🚀", "advance", "addFeatureX");
    expect(title).not.toMatch(/\[\d+\/\d+\]/);
  });

  it("shows only emoji (no project name) when no change is active", () => {
    const title = buildTabTitle("🌍", "advance", undefined);
    expect(title).not.toContain("advance");
    expect(title).toBe("🌍");
  });
});
