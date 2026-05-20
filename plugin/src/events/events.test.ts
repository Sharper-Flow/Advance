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
import {
  updateTerminalStatus,
  cleanupTerminal,
  _setBellCallback,
  armPendingFinalAlert,
  _clearPendingFinalAlert,
} from "./terminal";

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
// Bell Transition Logic (updateTerminalStatus)
// =============================================================================

describe("Bell Transition Logic", () => {
  let bells: number;

  const bellCount = (): number => bells;

  beforeEach(() => {
    vi.useFakeTimers();
    bells = 0;
    // Inject test callback — counts bell firings without real I/O
    _setBellCallback(() => {
      bells++;
    });
    // Reset terminal state (clears lastAlertedStatus to null + cancels pending bell)
    cleanupTerminal();
  });

  afterEach(() => {
    _setBellCallback(null);
    vi.useRealTimers();
  });

  // NOTE (#86): ATTN (permission pending) ALWAYS rings immediately.
  // IDLE (agent finished) uses the armed/debounce state machine.
  // These tests reflect the corrected post-#86 behavior.

  it("WORK→ATTN rings bell immediately (not debounced)", () => {
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("ATTN", "test");
    // ATTN from non-null previous status rings immediately
    expect(bellCount()).toBe(1);
  });

  it("WORK→ATTN→WORK: ATTN already rang, WORK is silent", () => {
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("ATTN", "test"); // rings immediately
    expect(bellCount()).toBe(1);
    updateTerminalStatus("WORK", "test"); // cancels nothing (no pending bell)
    vi.advanceTimersByTime(2000);
    expect(bellCount()).toBe(1); // no change
  });

  it("TOOLING→WORK→ATTN rings on final ATTN transition", () => {
    updateTerminalStatus("TOOLING", "test");
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("ATTN", "test"); // WORK→ATTN rings immediately
    expect(bellCount()).toBe(1);
  });

  it("sequential sub-agent cycles: final ATTN rings immediately", () => {
    // SA1: WORK → TOOLING → WORK → ATTN (briefly) → WORK → TOOLING → WORK → ATTN
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("TOOLING", "test"); // spawn SA1
    updateTerminalStatus("WORK", "test"); // SA1 returns
    updateTerminalStatus("ATTN", "test"); // briefly idle — rings
    expect(bellCount()).toBe(1);
    vi.advanceTimersByTime(500);
    updateTerminalStatus("WORK", "test"); // agent resumes
    updateTerminalStatus("TOOLING", "test"); // spawn SA2
    updateTerminalStatus("WORK", "test"); // SA2 returns
    updateTerminalStatus("ATTN", "test"); // genuinely idle — rings again
    expect(bellCount()).toBe(2);
  });

  it("ATTN (permission pending) rings immediately without debounce", () => {
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("ATTN", "test");
    // Should ring immediately, no timer needed
    expect(bellCount()).toBe(1);
  });

  it("ATTN (permission pending) rings immediately, ignoring armed flag (#86)", () => {
    armPendingFinalAlert("msg-test-4");
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("ATTN", "test"); // ATTN always rings immediately
    expect(bellCount()).toBe(1);
    // ATTN→ATTN: each permission request rings
    updateTerminalStatus("ATTN", "test");
    expect(bellCount()).toBe(2);
  });

  it("null→ATTN does not ring (new session)", () => {
    // cleanupTerminal in beforeEach sets lastAlertedStatus = null
    updateTerminalStatus("ATTN", "test");
    vi.advanceTimersByTime(2000);
    expect(bellCount()).toBe(0);
  });

  it("cleanupTerminal clears pending bell timer", () => {
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("ATTN", "test"); // rings immediately
    expect(bellCount()).toBe(1);
    cleanupTerminal(); // resets state
    vi.advanceTimersByTime(2000);
    expect(bellCount()).toBe(1); // no extra bell
  });
});

// =============================================================================
// Bell-Gate Policy
// =============================================================================

describe("Bell-Gate Policy", () => {
  let bells: number;

  const bellCount = (): number => bells;

  beforeEach(() => {
    vi.useFakeTimers();
    bells = 0;
    _setBellCallback(() => {
      bells++;
    });
    cleanupTerminal(); // resets lastAlertedStatus + cancels pending bell
    _clearPendingFinalAlert(); // explicit reset of bell-gate state
  });

  afterEach(() => {
    _setBellCallback(null);
    vi.useRealTimers();
  });

  // Bell policy for ATTN:
  //   - ATTN with pendingFinalAlert (armed idle): debounce ring
  //   - BLOCKED → ATTN: debounce ring (recovery prompt)
  //   - ATTN without armed flag: immediate ring (permission pending)
  //   - ATTN → ATTN: no bell

  // NOTE: After #86 fix, ATTN (permission pending) ALWAYS rings immediately.
  // The armed/debounce state machine applies to IDLE only.
  // ATTN → ATTN also rings (each permission request is distinct).

  it("armPendingFinalAlert debounces IDLE (not ATTN — ATTN always rings immediately)", () => {
    armPendingFinalAlert("msg-test-1");
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("IDLE", "test");
    expect(bellCount()).toBe(0); // debounce — no immediate ring
    vi.advanceTimersByTime(2000);
    expect(bellCount()).toBe(1); // rings after debounce
  });

  it("armPendingFinalAlert dedup: same messageId does not re-arm (IDLE)", () => {
    armPendingFinalAlert("msg-test-1");
    armPendingFinalAlert("msg-test-1"); // duplicate — no-op
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("IDLE", "test");
    expect(bellCount()).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(bellCount()).toBe(1);
    // Second cycle: new messageId
    armPendingFinalAlert("msg-test-2");
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("IDLE", "test");
    vi.advanceTimersByTime(2000);
    expect(bellCount()).toBe(2); // rings with new messageId
  });

  it("ATTN (permission pending) always rings immediately, ignoring armed flag", () => {
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("ATTN", "test");
    expect(bellCount()).toBe(1);
  });

  it("ATTN (permission pending) rings immediately even with armed flag", () => {
    armPendingFinalAlert("msg-test-2");
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("ATTN", "test");
    expect(bellCount()).toBe(1); // immediate — armed flag ignored for ATTN
  });

  it("ATTN after BLOCKED rings immediately (permission pending)", () => {
    updateTerminalStatus("BLOCKED", "test");
    updateTerminalStatus("ATTN", "test");
    expect(bellCount()).toBe(1); // immediate — BLOCKED→ATTN is permission pending
  });

  it("ATTN (permission pending) rings immediately, subsequent ATTN also rings", () => {
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("ATTN", "test"); // immediate
    expect(bellCount()).toBe(1);
    updateTerminalStatus("ATTN", "test"); // each permission request rings
    expect(bellCount()).toBe(2);
  });

  it("ATTN always rings immediately regardless of armed flag", () => {
    // Armed case: ATTN ignores armed flag — rings immediately
    armPendingFinalAlert("msg-test-4a");
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("ATTN", "test");
    expect(bellCount()).toBe(1); // immediate — armed flag ignored for ATTN
    // Non-armed case: also immediate
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("ATTN", "test");
    expect(bellCount()).toBe(2); // immediate ring
  });

  it("_clearPendingFinalAlert prevents armed debounce for IDLE", () => {
    armPendingFinalAlert("msg-test-5");
    _clearPendingFinalAlert();
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("IDLE", "test");
    expect(bellCount()).toBe(1); // no armed flag → immediate ring
  });

  it("dedup: same messageId arm is no-op, second IDLE is non-armed (immediate)", () => {
    armPendingFinalAlert("msg-dedup");
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("IDLE", "test");
    expect(bellCount()).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(bellCount()).toBe(1); // first ring via debounce
    // Re-arm with same messageId — dedup in armPendingFinalAlert makes this a no-op
    armPendingFinalAlert("msg-dedup");
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("IDLE", "test");
    // No armed flag (dedup prevented re-arm) → immediate ring
    expect(bellCount()).toBe(2);
  });
});

// =============================================================================
// IDLE Bell Transitions (rq-idleMarker01)
// =============================================================================

describe("IDLE Bell Transitions", () => {
  let bells: number;

  const bellCount = (): number => bells;

  beforeEach(() => {
    vi.useFakeTimers();
    bells = 0;
    _setBellCallback(() => {
      bells++;
    });
    cleanupTerminal();
    _clearPendingFinalAlert();
  });

  afterEach(() => {
    _setBellCallback(null);
    vi.useRealTimers();
  });

  // Bell policy for IDLE (the agent-finished-no-action-needed marker):
  //   - WORK → IDLE: ring (debounced via armed flag, immediate without)
  //   - TOOLING → IDLE: ring (debounced via armed flag, immediate without)
  //   - IDLE → IDLE: NO ring (same status — no transition)
  //   - IDLE → ATTN: ring (transition to user-action-needed; same as ATTN policy)
  //   - BLOCKED → IDLE: NO ring (recovery without user action)

  it("WORK → IDLE rings immediately without armed flag", () => {
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("IDLE", "test");
    expect(bellCount()).toBe(1);
  });

  it("TOOLING → IDLE rings immediately without armed flag", () => {
    updateTerminalStatus("TOOLING", "test");
    updateTerminalStatus("IDLE", "test");
    expect(bellCount()).toBe(1);
  });

  it("WORK → IDLE with armed flag debounces", () => {
    armPendingFinalAlert("msg-idle-1");
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("IDLE", "test");
    expect(bellCount()).toBe(0); // debounce
    vi.advanceTimersByTime(2000);
    expect(bellCount()).toBe(1);
  });

  it("IDLE → IDLE does not ring (same status)", () => {
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("IDLE", "test"); // rings
    expect(bellCount()).toBe(1);
    updateTerminalStatus("IDLE", "test"); // no transition
    vi.advanceTimersByTime(2000);
    expect(bellCount()).toBe(1); // no extra ring
  });

  it("BLOCKED → IDLE does not ring (recovery without user action)", () => {
    updateTerminalStatus("BLOCKED", "test");
    updateTerminalStatus("IDLE", "test");
    vi.advanceTimersByTime(2000);
    expect(bellCount()).toBe(0); // no ring — distinct from BLOCKED→ATTN
  });

  it("IDLE → ATTN rings (permission pending always rings immediately)", () => {
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("IDLE", "test"); // first ring (agent finished)
    expect(bellCount()).toBe(1);
    updateTerminalStatus("ATTN", "test"); // permission pending — always rings
    expect(bellCount()).toBe(2); // ATTN always rings
  });

  it("ATTN → IDLE does not ring (downgrade from user-needed to idle)", () => {
    updateTerminalStatus("WORK", "test");
    updateTerminalStatus("ATTN", "test"); // rings
    expect(bellCount()).toBe(1);
    updateTerminalStatus("IDLE", "test"); // user resolved — no extra ring
    vi.advanceTimersByTime(2000);
    expect(bellCount()).toBe(1);
  });

  it("null → IDLE does not ring (new session)", () => {
    // cleanupTerminal in beforeEach sets lastAlertedStatus = null
    updateTerminalStatus("IDLE", "test");
    vi.advanceTimersByTime(2000);
    expect(bellCount()).toBe(0);
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
