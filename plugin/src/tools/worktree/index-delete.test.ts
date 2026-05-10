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
import { execSync } from "child_process";

const workflowSignal = vi.hoisted(() => vi.fn(async () => undefined));

// Mock project-workflow-helper so state.ts resolveAccess returns workflow-backed.
vi.mock("../project-workflow-helper", () => ({
  getBoundedProjectWorkflowAccess: vi.fn(async () => ({
    mode: "workflow-backed",
    handle: {
      query: vi.fn(async () => ({
        session_registry: {},
        worktree_registry: {},
        pending_worktree_deletes: {},
        change_summaries: {},
      })),
      executeUpdate: vi.fn(async () => undefined),
    },
  })),
}));

// Mock temporal/service so fireWorktreeSignal can reach a handle.
vi.mock("../../temporal/service", () => ({
  getService: vi.fn(() => ({
    connection: { close: vi.fn() },
    client: {
      workflow: {
        getHandle: vi.fn(() => ({ signal: workflowSignal, query: vi.fn() })),
      },
    },
  })),
}));

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
  advWorktreeDelete,
  reapEmptyWorktreeParents,
  type AdvWorktreeDeleteDeps,
} from "./index";

import { appendDebugLog } from "../../utils/debug-log";
import { runHooksWithSafety } from "./hooks";
import { worktreeDeletedSignal } from "../../temporal/messages";

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

function createMockDeps(
  projectRoot: string,
  worktreePath: string,
): AdvWorktreeDeleteDeps {
  return {
    projectRoot,
    database: { projectDir: projectRoot, projectId: "test-id" },
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

  beforeEach(() => {
    repoRoot = createGitRepo();
    vi.clearAllMocks();
    vi.mocked(runHooksWithSafety).mockReset();
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("INTEGRATION_REQUIRED — blocks delete when branch integration fails", async () => {
    const branch = "feature/test";
    const wtPath = addWorktree(repoRoot, branch);

    const deps = createMockDeps(repoRoot, wtPath);
    deps.integrationCheck = async () => ({
      ok: false,
      reason: "change_not_archived",
      detail: "Change is not archived",
      hint: "Archive the change first",
    });

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toEqual({
      ok: false,
      error: "INTEGRATION_REQUIRED",
      reason: "change_not_archived",
      hint: "Branch must be archived, merged, and clean",
    });

    // Worktree should still exist
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
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
    expect(result.files.length).toBeGreaterThan(0);

    // Worktree should still exist
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
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
      error: "HOOK_INTRODUCED_CHANGES",
      hint: expect.stringContaining("Hook introduced"),
    });
    expect(result).toHaveProperty("files");
    if (result.ok || result.error !== "HOOK_INTRODUCED_CHANGES") {
      throw new Error("expected HOOK_INTRODUCED_CHANGES result");
    }
    expect(result.files.length).toBeGreaterThan(0);

    // Worktree should still exist
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  it("clean delete succeeds — removes worktree and calls removeSession", async () => {
    const branch = "change/clean";
    const wtPath = addWorktree(repoRoot, branch);

    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [{ branch, path: wtPath, changeId: "clean" }];
    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toEqual({
      ok: true,
      branch,
      path: wtPath,
    });

    expect(workflowSignal).toHaveBeenCalledWith(
      worktreeDeletedSignal,
      expect.objectContaining({
        branch: "change/clean",
        reason: "integration_complete",
        deletedAt: expect.any(String),
      }),
    );

    // Worktree should be gone
    const list = execSync("git worktree list", { cwd: repoRoot }).toString();
    expect(list).not.toContain(branch);
  });

  it("force-with-approval — removes worktree with uncommitted changes and logs audit", async () => {
    const branch = "change/force";
    const wtPath = addWorktree(repoRoot, branch);

    writeFileSync(join(wtPath, "uncommitted.txt"), "do not lose");

    const deps = createMockDeps(repoRoot, wtPath);
    // ADV-registered worktree (changeId set) — uses integrationCheck seam.
    deps.registry = [{ branch, path: wtPath, changeId: "test-change" }];
    const result = await advWorktreeDelete(branch, { force: true }, deps);

    expect(result).toEqual({
      ok: true,
      branch,
      path: wtPath,
    });

    // Audit log should have been written
    expect(appendDebugLog).toHaveBeenCalledWith(
      "worktree-delete",
      expect.stringContaining("force-removing"),
    );

    expect(workflowSignal).toHaveBeenCalledWith(
      worktreeDeletedSignal,
      expect.objectContaining({
        branch: "change/force",
        reason: "force_delete",
        deletedAt: expect.any(String),
      }),
    );

    // Worktree should be gone
    const list = execSync("git worktree list", { cwd: repoRoot }).toString();
    expect(list).not.toContain(branch);
  });

  it("#36 removes missing-from-disk registry entry when path and branch are gone", async () => {
    const branch = "change/missing-from-disk";
    const wtPath = join(repoRoot, "worktrees", branch);
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [
      {
        branch,
        path: wtPath,
        changeId: "missing-from-disk",
      },
    ];
    deps.integrationCheck = async () => {
      throw new Error("integration check must be skipped for missing disk");
    };

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toEqual({
      ok: true,
      branch,
      path: wtPath,
    });
    expect(appendDebugLog).toHaveBeenCalledWith(
      "worktree-delete",
      expect.stringContaining("removed stale missing-from-disk registry entry"),
    );
  });

  it("#38 deletes clean merged non-ADV worktree branch without archived change", async () => {
    const branch = "feature/non-adv-clean";
    const wtPath = addWorktree(repoRoot, branch);
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [{ branch, path: wtPath }];
    deps.mergedBranches = async () => [`+ ${branch}`];
    deps.integrationCheck = async () => {
      throw new Error(
        "ADV integration check must be skipped for non-ADV branch",
      );
    };

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toEqual({
      ok: true,
      branch,
      path: wtPath,
    });
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
    deps.integrationCheck = async () => {
      throw new Error(
        "ADV integration check must be skipped for non-ADV branch",
      );
    };

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
    deps.integrationCheck = async () => {
      throw new Error(
        "ADV integration check must be skipped for non-ADV branch",
      );
    };

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

  it("#55 follow-up deletes missing-registry archived merged clean change branch without force", async () => {
    const branch = "change/archived-clean";
    const wtPath = addWorktree(repoRoot, branch);
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [];
    deps.mergedBranches = async () => [`+ ${branch}`];
    deps.integrationCheck = async () => {
      throw new Error("registry-drift recovery must skip registry integration");
    };
    attachChangeStatus(deps, "archived");

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toEqual({ ok: true, branch, path: wtPath });
    expect(appendDebugLog).toHaveBeenCalledWith(
      "worktree-delete",
      expect.stringContaining("missing-registry change branch"),
    );
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).not.toContain(branch);
  });

  it("#55 follow-up blocks missing-registry change branch when store is unavailable", async () => {
    const branch = "change/no-store";
    const wtPath = addWorktree(repoRoot, branch);
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [];
    deps.mergedBranches = async () => [`+ ${branch}`];

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "INTEGRATION_REQUIRED",
      reason: "registry_drift_recovery_requires_store",
    });
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  it("#55 follow-up blocks missing-registry change branch when change is not archived", async () => {
    const branch = "change/not-archived";
    const wtPath = addWorktree(repoRoot, branch);
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [];
    deps.mergedBranches = async () => [`+ ${branch}`];
    attachChangeStatus(deps, "active");

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "INTEGRATION_REQUIRED",
      reason: "change_not_archived",
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
    deps.mergedBranches = async () => ["main"];
    attachChangeStatus(deps, "archived");

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

  it("#55 follow-up blocks missing-registry archived merged change branch when dirty", async () => {
    const branch = "change/dirty-archived";
    const wtPath = addWorktree(repoRoot, branch);
    writeFileSync(join(wtPath, "dirty.txt"), "dirty");
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = [];
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
    deps.integrationCheck = async () => {
      throw new Error(
        "ADV integration check must be skipped for force-unregistered path",
      );
    };

    const result = await advWorktreeDelete(branch, { force: true }, deps);

    expect(result).toEqual({ ok: true, branch, path: wtPath });
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
    deps.integrationCheck = async () => {
      throw new Error("integration check should not run on force path");
    };

    const result = await advWorktreeDelete(branch, { force: true }, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "INTEGRATION_REQUIRED",
      reason: "branch_not_merged",
    });
    expect(
      execSync("git worktree list", { cwd: repoRoot }).toString(),
    ).toContain(branch);
  });

  it("#55 non-registered branch without force still fails branch_not_in_registry", async () => {
    const branch = "chore/no-force";
    const wtPath = addWorktree(repoRoot, branch);
    const deps = createMockDeps(repoRoot, wtPath);
    deps.registry = []; // not in registry
    // integrationCheck is the default mock (which would pass), but the
    // non-force path runs verifyBranchIntegration via the seam — override
    // it to confirm we hit the registry-check branch.
    deps.integrationCheck = async () => ({
      ok: false,
      reason: "branch_not_in_registry",
      detail: "branch not registered",
      hint: "registry hint",
    });

    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toMatchObject({
      ok: false,
      error: "INTEGRATION_REQUIRED",
      reason: "branch_not_in_registry",
    });
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
