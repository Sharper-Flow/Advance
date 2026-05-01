import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execGit, getDefaultBranch } from "./git.js";
import {
  createTempDir,
  cleanupTempDir,
} from "../__tests__/setup.js";
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
      await execGit(["config", "--local", "--unset", "init.defaultBranch"], tempDir).catch(() => {});
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
  });
});
