/**
 * Context Snapshot Formatter Tests
 *
 * TDD tests for the context snapshot display that makes agent
 * internal state visible to the user.
 */

import { describe, test, expect } from "vitest";
import {
  buildChangeContextSnapshot,
  formatContextSnapshot,
  formatCrossRepoSwitch,
  type ContextSnapshotInput,
  type CrossRepoSwitchInput,
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

describe("formatContextSnapshot — approval_mode autopilot display", () => {
  const baseInput: ContextSnapshotInput = {
    changeId: "autopilotTest",
    title: "Autopilot test change",
    successCriteriaCount: 1,
    taskCounts: { done: 0, in_progress: 0, pending: 1, cancelled: 0 },
  };

  test("shows Mode: autopilot line when approval_mode is set", () => {
    const output = formatContextSnapshot({
      ...baseInput,
      approval_mode: "autopilot",
      autopilot_invoked_at: "2026-04-28T22:00:00.000Z",
    });
    expect(output).toContain(
      "Mode: autopilot (since 2026-04-28T22:00:00.000Z)",
    );
  });

  test("omits Mode line when approval_mode is not set", () => {
    const output = formatContextSnapshot(baseInput);
    expect(output).not.toContain("Mode: autopilot");
  });
});
