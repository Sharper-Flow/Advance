/**
 * Tests for the shared `git worktree list --porcelain` parser.
 *
 * These cover the parsing behavior previously exercised indirectly through
 * `triageWorktrees` in `triage.test.ts`.
 */

import { describe, it, expect } from "vitest";
import { parseWorktreeListPorcelain } from "./porcelain-parser";

describe("parseWorktreeListPorcelain", () => {
  it("parses a single worktree with a branch", () => {
    const stdout =
      "worktree /home/main\nHEAD abc123\nbranch refs/heads/trunk\n";
    expect(parseWorktreeListPorcelain(stdout)).toEqual([
      { path: "/home/main", branch: "trunk" },
    ]);
  });

  it("parses multiple worktrees and strips refs/heads/ prefix", () => {
    const stdout =
      "worktree /home/main\n" +
      "HEAD abc123\n" +
      "branch refs/heads/trunk\n" +
      "\n" +
      "worktree /home/wt-change-foo\n" +
      "HEAD def456\n" +
      "branch refs/heads/change/foo\n";
    expect(parseWorktreeListPorcelain(stdout)).toEqual([
      { path: "/home/main", branch: "trunk" },
      { path: "/home/wt-change-foo", branch: "change/foo" },
    ]);
  });

  it("omits branch for bare and detached worktrees", () => {
    const stdout =
      "worktree /home/main\n" +
      "HEAD abc123\n" +
      "branch refs/heads/trunk\n" +
      "\n" +
      "worktree /home/bare\n" +
      "HEAD def456\n" +
      "bare\n" +
      "\n" +
      "worktree /home/detached\n" +
      "HEAD ghi789\n" +
      "detached\n";
    expect(parseWorktreeListPorcelain(stdout)).toEqual([
      { path: "/home/main", branch: "trunk" },
      { path: "/home/bare" },
      { path: "/home/detached" },
    ]);
  });

  it("ignores trailing blank lines", () => {
    const stdout =
      "worktree /home/main\n" +
      "HEAD abc123\n" +
      "branch refs/heads/trunk\n" +
      "\n" +
      "\n";
    expect(parseWorktreeListPorcelain(stdout)).toEqual([
      { path: "/home/main", branch: "trunk" },
    ]);
  });

  it("returns an empty array for empty stdout", () => {
    expect(parseWorktreeListPorcelain("")).toEqual([]);
  });

  it("parses canonical NUL-delimited records and preserves arbitrary paths", () => {
    const stdout = [
      "worktree /repo/path with spaces\0",
      "HEAD abc123\0",
      "branch refs/heads/release/v1\0",
      "locked maintenance window\0",
      "\0",
      "worktree /tmp/path\nwith-newline\0",
      "HEAD def456\0",
      "detached\0",
      "prunable gitdir file points to missing location\0",
      "\0",
    ].join("");

    expect(parseWorktreeListPorcelain(stdout)).toEqual([
      {
        path: "/repo/path with spaces",
        headSha: "abc123",
        branch: "release/v1",
        detached: false,
        bare: false,
        locked: true,
        prunable: false,
      },
      {
        path: "/tmp/path\nwith-newline",
        headSha: "def456",
        branch: undefined,
        detached: true,
        bare: false,
        locked: false,
        prunable: true,
      },
    ]);
  });
});
