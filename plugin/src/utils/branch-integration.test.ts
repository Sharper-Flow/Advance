/**
 * Unit tests for Branch Integration Gate (T29).
 *
 * Pure unit tests — all external dependencies (Temporal, git) are injected.
 */

import { describe, expect, it, vi } from "vitest";
import {
  LocalBranchIntegrationDeadline,
  proveLocalBranchIntegration,
  verifyBranchIntegration,
  type BranchIntegrationDeps,
} from "./branch-integration";
import { createWorktreeOperationContext } from "./worktree-operation";

function makeDeps(
  overrides: Partial<BranchIntegrationDeps> = {},
): BranchIntegrationDeps {
  return {
    changeStatusReader: async () => "archived",
    mergedBranches: async () => ["feature/test"],
    worktreeStatus: async () => "",
    registry: [
      {
        branch: "feature/test",
        changeId: "change-abc123",
        path: "/fake/path/feature/test",
      },
    ],
    ...overrides,
  };
}

describe("verifyBranchIntegration (T29)", () => {
  it("all 3 conditions pass → ok: true", async () => {
    const result = await verifyBranchIntegration(
      "feature/test",
      "/fake/repo",
      {},
      makeDeps(),
    );

    expect(result).toEqual({
      ok: true,
      branch: "feature/test",
      changeId: "change-abc123",
      defaultBranch: "main",
    });
  });

  it("change closed (terminal, non-archived) → ok: true", async () => {
    // Closed is a terminal status produced by adv_change_close
    // (cancelled, superseded, not_planned). The integration gate treats
    // both archived and closed as "nothing left to integrate" so worktree
    // delete can proceed when merged + clean.
    const result = await verifyBranchIntegration(
      "feature/test",
      "/fake/repo",
      {},
      makeDeps({
        changeStatusReader: async () => "closed",
      }),
    );

    expect(result).toEqual({
      ok: true,
      branch: "feature/test",
      changeId: "change-abc123",
      defaultBranch: "main",
    });
  });

  it("durable terminal readback overrides stale ordinary projection", async () => {
    // AC5: immediately after archive terminal convergence the ordinary
    // workflow/memo projection can still show a nonterminal status, but the
    // durable disk readback is already archived. The gate must accept the
    // durable terminal proof when merged + clean.
    const result = await verifyBranchIntegration(
      "feature/test",
      "/fake/repo",
      {},
      makeDeps({
        changeStatusReader: async () => "active",
        terminalStatusReader: async () => "archived",
      }),
    );

    expect(result).toEqual({
      ok: true,
      branch: "feature/test",
      changeId: "change-abc123",
      defaultBranch: "main",
    });
  });

  it("durable terminal readback still rejects nonterminal status", async () => {
    const result = await verifyBranchIntegration(
      "feature/test",
      "/fake/repo",
      {},
      makeDeps({
        changeStatusReader: async () => "active",
        terminalStatusReader: async () => "draft",
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "change_not_terminal",
    });
  });

  it("branch not in registry → branch_not_in_registry", async () => {
    const result = await verifyBranchIntegration(
      "feature/unknown",
      "/fake/repo",
      {},
      makeDeps({ registry: [] }),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "branch_not_in_registry",
    });
    expect((result as Extract<typeof result, { ok: false }>).detail).toContain(
      "feature/unknown",
    );
  });

  it("registry entry without changeId → branch_not_in_registry", async () => {
    const result = await verifyBranchIntegration(
      "feature/test",
      "/fake/repo",
      {},
      makeDeps({
        registry: [
          { branch: "feature/test", changeId: undefined, path: "/fake" },
        ],
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "branch_not_in_registry",
    });
  });

  it("change not in terminal set (status=active) → change_not_terminal", async () => {
    const result = await verifyBranchIntegration(
      "feature/test",
      "/fake/repo",
      {},
      makeDeps({
        changeStatusReader: async () => "active",
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: "change_not_terminal",
      detail:
        'Change "change-abc123" has status "active" (expected "archived" or "closed").',
      hint: "Archive or close the change via /adv-archive or /adv-cancel before deleting its worktree.",
    });
  });

  it("change status undefined → change_not_terminal", async () => {
    const result = await verifyBranchIntegration(
      "feature/test",
      "/fake/repo",
      {},
      makeDeps({
        changeStatusReader: async () => undefined,
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "change_not_terminal",
    });
    expect((result as Extract<typeof result, { ok: false }>).detail).toContain(
      "undefined",
    );
  });

  it("branch not merged → branch_not_merged", async () => {
    const result = await verifyBranchIntegration(
      "feature/test",
      "/fake/repo",
      {},
      makeDeps({
        mergedBranches: async () => ["main", "other-branch"],
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: "branch_not_merged",
      detail: 'Branch "feature/test" is not merged into "main".',
      hint: "Merge the branch into main (e.g. `git merge feature/test`) before deleting its worktree.",
    });
  });

  it("merged branches with git prefix (* ) are normalized", async () => {
    const result = await verifyBranchIntegration(
      "feature/test",
      "/fake/repo",
      {},
      makeDeps({
        mergedBranches: async () => ["* feature/test"],
      }),
    );

    expect(result).toEqual({
      ok: true,
      branch: "feature/test",
      changeId: "change-abc123",
      defaultBranch: "main",
    });
  });

  it("merged branches with worktree prefix (+ ) are normalized", async () => {
    // git prefixes a branch with `+ ` when it is checked out in another
    // worktree (the canonical case for ADV-managed worktrees at delete time).
    // Without the `+` normalization, adv_worktree_delete falsely reports
    // branch_not_merged even after a verified ff-merge.
    const result = await verifyBranchIntegration(
      "feature/test",
      "/fake/repo",
      {},
      makeDeps({
        mergedBranches: async () => ["+ feature/test"],
      }),
    );

    expect(result).toEqual({
      ok: true,
      branch: "feature/test",
      changeId: "change-abc123",
      defaultBranch: "main",
    });
  });

  it("dirty working tree → worktree_dirty", async () => {
    const result = await verifyBranchIntegration(
      "feature/test",
      "/fake/repo",
      {},
      makeDeps({
        worktreeStatus: async () => " M file.txt",
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: "worktree_dirty",
      detail: 'Worktree at "/fake/path/feature/test" has uncommitted changes.',
      hint: "Commit or stash changes in the worktree before deleting it.",
    });
  });

  it("force option does NOT bypass integration gate", async () => {
    const result = await verifyBranchIntegration(
      "feature/test",
      "/fake/repo",
      { force: true },
      makeDeps({
        changeStatusReader: async () => "active",
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "change_not_terminal",
    });
  });

  it("falls through to real git when deps not injected", async () => {
    // When mergedBranches is not injected, real git is used.
    // Since /nonexistent/repo is not a git repo, git branch --merged fails.
    const result = await verifyBranchIntegration(
      "feature/test",
      "/nonexistent/repo",
      {},
      makeDeps({
        mergedBranches: undefined,
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "git_failed",
    });
  });
});

describe("proveLocalBranchIntegration", () => {
  const head = "0123456789abcdef0123456789abcdef01234567";
  const minus = `- ${head} equivalent patch`;

  async function prove(
    cherryOutput: string,
    cherryError?: unknown,
  ): Promise<Awaited<ReturnType<typeof proveLocalBranchIntegration>>> {
    const operation = createWorktreeOperationContext({ budgetMs: 1_000 });
    try {
      return await proveLocalBranchIntegration(
        "release/fixPostRemovalRelease",
        head,
        "trunk",
        "/repo",
        operation,
        {
          runGit: async (args) => {
            if (args[0] === "merge-base")
              throw Object.assign(new Error("not an ancestor"), { code: 1 });
            if (cherryError) throw cherryError;
            return { stdout: cherryOutput, stderr: "" };
          },
        },
      );
    } finally {
      operation.dispose();
    }
  }

  it("accepts the live squash-equivalent shape with two minus lines", async () => {
    await expect(prove(`${minus}\n${minus}\n`)).resolves.toMatchObject({
      kind: "patch_equivalent",
      branch: "release/fixPostRemovalRelease",
      defaultBranch: "trunk",
      head,
    });
  });

  it.each([
    ["one plus line", `${minus}\n+ ${head} unique patch\n`],
    ["mixed plus and minus", `+ ${head} unique patch\n${minus}\n`],
    ["malformed line", `${minus}\nnot git cherry output\n`],
  ])("rejects %s", async (_label, output) => {
    await expect(prove(output)).resolves.toBeUndefined();
  });

  it("rejects a nonzero cherry command", async () => {
    await expect(
      prove("", Object.assign(new Error("git failed"), { code: 2 })),
    ).resolves.toBeUndefined();
  });

  it("proves a squash-merged branch from an identical trunk commit tree", async () => {
    const trunkSha = "abcdef0123456789abcdef0123456789abcdef01";
    const treeSha = "1234567890abcdef1234567890abcdef12345678";
    const operation = createWorktreeOperationContext({ budgetMs: 1_000 });
    try {
      const result = await proveLocalBranchIntegration(
        "release/v1",
        head,
        "trunk",
        "/repo",
        operation,
        {
          runGit: async (args) => {
            if (args[0] === "merge-base")
              throw Object.assign(new Error("not an ancestor"), { code: 1 });
            if (args[0] === "cherry")
              return { stdout: `+ ${head} squashed patch\n`, stderr: "" };
            if (args[0] === "rev-parse")
              return { stdout: `${treeSha}\n`, stderr: "" };
            if (args[0] === "log")
              return {
                stdout: `${trunkSha} ${treeSha}\n${head} deadbeef\n`,
                stderr: "",
              };
            throw new Error(`unexpected git command: ${args.join(" ")}`);
          },
        },
      );

      expect(result).toMatchObject({
        kind: "patch_equivalent",
        branch: "release/v1",
        defaultBranch: "trunk",
        head,
      });
      expect(result?.evidence).toContain(trunkSha);
    } finally {
      operation.dispose();
    }
  });

  it("refuses an unmerged branch whose tip tree is absent from trunk history", async () => {
    const trunkSha = "abcdef0123456789abcdef0123456789abcdef01";
    const treeSha = "1234567890abcdef1234567890abcdef12345678";
    const differentTreeSha = "fedcba0987654321fedcba0987654321fedcba09";
    const operation = createWorktreeOperationContext({ budgetMs: 1_000 });
    try {
      await expect(
        proveLocalBranchIntegration(
          "release/v1",
          head,
          "trunk",
          "/repo",
          operation,
          {
            runGit: async (args) => {
              if (args[0] === "merge-base")
                throw Object.assign(new Error("not an ancestor"), { code: 1 });
              if (args[0] === "cherry")
                return { stdout: `+ ${head} unique patch\n`, stderr: "" };
              if (args[0] === "rev-parse")
                return { stdout: `${treeSha}\n`, stderr: "" };
              if (args[0] === "log")
                return {
                  stdout: `${trunkSha} ${differentTreeSha}\n`,
                  stderr: "",
                };
              throw new Error(`unexpected git command: ${args.join(" ")}`);
            },
          },
        ),
      ).resolves.toBeUndefined();
    } finally {
      operation.dispose();
    }
  });

  it("returns a typed deadline when the tree stage times out", async () => {
    const operation = createWorktreeOperationContext({ budgetMs: 1_000 });
    try {
      await expect(
        proveLocalBranchIntegration(
          "release/v1",
          head,
          "trunk",
          "/repo",
          operation,
          {
            runGit: async (args) => {
              if (args[0] === "merge-base")
                throw Object.assign(new Error("not an ancestor"), { code: 1 });
              if (args[0] === "cherry")
                return { stdout: `+ ${head} unique patch\n`, stderr: "" };
              throw Object.assign(new Error("timed out"), {
                name: "AbortError",
              });
            },
          },
        ),
      ).rejects.toMatchObject({
        name: "LocalBranchIntegrationDeadline",
        message: expect.stringContaining("tree"),
      });
    } finally {
      operation.dispose();
    }
  });

  it("returns a typed deadline for a timed-out child", async () => {
    const operation = createWorktreeOperationContext({ budgetMs: 1_000 });
    try {
      await expect(
        proveLocalBranchIntegration(
          "release/v1",
          head,
          "trunk",
          "/repo",
          operation,
          {
            runGit: async () => {
              throw Object.assign(new Error("timed out"), {
                name: "AbortError",
              });
            },
          },
        ),
      ).rejects.toBeInstanceOf(LocalBranchIntegrationDeadline);
    } finally {
      operation.dispose();
    }
  });

  it("rejects invalid refs before constructing a Git command", async () => {
    const runGit = vi.fn(async () => ({ stdout: "", stderr: "" }));
    const operation = createWorktreeOperationContext({ budgetMs: 1_000 });
    try {
      await expect(
        proveLocalBranchIntegration(
          "release/v1..trunk",
          head,
          "trunk",
          "/repo",
          operation,
          { runGit },
        ),
      ).resolves.toBeUndefined();
      expect(runGit).not.toHaveBeenCalled();
    } finally {
      operation.dispose();
    }
  });
});
