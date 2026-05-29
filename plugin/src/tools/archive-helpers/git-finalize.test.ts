/**
 * Phase 9 git finalization helper tests.
 *
 * These tests lock the runtime side of rq-releaseFinalization01 so the
 * release gate cannot be satisfied by prose-only /adv-archive instructions.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { createTempDir } from "../../__tests__/setup";
import {
  detectArchiveMode,
  detectDefaultBranch,
  deleteChangeBranch,
  finalizeRelease,
  mergeChangeBranch,
  mergeToTrunk,
  pushToOrigin,
  pushChangeBranch,
  resolveMainCheckout,
  verifyChangeBranchPushed,
  verifyChangeBranchReachable,
  verifyDefaultBranchPushed,
  verifyMainInvariants,
  redactGitOutput,
  validateChangeWorktree,
  commitArchiveArtifacts,
} from "./git-finalize";

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

async function initRepo(root: string, defaultBranch = "trunk"): Promise<void> {
  git(root, ["init", "-q", "-b", defaultBranch]);
  git(root, ["config", "user.email", "adv-test@example.invalid"]);
  git(root, ["config", "user.name", "ADV Test"]);
  await writeFile(join(root, "README.md"), "initial\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "initial"]);
}

describe("git-finalize helpers", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await createTempDir("adv-git-finalize-");
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("resolveMainCheckout returns the main checkout from a linked worktree", async () => {
    const main = join(tempRoot, "main");
    const worktree = join(tempRoot, "wt");
    await mkdir(main);
    await initRepo(main);
    git(main, ["worktree", "add", "-b", "change/example", worktree]);

    expect(resolveMainCheckout(worktree)).toBe(main);
  });

  it("detectDefaultBranch prefers origin/HEAD, then init.defaultBranch, then local main/trunk", async () => {
    // origin-head wins when present
    const originRepo = join(tempRoot, "origin-head");
    await mkdir(originRepo);
    await initRepo(originRepo, "trunk");
    // simulate origin/HEAD pointing at trunk via symbolic-ref
    git(originRepo, [
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
      "refs/heads/trunk",
    ]);
    expect(detectDefaultBranch(originRepo)).toEqual({
      branch: "trunk",
      source: "origin-head",
    });

    // init.defaultBranch wins when origin/HEAD missing
    const configRepo = join(tempRoot, "config-head");
    await mkdir(configRepo);
    await initRepo(configRepo, "develop");
    git(configRepo, ["config", "init.defaultBranch", "develop"]);
    // Remove the symbolic ref so origin/HEAD is not found
    try {
      git(configRepo, ["symbolic-ref", "--delete", "refs/remotes/origin/HEAD"]);
    } catch {
      /* ignore if doesn't exist */
    }
    expect(detectDefaultBranch(configRepo)).toEqual({
      branch: "develop",
      source: "init-defaultBranch",
    });

    // local main wins last when origin/HEAD and init.defaultBranch missing
    const mainRepo = join(tempRoot, "main-preferred");
    await mkdir(mainRepo);
    await initRepo(mainRepo, "main");
    // Remove origin/HEAD symbolic ref if it exists
    try {
      git(mainRepo, ["symbolic-ref", "--delete", "refs/remotes/origin/HEAD"]);
    } catch {
      /* ignore if not present */
    }
    expect(detectDefaultBranch(mainRepo)).toEqual({
      branch: "main",
      source: "local-main",
    });

    const trunkRepo = join(tempRoot, "trunk-preferred");
    await mkdir(trunkRepo);
    await initRepo(trunkRepo, "trunk");
    try {
      git(trunkRepo, ["symbolic-ref", "--delete", "refs/remotes/origin/HEAD"]);
    } catch {
      /* ignore if not present */
    }
    expect(detectDefaultBranch(trunkRepo)).toEqual({
      branch: "trunk",
      source: "local-trunk",
    });
  });

  it("verifyMainInvariants reports branch mismatch and dirty files", async () => {
    const repo = join(tempRoot, "repo");
    await mkdir(repo);
    await initRepo(repo);

    expect(verifyMainInvariants(repo, "trunk")).toMatchObject({
      ok: true,
      branch: "trunk",
    });

    await writeFile(join(repo, "dirty.txt"), "dirty\n");
    expect(verifyMainInvariants(repo, "trunk")).toMatchObject({
      ok: false,
      code: "DIRTY_MAIN_CHECKOUT",
      dirtyFiles: ["?? dirty.txt"],
    });

    git(repo, ["add", "dirty.txt"]);
    git(repo, ["commit", "-m", "dirty fixture"]);
    git(repo, ["checkout", "-b", "topic"]);
    expect(verifyMainInvariants(repo, "trunk")).toMatchObject({
      ok: false,
      code: "MAIN_BRANCH_MISMATCH",
      branch: "topic",
    });
  });

  it("verifyChangeBranchReachable detects unmerged and merged change branches", async () => {
    const repo = join(tempRoot, "repo");
    await mkdir(repo);
    await initRepo(repo);
    git(repo, ["checkout", "-b", "change/example"]);
    await writeFile(join(repo, "feature.txt"), "feature\n");
    git(repo, ["add", "feature.txt"]);
    git(repo, ["commit", "-m", "feature"]);
    git(repo, ["checkout", "trunk"]);

    expect(verifyChangeBranchReachable(repo, "trunk", "example")).toEqual({
      reachable: false,
      unmergedCommits: expect.arrayContaining([
        expect.stringContaining("feature"),
      ]),
    });

    git(repo, ["merge", "--ff-only", "change/example"]);
    expect(verifyChangeBranchReachable(repo, "trunk", "example")).toEqual({
      reachable: true,
      unmergedCommits: [],
    });
  });

  it("mergeChangeBranch and mergeToTrunk fast-forward a clean change branch", async () => {
    const repo = join(tempRoot, "repo");
    await mkdir(repo);
    await initRepo(repo);
    git(repo, ["checkout", "-b", "change/example"]);
    await writeFile(join(repo, "feature.txt"), "feature\n");
    git(repo, ["add", "feature.txt"]);
    git(repo, ["commit", "-m", "feature"]);
    git(repo, ["checkout", "trunk"]);

    const result = mergeChangeBranch(repo, "trunk", "example");
    expect(result.status).toBe("merged");
    expect(existsSync(join(repo, "feature.txt"))).toBe(true);

    expect(mergeToTrunk).toBe(mergeChangeBranch);
  });

  it("mergeChangeBranch reports already-reachable branch as merged without invoking git merge (rq-harden-archive-flow AC3)", async () => {
    const repo = join(tempRoot, "repo-reachable");
    await mkdir(repo);
    await initRepo(repo);
    git(repo, ["checkout", "-b", "change/already"]);
    await writeFile(join(repo, "ready.txt"), "ready\n");
    git(repo, ["add", "ready.txt"]);
    git(repo, ["commit", "-m", "ready"]);
    git(repo, ["checkout", "trunk"]);
    git(repo, ["merge", "--ff-only", "change/already"]);
    // Branch already merged into trunk; further merge attempt would be a no-op.
    const calls: string[][] = [];
    const result = mergeChangeBranch(repo, "trunk", "already", {
      runGit: (cwd, args) => {
        calls.push(args);
        if (args[0] === "merge" && args[1] !== "--abort") {
          throw new Error(
            `mergeChangeBranch invoked git merge for already-reachable branch: ${args.join(" ")}`,
          );
        }
        // Delegate to real git for inspection commands; convert spawnSync
        // result to the GitFinalizeDeps.runGit return shape.
        const sub = spawnSync("git", args, { cwd, encoding: "utf8" });
        return {
          status: sub.status ?? 1,
          stdout: sub.stdout ?? "",
          stderr: sub.stderr ?? "",
        };
      },
    });

    expect(result.status).toBe("merged");
    if (result.status === "merged") {
      expect(result.mergeMethod).toBe("already-reachable");
    }
    expect(calls.some((c) => c[0] === "merge" && c[1] !== "--abort")).toBe(
      false,
    );
  });

  // rq-fix-phase9-commit-diverge AC1: ff-only fails but no-ff succeeds when
  // trunk advanced concurrently while the archive bundle commit was being
  // written on the change branch.
  it("mergeChangeBranch falls back to --no-ff when ff-only fails on diverged histories", async () => {
    const repo = join(tempRoot, "repo-diverged");
    await mkdir(repo);
    await initRepo(repo);

    // Create change/diverged branch with a unique commit
    git(repo, ["checkout", "-b", "change/diverged"]);
    await writeFile(join(repo, "branch.txt"), "branch\n");
    git(repo, ["add", "branch.txt"]);
    git(repo, ["commit", "-m", "branch work"]);
    const branchTip = git(repo, ["rev-parse", "HEAD"]);

    // Advance trunk with a separate, non-conflicting commit
    git(repo, ["checkout", "trunk"]);
    await writeFile(join(repo, "trunk.txt"), "trunk\n");
    git(repo, ["add", "trunk.txt"]);
    git(repo, ["commit", "-m", "trunk advance"]);
    const trunkBefore = git(repo, ["rev-parse", "HEAD"]);

    const result = mergeChangeBranch(repo, "trunk", "diverged", {
      runGit: (cwd, args) => {
        const sub = spawnSync("git", args, { cwd, encoding: "utf8" });
        return {
          status: sub.status ?? 1,
          stdout: sub.stdout ?? "",
          stderr: sub.stderr ?? "",
        };
      },
    });

    expect(result.status).toBe("merged");
    if (result.status === "merged") {
      expect(result.mergeMethod).toBe("no-ff");
    }
    const trunkAfter = git(repo, ["rev-parse", "HEAD"]);
    expect(trunkAfter).not.toBe(trunkBefore);
    expect(trunkAfter).not.toBe(branchTip);
    // Both files should now exist on trunk
    const files = git(repo, ["ls-tree", "--name-only", "HEAD"]);
    expect(files).toContain("branch.txt");
    expect(files).toContain("trunk.txt");
  });

  it("mergeChangeBranch blocks on conflicts and never uses stash", () => {
    const calls: string[][] = [];
    const result = mergeChangeBranch("/repo", "trunk", "example", {
      runGit: (_cwd, args) => {
        calls.push(args);
        // verifyChangeBranchReachable probe — return unmerged commit so we
        // proceed into the merge code path (rq-harden-archive-flow AC3).
        if (args[0] === "log" && args[1] === "--oneline") {
          return { status: 0, stdout: "abc123 unmerged\n", stderr: "" };
        }
        if (args[0] === "merge") {
          return {
            status: 1,
            stdout: "",
            stderr: "CONFLICT (content): Merge conflict in file.txt",
          };
        }
        if (args[0] === "diff")
          return { status: 0, stdout: "file.txt\n", stderr: "" };
        return { status: 0, stdout: "", stderr: "" };
      },
    });

    expect(result).toEqual({
      status: "blocked",
      code: "MERGE_CONFLICT",
      conflictFiles: ["file.txt"],
      message: expect.stringContaining("CONFLICT"),
    });
    expect(calls).toContainEqual(["merge", "--abort"]);
    expect(calls.flat()).not.toContain("stash");
  });

  it("pushToOrigin skips by policy and reports push failures without throwing", () => {
    expect(pushToOrigin("/repo", "trunk", { autoPush: false })).toMatchObject({
      status: "skipped",
      reason: "auto_push disabled",
    });
    expect(
      pushToOrigin("/repo", "trunk", { autoPush: true, skipPush: true }),
    ).toMatchObject({
      status: "skipped",
      reason: "--no-push requested",
    });

    const failed = pushToOrigin("/repo", "trunk", {
      autoPush: true,
      runGit: () => ({ status: 128, stdout: "", stderr: "auth failed" }),
    });
    expect(failed).toMatchObject({
      status: "failed",
      reason: "auth failed",
    });
  });

  it("push uses a generous timeout, not the fast local-op default", () => {
    // Regression: a single 30s timeout for all git ops made `git push` fail
    // (DEFAULT_BRANCH_PUSH_FAILED) in consumer repos whose pre-push hooks run
    // minutes of CI. Push must get its own generous budget.
    let originTimeout: number | undefined;
    pushToOrigin("/repo", "trunk", {
      autoPush: true,
      runGit: (_cwd, _args, timeoutMs) => {
        originTimeout = timeoutMs;
        return { status: 0, stdout: "ok", stderr: "" };
      },
    });
    expect(originTimeout).toBe(300000);

    let branchTimeout: number | undefined;
    pushChangeBranch("/repo", "example", {
      autoPush: true,
      runGit: (_cwd, _args, timeoutMs) => {
        branchTimeout = timeoutMs;
        return { status: 0, stdout: "ok", stderr: "" };
      },
    });
    expect(branchTimeout).toBe(300000);
  });

  it("pushChangeBranch pushes change branch to origin", () => {
    const pushed = pushChangeBranch("/repo", "example", {
      autoPush: true,
      runGit: () => ({
        status: 0,
        stdout: "remote: create PR...",
        stderr: "",
      }),
    });
    expect(pushed).toMatchObject({
      status: "pushed",
      output: "remote: create PR...",
    });

    const skipped = pushChangeBranch("/repo", "example", {
      autoPush: false,
    });
    expect(skipped).toMatchObject({
      status: "skipped",
      reason: "auto_push disabled",
    });

    const failed = pushChangeBranch("/repo", "example", {
      autoPush: true,
      runGit: () => ({
        status: 1,
        stdout: "",
        stderr: "rejected",
      }),
    });
    expect(failed).toMatchObject({
      status: "failed",
      reason: "rejected",
    });
  });

  it("detectArchiveMode defaults direct and accepts PR branch-handoff mode", () => {
    expect(detectArchiveMode({})).toEqual({
      archiveMode: "direct",
      autoPush: true,
    });
    expect(
      detectArchiveMode({ archive_mode: "direct", auto_push: false }),
    ).toEqual({
      archiveMode: "direct",
      autoPush: false,
    });

    expect(detectArchiveMode({ archive_mode: "pr" })).toEqual({
      archiveMode: "pr",
      autoPush: true,
    });
  });

  it("finalizeRelease blocks dirty trunk before merge and reports rq-releaseFinalization01 remediation", async () => {
    const main = join(tempRoot, "main");
    const worktree = join(tempRoot, "wt");
    await mkdir(main);
    await initRepo(main);
    await writeFile(join(main, "dirty.txt"), "dirty\n");
    git(main, ["worktree", "add", "-b", "change/example", worktree]);

    const result = await finalizeRelease({
      changeId: "example",
      workdir: worktree,
      archiveMode: "direct",
      autoPush: false,
    });

    expect(result).toMatchObject({
      status: "blocked",
      defaultBranch: "trunk",
      pushStatus: "not_attempted",
      blocked: {
        reason: "DIRTY_MAIN_CHECKOUT",
        remediation: expect.stringContaining("rq-releaseFinalization01"),
      },
    });
  });

  it("finalizeRelease commits archive artifacts before merge", async () => {
    const main = join(tempRoot, "main");
    const worktree = join(tempRoot, "wt");
    await mkdir(main);
    await initRepo(main);
    git(main, ["worktree", "add", "-b", "change/example", worktree]);
    await mkdir(join(worktree, ".adv", "archive"), { recursive: true });
    await writeFile(
      join(worktree, ".adv", "archive", "bundle.txt"),
      "bundle\n",
    );

    const result = await finalizeRelease(
      {
        changeId: "example",
        workdir: worktree,
        archiveMode: "direct",
        autoPush: true,
      },
      {
        runGit: (cwd, args) => {
          if (args[0] === "push" && args.includes("trunk")) {
            return { status: 0, stdout: "pushed", stderr: "" };
          }
          return defaultRunGit(cwd, args);
        },
      },
    );

    expect(result.status).toBe("shipped");
    expect(result.mergeCommitSha).toBeDefined();
    expect(git(main, ["show", "HEAD:.adv/archive/bundle.txt"])).toBe("bundle");
  });

  it("finalizeRelease blocks when default-branch push is skipped or fails", async () => {
    const main = join(tempRoot, "main");
    const worktree = join(tempRoot, "wt");
    await mkdir(main);
    await initRepo(main);
    git(main, ["worktree", "add", "-b", "change/example", worktree]);
    await writeFile(join(worktree, "feature.txt"), "feature\n");
    git(worktree, ["add", "feature.txt"]);
    git(worktree, ["commit", "-m", "feature"]);

    const skipped = await finalizeRelease({
      changeId: "example",
      workdir: worktree,
      archiveMode: "direct",
      autoPush: false,
    });

    expect(skipped.status).toBe("blocked");
    expect(skipped.blocked?.reason).toBe("DEFAULT_BRANCH_PUSH_SKIPPED");
  });

  it("finalizeRelease in PR mode pushes branch and returns pr_pushed", async () => {
    const main = join(tempRoot, "main");
    const worktree = join(tempRoot, "wt");
    await mkdir(main);
    await initRepo(main);
    git(main, ["worktree", "add", "-b", "change/example", worktree]);
    await writeFile(join(worktree, "feature.txt"), "feature\n");
    git(worktree, ["add", "feature.txt"]);
    git(worktree, ["commit", "-m", "feature"]);

    const pushCalls: { cwd: string; args: string[] }[] = [];
    const result = await finalizeRelease(
      {
        changeId: "example",
        workdir: worktree,
        archiveMode: "pr",
        autoPush: true,
      },
      {
        runGit: (cwd, args) => {
          pushCalls.push({ cwd, args });
          if (args[0] === "push" && args.includes("change/example")) {
            return { status: 0, stdout: "remote: create PR...", stderr: "" };
          }
          return defaultRunGit(cwd, args);
        },
      },
    );

    expect(result.status).toBe("pr_pushed");
    expect(result.prBranch).toBe("change/example");
    expect(result.pushStatus).toBe("pushed");
    expect(pushCalls.some((c) => c.args.includes("change/example"))).toBe(true);
  });

  it("finalizeRelease in PR mode blocks when branch push is skipped", async () => {
    const main = join(tempRoot, "main");
    const worktree = join(tempRoot, "wt");
    await mkdir(main);
    await initRepo(main);
    git(main, ["worktree", "add", "-b", "change/example", worktree]);

    const result = await finalizeRelease({
      changeId: "example",
      workdir: worktree,
      archiveMode: "pr",
      autoPush: false,
    });

    expect(result.status).toBe("blocked");
    expect(result.blocked?.reason).toBe("PR_BRANCH_PUSH_SKIPPED");
  });

  it("verifyDefaultBranchPushed compares local HEAD with origin branch", () => {
    expect(
      verifyDefaultBranchPushed("/repo", "trunk", {
        runGit: (_cwd, args) => {
          if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
          if (args[0] === "rev-parse")
            return { status: 0, stdout: "abc\n", stderr: "" };
          if (args[0] === "ls-remote") {
            return { status: 0, stdout: "abc\trefs/heads/trunk\n", stderr: "" };
          }
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
      }),
    ).toEqual({ pushed: true });
  });

  it("verifyChangeBranchPushed rejects stale remote branch refs", () => {
    expect(
      verifyChangeBranchPushed("/repo", "example", {
        runGit: (_cwd, args) => {
          if (args[0] === "rev-parse") {
            return { status: 0, stdout: "local-sha\n", stderr: "" };
          }
          if (args[0] === "ls-remote") {
            return {
              status: 0,
              stdout: "stale-sha\trefs/heads/change/example\n",
              stderr: "",
            };
          }
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
      }).pushed,
    ).toBe(false);
  });

  it("validateChangeWorktree rejects wrong branch or unrelated repo", () => {
    const wrongBranch = validateChangeWorktree("/repo", "example", {
      runGit: (_cwd, args) => {
        if (args[0] === "rev-parse" && args.includes("--git-common-dir")) {
          return { status: 0, stdout: "/repo/.git\n", stderr: "" };
        }
        if (args[0] === "branch" && args.includes("--show-current")) {
          return { status: 0, stdout: "wrong-branch\n", stderr: "" };
        }
        return { status: 0, stdout: "", stderr: "" };
      },
    });
    expect(wrongBranch.valid).toBe(false);
    expect(wrongBranch.error).toContain("wrong-branch");

    const detached = validateChangeWorktree("/repo", "example", {
      runGit: (_cwd, args) => {
        if (args[0] === "rev-parse" && args.includes("--git-common-dir")) {
          return { status: 0, stdout: "/repo/.git\n", stderr: "" };
        }
        if (args[0] === "branch" && args.includes("--show-current")) {
          return { status: 0, stdout: "\n", stderr: "" };
        }
        return { status: 0, stdout: "", stderr: "" };
      },
    });
    expect(detached.valid).toBe(false);
    expect(detached.error).toContain("detached");
  });

  it("commitArchiveArtifacts stages and commits .adv/ changes", async () => {
    const repo = join(tempRoot, "repo");
    await mkdir(repo);
    await initRepo(repo);
    git(repo, ["checkout", "-b", "change/example"]);

    // No changes → no commit
    const none = commitArchiveArtifacts(repo, "example");
    expect(none.committed).toBe(false);

    // Add archive artifact
    await mkdir(join(repo, ".adv", "archive"), { recursive: true });
    await writeFile(join(repo, ".adv", "archive", "bundle.txt"), "bundle\n");
    const committed = commitArchiveArtifacts(repo, "example");
    expect(committed.committed).toBe(true);
    expect(committed.commitSha).toBeDefined();
  });

  it("redactGitOutput masks credentials and tokens", () => {
    expect(redactGitOutput("remote: https://user:pass@github.com")).toContain(
      "***REDACTED***",
    );
    expect(redactGitOutput("error: token=abc123secret")).toContain(
      "***REDACTED***",
    );
    expect(redactGitOutput("ghp_abcdef1234567890")).toContain("***REDACTED***");
    expect(redactGitOutput("Authorization: Bearer eyJhb")).toContain(
      "***REDACTED***",
    );
    expect(redactGitOutput("normal output")).toBe("normal output");
  });

  describe("deleteChangeBranch", () => {
    it("deletes local and remote branches when both succeed", () => {
      const calls: string[][] = [];
      const mockRunGit = (_cwd: string, args: string[]) => {
        calls.push(args);
        return { status: 0, stdout: "", stderr: "" };
      };
      const result = deleteChangeBranch("/repo", "testChange", {
        runGit: mockRunGit,
      });
      expect(result.localDeleted).toBe(true);
      expect(result.remoteDeleted).toBe(true);
      expect(result.error).toBeUndefined();
      expect(calls).toEqual([
        ["branch", "-d", "change/testChange"],
        ["push", "origin", "--delete", "change/testChange"],
      ]);
    });

    it("returns localDeleted=false when local branch deletion fails", () => {
      const mockRunGit = (_cwd: string, args: string[]) => {
        if (args[0] === "branch") {
          return {
            status: 1,
            stdout: "",
            stderr: "error: branch 'change/testChange' not found.",
          };
        }
        return { status: 0, stdout: "", stderr: "" };
      };
      const result = deleteChangeBranch("/repo", "testChange", {
        runGit: mockRunGit,
      });
      expect(result.localDeleted).toBe(false);
      expect(result.remoteDeleted).toBe(false);
      expect(result.error).toContain("Local branch deletion failed");
    });

    it("returns remoteDeleted=false when remote deletion fails (warning-only)", () => {
      const mockRunGit = (_cwd: string, args: string[]) => {
        if (args[0] === "push") {
          return {
            status: 1,
            stdout: "",
            stderr: "remote: error: ref does not exist",
          };
        }
        return { status: 0, stdout: "", stderr: "" };
      };
      const result = deleteChangeBranch("/repo", "testChange", {
        runGit: mockRunGit,
      });
      expect(result.localDeleted).toBe(true);
      expect(result.remoteDeleted).toBe(false);
      expect(result.error).toContain("Remote branch deletion failed");
    });

    it("does not attempt remote deletion when local deletion fails", () => {
      const calls: string[][] = [];
      const mockRunGit = (_cwd: string, args: string[]) => {
        calls.push(args);
        if (args[0] === "branch") {
          return {
            status: 1,
            stdout: "",
            stderr: "not merged",
          };
        }
        return { status: 0, stdout: "", stderr: "" };
      };
      const result = deleteChangeBranch("/repo", "testChange", {
        runGit: mockRunGit,
      });
      expect(result.localDeleted).toBe(false);
      // Only the local branch -d call was made, not the remote push
      expect(calls).toEqual([["branch", "-d", "change/testChange"]]);
    });

    it("redacts credentials in error output", () => {
      const mockRunGit = (_cwd: string, args: string[]) => {
        if (args[0] === "branch") {
          return {
            status: 1,
            stdout: "",
            stderr:
              "error: https://user:secret-token@github.com repo not found",
          };
        }
        return { status: 0, stdout: "", stderr: "" };
      };
      const result = deleteChangeBranch("/repo", "testChange", {
        runGit: mockRunGit,
      });
      expect(result.error).not.toContain("secret-token");
      expect(result.error).toContain("***REDACTED***");
    });

    it("uses defaultRunGit when deps.runGit is not provided", () => {
      // This test just verifies the function accepts optional deps
      // Real git behavior is tested via the mock-based tests above
      const result = deleteChangeBranch("/nonexistent-repo", "testChange");
      // Will fail because the directory doesn't exist — that's expected
      expect(result.localDeleted).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

function defaultRunGit(cwd: string, args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
