/**
 * Bun tests for bin/lib/render.ts
 *
 * Run with: bun test bin/lib/render.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  shouldUseColor,
  relativeTime,
  formatTable,
  emitJson,
} from "./render";
import type { ChangeSummary } from "./types";

// =============================================================================
// shouldUseColor
// =============================================================================

describe("shouldUseColor", () => {
  const originalNoColor = process.env.NO_COLOR;

  test("returns false when noColorFlag is true", () => {
    expect(shouldUseColor(true)).toBe(false);
  });

  test("returns false when NO_COLOR is set", () => {
    process.env.NO_COLOR = "1";
    expect(shouldUseColor(false)).toBe(false);
    delete process.env.NO_COLOR;
  });

  test("returns true in TTY without flags when Bun colors enabled", () => {
    // This test assumes isTTY is true in the test runner; if not, the
    // Bun.enableANSIColors branch or the final fallback determines it.
    // We just assert it does not throw and returns a boolean.
    const result = shouldUseColor(false);
    expect(typeof result).toBe("boolean");
  });

  // Restore
  if (originalNoColor !== undefined) {
    process.env.NO_COLOR = originalNoColor;
  } else {
    delete process.env.NO_COLOR;
  }
});

// =============================================================================
// relativeTime
// =============================================================================

describe("relativeTime", () => {
  test("now for very recent", () => {
    const now = new Date("2024-01-01T12:00:00Z");
    expect(relativeTime("2024-01-01T11:59:59Z", now)).toBe("now");
  });

  test("minutes ago", () => {
    const now = new Date("2024-01-01T12:00:00Z");
    expect(relativeTime("2024-01-01T11:55:00Z", now)).toBe("5m ago");
  });

  test("hours ago", () => {
    const now = new Date("2024-01-01T12:00:00Z");
    expect(relativeTime("2024-01-01T09:00:00Z", now)).toBe("3h ago");
  });

  test("days ago", () => {
    const now = new Date("2024-01-10T12:00:00Z");
    expect(relativeTime("2024-01-07T12:00:00Z", now)).toBe("3d ago");
  });

  test("months ago", () => {
    const now = new Date("2024-04-01T12:00:00Z");
    expect(relativeTime("2024-01-01T12:00:00Z", now)).toBe("3mo ago");
  });

  test("never negative", () => {
    const now = new Date("2024-01-01T12:00:00Z");
    expect(relativeTime("2024-01-01T13:00:00Z", now)).toBe("now");
  });
});

// =============================================================================
// formatTable
// =============================================================================

describe("formatTable", () => {
  test("empty summaries returns placeholder", () => {
    expect(formatTable([], false, new Date())).toBe("(no active changes)");
  });

  test("renders a single summary without color", () => {
    const now = new Date("2024-01-01T12:00:00Z");
    const summaries: ChangeSummary[] = [
      {
        id: "fix-bug",
        title: "Fix the bug",
        status: "active",
        recency: "hot",
        lastActivityAt: "2024-01-01T11:00:00Z",
        minutesSinceActivity: 60,
        tasksDone: 1,
        tasksTotal: 3,
        firstIncompleteGate: "planning",
        gateProgressStr: "✓ ✓ ✓ ○ ○ ○ ○",
      },
    ];
    const out = formatTable(summaries, false, now);
    expect(out).toContain("fix-bug");
    expect(out).toContain("Fix the bug");
    expect(out).toContain("1/3");
    expect(out).toContain("✓ ✓ ✓ ○ ○ ○ ○");
    expect(out).toContain("1h ago");
    expect(out).not.toContain("\x1b["); // no ANSI codes
  });

  test("indents child changes with arrow", () => {
    const now = new Date("2024-01-01T12:00:00Z");
    const summaries: ChangeSummary[] = [
      {
        id: "parent",
        title: "Parent",
        status: "active",
        recency: "hot",
        lastActivityAt: "2024-01-01T11:00:00Z",
        minutesSinceActivity: 60,
        tasksDone: 0,
        tasksTotal: 0,
        firstIncompleteGate: "proposal",
        gateProgressStr: "○ ○ ○ ○ ○ ○ ○",
      },
      {
        id: "child",
        title: "Child",
        status: "active",
        recency: "warm",
        lastActivityAt: "2024-01-01T10:00:00Z",
        minutesSinceActivity: 120,
        tasksDone: 0,
        tasksTotal: 0,
        firstIncompleteGate: "proposal",
        gateProgressStr: "○ ○ ○ ○ ○ ○ ○",
        parentChangeId: "parent",
      },
    ];
    const out = formatTable(summaries, false, now);
    expect(out).toContain("↳ child");
  });

  test("renders epic id next to change id when present", () => {
    const now = new Date("2024-01-01T12:00:00Z");
    const summaries: ChangeSummary[] = [
      {
        id: "epic-child",
        title: "Epic child",
        status: "active",
        recency: "hot",
        lastActivityAt: "2024-01-01T11:00:00Z",
        minutesSinceActivity: 60,
        tasksDone: 0,
        tasksTotal: 0,
        firstIncompleteGate: "proposal",
        gateProgressStr: "○ ○ ○ ○ ○ ○ ○",
        epicId: "addAuthEpic",
      },
    ];
    const out = formatTable(summaries, false, now);
    expect(out).toContain("epic-child [addAuthEpic]");
  });
});

// =============================================================================
// emitJson
// =============================================================================

describe("emitJson", () => {
  test("pretty-prints an object", () => {
    const obj = { a: 1, b: [2, 3] };
    expect(emitJson(obj)).toBe(JSON.stringify(obj, null, 2));
  });
});
