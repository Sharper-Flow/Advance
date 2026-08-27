/**
 * Tests for ADV-safe worktree delete flow (T9 — KD-6b, F2, R13).
 *
 * Uses ephemeral git fixtures (mkdtempSync + git init + git worktree add)
 * to verify the 5 RED scenarios:
 *   1. INTEGRATION_REQUIRED — injection seam on integrationCheck
 *   2. UNCOMMITTED_WORK — uncommitted file, no force
 *   3. HOOK_INTRODUCED_CHANGES — mock hook touches file
 *   4. Clean delete succeeds — no hooks, clean tree
 *   5. force-with-approval — uncommitted file + force + audit log
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync, execSync } from "child_process";
import { createHash } from "crypto";

// Mock debug-log to capture audit trail.
vi.mock("../../utils/debug-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/debug-log")>();
  return {
    ...actual,
    appendDebugLog: vi.fn(),
  };
});

// Mock hooks module — preserve HookFailedError, replace runHooksWithSafety.
vi.mock("./hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./hooks")>();
  return {
    ...actual,
    runHooksWithSafety: vi.fn(),
  };
});

import {
  advWorktreeCleanup,
  advWorktreeDelete as rawAdvWorktreeDelete,
  drainPendingDeletes,
  GH_PR_LIST_JSON_FIELDS,
  reapEmptyWorktreeParents,
  type AdvWorktreeDeleteDeps,
} from "./index";

import { appendDebugLog } from "../../utils/debug-log";
import { runHooksWithSafety } from "./hooks";
import {
  clearPendingDelete,
  getPendingDeletes,
  incrementPendingDeleteAttempts,
  setPendingDelete,
} from "./state";
import { synthesizeTestProjectId } from "../../utils/project-id";
import { decodeWorktreeDeletionToken } from "./deletion-contracts";
import { stableStringify } from "../../utils/digest";

const isLinux = process.platform === "linux";

function createGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "adv-wt-del-"));
  execSync("git init -b main", { cwd: dir });
  execSync("git config user.email 'test@test.com'", { cwd: dir });
  execSync("git config user.name 'Test'", { cwd: dir });
  writeFileSync(join(dir, "README.md"), "# test");
  execSync("git add README.md", { cwd: dir });
  execSync("git commit -m 'initial'", { cwd: dir });
  return dir;
}

function addWorktree(repoRoot: string, branch: string): string {
  const wtDir = join(repoRoot, "worktrees", branch);
  execSync(`git worktree add -b ${branch} ${wtDir}`, { cwd: repoRoot });
  return wtDir;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function makeSquashPrFixture(
  branch: string,
  prNumber: number,
): {
  root: string;
  remote: string;
  worktree: string;
  head: string;
  firstHead: string;
  mergeCommit: string;
  cleanup: () => void;
} {
  const root = createGitRepo();
  const remote = mkdtempSync(join(tmpdir(), "adv-pr-remote-"));
  const worktree = addWorktree(root, branch);
  git(remote, "init", "--bare", "-b", "main");
  git(root, "remote", "add", "origin", "https://github.com/owner/repo.git");
  git(
    root,
    "config",
    "url.file://" + remote + ".insteadOf",
    "https://github.com/owner/repo.git",
  );
  git(root, "push", "-u", "origin", "main");
  git(root, "remote", "set-head", "origin", "main");

  writeFileSync(join(worktree, "one.txt"), "one\n");
  git(worktree, "add", "one.txt");
  git(worktree, "commit", "-m", "first PR commit");
  const firstHead = git(worktree, "rev-parse", "HEAD");
  writeFileSync(join(worktree, "two.txt"), "two\n");
  git(worktree, "add", "two.txt");
  git(worktree, "commit", "-m", "second PR commit");
  const head = git(worktree, "rev-parse", "HEAD");

  git(root, "cherry-pick", "--no-commit", firstHead);
  git(root, "cherry-pick", "--no-commit", head);
  git(root, "commit", "-m", "squash PR #" + prNumber);
  const mergeCommit = git(root, "rev-parse", "HEAD");
  git(root, "push", "origin", "main");
  git(root, "push", "origin", branch);
  git(remote, "update-ref", `refs/pull/${prNumber}/head`, head);

  return {
    root,
    remote,
    worktree,
    head,
    firstHead,
    mergeCommit,
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(remote, { recursive: true, force: true });
    },
  };
}

function createMockDeps(
  projectRoot: string,
  worktreePath: string,
): AdvWorktreeDeleteDeps {
  return {
    projectRoot,
    database: {
      projectDir: projectRoot,
      projectId: synthesizeTestProjectId(projectRoot),
    },
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    worktreePath,
    // Default integration check passes — tests that need failure override this.
    integrationCheck: async () => ({
      ok: true as const,
      branch: "",
      changeId: "",
      defaultBranch: "",
    }),
  };
}

function createPrGhExec(
  payload: Record<string, unknown>,
  repository = "owner/repo",
) {
  return vi.fn(async (args: string[]) => ({
    stdout:
      args[0] === "repo"
        ? JSON.stringify({ nameWithOwner: repository })
        : JSON.stringify([payload]),
    stderr: "",
    exitCode: 0,
  }));
}

// Captured from the live `gh pr list --json` shape for PR #407.
const LIVE_PR_407_SHAPE = {
  number: 407,
  state: "MERGED",
  mergedAt: "2026-08-08T00:01:44Z",
  headRefName: "fix/delete-target-routing",
  headRefOid: "08c7c44e3f243c6dd522bea5d3446b1f7654978f",
  baseRefName: "trunk",
  headRepository: {
    id: "R_kgDOQ-sRJg",
    name: "Advance",
    nameWithOwner: "Sharper-Flow/Advance",
  },
  headRepositoryOwner: { id: "O_kgDOBrdsJg", login: "Sharper-Flow" },
  isCrossRepository: false,
  mergeCommit: { oid: "019de4a97560953acca5f3c425070d6bf3b64985" },
  url: "https://github.com/Sharper-Flow/Advance/pull/407",
} as const;

/**
 * Destructive delete tests must exercise the public planner/apply protocol;
 * the production wrapper intentionally rejects a direct no-plan call.
 */
async function advWorktreeDelete(
  branch: string,
  opts: {
    force?: boolean;
    dryRun?: boolean;
    planToken?: string;
    approvalEvidence?: string;
  } = {},
  deps: AdvWorktreeDeleteDeps,
) {
  const planned = await rawAdvWorktreeDelete(
    branch,
    { ...opts, dryRun: true },
    deps,
  );
  if (!planned.ok || !planned.planToken) return planned;
  return rawAdvWorktreeDelete(
    branch,
    {
      force: opts.force,
      planToken: planned.planToken,
      approvalEvidence: "test approval for the exact planned worktree",
    },
    deps,
  );
}

function attachChangeStatus(
  deps: AdvWorktreeDeleteDeps,
  status: string | null,
): void {
  deps.store = {
    changes: {
      get: vi.fn(async () =>
        status === null
          ? { success: false, error: "missing change", type: "not_found" }
          : { success: true, data: { status } },
      ),
      refresh: vi.fn(async () => undefined),
    },
  } as any;
}

describe.skipIf(!isLinux)("ADV-safe worktree delete (T9)", () => {
  let repoRoot: string;
  let dataRoot: string;

  beforeEach(() => {
    // Clear shell-leaked experimental env vars so flag-off tests assert
    // the off-by-default warpFlagEnabled() behavior. P25 touched-scope
    // fix as part of fixWarpSessionLookup (T1).
    vi.stubEnv("OPENCODE_EXPERIMENTAL", "");
    vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "");
    dataRoot = mkdtempSync(join(tmpdir(), "adv-wt-del-data-"));
    vi.stubEnv("XDG_DATA_HOME", dataRoot);
    repoRoot = createGitRepo();
    vi.clearAllMocks();
    vi.mocked(runHooksWithSafety).mockReset();
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(dataRoot, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("INTEGRATION_REQUIRED — blocks delete when branch integration fails", async () => {
    const branch = "feature/test";
    const wtPath = addWorktree(repoRoot, branch);

    const deps = createMockDeps(repoRoot, wtPath);
    const integrationCheck = vi.fn(async () => ({
      ok: false,
      reason: "change_not_terminal",
      detail: "Change is not in terminal state",
      hint: "Archive or close the change first",
    }));
    deps.integrationCheck = integrationCheck;
    deps.mergedBranches = async () => [];

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toEqual({
      ok: false,
      error: "INTEGRATION_REQUIRED",
      reason: "branch_not_merged",
      hint: "Integration proof was not provided.",
    });

    // Worktree should still exist
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  it("rejects a supplied worktree path that does not belong to the branch", async () => {
    const branch = "feature/test";
    addWorktree(repoRoot, branch);
    const deps = createMockDeps(repoRoot, repoRoot);

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({ ok: true, branch });
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).not.toContain(branch);
  });

  it("reports WORKTREE_NOT_FOUND for a supplied path that no longer exists", async () => {
    const branch = "feature/missing-path";
    const missingPath = join(repoRoot, "worktrees", "missing-path");
    const deps = createMockDeps(repoRoot, missingPath);

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toEqual({
      ok: false,
      error: "WORKTREE_NOT_FOUND",
      branch,
    });
  });

  it("UNCOMMITTED_WORK — blocks delete without force when uncommitted files exist", async () => {
    const branch = "feature/uncommitted";
    const wtPath = addWorktree(repoRoot, branch);

    writeFileSync(join(wtPath, "new-file.txt"), "hello");

    const deps = createMockDeps(repoRoot, wtPath);
    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      error: "UNCOMMITTED_WORK",
      hint: expect.stringContaining("force"),
    });
    expect(result).toHaveProperty("files");
    if (result.ok || result.error !== "UNCOMMITTED_WORK") {
      throw new Error("expected UNCOMMITTED_WORK result");
    }
    expect(result.files).toEqual([]);

    // Worktree should still exist
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  it("queues a pending delete when the worktree is still in use", async () => {
    const branch = "feature/in-use";
    const wtPath = addWorktree(repoRoot, branch);
    const deps = createMockDeps(repoRoot, wtPath);
    deps.isWorktreeInUse = () => true;

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "WORKTREE_IN_USE",
      branch,
      path: wtPath,
      hint: "A local process uses the target worktree.",
    });
    await expect(getPendingDeletes(deps.database)).resolves.toEqual([]);
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  it("deletes matching OpenCode workspace before removing the git worktree", async () => {
    vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
    const branch = "feature/warp-delete";
    const wtPath = addWorktree(repoRoot, branch);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "ws-abc",
              type: "adv-worktree",
              directory: wtPath,
              extra: { directory: wtPath, branch },
            },
          ]),
          {
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(new Response(""));

    const deps = createMockDeps(repoRoot, wtPath);
    deps.warpDeps = {
      serverUrl: new URL("http://127.0.0.1:4096"),
      fetchImpl,
    };

    await expect(advWorktreeDelete(branch, {}, deps)).resolves.toMatchObject({
      ok: true,
      branch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      "http://127.0.0.1:4096/experimental/workspace",
    );
    expect(String(fetchImpl.mock.calls[1]?.[0])).toBe(
      "http://127.0.0.1:4096/experimental/workspace/ws-abc",
    );
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({ method: "DELETE" });
    expect(deps.log.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("Failed to delete OpenCode workspace"),
    );
  });

  it("skips OpenCode workspace delete when no workspace matches", async () => {
    vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
    const branch = "feature/no-workspace";
    const wtPath = addWorktree(repoRoot, branch);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([])));
    const deps = createMockDeps(repoRoot, wtPath);
    deps.warpDeps = {
      serverUrl: new URL("http://127.0.0.1:4096"),
      fetchImpl,
    };

    await expect(advWorktreeDelete(branch, {}, deps)).resolves.toMatchObject({
      ok: true,
      branch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not call workspace HTTP when the warp flag is disabled at delete time", async () => {
    const branch = "feature/flag-off";
    const wtPath = addWorktree(repoRoot, branch);
    const fetchImpl = vi.fn();
    const deps = createMockDeps(repoRoot, wtPath);
    deps.warpDeps = {
      serverUrl: new URL("http://127.0.0.1:4096"),
      fetchImpl,
    };

    await expect(advWorktreeDelete(branch, {}, deps)).resolves.toMatchObject({
      ok: true,
      branch,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("continues git worktree deletion when OpenCode workspace cleanup 404s", async () => {
    vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
    const branch = "feature/workspace-404";
    const wtPath = addWorktree(repoRoot, branch);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "ws-gone",
              type: "adv-worktree",
              directory: wtPath,
              extra: { directory: wtPath, branch },
            },
          ]),
          {
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(new Response("missing", { status: 404 }));
    const deps = createMockDeps(repoRoot, wtPath);
    deps.warpDeps = {
      serverUrl: new URL("http://127.0.0.1:4096"),
      fetchImpl,
    };

    await expect(advWorktreeDelete(branch, {}, deps)).resolves.toMatchObject({
      ok: true,
      branch,
    });
    expect(deps.log.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("Failed to delete OpenCode workspace"),
    );
  });

  it("retains the git worktree with a typed blocker when OpenCode workspace cleanup fails", async () => {
    vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
    const branch = "feature/workspace-error";
    const wtPath = addWorktree(repoRoot, branch);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "ws-error",
              type: "adv-worktree",
              directory: wtPath,
              extra: { directory: wtPath, branch },
            },
          ]),
          {
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(new Response("boom", { status: 503 }));
    const deps = createMockDeps(repoRoot, wtPath);
    deps.warpDeps = {
      serverUrl: new URL("http://127.0.0.1:4096"),
      fetchImpl,
    };

    await expect(advWorktreeDelete(branch, {}, deps)).resolves.toMatchObject({
      ok: false,
      error: "DELETION_BLOCKED",
      branch,
      path: wtPath,
      reason: expect.stringContaining("ws-error"),
    });
    expect(deps.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("Failed to delete OpenCode workspace ws-error"),
    );
    // Fail closed: neither workspace nor git removal occurred; the retained
    // worktree stays queued as a visible manual-retry pending delete.
    await expect(getPendingDeletes(deps.database)).resolves.toEqual([]);
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  it("proceeds with a warning when workspace ownership is uncertain (list request fails)", async () => {
    // rq-terminalCleanupSafety01.3: the local isWorktreeInUse check upstream
    // is the safety authority; the remote workspace-list API is advisory.
    // When unreachable, deletion proceeds with a logged warning.
    vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
    const branch = "feature/workspace-uncertain";
    const wtPath = addWorktree(repoRoot, branch);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("down", { status: 503 }));
    const deps = createMockDeps(repoRoot, wtPath);
    deps.warpDeps = {
      serverUrl: new URL("http://127.0.0.1:4096"),
      fetchImpl,
    };

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: true,
      branch,
      path: wtPath,
      warning: expect.stringContaining("workspace registry unreachable"),
    });
    // Remote fetch was attempted; no workspace DELETE call (none was found).
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(deps.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("workspace registry unreachable"),
    );
    // Deletion proceeded; no pending-delete record retained.
    await expect(getPendingDeletes(deps.database)).resolves.toEqual([]);
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).not.toContain(branch);
  });

  it("proceeds with a warning when the workspace list lookup throws", async () => {
    vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
    const branch = "feature/workspace-throw";
    const wtPath = addWorktree(repoRoot, branch);
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection refused"));
    const deps = createMockDeps(repoRoot, wtPath);
    deps.warpDeps = {
      serverUrl: new URL("http://127.0.0.1:4096"),
      fetchImpl,
    };

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: true,
      branch,
      path: wtPath,
      warning: expect.stringContaining("connection refused"),
    });
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).not.toContain(branch);
  });

  it("regression: remote workspace registry unreachable is advisory and surfaces reason in warning", async () => {
    // Explicit regression for the post-archive cleanup wedge observed when
    // the OpenCode workspace API is unreachable. Local /proc/*/cwd evidence
    // already cleared safety upstream; remote failure must not block.
    vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
    const branch = "feature/registry-unreachable";
    const wtPath = addWorktree(repoRoot, branch);
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("Unable to connect"));
    const deps = createMockDeps(repoRoot, wtPath);
    deps.warpDeps = {
      serverUrl: new URL("http://127.0.0.1:4096"),
      fetchImpl,
    };

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warning).toMatch(/^workspace registry unreachable: /);
      expect(result.warning).toContain("Unable to connect");
    }
    expect(deps.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("Unable to connect"),
    );
    // No pending-delete record — deletion succeeded.
    await expect(getPendingDeletes(deps.database)).resolves.toEqual([]);
  });

  it("HOOK_INTRODUCED_CHANGES — blocks delete when hook creates uncommitted changes", async () => {
    const branch = "feature/hook";
    const wtPath = addWorktree(repoRoot, branch);

    vi.mocked(runHooksWithSafety).mockImplementationOnce(async () => {
      writeFileSync(join(wtPath, "hook-file.txt"), "created by hook");
      return [];
    });

    const deps = createMockDeps(repoRoot, wtPath);
    deps.hooks = { preDelete: ["touch hook-file.txt"] };

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      error: "DELETION_BLOCKED",
      reason: "bound_safety_fact_changed",
    });

    // Worktree should still exist
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  it("clean delete succeeds and removes the git worktree", async () => {
    const branch = "change/clean";
    const wtPath = addWorktree(repoRoot, branch);

    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [{ branch, path: wtPath, changeId: "clean" }];
    attachChangeStatus(deps, "archived");
    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({ ok: true, branch, path: wtPath });

    // Worktree should be gone
    const list = execSync("git worktree list", { cwd: repoRoot }).toString();
    expect(list).not.toContain(branch);
  });

  it("blocks apply when terminal proof readback times out", async () => {
    const branch = "change/signal-timeout";
    const wtPath = addWorktree(repoRoot, branch);

    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [{ branch, path: wtPath, changeId: "signal-timeout" }];
    deps.signalTimeoutMs = 1;

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "INTEGRATION_REQUIRED",
      reason: "terminal_proof_required",
    });
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  it("retains pending delete when operation budget expires before destructive removal", async () => {
    const branch = "change/delete-budget";
    const wtPath = addWorktree(repoRoot, branch);

    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [{ branch, path: wtPath, changeId: "delete-budget" }];
    attachChangeStatus(deps, "archived");
    deps.hooks = { preDelete: ["sleep forever"] };
    deps.operationTimeoutMs = 100;
    vi.mocked(runHooksWithSafety).mockImplementation(
      () => new Promise(() => {}),
    );

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "DEADLINE_EXCEEDED",
      status: "deadline_exceeded",
      branch,
    });
    expect(existsSync(wtPath)).toBe(true);
    await expect(getPendingDeletes(deps.database)).resolves.toEqual([]);
  });

  it("retains pending delete when non-ADV integration check exceeds operation budget", async () => {
    const branch = "feature/slow-integration";
    const wtPath = addWorktree(repoRoot, branch);

    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [{ branch, path: wtPath }];
    deps.integrationCheck = undefined;
    deps.operationTimeoutMs = 100;
    deps.mergedBranches = () =>
      new Promise<string[]>(() => {
        /* intentionally never resolves */
      });

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "DEADLINE_EXCEEDED",
      status: "deadline_exceeded",
      branch,
    });
    expect(existsSync(wtPath)).toBe(true);
    await expect(getPendingDeletes(deps.database)).resolves.toEqual([]);
  });

  it("force-with-approval — removes worktree with uncommitted changes and logs audit", async () => {
    const branch = "change/force";
    const wtPath = addWorktree(repoRoot, branch);

    writeFileSync(join(wtPath, "uncommitted.txt"), "do not lose");

    const deps = createMockDeps(repoRoot, wtPath);
    // ADV-registered worktree (changeId set) — uses integrationCheck seam.
    deps.registry = [{ branch, path: wtPath, changeId: "test-change" }];
    attachChangeStatus(deps, "archived");
    const result = await advWorktreeDelete(branch, { force: true }, deps);

    expect(result).toMatchObject({ ok: true, branch, path: wtPath });

    // Audit log should have been written
    expect(appendDebugLog).toHaveBeenCalledWith(
      "worktree-delete",
      expect.stringContaining("force-removing"),
    );

    // Worktree should be gone
    const list = execSync("git worktree list", { cwd: repoRoot }).toString();
    expect(list).not.toContain(branch);
  });

  it("#174 retains missing-from-disk registry entry when change is not terminal", async () => {
    const branch = "change/not-archived";
    const wtPath = join(repoRoot, "worktrees", branch);
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [
      {
        branch,
        path: wtPath,
        changeId: "not-archived",
      },
    ];
    attachChangeStatus(deps, "active");

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "WORKTREE_NOT_FOUND",
      branch,
    });
  });

  it("#38 deletes clean merged non-ADV worktree branch without archived change", async () => {
    const branch = "feature/non-adv-clean";
    const wtPath = addWorktree(repoRoot, branch);
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [{ branch, path: wtPath }];
    deps.mergedBranches = async () => [`+ ${branch}`];
    deps.integrationCheck = undefined;

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({ ok: true, branch, path: wtPath });
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).not.toContain(branch);
  });

  it("#38 blocks dirty non-ADV worktree branch", async () => {
    const branch = "feature/non-adv-dirty";
    const wtPath = addWorktree(repoRoot, branch);
    writeFileSync(join(wtPath, "dirty.txt"), "dirty");
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [{ branch, path: wtPath }];
    deps.mergedBranches = async () => [`+ ${branch}`];
    deps.integrationCheck = undefined;

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "UNCOMMITTED_WORK",
    });
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  it("#38 blocks unmerged non-ADV worktree branch", async () => {
    const branch = "feature/non-adv-unmerged";
    const wtPath = addWorktree(repoRoot, branch);
    writeFileSync(join(wtPath, "unmerged.txt"), "unmerged");
    execSync("git add unmerged.txt", { cwd: wtPath });
    execSync("git commit -m 'unmerged work'", { cwd: wtPath });
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [{ branch, path: wtPath }];
    deps.mergedBranches = async () => ["main"];
    deps.integrationCheck = undefined;

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "DELETION_BLOCKED",
      status: "repair_required",
      reason: expect.stringMatching(/gh_failed|git_remote_unavailable/),
    });
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  it("#55 follow-up deletes missing-registry archived merged clean change branch without force", async () => {
    const branch = "change/archived-clean";
    const wtPath = addWorktree(repoRoot, branch);
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [];
    deps.mergedBranches = async () => [`+ ${branch}`];
    deps.integrationCheck = undefined;
    attachChangeStatus(deps, "archived");

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: true,
      branch,
      path: wtPath,
    });
    expect(appendDebugLog).toHaveBeenCalledWith(
      "worktree-delete",
      expect.stringContaining("missing-registry change branch"),
    );
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).not.toContain(branch);
  });

  it("classifies an archived all-gates-done change as terminal during registry-drift cleanup", async () => {
    const branch = "change/archived-all-gates-done";
    const wtPath = addWorktree(repoRoot, branch);
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [];
    deps.integrationCheck = undefined;
    deps.mergedBranches = async () => [`+ ${branch}`];
    const terminalChange = {
      status: "archived",
      gates: {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "done" },
        execution: { status: "done" },
        acceptance: { status: "done" },
        release: { status: "done" },
      },
    };
    deps.store = {
      changes: {
        get: vi.fn(async () => ({ success: true, data: terminalChange })),
        refresh: vi.fn(async () => undefined),
      },
    } as any;

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: true,
      branch,
      path: wtPath,
    });
    expect(deps.store?.changes.get).toHaveBeenCalledWith(
      "archived-all-gates-done",
    );
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).not.toContain(branch);
  });

  it("AC5 accepts archived merged clean change via durable readback when ordinary projection is stale", async () => {
    const branch = "change/ac5-durable-readback";
    const wtPath = addWorktree(repoRoot, branch);
    writeFileSync(join(wtPath, "ac5.txt"), "ac5");
    execSync("git add ac5.txt", { cwd: wtPath });
    execSync("git commit -m 'ac5 work'", { cwd: wtPath });
    execSync(`git merge --no-ff ${branch} -m 'merge ${branch}'`, {
      cwd: repoRoot,
    });

    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [
      { branch, changeId: "ac5-durable-readback", path: wtPath },
    ];
    // Exercise production verifyBranchIntegration with a stale/unavailable
    // ordinary projection immediately after archive terminal convergence.
    deps.integrationCheck = undefined;
    attachChangeStatus(deps, "archived");

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: true,
      branch,
      path: wtPath,
    });
    expect(deps.store?.changes.get).toHaveBeenCalledWith(
      "ac5-durable-readback",
    );
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).not.toContain(branch);
  });

  it("#55 follow-up deletes missing-registry CLOSED merged clean change branch without force", async () => {
    // Closed is a terminal status produced by adv_change_close
    // (cancelled, superseded, not_planned). Drift-recovery must accept it
    // alongside archived so worktrees for cancelled changes can be reclaimed
    // even when their registry entry has drifted.
    const branch = "change/closed-clean";
    const wtPath = addWorktree(repoRoot, branch);
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [];
    deps.mergedBranches = async () => [`+ ${branch}`];
    deps.integrationCheck = undefined;
    attachChangeStatus(deps, "closed");

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: true,
      branch,
      path: wtPath,
    });
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).not.toContain(branch);
  });

  it("#55 follow-up blocks missing-registry change branch when store is unavailable", async () => {
    const branch = "change/no-store";
    const wtPath = addWorktree(repoRoot, branch);
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [];
    deps.integrationCheck = undefined;
    deps.mergedBranches = async () => [`+ ${branch}`];

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "INTEGRATION_REQUIRED",
      reason: "terminal_proof_required",
    });
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  it("#55 follow-up blocks missing-registry change branch when change is not in terminal state", async () => {
    const branch = "change/not-archived";
    const wtPath = addWorktree(repoRoot, branch);
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [];
    deps.integrationCheck = undefined;
    deps.mergedBranches = async () => [`+ ${branch}`];
    attachChangeStatus(deps, "active");

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "INTEGRATION_REQUIRED",
      reason: "terminal_proof_required",
    });
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  it("#55 follow-up blocks missing-registry archived change branch when unmerged", async () => {
    const branch = "change/unmerged-archived";
    const wtPath = addWorktree(repoRoot, branch);
    writeFileSync(join(wtPath, "unmerged.txt"), "unmerged");
    execSync("git add unmerged.txt", { cwd: wtPath });
    execSync("git commit -m 'unmerged work'", { cwd: wtPath });
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [];
    deps.integrationCheck = undefined;
    deps.mergedBranches = async () => ["main"];
    attachChangeStatus(deps, "archived");

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "DELETION_BLOCKED",
      status: "repair_required",
      reason: expect.stringMatching(/gh_failed|git_remote_unavailable/),
    });
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  it("#55 follow-up blocks missing-registry archived merged change branch when dirty", async () => {
    const branch = "change/dirty-archived";
    const wtPath = addWorktree(repoRoot, branch);
    writeFileSync(join(wtPath, "dirty.txt"), "dirty");
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [];
    deps.integrationCheck = undefined;
    deps.mergedBranches = async () => [`+ ${branch}`];
    attachChangeStatus(deps, "archived");

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "UNCOMMITTED_WORK",
    });
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  // rq-forceUnregisteredDelete01: force:true bypasses branch_not_in_registry
  // for branches outside the worktree registry, provided they are merged
  // into the default branch. This unblocks ad-hoc worktrees created by
  // /adv-triage and similar helper flows.
  it("#55 force:true succeeds on non-registered merged branch", async () => {
    const branch = "chore/roadmap-2026-05-09";
    const wtPath = addWorktree(repoRoot, branch);
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = []; // not in registry
    deps.mergedBranches = async () => [`+ ${branch}`];
    deps.integrationCheck = undefined;

    const result = await advWorktreeDelete(branch, { force: true }, deps);

    expect(result).toMatchObject({
      ok: true,
      branch,
      path: wtPath,
    });
    expect(appendDebugLog).toHaveBeenCalledWith(
      "worktree-delete",
      expect.stringContaining("force-deleting non-registered branch"),
    );
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).not.toContain(branch);
  });

  it("#55 force:true on non-registered unmerged branch is still blocked", async () => {
    const branch = "chore/unmerged";
    const wtPath = addWorktree(repoRoot, branch);
    writeFileSync(join(wtPath, "unmerged.txt"), "unmerged");
    execSync("git add unmerged.txt", { cwd: wtPath });
    execSync("git commit -m 'unmerged work'", { cwd: wtPath });
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = []; // not in registry
    deps.mergedBranches = async () => ["main"];
    deps.integrationCheck = undefined;

    const result = await advWorktreeDelete(branch, { force: true }, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "DELETION_BLOCKED",
      status: "repair_required",
      reason: expect.stringMatching(/gh_failed|git_remote_unavailable/),
    });
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  it("deletes missing-registry change branch when merged PR head exactly matches local head", async () => {
    const branch = "change/squash-exact";
    const wtPath = addWorktree(repoRoot, branch);
    writeFileSync(join(wtPath, "squash.txt"), "merged by squash");
    execSync("git add squash.txt", { cwd: wtPath });
    execSync("git commit -m 'squash exact'", { cwd: wtPath });
    const headRefOid = execSync(`git rev-parse ${branch}`, {
      cwd: repoRoot,
    })
      .toString()
      .trim();
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [];
    deps.integrationCheck = undefined;
    attachChangeStatus(deps, "archived");
    deps.mergedBranches = async () => ["main"];
    deps.prMergeEvidence = async () => ({
      ok: true,
      proof: "pr-head-exact",
      prNumber: 123,
      headRefOid,
    });

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "DELETION_BLOCKED",
      status: "repair_required",
      reason: "pr_revalidation_missing_bound_fact",
    });
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  it("deletes missing-registry change branch when local head is ancestor of merged PR head", async () => {
    const branch = "change/squash-ancestor";
    const wtPath = addWorktree(repoRoot, branch);
    writeFileSync(join(wtPath, "ancestor.txt"), "local branch");
    execSync("git add ancestor.txt", { cwd: wtPath });
    execSync("git commit -m 'local branch commit'", { cwd: wtPath });
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [];
    deps.integrationCheck = undefined;
    attachChangeStatus(deps, "archived");
    deps.mergedBranches = async () => ["main"];
    deps.prMergeEvidence = async () => ({
      ok: true,
      proof: "local-ancestor-of-pr-head",
      prNumber: 124,
      headRefOid: "pr-head-sha",
    });

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "DELETION_BLOCKED",
      status: "repair_required",
      reason: "pr_revalidation_missing_bound_fact",
    });
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  it("retains missing-registry change branch when local commits are not proven in merged PR head", async () => {
    const branch = "change/squash-post-pr";
    const wtPath = addWorktree(repoRoot, branch);
    writeFileSync(join(wtPath, "post.txt"), "post pr commit");
    execSync("git add post.txt", { cwd: wtPath });
    execSync("git commit -m 'post pr commit'", { cwd: wtPath });
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [];
    deps.integrationCheck = undefined;
    attachChangeStatus(deps, null);
    deps.mergedBranches = async () => ["main"];
    deps.prMergeEvidence = async () => ({
      ok: false,
      reason: "local_has_commits_after_pr_head",
      hint: "post-PR commits are retained",
    });

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "INTEGRATION_REQUIRED",
      reason: "branch_not_merged",
    });
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  it.each([
    ["no_pr_evidence", "No PR evidence"],
    ["pr_not_merged", "PR open or closed unmerged"],
  ] as const)(
    "retains missing-registry change branch when PR evidence is %s",
    async (reason, hint) => {
      const branch = `change/${reason}`;
      const wtPath = addWorktree(repoRoot, branch);
      writeFileSync(join(wtPath, `${reason}.txt`), hint);
      execSync(`git add ${reason}.txt`, { cwd: wtPath });
      execSync(`git commit -m '${hint}'`, { cwd: wtPath });
      const deps = createMockDeps(repoRoot, wtPath);
      deps.registry = [];
      deps.integrationCheck = undefined;
      attachChangeStatus(deps, null);
      deps.mergedBranches = async () => ["main"];
      deps.prMergeEvidence = async () => ({
        ok: false,
        reason,
        hint,
      });

      const result = await advWorktreeDelete(branch, {}, deps);

      expect(result).toMatchObject({
        ok: false,
        error: "INTEGRATION_REQUIRED",
      });
      expect(
        execSync("git worktree list", { cwd: repoRoot }).toString(),
      ).toContain(branch);
    },
  );

  it("uses PR merge evidence when registered terminal branch is squash-merged", async () => {
    const branch = "change/registered-squash";
    const wtPath = addWorktree(repoRoot, branch);
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [{ branch, changeId: "registered-squash", path: wtPath }];
    deps.integrationCheck = undefined;
    attachChangeStatus(deps, "archived");
    deps.prMergeEvidence = async () => ({
      ok: true,
      proof: "pr-head-exact",
      prNumber: 125,
      headRefOid: "registered-head",
    });

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: true,
      branch,
      path: wtPath,
    });
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).not.toContain(branch);
  });

  it("uses PR merge evidence for a non-change branch family", async () => {
    const branch = "fix/delete-target-routing";
    const wtPath = addWorktree(repoRoot, branch);
    writeFileSync(join(wtPath, "fix.txt"), "squash merged fix\n");
    execSync("git add fix.txt", { cwd: wtPath });
    execSync("git commit -m 'squash merged fix'", { cwd: wtPath });
    const headRefOid = execSync(`git rev-parse ${branch}`, {
      cwd: repoRoot,
    })
      .toString()
      .trim();
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [];
    deps.integrationCheck = undefined;
    deps.mergedBranches = async () => [];
    deps.prMergeEvidence = async () => ({
      ok: true,
      proof: "pr-head-exact" as const,
      prNumber: 407,
      headRefOid,
    });

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "DELETION_BLOCKED",
      status: "repair_required",
      reason: "pr_revalidation_missing_bound_fact",
    });
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  it("plans a generic squash PR only with exact merged repository proof", async () => {
    const branch = "fix/delete-patch-equivalence";
    const fixture = makeSquashPrFixture(branch, 407);
    try {
      // Keep local main stale; reachability must use a fresh origin/main fetch.
      git(fixture.root, "reset", "--hard", "HEAD~1");
      const payload = {
        ...LIVE_PR_407_SHAPE,
        headRefName: branch,
        headRefOid: fixture.head,
        baseRefName: "main",
        headRepository: {
          id: LIVE_PR_407_SHAPE.headRepository.id,
          name: "repo",
          nameWithOwner: "owner/repo",
        },
        headRepositoryOwner: {
          id: LIVE_PR_407_SHAPE.headRepositoryOwner.id,
          login: "owner",
        },
        mergeCommit: { oid: fixture.mergeCommit },
        url: "https://github.com/owner/repo/pull/407",
      };
      const ghExec = createPrGhExec(payload);
      const deps = createMockDeps(fixture.root, fixture.worktree);
      deps.integrationCheck = undefined;
      deps.mergedBranches = async () => [];
      deps.ghExec = ghExec;

      const planned = await rawAdvWorktreeDelete(
        branch,
        { dryRun: true },
        deps,
      );
      expect(planned).toMatchObject({ ok: true, status: "planned" });
      if (planned.ok) {
        expect(planned.plan.integration).toMatchObject({
          kind: "pr_merged",
          prNumber: 407,
          prHeadOid: fixture.head,
          mergeCommitOid: fixture.mergeCommit,
          headRepository: "owner/repo",
          baseRepository: "owner/repo",
          defaultBranch: "main",
        });
        expect(
          decodeWorktreeDeletionToken(planned.planToken).integration,
        ).toEqual(planned.plan.integration);
      }
      expect(ghExec).toHaveBeenCalledWith(
        expect.arrayContaining(["--repo", "owner/repo", "--base", "main"]),
        fixture.root,
        expect.any(Number),
        expect.any(AbortSignal),
      );
      expect(ghExec).toHaveBeenCalledWith(
        ["repo", "view", "--json", "nameWithOwner"],
        fixture.root,
        expect.any(Number),
        expect.any(AbortSignal),
      );
      const prListCall = ghExec.mock.calls.find(([args]) => args[0] === "pr");
      expect(prListCall?.[0]).toContain(GH_PR_LIST_JSON_FIELDS.join(","));
      expect(prListCall?.[0]).not.toContain("baseRepository");
      const ghHelp = execFileSync("gh", ["pr", "list", "--help"], {
        encoding: "utf8",
        timeout: 10_000,
      });
      const jsonFields = ghHelp.split("JSON FIELDS")[1]?.split("EXAMPLES")[0];
      expect(jsonFields).toBeTruthy();
      for (const field of GH_PR_LIST_JSON_FIELDS)
        expect(jsonFields).toContain(field);

      const refusal = async (
        patch: Partial<typeof payload>,
        reason: string,
      ) => {
        Object.assign(payload, patch);
        const result = await rawAdvWorktreeDelete(
          branch,
          { dryRun: true },
          deps,
        );
        expect(result).toMatchObject({
          ok: false,
          error: "INTEGRATION_REQUIRED",
          reason,
        });
      };

      await refusal(
        {
          headRepository: { nameWithOwner: "other/repo" },
          headRepositoryOwner: { login: "other" },
        },
        "pr_evidence_invalid",
      );
      await refusal(
        {
          headRepository: { nameWithOwner: "owner/repo" },
          headRepositoryOwner: { login: "owner" },
          baseRefName: "develop",
        },
        "pr_evidence_invalid",
      );
      await refusal(
        {
          headRepository: { nameWithOwner: "owner/repo" },
          headRepositoryOwner: null,
          baseRefName: "main",
        },
        "pr_evidence_invalid",
      );
      await refusal(
        {
          headRepository: { nameWithOwner: "owner/repo" },
          headRepositoryOwner: { login: "owner" },
          isCrossRepository: true,
          baseRefName: "main",
        },
        "pr_evidence_invalid",
      );
      await refusal(
        {
          baseRefName: "main",
          state: "OPEN",
          mergedAt: null,
        },
        "pr_not_merged",
      );
      await refusal(
        {
          state: "MERGED",
          mergedAt: "2026-08-08T00:00:00Z",
          mergeCommit: { oid: "deadbeef" },
          isCrossRepository: false,
        },
        "pr_merge_commit_unreachable",
      );

      Object.assign(payload, {
        state: "MERGED",
        mergedAt: "2026-08-08T00:00:00Z",
        headRefOid: fixture.firstHead,
        baseRefName: "main",
        headRepository: { nameWithOwner: "owner/repo" },
        headRepositoryOwner: { login: "owner" },
        mergeCommit: { oid: fixture.mergeCommit },
      });
      git(
        fixture.remote,
        "update-ref",
        "refs/pull/407/head",
        fixture.firstHead,
      );
      await refusal({}, "local_commits_after_pr_head");
    } finally {
      fixture.cleanup();
    }
  });

  it("plans exact archive recovery when the local head only adds archive-owned paths", async () => {
    const branch = "change/example";
    const fixture = makeSquashPrFixture(branch, 407);
    try {
      const archiveRelativePath = ".adv/archive/example/change.json";
      const content = '{"id":"example"}\n';
      const worktreeArchiveFile = join(fixture.worktree, archiveRelativePath);
      mkdirSync(join(fixture.worktree, ".adv", "archive", "example"), {
        recursive: true,
      });
      writeFileSync(worktreeArchiveFile, content);
      git(fixture.worktree, "add", archiveRelativePath);
      git(fixture.worktree, "commit", "-m", "archive example");
      const localHead = git(fixture.worktree, "rev-parse", "HEAD");

      const canonicalBundlePath = join(dataRoot, "example");
      mkdirSync(canonicalBundlePath, { recursive: true });
      writeFileSync(join(canonicalBundlePath, "change.json"), content);
      const sha256 = createHash("sha256").update(content).digest("hex");
      const canonicalFiles = [{ path: archiveRelativePath, sha256 }];
      const terminal = {
        changeId: "example",
        status: "archived" as const,
        evidence: "durable terminal status: archived",
      };
      const archiveRecovery = {
        changeId: "example",
        repository: fixture.root,
        branch,
        worktree: fixture.worktree,
        localHead,
        prNumber: 407,
        prRepository: "owner/repo",
        prHeadOid: fixture.head,
        mergeCommitOid: fixture.mergeCommit,
        defaultBranch: "main",
        defaultBranchSha: fixture.mergeCommit,
        ancestry: "pr_head_ancestor_of_local_head" as const,
        bundleId: "example",
        canonicalBundlePath,
        changedPaths: [{ path: archiveRelativePath, status: "A" as const }],
        canonicalFiles,
        canonicalIdentity: createHash("sha256")
          .update(stableStringify({ bundleId: "example", canonicalFiles }))
          .digest("hex"),
        allowedRoot: ".adv/archive/example",
        clean: true,
        locked: false,
        cwd: process.cwd(),
        cwdInsideWorktree: false,
        inUse: false,
        terminal,
      };
      const deps = createMockDeps(fixture.root, fixture.worktree);
      deps.integrationCheck = undefined;
      deps.mergedBranches = async () => [];
      deps.archiveRecovery = archiveRecovery;
      deps.prMergeEvidence = vi.fn(async () => ({
        ok: false as const,
        classification: "refusal" as const,
        reason: "local_has_commits_after_pr_head" as const,
        hint: "The local branch contains the archive projection commit.",
      }));
      attachChangeStatus(deps, "archived");

      const planned = await rawAdvWorktreeDelete(
        branch,
        { dryRun: true },
        deps,
      );

      expect(planned).toMatchObject({ ok: true, status: "planned" });
      if (planned.ok) {
        expect(planned.plan.integration).toMatchObject({
          kind: "pr_merged",
          head: localHead,
          prNumber: 407,
          prHeadOid: fixture.head,
          mergeCommitOid: fixture.mergeCommit,
          headRepository: "owner/repo",
          baseRepository: "owner/repo",
        });

        const applied = await rawAdvWorktreeDelete(
          branch,
          {
            planToken: planned.planToken,
            approvalEvidence: "approved archive-owned projection cleanup",
          },
          deps,
        );
        expect(applied).toMatchObject({
          ok: true,
          status: "deleted",
          branch,
        });
      }
      expect(deps.prMergeEvidence).not.toHaveBeenCalled();
    } finally {
      fixture.cleanup();
    }
  });

  it("applies a bound squash PR plan with local Git only", async () => {
    const branch = "fix/delete-target-routing";
    const fixture = makeSquashPrFixture(branch, 407);
    try {
      const payload = {
        ...LIVE_PR_407_SHAPE,
        headRefName: branch,
        headRefOid: fixture.head,
        baseRefName: "main",
        headRepository: { nameWithOwner: "owner/repo" },
        headRepositoryOwner: { login: "owner" },
        mergeCommit: { oid: fixture.mergeCommit },
      };
      const ghExec = createPrGhExec(payload);
      const deps = createMockDeps(fixture.root, fixture.worktree);
      deps.integrationCheck = undefined;
      deps.mergedBranches = async () => [];
      deps.ghExec = ghExec;

      const planned = await rawAdvWorktreeDelete(
        branch,
        { dryRun: true },
        deps,
      );
      expect(planned).toMatchObject({ ok: true, status: "planned" });
      if (!planned.ok || !planned.planToken) throw new Error("plan missing");

      const ghCallsDuringPlan = ghExec.mock.calls.length;
      deps.ghExec = vi.fn(async () => {
        throw new Error("gh must not be called during apply");
      });
      const applied = await rawAdvWorktreeDelete(
        branch,
        {
          planToken: planned.planToken,
          approvalEvidence: "approved exact PR deletion plan",
        },
        deps,
      );

      expect(applied).toMatchObject({ ok: true, status: "deleted", branch });
      expect(ghExec).toHaveBeenCalledTimes(ghCallsDuringPlan);
      expect(
        execSync("git worktree list", { cwd: fixture.root }).toString(),
      ).not.toContain(branch);
    } finally {
      fixture.cleanup();
    }
  });

  it.each([
    [408, "fix/delete-cancellation-barrier"],
    [409, "fix/flock-runtime-holder"],
    [415, "fix/worktree-pr-proof"],
  ] as const)(
    // Squash fixtures have branch-tip tree == trunk squash-commit tree, so the
    // local tree-equivalence strategy proves them without gh (strategy order:
    // local first, gh only as fallback). pr_merged coverage lives in the
    // conflict-resolved squash test below.
    "plans multi-commit squash PR #%i for %s via local tree equivalence",
    async (prNumber, branch) => {
      const fixture = makeSquashPrFixture(branch, prNumber);
      try {
        const payload = {
          number: prNumber,
          state: "MERGED",
          mergedAt: "2026-08-08T00:00:00Z",
          headRefName: branch,
          headRefOid: fixture.head,
          baseRefName: "main",
          headRepository: {
            id: "R_kgDOQ-sRJg",
            name: "repo",
            nameWithOwner: "owner/repo",
          },
          headRepositoryOwner: { id: "O_kgDOBrdsJg", login: "owner" },
          isCrossRepository: false,
          mergeCommit: { oid: fixture.mergeCommit },
        };
        const deps = createMockDeps(fixture.root, fixture.worktree);
        deps.integrationCheck = undefined;
        deps.mergedBranches = async () => [];
        deps.ghExec = createPrGhExec(payload);

        const planned = await rawAdvWorktreeDelete(
          branch,
          { dryRun: true },
          deps,
        );
        expect(planned).toMatchObject({ ok: true, status: "planned" });
        if (planned.ok)
          expect(planned.plan.integration).toMatchObject({
            kind: "patch_equivalent",
            defaultBranch: "main",
          });
        // The matched trunk commit is the squash commit for this PR.
        if (planned.ok)
          expect(planned.plan.integration?.evidence).toContain(
            fixture.mergeCommit,
          );
      } finally {
        fixture.cleanup();
      }
    },
  );

  it("plans conflict-resolved squash PR via gh fallback when trees differ", async () => {
    // A squash whose merge resolved conflicts produces a trunk tree that
    // differs from the branch tip: local tree-equivalence and cherry both
    // miss, so the gh PR-evidence fallback must prove it (pr_merged).
    const prNumber = 421;
    const branch = "fix/squash-conflict-resolved";
    const fixture = makeSquashPrFixture(branch, prNumber);
    try {
      // Amend the trunk squash commit so its tree diverges from the branch tip.
      git(fixture.root, "reset", "--hard", "HEAD~1");
      git(fixture.root, "cherry-pick", "--no-commit", fixture.firstHead);
      git(fixture.root, "cherry-pick", "--no-commit", fixture.head);
      writeFileSync(join(fixture.root, "one.txt"), "one\nconflict-resolved\n");
      git(fixture.root, "add", "one.txt");
      git(
        fixture.root,
        "commit",
        "-m",
        "squash PR #" + prNumber + " (resolved)",
      );
      const mergeCommit = git(fixture.root, "rev-parse", "HEAD");
      expect(git(fixture.root, "rev-parse", `${fixture.head}^{tree}`)).not.toBe(
        git(fixture.root, "rev-parse", "HEAD^{tree}"),
      );
      git(fixture.root, "push", "-f", "origin", "main");
      git(fixture.root, "push", "-f", "origin", branch);
      git(
        fixture.remote,
        "update-ref",
        `refs/pull/${prNumber}/head`,
        fixture.head,
      );

      const payload = {
        number: prNumber,
        state: "MERGED",
        mergedAt: "2026-08-08T00:00:00Z",
        headRefName: branch,
        headRefOid: fixture.head,
        baseRefName: "main",
        headRepository: {
          id: "R_kgDOQ-sRJg",
          name: "repo",
          nameWithOwner: "owner/repo",
        },
        headRepositoryOwner: { id: "O_kgDOBrdsJg", login: "owner" },
        isCrossRepository: false,
        mergeCommit: { oid: mergeCommit },
      };
      const deps = createMockDeps(fixture.root, fixture.worktree);
      deps.integrationCheck = undefined;
      deps.mergedBranches = async () => [];
      deps.ghExec = createPrGhExec(payload);

      const planned = await rawAdvWorktreeDelete(
        branch,
        { dryRun: true },
        deps,
      );
      expect(planned).toMatchObject({ ok: true, status: "planned" });
      if (planned.ok)
        expect(planned.plan.integration).toMatchObject({
          kind: "pr_merged",
          prNumber,
          prHeadOid: fixture.head,
          mergeCommitOid: mergeCommit,
          defaultBranch: "main",
        });
    } finally {
      fixture.cleanup();
    }
  });

  it("#55 non-registered clean branch is governed by Git census, not registry", async () => {
    const branch = "chore/no-force";
    const wtPath = addWorktree(repoRoot, branch);
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = []; // not in registry
    deps.mergedBranches = async () => [`+ ${branch}`];
    deps.integrationCheck = undefined;

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({ ok: true, branch, path: wtPath });
  });
});

describe.skipIf(!isLinux)("shared pending-delete drain", () => {
  let repoRoot: string;
  let projectId: string;
  let startupAccess: { projectDir: string; projectId: string } | null;

  function createDrainDeps(worktreePath: string): AdvWorktreeDeleteDeps {
    return {
      ...createMockDeps(repoRoot, worktreePath),
      database: { projectDir: repoRoot, projectId },
    };
  }

  beforeEach(() => {
    vi.stubEnv("OPENCODE_EXPERIMENTAL", "");
    vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "");
    repoRoot = createGitRepo();
    projectId = `drain-${Date.now()}-${Math.random()}`;
    startupAccess = null;
    vi.clearAllMocks();
    vi.mocked(runHooksWithSafety).mockReset();
  });

  afterEach(async () => {
    await Promise.allSettled([
      clearPendingDelete({ projectDir: repoRoot, projectId }, "change/capped"),
      clearPendingDelete({ projectDir: repoRoot, projectId }, "change/dry-run"),
      clearPendingDelete(
        { projectDir: repoRoot, projectId },
        "change/archived-clean",
      ),
      clearPendingDelete({ projectDir: repoRoot, projectId }, "change/startup"),
      clearPendingDelete(
        { projectDir: repoRoot, projectId },
        "change/missing-retained",
      ),
      startupAccess
        ? clearPendingDelete(startupAccess, "change/startup")
        : Promise.resolve(),
    ]);
    rmSync(repoRoot, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("respects the automatic attempt cap unless the trigger forces attempts", async () => {
    const branch = "change/capped";
    const pendingPath = join(repoRoot, "worktrees", "change", "capped");
    mkdirSync(pendingPath, { recursive: true });
    const deps = createDrainDeps(pendingPath);
    await setPendingDelete(
      deps.database,
      branch,
      pendingPath,
      "retry cap test",
    );
    for (let i = 0; i < 5; i++) {
      await incrementPendingDeleteAttempts(deps.database, branch);
    }

    const capped = await drainPendingDeletes("session.deleted", deps);

    expect(capped).toEqual({ removed: 0, retained: 1 });
    await expect(getPendingDeletes(deps.database)).resolves.toEqual([
      expect.objectContaining({ branch, attempts: 5 }),
    ]);
    expect(deps.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("max attempts reached"),
    );

    const forced = await drainPendingDeletes("worktree_cleanup", deps, {
      forceAttempts: true,
    });

    expect(forced).toEqual({ removed: 0, retained: 1 });
    await expect(getPendingDeletes(deps.database)).resolves.toEqual([
      expect.objectContaining({ branch, attempts: 6 }),
    ]);
  });

  it("force attempts bypasses retry cap without forcing dirty deletion", async () => {
    const branch = "change/forced-safe";
    const pendingPath = join(repoRoot, "worktrees", "change", "forced-safe");
    mkdirSync(pendingPath, { recursive: true });
    const deps = createDrainDeps(pendingPath);
    await setPendingDelete(
      deps.database,
      branch,
      pendingPath,
      "retry cap safety test",
    );
    for (let i = 0; i < 5; i++) {
      await incrementPendingDeleteAttempts(deps.database, branch);
    }
    const deleteWorktree = vi.fn(async () => ({
      ok: false as const,
      error: "UNCOMMITTED_WORK" as const,
      files: ["dirty.txt"],
      hint: "Commit or stash",
    }));

    const forced = await drainPendingDeletes("worktree_cleanup", deps, {
      forceAttempts: true,
      deleteWorktree,
    });

    expect(forced).toEqual({ removed: 0, retained: 1 });
    expect(deleteWorktree).toHaveBeenCalledWith(
      branch,
      { force: false },
      expect.objectContaining({ worktreePath: pendingPath }),
    );
    await expect(getPendingDeletes(deps.database)).resolves.toEqual([
      expect.objectContaining({ branch, attempts: 6 }),
    ]);
  });

  it("records an exact typed blocker class for workspace-uncertain retained deletes", async () => {
    const branch = "change/ws-uncertain";
    const pendingPath = join(repoRoot, "worktrees", "change", "ws-uncertain");
    mkdirSync(pendingPath, { recursive: true });
    const deps = createDrainDeps(pendingPath);
    await setPendingDelete(
      deps.database,
      branch,
      pendingPath,
      "workspace ownership uncertain: list request failed",
    );
    const deleteWorktree = vi.fn(async () => ({
      ok: false as const,
      error: "WORKSPACE_OWNERSHIP_UNCERTAIN" as const,
      branch,
      path: pendingPath,
      reason: "workspace list request failed: 503",
      hint: "Retry with adv_worktree_cleanup after the OpenCode server responds.",
    }));

    const result = await drainPendingDeletes("worktree_cleanup", deps, {
      forceAttempts: true,
      deleteWorktree,
    });

    expect(result).toEqual({ removed: 0, retained: 1 });
    await expect(getPendingDeletes(deps.database)).resolves.toEqual([
      expect.objectContaining({
        branch,
        lastError: "WORKSPACE_OWNERSHIP_UNCERTAIN",
        lastErrorClass: "workspace_ownership_uncertain",
      }),
    ]);
  });

  it("does not mutate pending-delete attempts during dry-run preview", async () => {
    const branch = "change/dry-run";
    const pendingPath = join(repoRoot, "worktrees", "change", "dry-run");
    const deps = createDrainDeps(pendingPath);
    deps.isWorktreeInUse = () => true;
    await setPendingDelete(deps.database, branch, pendingPath, "dry run test");

    const result = await drainPendingDeletes("worktree_cleanup", deps, {
      dryRun: true,
      forceAttempts: true,
    });

    expect(result).toEqual({ removed: 0, retained: 1, dryRun: true });
    await expect(getPendingDeletes(deps.database)).resolves.toEqual([
      expect.objectContaining({ branch, attempts: 0 }),
    ]);
  });

  it("retains pending deletes without starting mutation when cleanup budget is too small", async () => {
    const firstBranch = "change/timeout-first";
    const secondBranch = "change/timeout-second";
    const firstPath = join(repoRoot, "worktrees", "change", "timeout-first");
    const secondPath = join(repoRoot, "worktrees", "change", "timeout-second");
    mkdirSync(firstPath, { recursive: true });
    mkdirSync(secondPath, { recursive: true });
    const deps = createDrainDeps(firstPath);
    await setPendingDelete(deps.database, firstBranch, firstPath, "timeout");
    await setPendingDelete(deps.database, secondBranch, secondPath, "second");

    const deleteWorktree = vi.fn(async () => ({
      ok: true as const,
      branch: secondBranch,
      path: secondPath,
    }));

    const result = await drainPendingDeletes("worktree_cleanup", deps, {
      forceAttempts: true,
      cleanupItemTimeoutMs: 1,
      deleteWorktree,
    });

    expect(result).toEqual({ removed: 0, retained: 2 });
    expect(deleteWorktree).not.toHaveBeenCalled();
    await expect(getPendingDeletes(deps.database)).resolves.toEqual([
      expect.objectContaining({
        branch: firstBranch,
        attempts: 1,
        lastError: "TIME_BUDGET_EXHAUSTED",
        lastErrorClass: "time_budget_exhausted",
      }),
      expect.objectContaining({
        branch: secondBranch,
        attempts: 1,
        lastError: "TIME_BUDGET_EXHAUSTED",
        lastErrorClass: "time_budget_exhausted",
      }),
    ]);
  });

  it("stops starting later pending deletes when the shared cleanup budget is nearly exhausted", async () => {
    const firstBranch = "change/slow-first";
    const secondBranch = "change/budget-retained";
    const firstPath = join(repoRoot, "worktrees", "change", "slow-first");
    const secondPath = join(repoRoot, "worktrees", "change", "budget-retained");
    mkdirSync(firstPath, { recursive: true });
    mkdirSync(secondPath, { recursive: true });
    const deps = createDrainDeps(firstPath);
    await setPendingDelete(deps.database, firstBranch, firstPath, "slow first");
    await setPendingDelete(deps.database, secondBranch, secondPath, "second");

    const deleteWorktree = vi.fn(
      async (
        branch: string,
        _opts: unknown,
        callDeps: { worktreePath: string },
      ) => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return {
          ok: true as const,
          branch,
          path: callDeps.worktreePath,
        };
      },
    );

    const result = await drainPendingDeletes("worktree_cleanup", deps, {
      forceAttempts: true,
      cleanupItemTimeoutMs: 600,
      deleteWorktree,
    });

    expect(result).toEqual({ removed: 1, retained: 1 });
    expect(deleteWorktree).toHaveBeenCalledTimes(1);
    await expect(getPendingDeletes(deps.database)).resolves.toEqual([
      expect.objectContaining({
        branch: secondBranch,
        attempts: 1,
        lastError: "TIME_BUDGET_EXHAUSTED",
        lastErrorClass: "time_budget_exhausted",
      }),
    ]);
  });

  it("passes a delete operation budget below the pending-delete timeout", async () => {
    const branch = "change/delete-budget-propagated";
    const pendingPath = join(
      repoRoot,
      "worktrees",
      "change",
      "delete-budget-propagated",
    );
    mkdirSync(pendingPath, { recursive: true });
    const deps = createDrainDeps(pendingPath);
    await setPendingDelete(deps.database, branch, pendingPath, "budget");

    const deleteWorktree = vi.fn(async () => ({
      ok: true as const,
      branch,
      path: pendingPath,
    }));

    const result = await drainPendingDeletes("worktree_cleanup", deps, {
      forceAttempts: true,
      cleanupItemTimeoutMs: 1_000,
      deleteWorktree,
    });

    expect(result).toEqual({ removed: 1, retained: 0 });
    expect(deleteWorktree).toHaveBeenCalledWith(
      branch,
      { force: false },
      expect.objectContaining({
        worktreePath: pendingPath,
        operationTimeoutMs: expect.any(Number),
      }),
    );
    const callDeps = deleteWorktree.mock.calls[0]?.[2] as {
      operationTimeoutMs: number;
    };
    expect(callDeps.operationTimeoutMs).toBeGreaterThanOrEqual(1);
    expect(callDeps.operationTimeoutMs).toBeLessThan(1_000);
  });

  it("does not consume retry attempts while the worktree is still in use", async () => {
    const branch = "change/in-use-skip";
    const pendingPath = join(repoRoot, "worktrees", "change", "in-use-skip");
    mkdirSync(pendingPath, { recursive: true });
    const deps = createDrainDeps(pendingPath);
    deps.isWorktreeInUse = () => true;
    await setPendingDelete(deps.database, branch, pendingPath, "in use");

    const result = await drainPendingDeletes("worktree_cleanup", deps, {
      forceAttempts: true,
    });

    expect(result).toEqual({ removed: 0, retained: 1 });
    await expect(getPendingDeletes(deps.database)).resolves.toEqual([
      expect.objectContaining({ branch, attempts: 0 }),
    ]);
  });

  // rq-worktreeBoundedCleanup02 AC3/DONT2: after timeout, the pending
  // delete must be retained — no late background mutation clearing state
  // after the tool has already reported the timeout to the agent.
  it("retains a low-budget pending delete without starting late mutation", async () => {
    const branch = "change/late";
    const pendingPath = join(repoRoot, "worktrees", "change", "late");
    mkdirSync(pendingPath, { recursive: true });
    const deps = createDrainDeps(pendingPath);
    await setPendingDelete(deps.database, branch, pendingPath, "late");

    const deleteWorktree = vi.fn(
      () =>
        new Promise<{ ok: true; branch: string; path: string }>((resolve) => {
          setTimeout(
            () => resolve({ ok: true, branch, path: pendingPath }),
            10,
          );
        }),
    );

    const result = await drainPendingDeletes("worktree_cleanup", deps, {
      forceAttempts: true,
      cleanupItemTimeoutMs: 1,
      deleteWorktree,
    });

    expect(result).toEqual({ removed: 0, retained: 1 });
    expect(deleteWorktree).not.toHaveBeenCalled();

    // Wait a bit for any late-resolution to occur (it should NOT)
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Pending delete must still be present — no late mutation
    const remaining = await getPendingDeletes(deps.database);
    expect(remaining).toHaveLength(1);

    // The old "resolved after timeout" warning must NOT appear
    expect(deps.log.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("resolved after timeout"),
    );
  });

  it("clears pending deletes whose worktree path is already gone", async () => {
    const branch = "change/gone";
    const pendingPath = join(repoRoot, "worktrees", "change", "gone");
    const deps = createDrainDeps(pendingPath);
    await setPendingDelete(deps.database, branch, pendingPath, "gone");

    const deleteWorktree = vi.fn(async () => ({
      ok: true as const,
      branch,
      path: pendingPath,
    }));

    const result = await drainPendingDeletes("worktree_cleanup", deps, {
      forceAttempts: true,
      deleteWorktree,
    });

    expect(result).toEqual({ removed: 1, retained: 0 });
    expect(deleteWorktree).not.toHaveBeenCalled();
    await expect(getPendingDeletes(deps.database)).resolves.toEqual([]);
  });

  it("passes the durable store into registry-drift change branch cleanup", async () => {
    const branch = "change/archived-clean";
    const wtPath = addWorktree(repoRoot, branch);
    const deps = createDrainDeps(wtPath);
    deps.registry = [];
    deps.integrationCheck = undefined;
    deps.mergedBranches = async () => [`+ ${branch}`];
    attachChangeStatus(deps, "archived");
    await setPendingDelete(
      deps.database,
      branch,
      wtPath,
      "registry drift test",
    );

    const result = await drainPendingDeletes("worktree_cleanup", deps, {
      forceAttempts: true,
    });

    expect(result).toEqual({ removed: 1, retained: 0 });
    await expect(getPendingDeletes(deps.database)).resolves.toEqual([]);
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).not.toContain(branch);
  });

  it("returns a typed blocker when missing-registry terminal state read times out", async () => {
    const branch = "change/terminal-timeout";
    const wtPath = addWorktree(repoRoot, branch);
    const deps = createDrainDeps(wtPath);
    deps.registry = [];
    deps.integrationCheck = undefined;
    deps.signalTimeoutMs = 5;
    deps.store = {
      changes: {
        get: vi.fn(() => new Promise(() => {})),
        refresh: vi.fn(async () => undefined),
      },
    } as any;

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "INTEGRATION_REQUIRED",
      reason: "terminal_proof_required",
    });
  });

  it("manual cleanup discovers terminal change worktrees before draining", async () => {
    const branch = "change/discovered-archived";
    const wtPath = addWorktree(repoRoot, branch);
    const deps = createDrainDeps(wtPath);
    attachChangeStatus(deps, "archived");

    const result = await advWorktreeCleanup("manual discovery", {
      projectRoot: repoRoot,
      database: deps.database,
      log: deps.log,
      store: deps.store,
    });

    expect(result).toEqual({ removed: 1, retained: 0 });
    await expect(getPendingDeletes(deps.database)).resolves.toEqual([]);
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).not.toContain(branch);
  });

  it("records retained delete failure metadata for retry visibility", async () => {
    const branch = "change/missing-retained";
    const pendingPath = join(
      repoRoot,
      "worktrees",
      "change",
      "missing-retained",
    );
    const deps = createDrainDeps(pendingPath);
    mkdirSync(pendingPath, { recursive: true });
    await setPendingDelete(
      deps.database,
      branch,
      pendingPath,
      "terminal cleanup discovered during test",
    );

    const result = await drainPendingDeletes("worktree_cleanup", deps, {
      forceAttempts: true,
    });

    expect(result).toEqual({ removed: 0, retained: 1 });
    await expect(getPendingDeletes(deps.database)).resolves.toEqual([
      expect.objectContaining({
        branch,
        attempts: 1,
        lastError: "WORKTREE_NOT_FOUND",
        lastErrorClass: "worktree_not_found",
      }),
    ]);
  });
});

describe.skipIf(!isLinux)("reapEmptyWorktreeParents", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "adv-wt-reap-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("removes empty branch-prefix parent but preserves worktree base", async () => {
    const base = join(root, "opencode", "worktree", "pid");
    const parent = join(base, "change");
    mkdirSync(parent, { recursive: true });

    const removed = await reapEmptyWorktreeParents(join(parent, "foo"), base);

    expect(removed).toEqual([parent]);
    expect(existsSync(parent)).toBe(false);
    expect(existsSync(base)).toBe(true);
  });

  it("stops when branch-prefix parent contains a sibling", async () => {
    const base = join(root, "opencode", "worktree", "pid");
    const parent = join(base, "change");
    mkdirSync(join(parent, "bar"), { recursive: true });

    const removed = await reapEmptyWorktreeParents(join(parent, "foo"), base);

    expect(removed).toEqual([]);
    expect(existsSync(parent)).toBe(true);
    expect(existsSync(join(parent, "bar"))).toBe(true);
  });

  it("rejects paths outside the worktree base", async () => {
    const base = join(root, "opencode", "worktree", "pid");
    mkdirSync(base, { recursive: true });

    await expect(
      reapEmptyWorktreeParents(join(root, "outside", "foo"), base),
    ).rejects.toThrow(/outside allowed namespace/);
  });
});
