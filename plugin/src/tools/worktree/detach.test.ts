import { beforeEach, describe, expect, it, vi } from "vitest";

const gitAsyncFn = vi.hoisted(() => vi.fn());
const gitCbFn = vi.hoisted(() => vi.fn());
const getWorktreeRecordFn = vi.hoisted(() => vi.fn());
const acquireFlockFn = vi.hoisted(() =>
  vi.fn(async () => ({ owned: true, holderPid: null })),
);
const releaseFlockFn = vi.hoisted(() => vi.fn(async () => {}));
const isWorktreeInUseFn = vi.hoisted(() => vi.fn(() => false));
const getProjectIdFn = vi.hoisted(() => vi.fn(async () => "proj-123"));
const getExternalRootFn = vi.hoisted(() => vi.fn(() => "/tmp/adv/proj-123"));

vi.mock("../../utils/git-binary", () => ({
  execFileGitAsync: gitAsyncFn,
  execFileGitCb: gitCbFn,
}));
vi.mock("./state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./state")>()),
  getWorktreeRecord: getWorktreeRecordFn,
}));
vi.mock("../../utils/git-worktree-flock", () => ({
  acquireGitWorktreeFlock: acquireFlockFn,
  releaseGitWorktreeFlock: releaseFlockFn,
}));
vi.mock("./in-use", () => ({ isWorktreeInUse: isWorktreeInUseFn }));
vi.mock("../../utils/project-id", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/project-id")>()),
  getProjectId: getProjectIdFn,
  getExternalRoot: getExternalRootFn,
}));

import { advWorktreeDetachBatch } from "./detach";

const access = {
  projectDir: "/repo",
  projectId: "0000123000000000000000000000000000000000",
};
const repoRoot = "/repo";
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

function oldIso(daysAgo: number) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function record(branch: string, overrides: Record<string, unknown> = {}) {
  return {
    branch,
    path: `/wt/${branch}`,
    changeId: branch.replace("change/", ""),
    status: "created",
    materialized: true,
    createdAt: oldIso(20),
    lastSeenAt: oldIso(20),
    baseRef: "trunk",
    headSha: "abc1234",
    source: "tool",
    sourceVersion: 1,
    setupReady: true,
    ...overrides,
  };
}

beforeEach(() => {
  gitAsyncFn.mockReset();
  gitCbFn.mockReset();
  getWorktreeRecordFn.mockReset();
  acquireFlockFn.mockReset();
  acquireFlockFn.mockResolvedValue({ owned: true, holderPid: null });
  releaseFlockFn.mockReset();
  releaseFlockFn.mockResolvedValue(undefined);
  isWorktreeInUseFn.mockReset();
  isWorktreeInUseFn.mockReturnValue(false);
  gitAsyncFn.mockImplementation(async (args: string[]) => {
    const command = args.join(" ");
    if (command.includes("status --porcelain"))
      return { stdout: "", stderr: "" };
    if (command.includes("worktree list --porcelain")) {
      return {
        stdout:
          "worktree /repo\nbranch refs/heads/trunk\n\n" +
          "worktree /wt/change/old\nbranch refs/heads/change/old\nHEAD abc1234\n",
        stderr: "",
      };
    }
    if (command.includes("log -1 --format=%cI")) {
      return { stdout: oldIso(20), stderr: "" };
    }
    return { stdout: "", stderr: "" };
  });
  gitCbFn.mockImplementation(
    (
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      cb(null, "", "");
    },
  );
});

describe("advWorktreeDetachBatch", () => {
  it("previews an eligible filesystem detach without mutating", async () => {
    getWorktreeRecordFn.mockResolvedValue(record("change/old"));
    const result = await advWorktreeDetachBatch(
      { branches: ["change/old"], cutoffMs: TEN_DAYS_MS, mode: "dry_run" },
      repoRoot,
      access,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dispositions[0]).toMatchObject({
      branch: "change/old",
      eligible: true,
    });
    expect(gitCbFn).not.toHaveBeenCalled();
  });

  it("applies a detach by removing only the git worktree directory", async () => {
    getWorktreeRecordFn.mockResolvedValue(record("change/old"));
    const result = await advWorktreeDetachBatch(
      {
        branches: ["change/old"],
        cutoffMs: TEN_DAYS_MS,
        mode: "apply",
        approvalEvidence: "user approved detach",
      },
      repoRoot,
      access,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dispositions[0]).toMatchObject({
      branch: "change/old",
      eligible: true,
      outcome: "detached",
    });
    expect(gitCbFn).toHaveBeenCalledWith(
      expect.arrayContaining(["worktree", "remove", "/wt/change/old"]),
      expect.anything(),
      expect.any(Function),
    );
  });

  it("refuses apply without approval evidence", async () => {
    getWorktreeRecordFn.mockResolvedValue(record("change/old"));
    const result = await advWorktreeDetachBatch(
      { branches: ["change/old"], cutoffMs: TEN_DAYS_MS, mode: "apply" },
      repoRoot,
      access,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dispositions[0]).toMatchObject({
      eligible: false,
      refusalReason: "approval_required",
      outcome: "refused",
    });
    expect(gitCbFn).not.toHaveBeenCalled();
  });

  it("refuses dirty worktrees and unavailable records without signaling", async () => {
    getWorktreeRecordFn.mockResolvedValue(record("change/old"));
    gitAsyncFn.mockImplementation(async (args: string[]) => {
      const command = args.join(" ");
      if (command.includes("status --porcelain"))
        return { stdout: " M file", stderr: "" };
      if (command.includes("worktree list --porcelain")) {
        return {
          stdout:
            "worktree /wt/change/old\nbranch refs/heads/change/old\nHEAD abc1234\n",
          stderr: "",
        };
      }
      return { stdout: oldIso(20), stderr: "" };
    });
    const result = await advWorktreeDetachBatch(
      { branches: ["change/old"], cutoffMs: TEN_DAYS_MS, mode: "dry_run" },
      repoRoot,
      access,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dispositions[0]).toMatchObject({
      eligible: false,
      refusalReason: "dirty_worktree",
    });
  });
});
