/**
 * Tests for peer-sessions.ts (T17 — KD-14).
 *
 * RED phase: tests fail before implementation.
 * GREEN phase: same-CWD peer + sibling-worktree peer (NEW) +
 *              subdirectory peer (NEW) + unrelated process filtered.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "os";
import { mkdtempSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import {
  detectPeerSessions,
  __setProcessScannerForTests,
  __resetProcessScannerForTests,
} from "./peer-sessions";

const ORIGINAL_PLATFORM = Object.getOwnPropertyDescriptor(process, "platform");

function setLinux() {
  Object.defineProperty(process, "platform", { value: "linux" });
}

function restorePlatform() {
  if (ORIGINAL_PLATFORM) {
    Object.defineProperty(process, "platform", ORIGINAL_PLATFORM);
  }
}

describe("peer-sessions.ts (T17)", () => {
  let tempRoot: string;
  let mainCheckout: string;
  let siblingWorktree: string;
  let unrelatedRepo: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "peer-sessions-test-"));
    mainCheckout = join(tempRoot, "main-checkout");
    unrelatedRepo = join(tempRoot, "unrelated-repo");
    mkdirSync(mainCheckout, { recursive: true });
    mkdirSync(unrelatedRepo, { recursive: true });

    // Initialize git repos so rev-parse --git-common-dir + project-id resolve.
    execFileSync("git", ["init", "-q", "-b", "trunk"], { cwd: mainCheckout });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: mainCheckout,
    });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: mainCheckout });
    execFileSync("git", ["commit", "--allow-empty", "-m", "root"], {
      cwd: mainCheckout,
    });

    // Sibling worktree of main checkout.
    siblingWorktree = join(tempRoot, "main-checkout-feature");
    execFileSync(
      "git",
      ["worktree", "add", "-b", "feature", siblingWorktree, "trunk"],
      { cwd: mainCheckout },
    );

    // Unrelated repo with its own root.
    execFileSync("git", ["init", "-q", "-b", "trunk"], { cwd: unrelatedRepo });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: unrelatedRepo,
    });
    execFileSync("git", ["config", "user.name", "Test"], {
      cwd: unrelatedRepo,
    });
    execFileSync("git", ["commit", "--allow-empty", "-m", "root"], {
      cwd: unrelatedRepo,
    });
  });

  afterEach(() => {
    __resetProcessScannerForTests();
    rmSync(tempRoot, { recursive: true, force: true });
    restorePlatform();
  });

  it("throws on non-Linux platforms (J4 platform guard)", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    try {
      await expect(detectPeerSessions(mainCheckout)).rejects.toThrow(
        /requires Linux/,
      );
    } finally {
      restorePlatform();
    }
  });

  it("detects same-CWD peer via common-dir match", async () => {
    setLinux();
    const myPid = process.pid;
    const peerPid = myPid + 1;
    __setProcessScannerForTests(async () => [
      { pid: peerPid, cwd: mainCheckout },
    ]);

    const peers = await detectPeerSessions(mainCheckout);
    expect(peers).toHaveLength(1);
    expect(peers[0]).toMatchObject({
      pid: peerPid,
      cwd: mainCheckout,
      matchVia: "common-dir",
    });
  });

  it("detects sibling-worktree peer via common-dir match (NEW case)", async () => {
    setLinux();
    const myPid = process.pid;
    const peerPid = myPid + 1;
    __setProcessScannerForTests(async () => [
      { pid: peerPid, cwd: siblingWorktree },
    ]);

    const peers = await detectPeerSessions(mainCheckout);
    expect(peers).toHaveLength(1);
    expect(peers[0]).toMatchObject({
      pid: peerPid,
      cwd: siblingWorktree,
      matchVia: "common-dir",
    });
  });

  it("detects subdirectory peer via common-dir match (NEW case)", async () => {
    setLinux();
    const subdir = join(mainCheckout, "src");
    mkdirSync(subdir, { recursive: true });
    const myPid = process.pid;
    const peerPid = myPid + 1;
    __setProcessScannerForTests(async () => [{ pid: peerPid, cwd: subdir }]);

    const peers = await detectPeerSessions(mainCheckout);
    expect(peers).toHaveLength(1);
    expect(peers[0]).toMatchObject({
      pid: peerPid,
      cwd: subdir,
      matchVia: "common-dir",
    });
  });

  it("filters out unrelated repos", async () => {
    setLinux();
    const myPid = process.pid;
    const peerPid = myPid + 1;
    __setProcessScannerForTests(async () => [
      { pid: peerPid, cwd: unrelatedRepo },
    ]);

    const peers = await detectPeerSessions(mainCheckout);
    expect(peers).toEqual([]);
  });

  it("excludes current process PID", async () => {
    setLinux();
    const myPid = process.pid;
    __setProcessScannerForTests(async () => [{ pid: myPid, cwd: mainCheckout }]);

    const peers = await detectPeerSessions(mainCheckout);
    expect(peers).toEqual([]);
  });

  it("returns empty when CWD is not a git repo (no identifiers resolve)", async () => {
    setLinux();
    const nonRepo = join(tempRoot, "not-a-repo");
    mkdirSync(nonRepo, { recursive: true });
    __setProcessScannerForTests(async () => [
      { pid: process.pid + 1, cwd: nonRepo },
    ]);

    const peers = await detectPeerSessions(nonRepo);
    expect(peers).toEqual([]);
  });
});
