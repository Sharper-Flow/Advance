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
  classifyFinalizationRoute,
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
  verifyGitIdentity,
  detectMainInProgressState,
  commitDirtyMainCheckpoint,
  redactGitOutput,
  resolveReleaseReachability,
  validateChangeWorktree,
  commitArchiveArtifacts,
  verifyChangeBranchReachableFromOrigin,
  detectArchivedUnmergedBranches,
  redriveArchivedUnmergedBranch,
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

  it("verifyChangeBranchReachableFromOrigin validates origin/default after fetch", () => {
    const calls: string[][] = [];
    const result = verifyChangeBranchReachableFromOrigin(
      "/repo",
      "trunk",
      "example",
      {
        runGit: (_cwd, args) => {
          calls.push(args);
          if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
          if (args[0] === "log" && args[2] === "origin/trunk..change/example") {
            return { status: 0, stdout: "abc123 unmerged\n", stderr: "" };
          }
          if (args[0] === "log" && args[2] === "trunk..change/example") {
            return { status: 0, stdout: "", stderr: "" };
          }
          return {
            status: 1,
            stdout: "",
            stderr: `unexpected ${args.join(" ")}`,
          };
        },
      },
    );

    expect(result).toEqual({
      reachable: false,
      unmergedCommits: ["abc123 unmerged"],
    });
    expect(calls).toContainEqual(["fetch", "origin", "trunk"]);
    expect(calls).toContainEqual([
      "log",
      "--oneline",
      "origin/trunk..change/example",
    ]);
  });

  it("classifyFinalizationRoute uses remote and ruleset evidence", () => {
    const noRemote = classifyFinalizationRoute("/repo", "trunk", {
      runGit: (_cwd, args) => {
        if (args.join(" ") === "remote get-url origin") {
          return { status: 2, stdout: "", stderr: "No such remote" };
        }
        return { status: 1, stdout: "", stderr: "unexpected" };
      },
    });
    expect(noRemote.route).toBe("no_remote");

    const direct = classifyFinalizationRoute("/repo", "trunk", {
      runGit: (_cwd, args) => {
        if (args.join(" ") === "remote get-url origin") {
          return {
            status: 0,
            stdout: "https://github.com/Sharper-Flow/Advance.git\n",
            stderr: "",
          };
        }
        return { status: 1, stdout: "", stderr: "unexpected" };
      },
      runGh: (_cwd, args) => {
        if (args[0] === "api" && args[1].includes("/rules/branches/")) {
          return { status: 0, stdout: "[]", stderr: "" };
        }
        if (args[0] === "api" && args[1] === "repos/Sharper-Flow/Advance") {
          return { status: 0, stdout: "true\n", stderr: "" };
        }
        return { status: 1, stdout: "", stderr: "unexpected" };
      },
    });
    expect(direct).toMatchObject({
      route: "direct",
      repo: "Sharper-Flow/Advance",
    });

    const protectedAuto = classifyFinalizationRoute("/repo", "trunk", {
      runGit: (_cwd, args) => {
        if (args.join(" ") === "remote get-url origin") {
          return {
            status: 0,
            stdout: "git@github.com:Sharper-Flow/Advance.git\n",
            stderr: "",
          };
        }
        return { status: 1, stdout: "", stderr: "unexpected" };
      },
      runGh: (_cwd, args) => {
        if (args[0] === "api" && args[1].includes("/rules/branches/")) {
          return {
            status: 0,
            stdout: JSON.stringify([{ type: "required_status_checks" }]),
            stderr: "",
          };
        }
        if (args[0] === "api" && args[1] === "repos/Sharper-Flow/Advance") {
          return { status: 0, stdout: "true\n", stderr: "" };
        }
        return { status: 1, stdout: "", stderr: "unexpected" };
      },
    });
    expect(protectedAuto).toMatchObject({
      route: "pr_auto_merge",
      protected: true,
      autoMergeAllowed: true,
    });

    const ghUnavailable = classifyFinalizationRoute("/repo", "trunk", {
      runGit: (_cwd, args) => {
        if (args.join(" ") === "remote get-url origin") {
          return {
            status: 0,
            stdout: "https://github.com/Sharper-Flow/Advance.git\n",
            stderr: "",
          };
        }
        return { status: 1, stdout: "", stderr: "unexpected" };
      },
      runGh: () => ({
        status: 127,
        stdout: "",
        stderr: "gh: command not found",
      }),
    });
    expect(ghUnavailable).toMatchObject({
      route: "pr_manual",
      reason: "GITHUB_CLI_UNAVAILABLE",
    });
  });

  it("resolveReleaseReachability accepts squash PR merge state instead of ancestry", () => {
    const result = resolveReleaseReachability(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
        changeId: "example",
        route: { route: "pr_auto_merge", repo: "Sharper-Flow/Advance" },
        prNumber: 12,
      },
      {
        runGh: (_cwd, args) => {
          expect(args).toEqual([
            "pr",
            "view",
            "12",
            "--repo",
            "Sharper-Flow/Advance",
            "--json",
            "state,mergedAt,mergeCommit,autoMergeRequest",
          ]);
          return {
            status: 0,
            stdout: JSON.stringify({
              state: "MERGED",
              mergedAt: "2026-06-07T00:00:00Z",
              mergeCommit: { oid: "merge-sha" },
              autoMergeRequest: null,
            }),
            stderr: "",
          };
        },
      },
    );

    expect(result).toMatchObject({
      reachable: true,
      proof: "pr_merged",
      prNumber: 12,
    });
  });

  it("detectArchivedUnmergedBranches lists origin change branches not reachable from origin/default", () => {
    const calls: string[][] = [];
    const result = detectArchivedUnmergedBranches(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
        archivedChangeIds: ["archived-one", "already-merged"],
      },
      {
        runGit: (_cwd, args) => {
          calls.push(args);
          if (args[0] === "ls-remote") {
            return {
              status: 0,
              stdout:
                "aaa\trefs/heads/change/archived-one\n" +
                "bbb\trefs/heads/change/active-only\n" +
                "ccc\trefs/heads/change/already-merged\n",
              stderr: "",
            };
          }
          if (args[0] === "fetch") {
            return { status: 0, stdout: "", stderr: "" };
          }
          if (
            args[0] === "log" &&
            args[2] === "origin/trunk..origin/change/archived-one"
          ) {
            return { status: 0, stdout: "aaa archived commit\n", stderr: "" };
          }
          if (
            args[0] === "log" &&
            args[2] === "origin/trunk..origin/change/already-merged"
          ) {
            return { status: 0, stdout: "", stderr: "" };
          }
          return {
            status: 1,
            stdout: "",
            stderr: `unexpected git ${args.join(" ")}`,
          };
        },
      },
    );

    expect(result).toEqual({
      status: "ok",
      branches: [
        {
          changeId: "archived-one",
          branch: "change/archived-one",
          remoteRef: "refs/heads/change/archived-one",
          sha: "aaa",
          unmergedCommits: ["aaa archived commit"],
        },
      ],
    });
    expect(calls).toContainEqual([
      "fetch",
      "origin",
      "+refs/heads/change/archived-one:refs/remotes/origin/change/archived-one",
    ]);
    expect(calls).not.toContainEqual([
      "fetch",
      "origin",
      "+refs/heads/change/active-only:refs/remotes/origin/change/active-only",
    ]);
  });

  it("redriveArchivedUnmergedBranch reuses PR and arms auto-merge without force-push", () => {
    const gitCalls: string[][] = [];
    const ghCalls: string[][] = [];
    const result = redriveArchivedUnmergedBranch(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
        changeId: "archived-one",
      },
      {
        runGit: (_cwd, args) => {
          gitCalls.push(args);
          if (args.join(" ") === "remote get-url origin") {
            return {
              status: 0,
              stdout: "https://github.com/Sharper-Flow/Advance.git\n",
              stderr: "",
            };
          }
          if (args[0] === "ls-remote") {
            return {
              status: 0,
              stdout: "aaa\trefs/heads/change/archived-one\n",
              stderr: "",
            };
          }
          return { status: 0, stdout: "", stderr: "" };
        },
        runGh: (_cwd, args) => {
          ghCalls.push(args);
          if (args[0] === "api" && args[1].includes("/rules/branches/")) {
            return {
              status: 0,
              stdout: JSON.stringify([{ type: "required_status_checks" }]),
              stderr: "",
            };
          }
          if (args[0] === "api" && args[1] === "repos/Sharper-Flow/Advance") {
            return { status: 0, stdout: "true\n", stderr: "" };
          }
          if (args[0] === "pr" && args[1] === "view") {
            const selector = args[2];
            if (selector === "change/archived-one") {
              return {
                status: 0,
                stdout: JSON.stringify({
                  number: 42,
                  url: "https://github.com/Sharper-Flow/Advance/pull/42",
                  state: "OPEN",
                  autoMergeRequest: null,
                }),
                stderr: "",
              };
            }
            if (selector === "42") {
              return {
                status: 0,
                stdout: JSON.stringify({
                  state: "OPEN",
                  mergedAt: null,
                  mergeCommit: null,
                  autoMergeRequest: { enabledAt: "2026-06-07T00:00:00Z" },
                }),
                stderr: "",
              };
            }
          }
          if (args[0] === "pr" && args[1] === "merge") {
            return { status: 0, stdout: "Auto-merge enabled", stderr: "" };
          }
          return {
            status: 1,
            stdout: "",
            stderr: `unexpected gh ${args.join(" ")}`,
          };
        },
      },
    );

    expect(result).toMatchObject({
      status: "pending_merge",
      prNumber: 42,
      autoMergeArmed: true,
      route: "pr_auto_merge",
    });
    expect(gitCalls.some((args) => args[0] === "push")).toBe(false);
    expect(gitCalls.flat()).not.toContain("--force");
    expect(
      ghCalls.filter((args) => args[0] === "pr" && args[1] === "create"),
    ).toHaveLength(0);
    expect(ghCalls).toContainEqual([
      "pr",
      "merge",
      "42",
      "--repo",
      "Sharper-Flow/Advance",
      "--squash",
      "--auto",
    ]);
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

  it("finalizeRelease checkpoints dirty trunk and continues (rq-releaseFinalization01.7)", async () => {
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

    // Dirty main on default branch is checkpointed. With no remote, local
    // release proof is enough and the terminal is Merged locally.
    expect(result).toMatchObject({
      status: "shipped",
      defaultBranch: "trunk",
      route: "no_remote",
      pushStatus: "skipped",
      mainCheckpointCommitSha: expect.any(String),
    });
    // Verify the checkpoint commit actually happened on main
    const checkpointSha = (result as any).mainCheckpointCommitSha;
    expect(checkpointSha).toBeTruthy();
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

  it("finalizeRelease completes no-remote local archive", async () => {
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

    expect(skipped.status).toBe("shipped");
    expect(skipped.route).toBe("no_remote");
    expect(skipped.pushStatus).toBe("skipped");
    expect(skipped.pushFailureReason).toContain("origin");
  });

  it("finalizeRelease in PR mode opens PR and returns pending auto-merge", async () => {
    const main = join(tempRoot, "main");
    const worktree = join(tempRoot, "wt");
    await mkdir(main);
    await initRepo(main);
    git(main, [
      "remote",
      "add",
      "origin",
      "https://github.com/Sharper-Flow/Advance.git",
    ]);
    git(main, ["worktree", "add", "-b", "change/example", worktree]);
    await writeFile(join(worktree, "feature.txt"), "feature\n");
    git(worktree, ["add", "feature.txt"]);
    git(worktree, ["commit", "-m", "feature"]);

    const pushCalls: { cwd: string; args: string[] }[] = [];
    let branchViewCount = 0;
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
          if (args[0] === "fetch" && args[1] === "origin") {
            return { status: 0, stdout: "", stderr: "" };
          }
          if (args[0] === "reset" && args[1] === "--hard") {
            return { status: 0, stdout: "reset", stderr: "" };
          }
          if (args[0] === "push" && args.includes("change/example")) {
            return { status: 0, stdout: "remote: create PR...", stderr: "" };
          }
          return defaultRunGit(cwd, args);
        },
        runGh: (_cwd, args) => {
          if (args[0] === "api" && args[1].includes("/rules/branches/")) {
            return { status: 0, stdout: "[]", stderr: "" };
          }
          if (args[0] === "pr" && args[1] === "view") {
            const selector = args[2];
            if (selector === "change/example") {
              branchViewCount += 1;
              if (branchViewCount === 1) {
                return {
                  status: 1,
                  stdout: "",
                  stderr: "no pull requests found",
                };
              }
              return {
                status: 0,
                stdout: JSON.stringify({
                  number: 42,
                  url: "https://github.com/Sharper-Flow/Advance/pull/42",
                  state: "OPEN",
                  autoMergeRequest: null,
                }),
                stderr: "",
              };
            }
            if (selector === "42") {
              return {
                status: 0,
                stdout: JSON.stringify({
                  state: "OPEN",
                  mergedAt: null,
                  mergeCommit: null,
                  autoMergeRequest: { enabledAt: "2026-06-07T00:00:00Z" },
                }),
                stderr: "",
              };
            }
          }
          if (args[0] === "pr" && args[1] === "create") {
            return {
              status: 0,
              stdout: "https://github.com/Sharper-Flow/Advance/pull/42\n",
              stderr: "",
            };
          }
          if (args[0] === "pr" && args[1] === "merge") {
            return { status: 0, stdout: "Auto-merge enabled", stderr: "" };
          }
          return {
            status: 1,
            stdout: "",
            stderr: `unexpected gh ${args.join(" ")}`,
          };
        },
      },
    );

    expect(result.status).toBe("pending_merge");
    expect(result.prBranch).toBe("change/example");
    expect(result.prNumber).toBe(42);
    expect(result.prUrl).toBe(
      "https://github.com/Sharper-Flow/Advance/pull/42",
    );
    expect(result.autoMergeArmed).toBe(true);
    expect(result.pushStatus).toBe("pushed");
    expect(pushCalls.some((c) => c.args.includes("change/example"))).toBe(true);
  });

  it("finalizeRelease turns protected default push rejection into pending auto-merge PR", async () => {
    const main = join(tempRoot, "protected-main");
    const worktree = join(tempRoot, "protected-wt");
    await mkdir(main);
    await initRepo(main);
    git(main, [
      "remote",
      "add",
      "origin",
      "https://github.com/Sharper-Flow/Advance.git",
    ]);
    git(main, ["worktree", "add", "-b", "change/example", worktree]);
    await writeFile(join(worktree, "feature.txt"), "feature\n");
    git(worktree, ["add", "feature.txt"]);
    git(worktree, ["commit", "-m", "feature"]);

    const gitCalls: string[][] = [];
    const ghCalls: string[][] = [];
    let branchViewCount = 0;
    const result = await finalizeRelease(
      {
        changeId: "example",
        workdir: worktree,
        archiveMode: "direct",
        autoPush: true,
      },
      {
        runGit: (cwd, args) => {
          gitCalls.push(args);
          if (args[0] === "fetch" && args[1] === "origin") {
            return { status: 0, stdout: "", stderr: "" };
          }
          if (args[0] === "push" && args.includes("trunk")) {
            return {
              status: 1,
              stdout: "",
              stderr: "remote: protected branch hook declined",
            };
          }
          if (args[0] === "push" && args.includes("change/example")) {
            return { status: 0, stdout: "pushed branch", stderr: "" };
          }
          if (args[0] === "reset" && args[1] === "--hard") {
            return { status: 0, stdout: "reset", stderr: "" };
          }
          return defaultRunGit(cwd, args);
        },
        runGh: (_cwd, args) => {
          ghCalls.push(args);
          if (args[0] === "api" && args[1].includes("/rules/branches/")) {
            return {
              status: 0,
              stdout: JSON.stringify([{ type: "required_status_checks" }]),
              stderr: "",
            };
          }
          if (args[0] === "api" && args[1] === "repos/Sharper-Flow/Advance") {
            return { status: 0, stdout: "true\n", stderr: "" };
          }
          if (args[0] === "pr" && args[1] === "view") {
            const selector = args[2];
            if (selector === "change/example") {
              branchViewCount += 1;
              if (branchViewCount === 1) {
                return {
                  status: 1,
                  stdout: "",
                  stderr: "no pull requests found",
                };
              }
              return {
                status: 0,
                stdout: JSON.stringify({
                  number: 42,
                  url: "https://github.com/Sharper-Flow/Advance/pull/42",
                  state: "OPEN",
                  autoMergeRequest: null,
                }),
                stderr: "",
              };
            }
            if (selector === "42") {
              return {
                status: 0,
                stdout: JSON.stringify({
                  state: "OPEN",
                  mergedAt: null,
                  mergeCommit: null,
                  autoMergeRequest: { enabledAt: "2026-06-07T00:00:00Z" },
                }),
                stderr: "",
              };
            }
          }
          if (args[0] === "pr" && args[1] === "create") {
            return {
              status: 0,
              stdout: "https://github.com/Sharper-Flow/Advance/pull/42\n",
              stderr: "",
            };
          }
          if (args[0] === "pr" && args[1] === "merge") {
            return { status: 0, stdout: "Auto-merge enabled", stderr: "" };
          }
          return {
            status: 1,
            stdout: "",
            stderr: `unexpected gh ${args.join(" ")}`,
          };
        },
      },
    );

    expect(result).toMatchObject({
      status: "pending_merge",
      route: "pr_auto_merge",
      prBranch: "change/example",
      prNumber: 42,
      prUrl: "https://github.com/Sharper-Flow/Advance/pull/42",
      autoMergeArmed: true,
      pushStatus: "pushed",
    });
    expect(gitCalls).toContainEqual(["reset", "--hard", "origin/trunk"]);
    expect(ghCalls).toContainEqual([
      "pr",
      "merge",
      "42",
      "--repo",
      "Sharper-Flow/Advance",
      "--squash",
      "--auto",
    ]);
  });

  it("finalizeRelease collapses immediately merged auto-merge PR to shipped", async () => {
    const main = join(tempRoot, "merged-pr-main");
    const worktree = join(tempRoot, "merged-pr-wt");
    await mkdir(main);
    await initRepo(main);
    git(main, [
      "remote",
      "add",
      "origin",
      "https://github.com/Sharper-Flow/Advance.git",
    ]);
    git(main, ["worktree", "add", "-b", "change/example", worktree]);
    await writeFile(join(worktree, "feature.txt"), "feature\n");
    git(worktree, ["add", "feature.txt"]);
    git(worktree, ["commit", "-m", "feature"]);

    const result = await finalizeRelease(
      {
        changeId: "example",
        workdir: worktree,
        archiveMode: "direct",
        autoPush: true,
      },
      {
        runGit: (cwd, args) => {
          if (args[0] === "fetch" && args[1] === "origin") {
            return { status: 0, stdout: "", stderr: "" };
          }
          if (args[0] === "push" && args.includes("trunk")) {
            return { status: 1, stdout: "", stderr: "protected" };
          }
          if (args[0] === "push" && args.includes("change/example")) {
            return { status: 0, stdout: "pushed branch", stderr: "" };
          }
          if (args[0] === "reset" && args[1] === "--hard") {
            return { status: 0, stdout: "reset", stderr: "" };
          }
          return defaultRunGit(cwd, args);
        },
        runGh: (_cwd, args) => {
          if (args[0] === "api" && args[1].includes("/rules/branches/")) {
            return {
              status: 0,
              stdout: JSON.stringify([{ type: "required_status_checks" }]),
              stderr: "",
            };
          }
          if (args[0] === "api" && args[1] === "repos/Sharper-Flow/Advance") {
            return { status: 0, stdout: "true\n", stderr: "" };
          }
          if (args[0] === "pr" && args[1] === "view") {
            const selector = args[2];
            if (selector === "change/example") {
              return {
                status: 0,
                stdout: JSON.stringify({
                  number: 42,
                  url: "https://github.com/Sharper-Flow/Advance/pull/42",
                  state: "OPEN",
                  autoMergeRequest: null,
                }),
                stderr: "",
              };
            }
            if (selector === "42") {
              return {
                status: 0,
                stdout: JSON.stringify({
                  state: "MERGED",
                  mergedAt: "2026-06-07T00:00:00Z",
                  mergeCommit: { oid: "merge-sha" },
                  autoMergeRequest: null,
                }),
                stderr: "",
              };
            }
          }
          if (args[0] === "pr" && args[1] === "merge") {
            return { status: 0, stdout: "Merged", stderr: "" };
          }
          return {
            status: 1,
            stdout: "",
            stderr: `unexpected gh ${args.join(" ")}`,
          };
        },
      },
    );

    expect(result).toMatchObject({
      status: "shipped",
      route: "pr_auto_merge",
      prNumber: 42,
      mergeCommitSha: "merge-sha",
      pushStatus: "pushed",
    });
  });

  it("finalizeRelease in PR mode blocks when origin is missing", async () => {
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
    expect(result.blocked?.reason).toBe("PR_WORKFLOW_REQUIRES_ORIGIN");
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

  // --- rq-releaseFinalization01.7/.8 regression coverage ---

  describe("verifyGitIdentity", () => {
    it("succeeds when git identity is configured", async () => {
      const repo = join(tempRoot, "identity-ok");
      await mkdir(repo);
      await initRepo(repo);

      const result = verifyGitIdentity(repo);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.ident).toContain("ADV Test");
      }
    });

    it("fails when git identity is missing", async () => {
      const repo = join(tempRoot, "identity-missing");
      await mkdir(repo);
      git(repo, ["init", "-q", "-b", "trunk"]);
      // Deliberately do NOT configure user.name/user.email
      // Use a mock runGit to simulate missing identity
      const result = verifyGitIdentity(repo, {
        runGit: () => ({
          status: 128,
          stdout: "",
          stderr: "fatal: EINVAL: invalid argument",
        }),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("identity");
      }
    });
  });

  describe("detectMainInProgressState", () => {
    it("returns no in-progress state for clean repo", async () => {
      const repo = join(tempRoot, "clean-state");
      await mkdir(repo);
      await initRepo(repo);

      const result = detectMainInProgressState(repo);
      expect(result.inProgress).toBe(false);
    });
  });

  describe("commitDirtyMainCheckpoint", () => {
    it("commits tracked dirty files", async () => {
      const repo = join(tempRoot, "dirty-tracked");
      await mkdir(repo);
      await initRepo(repo);
      await writeFile(join(repo, "existing.txt"), "original\n");
      git(repo, ["add", "existing.txt"]);
      git(repo, ["commit", "-m", "initial"]);

      // Modify tracked file
      await writeFile(join(repo, "existing.txt"), "modified\n");

      const result = commitDirtyMainCheckpoint(repo, "test-change");
      expect(result.committed).toBe(true);
      expect(result.commitSha).toBeTruthy();

      // Verify the file is committed
      const status = git(repo, ["status", "--porcelain"]);
      expect(status).toBe("");
    });

    it("commits untracked non-ignored files", async () => {
      const repo = join(tempRoot, "dirty-untracked");
      await mkdir(repo);
      await initRepo(repo);
      await writeFile(join(repo, "new-file.txt"), "new content\n");

      const result = commitDirtyMainCheckpoint(repo, "test-change");
      expect(result.committed).toBe(true);
      expect(result.commitSha).toBeTruthy();

      // Verify the untracked file is now committed
      const status = git(repo, ["status", "--porcelain"]);
      expect(status).toBe("");
    });

    it("returns committed:false for clean repo", async () => {
      const repo = join(tempRoot, "dirty-clean");
      await mkdir(repo);
      await initRepo(repo);

      const result = commitDirtyMainCheckpoint(repo, "test-change");
      expect(result.committed).toBe(false);
    });

    it("returns error when git add fails", async () => {
      const result = commitDirtyMainCheckpoint(
        "/nonexistent/path",
        "test-change",
        {
          runGit: (_cwd: string, args: string[]) => {
            if (args[0] === "status") {
              return {
                status: 0,
                stdout: "M file.txt\n",
                stderr: "",
              };
            }
            if (args[0] === "add") {
              return {
                status: 1,
                stdout: "",
                stderr: "error: add failed",
              };
            }
            return { status: 0, stdout: "", stderr: "" };
          },
        },
      );
      expect(result.committed).toBe(false);
      expect(result.error).toContain("git add -A failed");
    });

    it("returns error when git commit fails", async () => {
      const result = commitDirtyMainCheckpoint(
        "/tmp/no-matter",
        "test-change",
        {
          runGit: (_cwd: string, args: string[]) => {
            if (args[0] === "status") {
              return {
                status: 0,
                stdout: "M file.txt\n",
                stderr: "",
              };
            }
            if (args[0] === "add") {
              return { status: 0, stdout: "", stderr: "" };
            }
            if (args[0] === "commit") {
              return {
                status: 1,
                stdout: "",
                stderr: "error: commit failed",
              };
            }
            return { status: 0, stdout: "", stderr: "" };
          },
        },
      );
      expect(result.committed).toBe(false);
      expect(result.error).toContain("git commit failed");
    });
  });

  it("finalizeRelease blocks wrong branch (rq-releaseFinalization01.8)", async () => {
    const main = join(tempRoot, "wrong-branch");
    const worktree = join(tempRoot, "wrong-branch-wt");
    await mkdir(main);
    await initRepo(main);
    // Switch main to a non-default branch
    git(main, ["checkout", "-b", "feature/other"]);
    git(main, ["worktree", "add", "-b", "change/example", worktree]);

    const result = await finalizeRelease({
      changeId: "example",
      workdir: worktree,
      archiveMode: "direct",
      autoPush: false,
    });

    expect(result).toMatchObject({
      status: "blocked",
      blocked: {
        reason: "MAIN_BRANCH_MISMATCH",
        remediation: expect.stringContaining("feature/other"),
      },
    });
  });

  it("finalizeRelease includes mainCheckpointCommitSha in shipped result", async () => {
    const main = join(tempRoot, "checkpoint-shipped");
    const worktree = join(tempRoot, "checkpoint-shipped-wt");
    await mkdir(main);
    await initRepo(main);
    // Make main dirty
    await writeFile(join(main, "dirty.txt"), "dirty content\n");
    git(main, ["worktree", "add", "-b", "change/example", worktree]);

    const result = await finalizeRelease({
      changeId: "example",
      workdir: worktree,
      archiveMode: "direct",
      autoPush: false,
    });

    // Push is skipped because no remote exists, but no-remote local proof is
    // release-complete and checkpoint evidence is preserved.
    expect(result).toMatchObject({
      status: "shipped",
      route: "no_remote",
      pushStatus: "skipped",
      mainCheckpointCommitSha: expect.any(String),
    });
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
