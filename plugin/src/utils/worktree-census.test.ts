/**
 * Worktree Census Tests
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { getWorktreeCensus } from "./worktree-census";

const mockExecFile = vi.fn();
const mockStatSync = vi.fn();

vi.mock("child_process", () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

vi.mock("node:fs", () => ({
  statSync: (...args: unknown[]) => mockStatSync(...args),
}));

describe("getWorktreeCensus", () => {
  beforeEach(() => {
    mockExecFile.mockReset();
    mockStatSync.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("parses porcelain output and returns total count", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: null, stdout: string) => void,
      ) => {
        cb(
          null,
          [
            "worktree /home/user/repo",
            "HEAD abc123",
            "branch refs/heads/trunk",
            "",
            "worktree /home/user/repo-wt",
            "HEAD def456",
            "branch refs/heads/change/feature",
            "",
          ].join("\n"),
        );
      },
    );
    mockStatSync.mockReturnValue({ mtime: new Date() });

    const result = await getWorktreeCensus("/home/user/repo");
    expect(result).not.toBeNull();
    expect(result!.total).toBe(2);
    expect(result!.stale).toHaveLength(0);
  });

  test("detects stale worktrees older than 7 days", async () => {
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 86400_000);

    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: null, stdout: string) => void,
      ) => {
        cb(
          null,
          [
            "worktree /home/user/repo",
            "HEAD abc123",
            "branch refs/heads/trunk",
            "",
            "worktree /home/user/repo-stale",
            "HEAD def456",
            "branch refs/heads/change/oldFeature",
            "",
          ].join("\n"),
        );
      },
    );
    mockStatSync
      .mockReturnValueOnce({ mtime: now })
      .mockReturnValueOnce({ mtime: tenDaysAgo });

    const result = await getWorktreeCensus("/home/user/repo");
    expect(result!.total).toBe(2);
    expect(result!.stale).toHaveLength(1);
    expect(result!.stale[0].branch).toBe("change/oldFeature");
    expect(result!.stale[0].lastActivity).toContain("10d ago");
  });

  test("returns null on exec error", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: Error) => void,
      ) => {
        cb(new Error("not a git repo"));
      },
    );

    const result = await getWorktreeCensus("/tmp/not-a-repo");
    expect(result).toBeNull();
  });

  test("returns empty census for empty git output", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: null, stdout: string) => void,
      ) => {
        cb(null, "");
      },
    );

    const result = await getWorktreeCensus("/home/user/repo");
    expect(result).toEqual({ total: 0, worktrees: [], stale: [] });
  });

  test("does not flag a worktree exactly 7 days old", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-10T00:00:00Z") });
    const exactlySevenDaysAgo = new Date("2026-01-03T00:00:00Z");

    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: null, stdout: string) => void,
      ) => {
        cb(
          null,
          [
            "worktree /home/user/repo",
            "HEAD abc123",
            "branch refs/heads/trunk",
            "",
          ].join("\n"),
        );
      },
    );
    mockStatSync.mockReturnValue({ mtime: exactlySevenDaysAgo });

    const result = await getWorktreeCensus("/home/user/repo");
    expect(result!.stale).toHaveLength(0);
  });

  test("uses bounded git worktree list and never shells out to du", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: null, stdout: string) => void,
      ) => {
        cb(null, "");
      },
    );

    await getWorktreeCensus("/home/user/repo");

    expect(mockExecFile).toHaveBeenCalledTimes(1);
    expect(mockExecFile.mock.calls[0][0]).toBe("git");
    expect(mockExecFile.mock.calls[0][1]).toEqual([
      "worktree",
      "list",
      "--porcelain",
    ]);
    expect(mockExecFile.mock.calls[0][2]).toMatchObject({
      timeout: 5000,
      maxBuffer: 10 * 1024 * 1024,
    });
  });

  test("skips worktrees with non-existent paths", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: null, stdout: string) => void,
      ) => {
        cb(
          null,
          [
            "worktree /home/user/repo",
            "HEAD abc123",
            "branch refs/heads/trunk",
            "",
            "worktree /home/user/repo-gone",
            "HEAD def456",
            "branch refs/heads/change/deleted",
            "",
          ].join("\n"),
        );
      },
    );
    mockStatSync
      .mockReturnValueOnce({ mtime: new Date() })
      .mockImplementationOnce(() => {
        throw new Error("ENOENT");
      });

    const result = await getWorktreeCensus("/home/user/repo");
    expect(result!.total).toBe(1);
  });

  test("handles detached HEAD (no branch line)", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: null, stdout: string) => void,
      ) => {
        cb(
          null,
          [
            "worktree /home/user/repo",
            "HEAD abc123",
            "branch refs/heads/trunk",
            "",
            "worktree /home/user/repo-detached",
            "HEAD def456",
            "",
          ].join("\n"),
        );
      },
    );
    mockStatSync.mockReturnValue({ mtime: new Date() });

    const result = await getWorktreeCensus("/home/user/repo");
    expect(result!.total).toBe(2);
    expect(result!.worktrees[1].branch).toBe("(detached)");
  });
});
