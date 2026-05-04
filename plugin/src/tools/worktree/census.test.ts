import { describe, expect, it } from "vitest";

import { reconcileWorktreeRegistry } from "./census";
import type { WorktreeRecord } from "../../temporal/contracts";

const now = "2026-05-04T00:00:00.000Z";

function existing(overrides: Partial<WorktreeRecord>): WorktreeRecord {
  return {
    branch: "change/example",
    path: "/wt/example",
    materialized: true,
    changeId: "example",
    status: "active",
    createdAt: "2026-05-03T00:00:00.000Z",
    lastSeenAt: "2026-05-03T00:00:00.000Z",
    baseRef: "trunk",
    headSha: "old",
    source: "tool",
    sourceVersion: 1,
    ...overrides,
  };
}

describe("reconcileWorktreeRegistry", () => {
  it("represents branch-without-worktree as unmaterialized without fake path", () => {
    const out = reconcileWorktreeRegistry({
      existing: [],
      git: {
        branches: [{ branch: "change/new", headSha: "abc", merged: false }],
        worktrees: [],
      },
      sessions: [],
      defaultBranch: "trunk",
      now,
      sourceVersion: 10,
    });

    expect(out).toEqual([
      expect.objectContaining({
        branch: "change/new",
        changeId: "new",
        status: "unmaterialized",
        materialized: false,
        path: undefined,
      }),
    ]);
  });

  it("marks registry records stale when git no longer has branch or worktree", () => {
    const out = reconcileWorktreeRegistry({
      existing: [existing({ branch: "change/ghost", path: "/wt/ghost" })],
      git: { branches: [], worktrees: [] },
      sessions: [],
      defaultBranch: "trunk",
      now,
      sourceVersion: 10,
    });

    expect(out[0]).toMatchObject({
      branch: "change/ghost",
      status: "stale",
      materialized: false,
      cleanupEligible: false,
    });
  });

  it("marks dirty materialized worktrees active and not cleanup eligible", () => {
    const out = reconcileWorktreeRegistry({
      existing: [],
      git: {
        branches: [{ branch: "change/dirty", headSha: "abc", merged: false }],
        worktrees: [
          {
            branch: "change/dirty",
            path: "/wt/dirty",
            headSha: "abc",
            dirty: true,
          },
        ],
      },
      sessions: [],
      defaultBranch: "trunk",
      now,
      sourceVersion: 10,
    });

    expect(out[0]).toMatchObject({
      status: "active",
      dirty: true,
      cleanupEligible: false,
    });
  });

  it("marks clean merged idle worktrees cleanup eligible", () => {
    const out = reconcileWorktreeRegistry({
      existing: [],
      git: {
        branches: [{ branch: "change/done", headSha: "abc", merged: true }],
        worktrees: [
          {
            branch: "change/done",
            path: "/wt/done",
            headSha: "abc",
            dirty: false,
          },
        ],
      },
      sessions: [],
      defaultBranch: "trunk",
      now,
      sourceVersion: 10,
    });

    expect(out[0]).toMatchObject({
      status: "merged",
      dirty: false,
      merged: true,
      cleanupEligible: true,
    });
  });

  it("lets git facts override stale registry path and head", () => {
    const out = reconcileWorktreeRegistry({
      existing: [
        existing({
          branch: "change/drift",
          path: "/old/path",
          headSha: "old",
          sourceVersion: 2,
        }),
      ],
      git: {
        branches: [{ branch: "change/drift", headSha: "new", merged: false }],
        worktrees: [
          {
            branch: "change/drift",
            path: "/new/path",
            headSha: "new",
            dirty: false,
          },
        ],
      },
      sessions: [],
      defaultBranch: "trunk",
      now,
      sourceVersion: 10,
    });

    expect(out[0]).toMatchObject({
      path: "/new/path",
      headSha: "new",
      source: "git_census",
      sourceVersion: 10,
    });
  });
});
