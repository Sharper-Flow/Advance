import { afterEach, describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

import {
  acquireGitWorktreeFlock,
  acquireGitWorktreeProcessLease,
  GIT_WORKTREE_FLOCK_CONFLICT_EXIT_CODE,
  GitWorktreeFlockUnsupportedError,
  releaseGitWorktreeFlock,
} from "./git-worktree-flock";

const dirs: string[] = [];

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
});
