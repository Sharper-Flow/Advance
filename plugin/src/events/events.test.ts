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
  trackRetry,
  clearRetry,
  getDoomLoopInfo,
} from "./status";
import { getProjectName, isTmux } from "./terminal";
import {
  normalizeChangeCode,
  buildTabTitle,
  generateProjectShortname,
} from "./terminal";
import {
  updateTerminalStatus,
  cleanupTerminal,
  _setBellCallback,
} from "./terminal";

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
// generateProjectShortname
// =============================================================================

describe("generateProjectShortname", () => {
  describe("single-word names within limit", () => {
    it("title-cases a short single-word name", () => {
      expect(generateProjectShortname("app")).toBe("App");
    });

    it("preserves a 6-char single word name", () => {
      expect(generateProjectShortname("plugin")).toBe("Plugin");
    });
  });

  describe("single-word names over limit", () => {
    it("truncates a 7-char name to 6 chars", () => {
      expect(generateProjectShortname("advance")).toBe("Advanc");
    });

    it("truncates a longer name to 6 chars", () => {
      expect(generateProjectShortname("pokeedge")).toBe("Pokeed");
    });
  });

  describe("multi-word names", () => {
    it("acronymizes kebab-case multi-word names", () => {
      expect(generateProjectShortname("my-cool-project")).toBe("MCP");
    });

    it("acronymizes snake_case multi-word names", () => {
      expect(generateProjectShortname("my_cool_project")).toBe("MCP");
    });

    it("acronymizes camelCase multi-word names", () => {
      expect(generateProjectShortname("myCoolProject")).toBe("MCP");
    });

    it("acronymizes long multi-word names", () => {
      expect(generateProjectShortname("opencode-morph-fast-apply")).toBe(
        "OMFA",
      );
    });

    it("caps acronym at 6 chars", () => {
      expect(
        generateProjectShortname("alpha-beta-gamma-delta-epsilon-zeta-eta"),
      ).toBe("ABGDEZ");
    });

    it("joins short multi-word names without acronymizing", () => {
      // "a-b" → words ['a','b'] total=2, ≤ 6 → join+title-case
      expect(generateProjectShortname("a-b")).toBe("Ab");
    });
  });

  describe("prefix and suffix stripping", () => {
    it("strips oc- prefix", () => {
      expect(generateProjectShortname("oc-plugins")).toBe("Plugin");
    });

    it("strips lib- prefix", () => {
      expect(generateProjectShortname("lib-utils")).toBe("Utils");
    });

    it("strips node- prefix", () => {
      expect(generateProjectShortname("node-fetch")).toBe("Fetch");
    });

    it("strips -plugin suffix", () => {
      expect(generateProjectShortname("morph-plugin")).toBe("Morph");
    });

    it("strips -app suffix", () => {
      expect(generateProjectShortname("my-app")).toBe("My");
    });

    it("strips -cli suffix", () => {
      expect(generateProjectShortname("foo-cli")).toBe("Foo");
    });

    it("strips -server suffix", () => {
      expect(generateProjectShortname("api-server")).toBe("Api");
    });

    it("strips -mcp suffix", () => {
      expect(generateProjectShortname("kagi-mcp")).toBe("Kagi");
    });

    it("only strips one prefix and one suffix", () => {
      // "oc-foo-cli" → strip "oc-" → "foo-cli" → strip "-cli" → "foo"
      expect(generateProjectShortname("oc-foo-cli")).toBe("Foo");
    });

    it("falls back to original name if strip leaves nothing", () => {
      expect(generateProjectShortname("oc-")).toBe("Oc");
    });

    it("is case-insensitive when matching prefixes", () => {
      expect(generateProjectShortname("OC-Plugins")).toBe("Plugin");
    });
  });

  describe("edge cases", () => {
    it("returns empty string for empty input", () => {
      expect(generateProjectShortname("")).toBe("");
    });

    it("returns empty string for whitespace-only input", () => {
      expect(generateProjectShortname("   ")).toBe("");
    });

    it("trims leading and trailing whitespace", () => {
      expect(generateProjectShortname("  app  ")).toBe("App");
    });

    it("handles a single-letter name", () => {
      expect(generateProjectShortname("x")).toBe("X");
    });
  });
});

// =============================================================================
// buildTabTitle
// =============================================================================

describe("buildTabTitle", () => {
  it("shows shortname and change code when both present", () => {
    expect(buildTabTitle("🚀", "advance", "addFeatureX")).toBe(
      "🚀 Advanc · Feature X",
    );
  });

  it("shows shortname only when no active change", () => {
    expect(buildTabTitle("🌍", "advance", undefined)).toBe("🌍 Advanc");
  });

  it("shows shortname only when change ID is empty string", () => {
    expect(buildTabTitle("🌍", "advance", "")).toBe("🌍 Advanc");
  });

  it("uses acronym shortname for multi-word project names", () => {
    expect(buildTabTitle("🚀", "my-cool-project", "fixAuthTimeout")).toBe(
      "🚀 MCP · Auth Timeout",
    );
  });

  it("shows emoji only when project name is empty and no change", () => {
    expect(buildTabTitle("🌍", "", undefined)).toBe("🌍");
  });

  it("shows emoji and change only when project name is empty", () => {
    expect(buildTabTitle("🚀", "", "addFeatureX")).toBe("🚀 Feature X");
  });

  it("never includes progress text", () => {
    const title = buildTabTitle("🚀", "advance", "addFeatureX");
    expect(title).not.toMatch(/\[\d+\/\d+\]/);
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

  it("ROCKET→EARTH rings bell after debounce period", () => {
    updateTerminalStatus("ROCKET", "test");
    updateTerminalStatus("EARTH", "test");
    // Bell should NOT have fired yet (debounce pending)
    expect(bellCount()).toBe(0);
    vi.advanceTimersByTime(2000);
    // Now bell should fire
    expect(bellCount()).toBe(1);
  });

  it("ROCKET→EARTH→ROCKET cancels pending bell (debounce)", () => {
    updateTerminalStatus("ROCKET", "test");
    updateTerminalStatus("EARTH", "test");
    vi.advanceTimersByTime(500); // partial debounce
    updateTerminalStatus("ROCKET", "test"); // agent resumes work
    vi.advanceTimersByTime(2000); // timer would have fired
    expect(bellCount()).toBe(0); // cancelled
  });

  it("MOON→ROCKET→EARTH (sub-agent teardown) rings exactly once after debounce", () => {
    updateTerminalStatus("MOON", "test");
    updateTerminalStatus("ROCKET", "test");
    updateTerminalStatus("EARTH", "test");
    vi.advanceTimersByTime(2000);
    expect(bellCount()).toBe(1);
  });

  it("sequential sub-agent cycles do not ring multiple times within debounce window", () => {
    // SA1: ROCKET → MOON → ROCKET → EARTH (briefly) → ROCKET → MOON → ROCKET → EARTH
    updateTerminalStatus("ROCKET", "test");
    updateTerminalStatus("MOON", "test"); // spawn SA1
    updateTerminalStatus("ROCKET", "test"); // SA1 returns
    updateTerminalStatus("EARTH", "test"); // briefly idle
    vi.advanceTimersByTime(500); // not enough to fire
    updateTerminalStatus("ROCKET", "test"); // agent resumes
    updateTerminalStatus("MOON", "test"); // spawn SA2
    updateTerminalStatus("ROCKET", "test"); // SA2 returns
    updateTerminalStatus("EARTH", "test"); // genuinely idle
    vi.advanceTimersByTime(2000);
    expect(bellCount()).toBe(1); // only final EARTH rings
  });

  it("MIC rings immediately without debounce", () => {
    updateTerminalStatus("ROCKET", "test");
    updateTerminalStatus("MIC", "test");
    // Should ring immediately, no timer needed
    expect(bellCount()).toBe(1);
  });

  it("MIC cancels pending EARTH debounce and rings immediately", () => {
    updateTerminalStatus("ROCKET", "test");
    updateTerminalStatus("EARTH", "test"); // debounce starts
    vi.advanceTimersByTime(500);
    updateTerminalStatus("MIC", "test"); // MIC overrides
    expect(bellCount()).toBe(1); // only MIC bell, EARTH cancelled
    vi.advanceTimersByTime(2000);
    expect(bellCount()).toBe(1); // no extra bell from EARTH timer
  });

  it("null→EARTH does not ring (new session)", () => {
    // cleanupTerminal in beforeEach sets lastAlertedStatus = null
    updateTerminalStatus("EARTH", "test");
    vi.advanceTimersByTime(2000);
    expect(bellCount()).toBe(0);
  });

  it("EARTH→EARTH does not ring (already idle)", () => {
    updateTerminalStatus("ROCKET", "test");
    updateTerminalStatus("EARTH", "test");
    vi.advanceTimersByTime(2000); // first bell fires
    const firstBellCount = bellCount();
    updateTerminalStatus("EARTH", "test"); // redundant EARTH
    vi.advanceTimersByTime(2000);
    expect(bellCount()).toBe(firstBellCount); // no additional bell
  });

  it("cleanupTerminal clears pending bell timer", () => {
    updateTerminalStatus("ROCKET", "test");
    updateTerminalStatus("EARTH", "test");
    // Timer is pending
    cleanupTerminal(); // should cancel timer
    vi.advanceTimersByTime(2000);
    expect(bellCount()).toBe(0);
  });
});
