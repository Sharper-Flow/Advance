/**
 * Context Snapshot Formatter Tests
 *
 * TDD tests for the context snapshot display that makes agent
 * internal state visible to the user.
 */

import { describe, test, expect } from "vitest";
import {
  formatContextSnapshot,
  formatCrossRepoSwitch,
  type ContextSnapshotInput,
  type CrossRepoSwitchInput,
} from "./context-snapshot";

describe("formatContextSnapshot", () => {
  const baseInput: ContextSnapshotInput = {
    changeId: "improveContextAgreement",
    title: "Improve context agreement",
    gates: {
      research: { status: "done" },
      prep: { status: "done" },
      implementation: { status: "pending" },
      review: { status: "pending" },
      harden: { status: "pending" },
      signoff: { status: "pending" },
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
    expect(output).toMatch(/research/);
    expect(output).toMatch(/prep/);
    expect(output).toMatch(/impl/);
    expect(output).toMatch(/review/);
    expect(output).toMatch(/harden/);
    expect(output).toMatch(/signoff/);
  });

  test("includes task counts by status", () => {
    const output = formatContextSnapshot(baseInput);
    expect(output).toContain("2 done");
    expect(output).toContain("1 active");
    expect(output).toContain("5 pending");
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
