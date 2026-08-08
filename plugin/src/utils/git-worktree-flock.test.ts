import { afterEach, describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";

import {
  acquireGitWorktreeFlock,
  acquireGitWorktreeProcessLease,
  GIT_WORKTREE_FLOCK_CONFLICT_EXIT_CODE,
  GitWorktreeLegacyLockError,
  GitWorktreeFlockUnsupportedError,
  LEGACY_GIT_WORKTREE_FLOCK_CONFLICT_EXIT_CODE,
  migrateLegacyGitWorktreeLock,
  releaseGitWorktreeFlock,
  resolveGitWorktreeLeaseDir,
} from "./git-worktree-flock";

const dirs: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function makeGitRepo(prefix: string): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(repo);
  git(repo, "init", "-q", "-b", "trunk");
  fs.writeFileSync(path.join(repo, "README"), "fixture\n");
  git(repo, "add", "README");
  execFileSync(
    "git",
    [
      "-c",
      "user.name=ADV test",
      "-c",
      "user.email=adv@example.test",
      "commit",
      "-qm",
      "fixture",
    ],
    { cwd: repo },
  );
  return repo;
}

afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("git worktree repository lease", () => {
  it("blocks on a live owner and records an owner token", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adv-flock-"));
    dirs.push(dir);

    const first = await acquireGitWorktreeFlock(dir);
    const second = await acquireGitWorktreeFlock(dir);

    expect(first.owned).toBe(true);
    if (!first.owned) return;
    expect(first.ownerToken).toBeTypeOf("string");
    expect(second).toMatchObject({
      owned: false,
      ownerPid: process.pid,
      reason: "lock_held_by_alive_pid",
    });
  });

  it("reclaims a dead owner using a new token", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adv-flock-"));
    dirs.push(dir);
    const first = await acquireGitWorktreeFlock(dir);
    if (!first.owned) throw new Error("initial lease was not acquired");

    fs.writeFileSync(
      path.join(dir, "git-worktree.lock"),
      JSON.stringify({ pid: 99999999, owner_token: "dead-token" }),
    );
    const reclaimed = await acquireGitWorktreeFlock(dir);

    expect(reclaimed.owned).toBe(true);
    if (reclaimed.owned) expect(reclaimed.ownerToken).not.toBe("dead-token");
  });

  it("does not let a non-owner release the lease", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adv-flock-"));
    dirs.push(dir);
    const first = await acquireGitWorktreeFlock(dir);
    if (!first.owned) throw new Error("initial lease was not acquired");

    await releaseGitWorktreeFlock(dir, "wrong-token");
    expect(fs.existsSync(path.join(dir, "git-worktree.lock"))).toBe(true);
    await releaseGitWorktreeFlock(dir, first.ownerToken);
    expect(fs.existsSync(path.join(dir, "git-worktree.lock"))).toBe(false);
  });

  it("holds a kernel flock until the dedicated process group exits", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adv-process-flock-"));
    dirs.push(dir);

    const first = await acquireGitWorktreeProcessLease(dir);
    expect(first.owned).toBe(true);
    if (!first.owned) return;

    const second = await acquireGitWorktreeProcessLease(dir);
    expect(second).toMatchObject({ owned: false });

    const legacyWhileHeld = await acquireGitWorktreeFlock(dir);
    expect(legacyWhileHeld).toMatchObject({ owned: false });

    const holderPid = first.ownerPid;
    await first.terminate("test");
    await first.settled;
    expect(() => process.kill(-holderPid, 0)).toThrow();
    const third = await acquireGitWorktreeProcessLease(dir);
    expect(third.owned).toBe(true);
    if (third.owned) await third.terminate("test");
  });

  it("does not use the host runtime executable for the holder", async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "adv-process-flock-runtime-"),
    );
    dirs.push(dir);
    const previousExecPath = process.execPath;
    process.execPath = "/opt/opencode/fake-compiled-runtime";
    let invocation: { command: string; args: readonly string[] } | undefined;
    try {
      const first = await acquireGitWorktreeProcessLease(dir, {
        spawnProcess: (command, args, options) => {
          invocation = { command, args };
          return spawn(command, [...args], options);
        },
      });

      expect(first.owned).toBe(true);
      if (first.owned) await first.terminate("test");
      expect(invocation?.command).toBe("flock");
      expect(invocation?.args).toEqual([
        "-n",
        "-E",
        String(GIT_WORKTREE_FLOCK_CONFLICT_EXIT_CODE),
        path.join(dir, "git-worktree.lock"),
        "sh",
        "-c",
        "command -v tail >/dev/null 2>&1 || { printf '%s\\n' 'ADV_WORKTREE_FLOCK_HOLDER_UNAVAILABLE' >&2; exit 127; }; printf '%s\\n' 'ADV_WORKTREE_FLOCK_READY'; exec tail -f /dev/null",
      ]);
      expect(invocation?.args).not.toContain(process.execPath);
    } finally {
      process.execPath = previousExecPath;
    }
  });

  it("returns a typed non-busy error for holder startup failure", async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "adv-process-flock-failure-"),
    );
    dirs.push(dir);
    const child = Object.assign(new EventEmitter(), {
      pid: 987654321,
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: () => true,
    });
    const acquisition = acquireGitWorktreeProcessLease(dir, {
      spawnProcess: () => {
        queueMicrotask(() => {
          child.stderr.emit("data", "tail: command unavailable\n");
          child.emit("close", 1, null);
        });
        return child as unknown as ChildProcess;
      },
    });

    await expect(acquisition).rejects.toMatchObject({
      name: "GitWorktreeFlockHolderError",
      exitCode: 1,
      stderr: "tail: command unavailable\n",
    });
  });

  it("classifies a missing holder command as unsupported, not contention", async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "adv-process-flock-missing-holder-"),
    );
    dirs.push(dir);
    const child = Object.assign(new EventEmitter(), {
      pid: 987654322,
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: () => true,
    });

    const acquisition = acquireGitWorktreeProcessLease(dir, {
      spawnProcess: () => {
        queueMicrotask(() => {
          child.stderr.emit("data", "ADV_WORKTREE_FLOCK_HOLDER_UNAVAILABLE\n");
          child.emit("close", 127, null);
        });
        return child as unknown as ChildProcess;
      },
    });

    await expect(acquisition).rejects.toBeInstanceOf(
      GitWorktreeFlockUnsupportedError,
    );
  });

  it("fails closed on unsupported platforms", async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "adv-process-flock-platform-"),
    );
    dirs.push(dir);

    await expect(
      acquireGitWorktreeProcessLease(dir, { platform: "darwin" }),
    ).rejects.toThrow(/requires Linux/);
  });

  it("shares the canonical administrative lease across main and linked worktrees", async () => {
    const repo = makeGitRepo("adv-common-dir-");
    const linked = path.join(repo, "linked");
    git(repo, "worktree", "add", "-q", "-b", "linked", linked);

    const mainLeaseDir = await resolveGitWorktreeLeaseDir(repo);
    const linkedLeaseDir = await resolveGitWorktreeLeaseDir(linked);
    expect(linkedLeaseDir).toBe(mainLeaseDir);
    expect(mainLeaseDir).toBe(path.join(repo, ".git", "advance"));

    const first = await acquireGitWorktreeProcessLease(mainLeaseDir);
    expect(first.owned).toBe(true);
    if (!first.owned) return;
    try {
      await expect(
        acquireGitWorktreeProcessLease(linkedLeaseDir),
      ).resolves.toMatchObject({ owned: false });
      expect(first.lockPath).toBe(
        path.join(repo, ".git", "advance", "git-worktree.lock"),
      );
    } finally {
      await first.terminate("test");
    }
  });

  it("keeps administrative lease paths independent across separate clones", async () => {
    const first = makeGitRepo("adv-clone-a-");
    const second = makeGitRepo("adv-clone-b-");
    await expect(resolveGitWorktreeLeaseDir(first)).resolves.not.toBe(
      await resolveGitWorktreeLeaseDir(second),
    );
  });

  it("removes an unlocked known legacy artifact and leaves .adv otherwise untouched", async () => {
    const repo = makeGitRepo("adv-legacy-empty-");
    const advDir = path.join(repo, ".adv");
    const lockPath = path.join(advDir, "git-worktree.lock");
    fs.mkdirSync(advDir);
    fs.writeFileSync(lockPath, "");
    fs.writeFileSync(path.join(advDir, "keep.txt"), "keep\n");

    await expect(migrateLegacyGitWorktreeLock(repo)).resolves.toMatchObject({
      removed: true,
      lockPath,
    });
    expect(fs.existsSync(lockPath)).toBe(false);
    expect(fs.existsSync(path.join(advDir, "keep.txt"))).toBe(true);
  });

  it("removes a bounded JSON legacy artifact", async () => {
    const repo = makeGitRepo("adv-legacy-json-");
    const lockPath = path.join(repo, ".adv", "git-worktree.lock");
    fs.mkdirSync(path.dirname(lockPath));
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: process.pid,
        worker_id: "worker",
        owner_token: "token",
        acquired_at: new Date().toISOString(),
      }),
    );
    await expect(migrateLegacyGitWorktreeLock(repo)).resolves.toMatchObject({
      removed: true,
    });
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("preserves and refuses a held legacy artifact with the distinct conflict code", async () => {
    const repo = makeGitRepo("adv-legacy-held-");
    const advDir = path.join(repo, ".adv");
    const lockPath = path.join(advDir, "git-worktree.lock");
    fs.mkdirSync(advDir);
    fs.writeFileSync(lockPath, "");
    const holder = await acquireGitWorktreeProcessLease(advDir);
    expect(holder.owned).toBe(true);
    if (!holder.owned) return;
    try {
      await expect(migrateLegacyGitWorktreeLock(repo)).rejects.toMatchObject({
        name: "GitWorktreeLegacyLockError",
        failure: "held",
        lockPath,
      } satisfies Partial<GitWorktreeLegacyLockError>);
      expect(fs.existsSync(lockPath)).toBe(true);
      expect(LEGACY_GIT_WORKTREE_FLOCK_CONFLICT_EXIT_CODE).not.toBe(
        GIT_WORKTREE_FLOCK_CONFLICT_EXIT_CODE,
      );
    } finally {
      await holder.terminate("test");
    }
  });

  it("preserves and refuses malformed legacy artifacts", async () => {
    const repo = makeGitRepo("adv-legacy-malformed-");
    const lockPath = path.join(repo, ".adv", "git-worktree.lock");
    fs.mkdirSync(path.dirname(lockPath));
    fs.writeFileSync(lockPath, JSON.stringify({ unexpected: true }));
    await expect(migrateLegacyGitWorktreeLock(repo)).rejects.toMatchObject({
      name: "GitWorktreeLegacyLockError",
      failure: "malformed",
      lockPath,
    });
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  it("refuses legacy symlink paths without traversing outside the repository", async () => {
    const repo = makeGitRepo("adv-legacy-symlink-");
    const external = fs.mkdtempSync(
      path.join(os.tmpdir(), "adv-legacy-external-"),
    );
    dirs.push(external);
    const externalLock = path.join(external, "git-worktree.lock");
    fs.writeFileSync(externalLock, "");
    fs.symlinkSync(external, path.join(repo, ".adv"));

    await expect(migrateLegacyGitWorktreeLock(repo)).rejects.toMatchObject({
      name: "GitWorktreeLegacyLockError",
      failure: "malformed",
    });
    expect(fs.existsSync(externalLock)).toBe(true);
  });

  it("preserves a symlinked legacy artifact without following it", async () => {
    const repo = makeGitRepo("adv-legacy-lock-symlink-");
    const external = fs.mkdtempSync(
      path.join(os.tmpdir(), "adv-legacy-external-"),
    );
    dirs.push(external);
    const externalLock = path.join(external, "git-worktree.lock");
    fs.writeFileSync(externalLock, "");
    const legacyDir = path.join(repo, ".adv");
    fs.mkdirSync(legacyDir);
    fs.symlinkSync(externalLock, path.join(legacyDir, "git-worktree.lock"));

    await expect(migrateLegacyGitWorktreeLock(repo)).rejects.toMatchObject({
      name: "GitWorktreeLegacyLockError",
      failure: "malformed",
    });
    expect(fs.existsSync(externalLock)).toBe(true);
  });
});
