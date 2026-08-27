import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  WorktreeDeletionPlanner,
  type WorktreeDeletionPlanResult,
} from "./deletion-planner";
import { decodeWorktreeDeletionToken } from "./deletion-contracts";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function makeFixture(): {
  root: string;
  worktree: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), "adv-deletion-planner-"));
  const worktree = `${root}-linked`;
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "test@example.invalid");
  git(root, "config", "user.name", "ADV test");
  execFileSync("touch", [join(root, "README.md")]);
  git(root, "add", ".");
  git(root, "commit", "-m", "initial");
  git(root, "worktree", "add", "-b", "release/v1", worktree);
  git(worktree, "config", "user.email", "test@example.invalid");
  git(worktree, "config", "user.name", "ADV test");
  git(worktree, "commit", "--allow-empty", "-m", "release");
  git(root, "merge", "--ff-only", "release/v1");
  return {
    root,
    worktree,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe("WorktreeDeletionPlanner", () => {
  it("plans an unregistered merged release worktree from the Git census", async () => {
    const fixture = makeFixture();
    try {
      const result = await new WorktreeDeletionPlanner().plan({
        repository: fixture.root,
        branch: "release/v1",
        cwd: fixture.root,
        registry: [],
      });

      expect(result.kind).toBe("planned");
      if (result.kind === "planned") {
        expect(result.plan.facts.worktree).toBe(fixture.worktree);
        expect(result.plan.facts.branch).toBe("release/v1");
        expect(result.warnings).toContain("registry_absent");
        expect(result.plan.token).toMatch(/^wdp1\./);
        expect(decodeWorktreeDeletionToken(result.plan.token).facts).toEqual(
          result.plan.facts,
        );
        expect(
          decodeWorktreeDeletionToken(result.plan.token).integration,
        ).toEqual(result.plan.integration);
        expect(result.stageTimings.length).toBeGreaterThan(0);
      }
    } finally {
      fixture.cleanup();
    }
  });

  it("plans a squash-equivalent release branch from two all-minus cherry lines", async () => {
    const root = mkdtempSync(join(tmpdir(), "adv-deletion-planner-squash-"));
    const worktree = `${root}-linked`;
    try {
      git(root, "init", "-b", "trunk");
      git(root, "config", "user.email", "test@example.invalid");
      git(root, "config", "user.name", "ADV test");
      execFileSync("touch", [join(root, "README.md")]);
      git(root, "add", ".");
      git(root, "commit", "-m", "initial");
      git(
        root,
        "worktree",
        "add",
        "-b",
        "release/fixPostRemovalRelease",
        worktree,
      );
      writeFileSync(join(worktree, "one.txt"), "one\n");
      git(worktree, "add", ".");
      git(worktree, "commit", "-m", "first release change");
      writeFileSync(join(worktree, "two.txt"), "two\n");
      git(worktree, "add", ".");
      git(worktree, "commit", "-m", "second release change");
      const first = git(worktree, "rev-parse", "HEAD~1");
      const second = git(worktree, "rev-parse", "HEAD");
      git(root, "cherry-pick", "--no-commit", first);
      git(root, "commit", "-m", "squash first release change");
      git(root, "cherry-pick", "--no-commit", second);
      git(root, "commit", "-m", "squash second release change");

      const result = await new WorktreeDeletionPlanner().plan({
        repository: root,
        branch: "release/fixPostRemovalRelease",
        defaultBranch: "trunk",
        cwd: root,
        registry: [],
      });

      expect(result.kind).toBe("planned");
      if (result.kind === "planned")
        expect(result.plan.integration?.kind).toBe("patch_equivalent");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns distinct typed refusal results for hard safety failures", async () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ["main_worktree", { mainWorktree: true }, "main_worktree"],
      ["detached", { detached: true }, "detached_head"],
      ["dirty", { dirty: true }, "dirty_worktree"],
      ["in_use", { inUse: true }, "worktree_in_use"],
      ["locked", { locked: true }, "git_locked"],
      ["prunable", { prunable: true }, "git_prunable"],
      ["corrupt", { corrupt: true }, "git_corrupt"],
    ];

    for (const [, safety, reason] of cases) {
      const result = await new WorktreeDeletionPlanner({
        census: async () => ({
          branches: [
            {
              branch: "release/v1",
              headSha: "0123456789abcdef0123456789abcdef01234567",
              merged: true,
            },
          ],
          worktrees: [
            {
              path: "/repo",
              headSha: "0123456789abcdef0123456789abcdef01234567",
              dirty: false,
              detached: false,
              bare: false,
              locked: false,
              prunable: false,
            },
            {
              path: "/tmp/release-v1",
              branch: "release/v1",
              headSha: "0123456789abcdef0123456789abcdef01234567",
              dirty: false,
              detached: false,
              bare: false,
              locked: false,
              prunable: false,
              ...safety,
            },
          ],
        }),
        targetResolver: async (input) => ({
          repository: input.repository,
          cwd: input.cwd ?? input.repository,
          mainWorktree: safety.mainWorktree === true,
        }),
        isWorktreeInUse: () => safety.inUse === true,
        operationNow: () => Date.now(),
      }).plan({ repository: "/repo", branch: "release/v1", cwd: "/repo" });

      expect(
        result.kind,
        `case ${cases.find((candidate) => candidate[2] === reason)?.[0] ?? reason}`,
      ).toBe("refused");
      if (result.kind === "refused") expect(result.reason).toBe(reason);
    }
  });

  it("refuses missing terminal proof for an unregistered change branch", async () => {
    const result = await new WorktreeDeletionPlanner({
      census: async () => ({
        branches: [
          {
            branch: "change/one",
            headSha: "0123456789abcdef0123456789abcdef01234567",
            merged: true,
          },
        ],
        worktrees: [
          {
            path: "/repo",
            headSha: "0123456789abcdef0123456789abcdef01234567",
            dirty: false,
            detached: false,
            bare: false,
            locked: false,
            prunable: false,
          },
          {
            path: "/tmp/change-one",
            branch: "change/one",
            headSha: "0123456789abcdef0123456789abcdef01234567",
            dirty: false,
            detached: false,
            bare: false,
            locked: false,
            prunable: false,
          },
        ],
      }),
    }).plan({ repository: "/repo", branch: "change/one", cwd: "/repo" });

    expect(result).toMatchObject({
      kind: "refused",
      reason: "terminal_proof_required",
    });
  });

  it("rejects invalid branch and default refs before the Git census", async () => {
    const census = vi.fn(async () => ({ branches: [], worktrees: [] }));
    const planner = new WorktreeDeletionPlanner({ census });

    await expect(
      planner.plan({
        repository: "/repo",
        branch: "release/v1..trunk",
        defaultBranch: "trunk",
      }),
    ).resolves.toMatchObject({ kind: "refused", reason: "invalid_ref" });
    await expect(
      planner.plan({
        repository: "/repo",
        branch: "release/v1",
        defaultBranch: "--upload-pack=evil",
      }),
    ).resolves.toMatchObject({ kind: "refused", reason: "invalid_ref" });
    expect(census).not.toHaveBeenCalled();
  });

  it("returns a deadline result when target resolution consumes the budget", async () => {
    const result = await new WorktreeDeletionPlanner({
      operationNow: () => 1_000,
      targetResolver: async (_input, operation) => {
        operation.startStage("target_resolution", 1_000);
        operation.finishStage("target_resolution", 9_000);
        return { repository: "/repo", cwd: "/repo", mainWorktree: false };
      },
    }).plan({ repository: "/repo", branch: "release/v1", budgetMs: 100 });

    expect(result).toMatchObject({
      kind: "deadline",
      stage: "target_resolution",
    });
  });

  it("bounds a target resolver that never settles", async () => {
    const result = await new WorktreeDeletionPlanner({
      targetResolver: () => new Promise<never>(() => {}),
    }).plan({ repository: "/repo", branch: "release/v1", budgetMs: 10 });

    expect(result).toMatchObject({
      kind: "deadline",
      stage: "target_resolution",
    });
  });

  it("rejects malformed census data as a repair result without touching state", async () => {
    const result = await new WorktreeDeletionPlanner({
      census: async () => ({
        branches: [],
        worktrees: [{ path: "", branch: "release/v1" }] as never,
      }),
    }).plan({ repository: "/repo", branch: "release/v1" });

    expect(result.kind).toBe("repair");
    if (result.kind === "repair")
      expect(result.reason).toBe("malformed_census");
  });

  it("does not initialize an ADV store while resolving a large target", async () => {
    let initialized = false;
    const result = await new WorktreeDeletionPlanner({
      targetResolver: async (input) => ({
        repository: input.repository,
        cwd: input.repository,
        mainWorktree: false,
      }),
      census: async () => ({ branches: [], worktrees: [] }),
      initializeStore: async () => {
        initialized = true;
        throw new Error("must not be called");
      },
    }).plan({ repository: "/large/repository", branch: "release/v1" });

    expect(initialized).toBe(false);
    expect(result.kind).not.toBe("planned");
  });

  it("preserves a generic timeout as a typed deadline result", async () => {
    const result: WorktreeDeletionPlanResult =
      await new WorktreeDeletionPlanner({
        targetResolver: async () => {
          throw new Error("operation timed out");
        },
      }).plan({ repository: "/repo", branch: "release/v1" });

    expect(result.kind).toBe("deadline");
  });

  it("selects archive-owned recovery only from an explicit proof", async () => {
    const head = "0123456789abcdef0123456789abcdef01234567";
    const prHead = "fedcba9876543210fedcba9876543210fedcba98";
    const terminal = {
      changeId: "example",
      status: "archived" as const,
      evidence: "durable terminal status: archived",
    };
    const archiveRecovery = {
      changeId: "example",
      repository: "/repo",
      branch: "change/example",
      worktree: "/tmp/change-example",
      localHead: head,
      prNumber: 42,
      prRepository: "owner/repo",
      prHeadOid: prHead,
      mergeCommitOid: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      defaultBranch: "trunk",
      defaultBranchSha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      ancestry: "pr_head_ancestor_of_local_head" as const,
      bundleId: "example",
      canonicalBundlePath: "/repo/.adv/archive/example",
      changedPaths: [
        { path: ".adv/archive/example/docs/specs/a.md", status: "M" as const },
      ],
      canonicalFiles: [
        {
          path: ".adv/archive/example/docs/specs/a.md",
          sha256:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
      ],
      canonicalIdentity: "bundle:example:manifest-1",
      allowedRoot: ".adv/archive/example",
      clean: true,
      locked: false,
      cwd: "/repo",
      cwdInsideWorktree: false,
      inUse: false,
      terminal,
    };
    const planner = new WorktreeDeletionPlanner({
      census: async () => ({
        branches: [{ branch: "change/example", headSha: head, merged: false }],
        worktrees: [
          {
            path: "/repo",
            headSha: head,
            dirty: false,
            detached: false,
            bare: false,
            locked: false,
            prunable: false,
          },
          {
            path: "/tmp/change-example",
            branch: "change/example",
            headSha: head,
            dirty: false,
            detached: false,
            bare: false,
            locked: false,
            prunable: false,
          },
        ],
      }),
      targetResolver: async () => ({
        repository: "/repo",
        cwd: "/repo",
        mainWorktree: false,
      }),
      integrationProof: async () => ({
        kind: "pr_merged" as const,
        branch: "change/example",
        defaultBranch: "trunk",
        head,
        evidence: "merged PR #42",
        prNumber: 42,
        prHeadOid: prHead,
        mergeCommitOid: archiveRecovery.mergeCommitOid,
        headRepository: "owner/repo",
        baseRepository: "owner/repo",
      }),
      terminalProof: async () => terminal,
      isWorktreeInUse: () => false,
    });
    const result = await planner.plan({
      repository: "/repo",
      branch: "change/example",
      changeId: "example",
      cwd: "/repo",
      archiveRecovery,
    });

    expect(result.kind).toBe("planned");
    if (result.kind === "planned") {
      expect(result.plan.removalMode).toBe("archive_owned_projection");
      expect(result.plan.archiveRecovery).toEqual(archiveRecovery);
    }

    const invalid = await planner.plan({
      repository: "/repo",
      branch: "change/example",
      changeId: "example",
      cwd: "/repo",
      archiveRecovery: {
        ...archiveRecovery,
        worktree: "/tmp/different-worktree",
      },
    });
    expect(invalid).toMatchObject({
      kind: "refused",
      reason: "archive_recovery_invalid",
    });
  });
});
