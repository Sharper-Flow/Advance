/**
 * Phase 9 git finalization helper tests.
 *
 * These tests lock the runtime side of rq-releaseFinalization01 so the
 * release gate cannot be satisfied by prose-only /adv-archive instructions.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "fs/promises";
import { existsSync, readFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { createTempDir } from "../../__tests__/setup";
import {
  classifyFinalizationRoute,
  coercePrWorkflowRoute,
  completeMergeQueueHandoff,
  createArchivePullRequest,
  detectArchiveMode,
  detectDefaultBranch,
  deleteChangeBranch,
  executePullRequestHandoff,
  finalizeRelease,
  mergeChangeBranch,
  pushToOrigin,
  pushChangeBranch,
  reconcileChangeBranchWithDefault,
  resolveRepoRoot,
  verifyChangeBranchPushed,
  verifyChangeBranchReachable,
  verifyDefaultBranchPushed,
  redactGitOutput,
  resolveReleaseReachability,
  validateChangeWorktree,
  validateArchiveDeltaRepairWorktree,
  commitArchiveArtifacts,
  verifyChangeBranchReachableFromOrigin,
  detectArchivedUnmergedBranches,
  redriveArchivedUnmergedBranch,
  detectSquashMergeByTree,
  detectArchivedMergedBranches,
  listLocalChangeBranchEntries,
  getCheckedOutChangeBranches,
  armPullRequestAutoMerge,
  // rq-optimizePhase9GitCalls AC7 — internal accumulator exports for direct matrix testing.
  createState,
  invalidate,
  getRoute,
  ensureOriginDefaultFetched,
  discoverMergedPr,
  readPrMergeState,
  verifyDirectMergedPrProof,
} from "./git-finalize";
import type { PrTitlePolicy } from "../../types/project";

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

  it("resolveRepoRoot returns the project git root from a linked worktree", async () => {
    const main = join(tempRoot, "main");
    const worktree = join(tempRoot, "wt");
    await mkdir(main);
    await initRepo(main);
    git(main, ["worktree", "add", "-b", "change/example", worktree]);

    expect(resolveRepoRoot(worktree)).toBe(main);
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

  it("verifyChangeBranchReachable does not present git fatal text as unmerged commits", async () => {
    const repo = join(tempRoot, "repo-missing-ref");
    await mkdir(repo);
    await initRepo(repo);

    // change/absent was never created — the ref cannot resolve. This models a
    // branch deleted after merge. The git fatal string must NOT be laundered
    // into unmergedCommits, which callers read as real commit evidence.
    const result = verifyChangeBranchReachable(repo, "trunk", "absent");

    expect(result.reachable).toBe(false);
    expect(result.unmergedCommits).toEqual([]);
    expect(result.refUnresolved).toBe(true);
  });

  it("verifyChangeBranchReachableFromOrigin refreshes the remote change ref before ancestry", () => {
    const calls: string[][] = [];
    const result = verifyChangeBranchReachableFromOrigin(
      "/repo",
      "trunk",
      "example",
      {
        runGit: (_cwd, args) => {
          calls.push(args);
          if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
          if (
            args[0] === "rev-parse" &&
            args[2] === "refs/remotes/origin/change/example"
          )
            return { status: 0, stdout: "tip-sha\n", stderr: "" };
          if (
            args[0] === "merge-base" &&
            args[2] === "tip-sha" &&
            args[3] === "origin/trunk"
          )
            return { status: 0, stdout: "", stderr: "" };
          return {
            status: 1,
            stdout: "",
            stderr: `unexpected ${args.join(" ")}`,
          };
        },
      },
    );

    expect(result).toEqual({
      reachable: true,
      unmergedCommits: [],
      refSource: "refreshed_ref",
    });
    expect(calls).toContainEqual([
      "fetch",
      "origin",
      "refs/heads/trunk:refs/remotes/origin/trunk",
      "+refs/heads/change/example:refs/remotes/origin/change/example",
    ]);
    expect(calls).toContainEqual([
      "rev-parse",
      "--verify",
      "refs/remotes/origin/change/example",
    ]);
    expect(calls).toContainEqual([
      "merge-base",
      "--is-ancestor",
      "tip-sha",
      "origin/trunk",
    ]);
  });

  it("verifyChangeBranchReachableFromOrigin rejects a stale tracking ref after refresh", () => {
    const calls: string[][] = [];
    let refreshed = false;
    const result = verifyChangeBranchReachableFromOrigin(
      "/repo",
      "trunk",
      "stale-example",
      {
        runGit: (_cwd, args) => {
          calls.push(args);
          if (args[0] === "fetch") {
            refreshed = true;
            return { status: 0, stdout: "", stderr: "" };
          }
          if (
            args[0] === "rev-parse" &&
            args[2] === "refs/remotes/origin/change/stale-example"
          ) {
            // Before the fetch this tracking ref would have pointed at the
            // old merged tip. The refresh exposes the newer unmerged tip.
            return {
              status: 0,
              stdout: `${refreshed ? "new-unmerged-tip" : "old-merged-tip"}\n`,
              stderr: "",
            };
          }
          if (args[0] === "merge-base") {
            expect(refreshed).toBe(true);
            if (args[2] === "old-merged-tip") {
              return { status: 0, stdout: "", stderr: "" };
            }
            expect(args[2]).toBe("new-unmerged-tip");
            return { status: 1, stdout: "", stderr: "" };
          }
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
      },
    );

    expect(result).toEqual({
      reachable: false,
      unmergedCommits: [],
      refSource: "refreshed_ref",
    });
    const fetchIndex = calls.findIndex((args) => args[0] === "fetch");
    const resolveIndex = calls.findIndex((args) => args[0] === "rev-parse");
    const ancestryIndex = calls.findIndex((args) => args[0] === "merge-base");
    expect(fetchIndex).toBeGreaterThanOrEqual(0);
    expect(resolveIndex).toBeGreaterThan(fetchIndex);
    expect(ancestryIndex).toBeGreaterThan(resolveIndex);
    expect(calls[ancestryIndex]).toEqual([
      "merge-base",
      "--is-ancestor",
      "new-unmerged-tip",
      "origin/trunk",
    ]);
  });

  it("verifyChangeBranchReachableFromOrigin uses persisted tip without network", () => {
    const calls: string[][] = [];
    const result = verifyChangeBranchReachableFromOrigin(
      "/repo",
      "trunk",
      "example",
      {
        changeTipSha: "persisted-tip",
        runGit: (_cwd, args) => {
          calls.push(args);
          if (
            args[0] === "merge-base" &&
            args[2] === "persisted-tip" &&
            args[3] === "origin/trunk"
          )
            return { status: 0, stdout: "", stderr: "" };
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
      },
    );

    expect(result).toEqual({
      reachable: true,
      unmergedCommits: [],
      refSource: "persisted",
    });
    expect(calls).toEqual([
      ["merge-base", "--is-ancestor", "persisted-tip", "origin/trunk"],
    ]);
  });

  it("verifyChangeBranchReachableFromOrigin fails closed without commit evidence when the ref is unresolved", () => {
    const result = verifyChangeBranchReachableFromOrigin(
      "/repo",
      "trunk",
      "example",
      {
        runGit: (_cwd, args) => {
          if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
          if (args[0] === "rev-parse") {
            return {
              status: 128,
              stdout: "",
              stderr: "fatal: ambiguous argument: missing ref",
            };
          }
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
      },
    );

    expect(result).toEqual({
      reachable: false,
      unmergedCommits: [],
      refUnresolved: true,
    });
  });

  it("resolves AC4 from a refreshed origin change ref after local and tracking deletion", async () => {
    const origin = join(tempRoot, "ac4-origin.git");
    const seed = join(tempRoot, "ac4-seed");
    const repo = join(tempRoot, "ac4-clone");
    const changeId = "ac4-deleted-change";
    await mkdir(origin);
    await mkdir(seed);
    await initRepo(seed);
    git(origin, ["init", "--bare", "-q", "--initial-branch=trunk"]);
    git(seed, ["remote", "add", "origin", origin]);
    git(seed, ["checkout", "-q", "-b", `change/${changeId}`]);
    await writeFile(join(seed, "change.txt"), "change\n");
    git(seed, ["add", "change.txt"]);
    git(seed, ["commit", "-m", "change"]);
    git(seed, ["checkout", "-q", "trunk"]);
    git(seed, ["merge", "--no-ff", `change/${changeId}`, "-m", "merge change"]);
    git(seed, ["push", "-q", "origin", "trunk", `change/${changeId}`]);
    git(tempRoot, ["clone", "-q", origin, repo]);
    git(repo, [
      "checkout",
      "-q",
      "-b",
      `change/${changeId}`,
      `origin/change/${changeId}`,
    ]);
    git(repo, ["checkout", "-q", "trunk"]);
    git(repo, ["branch", "-D", `change/${changeId}`]);
    git(repo, ["update-ref", "-d", `refs/remotes/origin/change/${changeId}`]);

    const localChangeRef = spawnSync(
      "git",
      ["show-ref", "--verify", "--quiet", `refs/heads/change/${changeId}`],
      { cwd: repo },
    );
    const trackingChangeRef = spawnSync(
      "git",
      [
        "show-ref",
        "--verify",
        "--quiet",
        `refs/remotes/origin/change/${changeId}`,
      ],
      { cwd: repo },
    );
    expect(localChangeRef.status).not.toBe(0);
    expect(trackingChangeRef.status).not.toBe(0);
    expect(
      git(repo, ["ls-remote", "origin", `refs/heads/change/${changeId}`]),
    ).toContain(`refs/heads/change/${changeId}`);

    const result = resolveReleaseReachability({
      repoRoot: repo,
      defaultBranch: "trunk",
      changeId,
      route: { route: "direct", repo: "unused/repo" },
    });

    expect(result).toMatchObject({
      reachable: true,
      proof: "origin_default",
    });
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

  it("classifyFinalizationRoute treats a local bare origin as direct", () => {
    const bareRepo = mkdtempSync(join(tmpdir(), "adv-bare-origin-"));
    spawnSync("git", ["init", "--bare", "-q", "-b", "trunk", bareRepo]);

    const bareOrigin = classifyFinalizationRoute("/repo", "trunk", {
      runGit: (_cwd, args) => {
        if (args.join(" ") === "remote get-url origin") {
          return {
            status: 0,
            stdout: `${bareRepo}\n`,
            stderr: "",
          };
        }
        if (
          args.join(" ") === "rev-parse --is-bare-repository" &&
          _cwd === bareRepo
        ) {
          return { status: 0, stdout: "true\n", stderr: "" };
        }
        return { status: 1, stdout: "", stderr: "unexpected" };
      },
    });
    expect(bareOrigin).toMatchObject({
      route: "direct",
      remoteUrl: bareRepo,
      protected: false,
    });
  });

  describe("direct-route merged PR proof", () => {
    const validPayload = {
      number: 405,
      url: "https://github.com/owner/repo/pull/405",
      state: "MERGED",
      mergedAt: "2026-08-08T00:00:00Z",
      mergeCommit: { oid: "merge-commit" },
      headRefName: "change/example",
      headRefOid: "local-tip",
      baseRefName: "trunk",
      headRepositoryOwner: { login: "owner" },
      headRepository: { name: "repo", nameWithOwner: "owner/repo" },
      isCrossRepository: false,
    };

    function proofRecords(
      records: unknown[],
      runGit: (
        _cwd: string,
        args: string[],
      ) => {
        status: number;
        stdout: string;
        stderr: string;
      } = (_cwd, args) => {
        if (args[0] === "merge-base")
          return { status: 0, stdout: "", stderr: "" };
        if (args[0] === "rev-parse")
          return { status: 0, stdout: "current-default\n", stderr: "" };
        return { status: 1, stdout: "", stderr: "unexpected" };
      },
    ) {
      return verifyDirectMergedPrProof(
        {
          repoRoot: "/repo",
          repo: "owner/repo",
          defaultBranch: "trunk",
          changeId: "example",
          changeTipSha: "local-tip",
        },
        {
          runGh: () => ({
            status: 0,
            stdout: JSON.stringify(records),
            stderr: "",
          }),
          runGit,
        },
      );
    }

    function proof(overrides: Record<string, unknown> = {}) {
      return proofRecords([{ ...validPayload, ...overrides }]);
    }

    it("accepts exact merged PR proof and records current default reachability", () => {
      expect(proof()).toEqual({
        kind: "valid",
        prNumber: 405,
        prUrl: "https://github.com/owner/repo/pull/405",
        prHeadSha: "local-tip",
        mergeCommitOid: "merge-commit",
        defaultBranchSha: "current-default",
      });
    });

    it("fails closed when the merged PR head matches neither archive tip", () => {
      expect(
        verifyDirectMergedPrProof(
          {
            repoRoot: "/repo",
            repo: "owner/repo",
            defaultBranch: "trunk",
            changeId: "example",
            changeTipSha: "post-tip",
            preArchiveTipSha: "pre-tip",
          },
          {
            runGh: () => ({
              status: 0,
              stdout: JSON.stringify([
                { ...validPayload, headRefOid: "other-tip" },
              ]),
              stderr: "",
            }),
            runGit: (_cwd, args) =>
              args[0] === "merge-base"
                ? { status: 0, stdout: "", stderr: "" }
                : { status: 0, stdout: "current-default", stderr: "" },
          },
        ),
      ).toMatchObject({
        kind: "invalid",
        reason: "MERGED_PR_PROOF_MISMATCH",
      });
    });

    it("selects one exact local-tip proof among historical merged PRs on the reused branch", () => {
      expect(
        proofRecords([
          { ...validPayload, number: 404, headRefOid: "historical-tip" },
          validPayload,
          { ...validPayload, number: 403, headRefOid: "older-tip" },
        ]),
      ).toEqual({
        kind: "valid",
        prNumber: 405,
        prUrl: "https://github.com/owner/repo/pull/405",
        prHeadSha: "local-tip",
        mergeCommitOid: "merge-commit",
        defaultBranchSha: "current-default",
      });
    });

    it("rejects multiple historical records when no head OID matches the local tip", () => {
      expect(
        proofRecords([
          { ...validPayload, number: 404, headRefOid: "historical-tip" },
          { ...validPayload, number: 403, headRefOid: "older-tip" },
        ]),
      ).toMatchObject({
        kind: "invalid",
        reason: "MERGED_PR_PROOF_MISMATCH",
      });
    });

    it("rejects multiple exact local-tip proofs as ambiguous", () => {
      expect(
        proofRecords([
          validPayload,
          {
            ...validPayload,
            number: 406,
            url: "https://github.com/owner/repo/pull/406",
          },
        ]),
      ).toMatchObject({
        kind: "invalid",
        reason: "MERGED_PR_PROOF_AMBIGUOUS",
      });
    });

    it("keeps an unparseable record fatal even when another record matches exactly", () => {
      expect(proofRecords([validPayload, null])).toMatchObject({
        kind: "invalid",
        reason: "MERGED_PR_PROOF_RECORD_UNPARSEABLE",
      });
    });

    it("reports possible query-window saturation when 20 records contain no exact match", () => {
      const records = Array.from({ length: 20 }, (_, index) => ({
        ...validPayload,
        number: 500 + index,
        headRefOid: `historical-tip-${index}`,
      }));
      const result = proofRecords(records);
      expect(result).toMatchObject({
        kind: "invalid",
        reason: "MERGED_PR_PROOF_MISMATCH",
      });
      expect(result.kind === "invalid" ? result.details : []).toContain(
        "Merged PR proof query reached limit 20 without an exact local-tip match",
      );
    });

    for (const [label, overrides] of [
      ["wrong head OID", { headRefOid: "other-tip" }],
      ["wrong base", { baseRefName: "main" }],
      ["wrong state", { state: "OPEN", mergedAt: null }],
    ] as const) {
      it(`rejects ${label}`, () => {
        expect(proof(overrides)).toMatchObject({ kind: "invalid" });
      });
    }

    it("rejects an unreachable merge commit", () => {
      const result = proofRecords(
        [
          { ...validPayload, number: 404, headRefOid: "historical-tip" },
          validPayload,
        ],
        () => ({ status: 1, stdout: "", stderr: "not reachable" }),
      );
      expect(result).toMatchObject({
        kind: "invalid",
        reason: "MERGED_PR_COMMIT_UNREACHABLE",
      });
    });

    it("continues direct behavior only when the merged PR list is explicitly empty", () => {
      expect(
        verifyDirectMergedPrProof(
          {
            repoRoot: "/repo",
            repo: "owner/repo",
            defaultBranch: "trunk",
            changeId: "example",
            changeTipSha: "local-tip",
          },
          {
            runGh: () => ({ status: 0, stdout: "[]", stderr: "" }),
          },
        ),
      ).toEqual({ kind: "none" });
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
        repoRoot: "/repo",
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

  it("distinguishes malformed PR JSON from empty stdout", () => {
    let parserMessage = "";
    try {
      JSON.parse("not-json-at-all");
    } catch (error) {
      parserMessage = error instanceof Error ? error.message : String(error);
    }

    const runRead = (stdout: string) =>
      readPrMergeState("/repo", "Sharper-Flow/Advance", 12, {
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
          return { status: 0, stdout, stderr: "" };
        },
      });

    const malformed = runRead("not-json-at-all");
    const empty = runRead("");

    expect(malformed).toEqual({
      error: "PR_STATE_UNPARSEABLE",
      details: [parserMessage],
    });
    expect(empty).toEqual({
      error: "PR_STATE_UNPARSEABLE",
      details: [],
    });
    expect(malformed).not.toEqual(empty);
  });

  it("preserves NO_MERGED_PR_FOUND while retaining malformed gh diagnostics", () => {
    const discover = (stdout: string) =>
      discoverMergedPr("/repo", "Sharper-Flow/Advance", "example", {
        runGh: () => ({ status: 0, stdout, stderr: "" }),
      });

    const malformed = discover("not-json-at-all");
    const empty = discover("");

    expect(malformed).toMatchObject({ error: "NO_MERGED_PR_FOUND" });
    expect(empty).toEqual({ error: "NO_MERGED_PR_FOUND" });
    expect(malformed).toHaveProperty("details");
  });

  it("direct route + squash-merged PR falls back to pr_merged when ancestry fails", () => {
    const result = resolveReleaseReachability(
      {
        repoRoot: "/repo",
        defaultBranch: "trunk",
        changeId: "fixSquashMergeRelease",
        route: { route: "direct", repo: "Sharper-Flow/Advance" },
        prNumber: 159,
      },
      {
        runGit: (_cwd, args) => {
          if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
          if (
            args[0] === "rev-parse" &&
            args[2]?.includes("refs/remotes/origin/change/")
          )
            return { status: 0, stdout: "change-tip\n", stderr: "" };
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

  it("direct route rescues a non-ancestor squash merge with a tree match", () => {
    const calls: string[][] = [];
    const result = resolveReleaseReachability(
      {
        repoRoot: "/repo",
        defaultBranch: "trunk",
        changeId: "squash-rescue",
        route: { route: "direct", repo: "Sharper-Flow/Advance" },
        prNumber: 160,
      },
      {
        runGit: (_cwd, args) => {
          calls.push(args);
          if (args[0] === "fetch" && args[2] === "trunk") {
            return { status: 0, stdout: "", stderr: "" };
          }
          if (args[0] === "rev-parse" && args[1] === "HEAD") {
            return { status: 0, stdout: "default-head\n", stderr: "" };
          }
          if (args[0] === "ls-remote") {
            return {
              status: 0,
              stdout: "default-head\trefs/heads/trunk\n",
              stderr: "",
            };
          }
          if (
            args[0] === "fetch" &&
            args[2] === "refs/heads/trunk:refs/remotes/origin/trunk"
          ) {
            return { status: 0, stdout: "", stderr: "" };
          }
          if (
            args[0] === "rev-parse" &&
            args[2] === "refs/remotes/origin/change/squash-rescue"
          ) {
            return { status: 0, stdout: "squash-tip\n", stderr: "" };
          }
          if (args[0] === "merge-base") {
            // Squash creates a new commit, so the original tip is not an
            // ancestor even though the resulting tree is present on trunk.
            return { status: 1, stdout: "", stderr: "" };
          }
          if (
            args[0] === "rev-parse" &&
            args[1] === "change/squash-rescue^{tree}"
          ) {
            return { status: 0, stdout: "squash-tree\n", stderr: "" };
          }
          if (args[0] === "log" && args[1] === "--format=%H %T") {
            return {
              status: 0,
              stdout: "squash-merge-commit squash-tree\n",
              stderr: "",
            };
          }
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

    expect(result).toMatchObject({
      reachable: true,
      proof: "pr_merged",
      mergeCommitOid: "squash-merge-commit",
    });
    expect(calls).toContainEqual([
      "merge-base",
      "--is-ancestor",
      "squash-tip",
      "origin/trunk",
    ]);
    expect(calls).toContainEqual(["rev-parse", "change/squash-rescue^{tree}"]);
    expect(calls).toContainEqual([
      "log",
      "--format=%H %T",
      "-50",
      "origin/trunk",
    ]);
  });

  // rq-fixPhase9SquashMergeRedetect AC1: branch-deleted + persisted tip must
  // detect squash-merge via tree-SHA equivalence. RED until
  // detectSquashMergeByTree threads changeTipSha.
  it("direct route + deleted branch + changeTipSha provided detects squash-merge via tree-SHA", () => {
    const result = resolveReleaseReachability(
      {
        repoRoot: "/repo",
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
        repoRoot: "/repo",
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
        repoRoot: "/repo",
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
        repoRoot: "/repo",
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
        repoRoot: "/repo",
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
      releasedCommitSha: "discovered-sha",
      mergeCommitOid: "discovered-sha",
    });
  });

  it("direct route + merged PR without mergeCommitOid fails closed", () => {
    const result = resolveReleaseReachability(
      {
        repoRoot: "/repo",
        defaultBranch: "trunk",
        changeId: "fixSquashMergeRelease",
        route: { route: "direct", repo: "Sharper-Flow/Advance" },
        prNumber: 200,
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
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
        runGh: (_cwd, args) => {
          if (args[0] === "pr" && args[1] === "view") {
            return {
              status: 0,
              stdout: JSON.stringify({
                state: "MERGED",
                mergedAt: "2026-06-09T00:00:00Z",
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
    expect(result.proof).not.toBe("pr_merged");
  });

  it("direct route + tree fallback returns pr_merged when ancestry and PR discovery fail", () => {
    const result = resolveReleaseReachability(
      {
        repoRoot: "/repo",
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

  it("direct route + pre-archive tree fallback preserves its structural proof token", () => {
    const result = resolveReleaseReachability(
      {
        repoRoot: "/repo",
        defaultBranch: "trunk",
        changeId: "preArchiveFallback",
        changeTipSha: "post-tip",
        preArchiveTipSha: "pre-tip",
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
            args[2] === "origin/trunk..change/preArchiveFallback"
          )
            return {
              status: 0,
              stdout: "def456 squash orphan commit\n",
              stderr: "",
            };
          if (args[0] === "rev-parse" && args[1] === "post-tip^{tree}")
            return { status: 0, stdout: "post-tree\n", stderr: "" };
          if (args[0] === "rev-parse" && args[1] === "pre-tip^{tree}")
            return { status: 0, stdout: "pre-tree\n", stderr: "" };
          if (args[0] === "log" && args[1] === "--format=%H %T")
            return {
              status: 0,
              stdout: "mergeCommitOidPre pre-tree\n",
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
      reachable: true,
      proof: "pr_merged_by_tree_pre_archive",
      mergeCommitOid: "mergeCommitOidPre",
    });
  });

  it("direct route + merge-commit ancestry returns origin_default", () => {
    const result = resolveReleaseReachability(
      {
        repoRoot: "/repo",
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
          if (args[0] === "merge-base")
            return {
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

  it("no_remote route blocks with NO_REMOTE_RELEASE_AUTHORITY", () => {
    const result = resolveReleaseReachability(
      {
        repoRoot: "/repo",
        defaultBranch: "trunk",
        changeId: "fixSquashMergeRelease",
        route: { route: "no_remote" },
      },
      {
        runGit: (_cwd, _args) => {
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
      },
    );

    expect(result).toMatchObject({
      reachable: false,
      proof: "blocked",
      details: ["NO_REMOTE_RELEASE_AUTHORITY"],
    });
  });

  it("direct route + all fallbacks fail with unresolved ancestry returns change_ref_unresolved", () => {
    const result = resolveReleaseReachability(
      {
        repoRoot: "/repo",
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
      proof: "change_ref_unresolved",
    });
  });

  it("direct route + unresolved origin ref returns change_ref_unresolved after fallbacks fail", () => {
    let ghCalls = 0;
    const fallbackCalls: string[] = [];
    const result = resolveReleaseReachability(
      {
        repoRoot: "/repo",
        defaultBranch: "trunk",
        changeId: "unresolvedRef",
        route: { route: "direct", repo: "Sharper-Flow/Advance" },
      },
      {
        runGit: (_cwd, args) => {
          if (args[0] === "fetch" && args[2] === "trunk")
            return { status: 0, stdout: "", stderr: "" };
          if (args[0] === "rev-parse" && args[1] === "HEAD")
            return { status: 0, stdout: "abc123\n", stderr: "" };
          if (args[0] === "ls-remote")
            return {
              status: 0,
              stdout: "abc123\trefs/heads/trunk\n",
              stderr: "",
            };
          if (args[0] === "fetch")
            return { status: 1, stdout: "", stderr: "change ref unavailable" };
          if (
            args[0] === "rev-parse" &&
            args[1] === "change/unresolvedRef^{tree}"
          ) {
            fallbackCalls.push("detectSquashMergeByTree");
            return { status: 1, stdout: "", stderr: "unknown revision" };
          }
          if (args[0] === "log" && args[1] === "--format=%H %T") {
            return {
              status: 0,
              stdout: "trunk-sha different-tree\n",
              stderr: "",
            };
          }
          return { status: 1, stdout: "", stderr: "unexpected" };
        },
        runGh: (_cwd, args) => {
          ghCalls += 1;
          if (args[0] === "pr" && args[1] === "list") {
            fallbackCalls.push("discoverMergedPr");
            return {
              status: 0,
              stdout: JSON.stringify([{ number: 161, mergeCommit: null }]),
              stderr: "",
            };
          }
          if (args[0] === "pr" && args[1] === "view") {
            fallbackCalls.push("readPrMergeState");
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

    expect(result).toMatchObject({
      reachable: false,
      proof: "change_ref_unresolved",
    });
    expect(ghCalls).toBeGreaterThan(0);
    expect(fallbackCalls).toEqual([
      "discoverMergedPr",
      "readPrMergeState",
      "detectSquashMergeByTree",
    ]);
  });

  // rq-fixPhase9PrDetection AC1: PR workflow route (pr_auto_merge) with no
  // prNumber must discover the merged PR instead of failing with
  // PR_NOT_MERGED.
  it("pr_auto_merge route + no prNumber discovers merged PR and returns pr_merged", () => {
    const result = resolveReleaseReachability(
      {
        repoRoot: "/repo",
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
        repoRoot: "/repo",
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
          repoRoot: "/repo",
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

    it("no_remote route returns blocked with NO_REMOTE_RELEASE_AUTHORITY", () => {
      const result = resolveReleaseReachability(
        {
          repoRoot: "/repo",
          defaultBranch: "trunk",
          changeId: "noRemoteUnmerged",
          route: { route: "no_remote" },
        },
        {
          runGit: (_cwd, _args) => {
            return { status: 1, stdout: "", stderr: "unexpected" };
          },
        },
      );

      expect(result.reachable).toBe(false);
      expect(result.proof).toBe("blocked");
      expect(result.details).toEqual(["NO_REMOTE_RELEASE_AUTHORITY"]);
    });

    // rq-releaseFinalization01 / rq-releaseFinalization03: no_remote route is
    // blocked without a canonical remote; remote-first archive isolation forbids
    // local-only release authority and shared-ref mutation.
    it("no_remote route + deleted branch + changeTipSha is blocked without canonical remote", () => {
      const result = resolveReleaseReachability(
        {
          repoRoot: "/repo",
          defaultBranch: "trunk",
          changeId: "noRemoteDeletedTip",
          route: { route: "no_remote" },
          changeTipSha: "tip-local-abc",
        },
        {
          runGit: (_cwd, args) => {
            const argStr = args.join(" ");
            if (argStr === "log trunk..change/noRemoteDeletedTip") {
              // Branch ref is gone; range log fails
              return { status: 128, stdout: "", stderr: "unknown revision" };
            }
            return { status: 1, stdout: "", stderr: "unexpected" };
          },
        },
      );

      expect(result.reachable).toBe(false);
      expect(result.proof).toBe("blocked");
      expect(result.details).toEqual(["NO_REMOTE_RELEASE_AUTHORITY"]);
    });

    // Missing or mismatched changeTipSha on no_remote route remains blocked
    // because the route itself has no canonical remote authority.
    it("no_remote route + deleted branch + mismatched changeTipSha stays blocked", () => {
      const result = resolveReleaseReachability(
        {
          repoRoot: "/repo",
          defaultBranch: "trunk",
          changeId: "noRemoteMismatch",
          route: { route: "no_remote" },
          changeTipSha: "tip-local-abc",
        },
        {
          runGit: (_cwd, args) => {
            const argStr = args.join(" ");
            if (argStr === "log trunk..change/noRemoteMismatch") {
              return { status: 128, stdout: "", stderr: "unknown revision" };
            }
            return { status: 1, stdout: "", stderr: "unexpected" };
          },
        },
      );

      expect(result.reachable).toBe(false);
      expect(result.proof).toBe("blocked");
      expect(result.details).toEqual(["NO_REMOTE_RELEASE_AUTHORITY"]);
    });

    it("pr_manual route + merged PR returns pr_merged typed proof", () => {
      const result = resolveReleaseReachability(
        {
          repoRoot: "/repo",
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
          repoRoot: "/repo",
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
          repoRoot: "/repo",
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
          repoRoot: "/repo",
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
        repoRoot: "/repo",
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
        repoRoot: "/repo",
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
        repoRoot: "/repo",
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
        repoRoot: "/repo",
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
        repoRoot: "/repo",
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
        repoRoot: "/repo",
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
        repoRoot: "/repo",
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
        repoRoot: "/repo",
        defaultBranch: "trunk",
        changeId: "archived-one",
        changeTitle: "Archived work",
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

  it("mergeChangeBranch fast-forwards a clean change branch", async () => {
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

    // No remote → no-remote archive is blocked with NO_REMOTE_RELEASE_AUTHORITY
    // and the shared default branch ref is never mutated.
    expect(result).toMatchObject({
      status: "blocked",
      defaultBranch: "trunk",
      route: "no_remote",
      pushStatus: "not_attempted",
      blocked: {
        reason: "NO_REMOTE_RELEASE_AUTHORITY",
      },
    });
    const trunkHeadAfter = git(main, ["rev-parse", "refs/heads/trunk"]);
    const trunkHeadBefore = git(main, ["rev-parse", "trunk"]);
    expect(trunkHeadAfter).toBe(trunkHeadBefore);
    // The shared main checkout is no longer inspected or checkpointed; dirty
    // files in the main checkout remain untouched (remote-first isolation).
    expect(git(main, ["status", "--porcelain"])).toContain("?? dirty.txt");
  });

  it("finalizeRelease commits archive artifacts before merge", async () => {
    const main = join(tempRoot, "main");
    const worktree = join(tempRoot, "wt");
    const remote = join(tempRoot, "remote.git");
    await mkdir(main);
    await initRepo(main);
    git(tempRoot, ["init", "--bare", remote]);
    git(main, ["remote", "add", "origin", remote]);
    git(main, ["push", "-u", "origin", "trunk"]);
    git(main, ["worktree", "add", "-b", "change/example", worktree]);
    await mkdir(join(worktree, ".adv", "archive"), { recursive: true });
    await writeFile(
      join(worktree, ".adv", "archive", "bundle.txt"),
      "bundle\n",
    );

    const result = await finalizeRelease({
      changeId: "example",
      workdir: worktree,
      archiveMode: "direct",
      autoPush: true,
    });

    expect(result.status).toBe("shipped");
    expect(result.mergeCommitSha).toBeDefined();
    // The captured tip must include the archive-artifact commit that Phase 9
    // actually merged, rather than the pre-artifact branch tip.
    expect(result.changeTipSha).toBe(
      git(worktree, ["rev-parse", "change/example"]),
    );
    expect(result.releasedCommitSha).toBe(
      git(main, ["rev-parse", "origin/trunk"]),
    );
    // The shared main checkout is no longer updated; fetch the remote default
    // branch to verify the archive bundle landed on origin.
    git(main, ["fetch", "origin", "trunk"]);
    expect(git(main, ["show", "origin/trunk:.adv/archive/bundle.txt"])).toBe(
      "bundle",
    );
  });

  it("finalizeRelease blocks no-remote archive with NO_REMOTE_RELEASE_AUTHORITY", async () => {
    const main = join(tempRoot, "main");
    const worktree = join(tempRoot, "wt");
    await mkdir(main);
    await initRepo(main);
    git(main, ["worktree", "add", "-b", "change/example", worktree]);
    await writeFile(join(worktree, "feature.txt"), "feature\n");
    git(worktree, ["add", "feature.txt"]);
    git(worktree, ["commit", "-m", "feature"]);
    const trunkBefore = git(main, ["rev-parse", "trunk"]);

    const skipped = await finalizeRelease({
      changeId: "example",
      workdir: worktree,
      archiveMode: "direct",
      autoPush: false,
    });

    expect(skipped.status).toBe("blocked");
    expect(skipped.route).toBe("no_remote");
    expect(skipped.pushStatus).toBe("not_attempted");
    expect(skipped.blocked?.reason).toBe("NO_REMOTE_RELEASE_AUTHORITY");
    expect(git(main, ["rev-parse", "trunk"])).toBe(trunkBefore);
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
    expect(result.changeTipSha).toBe(
      git(main, ["rev-parse", "change/example"]),
    );
  });

  // rq-fixPhase9PostMergeFinalization (Defect B): when the change's PR is
  // already merged, reconciling the stale change branch against the default
  // branch is pointless and blocks phase9 finalization forever. Detect the
  // already-merged state BEFORE reconcile and skip reconcile in that case.
  describe("finalizeRelease PR-mode merged-PR short-circuit", () => {
    const MERGED_PR_HEAD_SHA = "merged-pr-head-sha";

    function makeMergedPrSetup(opts: {
      conflictsOnMerge: boolean;
      actualPrHeadSha?: string;
    }) {
      const main = join(
        tempRoot,
        `merged-pr-${Math.random().toString(36).slice(2)}`,
      );
      const worktree = join(
        tempRoot,
        `merged-pr-wt-${Math.random().toString(36).slice(2)}`,
      );
      const gitCalls: { cwd: string; args: string[] }[] = [];
      const ghCalls: { cwd: string; args: string[] }[] = [];

      return {
        main,
        worktree,
        gitCalls,
        ghCalls,
        runGit: (cwd: string, args: string[]) => {
          gitCalls.push({ cwd, args });
          if (args[0] === "fetch" && args[1] === "origin") {
            return { status: 0, stdout: "", stderr: "" };
          }
          if (args[0] === "reset" && args[1] === "--hard") {
            return { status: 0, stdout: "reset", stderr: "" };
          }
          if (args[0] === "merge") {
            // If short-circuit works, this should never be called for the
            // merged-PR case. The unmerged-conflict case still calls it.
            if (opts.conflictsOnMerge) {
              return {
                status: 1,
                stdout: "",
                stderr: "CONFLICT (.adv/archive/file): conflict marker",
              };
            }
            return { status: 0, stdout: "merge", stderr: "" };
          }
          if (args[0] === "merge-base") {
            return { status: 0, stdout: "", stderr: "" };
          }
          // verifyDirectMergedPrProof's default-branch reachability probe.
          // The base is whatever detectDefaultBranch resolved to (trunk for
          // a fresh test repo). Match by prefix so the mock survives both
          // trunk and main detection paths.
          if (
            args[0] === "rev-parse" &&
            args[1] === "--verify" &&
            args.length >= 3 &&
            args[2]!.startsWith("origin/")
          ) {
            return { status: 0, stdout: "current-default-sha\n", stderr: "" };
          }
          // Other rev-parse calls (--show-toplevel, --path-format=absolute
          // --git-common-dir, branch refs) must fall through to real git so
          // validateChangeWorktree and changeTipSha capture work.
          if (
            args[0] === "rev-parse" &&
            (args[1] === "--path-format=absolute" ||
              args[1] === "--show-toplevel" ||
              args[1] === "--git-common-dir")
          ) {
            return defaultRunGit(cwd, args);
          }
          if (args[0] === "diff" && args.includes("--diff-filter=U")) {
            return {
              status: 0,
              stdout: ".adv/archive/file\n",
              stderr: "",
            };
          }
          // Fall through to real git so validateChangeWorktree and other
          // checks (branch --show-current, rev-parse --show-toplevel) work
          // against the actual worktree.
          return defaultRunGit(cwd, args);
        },
        runGh: (_cwd: string, args: string[]) => {
          ghCalls.push({ cwd: _cwd, args });
          // Branch protection rules query (route classification)
          if (args[0] === "api" && args[1].includes("/rules/branches/")) {
            return {
              status: 0,
              stdout: JSON.stringify([{ type: "required_status_checks" }]),
              stderr: "",
            };
          }
          // Repo allow_auto_merge query (route classification)
          if (args[0] === "api" && args[1] === "repos/Sharper-Flow/Advance") {
            return { status: 0, stdout: "true\n", stderr: "" };
          }
          // verifyDirectMergedPrProof: gh pr list --state merged --head ...
          if (
            args[0] === "pr" &&
            args[1] === "list" &&
            args.includes("--state") &&
            args.includes("merged")
          ) {
            return {
              status: 0,
              stdout: JSON.stringify([
                {
                  number: 1347,
                  url: "https://github.com/Sharper-Flow/Advance/pull/1347",
                  state: "MERGED",
                  mergedAt: "2026-08-17T12:00:00Z",
                  mergeCommit: { oid: "merge-commit-sha" },
                  headRefName: "change/example",
                  headRefOid: opts.actualPrHeadSha ?? MERGED_PR_HEAD_SHA,
                  baseRefName: "trunk",
                  headRepositoryOwner: { login: "Sharper-Flow" },
                  headRepository: {
                    name: "Advance",
                    nameWithOwner: "Sharper-Flow/Advance",
                  },
                  isCrossRepository: false,
                },
              ]),
              stderr: "",
            };
          }
          return { status: 1, stdout: "", stderr: "unexpected gh" };
        },
      };
    }

    it("skips reconcile and finalizes when the change's PR is already merged", async () => {
      const main = join(tempRoot, "merged-skip-main");
      const worktree = join(tempRoot, "merged-skip-wt");
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
      // The exact SHA the change branch currently points at — used by
      // verifyDirectMergedPrProof to match the PR headRefOid (the merged PR
      // must be provably THE PR for this branch, not an unrelated history).
      const actualPrHeadSha = git(worktree, ["rev-parse", "HEAD"]);

      const setup = makeMergedPrSetup({
        conflictsOnMerge: true,
        actualPrHeadSha,
      });
      const result = await finalizeRelease(
        {
          changeId: "example",
          workdir: worktree,
          archiveMode: "pr",
          autoPush: true,
        },
        setup,
      );

      expect(result).toMatchObject({
        status: "shipped",
        route: "pr_auto_merge",
        prNumber: 1347,
        prUrl: "https://github.com/Sharper-Flow/Advance/pull/1347",
        mergeCommitSha: "merge-commit-sha",
        prHeadSha: actualPrHeadSha,
        defaultBranchSha: "current-default-sha",
      });

      // Reconcile must NOT have been called: no `git merge --no-edit origin/...`.
      const reconcileCalls = setup.gitCalls.filter(
        (c) =>
          c.args[0] === "merge" &&
          c.args.includes("--no-edit") &&
          c.args.some((a) => a.startsWith("origin/")),
      );
      expect(reconcileCalls).toHaveLength(0);
    });

    it("still blocks with RECONCILE_CONFLICT when PR is unmerged and reconcile conflicts", async () => {
      const main = join(tempRoot, "conflict-still-blocks-main");
      const worktree = join(tempRoot, "conflict-still-blocks-wt");
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

      const setup = makeMergedPrSetup({ conflictsOnMerge: true });
      // Override: gh pr list --state merged returns empty (no merged PR).
      setup.runGh = (_cwd, args) => {
        const ghCalls = (
          setup as { ghCalls: { cwd: string; args: string[] }[] }
        ).ghCalls;
        ghCalls.push({ cwd: _cwd, args });
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
        if (args[0] === "pr" && args[1] === "list" && args.includes("merged")) {
          return { status: 0, stdout: "[]", stderr: "" };
        }
        return { status: 1, stdout: "", stderr: "unexpected gh" };
      };

      const result = await finalizeRelease(
        {
          changeId: "example",
          workdir: worktree,
          archiveMode: "pr",
          autoPush: true,
        },
        setup,
      );

      expect(result).toMatchObject({
        status: "blocked",
        route: "pr_auto_merge",
        blocked: { reason: "RECONCILE_CONFLICT" },
      });
    });

    it("proceeds to PR handoff when PR is unmerged and reconcile succeeds (existing behavior)", async () => {
      const main = join(tempRoot, "unmerged-clean-main");
      const worktree = join(tempRoot, "unmerged-clean-wt");
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

      const setup = makeMergedPrSetup({ conflictsOnMerge: false });
      // Override: gh pr list --state merged returns empty (no merged PR),
      // and add the regular PR-creation / arm-auto-merge mocks.
      let branchViewCount = 0;
      setup.runGh = (_cwd, args) => {
        const ghCalls = (
          setup as { ghCalls: { cwd: string; args: string[] }[] }
        ).ghCalls;
        ghCalls.push({ cwd: _cwd, args });
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
        if (args[0] === "pr" && args[1] === "list" && args.includes("merged")) {
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
        return { status: 1, stdout: "", stderr: "unexpected gh" };
      };
      setup.runGit = (cwd, args) => {
        const gitCalls = (
          setup as { gitCalls: { cwd: string; args: string[] }[] }
        ).gitCalls;
        gitCalls.push({ cwd, args });
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
          return { status: 0, stdout: "pushed branch", stderr: "" };
        }
        // Other rev-parse calls (--path-format=absolute, --show-toplevel,
        // --git-common-dir, branch refs) must fall through to real git so
        // validateChangeWorktree and resolveRepoRoot work.
        return defaultRunGit(cwd, args);
      };

      const result = await finalizeRelease(
        {
          changeId: "example",
          workdir: worktree,
          archiveMode: "pr",
          autoPush: true,
        },
        setup,
      );

      expect(result).toMatchObject({
        status: "pending_merge",
        route: "pr_auto_merge",
        prNumber: 42,
        autoMergeArmed: true,
        pushStatus: "pushed",
      });
    });
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
    expect(ghCalls).toContainEqual([
      "pr",
      "merge",
      "42",
      "--repo",
      "Sharper-Flow/Advance",
      "--squash",
      "--auto",
    ]);
    expect(result.changeTipSha).toBe(
      git(worktree, ["rev-parse", "change/example"]),
    );
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

  it("finalizeRelease direct path fetches origin before selecting base and ignores stale local origin/trunk", async () => {
    const seed = join(tempRoot, "seed");
    const remote = join(tempRoot, "remote.git");
    const main = join(tempRoot, "main");
    const advancer = join(tempRoot, "advancer");
    const worktree = join(tempRoot, "wt");
    await mkdir(seed);
    await mkdir(remote);
    await mkdir(main);
    await mkdir(advancer);

    await initRepo(seed, "trunk");
    git(tempRoot, ["init", "--bare", "-q", "-b", "trunk", remote]);
    git(seed, ["remote", "add", "origin", remote]);
    git(seed, ["push", "origin", "trunk"]);

    git(tempRoot, ["clone", "-q", remote, main]);
    git(main, ["config", "user.email", "adv-test@example.invalid"]);
    git(main, ["config", "user.name", "ADV Test"]);
    git(tempRoot, ["clone", "-q", remote, advancer]);
    git(advancer, ["config", "user.email", "adv-test@example.invalid"]);
    git(advancer, ["config", "user.name", "ADV Test"]);

    // Advance the remote default branch from a separate clone so main's
    // local origin/trunk ref is stale.
    await writeFile(join(advancer, "remote-advance.txt"), "advanced\n");
    git(advancer, ["add", "remote-advance.txt"]);
    git(advancer, ["commit", "-m", "remote advance"]);
    git(advancer, ["push", "origin", "trunk"]);

    const staleOriginTrunk = git(main, ["rev-parse", "origin/trunk"]);

    git(main, ["worktree", "add", "-b", "change/example", worktree]);
    await writeFile(join(worktree, "feature.txt"), "feature\n");
    git(worktree, ["add", "feature.txt"]);
    git(worktree, ["commit", "-m", "feature"]);

    const result = await finalizeRelease({
      changeId: "example",
      workdir: worktree,
      archiveMode: "direct",
      autoPush: true,
    });

    expect(result.status).toBe("shipped");
    expect(result.route).toBe("direct");
    expect(result.releasedCommitSha).toBeTruthy();
    expect(result.releasedCommitSha).not.toBe(staleOriginTrunk);

    const remoteHead = git(remote, ["rev-parse", "refs/heads/trunk"]);
    expect(result.releasedCommitSha).toBe(remoteHead);
    expect(git(remote, ["show", `${remoteHead}:remote-advance.txt`])).toBe(
      "advanced",
    );
    expect(git(remote, ["show", `${remoteHead}:feature.txt`])).toBe("feature");
  });

  it("finalizeRelease accepts an exact squash-merged PR on a direct route without invoking merge", async () => {
    const seed = join(tempRoot, "seed-pr-proof");
    const remote = join(tempRoot, "remote-pr-proof.git");
    const main = join(tempRoot, "main-pr-proof");
    const mergeClone = join(tempRoot, "merge-pr-proof");
    const worktree = join(tempRoot, "wt-pr-proof");
    await mkdir(seed);
    await mkdir(remote);
    await mkdir(main);
    await mkdir(mergeClone);

    await initRepo(seed, "trunk");
    git(tempRoot, ["init", "--bare", "-q", "-b", "trunk", remote]);
    git(seed, ["remote", "add", "origin", remote]);
    git(seed, ["push", "origin", "trunk"]);
    git(tempRoot, ["clone", "-q", remote, main]);
    git(main, ["config", "user.email", "adv-test@example.invalid"]);
    git(main, ["config", "user.name", "ADV Test"]);
    git(tempRoot, ["clone", "-q", remote, mergeClone]);
    git(mergeClone, ["config", "user.email", "adv-test@example.invalid"]);
    git(mergeClone, ["config", "user.name", "ADV Test"]);
    git(main, ["worktree", "add", "-b", "change/example", worktree]);
    await writeFile(join(worktree, "feature.txt"), "feature\n");
    git(worktree, ["add", "feature.txt"]);
    git(worktree, ["commit", "-m", "feature"]);
    const prHeadSha = git(worktree, ["rev-parse", "HEAD"]);
    git(worktree, ["push", "-u", "origin", "change/example"]);

    // Simulate a squash merge through GitHub, followed by unrelated trunk
    // commits that make a second direct merge attempt conflict-prone.
    git(mergeClone, ["fetch", "origin", "change/example"]);
    git(mergeClone, ["merge", "--squash", "origin/change/example"]);
    git(mergeClone, ["commit", "-m", "squash merge"]);
    const mergeCommitOid = git(mergeClone, ["rev-parse", "HEAD"]);
    await writeFile(join(mergeClone, "later.txt"), "later\n");
    git(mergeClone, ["add", "later.txt"]);
    git(mergeClone, ["commit", "-m", "later trunk change"]);
    git(mergeClone, ["push", "origin", "trunk"]);
    const defaultBranchSha = git(mergeClone, ["rev-parse", "HEAD"]);

    const gitCalls: string[][] = [];
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
          if (args[0] === "remote" && args[1] === "get-url") {
            return {
              status: 0,
              stdout: "https://github.com/owner/repo.git\n",
              stderr: "",
            };
          }
          return defaultRunGit(cwd, args);
        },
        runGh: (_cwd, args) => {
          if (args[0] === "api" && args[1].includes("/rules/branches/")) {
            return { status: 0, stdout: "[]", stderr: "" };
          }
          if (args[0] === "pr" && args[1] === "list") {
            return {
              status: 0,
              stdout: JSON.stringify([
                {
                  number: 405,
                  url: "https://github.com/owner/repo/pull/405",
                  state: "MERGED",
                  mergedAt: "2026-08-08T00:00:00Z",
                  mergeCommit: { oid: mergeCommitOid },
                  headRefName: "change/example",
                  headRefOid: prHeadSha,
                  baseRefName: "trunk",
                  headRepositoryOwner: { login: "owner" },
                  headRepository: {
                    name: "repo",
                    nameWithOwner: "owner/repo",
                  },
                  isCrossRepository: false,
                },
              ]),
              stderr: "",
            };
          }
          return { status: 1, stdout: "", stderr: "unexpected gh" };
        },
      },
    );

    expect(result).toMatchObject({
      status: "shipped",
      route: "direct",
      prNumber: 405,
      prHeadSha,
      mergeCommitSha: mergeCommitOid,
      releasedCommitSha: defaultBranchSha,
      defaultBranchSha,
    });
    expect(gitCalls.filter((args) => args[0] === "merge")).toEqual([]);
    expect(git(worktree, ["rev-parse", "change/example"])).toBe(prHeadSha);
  });

  it("finalizeRelease resumes a squash-merged PR after the archive bundle commit", async () => {
    const seed = join(tempRoot, "seed-resume-squash");
    const remote = join(tempRoot, "remote-resume-squash.git");
    const main = join(tempRoot, "main-resume-squash");
    const mergeClone = join(tempRoot, "merge-resume-squash");
    const worktree = join(tempRoot, "wt-resume-squash");
    await mkdir(seed);
    await mkdir(remote);
    await mkdir(main);
    await mkdir(mergeClone);

    await initRepo(seed, "trunk");
    git(tempRoot, ["init", "--bare", "-q", "-b", "trunk", remote]);
    git(seed, ["remote", "add", "origin", remote]);
    git(seed, ["push", "origin", "trunk"]);
    git(tempRoot, ["clone", "-q", remote, main]);
    git(main, ["config", "user.email", "adv-test@example.invalid"]);
    git(main, ["config", "user.name", "ADV Test"]);
    git(tempRoot, ["clone", "-q", remote, mergeClone]);
    git(mergeClone, ["config", "user.email", "adv-test@example.invalid"]);
    git(mergeClone, ["config", "user.name", "ADV Test"]);
    git(main, ["worktree", "add", "-b", "change/example", worktree]);
    await writeFile(join(worktree, "feature.txt"), "feature\n");
    git(worktree, ["add", "feature.txt"]);
    git(worktree, ["commit", "-m", "feature"]);
    const preArchiveTipSha = git(worktree, ["rev-parse", "HEAD"]);
    git(worktree, ["push", "-u", "origin", "change/example"]);

    git(mergeClone, ["fetch", "origin", "change/example"]);
    git(mergeClone, ["merge", "--squash", "origin/change/example"]);
    git(mergeClone, ["commit", "-m", "squash merge"]);
    const mergeCommitOid = git(mergeClone, ["rev-parse", "HEAD"]);
    await writeFile(join(mergeClone, "later.txt"), "later\n");
    git(mergeClone, ["add", "later.txt"]);
    git(mergeClone, ["commit", "-m", "later trunk change"]);
    git(mergeClone, ["push", "origin", "trunk"]);
    const defaultBranchSha = git(mergeClone, ["rev-parse", "HEAD"]);

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
          if (args[0] === "remote" && args[1] === "get-url") {
            return {
              status: 0,
              stdout: "https://github.com/owner/repo.git\n",
              stderr: "",
            };
          }
          return defaultRunGit(cwd, args);
        },
        runGh: (_cwd, args) => {
          if (args[0] === "api" && args[1].includes("/rules/branches/")) {
            return { status: 0, stdout: "[]", stderr: "" };
          }
          if (args[0] === "pr" && args[1] === "list") {
            return {
              status: 0,
              stdout: JSON.stringify([
                {
                  number: 405,
                  url: "https://github.com/owner/repo/pull/405",
                  state: "MERGED",
                  mergedAt: "2026-08-08T00:00:00Z",
                  mergeCommit: { oid: mergeCommitOid },
                  headRefName: "change/example",
                  headRefOid: preArchiveTipSha,
                  baseRefName: "trunk",
                  headRepositoryOwner: { login: "owner" },
                  headRepository: {
                    name: "repo",
                    nameWithOwner: "owner/repo",
                  },
                  isCrossRepository: false,
                },
              ]),
              stderr: "",
            };
          }
          return { status: 1, stdout: "", stderr: "unexpected gh" };
        },
      },
    );

    expect(result).toMatchObject({
      status: "shipped",
      route: "direct",
      prNumber: 405,
      prHeadSha: preArchiveTipSha,
      mergeCommitSha: mergeCommitOid,
      releasedCommitSha: defaultBranchSha,
      defaultBranchSha,
    });
    expect(result.changeTipSha).not.toBe(preArchiveTipSha);
  });

  it("finalizeRelease resumes a merge-commit PR after the archive bundle commit", async () => {
    const seed = join(tempRoot, "seed-resume-merge");
    const remote = join(tempRoot, "remote-resume-merge.git");
    const main = join(tempRoot, "main-resume-merge");
    const mergeClone = join(tempRoot, "merge-resume-merge");
    const worktree = join(tempRoot, "wt-resume-merge");
    await mkdir(seed);
    await mkdir(remote);
    await mkdir(main);
    await mkdir(mergeClone);

    await initRepo(seed, "trunk");
    git(tempRoot, ["init", "--bare", "-q", "-b", "trunk", remote]);
    git(seed, ["remote", "add", "origin", remote]);
    git(seed, ["push", "origin", "trunk"]);
    git(tempRoot, ["clone", "-q", remote, main]);
    git(main, ["config", "user.email", "adv-test@example.invalid"]);
    git(main, ["config", "user.name", "ADV Test"]);
    git(tempRoot, ["clone", "-q", remote, mergeClone]);
    git(mergeClone, ["config", "user.email", "adv-test@example.invalid"]);
    git(mergeClone, ["config", "user.name", "ADV Test"]);
    git(main, ["worktree", "add", "-b", "change/example", worktree]);
    await writeFile(join(worktree, "feature.txt"), "feature\n");
    git(worktree, ["add", "feature.txt"]);
    git(worktree, ["commit", "-m", "feature"]);
    const preArchiveTipSha = git(worktree, ["rev-parse", "HEAD"]);
    git(worktree, ["push", "-u", "origin", "change/example"]);

    git(mergeClone, ["fetch", "origin", "change/example"]);
    git(mergeClone, [
      "merge",
      "--no-ff",
      "origin/change/example",
      "-m",
      "merge commit",
    ]);
    const mergeCommitOid = git(mergeClone, ["rev-parse", "HEAD"]);
    git(mergeClone, ["push", "origin", "trunk"]);
    const defaultBranchSha = git(mergeClone, ["rev-parse", "HEAD"]);

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
          if (args[0] === "remote" && args[1] === "get-url") {
            return {
              status: 0,
              stdout: "https://github.com/owner/repo.git\n",
              stderr: "",
            };
          }
          return defaultRunGit(cwd, args);
        },
        runGh: (_cwd, args) => {
          if (args[0] === "api" && args[1].includes("/rules/branches/")) {
            return { status: 0, stdout: "[]", stderr: "" };
          }
          if (args[0] === "pr" && args[1] === "list") {
            return {
              status: 0,
              stdout: JSON.stringify([
                {
                  number: 406,
                  url: "https://github.com/owner/repo/pull/406",
                  state: "MERGED",
                  mergedAt: "2026-08-08T00:00:00Z",
                  mergeCommit: { oid: mergeCommitOid },
                  headRefName: "change/example",
                  headRefOid: preArchiveTipSha,
                  baseRefName: "trunk",
                  headRepositoryOwner: { login: "owner" },
                  headRepository: {
                    name: "repo",
                    nameWithOwner: "owner/repo",
                  },
                  isCrossRepository: false,
                },
              ]),
              stderr: "",
            };
          }
          return { status: 1, stdout: "", stderr: "unexpected gh" };
        },
      },
    );

    expect(result).toMatchObject({
      status: "shipped",
      route: "direct",
      prNumber: 406,
      prHeadSha: preArchiveTipSha,
      mergeCommitSha: mergeCommitOid,
      releasedCommitSha: defaultBranchSha,
      defaultBranchSha,
    });
    expect(result.changeTipSha).not.toBe(preArchiveTipSha);
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
    ).toEqual({ pushed: true, sha: "abc" });
  });

  it("verifyDefaultBranchPushed fails closed when origin/default cannot be refreshed", () => {
    expect(
      verifyDefaultBranchPushed("/repo", "trunk", {
        runGit: (_cwd, args) => {
          if (args[0] === "fetch")
            return { status: 1, stdout: "", stderr: "network unavailable" };
          return { status: 1, stdout: "", stderr: "must not use stale ref" };
        },
      }),
    ).toEqual({ pushed: false, reason: "network unavailable" });
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

  it("validateArchiveDeltaRepairWorktree requires a clean exact current-trunk repair basis", async () => {
    const repo = join(tempRoot, "repair-repo");
    const origin = join(tempRoot, "repair-origin.git");
    const repair = join(tempRoot, "repair-wt");
    const wrong = join(tempRoot, "wrong-wt");
    await mkdir(repo);
    await initRepo(repo);
    git(repo, ["init", "--bare", origin]);
    git(repo, ["remote", "add", "origin", origin]);
    git(repo, ["push", "-u", "origin", "trunk"]);
    git(origin, ["symbolic-ref", "HEAD", "refs/heads/trunk"]);
    git(repo, ["fetch", "origin", "trunk"]);
    git(repo, [
      "worktree",
      "add",
      "-b",
      "repair/archive-example",
      repair,
      "trunk",
    ]);
    git(repo, ["worktree", "add", "-b", "change/example", wrong, "trunk"]);

    const valid = validateArchiveDeltaRepairWorktree(repair, "example", repo);
    expect(valid.valid).toBe(true);
    expect(valid.repairBranch).toBe("repair/archive-example");
    expect(valid.repairHeadSha).toBe(valid.defaultBranchSha);

    await writeFile(join(repair, "dirty.txt"), "must refuse\n");
    const dirty = validateArchiveDeltaRepairWorktree(repair, "example", repo);
    expect(dirty.valid).toBe(false);
    expect(dirty.error).toContain("uncommitted");

    const wrongBranch = validateArchiveDeltaRepairWorktree(
      wrong,
      "example",
      repo,
    );
    expect(wrongBranch.valid).toBe(false);
    expect(wrongBranch.error).toContain("repair/archive-example");

    const behind = join(tempRoot, "behind-wt");
    git(repo, [
      "worktree",
      "add",
      "-b",
      "repair/archive-behind",
      behind,
      "trunk",
    ]);
    await writeFile(join(repo, "advance.txt"), "trunk advanced\n");
    git(repo, ["add", "advance.txt"]);
    git(repo, ["commit", "-m", "advance trunk"]);
    git(repo, ["push", "origin", "trunk"]);
    const behindResult = validateArchiveDeltaRepairWorktree(
      behind,
      "behind",
      repo,
    );
    expect(behindResult.valid).toBe(false);
    expect(behindResult.error).toContain("start exactly");
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

  it("finalizeRelease blocks no-remote archive even when main checkout is on a different branch", async () => {
    const main = join(tempRoot, "wrong-branch");
    const worktree = join(tempRoot, "wrong-branch-wt");
    await mkdir(main);
    await initRepo(main);
    // Switch main checkout to a non-default branch; the shared checkout should
    // not be inspected or mutated.
    git(main, ["checkout", "-b", "feature/other"]);
    git(main, ["worktree", "add", "-b", "change/example", worktree]);
    const trunkBefore = git(main, ["rev-parse", "trunk"]);

    const result = await finalizeRelease({
      changeId: "example",
      workdir: worktree,
      archiveMode: "direct",
      autoPush: false,
    });

    expect(result).toMatchObject({
      status: "blocked",
      route: "no_remote",
      pushStatus: "not_attempted",
      blocked: {
        reason: "NO_REMOTE_RELEASE_AUTHORITY",
      },
    });
    expect(git(main, ["rev-parse", "trunk"])).toBe(trunkBefore);
  });

  it("finalizeRelease blocks no-remote archive without mutating dirty main checkout", async () => {
    const main = join(tempRoot, "checkpoint-shipped");
    const worktree = join(tempRoot, "checkpoint-shipped-wt");
    await mkdir(main);
    await initRepo(main);
    // Make main dirty; the shared checkout must not be checkpointed or merged.
    await writeFile(join(main, "dirty.txt"), "dirty content\n");
    git(main, ["worktree", "add", "-b", "change/example", worktree]);
    const trunkBefore = git(main, ["rev-parse", "trunk"]);

    const result = await finalizeRelease({
      changeId: "example",
      workdir: worktree,
      archiveMode: "direct",
      autoPush: false,
    });

    expect(result).toMatchObject({
      status: "blocked",
      route: "no_remote",
      pushStatus: "not_attempted",
      blocked: {
        reason: "NO_REMOTE_RELEASE_AUTHORITY",
      },
    });
    expect(git(main, ["rev-parse", "trunk"])).toBe(trunkBefore);
    // Dirty file in shared main checkout remains untouched.
    expect(git(main, ["status", "--porcelain"])).toContain("?? dirty.txt");
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
    it("tries the pre-archive tree after the post-archive tree with a distinct proof", () => {
      const calls: string[][] = [];
      const result = detectSquashMergeByTree(
        "/repo",
        "origin/trunk",
        "preArchiveTree",
        {
          changeTipSha: "post-tip",
          preArchiveTipSha: "pre-tip",
          runGit: (_cwd, args) => {
            calls.push(args);
            if (args[0] === "rev-parse" && args[1] === "post-tip^{tree}") {
              return { status: 0, stdout: "post-tree\n", stderr: "" };
            }
            if (args[0] === "rev-parse" && args[1] === "pre-tip^{tree}") {
              return { status: 0, stdout: "pre-tree\n", stderr: "" };
            }
            if (args[0] === "log" && args[1] === "--format=%H %T") {
              return {
                status: 0,
                stdout: "squash-pre pre-tree\n",
                stderr: "",
              };
            }
            return { status: 1, stdout: "", stderr: "unexpected" };
          },
        },
      );

      expect(result).toMatchObject({
        reachable: true,
        mergeCommitOid: "squash-pre",
        proof: "pr_merged_by_tree_pre_archive",
      });
      expect(
        calls.filter(
          (args) => args[0] === "log" && args[1] === "--format=%H %T",
        ),
      ).toHaveLength(2);
      expect(result).not.toMatchObject({ proof: "pr_merged" });
    });

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
          repoRoot: "/main",
          workdir: "/workdir",
          defaultBranch: "trunk",
          changeId: "example",
          route: {
            route: "merge_queue",
            repo: "Sharper-Flow/Advance",
            mergeQueueRequired: true,
          },
          changeTipSha: "a".repeat(40),
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
        changeTipSha: "a".repeat(40),
      });
    });

    it("completeMergeQueueHandoff collapses to shipped when PR is already merged", () => {
      const gitMock = queueGitMock();
      const ghMock = queueGhMock({ finalState: "MERGED" });

      const result = completeMergeQueueHandoff(
        {
          repoRoot: "/main",
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
          repoRoot: "/main",
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
          repoRoot: "/main",
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
          repoRoot: "/main",
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
          repoRoot: "/main",
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

  describe("armPullRequestAutoMerge PR title policy guard", () => {
    function runArm(
      policy: PrTitlePolicy | undefined,
      options: {
        prTitleType?: string;
        prTitle?: string;
      } = {},
    ): {
      result: ReturnType<typeof armPullRequestAutoMerge>;
      mergeCalls: string[][];
      titleFetchCalls: string[][];
      allCalls: string[][];
    } {
      const mergeCalls: string[][] = [];
      const titleFetchCalls: string[][] = [];
      const allCalls: string[][] = [];
      const runGh = (_cwd: string, args: string[]) => {
        allCalls.push(args);
        if (args[0] === "pr" && args[1] === "merge") {
          mergeCalls.push(args);
          return { status: 0, stdout: "Auto-merge enabled", stderr: "" };
        }
        if (
          args[0] === "pr" &&
          args[1] === "view" &&
          args[2] === "42" &&
          args.some((a) => a.includes("state"))
        ) {
          titleFetchCalls.push(args);
          return {
            status: 0,
            stdout: JSON.stringify({ title: options.prTitle ?? "" }),
            stderr: "",
          };
        }
        return {
          status: 1,
          stdout: "",
          stderr: `unexpected gh ${args.join(" ")}`,
        };
      };
      const result = armPullRequestAutoMerge(
        "/main",
        "Sharper-Flow/Advance",
        42,
        "Remove external artist resolvers",
        options.prTitle,
        options.prTitleType,
        policy,
        { runGh },
      );
      return { result, mergeCalls, titleFetchCalls, allCalls };
    }

    it("plain/absent policy arms without fetching the live PR title", () => {
      const { result, mergeCalls, titleFetchCalls } = runArm(undefined);
      expect(result).toEqual({ ok: true });
      expect(mergeCalls).toHaveLength(1);
      expect(mergeCalls[0]).toEqual([
        "pr",
        "merge",
        "42",
        "--repo",
        "Sharper-Flow/Advance",
        "--squash",
        "--auto",
      ]);
      expect(titleFetchCalls).toHaveLength(0);
    });

    it("explicit plain policy arms without fetching the live PR title", () => {
      const { result, mergeCalls, titleFetchCalls } = runArm(
        { format: "plain" },
        {
          prTitleType: "fix",
          prTitle: "fix: Remove external artist resolvers",
        },
      );
      expect(result).toEqual({ ok: true });
      expect(mergeCalls).toHaveLength(1);
      expect(titleFetchCalls).toHaveLength(0);
    });

    it("conventional + valid live title + type in allowed_types arms", () => {
      const { result, mergeCalls } = runArm(
        { format: "conventional", allowed_types: ["fix", "feat"] },
        {
          prTitleType: "fix",
          prTitle: "fix: Remove external artist resolvers",
        },
      );
      expect(result).toEqual({ ok: true });
      expect(mergeCalls).toHaveLength(1);
    });

    it("conventional + allowed but non-releasing type returns PR_TITLE_POLICY_VIOLATION and does not arm", () => {
      const { result, mergeCalls } = runArm(
        {
          format: "conventional",
          allowed_types: ["feat", "fix", "perf", "chore"],
          release_types: ["feat", "fix", "perf"],
        },
        {
          prTitleType: "chore",
          prTitle: "chore: Remove external artist resolvers",
        },
      );
      expect(result).toEqual({
        ok: false,
        reason: "PR_TITLE_POLICY_VIOLATION",
        details: [
          "type 'chore' is not in release_types ['feat','fix','perf']; archive would merge without producing a release tag",
        ],
      });
      expect(mergeCalls).toHaveLength(0);
    });

    it("conventional + releasing type in release_types arms", () => {
      const { result, mergeCalls } = runArm(
        {
          format: "conventional",
          allowed_types: ["feat", "fix", "perf", "chore"],
          release_types: ["feat", "fix", "perf"],
        },
        {
          prTitleType: "fix",
          prTitle: "fix: Remove external artist resolvers",
        },
      );
      expect(result).toEqual({ ok: true });
      expect(mergeCalls).toHaveLength(1);
    });

    it("conventional + empty release_types blocks defensively", () => {
      const { result, mergeCalls } = runArm(
        {
          format: "conventional",
          allowed_types: ["fix"],
          release_types: [],
        },
        {
          prTitleType: "fix",
          prTitle: "fix: Remove external artist resolvers",
        },
      );
      expect(result).toEqual({
        ok: false,
        reason: "PR_TITLE_POLICY_VIOLATION",
        details: [
          "type 'fix' is not in release_types []; archive would merge without producing a release tag",
        ],
      });
      expect(mergeCalls).toHaveLength(0);
    });

    it("conventional + missing type returns PR_TITLE_TYPE_UNRESOLVED and does not arm", () => {
      const { result, mergeCalls } = runArm(
        { format: "conventional" },
        {
          prTitle: "fix: Remove external artist resolvers",
        },
      );
      expect(result).toEqual({
        ok: false,
        reason: "PR_TITLE_TYPE_UNRESOLVED",
        details: [
          "Conventional PR title policy requires a prTitleType, but none was provided.",
        ],
      });
      expect(mergeCalls).toHaveLength(0);
    });

    it("conventional + live title violating allowed_types returns PR_TITLE_POLICY_VIOLATION and does not arm", () => {
      const { result, mergeCalls } = runArm(
        { format: "conventional", allowed_types: ["feat"] },
        {
          prTitleType: "fix",
          prTitle: "fix: Remove external artist resolvers",
        },
      );
      expect(result).toEqual({
        ok: false,
        reason: "PR_TITLE_POLICY_VIOLATION",
        details: [
          "Live PR title 'fix: Remove external artist resolvers' does not conform to policy: type 'fix' is not in allowed_types.",
        ],
      });
      expect(mergeCalls).toHaveLength(0);
    });

    it("conventional + live title not starting with type prefix returns PR_TITLE_POLICY_VIOLATION", () => {
      const { result, mergeCalls } = runArm(
        { format: "conventional" },
        {
          prTitleType: "fix",
          prTitle: "Remove external artist resolvers",
        },
      );
      expect(result).toEqual({
        ok: false,
        reason: "PR_TITLE_POLICY_VIOLATION",
        details: [
          "Live PR title 'Remove external artist resolvers' does not conform to policy: must start with 'fix:'.",
        ],
      });
      expect(mergeCalls).toHaveLength(0);
    });

    it("conventional + gh pr view title lookup failure returns PR_TITLE_LOOKUP_FAILED and does not arm", () => {
      const mergeCalls: string[][] = [];
      const runGh = (_cwd: string, args: string[]) => {
        if (args[0] === "pr" && args[1] === "merge") {
          mergeCalls.push(args);
          return { status: 0, stdout: "Auto-merge enabled", stderr: "" };
        }
        if (args[0] === "pr" && args[1] === "view" && args[2] === "42") {
          return { status: 1, stdout: "", stderr: "GH PR lookup failed" };
        }
        return {
          status: 1,
          stdout: "",
          stderr: `unexpected gh ${args.join(" ")}`,
        };
      };
      const result = armPullRequestAutoMerge(
        "/main",
        "Sharper-Flow/Advance",
        42,
        "Remove external artist resolvers",
        undefined,
        "fix",
        { format: "conventional" },
        { runGh },
      );
      expect(result).toEqual({
        ok: false,
        reason: "PR_TITLE_LOOKUP_FAILED",
        details: ["GH PR lookup failed"],
      });
      expect(mergeCalls).toHaveLength(0);
    });

    it("Reuse coverage (validator D5 live-title finding): live PR with pre-existing 'Archive ...' title blocks PR_TITLE_POLICY_VIOLATION", () => {
      const mergeCalls: string[][] = [];
      const runGh = (_cwd: string, args: string[]) => {
        if (args[0] === "pr" && args[1] === "merge") {
          mergeCalls.push(args);
          return { status: 0, stdout: "Auto-merge enabled", stderr: "" };
        }
        if (args[0] === "pr" && args[1] === "view" && args[2] === "42") {
          return {
            status: 0,
            stdout: JSON.stringify({ title: "Archive someOldChange" }),
            stderr: "",
          };
        }
        return {
          status: 1,
          stdout: "",
          stderr: `unexpected gh ${args.join(" ")}`,
        };
      };
      const result = armPullRequestAutoMerge(
        "/main",
        "Sharper-Flow/Advance",
        42,
        "Remove external artist resolvers",
        undefined,
        "fix",
        {
          format: "conventional",
          allowed_types: ["feat", "fix", "perf", "chore"],
        },
        { runGh },
      );
      expect(result).toEqual({
        ok: false,
        reason: "PR_TITLE_POLICY_VIOLATION",
        details: [
          "Live PR title 'Archive someOldChange' does not conform to policy: must start with 'fix:'.",
        ],
      });
      expect(mergeCalls).toHaveLength(0);
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
  it("git-finalize.ts has no Temporal imports after the persistence cutover (AC7 layer-boundary)", () => {
    // Git finalization is now independent of the removed Temporal contracts.
    const src = readFileSync(join(__dirname, "git-finalize.ts"), "utf8");
    const temporalImportLines = src
      .split("\n")
      .filter((line) => /^import.*from.*temporal/.test(line));
    expect(temporalImportLines).toEqual([]);
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
    // The removed local-trunk sync helper is no longer mentioned.
    expect(section).not.toContain("syncDefaultBranchAfterMerge");
  });
});

/**
 * rq-optimizePhase9GitCalls AC7 — cache hit/miss/invalidation/failure-rollback tests.
 *
 * Tests the FinalizeInvocationState accumulator and the invalidation matrix
 * directly. The matrix is the C4-critical surface: every (mutation, cacheKey)
 * cell marked invalidate in design.md must drop the entry, including on
 * failure-rollback paths.
 */
describe("FinalizeInvocationState accumulator (rq-optimizePhase9GitCalls)", () => {
  /** Mock runGit that records every call so tests can assert call counts. */
  function makeRecordingRunGit(
    impl: (
      cwd: string,
      args: string[],
    ) => {
      status: number;
      stdout: string;
      stderr: string;
    },
  ): { runGit: (cwd: string, args: string[]) => any; calls: any[] } {
    const calls: Array<{ cwd: string; args: string[] }> = [];
    return {
      runGit: (cwd: string, args: string[]) => {
        calls.push({ cwd, args });
        return impl(cwd, args);
      },
      calls,
    };
  }

  /** Stub runGit that simulates an empty no-remote repo (default route = no_remote). */
  function noRemoteRunGit() {
    return (_cwd: string, args: string[]) => {
      if (args[0] === "remote" && args[1] === "get-url") {
        return { status: 128, stdout: "", stderr: "no remote configured" };
      }
      if (args[0] === "rev-parse") {
        return { status: 0, stdout: "deadbeef\n", stderr: "" };
      }
      if (args[0] === "branch" && args[1] === "--show-current") {
        return { status: 0, stdout: "trunk\n", stderr: "" };
      }
      if (args[0] === "status" && args[1] === "--porcelain") {
        return { status: 0, stdout: "", stderr: "" };
      }
      if (args[0] === "var") {
        return { status: 0, stdout: "ADV Test <adv@test>\n", stderr: "" };
      }
      if (args[0] === "ls-files") {
        return { status: 0, stdout: "", stderr: "" };
      }
      if (args[0] === "fetch") {
        return { status: 128, stdout: "", stderr: "no remote" };
      }
      return { status: 0, stdout: "", stderr: "" };
    };
  }

  it("AC2: getRoute caches — repeated call does not re-invoke underlying classifyFinalizationRoute", () => {
    const rec = makeRecordingRunGit(noRemoteRunGit());
    const state = createState("/fake/main", "trunk", { runGit: rec.runGit });

    const first = getRoute(state);
    const firstCallCount = rec.calls.filter(
      (c) => c.args[0] === "remote" && c.args[1] === "get-url",
    ).length;
    expect(firstCallCount).toBe(1);

    const second = getRoute(state);
    const secondCallCount = rec.calls.filter(
      (c) => c.args[0] === "remote" && c.args[1] === "get-url",
    ).length;
    expect(secondCallCount).toBe(1); // no additional call
    expect(second).toBe(first); // same object reference (cached)
  });

  it("AC2: cache miss on first query — first call invokes underlying exactly once", () => {
    const rec = makeRecordingRunGit(noRemoteRunGit());
    const state = createState("/fake/main", "trunk", { runGit: rec.runGit });

    getRoute(state);

    const routeCalls = rec.calls.filter(
      (c) => c.args[0] === "remote" && c.args[1] === "get-url",
    );
    expect(routeCalls.length).toBe(1);
  });

  it("AC3: invalidate(commit-dirty-main-checkpoint) drops localHeadSha and mainInProgress only", () => {
    const state = createState("/fake/main", "trunk", {});
    // Populate all cache entries
    state.route = { route: "no_remote" };
    state.remoteUrl = "git@github.com:foo/bar";
    state.originHeadSha = "aaa";
    state.localHeadSha = "bbb";
    state.committerIdent = { ok: true };
    state.mainInProgress = { inProgress: false };

    invalidate(state, "commit-dirty-main-checkpoint");

    expect(state.route).toBeDefined(); // untouched
    expect(state.remoteUrl).toBeDefined(); // untouched
    expect(state.originHeadSha).toBeDefined(); // untouched
    expect(state.localHeadSha).toBeUndefined(); // dropped
    expect(state.committerIdent).toBeDefined(); // untouched
    expect(state.mainInProgress).toBeUndefined(); // dropped
  });

  it("AC3: invalidate(merge-change-branch) drops originHeadSha, localHeadSha, mainInProgress", () => {
    const state = createState("/fake/main", "trunk", {});
    state.route = { route: "no_remote" };
    state.remoteUrl = "git@github.com:foo/bar";
    state.originHeadSha = "aaa";
    state.localHeadSha = "bbb";
    state.committerIdent = { ok: true };
    state.mainInProgress = { inProgress: false };

    invalidate(state, "merge-change-branch");

    expect(state.route).toBeDefined();
    expect(state.remoteUrl).toBeDefined();
    expect(state.originHeadSha).toBeUndefined(); // dropped
    expect(state.localHeadSha).toBeUndefined(); // dropped
    expect(state.committerIdent).toBeDefined();
    expect(state.mainInProgress).toBeUndefined(); // dropped
  });

  it("AC3: invalidate(push-to-origin) drops originHeadSha only", () => {
    const state = createState("/fake/main", "trunk", {});
    state.route = { route: "no_remote" };
    state.remoteUrl = "git@github.com:foo/bar";
    state.originHeadSha = "aaa";
    state.localHeadSha = "bbb";
    state.committerIdent = { ok: true };
    state.mainInProgress = { inProgress: false };

    invalidate(state, "push-to-origin");

    expect(state.route).toBeDefined();
    expect(state.remoteUrl).toBeDefined();
    expect(state.originHeadSha).toBeUndefined(); // dropped
    expect(state.localHeadSha).toBeDefined(); // untouched
    expect(state.committerIdent).toBeDefined();
    expect(state.mainInProgress).toBeDefined(); // untouched
  });

  it("AC3: invalidate(commit-archive-artifacts) and invalidate(push-change-branch) drop nothing", () => {
    const state = createState("/fake/main", "trunk", {});
    state.route = { route: "no_remote" };
    state.originHeadSha = "aaa";
    state.localHeadSha = "bbb";
    state.mainInProgress = { inProgress: false };

    invalidate(state, "commit-archive-artifacts");
    invalidate(state, "push-change-branch");

    // Nothing dropped for these mutation kinds
    expect(state.route).toBeDefined();
    expect(state.originHeadSha).toBeDefined();
    expect(state.localHeadSha).toBeDefined();
    expect(state.mainInProgress).toBeDefined();
  });

  it("AC3: invalidate(reset-main-to-origin-default) drops all main-state entries + fetched flag", () => {
    const state = createState("/fake/main", "trunk", {});
    state.originHeadSha = "aaa";
    state.localHeadSha = "bbb";
    state.mainInProgress = { inProgress: false };
    state.originDefaultFetched = true;

    invalidate(state, "reset-main-to-origin-default");

    expect(state.originHeadSha).toBeUndefined();
    expect(state.localHeadSha).toBeUndefined();
    expect(state.mainInProgress).toBeUndefined();
    expect(state.originDefaultFetched).toBe(false); // flag cleared
  });

  it("AC3: invalidate(execute-pull-request-handoff) drops main-state + fetched flag (not mainInProgress)", () => {
    const state = createState("/fake/main", "trunk", {});
    state.originHeadSha = "aaa";
    state.localHeadSha = "bbb";
    state.mainInProgress = { inProgress: false };
    state.originDefaultFetched = true;

    invalidate(state, "execute-pull-request-handoff");

    expect(state.originHeadSha).toBeUndefined();
    expect(state.localHeadSha).toBeUndefined();
    expect(state.mainInProgress).toBeDefined(); // untouched per matrix
    expect(state.originDefaultFetched).toBe(false);
  });

  it("AC3: invalidate(undefined-state) is a safe no-op", () => {
    expect(() => invalidate(undefined, "merge-change-branch")).not.toThrow();
  });

  it("AC4: invalidate is callable on failure-rollback paths (no hidden state)", () => {
    // Simulate a mutation that throws; verify invalidate can still be called
    // from a catch/finally path. The function itself is pure — no side effects
    // beyond clearing entries — so the rollback pattern is straightforward.
    const state = createState("/fake/main", "trunk", {});
    state.originHeadSha = "stale-after-failed-merge";
    state.localHeadSha = "also-stale";

    // Simulate failed mutation pattern: try { mutate } catch { invalidate; rethrow }
    try {
      throw new Error("simulated git merge failure");
    } catch {
      invalidate(state, "merge-change-branch");
    }

    expect(state.originHeadSha).toBeUndefined();
    expect(state.localHeadSha).toBeUndefined();
  });

  it("AC2: ensureOriginDefaultFetched dedupes successful fetches (happy path)", () => {
    let fetchCount = 0;
    const rec = makeRecordingRunGit((_cwd, args) => {
      if (args[0] === "fetch") {
        fetchCount++;
        return { status: 0, stdout: "", stderr: "" };
      }
      return { status: 0, stdout: "", stderr: "" };
    });
    const state = createState("/fake/main", "trunk", { runGit: rec.runGit });

    const first = ensureOriginDefaultFetched(state);
    const second = ensureOriginDefaultFetched(state);

    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(fetchCount).toBe(1); // only one underlying fetch
    expect(state.originDefaultFetched).toBe(true);
  });

  it("AC2: ensureOriginDefaultFetched retries after failure (does not cache failure)", () => {
    let fetchCount = 0;
    const rec = makeRecordingRunGit((_cwd, args) => {
      if (args[0] === "fetch") {
        fetchCount++;
        return { status: 128, stdout: "", stderr: "transient" };
      }
      return { status: 0, stdout: "", stderr: "" };
    });
    const state = createState("/fake/main", "trunk", { runGit: rec.runGit });

    const first = ensureOriginDefaultFetched(state);
    const second = ensureOriginDefaultFetched(state);

    expect(first.status).toBe(128); // failure surfaced
    expect(second.status).toBe(128); // retried
    expect(fetchCount).toBe(2); // two underlying fetches (no caching on failure)
    expect(state.originDefaultFetched).toBe(false); // still not flagged
  });

  it("SC1+SC2: end-to-end finalizeRelease on no-op fixture uses ≤1 fetch and ≤1 route classification", async () => {
    const tempRoot = await createTempDir("adv-finalize-cache-");
    try {
      const main = join(tempRoot, "main");
      const worktree = join(tempRoot, "wt");
      await mkdir(main);
      await initRepo(main);
      // No remote configured → route = no_remote, fetches return non-zero (no-op).
      git(main, ["worktree", "add", "-b", "change/example", worktree]);
      // Put a file in the worktree so there's an artifact to commit.
      await writeFile(join(worktree, "bundle.txt"), "archive bundle\n");
      git(worktree, ["add", "bundle.txt"]);

      // Wrap runGit to count fetch + remote-get-url calls without changing behavior.
      let fetchCount = 0;
      let remoteGetUrlCount = 0;
      const realRunGit = (cwd: string, args: string[], timeoutMs?: number) => {
        if (args[0] === "fetch") fetchCount++;
        if (args[0] === "remote" && args[1] === "get-url") remoteGetUrlCount++;
        return spawnSync("git", args, {
          cwd,
          encoding: "utf8",
          timeout: timeoutMs,
        }) as any;
      };

      const result = await finalizeRelease(
        {
          changeId: "example",
          workdir: worktree,
          archiveMode: "direct",
          autoPush: false,
          artifactPaths: ["bundle.txt"],
        },
        { runGit: realRunGit },
      );

      // No remote → route is "no_remote", status blocked with NO_REMOTE_RELEASE_AUTHORITY.
      expect(result.status).toBe("blocked");
      expect(result.route).toBe("no_remote");
      expect(result.blocked?.reason).toBe("NO_REMOTE_RELEASE_AUTHORITY");

      // SC1: at most 1 fetch attempt (and the no-remote repo returns 128, but
      // the count tracks attempts, not successes).
      expect(fetchCount).toBeLessThanOrEqual(1);

      // SC2 (route component): classifyFinalizationRoute called 3× historically;
      // now reduced to 1 underlying remote-get-url call.
      expect(remoteGetUrlCount).toBeLessThanOrEqual(1);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  describe("createArchivePullRequest title construction", () => {
    function runCreate(
      policy: PrTitlePolicy | undefined,
      prTitleType: string | undefined,
    ): {
      result: ReturnType<typeof createArchivePullRequest>;
      title: string | undefined;
      calls: string[][];
    } {
      const calls: string[][] = [];
      const runGh = (_cwd: string, args: string[]) => {
        calls.push(args);
        if (args[0] === "pr" && args[1] === "create") {
          return {
            status: 0,
            stdout: "https://github.com/Sharper-Flow/Advance/pull/42\n",
            stderr: "",
          };
        }
        return { status: 1, stdout: "", stderr: "unexpected gh call" };
      };
      const result = createArchivePullRequest(
        {
          repoRoot: "/main",
          repo: "Sharper-Flow/Advance",
          branch: "change/example",
          defaultBranch: "trunk",
          changeId: "example",
          changeTitle: "Remove external artist resolvers",
          prTitleType,
          prTitlePolicy: policy,
        },
        { runGh },
      );
      const createCall = calls.find(
        (args) => args[0] === "pr" && args[1] === "create",
      );
      const titleIndex = createCall?.indexOf("--title") ?? -1;
      const title = titleIndex >= 0 ? createCall?.[titleIndex + 1] : undefined;
      return { result, title, calls };
    }

    it("plain/absent policy keeps byte-for-byte 'Archive {changeId}' title", () => {
      const { result, title } = runCreate(undefined, undefined);
      expect(result).toEqual({
        ok: true,
        url: "https://github.com/Sharper-Flow/Advance/pull/42",
      });
      expect(title).toBe("Archive example");
    });

    it("explicit plain policy also keeps 'Archive {changeId}' title", () => {
      const { result, title } = runCreate({ format: "plain" }, "fix");
      expect(result).toEqual({
        ok: true,
        url: "https://github.com/Sharper-Flow/Advance/pull/42",
      });
      expect(title).toBe("Archive example");
    });

    it("conventional policy + prTitleType produces '{type}: {changeTitle}'", () => {
      const { result, title } = runCreate({ format: "conventional" }, "fix");
      expect(result).toEqual({
        ok: true,
        url: "https://github.com/Sharper-Flow/Advance/pull/42",
      });
      expect(title).toBe("fix: Remove external artist resolvers");
    });

    it("conventional policy without prTitleType returns unresolved-title signal", () => {
      const { result, title, calls } = runCreate(
        { format: "conventional" },
        undefined,
      );
      expect(result).toEqual({
        ok: false,
        reason: "UNRESOLVED_PR_TITLE",
        details: [
          "Conventional PR title policy requires a prTitleType, but none was provided.",
        ],
      });
      expect(title).toBeUndefined();
      // No pr create should be emitted for the unresolved case.
      expect(calls).toHaveLength(0);
    });
  });
});

/**
 * End-to-end / cross-component integration tests for archive PR title policy
 * (AC1-AC5). These exercise the full archive -> PR -> merge-arm path through
 * executePullRequestHandoff and redriveArchivedUnmergedBranch, not just the
 * unit-level armer or title-construction helpers.
 */
describe("archive PR title policy end-to-end integration (AC1-AC5)", () => {
  const repo = "Sharper-Flow/Advance";
  const changeId = "removeExternalArtistResolvers";
  const branch = `change/${changeId}`;
  const changeTitle = "Remove external artist resolvers";
  const conventionalPolicy: PrTitlePolicy = {
    format: "conventional",
    release_types: ["feat", "fix", "perf"],
    allowed_types: ["feat", "fix", "perf", "chore"],
  };

  /**
   * Builds git/gh mocks for executePullRequestHandoff integration tests.
   * Captures every call so tests can assert on the created PR title and the
   * merge-arm invocation.
   */
  function makeHandoffMocks(
    opts: {
      existingPr?: boolean;
      prTitle?: string;
      prState?: "OPEN" | "MERGED";
    } = {},
  ) {
    const gitCalls: string[][] = [];
    const ghCalls: string[][] = [];
    let branchViewCount = 0;

    const runGit = (_cwd: string, args: string[]) => {
      gitCalls.push(args);
      if (args[0] === "push" && args.includes(branch)) {
        return { status: 0, stdout: "pushed branch", stderr: "" };
      }
      return {
        status: 1,
        stdout: "",
        stderr: `unexpected git ${args.join(" ")}`,
      };
    };

    const runGh = (_cwd: string, args: string[]) => {
      ghCalls.push(args);
      if (args[0] === "pr" && args[1] === "view" && args[2] === branch) {
        branchViewCount += 1;
        if (opts.existingPr || branchViewCount > 1) {
          return {
            status: 0,
            stdout: JSON.stringify({
              number: 42,
              url: `https://github.com/${repo}/pull/42`,
              state: opts.prState ?? "OPEN",
              title: opts.prTitle ?? "fix: Remove external artist resolvers",
              autoMergeRequest: null,
            }),
            stderr: "",
          };
        }
        return {
          status: 1,
          stdout: "",
          stderr: "no pull requests found",
        };
      }
      if (args[0] === "pr" && args[1] === "create") {
        return {
          status: 0,
          stdout: `https://github.com/${repo}/pull/42\n`,
          stderr: "",
        };
      }
      if (args[0] === "pr" && args[1] === "merge" && args[2] === "42") {
        return { status: 0, stdout: "Auto-merge enabled", stderr: "" };
      }
      if (
        args[0] === "pr" &&
        args[1] === "view" &&
        args[2] === "42" &&
        args.some((a) => a.includes("title"))
      ) {
        return {
          status: 0,
          stdout: JSON.stringify({
            title: opts.prTitle ?? "fix: Remove external artist resolvers",
          }),
          stderr: "",
        };
      }
      if (
        args[0] === "pr" &&
        args[1] === "view" &&
        args[2] === "42" &&
        args.some((a) => a.includes("state"))
      ) {
        const response = {
          status: 0,
          stdout: JSON.stringify({
            state: opts.prState ?? "OPEN",
            mergedAt:
              (opts.prState ?? "OPEN") === "MERGED"
                ? "2026-06-07T00:00:00Z"
                : null,
            mergeCommit:
              (opts.prState ?? "OPEN") === "MERGED"
                ? { oid: "merge-sha" }
                : null,
            autoMergeRequest:
              (opts.prState ?? "OPEN") === "OPEN"
                ? { enabledAt: "2026-06-07T00:00:00Z" }
                : null,
          }),
          stderr: "",
        };
        return response;
      }
      return {
        status: 1,
        stdout: "",
        stderr: `unexpected gh ${args.join(" ")}`,
      };
    };

    return { runGit, runGh, gitCalls, ghCalls };
  }

  /**
   * Builds git/gh mocks for redriveArchivedUnmergedBranch integration tests.
   * Simulates an origin that has the change branch and a protected default
   * branch with auto-merge enabled.
   */
  function makeRedriveMocks(
    opts: {
      existingPr?: boolean;
      prTitle?: string;
      existingPrState?: "OPEN" | "MERGED";
    } = {},
  ) {
    const gitCalls: string[][] = [];
    const ghCalls: string[][] = [];
    let branchViewCount = 0;

    const runGit = (_cwd: string, args: string[]) => {
      gitCalls.push(args);
      if (args[0] === "ls-remote" && args.includes(`refs/heads/${branch}`)) {
        return {
          status: 0,
          stdout: `abc123\trefs/heads/${branch}\n`,
          stderr: "",
        };
      }
      if (
        args[0] === "remote" &&
        args[1] === "get-url" &&
        args[2] === "origin"
      ) {
        return {
          status: 0,
          stdout: `https://github.com/${repo}.git\n`,
          stderr: "",
        };
      }
      return {
        status: 1,
        stdout: "",
        stderr: `unexpected git ${args.join(" ")}`,
      };
    };

    const runGh = (_cwd: string, args: string[]) => {
      ghCalls.push(args);
      if (
        args[0] === "api" &&
        args[1] === `repos/${repo}/rules/branches/trunk`
      ) {
        return {
          status: 0,
          stdout: JSON.stringify([{ type: "required_status_checks" }]),
          stderr: "",
        };
      }
      if (
        args[0] === "api" &&
        args[1] === `repos/${repo}` &&
        args.some((a) => a.includes("allow_auto_merge"))
      ) {
        return { status: 0, stdout: "true\n", stderr: "" };
      }
      if (args[0] === "pr" && args[1] === "view" && args[2] === branch) {
        branchViewCount += 1;
        if (opts.existingPr || branchViewCount > 1) {
          return {
            status: 0,
            stdout: JSON.stringify({
              number: 42,
              url: `https://github.com/${repo}/pull/42`,
              state: opts.existingPrState ?? "OPEN",
              title: opts.prTitle ?? "fix: Remove external artist resolvers",
              autoMergeRequest: null,
            }),
            stderr: "",
          };
        }
        return {
          status: 1,
          stdout: "",
          stderr: "no pull requests found",
        };
      }
      if (args[0] === "pr" && args[1] === "create") {
        return {
          status: 0,
          stdout: `https://github.com/${repo}/pull/42\n`,
          stderr: "",
        };
      }
      if (args[0] === "pr" && args[1] === "merge" && args[2] === "42") {
        return { status: 0, stdout: "Auto-merge enabled", stderr: "" };
      }
      if (
        args[0] === "pr" &&
        args[1] === "view" &&
        args[2] === "42" &&
        args.includes("state")
      ) {
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
    };

    return { runGit, runGh, gitCalls, ghCalls };
  }

  /**
   * AC4 / PokeEdge #1020 repro: a conventional target policy plus an explicit
   * prTitleType="fix" must produce PR title "fix: <changeTitle>" (NOT the old
   * hard-coded "Archive <id>" title) and successfully arm auto-merge.
   *
   * The original bug emitted "Archive removeExternalArtistResolvers", which
   * failed the repository's PR-title validator and released nothing.
   */
  it("AC4 / PokeEdge #1020 repro: conventional policy + prTitleType='fix' produces 'fix: <title>' and arms auto-merge", () => {
    const mocks = makeHandoffMocks();
    const result = executePullRequestHandoff(
      {
        repoRoot: "/main",
        workdir: "/workdir",
        repo,
        branch,
        defaultBranch: "trunk",
        changeId,
        route: {
          route: "pr_auto_merge",
          repo,
          protected: true,
          autoMergeAllowed: true,
        },
        pushFailureReason: "n/a",
        changeTitle,
        prTitleType: "fix",
        prTitlePolicy: conventionalPolicy,
      },
      mocks,
    );

    expect(result).toMatchObject({
      status: "pending_merge",
      route: "pr_auto_merge",
      prNumber: 42,
      prBranch: branch,
      autoMergeArmed: true,
      pushStatus: "pushed",
    });

    const createCall = mocks.ghCalls.find(
      (args) => args[0] === "pr" && args[1] === "create",
    );
    expect(createCall).toBeDefined();
    const titleIndex = createCall!.indexOf("--title");
    expect(createCall![titleIndex + 1]).toBe(
      "fix: Remove external artist resolvers",
    );

    const mergeCalls = mocks.ghCalls.filter(
      (args) => args[0] === "pr" && args[1] === "merge",
    );
    expect(mergeCalls).toHaveLength(1);
  });

  /**
   * AC2 via executePullRequestHandoff: a conventional target with no resolvable
   * prTitleType must block before any PR is created or armed, returning
   * UNRESOLVED_PR_TITLE at the integration level (not just inside the armer).
   */
  it("AC2 via executePullRequestHandoff: conventional target without prTitleType blocks with UNRESOLVED_PR_TITLE (no merge arm)", () => {
    const mocks = makeHandoffMocks();
    const result = executePullRequestHandoff(
      {
        repoRoot: "/main",
        workdir: "/workdir",
        repo,
        branch,
        defaultBranch: "trunk",
        changeId,
        route: {
          route: "pr_auto_merge",
          repo,
          protected: true,
          autoMergeAllowed: true,
        },
        pushFailureReason: "n/a",
        changeTitle,
        prTitlePolicy: conventionalPolicy,
      },
      mocks,
    );

    expect(result.status).toBe("blocked");
    expect(result.blocked?.reason).toBe("UNRESOLVED_PR_TITLE");
    expect(result.autoMergeArmed).toBeFalsy();

    const createCalls = mocks.ghCalls.filter(
      (args) => args[0] === "pr" && args[1] === "create",
    );
    expect(createCalls).toHaveLength(0);

    const mergeCalls = mocks.ghCalls.filter(
      (args) => args[0] === "pr" && args[1] === "merge",
    );
    expect(mergeCalls).toHaveLength(0);
  });

  /**
   * AC2 via redriveArchivedUnmergedBranch: the same unresolved-type blocker must
   * surface through the re-drive path, proving the guard covers BOTH entry
   * points (validator finding 2 regression coverage).
   */
  it("AC2 via redriveArchivedUnmergedBranch: conventional target without prTitleType blocks with UNRESOLVED_PR_TITLE", () => {
    const mocks = makeRedriveMocks();
    const result = redriveArchivedUnmergedBranch(
      {
        repoRoot: "/main",
        defaultBranch: "trunk",
        changeId,
        changeTitle,
        prTitlePolicy: conventionalPolicy,
      },
      mocks,
    );

    expect(result.status).toBe("blocked");
    expect(result.blocked?.reason).toBe("UNRESOLVED_PR_TITLE");
    expect(result.autoMergeArmed).toBeFalsy();

    const createCalls = mocks.ghCalls.filter(
      (args) => args[0] === "pr" && args[1] === "create",
    );
    expect(createCalls).toHaveLength(0);

    const mergeCalls = mocks.ghCalls.filter(
      (args) => args[0] === "pr" && args[1] === "merge",
    );
    expect(mergeCalls).toHaveLength(0);
  });

  /**
   * Reuse coverage (validator D5 live-title finding): a prior partial run may
   * have left an existing PR with a bad "Archive ..." title. Re-driving must
   * fetch that live title and block with PR_TITLE_POLICY_VIOLATION, not reuse
   * the title blindly.
   */
  it("Reuse coverage: redrive with pre-existing 'Archive ...' PR title blocks with PR_TITLE_POLICY_VIOLATION", () => {
    const mocks = makeRedriveMocks({
      existingPr: true,
      prTitle: "Archive removeExternalArtistResolvers",
    });
    const result = redriveArchivedUnmergedBranch(
      {
        repoRoot: "/main",
        defaultBranch: "trunk",
        changeId,
        changeTitle,
        prTitleType: "fix",
        prTitlePolicy: conventionalPolicy,
      },
      mocks,
    );

    expect(result.status).toBe("blocked");
    expect(result.blocked?.reason).toBe("AUTO_MERGE_ARM_FAILED");
    expect(result.blocked?.details).toEqual(
      expect.arrayContaining([
        "PR_TITLE_POLICY_VIOLATION",
        expect.stringContaining(
          "Live PR title 'Archive removeExternalArtistResolvers' does not conform to policy",
        ),
      ]),
    );
    expect(result.autoMergeArmed).toBeFalsy();

    const mergeCalls = mocks.ghCalls.filter(
      (args) => args[0] === "pr" && args[1] === "merge",
    );
    expect(mergeCalls).toHaveLength(0);
  });

  /**
   * AC3: a plain target (no pr_title_policy field) must keep the legacy
   * "Archive {changeId}" title end-to-end and arm auto-merge unchanged.
   */
  it("AC3: plain target (no policy field) preserves 'Archive {changeId}' and arms unchanged", () => {
    const mocks = makeHandoffMocks({
      prTitle: "Archive removeExternalArtistResolvers",
    });
    const result = executePullRequestHandoff(
      {
        repoRoot: "/main",
        workdir: "/workdir",
        repo,
        branch,
        defaultBranch: "trunk",
        changeId,
        route: {
          route: "pr_auto_merge",
          repo,
          protected: true,
          autoMergeAllowed: true,
        },
        pushFailureReason: "n/a",
        changeTitle,
      },
      mocks,
    );

    expect(result).toMatchObject({
      status: "pending_merge",
      route: "pr_auto_merge",
      prNumber: 42,
      prBranch: branch,
      autoMergeArmed: true,
      pushStatus: "pushed",
    });

    const createCall = mocks.ghCalls.find(
      (args) => args[0] === "pr" && args[1] === "create",
    );
    expect(createCall).toBeDefined();
    const titleIndex = createCall!.indexOf("--title");
    expect(createCall![titleIndex + 1]).toBe(
      "Archive removeExternalArtistResolvers",
    );
  });

  /**
   * AC5: the title must be constructed mechanically as `{prTitleType}:
   * {changeTitle}`. There is no heuristic that inspects the changeTitle text
   * to guess a type. We use a changeTitle that begins with a different valid
   * type word ("feat") to prove the explicit prTitleType wins.
   *
   * Note: the git-finalize helper receives a resolved prTitleType string and does
   * not distinguish whether it came from change metadata or from the explicit
   * adv_change_archive param. The phase9 command-level test
   * "threads explicit prTitleType into finalizeRelease context" covers the
   * explicit-param wiring; metadata-sourced type resolution is not currently
   * implemented in change.ts (see ENGINEER_REPORT findings).
   */
  it("AC5: explicit prTitleType produces exact '{type}: {changeTitle}' without heuristic title-text inference", () => {
    const titleThatCouldLookLikeFeat =
      "feat flag all external artist resolvers";
    const mocks = makeHandoffMocks({
      prTitle: `fix: ${titleThatCouldLookLikeFeat}`,
    });
    const result = executePullRequestHandoff(
      {
        repoRoot: "/main",
        workdir: "/workdir",
        repo,
        branch,
        defaultBranch: "trunk",
        changeId,
        route: {
          route: "pr_auto_merge",
          repo,
          protected: true,
          autoMergeAllowed: true,
        },
        pushFailureReason: "n/a",
        changeTitle: titleThatCouldLookLikeFeat,
        prTitleType: "fix",
        prTitlePolicy: conventionalPolicy,
      },
      mocks,
    );

    expect(result.status).toBe("pending_merge");

    const createCall = mocks.ghCalls.find(
      (args) => args[0] === "pr" && args[1] === "create",
    );
    expect(createCall).toBeDefined();
    const titleIndex = createCall!.indexOf("--title");
    expect(createCall![titleIndex + 1]).toBe(
      "fix: feat flag all external artist resolvers",
    );
  });
});
