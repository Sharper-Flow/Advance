/**
 * Tests for ADV-safe worktree create flow (T10 — KD-13, peer-review F3, R14).
 *
 * Uses ephemeral git fixtures (mkdtempSync + git init + git worktree add)
 * to verify the 5 scenarios:
 *   1. DEFAULT_BRANCH_UNRESOLVABLE — stub resolveDefaultBranch returns null
 *   2. STALE_BASE — stub detectStaleBasis returns stale; force overrides
 *   3. Clean create with default base — fixture repo with origin/HEAD
 *   4. Clean create with explicit base — fixture repo with trunk and develop
 *   5. BRANCH_LOCKED — stub flock returns owned: false
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

import { advWorktreeCreate, type AdvWorktreeCreateDeps } from "./index";

import { runHooksWithSafety } from "./hooks";

const isLinux = process.platform === "linux";

function createGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "adv-wt-create-"));
  execSync("git init", { cwd: dir });
  execSync("git config user.email 'test@test.com'", { cwd: dir });
  execSync("git config user.name 'Test'", { cwd: dir });
  // Ensure default branch is "main" for predictable test behavior
  execSync("git branch -m main", { cwd: dir });
  writeFileSync(join(dir, "README.md"), "# test");
  execSync("git add README.md", { cwd: dir });
  execSync("git commit -m 'initial'", { cwd: dir });
  return dir;
}

function createMockDeps(repoRoot: string): AdvWorktreeCreateDeps {
  return {
    projectRoot: repoRoot,
    database: { projectDir: repoRoot, projectId: "test-id" },
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

describe.skipIf(!isLinux)(
  "ADV-safe worktree create (T10)",
  { sequence: { concurrent: false } },
  () => {
    let repoRoot: string;

    beforeEach(() => {
      repoRoot = createGitRepo();
      vi.clearAllMocks();
      vi.mocked(runHooksWithSafety).mockReset();
    });

    afterEach(() => {
      rmSync(repoRoot, { recursive: true, force: true });
    });

    it("DEFAULT_BRANCH_UNRESOLVABLE — blocks when default branch cannot be resolved", async () => {
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => null;

      const result = await advWorktreeCreate("feature/test", {}, deps);

      expect(result).toEqual({
        ok: false,
        error: "DEFAULT_BRANCH_UNRESOLVABLE",
        hint: "Specify opts.base explicitly or fix repo HEAD (no origin/HEAD, no init.defaultBranch, no main branch found)",
      });

      // Worktree should NOT be created
      const list = execSync("git worktree list", { cwd: repoRoot }).toString();
      expect(list).not.toContain("feature/test");
    });

    it("STALE_BASE — blocks when base is stale and force is not set", async () => {
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({
        stale: true,
        reason: "branch is merged and remote-deleted",
        suggestion: "git switch main && git branch -d old-branch",
      });

      const result = await advWorktreeCreate("feature/test", {}, deps);

      expect(result).toEqual({
        ok: false,
        error: "STALE_BASE",
        reason: "branch is merged and remote-deleted",
        suggestion: "git switch main && git branch -d old-branch",
      });

      // Worktree should NOT be created
      const list = execSync("git worktree list", { cwd: repoRoot }).toString();
      expect(list).not.toContain("feature/test");
    });

    it("STALE_BASE — force overrides stale check", async () => {
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({
        stale: true,
        reason: "branch is merged and remote-deleted",
        suggestion: "git switch main && git branch -d old-branch",
      });

      const result = await advWorktreeCreate(
        "feature/test",
        { force: true },
        deps,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.branch).toBe("feature/test");
        expect(result.baseRef).toBe("main");
      }

      // Worktree should exist
      const list = execSync("git worktree list", { cwd: repoRoot }).toString();
      expect(list).toContain("feature/test");
    });

    it("clean create with default base — resolves base from origin/HEAD", async () => {
      // Create a repo with origin/HEAD pointing to trunk
      const remoteDir = mkdtempSync(join(tmpdir(), "adv-wt-remote-"));
      execSync("git init --bare", { cwd: remoteDir });
      execSync(`git remote add origin ${remoteDir}`, { cwd: repoRoot });

      // Create trunk branch and push it
      execSync("git checkout -b trunk", { cwd: repoRoot });
      writeFileSync(join(repoRoot, "trunk.md"), "trunk");
      execSync("git add trunk.md", { cwd: repoRoot });
      execSync("git commit -m 'trunk commit'", { cwd: repoRoot });
      execSync("git push -u origin trunk", { cwd: repoRoot });

      // Set origin/HEAD to point to trunk
      execSync(
        "git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/trunk",
        { cwd: repoRoot },
      );

      const deps = createMockDeps(repoRoot);
      // Use real getDefaultBranch
      deps.resolveDefaultBranch = undefined;
      deps.detectStaleBasis = async () => ({ stale: false });

      const result = await advWorktreeCreate("change/feature", {}, deps);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.branch).toBe("change/feature");
        expect(result.baseRef).toBe("trunk");
        expect(result.path).toContain("change/feature");
        expect(result.headSha).toBeTruthy();
      }

      // Worktree should exist
      const list = execSync("git worktree list", { cwd: repoRoot }).toString();
      expect(list).toContain("change/feature");
    });

    it("clean create with explicit base — uses provided base branch", async () => {
      // Create develop branch
      execSync("git checkout -b develop", { cwd: repoRoot });
      writeFileSync(join(repoRoot, "develop.md"), "develop");
      execSync("git add develop.md", { cwd: repoRoot });
      execSync("git commit -m 'develop commit'", { cwd: repoRoot });

      // Go back to main
      execSync("git checkout main", { cwd: repoRoot });

      const deps = createMockDeps(repoRoot);
      deps.detectStaleBasis = async () => ({ stale: false });

      const result = await advWorktreeCreate(
        "change/feature",
        { base: "develop" },
        deps,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.branch).toBe("change/feature");
        expect(result.baseRef).toBe("develop");
      }

      // Worktree should exist
      const list = execSync("git worktree list", { cwd: repoRoot }).toString();
      expect(list).toContain("change/feature");
    });

    it("BRANCH_LOCKED — blocks when flock is held by another session", async () => {
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });
      deps.flock = {
        acquire: async () => ({ owned: false, release: async () => {} }),
      };

      const result = await advWorktreeCreate("feature/test", {}, deps);

      expect(result).toEqual({
        ok: false,
        error: "BRANCH_LOCKED",
        hint: "Another session is creating a worktree; retry in a moment",
      });

      // Worktree should NOT be created
      const list = execSync("git worktree list", { cwd: repoRoot }).toString();
      expect(list).not.toContain("feature/test");
    });
  },
);
