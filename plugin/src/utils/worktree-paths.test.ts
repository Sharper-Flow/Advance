import { describe, expect, it } from "vitest";

import { parseWorktreePaths, parseWorktreeTopology } from "./worktree-paths.js";

describe("parseWorktreePaths", () => {
  it("parses worktree paths from porcelain output", () => {
    expect(
      parseWorktreePaths(
        "worktree /repo\nHEAD abc\n\nworktree /repo-wt\nHEAD def\nbranch refs/heads/change/test\n",
      ),
    ).toEqual(["/repo", "/repo-wt"]);
  });

  it("returns empty array for empty or malformed output", () => {
    expect(parseWorktreePaths("")).toEqual([]);
    expect(parseWorktreePaths("HEAD abc\nbranch refs/heads/main\n")).toEqual(
      [],
    );
  });
});

describe("parseWorktreeTopology", () => {
  it("marks the first porcelain record as the main checkout", () => {
    expect(
      parseWorktreeTopology(
        "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\n" +
          "worktree /repo-wt\nHEAD def\nbranch refs/heads/change/test\n",
      ),
    ).toEqual([
      { path: "/repo", isMain: true, prunable: false },
      { path: "/repo-wt", isMain: false, prunable: false },
    ]);
  });

  it("marks prunable linked worktree entries", () => {
    expect(
      parseWorktreeTopology(
        "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\n" +
          "worktree /repo-wt\nHEAD def\n" +
          "prunable gitdir file points to non-existent location\n",
      ),
    ).toEqual([
      { path: "/repo", isMain: true, prunable: false },
      { path: "/repo-wt", isMain: false, prunable: true },
    ]);
  });

  it("parses detached worktree entries without a branch line", () => {
    expect(
      parseWorktreeTopology(
        "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\n" +
          "worktree /repo-detached\nHEAD def\ndetached\n",
      ),
    ).toEqual([
      { path: "/repo", isMain: true, prunable: false },
      { path: "/repo-detached", isMain: false, prunable: false },
    ]);
  });

  it("returns empty array for empty output", () => {
    expect(parseWorktreeTopology("")).toEqual([]);
  });
});
