import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { advWorktreeTools } from "../adv-worktree";
import { advWorktreeDelete } from "./index";
import {
  encodeWorktreeDeletionToken,
  type WorktreeDeletionFacts,
  type WorktreeDeletionPlan,
} from "./deletion-contracts";

const facts: WorktreeDeletionFacts = {
  repository: "/repo",
  worktree: "/repo-wt",
  branch: "change/example",
  head: "abcd1234",
  detached: false,
  bare: false,
  locked: false,
  prunable: false,
  dirty: false,
  mainWorktree: false,
  cwd: "/repo",
  cwdInsideWorktree: false,
  inUse: false,
  gitCorrupt: false,
};

function plan(): WorktreeDeletionPlan {
  const expiresAt = Date.now() + 60_000;
  const integration = {
    kind: "merged_to_default" as const,
    branch: facts.branch!,
    defaultBranch: "trunk",
    head: facts.head,
    evidence: "test census merged proof",
  };
  const token = encodeWorktreeDeletionToken({ facts, expiresAt, integration });
  return {
    version: "wdp1",
    repository: facts.repository,
    facts,
    expiresAt,
    token,
    integration,
  };
}

function deps(overrides: Record<string, unknown> = {}) {
  return {
    projectRoot: "/repo",
    database: { projectId: "test" } as never,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    hooks: { preDelete: [] },
    ...overrides,
  } as never;
}

describe("shared public worktree deletion contract", () => {
  it("keeps handler schema and preflight parity for plan/apply fields", () => {
    const schema = z.object(advWorktreeTools.adv_worktree_delete.args);
    expect(
      schema.safeParse({
        branch: facts.branch,
        dryRun: true,
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        branch: facts.branch,
        planToken: "token",
        approvalEvidence: "   ",
      }).success,
    ).toBe(false);
  });

  it("rejects legacy branch-only apply before planner or effects", async () => {
    const planner = { plan: vi.fn() };
    const executor = vi.fn();
    const result = await advWorktreeDelete(
      facts.branch!,
      {},
      deps({ deletionPlanner: planner, deletionExecutor: executor }),
    );

    expect(result).toMatchObject({ error: "PLAN_REQUIRED" });
    expect(planner.plan).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
  });

  it("returns a typed plan/token on dry-run and applies only through executor", async () => {
    const deletionPlan = plan();
    const planner = {
      plan: vi.fn().mockResolvedValue({
        kind: "planned",
        plan: deletionPlan,
        target: { repository: "/repo", cwd: "/repo" },
        warnings: [],
        stageTimings: [],
      }),
    };
    const executor = vi.fn().mockResolvedValue({
      ok: true,
      status: "deleted",
      repository: "/repo",
      worktree: facts.worktree,
    });
    const runtimeDeps = deps({
      deletionPlanner: planner,
      deletionExecutor: executor,
    });

    const preview = await advWorktreeDelete(
      facts.branch!,
      { dryRun: true },
      runtimeDeps,
    );
    expect(preview).toMatchObject({
      ok: true,
      status: "planned",
      planToken: deletionPlan.token,
      plan: deletionPlan,
    });

    const applied = await advWorktreeDelete(
      facts.branch!,
      {
        planToken: deletionPlan.token,
        approvalEvidence: "user approved exact worktree candidate",
      },
      runtimeDeps,
    );
    expect(applied).toMatchObject({ ok: true, status: "deleted" });
    expect(executor).toHaveBeenCalledTimes(1);
    const [executorInput, executorDeps] = executor.mock.calls[0] as [
      { operation?: unknown },
      { operation?: unknown },
    ];
    expect(executorInput.operation).toBeDefined();
    expect(executorInput.operation).toBe(executorDeps.operation);
  });

  it("rejects blank approval before decoding or executing a plan", async () => {
    const executor = vi.fn();
    const result = await advWorktreeDelete(
      facts.branch!,
      { planToken: plan().token, approvalEvidence: "   " },
      deps({ deletionExecutor: executor }),
    );

    expect(result).toMatchObject({ error: "APPROVAL_REQUIRED" });
    expect(executor).not.toHaveBeenCalled();
  });

  it("maps planner target timeout to a typed terminal result", async () => {
    const planner = {
      plan: vi.fn().mockResolvedValue({
        kind: "deadline",
        stage: "target_resolution",
        message: "target resolution deadline exceeded",
        stageTimings: [],
      }),
    };
    const result = await advWorktreeDelete(
      facts.branch!,
      { dryRun: true },
      deps({ deletionPlanner: planner }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: "DEADLINE_EXCEEDED",
      status: "deadline_exceeded",
      stage: "target_resolution",
    });
  });

  it("does not report an existing worktree as absent when its branch fact is missing", async () => {
    const planner = {
      plan: vi.fn().mockResolvedValue({
        kind: "refused",
        reason: "branch_not_found",
        message: "Git census contains no local branch for change/example.",
        facts,
        target: { repository: "/repo", cwd: "/repo" },
        stageTimings: [],
      }),
    };

    const result = await advWorktreeDelete(
      facts.branch!,
      { dryRun: true },
      deps({ deletionPlanner: planner }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: "INTEGRATION_REQUIRED",
      reason: "branch_not_found",
    });
  });

  it("does not let generic force select archive-owned recovery", async () => {
    const deletionPlan = plan();
    const planner = {
      plan: vi.fn().mockResolvedValue({
        kind: "planned",
        plan: deletionPlan,
        target: { repository: "/repo", cwd: "/repo" },
        warnings: [],
        stageTimings: [],
      }),
    };

    await advWorktreeDelete(
      facts.branch!,
      { dryRun: true, force: true },
      deps({ deletionPlanner: planner }),
    );

    expect(planner.plan).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
    );
    expect(planner.plan.mock.calls[0]?.[0].archiveRecovery).toBeUndefined();
  });
});
