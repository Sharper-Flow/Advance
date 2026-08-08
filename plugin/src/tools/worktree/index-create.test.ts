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
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execSync } from "child_process";

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
  advWorktreeCreate,
  advWorktreeResume,
  type AdvWorktreeCreateDeps,
} from "./index";

import { runHooksWithSafety } from "./hooks";
import { getWorktreePath } from "./state";

// Legacy notification sentinels remain only so retired no-signal assertions
// can state their boundary without importing removed notification modules.

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
    database: {
      projectDir: repoRoot,
      projectId: "0e000d0000000000000000000000000000000000",
    },
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

function createContentionDeps(): NonNullable<
  AdvWorktreeCreateDeps["contention"]
> {
  let clock = 0;
  return {
    budgetMs: 1500,
    baseMs: 25,
    capMs: 250,
    now: () => clock,
    sleep: (ms) => {
      clock += ms;
      return Promise.resolve();
    },
    random: () => 0,
  };
}

describe.skipIf(!isLinux)(
  "ADV-safe worktree create (T10)",
  { sequence: { concurrent: false } },
  () => {
    let repoRoot: string;
    let cleanupPaths: string[];

    beforeEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      // Clear shell-leaked experimental env vars so flag-off tests assert
      // the off-by-default warpFlagEnabled() behavior. P25 touched-scope
      // fix as part of fixWarpSessionLookup (T1).
      vi.stubEnv("OPENCODE_EXPERIMENTAL", "");
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "");
      repoRoot = createGitRepo();
      cleanupPaths = [];
      vi.clearAllMocks();
      vi.mocked(runHooksWithSafety).mockReset();
    });

    afterEach(() => {
      for (const cleanupPath of cleanupPaths) {
        rmSync(cleanupPath, { recursive: true, force: true });
      }
      rmSync(repoRoot, { recursive: true, force: true });
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it("reuses an existing change worktree before creating a duplicate", async () => {
      const existingPath = mkdtempSync(join(tmpdir(), "adv-wt-existing-"));
      rmSync(existingPath, { recursive: true, force: true });
      cleanupPaths.push(existingPath);
      execSync(`git worktree add -b change/existing ${existingPath} main`, {
        cwd: repoRoot,
      });

      const deps = createMockDeps(repoRoot);
      const resolveDefaultBranch = vi.fn(async () => {
        throw new Error("reuse should not resolve base branch");
      });
      const detectStaleBasis = vi.fn(async () => {
        throw new Error("reuse should not run stale-basis checks");
      });
      deps.resolveDefaultBranch = resolveDefaultBranch;
      deps.detectStaleBasis = detectStaleBasis;

      const result = await advWorktreeCreate("change/existing", {}, deps);

      expect(result).toMatchObject({
        ok: true,
        branch: "change/existing",
        path: existingPath,
        reused: true,
      });
      if (result.ok) {
        expect(result.headSha).toBe(
          execSync("git rev-parse HEAD", { cwd: existingPath })
            .toString()
            .trim(),
        );
      }
      expect(resolveDefaultBranch).not.toHaveBeenCalled();
      expect(detectStaleBasis).not.toHaveBeenCalled();
    });

    it("blocks an existing git worktree when another active change owns the branch", async () => {
      const existingPath = mkdtempSync(join(tmpdir(), "adv-wt-owned-"));
      rmSync(existingPath, { recursive: true, force: true });
      cleanupPaths.push(existingPath);
      execSync(`git worktree add -b change/owned ${existingPath} main`, {
        cwd: repoRoot,
      });
      const result = await advWorktreeCreate(
        "change/owned",
        {},
        createMockDeps(repoRoot),
      );

      expect(result).toMatchObject({
        ok: true,
        reused: true,
        branch: "change/owned",
      });
    });

    it("rejects invalid branch names before deriving the worktree path", async () => {
      const result = await advWorktreeCreate(
        "../escape",
        {},
        createMockDeps(repoRoot),
      );

      expect(result).toMatchObject({
        ok: false,
        error: "INVALID_BRANCH",
      });
    });

    it("prunes stale worktree metadata before fresh create", async () => {
      const stalePath = mkdtempSync(join(tmpdir(), "adv-wt-stale-"));
      rmSync(stalePath, { recursive: true, force: true });
      cleanupPaths.push(stalePath);
      execSync(`git worktree add -b change/stale ${stalePath} main`, {
        cwd: repoRoot,
      });
      rmSync(stalePath, { recursive: true, force: true });

      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });

      const result = await advWorktreeCreate("change/stale", {}, deps);

      expect(result.ok).toBe(true);
      if (result.ok) {
        cleanupPaths.push(result.path);
        expect(result.branch).toBe("change/stale");
        expect(result.reused).toBe(false);
        expect(existsSync(result.path)).toBe(true);
        expect(result.path).not.toBe(stalePath);
      }
      const list = execSync("git worktree list --porcelain", {
        cwd: repoRoot,
      }).toString();
      expect(list).toContain("branch refs/heads/change/stale");
      expect(list).not.toContain(stalePath);
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

    it("copies configured files and runs postCreate hooks during creation", async () => {
      writeFileSync(join(repoRoot, ".env.local"), "PORT=5173\n");
      mkdirSync(join(repoRoot, ".opencode"));
      writeFileSync(
        join(repoRoot, ".opencode", "worktree.jsonc"),
        JSON.stringify({
          sync: { copyFiles: [".env.local"], symlinkDirs: [], exclude: [] },
          hooks: { postCreate: ["pnpm install"], preDelete: [] },
        }),
      );

      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });

      const result = await advWorktreeCreate("change/include-hook", {}, deps);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      cleanupPaths.push(result.path);
      expect(readFileSync(join(result.path, ".env.local"), "utf8")).toBe(
        "PORT=5173\n",
      );
      expect(runHooksWithSafety).toHaveBeenCalledWith(
        "postCreate",
        result.path,
        ["pnpm install"],
      );
    });

    it("resume materializes a branch-only registry record", async () => {
      execSync("git branch change/unmade main", { cwd: repoRoot });
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });

      const result = await advWorktreeResume({ changeId: "unmade" }, {}, deps);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.branch).toBe("change/unmade");
        expect(result.path).toContain("change/unmade");
        expect(result.materialized).toBe(true);
      }
    });

    it("SETUP_FAILED surfaces the original hook error", async () => {
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });
      deps.hooks = { postCreate: ["exit 1"] };
      vi.mocked(runHooksWithSafety).mockRejectedValueOnce(new Error("boom"));

      const result = await advWorktreeCreate("change/setup-fail", {}, deps);

      expect(result).toMatchObject({
        ok: false,
        error: "SETUP_FAILED",
        branch: "change/setup-fail",
        reason: "boom",
      });
    });

    it("GIT_FAILED reports a blocked worktree path", async () => {
      const blockedPath = await getWorktreePath(repoRoot, "change/git-fail");
      execSync(`mkdir -p ${JSON.stringify(blockedPath)}`);
      writeFileSync(join(blockedPath, "occupied"), "not a git worktree");
      cleanupPaths.push(blockedPath);

      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });

      const result = await advWorktreeCreate("change/git-fail", {}, deps);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("GIT_FAILED");
      }
    });

    it("BRANCH_LOCKED — exhausts bounded retry and reports attempts/elapsed", async () => {
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });
      deps.contention = createContentionDeps();
      deps.flock = {
        acquire: async () => ({ owned: false, release: async () => {} }),
      };

      const result = await advWorktreeCreate("feature/test", {}, deps);

      expect(result.ok).toBe(false);
      if (!result.ok && result.error === "BRANCH_LOCKED") {
        expect(result.attempts).toBeGreaterThan(1);
        expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
        expect(result.elapsedMs).toBeLessThanOrEqual(1500);
      }
      expect(result).toMatchObject({
        ok: false,
        error: "BRANCH_LOCKED",
        hint: "Another session is creating a worktree; retry in a moment",
        attempts: expect.any(Number),
        elapsedMs: expect.any(Number),
      });

      // Worktree should NOT be created
      const list = execSync("git worktree list", { cwd: repoRoot }).toString();
      expect(list).not.toContain("feature/test");
    });

    it("absorbs brief contention and acquires the lock", async () => {
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });
      deps.contention = createContentionDeps();
      let calls = 0;
      deps.flock = {
        acquire: async () => {
          calls += 1;
          if (calls < 3) {
            return { owned: false, release: async () => {} };
          }
          return { owned: true, release: async () => {} };
        },
      };

      const result = await advWorktreeCreate(
        "change/brief-contention",
        {},
        deps,
      );

      expect(result.ok).toBe(true);
      expect(calls).toBe(3);
      if (result.ok) {
        expect(result.branch).toBe("change/brief-contention");
        expect(result.reused).toBe(false);
      }

      const list = execSync("git worktree list", { cwd: repoRoot }).toString();
      expect(list).toContain("change/brief-contention");
    });

    it("reuses a worktree created by a peer while waiting — no duplicate registration", async () => {
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });
      deps.contention = createContentionDeps();
      const peerBranch = "change/peer-created";
      const peerPath = await getWorktreePath(repoRoot, peerBranch);
      let calls = 0;
      deps.flock = {
        acquire: async () => {
          calls += 1;
          if (calls === 1) {
            // Peer session creates the worktree while this session is waiting.
            rmSync(peerPath, { recursive: true, force: true });
            execSync(`git worktree add -b ${peerBranch} ${peerPath} main`, {
              cwd: repoRoot,
            });
            cleanupPaths.push(peerPath);
            return { owned: false, release: async () => {} };
          }
          return { owned: true, release: async () => {} };
        },
      };

      const result = await advWorktreeCreate(peerBranch, {}, deps);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.branch).toBe(peerBranch);
        expect(result.reused).toBe(true);
      }

      // No duplicate branch or path in the git worktree list.
      const list = execSync("git worktree list --porcelain", {
        cwd: repoRoot,
      }).toString();
      const entries = list
        .split("\n")
        .filter((line) => line.startsWith("worktree "));
      const matchingEntries = entries.filter((line) =>
        line.includes(peerBranch),
      );
      expect(matchingEntries.length).toBe(1);
    });

    it("releases the acquired flock through the returned release callback", async () => {
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });
      const release = vi.fn(async () => undefined);
      deps.flock = {
        acquire: async () => ({ owned: true, release }),
      };

      const result = await advWorktreeCreate("feature/release-lock", {}, deps);

      expect(result.ok).toBe(true);
      expect(release).toHaveBeenCalledOnce();
    });

    it("uses local git facts for branch ownership", async () => {
      const deps = createMockDeps(repoRoot);
      deps.resolveDefaultBranch = async () => "main";
      deps.detectStaleBasis = async () => ({ stale: false });

      const result = await advWorktreeCreate("change/feature", {}, deps);

      expect(result).toMatchObject({
        ok: true,
        branch: "change/feature",
      });
      const list = execSync("git worktree list", { cwd: repoRoot }).toString();
      expect(list).toContain("change/feature");
    });
  },
);
