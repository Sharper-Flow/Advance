/**
 * Tests for compaction-context.ts — the pure helper that builds the
 * single text block ADV pushes during `experimental.session.compacting`.
 *
 * Maps to AC2 (compaction fidelity parity with live snapshot) and AC7
 * (stale-ledger detection — surfaces "task X cancelled/done" warning
 * instead of misdirecting the resumed agent).
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_COMPACTION_MAX_BYTES,
  buildCompactionContext,
  formatResumeHint,
  type BuildCompactionContextInput,
  type CompactionTaskLike,
  type CompactionTaskRunLike,
} from "./compaction-context";

const baseInput = (
  overrides: Partial<BuildCompactionContextInput> = {},
): BuildCompactionContextInput => ({
  change: { id: "addFeature", title: "Add Feature X" },
  tasks: [
    { id: "tk-1", title: "Step one", status: "done" },
    { id: "tk-2", title: "Step two — in progress", status: "in_progress" },
    { id: "tk-3", title: "Step three", status: "pending" },
  ],
  gates: {
    proposal: { status: "done" },
    discovery: { status: "done" },
    design: { status: "done" },
    planning: { status: "done" },
    execution: { status: "pending" },
    acceptance: { status: "pending" },
    release: { status: "pending" },
  },
  workdir: "/tmp/worktrees/addFeature",
  inProgressTaskRun: null,
  specs: [],
  ...overrides,
});

// ─── buildCompactionContext — composition contract ─────────────────────────

describe("buildCompactionContext (AC2)", () => {
  it("produces a non-empty string for a typical in-flight change", () => {
    const out = buildCompactionContext(baseInput());
    expect(out.length).toBeGreaterThan(0);
  });

  it("includes the change-id and title in the snapshot block", () => {
    const out = buildCompactionContext(baseInput());
    expect(out).toContain("addFeature");
  });

  it("includes the in-progress task title in the snapshot block", () => {
    const out = buildCompactionContext(baseInput());
    expect(out).toContain("Step two — in progress");
  });

  it("includes a specs summary block when specs are present", () => {
    const out = buildCompactionContext(
      baseInput({
        specs: [
          { name: "advance-workflow", title: "Workflow rules" },
          { name: "advance-delivery", title: "Delivery rules" },
        ],
      }),
    );
    expect(out).toContain("=== ADV SPECS CONTEXT ===");
    expect(out).toContain("- advance-workflow: Workflow rules");
    expect(out).toContain("- advance-delivery: Delivery rules");
  });

  it("omits the specs block when no specs are passed", () => {
    const out = buildCompactionContext(baseInput({ specs: [] }));
    expect(out).not.toContain("ADV SPECS CONTEXT");
  });

  it("includes a resume-hint block when an in-progress task ledger is provided", () => {
    const taskRun: CompactionTaskRunLike = {
      taskId: "tk-2",
      phase: "green_recorded",
      requiredNextAction: "run_incremental_verification",
      resumeHint: "Re-run pnpm test for src/foo before checkpoint",
    };
    const out = buildCompactionContext(
      baseInput({ inProgressTaskRun: taskRun }),
    );
    expect(out).toContain("=== ADV RESUME HINT ===");
    expect(out).toContain("Phase: green_recorded");
    expect(out).toContain("Next action: run_incremental_verification");
    expect(out).toContain("Re-run pnpm test for src/foo before checkpoint");
  });

  it("omits the resume-hint block when no ledger is provided", () => {
    const out = buildCompactionContext(baseInput());
    expect(out).not.toContain("ADV RESUME HINT");
  });

  it("orders sections: snapshot → specs → resume hint", () => {
    const taskRun: CompactionTaskRunLike = {
      taskId: "tk-2",
      phase: "started",
      requiredNextAction: "capture_baseline",
      resumeHint: "Verify clean tree",
    };
    const out = buildCompactionContext(
      baseInput({
        specs: [{ name: "x", title: "y" }],
        inProgressTaskRun: taskRun,
      }),
    );
    const snapshotIdx = out.indexOf("addFeature");
    const specsIdx = out.indexOf("ADV SPECS CONTEXT");
    const hintIdx = out.indexOf("ADV RESUME HINT");
    expect(snapshotIdx).toBeGreaterThanOrEqual(0);
    expect(specsIdx).toBeGreaterThan(snapshotIdx);
    expect(hintIdx).toBeGreaterThan(specsIdx);
  });

  it("truncates output past maxBytes with an explicit marker", () => {
    const longSpecs = Array.from({ length: 200 }, (_, i) => ({
      name: `spec-${i}`,
      title: "x".repeat(200),
    }));
    const out = buildCompactionContext(
      baseInput({
        specs: longSpecs,
        maxBytes: 1000,
      }),
    );
    expect(out.length).toBeLessThanOrEqual(1000);
    expect(out).toContain("[... ADV compaction truncated for size budget");
  });

  it("uses DEFAULT_COMPACTION_MAX_BYTES when no budget is specified", () => {
    expect(DEFAULT_COMPACTION_MAX_BYTES).toBeGreaterThanOrEqual(8_000);
    const out = buildCompactionContext(baseInput());
    expect(out.length).toBeLessThanOrEqual(DEFAULT_COMPACTION_MAX_BYTES);
  });
});

// ─── formatResumeHint — AC7 stale-ledger detection ─────────────────────────

describe("formatResumeHint (AC7 — stale-ledger detection)", () => {
  const tasks: CompactionTaskLike[] = [
    { id: "tk-active", title: "Active task", status: "in_progress" },
    { id: "tk-cancelled", title: "Cancelled task", status: "cancelled" },
    { id: "tk-done", title: "Completed task", status: "done" },
    { id: "tk-pending", title: "Pending task", status: "pending" },
  ];

  it("returns null when no task run is provided", () => {
    expect(formatResumeHint(null, tasks)).toBeNull();
  });

  it("returns the standard hint when the referenced task is in_progress", () => {
    const hint = formatResumeHint(
      {
        taskId: "tk-active",
        phase: "started",
        requiredNextAction: "capture_baseline",
        resumeHint: "Capture baseline",
      },
      tasks,
    );
    expect(hint).not.toBeNull();
    expect(hint).toContain("Phase: started");
    expect(hint).not.toContain("⚠");
  });

  it("surfaces a stale warning when the referenced task is cancelled (AC7)", () => {
    const hint = formatResumeHint(
      {
        taskId: "tk-cancelled",
        phase: "green_recorded",
        requiredNextAction: "run_incremental_verification",
        resumeHint: "Old hint",
      },
      tasks,
    );
    expect(hint).not.toBeNull();
    expect(hint).toContain("⚠");
    expect(hint).toContain(
      "Last ledger reference (task tk-cancelled) was cancelled before resume",
    );
    expect(hint).toContain("adv_change_show include:{readyTasks:true}");
    // Old phase/hint should be suppressed.
    expect(hint).not.toContain("green_recorded");
    expect(hint).not.toContain("Old hint");
  });

  it("surfaces a stale warning when the referenced task is done (AC7)", () => {
    const hint = formatResumeHint(
      {
        taskId: "tk-done",
        phase: "complete",
        requiredNextAction: "mark_done",
        resumeHint: "Mark done",
      },
      tasks,
    );
    expect(hint).not.toBeNull();
    expect(hint).toContain("⚠");
    expect(hint).toContain(
      "Last ledger reference (task tk-done) was done before resume",
    );
  });

  it("returns the standard hint when the referenced task is not in the change task list (orphaned ledger)", () => {
    // Defensive: if the ledger references a task we don't have in
    // the current task list (race / lookup failure), prefer the
    // standard hint over a fabricated stale-warning.
    const hint = formatResumeHint(
      {
        taskId: "tk-unknown",
        phase: "started",
        requiredNextAction: "capture_baseline",
        resumeHint: "Capture baseline",
      },
      tasks,
    );
    expect(hint).not.toBeNull();
    expect(hint).toContain("Phase: started");
    expect(hint).not.toContain("⚠");
  });
});
