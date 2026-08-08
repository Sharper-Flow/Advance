import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  encodeWorktreeDeletionToken,
  type WorktreeDeletionFacts,
  type WorktreeDeletionPlan,
  type WorktreeDeletionIntegrationProof,
} from "./deletion-contracts";
import {
  executeWorktreeDeletion,
  type WorktreeDeletionExecutorDeps,
} from "./deletion-executor";

const sha = "0123456789abcdef0123456789abcdef01234567";

function fixture(): {
  repository: string;
  worktree: string;
  cwd: string;
  cleanup: () => void;
} {
  const repository = mkdtempSync(join(tmpdir(), "adv-delete-executor-repo-"));
  const worktree = join(repository, "linked");
  mkdirSync(worktree);
  writeFileSync(join(repository, "root"), "root\n");
  return {
    repository,
    worktree,
    cwd: repository,
    cleanup: () => rmSync(repository, { recursive: true, force: true }),
  };
}

function makePlan(input: {
  repository: string;
  worktree: string;
  cwd: string;
  expiresAt?: number;
  facts?: Partial<WorktreeDeletionFacts>;
  integration?: Partial<WorktreeDeletionIntegrationProof>;
}): WorktreeDeletionPlan {
  const facts: WorktreeDeletionFacts = {
    repository: input.repository,
    worktree: input.worktree,
    branch: "release/v1",
    head: sha,
    detached: false,
    bare: false,
    locked: false,
    prunable: false,
    dirty: false,
    mainWorktree: false,
    cwd: input.cwd,
    cwdInsideWorktree: false,
    inUse: false,
    gitCorrupt: false,
    ...input.facts,
  };
  const integration: WorktreeDeletionIntegrationProof = {
    kind: "merged_to_default",
    branch: facts.branch ?? "release/v1",
    defaultBranch: "trunk",
    head: facts.head,
    evidence: "test merge proof",
    ...input.integration,
  };
  const expiresAt = input.expiresAt ?? Date.now() + 60_000;
  return {
    version: "wdp1",
    repository: input.repository,
    facts,
    expiresAt,
    integration,
    token: encodeWorktreeDeletionToken({ facts, expiresAt, integration }),
  };
}

function depsFor(
  fx: ReturnType<typeof fixture>,
  plan: WorktreeDeletionPlan,
  overrides: Partial<WorktreeDeletionExecutorDeps> = {},
): WorktreeDeletionExecutorDeps {
  const lease = {
    owned: true as const,
    ownerPid: process.pid,
    workerId: "test-worker",
    ownerToken: "test-owner",
    lockPath: join(fx.repository, "lease"),
  };
  return {
    repository: fx.repository,
    repositoryLeaseDir: fx.repository,
    cwd: fx.cwd,
    acquireLease: vi.fn(async () => lease),
    releaseLease: vi.fn(async () => undefined),
    census: vi.fn(async () => {
      if (!exists(fx.worktree)) return { branches: [], worktrees: [] };
      return {
        branches: [{ branch: "release/v1", headSha: sha, merged: true }],
        worktrees: [
          {
            path: fx.repository,
            headSha: sha,
            dirty: false,
            detached: false,
            bare: false,
            locked: false,
            prunable: false,
          },
          {
            path: fx.worktree,
            branch: "release/v1",
            headSha: sha,
            dirty: false,
            detached: false,
            bare: false,
            locked: false,
            prunable: false,
          },
        ],
      };
    }),
    runProcess: vi.fn(async (input) => {
      if (input.args?.includes("remove"))
        rmSync(fx.worktree, { recursive: true, force: true });
      return {
        stdout: "",
        stderr: "",
        exitCode: 0,
        signal: null,
        timedOut: false,
        aborted: false,
        closed: true,
      };
    }),
    ...overrides,
  };
}

function exists(path: string): boolean {
  return resolve(path) === resolve(path) && existsSync(path);
}

describe("WorktreeDeletionExecutor", () => {
  it("deletes only after locked revalidation and confirms Git/filesystem absence", async () => {
    const fx = fixture();
    try {
      const plan = makePlan(fx);
      const deps = depsFor(fx, plan);
      const result = await executeWorktreeDeletion({ plan }, deps);

      expect(result).toMatchObject({
        ok: true,
        status: "deleted",
        repository: fx.repository,
        worktree: fx.worktree,
      });
      expect(deps.acquireLease).toHaveBeenCalledTimes(1);
      expect(deps.runProcess).toHaveBeenCalledTimes(1);
      expect(exists(fx.worktree)).toBe(false);
    } finally {
      fx.cleanup();
    }
  });

  it("refuses when the planned patch-equivalence proof changes at apply time", async () => {
    const fx = fixture();
    try {
      const plan = makePlan(fx, {
        integration: { kind: "patch_equivalent" },
      });
      const deps = depsFor(fx, plan, {
        integrationProof: vi.fn(async () => ({
          kind: "merged_to_default" as const,
          branch: "release/v1",
          defaultBranch: "trunk",
          head: sha,
          evidence: "ancestry proof after plan",
        })),
      });
      const result = await executeWorktreeDeletion({ plan }, deps);
      expect(result).toMatchObject({
        ok: false,
        status: "drifted",
        reason: "integration_proof_changed",
      });
      expect(deps.runProcess).not.toHaveBeenCalled();
    } finally {
      fx.cleanup();
    }
  });

  it.each([
    ["head", { head: "fedcba9876543210fedcba9876543210fedcba98" }],
    ["dirty", { dirty: true }],
    ["locked", { locked: true }],
    ["prunable", { prunable: true }],
    ["cwd", { cwdInsideWorktree: true }],
    ["process", { inUse: true }],
    ["branch", { branch: "release/other" }],
  ] as const)(
    "refuses %s drift without running remove",
    async (_name, changed) => {
      const fx = fixture();
      try {
        const plan = makePlan(fx);
        const mutation = changed as Record<string, unknown>;
        const deps = depsFor(fx, plan, {
          census: vi.fn(async () => ({
            branches: [
              {
                branch: (mutation.branch as string | undefined) ?? "release/v1",
                headSha: (mutation.head as string | undefined) ?? sha,
                merged: true,
              },
            ],
            worktrees: [
              {
                path: fx.repository,
                headSha: sha,
                dirty: false,
                detached: false,
                bare: false,
                locked: false,
                prunable: false,
              },
              {
                path: fx.worktree,
                branch: (mutation.branch as string | undefined) ?? "release/v1",
                headSha: (mutation.head as string | undefined) ?? sha,
                dirty: (mutation.dirty as boolean | undefined) ?? false,
                detached: false,
                bare: false,
                locked: (mutation.locked as boolean | undefined) ?? false,
                prunable: (mutation.prunable as boolean | undefined) ?? false,
              },
            ],
          })),
          isWorktreeInUse: () => mutation.inUse === true,
          cwd: mutation.cwdInsideWorktree ? fx.worktree : fx.cwd,
        });
        const result = await executeWorktreeDeletion({ plan }, deps);
        expect(result.status).toBe("drifted");
        expect(deps.runProcess).not.toHaveBeenCalled();
        expect(exists(fx.worktree)).toBe(true);
      } finally {
        fx.cleanup();
      }
    },
  );

  it("returns busy for a live repository owner and never runs Git", async () => {
    const fx = fixture();
    try {
      const plan = makePlan(fx);
      const deps = depsFor(fx, plan, {
        acquireLease: vi.fn(async () => ({
          owned: false as const,
          ownerPid: process.pid,
          workerId: "peer",
          lockPath: join(fx.repository, "lease"),
          reason: "lock_held_by_alive_pid" as const,
        })),
      });
      const result = await executeWorktreeDeletion({ plan }, deps);
      expect(result).toMatchObject({ ok: false, status: "busy" });
      expect(deps.runProcess).not.toHaveBeenCalled();
    } finally {
      fx.cleanup();
    }
  });

  it("requires repository-lock repair when lease acquisition fails", async () => {
    const fx = fixture();
    try {
      const plan = makePlan(fx);
      const deps = depsFor(fx, plan, {
        acquireLease: vi.fn(async () => {
          throw new Error("state directory is unavailable");
        }),
      });
      const result = await executeWorktreeDeletion({ plan }, deps);

      expect(result).toMatchObject({
        ok: false,
        status: "repair_required",
        reason: "repository_lease_unavailable",
        stage: "lease",
      });
      expect(deps.runProcess).not.toHaveBeenCalled();
      expect(exists(fx.worktree)).toBe(true);
    } finally {
      fx.cleanup();
    }
  });

  it("returns already_absent only when Git and filesystem agree", async () => {
    const fx = fixture();
    try {
      rmSync(fx.worktree, { recursive: true, force: true });
      const plan = makePlan(fx);
      const deps = depsFor(fx, plan);
      const result = await executeWorktreeDeletion({ plan }, deps);
      expect(result).toMatchObject({ ok: false, status: "already_absent" });
      expect(deps.runProcess).not.toHaveBeenCalled();
    } finally {
      fx.cleanup();
    }
  });

  it("serializes concurrent applies so exactly one removal process runs", async () => {
    const fx = fixture();
    let held = false;
    let removals = 0;
    try {
      const plan = makePlan(fx);
      const acquire = vi.fn(async () => {
        if (held)
          return {
            owned: false as const,
            ownerPid: process.pid,
            workerId: "peer",
            lockPath: join(fx.repository, "lease"),
            reason: "lock_held_by_alive_pid" as const,
          };
        held = true;
        return {
          owned: true as const,
          ownerPid: process.pid,
          workerId: "owner",
          ownerToken: "owner-token",
          lockPath: join(fx.repository, "lease"),
        };
      });
      const release = vi.fn(async () => {
        held = false;
      });
      const runProcess = vi.fn(async (input) => {
        if (input.args?.includes("remove")) {
          removals += 1;
          await new Promise((resolve) => setTimeout(resolve, 10));
          rmSync(fx.worktree, { recursive: true, force: true });
        }
        return {
          stdout: "",
          stderr: "",
          exitCode: 0,
          signal: null,
          timedOut: false,
          aborted: false,
          closed: true,
        };
      });
      const shared = {
        ...depsFor(fx, plan),
        acquireLease: acquire,
        releaseLease: release,
        runProcess,
      };
      const [first, second] = await Promise.all([
        executeWorktreeDeletion({ plan }, shared),
        executeWorktreeDeletion({ plan }, shared),
      ]);
      expect(removals).toBe(1);
      expect([first.status, second.status].sort()).toEqual(["busy", "deleted"]);
    } finally {
      fx.cleanup();
    }
  });

  it("reports indeterminate for a Git/filesystem half-state after remove", async () => {
    const fx = fixture();
    try {
      const plan = makePlan(fx);
      const deps = depsFor(fx, plan, {
        runProcess: vi.fn(async () => ({
          stdout: "",
          stderr: "",
          exitCode: 0,
          signal: null,
          timedOut: false,
          aborted: false,
          closed: true,
        })),
      });
      const result = await executeWorktreeDeletion({ plan }, deps);
      expect(result).toMatchObject({
        ok: false,
        status: "indeterminate",
        reason: "git_removal_not_confirmed",
      });
      expect(exists(fx.worktree)).toBe(true);
    } finally {
      fx.cleanup();
    }
  });

  it("rechecks hook mutations and treats reconciliation failure as a warning after deletion", async () => {
    const fx = fixture();
    try {
      const plan = makePlan(fx);
      let scans = 0;
      const deps = depsFor(fx, plan, {
        hooks: ["touch hook-ran"],
        census: vi.fn(async () => {
          scans += 1;
          if (scans === 2)
            return {
              branches: [{ branch: "release/v1", headSha: sha, merged: true }],
              worktrees: [
                {
                  path: fx.worktree,
                  branch: "release/v1",
                  headSha: sha,
                  dirty: true,
                  detached: false,
                  bare: false,
                  locked: false,
                  prunable: false,
                },
              ],
            };
          return {
            branches: [{ branch: "release/v1", headSha: sha, merged: true }],
            worktrees: [
              {
                path: fx.repository,
                headSha: sha,
                dirty: false,
                detached: false,
                bare: false,
                locked: false,
                prunable: false,
              },
              {
                path: fx.worktree,
                branch: "release/v1",
                headSha: sha,
                dirty: false,
                detached: false,
                bare: false,
                locked: false,
                prunable: false,
              },
            ],
          };
        }),
      });
      const hookResult = await executeWorktreeDeletion({ plan }, deps);
      expect(hookResult.status).toBe("drifted");
      expect(deps.runProcess).toHaveBeenCalledTimes(1);
      expect(exists(fx.worktree)).toBe(true);

      const cleanPlan = makePlan(fx);
      const cleanDeps = depsFor(fx, cleanPlan, {
        reconcileAfterDeletion: vi.fn(async () => {
          throw new Error("state store unavailable");
        }),
      });
      const deleted = await executeWorktreeDeletion(
        { plan: cleanPlan },
        cleanDeps,
      );
      expect(deleted).toMatchObject({ ok: true, status: "deleted" });
      expect(deleted.warning).toMatch(/reconciliation failed/);
    } finally {
      fx.cleanup();
    }
  });

  it("terminates the destructive process path before returning a deadline result", async () => {
    const fx = fixture();
    try {
      const plan = makePlan(fx);
      const deps = depsFor(fx, plan, {
        budgetMs: 1_000,
        runProcess: vi.fn(async () => ({
          stdout: "",
          stderr: "",
          exitCode: null,
          signal: "SIGKILL",
          timedOut: true,
          aborted: true,
          closed: true,
        })),
      });
      const result = await executeWorktreeDeletion({ plan }, deps);
      expect(result).toMatchObject({ ok: false, status: "deadline_exceeded" });
      expect(exists(fx.worktree)).toBe(true);
    } finally {
      fx.cleanup();
    }
  });
});
