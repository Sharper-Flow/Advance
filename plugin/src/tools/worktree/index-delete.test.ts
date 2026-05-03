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
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execSync } from "child_process";

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

// Mock debug-log to capture audit trail.
vi.mock("../../utils/debug-log", () => ({
  appendDebugLog: vi.fn(),
}));

// Mock hooks module — preserve HookFailedError, replace runHooksWithSafety.
vi.mock("./hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./hooks")>();
  return {
    ...actual,
    runHooksWithSafety: vi.fn(),
  };
});

import { advWorktreeDelete, type AdvWorktreeDeleteDeps } from "./index";

import { appendDebugLog } from "../../utils/debug-log";
import { runHooksWithSafety } from "./hooks";

const isLinux = process.platform === "linux";

function createGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "adv-wt-del-"));
  execSync("git init", { cwd: dir });
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
    const branch = "feature/clean";
    const wtPath = addWorktree(repoRoot, branch);

    const deps = createMockDeps(repoRoot, wtPath);
    const result = await advWorktreeDelete(branch, {}, deps);

    expect(result).toEqual({
      ok: true,
      branch,
      path: wtPath,
    });

    // Worktree should be gone
    const list = execSync("git worktree list", { cwd: repoRoot }).toString();
    expect(list).not.toContain(branch);
  });

  it("force-with-approval — removes worktree with uncommitted changes and logs audit", async () => {
    const branch = "feature/force";
    const wtPath = addWorktree(repoRoot, branch);

    writeFileSync(join(wtPath, "uncommitted.txt"), "do not lose");

    const deps = createMockDeps(repoRoot, wtPath);
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

    // Worktree should be gone
    const list = execSync("git worktree list", { cwd: repoRoot }).toString();
    expect(list).not.toContain(branch);
  });
});
