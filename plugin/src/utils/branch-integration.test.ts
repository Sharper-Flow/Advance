/**
 * Unit tests for Branch Integration Gate (T29).
 *
 * Pure unit tests — all external dependencies (Temporal, git) are injected.
 */

import { describe, expect, it } from "vitest";
import {
  verifyBranchIntegration,
  type BranchIntegrationDeps,
} from "./branch-integration";

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

  it("change not archived → change_not_archived", async () => {
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
      reason: "change_not_archived",
      detail:
        'Change "change-abc123" has status "active" (expected "archived").',
      hint: "Archive the change via /adv-archive before deleting its worktree.",
    });
  });

  it("change status undefined → change_not_archived", async () => {
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
      reason: "change_not_archived",
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
      reason: "change_not_archived",
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
