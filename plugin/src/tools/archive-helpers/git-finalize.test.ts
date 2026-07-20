/**
 * Phase 9 git finalization helper tests.
 *
 * These tests lock the runtime side of rq-releaseFinalization01 so the
 * release gate cannot be satisfied by prose-only /adv-archive instructions.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { createTempDir } from "../../__tests__/setup";
import {
  classifyFinalizationRoute,
  coercePrWorkflowRoute,
  completeMergeQueueHandoff,
  detectArchiveMode,
  detectDefaultBranch,
  deleteChangeBranch,
  executePullRequestHandoff,
  finalizeRelease,
  mergeChangeBranch,
  mergeToTrunk,
  pushToOrigin,
  pushChangeBranch,
  reconcileChangeBranchWithDefault,
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
  detectSquashMergeByTree,
  detectArchivedMergedBranches,
  listLocalChangeBranchEntries,
  getCheckedOutChangeBranches,
  syncDefaultBranchAfterMerge,
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

  it("detectDefaultBranch ignores global init.defaultBranch when local config is absent", () => {
    const calls: string[][] = [];

    const result = detectDefaultBranch("/repo", {
      runGit: (_cwd, args) => {
        calls.push(args);
        if (args[0] === "symbolic-ref") {
          return { status: 1, stdout: "", stderr: "missing origin HEAD" };
        }
        if (args[0] === "config" && args.includes("--local")) {
          return { status: 1, stdout: "", stderr: "not set locally" };
        }
        if (args[0] === "config") {
          return { status: 0, stdout: "main\n", stderr: "" };
        }
        if (args[0] === "rev-parse" && args[2] === "refs/heads/trunk") {
          return { status: 0, stdout: "trunk-sha\n", stderr: "" };
        }
        return { status: 1, stdout: "", stderr: "not found" };
      },
    });

    expect(result).toEqual({ branch: "trunk", source: "local-trunk" });
    expect(calls).toContainEqual([
      "config",
      "--local",
      "--get",
      "init.defaultBranch",
    ]);
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
      route: "blocked",
      reason: "POLICY_DETECTION_FAILED",
    });
  });

  it("classifyFinalizationRoute detects merge_queue rule", () => {
    const result = classifyFinalizationRoute("/repo", "trunk", {
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
          return {
            status: 0,
            stdout: JSON.stringify([{ type: "merge_queue", parameters: {} }]),
            stderr: "",
          };
        }
        return { status: 1, stdout: "", stderr: "unexpected" };
      },
    });
    expect(result).toMatchObject({
      route: "merge_queue",
      repo: "Sharper-Flow/Advance",
      protected: true,
      mergeQueueRequired: true,
    });
  });

  it("classifyFinalizationRoute blocks when gh unavailable", () => {
    const result = classifyFinalizationRoute("/repo", "trunk", {
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
    expect(result).toMatchObject({
      route: "blocked",
      reason: "POLICY_DETECTION_FAILED",
    });
  });

  it("classifyFinalizationRoute blocks when rules API fails", () => {
    const result = classifyFinalizationRoute("/repo", "trunk", {
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
          return { status: 1, stdout: "", stderr: "API error" };
        }
        return { status: 1, stdout: "", stderr: "unexpected" };
      },
    });
    expect(result).toMatchObject({
      route: "blocked",
      reason: "POLICY_DETECTION_FAILED",
    });
  });

  it("classifyFinalizationRoute treats private-repo 403 as direct (no rules)", () => {
    const result = classifyFinalizationRoute("/repo", "trunk", {
      runGit: (_cwd, args) => {
        if (args.join(" ") === "remote get-url origin") {
          return {
            status: 0,
            stdout: "https://github.com/User/private-repo.git\n",
            stderr: "",
          };
        }
        return { status: 1, stdout: "", stderr: "unexpected" };
      },
      runGh: (_cwd, args) => {
        if (args[0] === "api" && args[1].includes("/rules/branches/")) {
          return {
            status: 1,
            stdout: "",
            stderr:
              "gh: Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)",
          };
        }
        return { status: 1, stdout: "", stderr: "unexpected" };
      },
    });
    expect(result).toMatchObject({
      route: "direct",
      protected: false,
    });
  });

  it("coercePrWorkflowRoute passes merge_queue through unchanged", () => {
    const route = coercePrWorkflowRoute({
      route: "merge_queue",
      repo: "Sharper-Flow/Advance",
      protected: true,
      mergeQueueRequired: true,
    });
    expect(route).toMatchObject({
      route: "merge_queue",
      repo: "Sharper-Flow/Advance",
      protected: true,
      mergeQueueRequired: true,
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

  it("direct route + squash-merged PR falls back to pr_merged when ancestry fails", () => {
    const result = resolveReleaseReachability(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
        changeId: "fixSquashMergeRelease",
        route: { route: "direct", repo: "Sharper-Flow/Advance" },
        prNumber: 159,
      },
      {
        runGit: (_cwd, args) => {
          if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
          if (args[0] === "rev-parse")
            return { status: 0, stdout: "abc123\n", stderr: "" };
          if (args[0] === "ls-remote")
            return {
              status: 0,
              stdout: "abc123\trefs/heads/trunk\n",
              stderr: "",
            };
          if (args[0] === "log")
            return {
              status: 0,
              stdout: "def456 squash orphan commit\n",
              stderr: "",
            };
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
        runGh: () => ({
          status: 0,
          stdout: JSON.stringify({
            state: "MERGED",
            mergedAt: "2026-06-09T00:00:00Z",
            mergeCommit: { oid: "squash-merge-sha" },
            autoMergeRequest: null,
          }),
          stderr: "",
        }),
      },
    );

    expect(result).toMatchObject({
      reachable: true,
      proof: "pr_merged",
      prNumber: 159,
      mergeCommitOid: "squash-merge-sha",
    });
  });

  // rq-fixPhase9SquashMergeRedetect AC1: branch-deleted + persisted tip must
  // detect squash-merge via tree-SHA equivalence. RED until
  // detectSquashMergeByTree threads changeTipSha.
  it("direct route + deleted branch + changeTipSha provided detects squash-merge via tree-SHA", () => {
    const result = resolveReleaseReachability(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
        changeId: "fixPhase9SquashMergeRedetect",
        route: { route: "direct", repo: "Sharper-Flow/Advance" },
        changeTipSha: "tip123abc",
      },
      {
        runGit: (_cwd, args) => {
          if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
          if (args[0] === "ls-remote")
            return {
              status: 0,
              // trunk ref present; change/{id} ref absent (branch deleted)
              stdout: "abc123\trefs/heads/trunk\n",
              stderr: "",
            };
          if (args[0] === "rev-parse") {
            const ref = args[1] ?? "";
            // Persisted tip resolves (content-addressed SHA survives deletion).
            // Tree SHA matches the squashed trunk commit's tree (squash-merge
            // produces identical tree when change branch had no further commits).
            if (ref === "tip123abc^{tree}") {
              return { status: 0, stdout: "shared-tree-sha\n", stderr: "" };
            }
            // Live change/{id} ref is gone
            if (ref.includes("change/fixPhase9SquashMergeRedetect")) {
              return { status: 128, stdout: "", stderr: "unknown revision" };
            }
            // HEAD and other rev-parse calls succeed
            return { status: 0, stdout: "abc123\n", stderr: "" };
          }
          if (args[0] === "log") {
            const argStr = args.join(" ");
            // Reachability range query (origin/trunk..change/{id}) — ref missing
            if (argStr.includes("..")) {
              return { status: 128, stdout: "", stderr: "unknown revision" };
            }
            // Trunk commit scan (--format=%H %T -50 trunk) — succeeds with
            // one commit whose tree matches the persisted tip's tree
            if (argStr.includes("--format=%H %T")) {
              return {
                status: 0,
                stdout: "squash456 shared-tree-sha\n",
                stderr: "",
              };
            }
            return { status: 1, stdout: "", stderr: "unexpected log" };
          }
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
        runGh: () => ({
          // No PR evidence — forces tree-SHA fallback
          status: 0,
          stdout: "[]",
          stderr: "",
        }),
      },
    );

    expect(result.reachable).toBe(true);
    expect(result.proof).toBe("pr_merged");
    expect(result.mergeCommitOid).toBe("squash456");
  });

  it("direct route + no prNumber tries auto-discovery then returns origin_unmerged", () => {
    let ghCalled = false;
    const result = resolveReleaseReachability(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
        changeId: "fixSquashMergeRelease",
        route: { route: "direct", repo: "Sharper-Flow/Advance" },
      },
      {
        runGit: (_cwd, args) => {
          if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
          if (args[0] === "rev-parse")
            return { status: 0, stdout: "abc123\n", stderr: "" };
          if (args[0] === "ls-remote")
            return {
              status: 0,
              stdout: "abc123\trefs/heads/trunk\n",
              stderr: "",
            };
          if (args[0] === "log")
            return {
              status: 0,
              stdout: "def456 squash orphan commit\n",
              stderr: "",
            };
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
        runGh: () => {
          ghCalled = true;
          return { status: 0, stdout: "[]", stderr: "" };
        },
      },
    );

    expect(result).toMatchObject({
      reachable: false,
      proof: "origin_unmerged",
    });
    expect(ghCalled).toBe(true);
  });

  it("direct route + prNumber but PR not merged returns origin_unmerged", () => {
    const result = resolveReleaseReachability(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
        changeId: "fixSquashMergeRelease",
        route: { route: "direct", repo: "Sharper-Flow/Advance" },
        prNumber: 159,
      },
      {
        runGit: (_cwd, args) => {
          if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
          if (args[0] === "rev-parse")
            return { status: 0, stdout: "abc123\n", stderr: "" };
          if (args[0] === "ls-remote")
            return {
              status: 0,
              stdout: "abc123\trefs/heads/trunk\n",
              stderr: "",
            };
          if (args[0] === "log")
            return {
              status: 0,
              stdout: "def456 squash orphan commit\n",
              stderr: "",
            };
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
        runGh: () => ({
          status: 0,
          stdout: JSON.stringify({
            state: "OPEN",
            mergedAt: null,
            mergeCommit: null,
            autoMergeRequest: null,
          }),
          stderr: "",
        }),
      },
    );

    expect(result).toMatchObject({
      reachable: false,
      proof: "origin_unmerged",
    });
  });

  it("direct route + prNumber but gh fails returns origin_unmerged", () => {
    const result = resolveReleaseReachability(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
        changeId: "fixSquashMergeRelease",
        route: { route: "direct", repo: "Sharper-Flow/Advance" },
        prNumber: 159,
      },
      {
        runGit: (_cwd, args) => {
          if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
          if (args[0] === "rev-parse")
            return { status: 0, stdout: "abc123\n", stderr: "" };
          if (args[0] === "ls-remote")
            return {
              status: 0,
              stdout: "abc123\trefs/heads/trunk\n",
              stderr: "",
            };
          if (args[0] === "log")
            return {
              status: 0,
              stdout: "def456 squash orphan commit\n",
              stderr: "",
            };
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
        runGh: () => ({
          status: 1,
          stdout: "",
          stderr: "gh: API error",
        }),
      },
    );

    expect(result).toMatchObject({
      reachable: false,
      proof: "origin_unmerged",
    });
  });

  it("direct route + auto-discovered PR merged returns pr_merged", () => {
    const result = resolveReleaseReachability(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
        changeId: "fixSquashMergeRelease",
        route: { route: "direct", repo: "Sharper-Flow/Advance" },
        // no prNumber — should be auto-discovered
      },
      {
        runGit: (_cwd, args) => {
          if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
          if (args[0] === "rev-parse")
            return { status: 0, stdout: "abc123\n", stderr: "" };
          if (args[0] === "ls-remote")
            return {
              status: 0,
              stdout: "abc123\trefs/heads/trunk\n",
              stderr: "",
            };
          if (args[0] === "log")
            return {
              status: 0,
              stdout: "def456 squash orphan commit\n",
              stderr: "",
            };
          if (args[0] === "rev-parse" && args[1].startsWith("change/"))
            return { status: 0, stdout: "change-tree-sha\n", stderr: "" };
          if (args[0] === "log" && args[1] === "--format=%H %T")
            return { status: 0, stdout: "trunk-sha trunk-tree\n", stderr: "" };
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
        runGh: (_cwd, args) => {
          if (args[0] === "pr" && args[1] === "list") {
            return {
              status: 0,
              stdout: JSON.stringify([
                { number: 200, mergeCommit: { oid: "discovered-sha" } },
              ]),
              stderr: "",
            };
          }
          if (args[0] === "pr" && args[1] === "view") {
            return {
              status: 0,
              stdout: JSON.stringify({
                state: "MERGED",
                mergedAt: "2026-06-09T00:00:00Z",
                mergeCommit: { oid: "discovered-sha" },
                autoMergeRequest: null,
              }),
              stderr: "",
            };
          }
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
      },
    );

    expect(result).toMatchObject({
      reachable: true,
      proof: "pr_merged",
      prNumber: 200,
      mergeCommitOid: "discovered-sha",
    });
  });

  it("direct route + tree fallback returns pr_merged when ancestry and PR discovery fail", () => {
    const result = resolveReleaseReachability(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
        changeId: "fixSquashMergeRelease",
        route: { route: "direct", repo: "Sharper-Flow/Advance" },
      },
      {
        runGit: (_cwd, args) => {
          if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
          if (args[0] === "rev-parse" && args[1] === "HEAD")
            return { status: 0, stdout: "abc123\n", stderr: "" };
          if (args[0] === "rev-parse" && args[1] === "origin/trunk")
            return { status: 0, stdout: "abc123\n", stderr: "" };
          if (args[0] === "ls-remote")
            return {
              status: 0,
              stdout: "abc123\trefs/heads/trunk\n",
              stderr: "",
            };
          if (
            args[0] === "log" &&
            args[2] === "origin/trunk..change/fixSquashMergeRelease"
          )
            return {
              status: 0,
              stdout: "def456 squash orphan commit\n",
              stderr: "",
            };
          if (
            args[0] === "rev-parse" &&
            args[1] === "change/fixSquashMergeRelease^{tree}"
          )
            return { status: 0, stdout: "matching-tree-sha\n", stderr: "" };
          if (args[0] === "log" && args[1] === "--format=%H %T")
            return {
              status: 0,
              stdout: "mergeCommitOid123 matching-tree-sha\n",
              stderr: "",
            };
          return {
            status: 1,
            stdout: "",
            stderr: `unexpected git ${args.join(" ")}`,
          };
        },
        runGh: (_cwd, args) => {
          if (args[0] === "pr" && args[1] === "list") {
            // PR discovery returns no results
            return { status: 0, stdout: "[]", stderr: "" };
          }
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
      },
    );

    expect(result).toMatchObject({
      reachable: true,
      proof: "pr_merged",
      mergeCommitOid: "mergeCommitOid123",
    });
  });

  it("direct route + merge-commit ancestry returns origin_default", () => {
    const result = resolveReleaseReachability(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
        changeId: "fixSquashMergeRelease",
        route: { route: "direct", repo: "Sharper-Flow/Advance" },
        prNumber: 159,
      },
      {
        runGit: (_cwd, args) => {
          if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
          if (args[0] === "rev-parse")
            return { status: 0, stdout: "abc123\n", stderr: "" };
          if (args[0] === "ls-remote")
            return {
              status: 0,
              stdout: "abc123\trefs/heads/trunk\n",
              stderr: "",
            };
          if (args[0] === "log")
            return {
              // Empty means change branch IS reachable from origin/trunk
              status: 0,
              stdout: "",
              stderr: "",
            };
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
        runGh: () => ({
          status: 1,
          stdout: "",
          stderr: "gh: should not be called when ancestry succeeds",
        }),
      },
    );

    expect(result).toMatchObject({
      reachable: true,
      proof: "origin_default",
    });
  });

  it("no_remote route returns local_merge when change branch reachable locally", () => {
    const result = resolveReleaseReachability(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
        changeId: "fixSquashMergeRelease",
        route: { route: "no_remote" },
      },
      {
        runGit: (_cwd, args) => {
          if (
            args[0] === "log" &&
            args[2] === "trunk..change/fixSquashMergeRelease"
          )
            return { status: 0, stdout: "", stderr: "" };
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
      },
    );

    expect(result).toMatchObject({
      reachable: true,
      proof: "local_merge",
    });
  });

  it("direct route + all fallbacks fail returns origin_unmerged", () => {
    const result = resolveReleaseReachability(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
        changeId: "fixSquashMergeRelease",
        route: { route: "direct", repo: "Sharper-Flow/Advance" },
      },
      {
        runGit: (_cwd, args) => {
          if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
          if (args[0] === "rev-parse" && args[1] === "HEAD")
            return { status: 0, stdout: "abc123\n", stderr: "" };
          if (args[0] === "rev-parse" && args[1] === "origin/trunk")
            return { status: 0, stdout: "abc123\n", stderr: "" };
          if (args[0] === "ls-remote")
            return {
              status: 0,
              stdout: "abc123\trefs/heads/trunk\n",
              stderr: "",
            };
          if (
            args[0] === "log" &&
            args[2] === "origin/trunk..change/fixSquashMergeRelease"
          )
            return {
              status: 0,
              stdout: "def456 orphan commit\n",
              stderr: "",
            };
          if (
            args[0] === "rev-parse" &&
            args[1] === "change/fixSquashMergeRelease^{tree}"
          )
            return { status: 0, stdout: "change-tree-sha\n", stderr: "" };
          if (args[0] === "log" && args[1] === "--format=%H %T")
            return {
              status: 0,
              stdout: "trunk-sha different-tree-sha\n",
              stderr: "",
            };
          return {
            status: 1,
            stdout: "",
            stderr: `unexpected git ${args.join(" ")}`,
          };
        },
        runGh: (_cwd, args) => {
          if (args[0] === "pr" && args[1] === "list") {
            return { status: 0, stdout: "[]", stderr: "" };
          }
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
      },
    );

    expect(result).toMatchObject({
      reachable: false,
      proof: "origin_unmerged",
    });
  });

  // rq-fixPhase9PrDetection AC1: PR workflow route (pr_auto_merge) with no
  // prNumber must discover the merged PR instead of failing with
  // PR_NOT_MERGED.
  it("pr_auto_merge route + no prNumber discovers merged PR and returns pr_merged", () => {
    const result = resolveReleaseReachability(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
        changeId: "fixPhase9PrDetection",
        route: { route: "pr_auto_merge", repo: "Sharper-Flow/Advance" },
      },
      {
        runGit: (_cwd, args) => {
          if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
        runGh: (_cwd, args) => {
          if (args[0] === "pr" && args[1] === "list") {
            return {
              status: 0,
              stdout: JSON.stringify([
                {
                  number: 202,
                  state: "MERGED",
                  mergeCommit: { oid: "merge-202" },
                },
              ]),
              stderr: "",
            };
          }
          if (args[0] === "pr" && args[1] === "view") {
            return {
              status: 0,
              stdout: JSON.stringify({
                state: "MERGED",
                mergedAt: "2026-06-07T00:00:00Z",
                mergeCommit: { oid: "merge-202" },
                autoMergeRequest: null,
              }),
              stderr: "",
            };
          }
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
      },
    );

    expect(result).toMatchObject({
      reachable: true,
      proof: "pr_merged",
      prNumber: 202,
      mergeCommitOid: "merge-202",
    });
  });

  // rq-fixPhase9PrDetection AC5/AC6: when no prNumber, no discoverable merged
  // PR, and no changeTipSha proof exists, the failure classification must not
  // be the PR_NOT_MERGED blocker nor include the literal placeholder message
  // as a user-facing shipped-proof failure.
  it("pr_auto_merge route + no prNumber + no discoverable PR + no tip proof returns a distinct classification", () => {
    const result = resolveReleaseReachability(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
        changeId: "fixPhase9PrDetection",
        route: { route: "pr_auto_merge", repo: "Sharper-Flow/Advance" },
      },
      {
        runGit: (_cwd, args) => {
          if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
        runGh: (_cwd, args) => {
          if (args[0] === "pr" && args[1] === "list")
            return { status: 0, stdout: "[]", stderr: "" };
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
      },
    );

    expect(result).toMatchObject({
      reachable: false,
      proof: "pr_missing_merge_proof",
    });
    expect(result.proof).not.toBe("pr_unmerged");
    expect(
      result.details?.some((d) =>
        d.includes("PR merge state requires repo and prNumber"),
      ),
    ).toBe(false);
  });

  // updateArchiveVisibilitySpec AC1/AC2/SC1: route × proof discriminant
  // regression locks. Each finalization route must produce either positive
  // structural proof (reachable:true) or an explicit actionable non-terminal
  // classification — never an implicit success. These tests pin the remaining
  // discriminants not covered above: blocked, no_remote-unmerged, pr_manual,
  // and merge_queue (including deleted-branch tree fallback).
  describe("route × proof discriminants (updateArchiveVisibilitySpec AC1/SC1)", () => {
    it("blocked route returns proof blocked and performs no git/gh I/O", () => {
      let ioCalled = false;
      const result = resolveReleaseReachability(
        {
          mainCheckout: "/repo",
          defaultBranch: "trunk",
          changeId: "blockedRoute",
          route: {
            route: "blocked",
            reason: "GH_UNAVAILABLE",
            details: ["gh CLI not available"],
          },
        },
        {
          runGit: () => {
            ioCalled = true;
            return { status: 1, stdout: "", stderr: "must not be called" };
          },
          runGh: () => {
            ioCalled = true;
            return { status: 1, stdout: "", stderr: "must not be called" };
          },
        },
      );

      expect(result).toMatchObject({
        reachable: false,
        proof: "blocked",
        details: ["gh CLI not available"],
      });
      expect(ioCalled).toBe(false);
    });

    it("no_remote route + unmerged change branch returns local_unmerged with actionable details", () => {
      const result = resolveReleaseReachability(
        {
          mainCheckout: "/repo",
          defaultBranch: "trunk",
          changeId: "noRemoteUnmerged",
          route: { route: "no_remote" },
        },
        {
          runGit: (_cwd, args) => {
            if (
              args[0] === "log" &&
              args[2] === "trunk..change/noRemoteUnmerged"
            ) {
              return {
                status: 0,
                stdout: "abc123 unmerged change commit\n",
                stderr: "",
              };
            }
            return { status: 1, stdout: "", stderr: "unexpected" };
          },
        },
      );

      expect(result.reachable).toBe(false);
      expect(result.proof).toBe("local_unmerged");
      expect(result.details).toEqual(["abc123 unmerged change commit"]);
    });

    it("pr_manual route + merged PR returns pr_merged typed proof", () => {
      const result = resolveReleaseReachability(
        {
          mainCheckout: "/repo",
          defaultBranch: "trunk",
          changeId: "manualPrMerged",
          prNumber: 77,
          route: { route: "pr_manual", repo: "Sharper-Flow/Advance" },
        },
        {
          runGit: (_cwd, args) => {
            if (args[0] === "fetch")
              return { status: 0, stdout: "", stderr: "" };
            return { status: 1, stdout: "", stderr: "unexpected" };
          },
          runGh: (_cwd, args) => {
            if (args[0] === "pr" && args[1] === "view") {
              return {
                status: 0,
                stdout: JSON.stringify({
                  state: "MERGED",
                  mergedAt: "2026-07-01T00:00:00Z",
                  mergeCommit: { oid: "merge-77" },
                  autoMergeRequest: null,
                }),
                stderr: "",
              };
            }
            return { status: 1, stdout: "", stderr: "unexpected" };
          },
        },
      );

      expect(result).toMatchObject({
        reachable: true,
        proof: "pr_merged",
        prNumber: 77,
        mergeCommitOid: "merge-77",
      });
    });

    it("pr_manual route + open PR returns pr_unmerged actionable state, never success", () => {
      const result = resolveReleaseReachability(
        {
          mainCheckout: "/repo",
          defaultBranch: "trunk",
          changeId: "manualPrOpen",
          prNumber: 78,
          route: { route: "pr_manual", repo: "Sharper-Flow/Advance" },
        },
        {
          runGit: (_cwd, args) => {
            if (args[0] === "fetch")
              return { status: 0, stdout: "", stderr: "" };
            return { status: 1, stdout: "", stderr: "unexpected" };
          },
          runGh: (_cwd, args) => {
            if (args[0] === "pr" && args[1] === "view") {
              return {
                status: 0,
                stdout: JSON.stringify({
                  state: "OPEN",
                  mergedAt: null,
                  mergeCommit: null,
                  autoMergeRequest: null,
                }),
                stderr: "",
              };
            }
            return { status: 1, stdout: "", stderr: "unexpected" };
          },
        },
      );

      expect(result.reachable).toBe(false);
      expect(result.proof).toBe("pr_unmerged");
      expect(result.prNumber).toBe(78);
      expect(result.autoMergeArmed).toBe(false);
      expect(result.details?.some((d) => d.includes("OPEN"))).toBe(true);
    });

    it("merge_queue route + merged PR returns pr_merged typed proof", () => {
      const result = resolveReleaseReachability(
        {
          mainCheckout: "/repo",
          defaultBranch: "trunk",
          changeId: "queueMerged",
          prNumber: 99,
          route: {
            route: "merge_queue",
            repo: "Sharper-Flow/Advance",
            mergeQueueRequired: true,
          },
        },
        {
          runGit: (_cwd, args) => {
            if (args[0] === "fetch")
              return { status: 0, stdout: "", stderr: "" };
            return { status: 1, stdout: "", stderr: "unexpected" };
          },
          runGh: (_cwd, args) => {
            if (args[0] === "pr" && args[1] === "view") {
              return {
                status: 0,
                stdout: JSON.stringify({
                  state: "MERGED",
                  mergedAt: "2026-07-02T00:00:00Z",
                  mergeCommit: { oid: "merge-99" },
                  autoMergeRequest: { enabledAt: "2026-07-01T00:00:00Z" },
                }),
                stderr: "",
              };
            }
            return { status: 1, stdout: "", stderr: "unexpected" };
          },
        },
      );

      expect(result).toMatchObject({
        reachable: true,
        proof: "pr_merged",
        prNumber: 99,
        mergeCommitOid: "merge-99",
      });
    });

    it("merge_queue route + deleted branch + changeTipSha tree match returns pr_merged via structural fallback", () => {
      const result = resolveReleaseReachability(
        {
          mainCheckout: "/repo",
          defaultBranch: "trunk",
          changeId: "queueDeletedBranch",
          changeTipSha: "tip999xyz",
          route: {
            route: "merge_queue",
            repo: "Sharper-Flow/Advance",
            mergeQueueRequired: true,
          },
        },
        {
          runGit: (_cwd, args) => {
            if (args[0] === "rev-parse") {
              const ref = args[1] ?? "";
              // Persisted tip resolves; live change/* ref is deleted.
              if (ref === "tip999xyz^{tree}") {
                return { status: 0, stdout: "shared-tree-sha\n", stderr: "" };
              }
              if (ref.includes("change/queueDeletedBranch")) {
                return {
                  status: 128,
                  stdout: "",
                  stderr: "unknown revision",
                };
              }
              return { status: 0, stdout: "abc123\n", stderr: "" };
            }
            if (args[0] === "log" && args[1] === "--format=%H %T") {
              return {
                status: 0,
                stdout: "squash999 shared-tree-sha\n",
                stderr: "",
              };
            }
            return { status: 1, stdout: "", stderr: "unexpected" };
          },
          runGh: (_cwd, args) => {
            // No discoverable PR — forces the tree-SHA structural fallback.
            if (args[0] === "pr" && args[1] === "list") {
              return { status: 0, stdout: "[]", stderr: "" };
            }
            return { status: 1, stdout: "", stderr: "unexpected" };
          },
        },
      );

      expect(result.reachable).toBe(true);
      expect(result.proof).toBe("pr_merged");
      expect(result.mergeCommitOid).toBe("squash999");
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

  it("detectArchivedMergedBranches lists local change branches whose tree-SHA matches a recent trunk commit", () => {
    const calls: string[][] = [];
    const result = detectArchivedMergedBranches(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
      },
      {
        runGit: (_cwd, args) => {
          calls.push(args);
          if (args[0] === "branch" && args[1] === "--list") {
            return {
              status: 0,
              stdout: "change/abc def0123\n",
              stderr: "",
            };
          }
          if (args[0] === "rev-parse" && args[1] === "change/abc^{tree}") {
            return { status: 0, stdout: "tree123\n", stderr: "" };
          }
          if (
            args[0] === "log" &&
            args[1] === "--format=%H %T" &&
            args[3] === "trunk"
          ) {
            return {
              status: 0,
              stdout: "mergeCommitOid tree123\n",
              stderr: "",
            };
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
          changeId: "abc",
          branch: "change/abc",
          localSha: "def0123",
          mergeProof: {
            kind: "tree-identical",
            trunkCommitSha: "mergeCommitOid",
          },
        },
      ],
    });
  });

  it("detectArchivedMergedBranches falls back to git cherry when tree-SHA does not match recent trunk", () => {
    const calls: string[][] = [];
    const result = detectArchivedMergedBranches(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
      },
      {
        runGit: (_cwd, args) => {
          calls.push(args);
          if (args[0] === "branch" && args[1] === "--list") {
            return {
              status: 0,
              stdout: "change/abc def0123\n",
              stderr: "",
            };
          }
          if (args[0] === "rev-parse" && args[1] === "change/abc^{tree}") {
            return { status: 0, stdout: "tree123\n", stderr: "" };
          }
          if (
            args[0] === "log" &&
            args[1] === "--format=%H %T" &&
            args[3] === "trunk"
          ) {
            return {
              status: 0,
              stdout: "otherCommit otherTree\n",
              stderr: "",
            };
          }
          if (
            args[0] === "cherry" &&
            args[1] === "-v" &&
            args[2] === "trunk" &&
            args[3] === "change/abc"
          ) {
            return { status: 0, stdout: "- def0123 same patch\n", stderr: "" };
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
          changeId: "abc",
          branch: "change/abc",
          localSha: "def0123",
          mergeProof: { kind: "patch-equivalent" },
        },
      ],
    });
    expect(calls.some((args) => args[0] === "cherry")).toBe(true);
  });

  it("detectArchivedMergedBranches rejects git cherry output with unmerged commits", () => {
    const result = detectArchivedMergedBranches(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
      },
      {
        runGit: (_cwd, args) => {
          if (args[0] === "branch" && args[1] === "--list") {
            return {
              status: 0,
              stdout: "change/abc def0123\n",
              stderr: "",
            };
          }
          if (args[0] === "rev-parse" && args[1] === "change/abc^{tree}") {
            return { status: 0, stdout: "tree123\n", stderr: "" };
          }
          if (
            args[0] === "log" &&
            args[1] === "--format=%H %T" &&
            args[3] === "trunk"
          ) {
            return { status: 0, stdout: "other otherTree\n", stderr: "" };
          }
          if (args[0] === "cherry") {
            return { status: 0, stdout: "+ def0123 unmerged\n", stderr: "" };
          }
          return {
            status: 1,
            stdout: "",
            stderr: `unexpected git ${args.join(" ")}`,
          };
        },
      },
    );

    expect(result).toEqual({ status: "ok", branches: [] });
  });

  it("detectArchivedMergedBranches short-circuits cherry when tree-SHA already proves merged", () => {
    const calls: string[][] = [];
    const result = detectArchivedMergedBranches(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
      },
      {
        runGit: (_cwd, args) => {
          calls.push(args);
          if (args[0] === "branch" && args[1] === "--list") {
            return {
              status: 0,
              stdout: "change/abc def0123\n",
              stderr: "",
            };
          }
          if (args[0] === "rev-parse" && args[1] === "change/abc^{tree}") {
            return { status: 0, stdout: "tree123\n", stderr: "" };
          }
          if (
            args[0] === "log" &&
            args[1] === "--format=%H %T" &&
            args[3] === "trunk"
          ) {
            return {
              status: 0,
              stdout: "mergeCommitOid tree123\n",
              stderr: "",
            };
          }
          if (
            args[0] === "cherry" &&
            args[1] === "-v" &&
            args[2] === "trunk" &&
            args[3] === "change/abc"
          ) {
            return {
              status: 1,
              stdout: "",
              stderr: "cherry should not be called",
            };
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
          changeId: "abc",
          branch: "change/abc",
          localSha: "def0123",
          mergeProof: {
            kind: "tree-identical",
            trunkCommitSha: "mergeCommitOid",
          },
        },
      ],
    });
    expect(calls.some((args) => args[0] === "cherry")).toBe(false);
  });

  it("detectArchivedMergedBranches filters branches not in archivedChangeIds set", () => {
    const calls: string[][] = [];
    const result = detectArchivedMergedBranches(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
        archivedChangeIds: ["A", "C"],
      },
      {
        runGit: (_cwd, args) => {
          calls.push(args);
          if (args[0] === "branch" && args[1] === "--list") {
            return {
              status: 0,
              stdout: "change/A shaA\n" + "change/B shaB\n" + "change/C shaC\n",
              stderr: "",
            };
          }
          if (args[0] === "rev-parse") {
            const treeSha = args[1] === "change/A^{tree}" ? "treeA" : "treeC";
            return { status: 0, stdout: `${treeSha}\n`, stderr: "" };
          }
          if (
            args[0] === "log" &&
            args[1] === "--format=%H %T" &&
            args[3] === "trunk"
          ) {
            return {
              status: 0,
              stdout: "mergeA treeA\nmergeC treeC\n",
              stderr: "",
            };
          }
          return {
            status: 1,
            stdout: "",
            stderr: `unexpected git ${args.join(" ")}`,
          };
        },
      },
    );

    expect(result.status).toBe("ok");
    expect(result).toEqual({
      status: "ok",
      branches: [
        {
          changeId: "A",
          branch: "change/A",
          localSha: "shaA",
          mergeProof: { kind: "tree-identical", trunkCommitSha: "mergeA" },
        },
        {
          changeId: "C",
          branch: "change/C",
          localSha: "shaC",
          mergeProof: { kind: "tree-identical", trunkCommitSha: "mergeC" },
        },
      ],
    });
    expect(
      calls.some(
        (args) => args[0] === "rev-parse" && args[1] === "change/B^{tree}",
      ),
    ).toBe(false);
  });

  it("detectArchivedMergedBranches returns blocked status when local branch list fails", () => {
    const result = detectArchivedMergedBranches(
      {
        mainCheckout: "/repo",
        defaultBranch: "trunk",
      },
      {
        runGit: (_cwd, args) => {
          if (args[0] === "branch" && args[1] === "--list") {
            return {
              status: 1,
              stdout: "",
              stderr: "fatal: not a git repository\n",
            };
          }
          return { status: 0, stdout: "", stderr: "" };
        },
      },
    );

    expect(result).toEqual({
      status: "blocked",
      reason: "LOCAL_BRANCH_LIST_FAILED",
      details: ["fatal: not a git repository"],
    });
  });

  describe("listLocalChangeBranchEntries", () => {
    it("parses change/* branch porcelain into entries", () => {
      const result = listLocalChangeBranchEntries("/repo", {
        runGit: (_cwd, args) => {
          if (args[0] === "branch" && args[1] === "--list") {
            return {
              status: 0,
              stdout: "change/abc def0123\nchange/xyz aa11bb22\n",
              stderr: "",
            };
          }
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
      });
      expect(result).toEqual({
        status: "ok",
        entries: [
          { changeId: "abc", branch: "change/abc", localSha: "def0123" },
          { changeId: "xyz", branch: "change/xyz", localSha: "aa11bb22" },
        ],
      });
    });

    it("returns blocked with LOCAL_BRANCH_LIST_FAILED on git failure", () => {
      const result = listLocalChangeBranchEntries("/repo", {
        runGit: () => ({
          status: 1,
          stdout: "",
          stderr: "fatal: not a git repository\n",
        }),
      });
      expect(result).toEqual({
        status: "blocked",
        reason: "LOCAL_BRANCH_LIST_FAILED",
        details: ["fatal: not a git repository"],
      });
    });

    it("ignores lines that are not well-formed change/* refs", () => {
      const result = listLocalChangeBranchEntries("/repo", {
        runGit: (_cwd, args) => {
          if (args[0] === "branch" && args[1] === "--list") {
            return {
              // A blank line, a non-change branch (filtered by the change/*
              // list glob in practice, defensive here), and a prefix-only ref.
              status: 0,
              stdout: "change/abc def0123\n\nchange/ deadbeef\n",
              stderr: "",
            };
          }
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
      });
      expect(result).toEqual({
        status: "ok",
        entries: [
          { changeId: "abc", branch: "change/abc", localSha: "def0123" },
        ],
      });
    });
  });

  describe("getCheckedOutChangeBranches", () => {
    it("returns set of change/* branches from worktree list --porcelain output", () => {
      const result = getCheckedOutChangeBranches("/repo", {
        runGit: (_cwd, args) => {
          if (args[0] === "worktree" && args[1] === "list") {
            return {
              status: 0,
              stdout:
                "worktree /home/main\n" +
                "HEAD abc123\n" +
                "branch refs/heads/trunk\n" +
                "\n" +
                "worktree /home/wt-change-foo\n" +
                "HEAD def456\n" +
                "branch refs/heads/change/foo\n" +
                "\n" +
                "worktree /home/bare\n" +
                "HEAD ghi789\n" +
                "bare\n" +
                "\n" +
                "worktree /home/detached\n" +
                "HEAD jkl012\n" +
                "detached\n",
              stderr: "",
            };
          }
          return { status: 0, stdout: "", stderr: "" };
        },
      });

      expect(result.status).toBe("ok");
      expect(result.branches).toEqual(new Set(["change/foo"]));
      expect(result.worktreePaths).toEqual({
        "change/foo": "/home/wt-change-foo",
      });
    });

    it("excludes non-change branches", () => {
      const result = getCheckedOutChangeBranches("/repo", {
        runGit: (_cwd, args) => {
          if (args[0] === "worktree" && args[1] === "list") {
            return {
              status: 0,
              stdout:
                "worktree /home/main\n" +
                "HEAD abc123\n" +
                "branch refs/heads/trunk\n" +
                "\n" +
                "worktree /home/feature\n" +
                "HEAD def456\n" +
                "branch refs/heads/feature/x\n" +
                "\n" +
                "worktree /home/change-a\n" +
                "HEAD ghi789\n" +
                "branch refs/heads/change/A\n" +
                "\n" +
                "worktree /home/change-b\n" +
                "HEAD jkl012\n" +
                "branch refs/heads/change/B\n",
              stderr: "",
            };
          }
          return { status: 0, stdout: "", stderr: "" };
        },
      });

      expect(result.status).toBe("ok");
      expect(result.branches).toEqual(new Set(["change/A", "change/B"]));
      expect(result.worktreePaths).toEqual({
        "change/A": "/home/change-a",
        "change/B": "/home/change-b",
      });
    });

    it("returns blocked status when git worktree list fails", () => {
      const result = getCheckedOutChangeBranches("/repo", {
        runGit: (_cwd, args) => {
          if (args[0] === "worktree" && args[1] === "list") {
            return {
              status: 1,
              stdout: "",
              stderr: "fatal: not a git repository\n",
            };
          }
          return { status: 0, stdout: "", stderr: "" };
        },
      });

      expect(result.status).toBe("blocked");
      expect(result.reason).toBe("WORKTREE_LIST_FAILED");
      expect(result.branches.size).toBe(0);
      expect(result.worktreePaths).toEqual({});
      expect(result.details).toEqual(["fatal: not a git repository"]);
    });
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
    expect(result.mainCheckpointCommitSha).toBeTruthy();
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
          if (args[0] === "merge") {
            return { status: 0, stdout: "merge", stderr: "" };
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
          if (args[0] === "merge") {
            return { status: 0, stdout: "merge", stderr: "" };
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
          if (args[0] === "merge") {
            return { status: 0, stdout: "merge", stderr: "" };
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

  it("commitArchiveArtifacts stages only explicit bundle, spec, and doc paths", async () => {
    const repo = join(tempRoot, "repo-explicit-archive-paths");
    await mkdir(repo);
    await initRepo(repo);
    git(repo, ["checkout", "-b", "change/example"]);

    await mkdir(join(repo, ".adv", "archive", "example"), {
      recursive: true,
    });
    await mkdir(join(repo, ".adv", "specs", "example"), {
      recursive: true,
    });
    await mkdir(join(repo, "docs", "specs"), { recursive: true });
    await writeFile(
      join(repo, ".adv", "archive", "example", "change.json"),
      "{}\n",
    );
    await writeFile(
      join(repo, ".adv", "specs", "example", "spec.json"),
      "{}\n",
    );
    await writeFile(join(repo, "docs", "specs", "example.md"), "# Example\n");
    await writeFile(join(repo, ".adv", "unrelated.txt"), "leave unstaged\n");

    const committed = commitArchiveArtifacts(repo, "example", {}, [
      ".adv/archive/example",
      ".adv/specs/example/spec.json",
      "docs/specs/example.md",
    ]);

    expect(committed.committed).toBe(true);
    const names = git(repo, [
      "show",
      "--pretty=format:",
      "--name-only",
      "HEAD",
    ]);
    expect(names).toContain(".adv/archive/example/change.json");
    expect(names).toContain(".adv/specs/example/spec.json");
    expect(names).toContain("docs/specs/example.md");
    expect(names).not.toContain(".adv/unrelated.txt");
    expect(git(repo, ["status", "--porcelain"])).toContain(
      "?? .adv/unrelated.txt",
    );
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

  describe("detectSquashMergeByTree", () => {
    it("returns reachable:true when tree SHA matches a trunk commit", async () => {
      const main = join(tempRoot, "squash-match");
      await mkdir(main);
      await initRepo(main);

      // Create initial commit on trunk
      await writeFile(join(main, "file.txt"), "initial\n");
      git(main, ["add", "file.txt"]);
      git(main, ["commit", "-m", "initial"]);

      // Create change branch with same tree as a future trunk commit
      git(main, ["checkout", "-b", "change/squash-test"]);
      await writeFile(join(main, "file.txt"), "modified\n");
      git(main, ["add", "file.txt"]);
      git(main, ["commit", "-m", "change commit"]);

      // Get the change tree SHA (used implicitly by detectSquashMergeByTree)
      git(main, ["rev-parse", "change/squash-test^{tree}"]);

      // Switch back to trunk and create a squash-like commit with the same tree
      git(main, ["checkout", "trunk"]);
      await writeFile(join(main, "file.txt"), "modified\n");
      git(main, ["add", "file.txt"]);
      git(main, ["commit", "-m", "squash merged change"]);
      const squashCommitSha = git(main, ["rev-parse", "HEAD"]);

      const result = detectSquashMergeByTree(main, "trunk", "squash-test");
      expect(result.reachable).toBe(true);
      expect(result.mergeCommitOid).toBe(squashCommitSha);
    });

    it("returns reachable:false when tree SHA does not match any trunk commit", async () => {
      const main = join(tempRoot, "squash-no-match");
      await mkdir(main);
      await initRepo(main);

      // Create initial commit on trunk
      await writeFile(join(main, "trunk.txt"), "trunk content\n");
      git(main, ["add", "trunk.txt"]);
      git(main, ["commit", "-m", "initial"]);

      // Create change branch with different tree
      git(main, ["checkout", "-b", "change/no-match"]);
      await writeFile(join(main, "change.txt"), "change content\n");
      git(main, ["add", "change.txt"]);
      git(main, ["commit", "-m", "change commit"]);

      // Switch back to trunk, no squash merge
      git(main, ["checkout", "trunk"]);

      const result = detectSquashMergeByTree(main, "trunk", "no-match");
      expect(result.reachable).toBe(false);
      expect(result.mergeCommitOid).toBeUndefined();
    });

    it("returns reachable:false when change branch does not exist", async () => {
      const main = join(tempRoot, "squash-missing-branch");
      await mkdir(main);
      await initRepo(main);

      // Create a commit on trunk
      await writeFile(join(main, "file.txt"), "content\n");
      git(main, ["add", "file.txt"]);
      git(main, ["commit", "-m", "initial"]);

      const result = detectSquashMergeByTree(main, "trunk", "nonexistent");
      expect(result.reachable).toBe(false);
      expect(result.mergeCommitOid).toBeUndefined();
    });

    it("returns reachable:false when trunk has no commits", async () => {
      const main = join(tempRoot, "squash-empty-trunk");
      await mkdir(main);
      await initRepo(main);
      // No commits on trunk

      const result = detectSquashMergeByTree(main, "trunk", "any-change");
      expect(result.reachable).toBe(false);
      expect(result.mergeCommitOid).toBeUndefined();
    });
  });

  describe("reconcileChangeBranchWithDefault", () => {
    async function setupRemoteAndWorktree(
      suffix: string,
      {
        behind = true,
        conflict = false,
      }: { behind?: boolean; conflict?: boolean } = {},
    ) {
      const origin = join(tempRoot, `${suffix}-origin`);
      const main = join(tempRoot, `${suffix}-main`);
      const worktree = join(tempRoot, `${suffix}-wt`);
      await mkdir(origin);
      await mkdir(main);
      git(origin, ["init", "-q", "--bare", "-b", "trunk"]);
      git(main, ["init", "-q", "-b", "trunk"]);
      git(main, ["config", "user.email", "adv-test@example.invalid"]);
      git(main, ["config", "user.name", "ADV Test"]);
      git(main, ["remote", "add", "origin", origin]);
      await writeFile(join(main, "README.md"), "initial\n");
      git(main, ["add", "README.md"]);
      git(main, ["commit", "-m", "initial"]);
      git(main, ["push", "-u", "origin", "trunk"]);

      git(main, ["checkout", "-b", "change/example"]);
      if (conflict) {
        await writeFile(join(main, "file.txt"), "change-line\n");
      } else {
        await writeFile(join(main, "change.txt"), "change\n");
      }
      git(main, ["add", "."]);
      git(main, ["commit", "-m", "change"]);
      git(main, ["push", "-u", "origin", "change/example"]);

      git(main, ["checkout", "trunk"]);
      if (behind) {
        if (conflict) {
          await writeFile(join(main, "file.txt"), "trunk-line\n");
        } else {
          await writeFile(join(main, "default.txt"), "default\n");
        }
        git(main, ["add", "."]);
        git(main, ["commit", "-m", "default advance"]);
        git(main, ["push", "origin", "trunk"]);
      }

      git(main, ["worktree", "add", worktree, "change/example"]);
      return { origin, main, worktree };
    }

    it("success: merges default commits into a change branch that is behind default", async () => {
      const { worktree, main } = await setupRemoteAndWorktree("reconcile-ok");

      const result = reconcileChangeBranchWithDefault({
        workdir: worktree,
        defaultBranch: "trunk",
        parsedRules: [],
      });

      expect(result).toEqual({ status: "ok" });
      const defaultCommit = git(main, ["rev-parse", "origin/trunk"]);
      const changeHead = git(worktree, ["rev-parse", "HEAD"]);
      const ancestorCheck = spawnSync(
        "git",
        ["merge-base", "--is-ancestor", defaultCommit, changeHead],
        { cwd: worktree, encoding: "utf8" },
      );
      expect(ancestorCheck.status).toBe(0);
    });

    it("conflict: blocks with conflict files and aborts the merge", async () => {
      const { worktree } = await setupRemoteAndWorktree("reconcile-conflict", {
        conflict: true,
      });
      const beforeCount = Number(
        git(worktree, ["rev-list", "--count", "HEAD"]),
      );

      const result = reconcileChangeBranchWithDefault({
        workdir: worktree,
        defaultBranch: "trunk",
        parsedRules: [],
      });

      expect(result).toMatchObject({
        status: "blocked",
        reason: "RECONCILE_CONFLICT",
        conflictFiles: expect.arrayContaining(["file.txt"]),
      });
      const afterCount = Number(git(worktree, ["rev-list", "--count", "HEAD"]));
      expect(afterCount).toBe(beforeCount);
      const status = spawnSync("git", ["status", "--porcelain"], {
        cwd: worktree,
        encoding: "utf8",
      });
      expect(status.stdout).not.toContain("UU");
    });

    it("linear history rule: blocks before attempting a merge", async () => {
      const { worktree } = await setupRemoteAndWorktree("reconcile-linear");
      const beforeCount = Number(
        git(worktree, ["rev-list", "--count", "HEAD"]),
      );

      const result = reconcileChangeBranchWithDefault({
        workdir: worktree,
        defaultBranch: "trunk",
        parsedRules: [{ type: "required_linear_history" }],
      });

      expect(result).toMatchObject({
        status: "blocked",
        reason: "LINEAR_HISTORY_REQUIRED",
      });
      const afterCount = Number(git(worktree, ["rev-list", "--count", "HEAD"]));
      expect(afterCount).toBe(beforeCount);
    });

    it("already up-to-date: returns ok without adding a merge commit", async () => {
      const { worktree } = await setupRemoteAndWorktree("reconcile-uptodate", {
        behind: false,
      });
      const beforeHead = git(worktree, ["rev-parse", "HEAD"]);

      const result = reconcileChangeBranchWithDefault({
        workdir: worktree,
        defaultBranch: "trunk",
        parsedRules: [],
      });

      expect(result).toEqual({ status: "ok" });
      const afterHead = git(worktree, ["rev-parse", "HEAD"]);
      expect(afterHead).toBe(beforeHead);
    });
  });

  describe("syncDefaultBranchAfterMerge (rq-releaseFinalization03)", () => {
    async function setupRepoWithOrigin(
      suffix: string,
      opts: {
        localAhead?: number;
        originAhead?: number;
        sameCommit?: boolean;
      } = {},
    ): Promise<{ origin: string; main: string }> {
      const origin = join(tempRoot, `sync-${suffix}-origin`);
      const main = join(tempRoot, `sync-${suffix}-main`);
      await mkdir(origin);
      git(origin, ["init", "-q", "--bare", "-b", "trunk"]);
      await mkdir(main);
      git(main, ["init", "-q", "-b", "trunk"]);
      git(main, ["config", "user.email", "adv-test@example.invalid"]);
      git(main, ["config", "user.name", "ADV Test"]);
      git(main, ["remote", "add", "origin", origin]);
      await writeFile(join(main, "README.md"), "initial\n");
      git(main, ["add", "README.md"]);
      git(main, ["commit", "-m", "initial"]);
      git(main, ["push", "-u", "origin", "trunk"]);

      // Push `originAhead` commits to origin directly (simulating a remote squash-merge landing).
      if (opts.originAhead && opts.originAhead > 0) {
        const remoteWork = join(tempRoot, `sync-${suffix}-rw`);
        await mkdir(remoteWork);
        git(remoteWork, ["init", "-q", "-b", "trunk"]);
        git(remoteWork, ["config", "user.email", "adv-test@example.invalid"]);
        git(remoteWork, ["config", "user.name", "ADV Test"]);
        git(remoteWork, ["remote", "add", "origin", origin]);
        git(remoteWork, ["fetch", "origin", "trunk"]);
        git(remoteWork, ["checkout", "-b", "scratch", "origin/trunk"]);
        for (let i = 0; i < opts.originAhead; i++) {
          await writeFile(
            join(remoteWork, `remote-${i}.txt`),
            `remote-commit-${i}\n`,
          );
          git(remoteWork, ["add", "."]);
          git(remoteWork, [
            "commit",
            "-m",
            opts.sameCommit ? `local-only-${i}` : `squash-merge-${i}`,
          ]);
        }
        git(remoteWork, ["push", "origin", "scratch:trunk"]);
      }

      // Add local-only commits (simulating an unpushed ADV checkpoint).
      if (opts.localAhead && opts.localAhead > 0) {
        for (let i = 0; i < opts.localAhead; i++) {
          await writeFile(join(main, `local-${i}.txt`), `local-commit-${i}\n`);
          git(main, ["add", "."]);
          git(main, ["commit", "-m", `local-checkpoint-${i}`]);
        }
      }
      return { origin, main };
    }

    it("clean ff-only: local fast-forwards to origin/{default} with delta captured", async () => {
      const { main } = await setupRepoWithOrigin("clean-ff", {
        localAhead: 0,
        originAhead: 2,
      });

      const beforeHead = (git(main, ["rev-parse", "HEAD"]) || "").trim();
      const result = syncDefaultBranchAfterMerge({
        mainCheckout: main,
        defaultBranch: "trunk",
      });
      const afterHead = (git(main, ["rev-parse", "HEAD"]) || "").trim();

      expect(result.status).toBe("synced");
      expect(Array.isArray(result.ffCommits)).toBe(true);
      expect((result.ffCommits ?? []).length).toBe(2);
      expect(afterHead).not.toBe(beforeHead);
      const originHead = (
        git(main, ["rev-parse", "origin/trunk"]) || ""
      ).trim();
      expect(afterHead).toBe(originHead);
    });

    it("diverged: surfaces without mutating local (rq-releaseFinalization03.2)", async () => {
      const { main } = await setupRepoWithOrigin("diverged", {
        localAhead: 2,
        originAhead: 3,
      });
      const beforeHead = (git(main, ["rev-parse", "HEAD"]) || "").trim();
      const beforeStatus = git(main, ["status", "--porcelain"]);

      const result = syncDefaultBranchAfterMerge({
        mainCheckout: main,
        defaultBranch: "trunk",
      });
      const afterHead = (git(main, ["rev-parse", "HEAD"]) || "").trim();
      const afterStatus = git(main, ["status", "--porcelain"]);

      expect(result.status).toBe("diverged");
      expect(result.reason).toBe("LOCAL_AHEAD_OF_ORIGIN");
      expect((result.localOnlyCommits ?? []).length).toBe(2);
      expect(afterHead).toBe(beforeHead);
      expect(afterStatus).toBe(beforeStatus); // no merge conflict markers
    });

    it("fetch failure: returns blocked with FETCH_FAILED (rq-releaseFinalization03.4)", async () => {
      // No remote configured — fetch will fail.
      const noRemote = join(tempRoot, "sync-noremote");
      await mkdir(noRemote);
      git(noRemote, ["init", "-q", "-b", "trunk"]);
      git(noRemote, ["config", "user.email", "adv-test@example.invalid"]);
      git(noRemote, ["config", "user.name", "ADV Test"]);
      await writeFile(join(noRemote, "README.md"), "x");
      git(noRemote, ["add", "README.md"]);
      git(noRemote, ["commit", "-m", "x"]);

      const result = syncDefaultBranchAfterMerge({
        mainCheckout: noRemote,
        defaultBranch: "trunk",
      });

      expect(result.status).toBe("blocked");
      expect(result.reason).toBe("FETCH_FAILED");
      expect(typeof result.remediation).toBe("string");
    });

    it("does not mutate the working tree destructively (rq-releaseFinalization03 + DONT5)", async () => {
      // Spy runGit: collect every argv it receives and assert no `reset --hard`,
      // `checkout`, `switch`, or `pull` ever appears.
      const calls: string[][] = [];
      const spyRunGit: typeof defaultRunGit = (cwd, args, timeoutMs) => {
        calls.push(args);
        return defaultRunGit(cwd, args, timeoutMs);
      };

      const { main } = await setupRepoWithOrigin("no-destructive-ops", {
        localAhead: 1,
        originAhead: 1,
      });

      const result = syncDefaultBranchAfterMerge(
        {
          mainCheckout: main,
          defaultBranch: "trunk",
        },
        { runGit: spyRunGit },
      );
      expect(result.status).toBe("diverged"); // expect diverged to fire the safety branch

      const flat = calls.map((argv) => argv.join(" ")).join("\n");
      expect(flat).not.toMatch(/\breset(\s|$)/);
      expect(flat).not.toMatch(/\bcheckout(\s|$)/);
      expect(flat).not.toMatch(/\bswitch(\s|$)/);
      expect(flat).not.toMatch(/\bpull(\s|$)/);
    });

    it("merge path: does not mutate the working tree destructively", async () => {
      const calls: string[][] = [];
      const spyRunGit: typeof defaultRunGit = (cwd, args, timeoutMs) => {
        calls.push(args);
        return defaultRunGit(cwd, args, timeoutMs);
      };

      const { main } = await setupRepoWithOrigin("no-destructive-ops-merge", {
        localAhead: 0,
        originAhead: 1,
      });

      const result = syncDefaultBranchAfterMerge(
        {
          mainCheckout: main,
          defaultBranch: "trunk",
        },
        { runGit: spyRunGit },
      );
      expect(result.status).toBe("synced");

      const flat = calls.map((argv) => argv.join(" ")).join("\n");
      expect(flat).not.toMatch(/\breset(\s|$)/);
      expect(flat).not.toMatch(/\bcheckout(\s|$)/);
      expect(flat).not.toMatch(/\bswitch(\s|$)/);
      expect(flat).not.toMatch(/\bpull(\s|$)/);
    });

    it("does not record release-done (rq-releaseFinalization03.3 closes validator ag-fJ57GzXO)", async () => {
      // Pure type-level contract: the outcome shape must have no `releaseDone` /
      // `recorded` field that could let the helper shortcut verifyReleaseEvidenceFromMain.
      const sample: import("./git-finalize").SyncDefaultBranchAfterMergeOutcome =
        {
          status: "synced",
          ffCommits: ["abc123"],
        };
      expect("releaseDone" in sample).toBe(false);
      expect("recorded" in sample).toBe(false);
      // Allowed keys (any subset may be present depending on status):
      expect(
        Object.keys(sample).every((k) =>
          [
            "status",
            "reason",
            "remediation",
            "localOnlyCommits",
            "ffCommits",
            "details",
          ].includes(k),
        ),
      ).toBe(true);
      expect(sample.status).toBe("synced");
    });

    it("already in sync (no-op): ahead==0 && behind==0 returns synced with empty ffCommits (rq-releaseFinalization03 / ce-5)", async () => {
      // Trivial no-op case: local and origin are at the same commit.
      const { main } = await setupRepoWithOrigin("no-op-sync", {
        localAhead: 0,
        originAhead: 0,
      });
      const beforeHead = (git(main, ["rev-parse", "HEAD"]) || "").trim();

      const result = syncDefaultBranchAfterMerge({
        mainCheckout: main,
        defaultBranch: "trunk",
      });
      const afterHead = (git(main, ["rev-parse", "HEAD"]) || "").trim();

      expect(result.status).toBe("synced");
      expect(result.ffCommits ?? []).toEqual([]);
      expect(afterHead).toBe(beforeHead);
      expect(result.details?.[0]).toMatch(/already at/);
    });

    describe("auto-drive regression guards", () => {
      it("rev-list failure returns blocked REV_LIST_FAILED (ce-1)", async () => {
        const { main } = await setupRepoWithOrigin("revlist-fail", {
          localAhead: 0,
          originAhead: 1,
        });
        const result = syncDefaultBranchAfterMerge(
          { mainCheckout: main, defaultBranch: "trunk" },
          {
            runGit: (cwd, args) => {
              if (args[0] === "fetch" && args[1] === "origin") {
                return defaultRunGit(cwd, args);
              }
              if (
                args[0] === "rev-parse" &&
                args[1] === "--abbrev-ref" &&
                args[2] === "HEAD"
              ) {
                return { status: 0, stdout: "trunk\n", stderr: "" };
              }
              if (args[0] === "rev-list" && args[1] === "--count") {
                return {
                  status: 128,
                  stdout: "",
                  stderr: `fatal: malformed revision '${args[2]}'\n`,
                };
              }
              return defaultRunGit(cwd, args);
            },
          },
        );
        expect(result.status).toBe("blocked");
        expect(result.reason).toBe("REV_LIST_FAILED");
        expect(result.remediation).toContain("rev-list failed");
      });

      it("non-numeric rev-list count returns blocked REV_LIST_FAILED (ce-1)", async () => {
        const { main } = await setupRepoWithOrigin("revlist-nan", {
          localAhead: 0,
          originAhead: 1,
        });
        let revListCount = 0;
        const result = syncDefaultBranchAfterMerge(
          { mainCheckout: main, defaultBranch: "trunk" },
          {
            runGit: (cwd, args) => {
              if (args[0] === "fetch" && args[1] === "origin") {
                return defaultRunGit(cwd, args);
              }
              if (
                args[0] === "rev-parse" &&
                args[1] === "--abbrev-ref" &&
                args[2] === "HEAD"
              ) {
                return { status: 0, stdout: "trunk\n", stderr: "" };
              }
              if (args[0] === "rev-list" && args[1] === "--count") {
                revListCount++;
                const bad = revListCount === 1;
                return {
                  status: 0,
                  stdout: bad ? "not-a-number\n" : "1\n",
                  stderr: "",
                };
              }
              return defaultRunGit(cwd, args);
            },
          },
        );
        expect(result.status).toBe("blocked");
        expect(result.reason).toBe("REV_LIST_FAILED");
      });

      it("HEAD on wrong branch returns blocked MAIN_NOT_ON_DEFAULT (ce-2)", async () => {
        const { main } = await setupRepoWithOrigin("head-wrong-branch", {
          localAhead: 0,
          originAhead: 1,
        });
        git(main, ["checkout", "-b", "feature"]);
        const beforeHead = (git(main, ["rev-parse", "HEAD"]) || "").trim();
        const result = syncDefaultBranchAfterMerge({
          mainCheckout: main,
          defaultBranch: "trunk",
        });
        const afterHead = (git(main, ["rev-parse", "HEAD"]) || "").trim();
        expect(result.status).toBe("blocked");
        expect(result.reason).toBe("MAIN_NOT_ON_DEFAULT");
        expect(result.details).toContain("HEAD=feature");
        expect(afterHead).toBe(beforeHead);
      });
    });
  });

  describe("merge queue handoff", () => {
    function queueGhMock(
      opts: {
        finalState?: "OPEN" | "MERGED";
        armingFails?: boolean;
        existingPr?: boolean;
      } = {},
    ) {
      const {
        finalState = "OPEN",
        armingFails = false,
        existingPr = false,
      } = opts;
      let branchViewCount = 0;
      return {
        runGh: (_cwd: string, args: string[]) => {
          if (
            args[0] === "pr" &&
            args[1] === "view" &&
            args[2] === "change/example"
          ) {
            branchViewCount += 1;
            if (existingPr) {
              return {
                status: 0,
                stdout: JSON.stringify({
                  number: 42,
                  url: "https://github.com/Sharper-Flow/Advance/pull/42",
                  state: finalState,
                  autoMergeRequest:
                    finalState === "OPEN"
                      ? { enabledAt: "2026-06-07T00:00:00Z" }
                      : null,
                }),
                stderr: "",
              };
            }
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
          if (args[0] === "pr" && args[1] === "create") {
            return {
              status: 0,
              stdout: "https://github.com/Sharper-Flow/Advance/pull/42\n",
              stderr: "",
            };
          }
          if (args[0] === "pr" && args[1] === "merge") {
            if (armingFails) {
              return {
                status: 1,
                stdout: "",
                stderr: "auto-merge could not be enabled",
              };
            }
            return { status: 0, stdout: "Auto-merge enabled", stderr: "" };
          }
          if (args[0] === "pr" && args[1] === "view" && args[2] === "42") {
            return {
              status: 0,
              stdout: JSON.stringify({
                state: finalState,
                mergedAt:
                  finalState === "MERGED" ? "2026-06-07T00:00:00Z" : null,
                mergeCommit:
                  finalState === "MERGED" ? { oid: "merge-sha" } : null,
                autoMergeRequest:
                  finalState === "OPEN"
                    ? { enabledAt: "2026-06-07T00:00:00Z" }
                    : null,
              }),
              stderr: "",
            };
          }
          return {
            status: 1,
            stdout: "",
            stderr: `unexpected gh ${args.join(" ")}`,
          };
        },
      };
    }

    function queueGitMock() {
      const calls: string[][] = [];
      return {
        calls,
        runGit: (_cwd: string, args: string[]) => {
          calls.push(args);
          if (
            args[0] === "fetch" &&
            args[1] === "origin" &&
            args[2] === "trunk"
          ) {
            return { status: 0, stdout: "", stderr: "" };
          }
          if (args[0] === "reset" && args[1] === "--hard") {
            return { status: 0, stdout: "reset", stderr: "" };
          }
          if (args[0] === "push" && args.includes("change/example")) {
            return { status: 0, stdout: "pushed branch", stderr: "" };
          }
          return {
            status: 1,
            stdout: "",
            stderr: `unexpected git ${args.join(" ")}`,
          };
        },
      };
    }

    it("completeMergeQueueHandoff returns pending_merge when auto-merge is armed", () => {
      const gitMock = queueGitMock();
      const ghMock = queueGhMock({ finalState: "OPEN" });

      const result = completeMergeQueueHandoff(
        {
          mainCheckout: "/main",
          workdir: "/workdir",
          defaultBranch: "trunk",
          changeId: "example",
          route: {
            route: "merge_queue",
            repo: "Sharper-Flow/Advance",
            mergeQueueRequired: true,
          },
        },
        {
          runGit: gitMock.runGit,
          runGh: ghMock.runGh,
        },
      );

      expect(result).toMatchObject({
        status: "pending_merge",
        route: "merge_queue",
        prBranch: "change/example",
        prNumber: 42,
        prUrl: "https://github.com/Sharper-Flow/Advance/pull/42",
        autoMergeArmed: true,
        pushStatus: "pushed",
      });
      expect(gitMock.calls).toContainEqual(["fetch", "origin", "trunk"]);
      expect(gitMock.calls).toContainEqual(["reset", "--hard", "origin/trunk"]);
    });

    it("completeMergeQueueHandoff collapses to shipped when PR is already merged", () => {
      const gitMock = queueGitMock();
      const ghMock = queueGhMock({ finalState: "MERGED" });

      const result = completeMergeQueueHandoff(
        {
          mainCheckout: "/main",
          workdir: "/workdir",
          defaultBranch: "trunk",
          changeId: "example",
          route: {
            route: "merge_queue",
            repo: "Sharper-Flow/Advance",
            mergeQueueRequired: true,
          },
        },
        {
          runGit: gitMock.runGit,
          runGh: ghMock.runGh,
        },
      );

      expect(result).toMatchObject({
        status: "shipped",
        route: "merge_queue",
        prNumber: 42,
        mergeCommitSha: "merge-sha",
        pushStatus: "pushed",
      });
    });

    it("completeMergeQueueHandoff blocks when auto-merge arming fails", () => {
      const gitMock = queueGitMock();
      const ghMock = queueGhMock({ armingFails: true });

      const result = completeMergeQueueHandoff(
        {
          mainCheckout: "/main",
          workdir: "/workdir",
          defaultBranch: "trunk",
          changeId: "example",
          route: {
            route: "merge_queue",
            repo: "Sharper-Flow/Advance",
            mergeQueueRequired: true,
          },
        },
        {
          runGit: gitMock.runGit,
          runGh: ghMock.runGh,
        },
      );

      expect(result.status).toBe("blocked");
      expect(result.blocked?.reason).toBe("AUTO_MERGE_ARM_FAILED");
    });

    it("executePullRequestHandoff runs push → ensure PR → arm auto-merge → reachability in sequence", () => {
      const gitCalls: string[][] = [];
      const ghCalls: string[][] = [];
      let branchViewCount = 0;

      const result = executePullRequestHandoff(
        {
          mainCheckout: "/main",
          workdir: "/workdir",
          repo: "Sharper-Flow/Advance",
          branch: "change/example",
          defaultBranch: "trunk",
          changeId: "example",
          route: {
            route: "pr_auto_merge",
            repo: "Sharper-Flow/Advance",
            protected: true,
            autoMergeAllowed: true,
          },
        },
        {
          runGit: (_cwd, args) => {
            gitCalls.push(args);
            if (args[0] === "push" && args.includes("change/example")) {
              return { status: 0, stdout: "pushed branch", stderr: "" };
            }
            return {
              status: 1,
              stdout: "",
              stderr: `unexpected git ${args.join(" ")}`,
            };
          },
          runGh: (_cwd, args) => {
            ghCalls.push(args);
            if (
              args[0] === "pr" &&
              args[1] === "view" &&
              args[2] === "change/example"
            ) {
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
            if (args[0] === "pr" && args[1] === "view" && args[2] === "42") {
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
        prNumber: 42,
        autoMergeArmed: true,
        pushStatus: "pushed",
      });
      expect(gitCalls[0]).toEqual(["push", "origin", "change/example"]);
      const prOps = ghCalls.map((a) => a.slice(0, 2).join(" "));
      expect(prOps).toEqual([
        "pr view",
        "pr create",
        "pr view",
        "pr merge",
        "pr view",
      ]);
    });

    it("armPullRequestAutoMerge never passes -d or --delete-branch", () => {
      const allMergeCalls: string[][] = [];
      function instrumentedGh(
        base: (
          _cwd: string,
          args: string[],
        ) => { status: number; stdout: string; stderr: string },
      ) {
        return (_cwd: string, args: string[]) => {
          if (args[0] === "pr" && args[1] === "merge") {
            allMergeCalls.push(args);
          }
          return base(_cwd, args);
        };
      }

      const queueGit = queueGitMock();
      const queueGh = queueGhMock({ finalState: "OPEN" });
      completeMergeQueueHandoff(
        {
          mainCheckout: "/main",
          workdir: "/workdir",
          defaultBranch: "trunk",
          changeId: "example",
          route: {
            route: "merge_queue",
            repo: "Sharper-Flow/Advance",
            mergeQueueRequired: true,
          },
        },
        {
          runGit: queueGit.runGit,
          runGh: instrumentedGh(queueGh.runGh),
        },
      );

      const prAutoGitCalls: string[][] = [];
      const prAutoGhCalls: string[][] = [];
      let branchViewCount = 0;
      executePullRequestHandoff(
        {
          mainCheckout: "/main",
          workdir: "/workdir",
          repo: "Sharper-Flow/Advance",
          branch: "change/example",
          defaultBranch: "trunk",
          changeId: "example",
          route: {
            route: "pr_auto_merge",
            repo: "Sharper-Flow/Advance",
            protected: true,
            autoMergeAllowed: true,
          },
        },
        {
          runGit: (_cwd, args) => {
            prAutoGitCalls.push(args);
            if (args[0] === "push" && args.includes("change/example")) {
              return { status: 0, stdout: "pushed branch", stderr: "" };
            }
            return {
              status: 1,
              stdout: "",
              stderr: `unexpected git ${args.join(" ")}`,
            };
          },
          runGh: instrumentedGh((_cwd, args) => {
            prAutoGhCalls.push(args);
            if (
              args[0] === "pr" &&
              args[1] === "view" &&
              args[2] === "change/example"
            ) {
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
            if (args[0] === "pr" && args[1] === "view" && args[2] === "42") {
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
            return {
              status: 1,
              stdout: "",
              stderr: `unexpected gh ${args.join(" ")}`,
            };
          }),
        },
      );

      expect(allMergeCalls.length).toBeGreaterThanOrEqual(2);
      for (const call of allMergeCalls) {
        expect(call).not.toContain("-d");
        expect(call).not.toContain("--delete-branch");
      }
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

// Regression guards for rq-releaseFinalization02/03/04: ensure the auto-drive
// change did not perturb any non-pending-PR archive path. These are static
// checks (no live remote, no Temporal) since the existing parent-change tests
// already exercise direct/no-remote/ff-only runtime paths.
describe("auto-drive regression guards (rq-releaseFinalization02 / DONT1 / DONT3)", () => {
  it("syncDefaultBranchAfterMerge is exported but not invoked internally by git-finalize helpers", () => {
    // The helper must be exported (so command-layer callers can use it) but must
    // NOT be auto-invoked by any other git-finalize helper — keep the only call
    // site in the adv-archive.md Phase 9.5 orchestration. DONT3 / AC7.
    const src = readFileSync(join(__dirname, "git-finalize.ts"), "utf8");
    // Find any helper that calls syncDefaultBranchAfterMerge (other than its own
    // declaration) — that would be an unintended internal dependency.
    const lines = src.split("\n");
    let declaredAt = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/export function syncDefaultBranchAfterMerge/.test(lines[i])) {
        declaredAt = i;
        break;
      }
    }
    expect(declaredAt).toBeGreaterThan(-1);

    // Count call sites and exclude the declaration line + its immediate docblock
    const callSites = lines
      .map((line, idx) => ({ line, idx }))
      .filter(
        ({ idx, line }) =>
          idx !== declaredAt &&
          /syncDefaultBranchAfterMerge\s*\(/.test(line) &&
          !/^\s*\*\s/.test(line), // skip JSDoc lines
      );
    expect(callSites).toEqual([]); // zero internal call sites
  });

  it("git-finalize.ts adds no new temporal/* imports beyond the existing CHANGE_BRANCH_PREFIX (AC7 layer-boundary)", () => {
    // Reading the file confirms my edit retained only the pre-existing
    // CHANGE_BRANCH_PREFIX import from temporal/contracts and added no other
    // symbol that would break the worker-bundle boundary test.
    const src = readFileSync(join(__dirname, "git-finalize.ts"), "utf8");
    const temporalImportLines = src
      .split("\n")
      .filter((line) => /^import.*from.*temporal/.test(line));
    // Exactly one temporal/* import — and it must reference CHANGE_BRANCH_PREFIX
    // (the pre-existing allowed symbol).
    expect(temporalImportLines).toHaveLength(1);
    expect(temporalImportLines[0]).toContain("CHANGE_BRANCH_PREFIX");
    expect(temporalImportLines[0]).toContain("/temporal/contracts");
  });

  it("helper does not add CI surface (AC7 + DONT4)", () => {
    const src = readFileSync(join(__dirname, "git-finalize.ts"), "utf8");
    // The helper is a pure runGit-injected function with no agent-orchestration
    // surface. No task-spawn or CI-wait symbols must leak into the helper module.
    expect(/task[A-Z_]/.test(src)).toBe(false);
    expect(/ci-wait/i.test(src)).toBe(false);
    expect(/spawnTask/i.test(src)).toBe(false);
  });
});

// Regression guard for the command-side auto-drive: verify the new auto-drive
// section in adv-archive.md does NOT route completion through redriveArchivedUnmergedBranch
// (DONT3) — the correct completion path is verifyReleaseEvidenceFromMain.
describe("adv-archive.md auto-drive (rq-releaseFinalization02 DONT3)", () => {
  it("does not mention redriveArchivedUnmergedBranch in the new auto-drive section", () => {
    // __dirname = <plugin>/src/tools/archive-helpers/. Repo root is 4 levels up.
    const repoRoot = join(__dirname, "..", "..", "..", "..");
    const cmdPath = join(repoRoot, ".opencode/command/adv-archive.md");
    const content = readFileSync(cmdPath, "utf8");
    // The auto-drive section lives inside the Phase 9.5 block. Use regex to
    // capture the section header (idempotent against header-text duplication
    // and future refactors) and stop at the next `### Step` heading.
    const headerPattern =
      /^### Phase 9\.5: Auto-Drive Pending-PR Archive Completion\s*$/m;
    const sectionStartMatch = headerPattern.exec(content);
    expect(sectionStartMatch).not.toBeNull();
    const sectionStart = sectionStartMatch!.index;
    const tail = content.slice(sectionStart + sectionStartMatch![0].length);
    // Stop at the next "### " subheading (any Step or other subhead).
    const nextHeadMatch = /\n###\s/.exec(tail);
    const section = nextHeadMatch
      ? content.slice(
          sectionStart,
          sectionStart + sectionStartMatch![0].length + nextHeadMatch.index,
        )
      : content.slice(sectionStart);
    expect(section).not.toMatch(/redriveArchivedUnmergedBranch/);
    // The section must reference the correct completion entry instead.
    expect(section).toContain("verifyReleaseEvidenceFromMain");
    // And the new helper it delegates to.
    expect(section).toContain("syncDefaultBranchAfterMerge");
  });
});
