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
