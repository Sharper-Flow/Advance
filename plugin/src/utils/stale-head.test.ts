/**
 * Tests for stale-head.ts (T14 — KD-5 #2 detection layer).
 *
 * Uses real ephemeral git repos to exercise the 4 task scenarios:
 *   - detached HEAD (not stale)
 *   - on default branch (not stale)
 *   - merged branch with deleted remote (STALE)
 *   - non-default branch with active remote (not stale)
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import { detectStaleBranchHead } from "./stale-head";

function runGit(cwd: string, args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

describe("detectStaleBranchHead (T14)", () => {
  let tempRoot: string;
  let remote: string;
  let repo: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "stale-head-test-"));
    remote = join(tempRoot, "remote.git");
    repo = join(tempRoot, "repo");

    // Create a bare remote.
    execFileSync("git", ["init", "-q", "--bare", "-b", "trunk", remote]);

    // Clone it locally.
    execFileSync("git", ["clone", "-q", remote, repo]);
    runGit(repo, ["config", "user.email", "test@example.com"]);
    runGit(repo, ["config", "user.name", "Test"]);

    // Initial commit on trunk.
    runGit(repo, ["commit", "--allow-empty", "-m", "root"]);
    runGit(repo, ["push", "-u", "origin", "trunk"]);

    // Set origin/HEAD so getDefaultBranch resolves to trunk.
    runGit(repo, ["remote", "set-head", "origin", "trunk"]);
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("returns not-stale for detached HEAD", async () => {
    runGit(repo, ["checkout", "--detach", "HEAD"]);
    const result = await detectStaleBranchHead(repo);
    expect(result.stale).toBe(false);
    expect(result.reason).toBe("detached HEAD");
    expect(result.suggestion).toBe("");
  });

  it("returns not-stale on default branch", async () => {
    // Already on trunk after clone.
    const result = await detectStaleBranchHead(repo);
    expect(result.stale).toBe(false);
    expect(result.reason).toBe("on default branch");
    expect(result.suggestion).toBe("");
  });

  it("flags STALE when branch is merged into default + remote deleted", async () => {
    // Create + push feature branch with one commit, merge into trunk on
    // remote, then delete the remote branch — leaving the local stale.
    runGit(repo, ["checkout", "-b", "feature/done"]);
    runGit(repo, ["commit", "--allow-empty", "-m", "feature work"]);
    runGit(repo, ["push", "-u", "origin", "feature/done"]);

    // Merge into trunk and push.
    runGit(repo, ["checkout", "trunk"]);
    runGit(repo, ["merge", "--no-ff", "--no-edit", "feature/done"]);
    runGit(repo, ["push", "origin", "trunk"]);

    // Delete remote branch.
    runGit(repo, ["push", "origin", "--delete", "feature/done"]);

    // Switch local back to feature/done — now stale.
    runGit(repo, ["checkout", "feature/done"]);

    const result = await detectStaleBranchHead(repo);
    expect(result.stale).toBe(true);
    expect(result.reason).toMatch(
      /merged into trunk and remote branch is deleted/,
    );
    expect(result.suggestion).toBe(
      "git switch trunk && git branch -d feature/done",
    );
  });

  it("returns not-stale on non-default branch with active remote", async () => {
    runGit(repo, ["checkout", "-b", "feature/active"]);
    runGit(repo, ["commit", "--allow-empty", "-m", "wip"]);
    runGit(repo, ["push", "-u", "origin", "feature/active"]);

    const result = await detectStaleBranchHead(repo);
    expect(result.stale).toBe(false);
    expect(result.reason).toMatch(/with unmerged commits|with active remote/);
    expect(result.suggestion).toBe("");
  });
});
