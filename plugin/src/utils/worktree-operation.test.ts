import { describe, expect, it } from "vitest";

import {
  createWorktreeOperationContext,
  WORKTREE_DELETE_INTERNAL_BUDGET_MS,
  WORKTREE_DELETE_RESPONSE_RESERVE_MS,
} from "./worktree-operation";

describe("worktree operation context", () => {
  it("arms the deadline before target resolution and exposes arithmetic evidence", () => {
    const context = createWorktreeOperationContext({ now: 1_000 });

    expect(context.startedAt).toBe(1_000);
    expect(context.deadlineAt).toBe(1_000 + WORKTREE_DELETE_INTERNAL_BUDGET_MS);
    expect(context.responseReserveMs).toBe(WORKTREE_DELETE_RESPONSE_RESERVE_MS);
    expect(context.remainingMs(2_250)).toBe(
      WORKTREE_DELETE_INTERNAL_BUDGET_MS - 1_250,
    );
    expect(context.remainingMs(9_000)).toBe(0);
  });

  it("records current stage and bounded stage timings", () => {
    const context = createWorktreeOperationContext({ now: 10_000 });

    context.startStage("target_resolution", 10_100);
    expect(context.currentStage).toBe("target_resolution");
    context.finishStage("target_resolution", 10_175);

    expect(context.currentStage).toBeUndefined();
    expect(context.stageTimings).toEqual([
      {
        stage: "target_resolution",
        startedAt: 10_100,
        endedAt: 10_175,
        durationMs: 75,
      },
    ]);
  });

  it("aborts registered child leases exactly once", async () => {
    const context = createWorktreeOperationContext({ now: 0 });
    let terminations = 0;
    context.registerChildLease({
      terminate: async () => {
        terminations += 1;
      },
    });

    await context.abort("deadline");
    await context.abort("deadline");

    expect(context.signal.aborted).toBe(true);
    expect(terminations).toBe(1);
  });
});
