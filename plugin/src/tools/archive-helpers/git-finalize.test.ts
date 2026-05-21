/**
 * Phase 9 git finalization helper tests.
 *
 * These tests lock the runtime side of rq-releaseFinalization01 so the
 * release gate cannot be satisfied by prose-only /adv-archive instructions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { createTempDir } from "../../__tests__/setup";
import {
  detectArchiveMode,
  detectDefaultBranch,
  finalizeRelease,
  mergeChangeBranch,
  mergeToTrunk,
  pushToOrigin,
  resolveMainCheckout,
  verifyChangeBranchReachable,
  verifyMainInvariants,
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
  git(root, ["init", "-b", defaultBranch]);
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

  it("detectDefaultBranch prefers main, then trunk, then origin/HEAD, then init.defaultBranch", async () => {
    const mainRepo = join(tempRoot, "main-preferred");
    await mkdir(mainRepo);
    await initRepo(mainRepo, "main");
    expect(detectDefaultBranch(mainRepo)).toEqual({
      branch: "main",
      source: "local-main",
    });

    const trunkRepo = join(tempRoot, "trunk-preferred");
    await mkdir(trunkRepo);
    await initRepo(trunkRepo, "trunk");
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
      unmergedCommits: expect.arrayContaining([expect.stringContaining("feature")]),
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

  it("mergeChangeBranch blocks on conflicts and never uses stash", () => {
    const calls: string[][] = [];
    const result = mergeChangeBranch("/repo", "trunk", "example", {
      runGit: (_cwd, args) => {
        calls.push(args);
        if (args[0] === "merge") {
          return { status: 1, stdout: "", stderr: "CONFLICT (content): Merge conflict in file.txt" };
        }
        if (args[0] === "diff") return { status: 0, stdout: "file.txt\n", stderr: "" };
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
    expect(pushToOrigin("/repo", "trunk", { autoPush: true, skipPush: true })).toMatchObject({
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

  it("detectArchiveMode defaults direct and validates PR mode gh availability", () => {
    expect(detectArchiveMode({})).toEqual({ archiveMode: "direct", autoPush: true });
    expect(detectArchiveMode({ archive_mode: "direct", auto_push: false })).toEqual({
      archiveMode: "direct",
      autoPush: false,
    });

    expect(() =>
      detectArchiveMode(
        { archive_mode: "pr" },
        { commandExists: () => false },
      ),
    ).toThrow(/gh CLI is required/);
  });

  it("finalizeRelease blocks dirty trunk before merge and reports rq-releaseFinalization01 remediation", async () => {
    const repo = join(tempRoot, "repo");
    await mkdir(repo);
    await initRepo(repo);
    await writeFile(join(repo, "dirty.txt"), "dirty\n");

    const result = await finalizeRelease({
      changeId: "example",
      workdir: repo,
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
});
