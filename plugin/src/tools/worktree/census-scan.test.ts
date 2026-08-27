import { describe, expect, it, vi } from "vitest";

const { execFileGitAsync } = vi.hoisted(() => ({
  execFileGitAsync: vi.fn(),
}));

vi.mock("../../utils/git-binary", () => ({ execFileGitAsync }));

import { scanGitWorkspaceFacts } from "./census";

describe("scanGitWorkspaceFacts", () => {
  it("keeps every branch family and canonical worktree state", async () => {
    execFileGitAsync.mockImplementation(async (args: string[]) => {
      if (args[0] === "for-each-ref") {
        return {
          stdout:
            "release/v1 0123456789abcdef0123456789abcdef01234567\n" +
            "feature/ad-hoc fedcba9876543210fedcba9876543210fedcba98\n",
        };
      }
      if (args[0] === "branch") return { stdout: "release/v1\n" };
      if (args[0] === "worktree" && args.at(-1) === "-z") {
        return {
          stdout: [
            "worktree /repo\0",
            "HEAD 0123456789abcdef0123456789abcdef01234567\0",
            "branch refs/heads/release/v1\0",
            "locked maintenance\0",
            "\0",
            "worktree /repo/ad-hoc\0",
            "HEAD fedcba9876543210fedcba9876543210fedcba98\0",
            "detached\0",
            "prunable stale\0",
            "\0",
          ].join(""),
        };
      }
      return { stdout: "" };
    });

    const facts = await scanGitWorkspaceFacts("/repo", "trunk");

    expect(facts.branches).toEqual([
      {
        branch: "release/v1",
        headSha: "0123456789abcdef0123456789abcdef01234567",
        merged: true,
      },
      {
        branch: "feature/ad-hoc",
        headSha: "fedcba9876543210fedcba9876543210fedcba98",
        merged: false,
      },
    ]);
    expect(facts.worktrees).toEqual([
      expect.objectContaining({
        branch: "release/v1",
        locked: true,
        detached: false,
        prunable: false,
      }),
      expect.objectContaining({
        branch: undefined,
        detached: true,
        prunable: true,
      }),
    ]);
  });

  it("treats an unavailable worktree status as unsafe", async () => {
    execFileGitAsync.mockImplementation(async (args: string[]) => {
      if (args[0] === "for-each-ref") {
        return {
          stdout: "change/example 0123456789abcdef0123456789abcdef01234567\n",
        };
      }
      if (args[0] === "branch") return { stdout: "change/example\n" };
      if (args[0] === "worktree") {
        return {
          stdout: [
            "worktree /repo/example\0",
            "HEAD 0123456789abcdef0123456789abcdef01234567\0",
            "branch refs/heads/change/example\0",
            "\0",
          ].join(""),
        };
      }
      throw new Error("git status unavailable");
    });

    const facts = await scanGitWorkspaceFacts("/repo", "trunk");

    expect(execFileGitAsync).toHaveBeenCalledWith(
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      { cwd: "/repo/example", timeout: 10_000 },
    );
    expect(facts.worktrees).toEqual([
      expect.objectContaining({ branch: "change/example", dirty: true }),
    ]);
  });
});
