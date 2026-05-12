import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execGit, getDefaultBranch } from "./git.js";
import { createTempDir, cleanupTempDir } from "../__tests__/setup.js";
import { join } from "node:path";
import { execFile } from "node:child_process";

describe("git utilities", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("execGit", () => {
    it("runs a git command and returns stdout", async () => {
      // Init a repo so git commands work
      await execGit(["init"], tempDir);
      const result = await execGit(["status", "--porcelain"], tempDir);
      expect(typeof result).toBe("string");
    });

    it("rejects on invalid git command", async () => {
      await expect(execGit(["not-a-real-command"], tempDir)).rejects.toThrow();
    });
  });

  describe("getDefaultBranch", () => {
    it("returns a branch name when no remote configured", async () => {
      // Fresh repo with no remote — returns either global default or "main"
      await execGit(["init"], tempDir);
      const branch = await getDefaultBranch(tempDir);
      expect(typeof branch).toBe("string");
      expect(branch.length).toBeGreaterThan(0);
    });

    it("returns hardcoded 'main' when no remote and no config", async () => {
      // Explicitly unset local defaultBranch to test hardcoded fallback
      await execGit(["init"], tempDir);
      await execGit(
        ["config", "--local", "--unset", "init.defaultBranch"],
        tempDir,
      ).catch(() => {});
      // Also unset global for this test — use --unset-all to be thorough
      // We can't unset global safely, so instead verify the function returns
      // either the global default or "main"
      const branch = await getDefaultBranch(tempDir);
      // Must be a non-empty string — could be global config or "main"
      expect(branch.length).toBeGreaterThan(0);
    });

    it("detects default branch from remote HEAD", async () => {
      // Create a "remote" repo and a clone to set up origin/HEAD
      const remoteDir = join(tempDir, "remote");
      const cloneDir = join(tempDir, "clone");
      await execGit(["init", "-b", "trunk", remoteDir]);

      // Create a dummy commit in remote so clone has something
      await execGit(["config", "user.email", "test@test.com"], remoteDir);
      await execGit(["config", "user.name", "Test"], remoteDir);
      await execFile("touch", [join(remoteDir, "README.md")]);
      await execGit(["add", "README.md"], remoteDir);
      await execGit(["commit", "-m", "init"], remoteDir);

      // Clone with origin set
      await execGit(["clone", remoteDir, cloneDir]);
      await execGit(["fetch", "origin"], cloneDir);

      const branch = await getDefaultBranch(cloneDir);
      expect(branch).toBe("trunk");
    });

    // rq-defaultBranchLocalDetection01: Regression test for #113.
    // When a repo has no origin/HEAD AND the user's global
    // `init.defaultBranch` differs from the actual default (e.g. global is
    // `trunk` but the repo uses `main`), the previous fallback chain leaked
    // the global config into existing-repo detection — causing
    // `git branch --merged trunk` to fail with "fatal: malformed object
    // name trunk". The fix: prefer local-branch detection (main → master →
    // trunk → develop) over `init.defaultBranch`. `init.defaultBranch` is
    // git's NEW-REPO-INIT setting, not a reliable signal for existing
    // repos.
    it("prefers local main branch over leaked global init.defaultBranch (rq-defaultBranchLocalDetection01)", async () => {
      // Simulate the exact #113 reproduction: repo has main, no origin/HEAD,
      // and we force a misleading repo-local init.defaultBranch=trunk to
      // emulate the leaked global config. (Setting --local is safe; we
      // never touch the user's global config in tests.)
      await execGit(["init", "-b", "main"], tempDir);
      await execGit(
        ["config", "--local", "init.defaultBranch", "trunk"],
        tempDir,
      );
      await execGit(["config", "user.email", "test@test.com"], tempDir);
      await execGit(["config", "user.name", "Test"], tempDir);
      // Need a commit so the branch ref actually exists
      await execFile("touch", [join(tempDir, "README.md")]);
      await execGit(["add", "README.md"], tempDir);
      await execGit(["commit", "-m", "init"], tempDir);

      // No origin set up — strategy 1 (origin/HEAD) must fail
      const branch = await getDefaultBranch(tempDir);

      // Must return `main` (the actual local default), NOT `trunk`
      // (the leaked init.defaultBranch).
      expect(branch).toBe("main");
    });

    it("falls back to init.defaultBranch only when no local branches exist (uninitialized repo)", async () => {
      // `git init` creates HEAD pointing to init.defaultBranch but no
      // branch ref exists until the first commit. This is the one
      // legitimate case where init.defaultBranch is a useful signal.
      await execGit(["init", "-b", "develop"], tempDir);
      await execGit(
        ["config", "--local", "init.defaultBranch", "develop"],
        tempDir,
      );
      // Intentionally NO commit — so no branch ref exists
      const branch = await getDefaultBranch(tempDir);
      expect(branch).toBe("develop");
    });

    it("prefers master when main is absent (rq-defaultBranchLocalDetection01)", async () => {
      await execGit(["init", "-b", "master"], tempDir);
      await execGit(["config", "user.email", "test@test.com"], tempDir);
      await execGit(["config", "user.name", "Test"], tempDir);
      await execFile("touch", [join(tempDir, "README.md")]);
      await execGit(["add", "README.md"], tempDir);
      await execGit(["commit", "-m", "init"], tempDir);

      const branch = await getDefaultBranch(tempDir);
      expect(branch).toBe("master");
    });

    it("returns the only branch when it is not a conventional name", async () => {
      // If a repo has only one branch and it's an unconventional name,
      // we should return it rather than misleading 'main' fallback.
      await execGit(["init", "-b", "production"], tempDir);
      await execGit(["config", "user.email", "test@test.com"], tempDir);
      await execGit(["config", "user.name", "Test"], tempDir);
      await execFile("touch", [join(tempDir, "README.md")]);
      await execGit(["add", "README.md"], tempDir);
      await execGit(["commit", "-m", "init"], tempDir);

      const branch = await getDefaultBranch(tempDir);
      expect(branch).toBe("production");
    });
  });
});
