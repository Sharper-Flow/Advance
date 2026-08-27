import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { stableStringify } from "../../utils/digest";

import {
  encodeWorktreeDeletionToken,
  type WorktreeDeletionFacts,
  type WorktreeDeletionPlan,
  type WorktreeDeletionIntegrationProof,
} from "./deletion-contracts";
import {
  createWorktreeBeforeRemoveStage,
  createWorktreeReconciliationStage,
  executeWorktreeDeletion,
  type WorktreeDeletionExecutorDeps,
  type WorktreeBeforeRemoveStage,
} from "./deletion-executor";
import {
  acquireGitWorktreeProcessLease,
  GitWorktreeFlockUnsupportedError,
  resolveGitWorktreeLeaseDir,
} from "../../utils/git-worktree-flock";
import { createWorktreeOperationContext } from "../../utils/worktree-operation";

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
  execFileSync("git", ["init", "-q", "-b", "trunk"], { cwd: repository });
  execFileSync("git", ["add", "root"], { cwd: repository });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=ADV test",
      "-c",
      "user.email=adv@example.test",
      "commit",
      "-qm",
      "fixture",
    ],
    { cwd: repository },
  );
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

      const repeated = await executeWorktreeDeletion({ plan }, deps);
      expect(repeated).toMatchObject({
        ok: false,
        status: "already_absent",
      });
      expect(deps.runProcess).toHaveBeenCalledTimes(1);
    } finally {
      fx.cleanup();
    }
  });

  it("revalidates archive-owned paths and uses the inverse PR ancestry", async () => {
    const fx = fixture();
    try {
      const content = Buffer.from("canonical\n");
      const filePath = join(
        fx.worktree,
        ".adv",
        "archive",
        "example",
        "docs",
        "specs",
        "a.md",
      );
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, content);
      const canonicalFilePath = join(
        fx.repository,
        ".adv",
        "archive",
        "example",
        "docs",
        "specs",
        "a.md",
      );
      mkdirSync(dirname(canonicalFilePath), { recursive: true });
      writeFileSync(canonicalFilePath, content);
      const fileHash = createHash("sha256").update(content).digest("hex");
      const prHead = "fedcba9876543210fedcba9876543210fedcba98";
      const merge = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
      const terminal = {
        changeId: "example",
        status: "archived" as const,
        evidence: "terminal proof",
      };
      const integration: WorktreeDeletionIntegrationProof = {
        kind: "pr_merged",
        branch: "change/example",
        defaultBranch: "trunk",
        head: sha,
        evidence: "merged PR #42",
        prNumber: 42,
        prHeadOid: prHead,
        mergeCommitOid: merge,
        headRepository: "owner/repo",
        baseRepository: "owner/repo",
      };
      const facts: WorktreeDeletionFacts = {
        repository: fx.repository,
        worktree: fx.worktree,
        branch: "change/example",
        head: sha,
        detached: false,
        bare: false,
        locked: false,
        prunable: false,
        dirty: false,
        mainWorktree: false,
        cwd: fx.cwd,
        cwdInsideWorktree: false,
        inUse: false,
        gitCorrupt: false,
      };
      const archiveRecovery = {
        changeId: "example",
        repository: fx.repository,
        branch: "change/example",
        worktree: fx.worktree,
        localHead: sha,
        prNumber: 42,
        prRepository: "owner/repo",
        prHeadOid: prHead,
        mergeCommitOid: merge,
        defaultBranch: "trunk",
        defaultBranchSha: merge,
        ancestry: "pr_head_ancestor_of_local_head" as const,
        bundleId: "example",
        canonicalBundlePath: join(fx.repository, ".adv", "archive", "example"),
        changedPaths: [
          {
            path: ".adv/archive/example/docs/specs/a.md",
            status: "M" as const,
          },
        ],
        canonicalFiles: [
          { path: ".adv/archive/example/docs/specs/a.md", sha256: fileHash },
        ],
        canonicalIdentity: createHash("sha256")
          .update(
            stableStringify({
              bundleId: "example",
              canonicalFiles: [
                {
                  path: ".adv/archive/example/docs/specs/a.md",
                  sha256: fileHash,
                },
              ],
            }),
          )
          .digest("hex"),
        allowedRoot: ".adv/archive/example",
        clean: true,
        locked: false,
        cwd: fx.cwd,
        cwdInsideWorktree: false,
        inUse: false,
        terminal,
      };
      const expiresAt = Date.now() + 60_000;
      const plan: WorktreeDeletionPlan = {
        version: "wdp1",
        repository: fx.repository,
        facts,
        expiresAt,
        integration,
        terminal,
        removalMode: "archive_owned_projection",
        archiveRecovery,
        token: encodeWorktreeDeletionToken({
          facts,
          expiresAt,
          integration,
          terminal,
          removalMode: "archive_owned_projection",
          archiveRecovery,
        }),
      };
      const deps = depsFor(fx, plan, {
        census: vi.fn(async () => {
          if (!exists(fx.worktree)) return { branches: [], worktrees: [] };
          return {
            branches: [
              { branch: "change/example", headSha: sha, merged: false },
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
                branch: "change/example",
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
        terminalProof: async () => terminal,
        runProcess: vi.fn(async (input) => {
          const args = input.args ?? [];
          if (args.includes("status"))
            return {
              stdout: "",
              stderr: "",
              exitCode: 0,
              signal: null,
              timedOut: false,
              aborted: false,
              closed: true,
            };
          if (args.includes("diff"))
            return {
              stdout: "M\0.adv/archive/example/docs/specs/a.md\0",
              stderr: "",
              exitCode: 0,
              signal: null,
              timedOut: false,
              aborted: false,
              closed: true,
            };
          if (args[0] === "rev-parse")
            return {
              stdout: args.some((arg) => arg.includes("FETCH_HEAD"))
                ? prHead
                : args.some((arg) => arg.includes("refs/remotes/origin"))
                  ? merge
                  : sha,
              stderr: "",
              exitCode: 0,
              signal: null,
              timedOut: false,
              aborted: false,
              closed: true,
            };
          if (args[0] === "config")
            return {
              stdout: "https://github.com/owner/repo.git",
              stderr: "",
              exitCode: 0,
              signal: null,
              timedOut: false,
              aborted: false,
              closed: true,
            };
          if (args[0] === "symbolic-ref")
            return {
              stdout: "origin/trunk",
              stderr: "",
              exitCode: 0,
              signal: null,
              timedOut: false,
              aborted: false,
              closed: true,
            };
          if (args[0] === "merge-base")
            return {
              stdout: "",
              stderr: "",
              exitCode: 0,
              signal: null,
              timedOut: false,
              aborted: false,
              closed: true,
            };
          if (args[0] === "fetch")
            return {
              stdout: "",
              stderr: "",
              exitCode: 0,
              signal: null,
              timedOut: false,
              aborted: false,
              closed: true,
            };
          if (args.includes("remove"))
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
      });

      const result = await executeWorktreeDeletion({ plan }, deps);

      expect(result).toMatchObject({ ok: true, status: "deleted" });
      const calls = (deps.runProcess as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some(([input]) => input.args?.includes("--force"))).toBe(
        false,
      );
      expect(
        calls.some(
          ([input]) =>
            input.args?.[0] === "merge-base" &&
            input.args?.[2] === prHead &&
            input.args?.[3] === sha,
        ),
      ).toBe(true);
    } finally {
      fx.cleanup();
    }
  });

  it("uses a kernel process lease for the production executor path", async () => {
    const fx = fixture();
    try {
      const plan = makePlan(fx);
      const result = await executeWorktreeDeletion(
        { plan },
        depsFor(fx, plan, {
          repositoryLeaseDir: undefined,
          acquireLease: undefined,
          releaseLease: undefined,
        }),
      );

      expect(result).toMatchObject({ ok: true, status: "deleted" });
      const leaseDir = await resolveGitWorktreeLeaseDir(fx.repository);
      expect(existsSync(join(leaseDir, "git-worktree.lock"))).toBe(true);
      expect(
        execFileSync("git", ["status", "--short"], {
          cwd: fx.repository,
          encoding: "utf8",
        }),
      ).toBe("");
    } finally {
      fx.cleanup();
    }
  });

  it("migrates an unlocked legacy lock only through deletion", async () => {
    const fx = fixture();
    try {
      const legacyPath = join(fx.repository, ".adv", "git-worktree.lock");
      mkdirSync(join(fx.repository, ".adv"), { recursive: true });
      writeFileSync(legacyPath, "");
      const plan = makePlan(fx);
      const result = await executeWorktreeDeletion(
        { plan },
        depsFor(fx, plan, {
          repositoryLeaseDir: undefined,
          acquireLease: undefined,
          releaseLease: undefined,
        }),
      );
      expect(result).toMatchObject({ ok: true, status: "deleted" });
      expect(existsSync(legacyPath)).toBe(false);
      expect(
        execFileSync("git", ["status", "--short"], {
          cwd: fx.repository,
          encoding: "utf8",
        }),
      ).toBe("");
    } finally {
      fx.cleanup();
    }
  });

  it("refuses held and malformed legacy locks with typed repair reasons", async () => {
    for (const mode of ["held", "malformed"] as const) {
      const fx = fixture();
      let holder:
        | Awaited<ReturnType<typeof acquireGitWorktreeProcessLease>>
        | undefined;
      try {
        const legacyDir = join(fx.repository, ".adv");
        const legacyPath = join(legacyDir, "git-worktree.lock");
        mkdirSync(legacyDir, { recursive: true });
        writeFileSync(legacyPath, mode === "held" ? "" : '{"unexpected":true}');
        if (mode === "held") {
          holder = await acquireGitWorktreeProcessLease(legacyDir);
          if (!holder.owned) throw new Error("legacy holder was not acquired");
        }
        const plan = makePlan(fx);
        const result = await executeWorktreeDeletion(
          { plan },
          depsFor(fx, plan, {
            repositoryLeaseDir: undefined,
            acquireLease: undefined,
            releaseLease: undefined,
          }),
        );
        expect(result).toMatchObject({
          ok: false,
          status: "repair_required",
          reason: `legacy_lock_${mode}`,
          stage: "lease",
        });
        expect(existsSync(legacyPath)).toBe(true);
        expect(exists(fx.worktree)).toBe(true);
      } finally {
        if (holder?.owned) await holder.terminate("test");
        fx.cleanup();
      }
    }
  });

  it("makes concurrent production applies mutually exclusive through flock", async () => {
    const fx = fixture();
    try {
      const plan = makePlan(fx);
      let censusStarted!: () => void;
      const censusReady = new Promise<void>((resolve) => {
        censusStarted = resolve;
      });
      const firstDeps = depsFor(fx, plan, {
        acquireLease: undefined,
        releaseLease: undefined,
      });
      const originalCensus = firstDeps.census!;
      firstDeps.census = async (...args) => {
        censusStarted();
        await new Promise((resolve) => setTimeout(resolve, 100));
        return originalCensus(...args);
      };

      const firstPromise = executeWorktreeDeletion({ plan }, firstDeps);
      await censusReady;
      const second = await executeWorktreeDeletion(
        { plan },
        depsFor(fx, plan, {
          acquireLease: undefined,
          releaseLease: undefined,
        }),
      );
      expect(second).toMatchObject({
        ok: false,
        status: "busy",
        reason: "repository_lease_held",
      });
      await expect(firstPromise).resolves.toMatchObject({
        ok: true,
        status: "deleted",
      });
    } finally {
      fx.cleanup();
    }
  });

  it("returns unsupported when the flock holder command is unavailable", async () => {
    const fx = fixture();
    try {
      const plan = makePlan(fx);
      const result = await executeWorktreeDeletion(
        { plan },
        depsFor(fx, plan, {
          acquireLease: async () => {
            throw new GitWorktreeFlockUnsupportedError(
              "flock holder command is unavailable",
            );
          },
        }),
      );

      expect(result).toMatchObject({
        ok: false,
        status: "unsupported",
        reason: "kernel_flock_unavailable",
        stage: "lease",
      });
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
        reconcileAfterDeletion: createWorktreeReconciliationStage(async () => {
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

  it("awaits a late lease settlement and releases an owned lock before responding", async () => {
    const fx = fixture();
    let resolveLease!: (
      value: Awaited<
        ReturnType<NonNullable<WorktreeDeletionExecutorDeps["acquireLease"]>>
      >,
    ) => void;
    const lease = {
      owned: true as const,
      ownerPid: process.pid,
      workerId: "late-owner",
      ownerToken: "late-owner-token",
      lockPath: join(fx.repository, "lease"),
    };
    try {
      const plan = makePlan(fx);
      const operation = createWorktreeOperationContext({
        budgetMs: 500,
        responseReserveMs: 50,
      });
      const acquireLease = vi.fn(
        () =>
          new Promise<
            Awaited<
              ReturnType<
                NonNullable<WorktreeDeletionExecutorDeps["acquireLease"]>
              >
            >
          >((resolve) => {
            resolveLease = resolve;
          }),
      );
      const releaseLease = vi.fn(async () => undefined);
      const resultPromise = executeWorktreeDeletion(
        { plan, operation },
        depsFor(fx, plan, { acquireLease, releaseLease }),
      );

      await expect(resultPromise).resolves.toMatchObject({
        ok: false,
        status: "deadline_exceeded",
        stage: "lease",
      });
      resolveLease(lease);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(releaseLease).not.toHaveBeenCalled();
    } finally {
      fx.cleanup();
    }
  });

  it("awaits late beforeRemove settlement and never removes after cancellation", async () => {
    const fx = fixture();
    let resolveBeforeRemove!: (value: { ok: true }) => void;
    let beforeRemoveSignal!: AbortSignal;
    let lateMutation = false;
    try {
      const plan = makePlan(fx);
      const operation = createWorktreeOperationContext({
        budgetMs: 500,
        responseReserveMs: 50,
      });
      const beforeRemove = createWorktreeBeforeRemoveStage(
        ({ signal }) =>
          new Promise<{ ok: true }>((resolve) => {
            beforeRemoveSignal = signal;
            resolveBeforeRemove = (value) => {
              if (!signal.aborted) lateMutation = true;
              resolve(value);
            };
          }),
      );
      const deps = depsFor(fx, plan, {
        beforeRemove,
      });
      const resultPromise = executeWorktreeDeletion({ plan, operation }, deps);

      await expect(resultPromise).resolves.toMatchObject({
        ok: false,
        status: "deadline_exceeded",
        stage: "before_remove",
      });
      expect(beforeRemoveSignal.aborted).toBe(true);
      resolveBeforeRemove({ ok: true });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(lateMutation).toBe(false);
      expect(deps.runProcess).not.toHaveBeenCalled();
      expect(exists(fx.worktree)).toBe(true);
    } finally {
      fx.cleanup();
    }
  });

  it("rejects an unbranded beforeRemove callback before invocation", async () => {
    const fx = fixture();
    const callback = vi.fn(async () => ({ ok: true as const }));
    try {
      const plan = makePlan(fx);
      const result = await executeWorktreeDeletion(
        { plan },
        depsFor(fx, plan, {
          beforeRemove: callback as unknown as WorktreeBeforeRemoveStage,
        }),
      );

      expect(result).toMatchObject({
        ok: false,
        status: "repair_required",
        reason: "uncooperative_before_remove",
      });
      expect(callback).not.toHaveBeenCalled();
    } finally {
      fx.cleanup();
    }
  });

  it("returns a typed post-census deadline before a held census is released", async () => {
    const fx = fixture();
    let releaseCensus!: (
      value: Awaited<
        ReturnType<NonNullable<WorktreeDeletionExecutorDeps["census"]>>
      >,
    ) => void;
    const reconcileRun = vi.fn(async () => undefined);
    try {
      const plan = makePlan(fx);
      const operation = createWorktreeOperationContext({
        budgetMs: 500,
        responseReserveMs: 50,
      });
      const deps = depsFor(fx, plan, {
        census: vi.fn(
          () =>
            new Promise<
              Awaited<
                ReturnType<NonNullable<WorktreeDeletionExecutorDeps["census"]>>
              >
            >((resolve) => {
              releaseCensus = resolve;
            }),
        ),
        reconcileAfterDeletion: createWorktreeReconciliationStage(reconcileRun),
      });
      const resultPromise = executeWorktreeDeletion({ plan, operation }, deps);

      await expect(resultPromise).resolves.toMatchObject({
        ok: false,
        status: "deadline_exceeded",
        stage: "census",
      });
      releaseCensus({ branches: [], worktrees: [] });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(reconcileRun).not.toHaveBeenCalled();
      expect(exists(fx.worktree)).toBe(true);
    } finally {
      fx.cleanup();
    }
  });

  it("returns indeterminate after Git removal when post-delete census is held", async () => {
    const fx = fixture();
    let calls = 0;
    let releasePostDeleteCensus!: (value: {
      branches: { branch: string; headSha: string; merged: boolean }[];
      worktrees: never[];
    }) => void;
    const reconcileRun = vi.fn(async () => undefined);
    try {
      const plan = makePlan(fx);
      const operation = createWorktreeOperationContext({
        budgetMs: 500,
        responseReserveMs: 50,
      });
      const base = depsFor(fx, plan);
      const normalCensus = base.census!;
      const deps: WorktreeDeletionExecutorDeps = {
        ...base,
        census: vi.fn((...args) => {
          calls += 1;
          if (calls === 3)
            return new Promise<{
              branches: { branch: string; headSha: string; merged: boolean }[];
              worktrees: never[];
            }>((resolve) => {
              releasePostDeleteCensus = resolve;
            });
          return normalCensus(...args);
        }),
        reconcileAfterDeletion: createWorktreeReconciliationStage(reconcileRun),
      };

      const resultPromise = executeWorktreeDeletion({ plan, operation }, deps);
      await expect(resultPromise).resolves.toMatchObject({
        ok: false,
        status: "indeterminate",
        reason: "post_delete_census_deadline_exceeded",
        stage: "post_delete_census",
      });
      expect(exists(fx.worktree)).toBe(false);
      expect(reconcileRun).not.toHaveBeenCalled();

      releasePostDeleteCensus({ branches: [], worktrees: [] });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(reconcileRun).not.toHaveBeenCalled();
    } finally {
      fx.cleanup();
    }
  });

  it("returns deleted with an awaited reconciliation warning before a held stage is released", async () => {
    const fx = fixture();
    let releaseReconciliation!: () => void;
    let reconciliationSignal!: AbortSignal;
    let lateMutation = false;
    try {
      const plan = makePlan(fx);
      const operation = createWorktreeOperationContext({
        budgetMs: 500,
        responseReserveMs: 50,
      });
      const reconciliation = createWorktreeReconciliationStage(
        ({ signal }) =>
          new Promise<void>((resolve) => {
            reconciliationSignal = signal;
            releaseReconciliation = () => {
              if (!signal.aborted) lateMutation = true;
              resolve();
            };
          }),
      );
      const deps = depsFor(fx, plan, {
        reconcileAfterDeletion: reconciliation,
      });
      const resultPromise = executeWorktreeDeletion({ plan, operation }, deps);

      const result = await resultPromise;
      expect(result).toMatchObject({ ok: true, status: "deleted" });
      expect(result.warning).toMatch(/reconciliation deadline exceeded/);
      expect(reconciliationSignal.aborted).toBe(true);
      releaseReconciliation();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(lateMutation).toBe(false);
    } finally {
      fx.cleanup();
    }
  });

  it("surfaces lease quiescence failure instead of claiming a deadline barrier", async () => {
    const fx = fixture();
    try {
      const plan = makePlan(fx);
      const operation = createWorktreeOperationContext({
        budgetMs: 500,
        responseReserveMs: 50,
      });
      const terminate = vi.fn(async () => {
        throw new Error("process group remained alive");
      });
      const acquireLease = vi.fn(
        async (_dir: string, options?: { operation?: typeof operation }) => {
          options?.operation?.registerChildLease({ terminate });
          return {
            owned: true as const,
            ownerPid: process.pid,
            ownerToken: "quiescence-failure",
            lockPath: join(fx.repository, "lease"),
            process: undefined as never,
            settled: Promise.resolve(),
            terminate,
          };
        },
      );
      const deps = depsFor(fx, plan, {
        acquireLease,
        census: vi.fn(
          () =>
            new Promise<
              Awaited<
                ReturnType<NonNullable<WorktreeDeletionExecutorDeps["census"]>>
              >
            >(() => undefined),
        ),
      });

      await expect(
        executeWorktreeDeletion({ plan, operation }, deps),
      ).resolves.toMatchObject({
        ok: false,
        status: "indeterminate",
        reason: "operation_quiescence_failed",
      });
      expect(terminate).toHaveBeenCalled();
      expect(deps.runProcess).not.toHaveBeenCalled();
    } finally {
      fx.cleanup();
    }
  });

  it("surfaces a held lease termination failure before reporting a deadline", async () => {
    const fx = fixture();
    try {
      const plan = makePlan(fx);
      const operation = createWorktreeOperationContext({
        budgetMs: 500,
        responseReserveMs: 50,
      });
      const terminate = vi.fn(async () => {
        throw new Error("held lease process group remained alive");
      });
      const acquireLease = vi.fn(
        (_dir: string, options?: { operation?: typeof operation }) => {
          options?.operation?.registerChildLease({ terminate });
          return new Promise<
            Awaited<
              ReturnType<
                NonNullable<WorktreeDeletionExecutorDeps["acquireLease"]>
              >
            >
          >(() => undefined);
        },
      );

      await expect(
        executeWorktreeDeletion(
          { plan, operation },
          depsFor(fx, plan, { acquireLease }),
        ),
      ).resolves.toMatchObject({
        ok: false,
        status: "indeterminate",
        reason: "operation_quiescence_failed",
        stage: "lease",
      });
      expect(terminate).toHaveBeenCalled();
    } finally {
      fx.cleanup();
    }
  });
});
