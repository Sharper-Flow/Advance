/**
 * Bun tests for bin/lib/changes.ts
 *
 * Run with: bun test bin/lib/changes.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  GATE_ORDER,
  computeLastActivity,
  classifyRecency,
  buildGateProgress,
  firstIncompleteGate,
  countTasks,
  RECENCY_HOT_THRESHOLD_MIN,
  RECENCY_STALE_THRESHOLD_MIN,
} from "./changes";
import type { ChangeRecord, TaskRecord } from "./types";

// =============================================================================
// GATE_ORDER
// =============================================================================

describe("GATE_ORDER", () => {
  test("has exactly 7 gates in canonical order", () => {
    expect(GATE_ORDER).toEqual([
      "proposal",
      "discovery",
      "design",
      "planning",
      "execution",
      "acceptance",
      "release",
    ]);
  });
});

// =============================================================================
// computeLastActivity
// =============================================================================

describe("computeLastActivity", () => {
  test("returns created_at when no other timestamps exist", () => {
    const change: ChangeRecord = {
      id: "c1",
      title: "T",
      status: "active",
      created_at: "2024-01-01T00:00:00Z",
      tasks: [],
    };
    expect(computeLastActivity(change)).toBe("2024-01-01T00:00:00Z");
  });

  test("picks lexicographic max across tasks, gates, wisdom, validation", () => {
    const change: ChangeRecord = {
      id: "c1",
      title: "T",
      status: "active",
      created_at: "2024-01-01T00:00:00Z",
      tasks: [
        {
          id: "t1",
          title: "task",
          status: "done",
          created_at: "2024-01-02T00:00:00Z",
          started_at: "2024-01-03T00:00:00Z",
          completed_at: "2024-01-04T00:00:00Z",
        } as TaskRecord,
      ],
      gates: {
        proposal: { status: "done", completed_at: "2024-01-05T00:00:00Z" },
      },
      wisdom: [{ recorded_at: "2024-01-06T00:00:00Z" }],
      validation: { validated_at: "2024-01-07T00:00:00Z" },
    };
    expect(computeLastActivity(change)).toBe("2024-01-07T00:00:00Z");
  });

  test("considers cancellation approved_at", () => {
    const change: ChangeRecord = {
      id: "c1",
      title: "T",
      status: "active",
      created_at: "2024-01-01T00:00:00Z",
      tasks: [
        {
          id: "t1",
          title: "task",
          status: "cancelled",
          cancellation: { approved_at: "2024-01-09T00:00:00Z" },
        } as TaskRecord,
      ],
    };
    expect(computeLastActivity(change)).toBe("2024-01-09T00:00:00Z");
  });

  test("ignores undefined/null timestamps", () => {
    const change: ChangeRecord = {
      id: "c1",
      title: "T",
      status: "active",
      created_at: "2024-01-05T00:00:00Z",
      tasks: [
        {
          id: "t1",
          title: "task",
          status: "pending",
          created_at: undefined,
          started_at: null as any,
        } as TaskRecord,
      ],
    };
    expect(computeLastActivity(change)).toBe("2024-01-05T00:00:00Z");
  });
});

// =============================================================================
// classifyRecency
// =============================================================================

describe("classifyRecency", () => {
  test("hot at threshold boundary", () => {
    expect(classifyRecency(RECENCY_HOT_THRESHOLD_MIN)).toBe("hot");
  });

  test("warm between boundaries", () => {
    expect(classifyRecency(RECENCY_HOT_THRESHOLD_MIN + 1)).toBe("warm");
    expect(classifyRecency(RECENCY_STALE_THRESHOLD_MIN - 1)).toBe("warm");
  });

  test("stale at threshold boundary", () => {
    expect(classifyRecency(RECENCY_STALE_THRESHOLD_MIN)).toBe("stale");
  });

  test("hot for very recent", () => {
    expect(classifyRecency(0)).toBe("hot");
  });

  test("stale for very old", () => {
    expect(classifyRecency(9999)).toBe("stale");
  });
});

// =============================================================================
// buildGateProgress
// =============================================================================

describe("buildGateProgress", () => {
  test("all circles when no gates", () => {
    expect(buildGateProgress(undefined)).toBe("○ ○ ○ ○ ○ ○ ○");
  });

  test("marks done gates with checkmarks", () => {
    const gates = {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "pending" },
      planning: { status: "pending" },
      execution: { status: "pending" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    };
    expect(buildGateProgress(gates)).toBe("✓ ✓ ○ ○ ○ ○ ○");
  });

  test("marks all done", () => {
    const gates = Object.fromEntries(
      GATE_ORDER.map((g) => [g, { status: "done" }]),
    );
    expect(buildGateProgress(gates)).toBe("✓ ✓ ✓ ✓ ✓ ✓ ✓");
  });
});

// =============================================================================
// firstIncompleteGate
// =============================================================================

describe("firstIncompleteGate", () => {
  test("returns first gate when no gates", () => {
    expect(firstIncompleteGate(undefined)).toBe("proposal");
  });

  test("returns first non-done gate", () => {
    const gates = {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "pending" },
    };
    expect(firstIncompleteGate(gates)).toBe("design");
  });

  test("returns null when all done", () => {
    const gates = Object.fromEntries(
      GATE_ORDER.map((g) => [g, { status: "done" }]),
    );
    expect(firstIncompleteGate(gates)).toBeNull();
  });
});

// =============================================================================
// countTasks
// =============================================================================

describe("countTasks", () => {
  test("counts done and cancelled as done", () => {
    const tasks: TaskRecord[] = [
      { id: "t1", title: "a", status: "done" },
      { id: "t2", title: "b", status: "cancelled" },
      { id: "t3", title: "c", status: "pending" },
      { id: "t4", title: "d", status: "in_progress" },
    ];
    expect(countTasks(tasks)).toEqual({ done: 2, total: 4 });
  });

  test("empty tasks", () => {
    expect(countTasks([])).toEqual({ done: 0, total: 0 });
  });
});
