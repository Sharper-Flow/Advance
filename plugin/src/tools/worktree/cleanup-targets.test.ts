/**
 * Tests for collectWorktreeCleanupTargets (rq-autoManageAdvWorktrees AC7).
 */

import { describe, expect, test } from "vitest";

import { collectWorktreeCleanupTargets } from "./cleanup-targets";
import type { Change } from "../../types";

function fixture(overrides: Partial<Change> = {}): Change {
  return {
    id: "fixtureChange",
    title: "Fixture",
    status: "active",
    created_at: "2026-05-21T00:00:00.000Z",
    tasks: [],
    deltas: {},
    ...overrides,
  } as Change;
}

describe("collectWorktreeCleanupTargets", () => {
  test("emits current-repo entry only when no cross-project / scope fields", () => {
    const targets = collectWorktreeCleanupTargets(fixture());
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      role: "current",
      branch: "change/fixtureChange",
    });
  });

  test("appends target entry when target_worktree_path is set", () => {
    const targets = collectWorktreeCleanupTargets(
      fixture({ target_worktree_path: "/abs/target/wt" }),
    );
    expect(targets).toEqual([
      expect.objectContaining({ role: "current", path: "" }),
      {
        role: "target",
        branch: "change/fixtureChange",
        path: "/abs/target/wt",
      },
    ]);
  });

  test("omits target entry when target_worktree_path is null (post-cleanup)", () => {
    const targets = collectWorktreeCleanupTargets(
      fixture({ target_worktree_path: null }),
    );
    expect(targets.find((t) => t.role === "target")).toBeUndefined();
  });

  test("appends one scope entry per scope_worktrees repo in Object.keys order", () => {
    const targets = collectWorktreeCleanupTargets(
      fixture({
        scope_worktrees: {
          repoA: "/abs/repoA",
          repoB: "/abs/repoB",
          repoC: "/abs/repoC",
        },
      }),
    );
    const scope = targets.filter((t) => t.role === "scope");
    expect(scope.map((t) => t.repoId)).toEqual(["repoA", "repoB", "repoC"]);
    expect(scope).toEqual([
      {
        role: "scope",
        repoId: "repoA",
        branch: "change/fixtureChange",
        path: "/abs/repoA",
      },
      {
        role: "scope",
        repoId: "repoB",
        branch: "change/fixtureChange",
        path: "/abs/repoB",
      },
      {
        role: "scope",
        repoId: "repoC",
        branch: "change/fixtureChange",
        path: "/abs/repoC",
      },
    ]);
  });

  test("combines current + target + scope in deterministic order", () => {
    const targets = collectWorktreeCleanupTargets(
      fixture({
        target_worktree_path: "/abs/target",
        scope_worktrees: { repoA: "/abs/repoA", repoB: "/abs/repoB" },
      }),
    );
    expect(targets.map((t) => t.role)).toEqual([
      "current",
      "target",
      "scope",
      "scope",
    ]);
    expect(targets).toEqual([
      expect.objectContaining({ role: "current" }),
      expect.objectContaining({ role: "target", path: "/abs/target" }),
      expect.objectContaining({
        role: "scope",
        repoId: "repoA",
        path: "/abs/repoA",
      }),
      expect.objectContaining({
        role: "scope",
        repoId: "repoB",
        path: "/abs/repoB",
      }),
    ]);
  });

  test("treats empty scope_worktrees as no scope entries (post-cleanup state)", () => {
    const targets = collectWorktreeCleanupTargets(
      fixture({ scope_worktrees: {} }),
    );
    expect(targets.filter((t) => t.role === "scope")).toHaveLength(0);
    // current-repo entry still present
    expect(targets).toHaveLength(1);
  });

  test("idempotent — same change yields same list across repeat calls", () => {
    const change = fixture({
      target_worktree_path: "/abs/target",
      scope_worktrees: { repoA: "/abs/repoA" },
    });
    const first = collectWorktreeCleanupTargets(change);
    const second = collectWorktreeCleanupTargets(change);
    expect(first).toEqual(second);
  });
});
