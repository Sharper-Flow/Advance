/**
 * Exact-batch worktree detach preflight/apply flow (migrateExistingAdvWorktrees
 * AC1–AC7).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const gitAsyncFn = vi.hoisted(() => vi.fn());
const gitCbFn = vi.hoisted(() => vi.fn());
const getWorktreeRecordFn = vi.hoisted(() => vi.fn());
const getServiceFn = vi.hoisted(() => vi.fn());
const getChangeHandleFn = vi.hoisted(() => vi.fn());
const fireSignalAndRefreshFn = vi.hoisted(() => vi.fn());
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

vi.mock("./state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./state")>();
  return {
    ...actual,
    getWorktreeRecord: getWorktreeRecordFn,
  };
});

vi.mock("../../temporal/service", () => ({
  getService: getServiceFn,
}));

vi.mock("../_adapters", () => ({
  getChangeHandle: getChangeHandleFn,
  fireSignalAndRefresh: fireSignalAndRefreshFn,
}));

vi.mock("../../utils/git-worktree-flock", () => ({
  acquireGitWorktreeFlock: acquireFlockFn,
  releaseGitWorktreeFlock: releaseFlockFn,
}));

vi.mock("./in-use", () => ({
  isWorktreeInUse: isWorktreeInUseFn,
}));

vi.mock("../../utils/project-id", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../utils/project-id")>();
  return {
    ...actual,
    getProjectId: getProjectIdFn,
    getExternalRoot: getExternalRootFn,
  };
});

import {
  advWorktreeDetachBatch,
  type AdvWorktreeDetachBatchArgs,
  type WorktreeDetachDisposition,
} from "./detach";

import type { Store } from "../../storage/store";
import { worktreeDematerializedSignal } from "../../temporal/messages";
import type { ChangeWorkflowState } from "../../temporal/contracts";

const access = { projectDir: "/repo", projectId: "proj-123" };
const repoRoot = "/repo";
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

function oldIso(daysAgo: number) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function worktreeRecord(overrides: {
  branch: string;
  path?: string;
  status?: "created" | "unmaterialized";
  materialized?: boolean;
  lastSeenAt?: string;
}) {
  return {
    branch: overrides.branch,
    path: overrides.path ?? `/wt/${overrides.branch}`,
    changeId: overrides.branch.replace("change/", ""),
    status: overrides.status ?? "created",
    materialized: overrides.materialized ?? true,
    createdAt: oldIso(20),
    lastSeenAt: overrides.lastSeenAt ?? oldIso(20),
    baseRef: "trunk",
    headSha: "abc1234",
    source: "tool" as const,
    sourceVersion: 1,
    setupReady: true,
  };
}

function gitOutput(stdout: string) {
  return { stdout, stderr: "" };
}

function disposition(
  result: { dispositions: WorktreeDetachDisposition[] },
  branch: string,
) {
  return result.dispositions.find((d) => d.branch === branch);
}

beforeEach(() => {
  gitAsyncFn.mockReset();
  gitCbFn.mockReset();
  getWorktreeRecordFn.mockReset();
  getServiceFn.mockReset();
  getChangeHandleFn.mockReset();
  fireSignalAndRefreshFn.mockReset();
  acquireFlockFn.mockReset();
  acquireFlockFn.mockResolvedValue({ owned: true, holderPid: null });
  releaseFlockFn.mockReset();
  releaseFlockFn.mockResolvedValue(undefined);
  isWorktreeInUseFn.mockReset();
  isWorktreeInUseFn.mockReturnValue(false);
  getProjectIdFn.mockReset();
  getProjectIdFn.mockResolvedValue("proj-123");
  getExternalRootFn.mockReset();
  getExternalRootFn.mockReturnValue("/tmp/adv/proj-123");
  getServiceFn.mockReturnValue({
    connection: { close: vi.fn() },
    client: { workflow: { getHandle: getChangeHandleFn } },
  });
  getChangeHandleFn.mockReturnValue({
    signal: vi.fn(),
    query: vi.fn().mockResolvedValue({
      lastSignalAt: oldIso(20),
    } as ChangeWorkflowState),
  });
  fireSignalAndRefreshFn.mockResolvedValue(undefined);

  // Default git responses: clean worktree, single worktree entry, old commit.
  gitAsyncFn.mockImplementation(async (args: string[]) => {
    const cmd = args.join(" ");
    if (cmd.includes("status --porcelain")) return gitOutput("");
    if (cmd.includes("worktree list --porcelain")) {
      return gitOutput(
        `worktree /repo\nbranch refs/heads/trunk\n\nworktree /wt/change/old\nbranch refs/heads/change/old\nHEAD abc1234\n`,
      );
    }
    if (cmd.includes("log -1 --format=%cI")) return gitOutput(oldIso(20));
    return gitOutput("");
  });

  gitCbFn.mockImplementation(
    (
      args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      // default success
      cb(null, "", "");
      return undefined as never;
    },
  );
});

describe("advWorktreeDetachBatch", () => {
  it("dry-run returns eligible dispositions without mutating state or filesystem", async () => {
    const branch = "change/old";
    getWorktreeRecordFn.mockResolvedValue(worktreeRecord({ branch }));

    const args: AdvWorktreeDetachBatchArgs = {
      branches: [branch],
      cutoffMs: TEN_DAYS_MS,
      mode: "dry_run",
    };
    const result = await advWorktreeDetachBatch(args, repoRoot, access);

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("dry_run");
    expect(disposition(result, branch)?.eligible).toBe(true);
    expect(gitCbFn).not.toHaveBeenCalled();
    expect(fireSignalAndRefreshFn).not.toHaveBeenCalled();
  });

  it("apply removes the directory, fires dematerialized signal, and preserves branch record", async () => {
    const branch = "change/old";
    getWorktreeRecordFn.mockResolvedValue(worktreeRecord({ branch }));
    getServiceFn.mockReturnValue({
      connection: { close: vi.fn() },
      client: { workflow: { getHandle: getChangeHandleFn } },
    });
    getChangeHandleFn.mockReturnValue({
      signal: vi.fn(),
      query: vi.fn().mockResolvedValue({
        lastSignalAt: oldIso(20),
      } as ChangeWorkflowState),
    });
    fireSignalAndRefreshFn.mockResolvedValue(undefined);

    const args: AdvWorktreeDetachBatchArgs = {
      branches: [branch],
      cutoffMs: TEN_DAYS_MS,
      mode: "apply",
      approvalEvidence: "user approved detach of change/old",
    };
    const result = await advWorktreeDetachBatch(args, repoRoot, access, {
      store: { changes: { refresh: vi.fn() } } as unknown as Store,
    });

    expect(result.ok).toBe(true);
    expect(disposition(result, branch)?.outcome).toBe("detached");
    expect(gitCbFn).toHaveBeenCalledWith(
      expect.arrayContaining(["worktree", "remove", "/wt/change/old"]),
      expect.anything(),
      expect.any(Function),
    );
    expect(fireSignalAndRefreshFn).toHaveBeenCalledWith(
      expect.objectContaining({ signal: expect.any(Function) }),
      expect.objectContaining({ changes: expect.anything() }),
      "old",
      expect.objectContaining({ name: "adv.change.worktreeDematerialized" }),
      expect.objectContaining({
        branch,
        outcome: "detached",
        approvalEvidence: args.approvalEvidence,
        requestId: result.requestId,
      }),
    );
  });

  it("refuses every branch when approval evidence is blank on apply and records the receipt", async () => {
    const branch = "change/old";
    getWorktreeRecordFn.mockResolvedValue(worktreeRecord({ branch }));

    const result = await advWorktreeDetachBatch(
      { branches: [branch], cutoffMs: TEN_DAYS_MS, mode: "apply" },
      repoRoot,
      access,
      { store: { changes: { refresh: vi.fn() } } as unknown as Store },
    );

    expect(result.ok).toBe(true);
    expect(disposition(result, branch)?.eligible).toBe(false);
    expect(disposition(result, branch)?.refusalReason).toBe(
      "approval_required",
    );
    expect(gitCbFn).not.toHaveBeenCalled();
    expect(fireSignalAndRefreshFn).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "old",
      expect.objectContaining({ name: "adv.change.worktreeDematerialized" }),
      expect.objectContaining({
        branch,
        outcome: "refused",
        reason: "approval_required",
      }),
    );
  });

  it("refuses every branch when the request id does not match the normalized batch and records the receipt", async () => {
    const branch = "change/old";
    getWorktreeRecordFn.mockResolvedValue(worktreeRecord({ branch }));

    const result = await advWorktreeDetachBatch(
      {
        branches: [branch],
        cutoffMs: TEN_DAYS_MS,
        mode: "apply",
        approvalEvidence: "ok",
        requestId: "wrong-id",
      },
      repoRoot,
      access,
      { store: { changes: { refresh: vi.fn() } } as unknown as Store },
    );

    expect(result.ok).toBe(true);
    expect(disposition(result, branch)?.refusalReason).toBe(
      "request_binding_mismatch",
    );
    expect(gitCbFn).not.toHaveBeenCalled();
    expect(fireSignalAndRefreshFn).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "old",
      expect.objectContaining({ name: "adv.change.worktreeDematerialized" }),
      expect.objectContaining({
        branch,
        outcome: "refused",
        reason: "request_binding_mismatch",
      }),
    );
  });

  it("refuses dirty worktrees", async () => {
    const branch = "change/old";
    getWorktreeRecordFn.mockResolvedValue(worktreeRecord({ branch }));
    gitAsyncFn.mockImplementation(async (args: string[]) => {
      const cmd = args.join(" ");
      if (cmd.includes("status --porcelain")) return gitOutput(" M file.ts");
      return defaultGitResponse(args);
    });

    const result = await advWorktreeDetachBatch(
      { branches: [branch], cutoffMs: TEN_DAYS_MS, mode: "dry_run" },
      repoRoot,
      access,
    );

    expect(disposition(result, branch)?.refusalReason).toBe("dirty_worktree");
  });

  it("refuses the current process cwd", async () => {
    const branch = "change/old";
    getWorktreeRecordFn.mockResolvedValue(
      worktreeRecord({ branch, path: "/wt/change/old" }),
    );
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/wt/change/old");

    const result = await advWorktreeDetachBatch(
      { branches: [branch], cutoffMs: TEN_DAYS_MS, mode: "dry_run" },
      repoRoot,
      access,
    );

    cwdSpy.mockRestore();
    expect(disposition(result, branch)?.refusalReason).toBe("current_cwd");
  });

  it("refuses worktrees in use by another process", async () => {
    const branch = "change/old";
    getWorktreeRecordFn.mockResolvedValue(worktreeRecord({ branch }));
    isWorktreeInUseFn.mockReturnValue(true);

    const result = await advWorktreeDetachBatch(
      { branches: [branch], cutoffMs: TEN_DAYS_MS, mode: "dry_run" },
      repoRoot,
      access,
    );

    expect(disposition(result, branch)?.refusalReason).toBe(
      "active_session_or_in_use",
    );
  });

  it("refuses ambiguous branch-to-path ownership", async () => {
    const branch = "change/old";
    getWorktreeRecordFn.mockResolvedValue(worktreeRecord({ branch }));
    gitAsyncFn.mockImplementation(async (args: string[]) => {
      const cmd = args.join(" ");
      if (cmd.includes("worktree list --porcelain")) {
        return gitOutput(
          `worktree /repo\nbranch refs/heads/trunk\n\nworktree /wt/change/old\nbranch refs/heads/change/old\nHEAD abc1234\n\nworktree /another/change/old\nbranch refs/heads/change/old\nHEAD abc1234\n`,
        );
      }
      return defaultGitResponse(args);
    });

    const result = await advWorktreeDetachBatch(
      { branches: [branch], cutoffMs: TEN_DAYS_MS, mode: "dry_run" },
      repoRoot,
      access,
    );

    expect(disposition(result, branch)?.refusalReason).toBe(
      "ambiguous_branch_to_path_ownership",
    );
  });

  it("refuses branches missing from or poisoned in the durable registry", async () => {
    getWorktreeRecordFn.mockResolvedValue(null);

    const result = await advWorktreeDetachBatch(
      {
        branches: ["change/ghost"],
        cutoffMs: TEN_DAYS_MS,
        mode: "dry_run",
      },
      repoRoot,
      access,
    );

    expect(disposition(result, "change/ghost")?.refusalReason).toBe(
      "missing_or_poisoned_registry",
    );
  });

  it("refuses branches whose last commit is newer than the cutoff", async () => {
    const branch = "change/old";
    getWorktreeRecordFn.mockResolvedValue(worktreeRecord({ branch }));
    gitAsyncFn.mockImplementation(async (args: string[]) => {
      const cmd = args.join(" ");
      if (cmd.includes("log -1 --format=%cI")) return gitOutput(newIso());
      return defaultGitResponse(args);
    });

    const result = await advWorktreeDetachBatch(
      { branches: [branch], cutoffMs: TEN_DAYS_MS, mode: "dry_run" },
      repoRoot,
      access,
    );

    expect(disposition(result, branch)?.refusalReason).toBe(
      "branch_activity_too_recent",
    );
  });

  it("refuses branches whose ADV activity is newer than the cutoff", async () => {
    const branch = "change/old";
    getWorktreeRecordFn.mockResolvedValue(
      worktreeRecord({ branch, lastSeenAt: newIso() }),
    );
    getChangeHandleFn.mockReturnValue({
      signal: vi.fn(),
      query: vi.fn().mockResolvedValue({
        lastSignalAt: newIso(),
      } as ChangeWorkflowState),
    });

    const result = await advWorktreeDetachBatch(
      { branches: [branch], cutoffMs: TEN_DAYS_MS, mode: "dry_run" },
      repoRoot,
      access,
    );

    expect(disposition(result, branch)?.refusalReason).toBe(
      "adv_activity_too_recent",
    );
  });

  it("returns idempotent_already_detached for an already unmaterialized branch", async () => {
    const branch = "change/old";
    getWorktreeRecordFn.mockResolvedValue(
      worktreeRecord({
        branch,
        status: "unmaterialized",
        materialized: false,
        path: undefined,
      }),
    );
    getServiceFn.mockReturnValue({
      connection: { close: vi.fn() },
      client: { workflow: { getHandle: getChangeHandleFn } },
    });
    getChangeHandleFn.mockReturnValue({
      signal: vi.fn(),
      query: vi.fn(),
    });
    fireSignalAndRefreshFn.mockResolvedValue(undefined);

    const result = await advWorktreeDetachBatch(
      {
        branches: [branch],
        cutoffMs: TEN_DAYS_MS,
        mode: "apply",
        approvalEvidence: "ok",
      },
      repoRoot,
      access,
      { store: { changes: { refresh: vi.fn() } } as unknown as Store },
    );

    expect(disposition(result, branch)?.outcome).toBe(
      "idempotent_already_detached",
    );
    expect(gitCbFn).not.toHaveBeenCalled();
    expect(fireSignalAndRefreshFn).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "old",
      expect.objectContaining({ name: "adv.change.worktreeDematerialized" }),
      expect.objectContaining({ outcome: "idempotent_already_detached" }),
    );
  });

  it("returns locked when the git-worktree flock is contended", async () => {
    const branch = "change/old";
    getWorktreeRecordFn.mockResolvedValue(worktreeRecord({ branch }));
    acquireFlockFn.mockResolvedValue({ owned: false, holderPid: 1234 });

    const result = await advWorktreeDetachBatch(
      { branches: [branch], cutoffMs: TEN_DAYS_MS, mode: "dry_run" },
      repoRoot,
      access,
    );

    expect(result.ok).toBe(false);
    expect(disposition(result, branch)?.refusalReason).toBe(
      "git_worktree_locked",
    );
  });

  it("records refused outcomes in the durable receipt", async () => {
    const branch = "change/old";
    getWorktreeRecordFn.mockResolvedValue(
      worktreeRecord({ branch, lastSeenAt: newIso() }),
    );
    getChangeHandleFn.mockReturnValue({
      signal: vi.fn(),
      query: vi.fn().mockResolvedValue({
        lastSignalAt: newIso(),
      } as ChangeWorkflowState),
    });

    await advWorktreeDetachBatch(
      {
        branches: [branch],
        cutoffMs: TEN_DAYS_MS,
        mode: "apply",
        approvalEvidence: "ok",
      },
      repoRoot,
      access,
      { store: { changes: { refresh: vi.fn() } } as unknown as Store },
    );

    expect(fireSignalAndRefreshFn).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "old",
      worktreeDematerializedSignal,
      expect.objectContaining({
        outcome: "refused",
        reason: "adv_activity_too_recent",
        approvalEvidence: "ok",
      }),
    );
  });

  it("fails closed in apply mode when Temporal service is unavailable", async () => {
    const branch = "change/old";
    getWorktreeRecordFn.mockResolvedValue(worktreeRecord({ branch }));
    getServiceFn.mockReturnValue(null);

    const result = await advWorktreeDetachBatch(
      {
        branches: [branch],
        cutoffMs: TEN_DAYS_MS,
        mode: "apply",
        approvalEvidence: "ok",
      },
      repoRoot,
      access,
    );

    expect(result.ok).toBe(false);
    expect(disposition(result, branch)?.eligible).toBe(false);
    expect(disposition(result, branch)?.refusalReason).toBe(
      "workflow_unavailable",
    );
    expect(gitCbFn).not.toHaveBeenCalled();
    expect(fireSignalAndRefreshFn).not.toHaveBeenCalled();
  });

  it("refuses materialized branches when workflow state lookup fails", async () => {
    const branch = "change/old";
    getWorktreeRecordFn.mockResolvedValue(worktreeRecord({ branch }));
    getChangeHandleFn.mockReturnValue({
      signal: vi.fn(),
      query: vi.fn().mockRejectedValue(new Error("workflow unreachable")),
    });

    const result = await advWorktreeDetachBatch(
      { branches: [branch], cutoffMs: TEN_DAYS_MS, mode: "dry_run" },
      repoRoot,
      access,
    );

    expect(disposition(result, branch)?.eligible).toBe(false);
    expect(disposition(result, branch)?.refusalReason).toBe(
      "workflow_unavailable",
    );
  });

  it("compensates a failed post-removal signal by re-adding the worktree", async () => {
    const branch = "change/old";
    getWorktreeRecordFn.mockResolvedValue(worktreeRecord({ branch }));

    fireSignalAndRefreshFn.mockImplementation(
      (_handle, _store, _changeId, _signal, payload) => {
        if (
          payload &&
          typeof payload === "object" &&
          "outcome" in payload &&
          payload.outcome === "detached"
        ) {
          throw new Error("signal timeout");
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await advWorktreeDetachBatch(
      {
        branches: [branch],
        cutoffMs: TEN_DAYS_MS,
        mode: "apply",
        approvalEvidence: "ok",
      },
      repoRoot,
      access,
      { store: { changes: { refresh: vi.fn() } } as unknown as Store },
    );

    expect(disposition(result, branch)?.outcome).toBe("refused");
    expect(disposition(result, branch)?.refusalReason).toBe(
      "detach_signal_failed_compensated",
    );
    expect(gitCbFn).toHaveBeenCalledWith(
      expect.arrayContaining(["worktree", "remove", "/wt/change/old"]),
      expect.anything(),
      expect.any(Function),
    );
    expect(gitCbFn).toHaveBeenCalledWith(
      expect.arrayContaining(["worktree", "add", "/wt/change/old", branch]),
      expect.anything(),
      expect.any(Function),
    );
    expect(fireSignalAndRefreshFn).toHaveBeenCalledTimes(2);
    expect(fireSignalAndRefreshFn).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.anything(),
      "old",
      expect.objectContaining({ name: "adv.change.worktreeDematerialized" }),
      expect.objectContaining({ outcome: "detached" }),
    );
    expect(fireSignalAndRefreshFn).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.anything(),
      "old",
      expect.objectContaining({ name: "adv.change.worktreeDematerialized" }),
      expect.objectContaining({
        outcome: "refused",
        reason: "detach_signal_failed_compensated",
      }),
    );
  });
});

function defaultGitResponse(args: string[]) {
  const cmd = args.join(" ");
  if (cmd.includes("status --porcelain")) return gitOutput("");
  if (cmd.includes("worktree list --porcelain")) {
    return gitOutput(
      `worktree /repo\nbranch refs/heads/trunk\n\nworktree /wt/change/old\nbranch refs/heads/change/old\nHEAD abc1234\n`,
    );
  }
  if (cmd.includes("log -1 --format=%cI")) return gitOutput(oldIso(20));
  return gitOutput("");
}

function newIso() {
  return new Date().toISOString();
}
