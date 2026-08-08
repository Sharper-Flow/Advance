import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  acquireGitWorktreeFlock,
  acquireGitWorktreeProcessLease,
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
});
