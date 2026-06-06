/**
 * Context Snapshot Formatter Tests
 *
 * TDD tests for the context snapshot display that makes agent
 * internal state visible to the user.
 */

import { describe, test, expect } from "vitest";
import {
  buildChangeContextSnapshot,
  buildChangeContextTicker,
  formatContextSnapshot,
  formatCrossRepoSwitch,
  formatGateArrow,
  formatTickerSnapshot,
  summarizeTasks,
  type ContextSnapshotInput,
  type CrossRepoSwitchInput,
  type GateInfo,
} from "./context-snapshot";

describe("formatContextSnapshot", () => {
  const baseInput: ContextSnapshotInput = {
    changeId: "improveContextAgreement",
    title: "Improve context agreement",
    userOutcomeCount: 3,
    gates: {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "pending" },
      planning: { status: "pending" },
      execution: { status: "pending" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    },
    taskCounts: { done: 2, in_progress: 1, pending: 5, cancelled: 0 },
    workdir: "/home/user/dev/my-project",
  };

  test("includes change ID and title", () => {
    const output = formatContextSnapshot(baseInput);
    expect(output).toContain("improveContextAgreement");
    expect(output).toContain("Improve context agreement");
  });

  test("includes gate progress as inline visual", () => {
    const output = formatContextSnapshot(baseInput);
    // Should show done gates with checkmark and pending with circle
    expect(output).toMatch(/proposal/);
    expect(output).toMatch(/discovery/);
    expect(output).toMatch(/design/);
    expect(output).toMatch(/planning/);
    expect(output).toMatch(/execution/);
    expect(output).toMatch(/acceptance/);
    expect(output).toMatch(/release/);
  });

  test("includes task counts by status", () => {
    const output = formatContextSnapshot(baseInput);
    expect(output).toContain("2 done");
    expect(output).toContain("1 active");
    expect(output).toContain("5 pending");
  });

  test("includes user outcome count", () => {
    const output = formatContextSnapshot(baseInput);
    expect(output).toContain("Outcomes: 3 items");
  });

  test("includes workdir path", () => {
    const output = formatContextSnapshot(baseInput);
    expect(output).toContain("/home/user/dev/my-project");
  });

  test("fits within 10 lines", () => {
    const output = formatContextSnapshot(baseInput);
    const lines = output.split("\n");
    expect(lines.length).toBeLessThanOrEqual(10);
  });

  test("uses box-drawing characters", () => {
    const output = formatContextSnapshot(baseInput);
    expect(output).toMatch(/[╔╗╚╝║═]/);
  });

  test("is deterministic — same input produces same output", () => {
    const output1 = formatContextSnapshot(baseInput);
    const output2 = formatContextSnapshot(baseInput);
    expect(output1).toBe(output2);
  });

  test("includes current task when provided", () => {
    const input: ContextSnapshotInput = {
      ...baseInput,
      currentTask: { id: "tk-abc123", title: "Implement feature X" },
    };
    const output = formatContextSnapshot(input);
    expect(output).toContain("tk-abc123");
  });

  // Graceful degradation tests
  test("handles missing gates gracefully", () => {
    const input: ContextSnapshotInput = {
      ...baseInput,
      gates: undefined,
    };
    const output = formatContextSnapshot(input);
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
    // Should not throw
  });

  test("handles zero tasks gracefully", () => {
    const input: ContextSnapshotInput = {
      ...baseInput,
      taskCounts: { done: 0, in_progress: 0, pending: 0, cancelled: 0 },
    };
    const output = formatContextSnapshot(input);
    expect(output).toContain("0 done");
  });

  test("handles missing user outcome count gracefully", () => {
    const input: ContextSnapshotInput = {
      ...baseInput,
      userOutcomeCount: undefined,
    };
    const output = formatContextSnapshot(input);
    expect(output).toContain("Outcomes: ? items");
  });

  // Wisdom line tests (tk-VRoeOJTG)
  test("shows wisdom line when wisdomCount > 0", () => {
    const input: ContextSnapshotInput = {
      ...baseInput,
      wisdomCount: 5,
      wisdomByType: { pattern: 2, gotcha: 1, convention: 1, success: 1 },
    };
    const output = formatContextSnapshot(input);
    expect(output).toContain("Wisdom: 5 entries");
    expect(output).toContain("2 pattern");
    expect(output).toContain("1 gotcha");
    expect(output).toContain("1 convention");
  });

  test("omits wisdom line when wisdomCount is 0", () => {
    const input: ContextSnapshotInput = {
      ...baseInput,
      wisdomCount: 0,
      wisdomByType: {},
    };
    const output = formatContextSnapshot(input);
    expect(output).not.toContain("Wisdom:");
  });

  test("omits wisdom line when wisdomCount is undefined", () => {
    const output = formatContextSnapshot(baseInput);
    expect(output).not.toContain("Wisdom:");
  });

  test("fits within 10 lines with wisdom line and current task", () => {
    const input: ContextSnapshotInput = {
      ...baseInput,
      currentTask: { id: "tk-abc123", title: "Implement feature X" },
      wisdomCount: 3,
      wisdomByType: { convention: 2, pattern: 1 },
    };
    const output = formatContextSnapshot(input);
    const lines = output.split("\n");
    expect(lines.length).toBeLessThanOrEqual(10);
    expect(output).toContain("Wisdom: 3 entries");
    expect(output).toContain("tk-abc123");
  });
});

describe("formatCrossRepoSwitch", () => {
  const baseSwitch: CrossRepoSwitchInput = {
    fromPath: "/home/user/dev/frontend",
    toPath: "/home/user/dev/backend",
    taskId: "tk-backend01",
    taskTitle: "Add /api/oauth/callback endpoint",
  };

  test("shows from and to paths", () => {
    const output = formatCrossRepoSwitch(baseSwitch);
    expect(output).toContain("/home/user/dev/frontend");
    expect(output).toContain("/home/user/dev/backend");
  });

  test("shows the triggering task", () => {
    const output = formatCrossRepoSwitch(baseSwitch);
    expect(output).toContain("tk-backend01");
    expect(output).toContain("Add /api/oauth/callback endpoint");
  });

  test("uses box-drawing characters", () => {
    const output = formatCrossRepoSwitch(baseSwitch);
    expect(output).toMatch(/[╔╗╚╝║═]/);
  });

  test("output is at most 5 lines (3 content + 2 borders) per rq-ctxswitch.2", () => {
    const output = formatCrossRepoSwitch(baseSwitch);
    const lines = output.split("\n");
    expect(lines.length).toBeLessThanOrEqual(5);
    // Top + bottom borders contain ╔/╗ and ╚/╝
    expect(lines[0]).toMatch(/^╔/);
    expect(lines[lines.length - 1]).toMatch(/^╚/);
    // Content lines are between borders — 3 of them
    expect(lines.length - 2).toBeLessThanOrEqual(3);
  });

  test("each line is ≤80 columns (rq-ctxformat.3)", () => {
    const output = formatCrossRepoSwitch(baseSwitch);
    for (const line of output.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });

  test("merges from→to onto a single line", () => {
    const output = formatCrossRepoSwitch(baseSwitch);
    // The trimmed format puts both paths on one line separated by →
    expect(output).toMatch(
      /\/home\/user\/dev\/frontend.*→.*\/home\/user\/dev\/backend/,
    );
  });
});

describe("MAX_BOX_WIDTH cap on compact surfaces (rq-ctxformat.3, rq-ctxformat.4)", () => {
  test("formatContextSnapshot CONTEXT line truncates very long change IDs with ellipsis", () => {
    // 80-char synthetic change ID that exceeds the MAX_BOX_WIDTH-budgeted reserve
    const longId = "a".repeat(80);
    const input: ContextSnapshotInput = {
      changeId: longId,
      title: "synthetic test for truncation",
      userOutcomeCount: 0,
      gates: {},
      taskCounts: { done: 0, in_progress: 0, pending: 0, cancelled: 0 },
      workdir: "/tmp",
    };
    const output = formatContextSnapshot(input);
    const contextLine = output.split("\n").find((l) => l.includes("CONTEXT:"));
    expect(contextLine).toBeDefined();
    // The full 80-char ID does not appear — it's truncated
    expect(contextLine!.includes(longId)).toBe(false);
    // Truncation marker is present
    expect(contextLine).toContain("…");
  });

  test("formatContextSnapshot CONTEXT line passes short change IDs through unmodified", () => {
    const input: ContextSnapshotInput = {
      changeId: "improverefactorbatchorderingan",
      title: "improve refactor batch ordering and hot skip",
      userOutcomeCount: 0,
      gates: {},
      taskCounts: { done: 0, in_progress: 0, pending: 0, cancelled: 0 },
      workdir: "/tmp",
    };
    const output = formatContextSnapshot(input);
    const contextLine = output.split("\n").find((l) => l.includes("CONTEXT:"));
    expect(contextLine).toBeDefined();
    // 30-char ID is well under the truncation threshold — full ID appears
    expect(contextLine).toContain("improverefactorbatchorderingan");
    expect(contextLine).not.toContain("…");
  });

  test("formatCrossRepoSwitch handles long paths without exceeding 80 cols (rq-ctxformat.3)", () => {
    const longSwitch: CrossRepoSwitchInput = {
      fromPath:
        "/very/very/long/path/to/some/deeply/nested/repository/frontend-app",
      toPath:
        "/another/very/long/path/to/some/deeply/nested/repository/backend-app",
      taskId: "tk-long-cross-repo",
      taskTitle: "A reasonably long task title that should not blow the line",
    };
    const output = formatCrossRepoSwitch(longSwitch);
    for (const line of output.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });

  test("formatTickerSnapshot output never exceeds 80 columns", () => {
    const longTicker = formatTickerSnapshot({
      changeId: "improverefactorbatchorderingan",
      gates: {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "pending" },
      },
      taskCounts: { done: 0, in_progress: 0, pending: 0, cancelled: 0 },
    });
    expect(longTicker.length).toBeLessThanOrEqual(80);
  });
});

describe("buildChangeContextSnapshot", () => {
  test("builds a formatted snapshot from change data", () => {
    const output = buildChangeContextSnapshot({
      change: {
        id: "fixSlopScanFindings",
        title: "fix slop scan findings",
        tasks: [
          { id: "tk-1", title: "Done task", status: "done" },
          { id: "tk-2", title: "Active task", status: "in_progress" },
          { id: "tk-3", title: "Pending task", status: "pending" },
        ],
      },
      proposalText: "## User Outcomes\n- One\n- Two\n",
      gates: {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "pending" },
      },
      workdir: "/tmp/worktree",
    });

    expect(output).toContain("fixSlopScanFindings");
    expect(output).toContain("Outcomes: 2 items");
    expect(output).toContain("1 done");
    expect(output).toContain("1 active");
    expect(output).toContain("1 pending");
    expect(output).toContain("Current: tk-2");
  });

  test("includes wisdom summary when present", () => {
    const output = buildChangeContextSnapshot({
      change: {
        id: "fixSlopScanFindings",
        title: "fix slop scan findings",
        tasks: [{ id: "tk-1", title: "Done task", status: "done" }],
        wisdom: [{ type: "pattern" }, { type: "gotcha" }, { type: "pattern" }],
      },
      proposalText: "## User Outcomes\n- One\n",
      gates: {
        proposal: { status: "done" },
      },
      workdir: "/tmp/worktree",
    });

    expect(output).toContain("Wisdom: 3 entries");
    expect(output).toContain("2 pattern");
  });
});

// =============================================================================
// formatGateArrow — compact gate progress for ticker (rq-ctxticker1)
// =============================================================================

describe("formatGateArrow", () => {
  const allGates: Record<string, GateInfo> = {
    proposal: { status: "pending" },
    discovery: { status: "pending" },
    design: { status: "pending" },
    planning: { status: "pending" },
    execution: { status: "pending" },
    acceptance: { status: "pending" },
    release: { status: "pending" },
  };

  test("none done — shows first gate as pending pointing to next", () => {
    expect(formatGateArrow(allGates)).toBe("proposal ○→discovery");
  });

  test("partial done — shows last completed pointing to first incomplete", () => {
    const gates = {
      ...allGates,
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
    };
    // First incomplete is "planning"; last done is "design"
    expect(formatGateArrow(gates)).toBe("design ✓→planning");
  });

  test("all done — shows release ✓ with no arrow", () => {
    const gates = Object.fromEntries(
      Object.keys(allGates).map((g) => [g, { status: "done" }]),
    ) as Record<string, GateInfo>;
    expect(formatGateArrow(gates)).toBe("release ✓");
  });

  test("missing gates record — falls back to proposal ○→discovery", () => {
    expect(formatGateArrow(undefined)).toBe("proposal ○→discovery");
  });
});

// =============================================================================
// formatTickerSnapshot — compact 1-line ticker (rq-ctxticker1)
// =============================================================================

describe("formatTickerSnapshot", () => {
  const baseInput = {
    changeId: "addFeatureX",
    gates: {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "pending" },
      planning: { status: "pending" },
      execution: { status: "pending" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    },
    taskCounts: { done: 1, in_progress: 0, pending: 5, cancelled: 0 },
  };

  test("short change ID — single line, contains expected segments", () => {
    const output = formatTickerSnapshot(baseInput);
    expect(output.split("\n").length).toBe(1);
    expect(output).toMatch(/║.*addFeatureX.*·.*discovery ✓→design.*·.*1\/6.*║/);
    expect(output.length).toBeLessThanOrEqual(80);
  });

  test("long change ID — truncated to ≤20 chars with …", () => {
    const output = formatTickerSnapshot({
      ...baseInput,
      changeId: "improverefactorbatchorderingan", // 30 chars
    });
    expect(output).not.toContain("improverefactorbatchorderingan");
    expect(output).toMatch(/improverefactorbatc…/);
    // Truncated id is ≤TICKER_MAX_ID_CHARS (20) chars including the ellipsis
    const idMatch = output.match(/║ ([^·]+?) ·/);
    expect(idMatch?.[1].length).toBeLessThanOrEqual(20);
    expect(output.length).toBeLessThanOrEqual(80);
  });

  test("deterministic — same input produces same output", () => {
    const a = formatTickerSnapshot(baseInput);
    const b = formatTickerSnapshot(baseInput);
    expect(a).toBe(b);
  });

  test("contains box-drawing rails (║) for visual consistency", () => {
    const output = formatTickerSnapshot(baseInput);
    expect(output).toMatch(/[║]/);
  });

  test("includes cancelled tasks in total progress count", () => {
    const output = formatTickerSnapshot({
      ...baseInput,
      taskCounts: { done: 1, in_progress: 0, pending: 2, cancelled: 3 },
    });

    expect(output).toMatch(/1\/6/);
  });
});

// =============================================================================
// buildChangeContextTicker — integration with change-shaped input
// =============================================================================

describe("buildChangeContextTicker", () => {
  test("builds a single-line ticker from change data", () => {
    const output = buildChangeContextTicker({
      change: {
        id: "consolidatechatoutputdisplay",
        title: "consolidate chat output display",
        tasks: [
          { id: "tk-1", title: "T1", status: "done" },
          { id: "tk-2", title: "T2", status: "in_progress" },
          { id: "tk-3", title: "T3", status: "pending" },
        ],
      },
      gates: {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "done" },
        execution: { status: "pending" },
      },
    });

    expect(output.split("\n").length).toBe(1);
    expect(output).toMatch(/║.*·.*·.*1\/3.*║/);
    expect(output).toContain("planning ✓→execution");
    expect(output.length).toBeLessThanOrEqual(80);
  });
});

describe("formatContextSnapshot enrichment", () => {
  const baseInput: ContextSnapshotInput = {
    changeId: "improveContextAgreement",
    title: "Improve context agreement",
    userOutcomeCount: 3,
    gates: {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "pending" },
      planning: { status: "pending" },
      execution: { status: "pending" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    },
    taskCounts: { done: 2, in_progress: 1, pending: 5, cancelled: 0 },
    workdir: "/home/user/dev/my-project",
  };

  test("appends touched files count to Tasks line when provided", () => {
    const input: ContextSnapshotInput = {
      ...baseInput,
      touchedFilesCount: 5,
    };
    const output = formatContextSnapshot(input);
    expect(output).toContain("Tasks: 2 done | 1 active | 5 pending | 5 files");
  });

  test("does not add files suffix when touchedFilesCount is absent", () => {
    const output = formatContextSnapshot(baseInput);
    expect(output).toContain("Tasks: 2 done | 1 active | 5 pending");
    expect(output).not.toContain("files");
  });

  test("replaces Outcomes line with errorBudgetProximity when provided", () => {
    const input: ContextSnapshotInput = {
      ...baseInput,
      errorBudgetProximity: "⚠ 2/3 budget",
    };
    const output = formatContextSnapshot(input);
    expect(output).toContain("⚠ 2/3 budget");
    expect(output).not.toContain("Outcomes: 3 items");
  });

  test("shows Outcomes line when errorBudgetProximity is absent", () => {
    const output = formatContextSnapshot(baseInput);
    expect(output).toContain("Outcomes: 3 items");
  });
});

describe("summarizeTasks", () => {
  test("computes union touched files count across tasks", () => {
    const result = summarizeTasks([
      {
        id: "tk-1",
        title: "T1",
        status: "done",
        touched_files: ["a.ts", "b.ts"],
      },
      {
        id: "tk-2",
        title: "T2",
        status: "done",
        touched_files: ["b.ts", "c.ts"],
      },
      { id: "tk-3", title: "T3", status: "pending" },
    ]);
    expect(result.touchedFilesCount).toBe(3); // a.ts, b.ts, c.ts (union)
  });

  test("returns undefined touchedFilesCount when no task has touched_files", () => {
    const result = summarizeTasks([
      { id: "tk-1", title: "T1", status: "done" },
      { id: "tk-2", title: "T2", status: "pending" },
    ]);
    expect(result.touchedFilesCount).toBeUndefined();
  });

  test("computes errorBudgetProximity from max retry_count", () => {
    const result = summarizeTasks([
      {
        id: "tk-1",
        title: "T1",
        status: "done",
        error_recovery: { retry_count: 1 },
      },
      {
        id: "tk-2",
        title: "T2",
        status: "in_progress",
        error_recovery: { retry_count: 2 },
      },
      { id: "tk-3", title: "T3", status: "pending" },
    ]);
    expect(result.errorBudgetProximity).toBe("⚠ 2/3 budget");
  });

  test("returns undefined errorBudgetProximity when no retries", () => {
    const result = summarizeTasks([
      { id: "tk-1", title: "T1", status: "done" },
      { id: "tk-2", title: "T2", status: "pending" },
    ]);
    expect(result.errorBudgetProximity).toBeUndefined();
  });
});
