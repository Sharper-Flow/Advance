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
  type ContextSnapshotInput,
  type CrossRepoSwitchInput,
  type GateInfo,
} from "./context-snapshot";

describe("formatContextSnapshot", () => {
  const baseInput: ContextSnapshotInput = {
    changeId: "improveContextAgreement",
    title: "Improve context agreement",
    successCriteriaCount: 3,
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

  test("includes success criteria count", () => {
    const output = formatContextSnapshot(baseInput);
    expect(output).toContain("Success: 3 criteria");
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

  test("handles missing success criteria count gracefully", () => {
    const input: ContextSnapshotInput = {
      ...baseInput,
      successCriteriaCount: undefined,
    };
    const output = formatContextSnapshot(input);
    expect(output).toContain("Success: ? criteria");
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
      proposalText: "## Success Criteria\n- One\n- Two\n",
      gates: {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "pending" },
      },
      workdir: "/tmp/worktree",
    });

    expect(output).toContain("fixSlopScanFindings");
    expect(output).toContain("Success: 2 criteria");
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
      proposalText: "## Success Criteria\n- One\n",
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
