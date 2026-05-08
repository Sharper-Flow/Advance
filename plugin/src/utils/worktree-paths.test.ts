import { describe, expect, it } from "vitest";

import { parseWorktreePaths } from "./worktree-paths.js";

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
