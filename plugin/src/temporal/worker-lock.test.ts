/**
 * Worker Lock Tests (rq-workerSingleton01)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, readFile, writeFile, access } from "fs/promises";
import { join } from "path";
import {
  acquireWorkerLock,
  releaseWorkerLock,
  WORKER_LOCK_FILENAME,
} from "./worker-lock";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";

describe("acquireWorkerLock + releaseWorkerLock", () => {
  let stateDir: string;

  beforeEach(async () => {
    stateDir = await createTempDir("adv-worker-lock-");
  });

  afterEach(async () => {
    await cleanupTempDir(stateDir);
  });

  it("first acquire returns owned:true with our PID and a worker_id", async () => {
    const result = await acquireWorkerLock(stateDir);
    expect(result.owned).toBe(true);
    if (!result.owned) throw new Error("expected owned:true");
    expect(result.ownerPid).toBe(process.pid);
    expect(result.workerId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.lockPath).toBe(join(stateDir, WORKER_LOCK_FILENAME));

    // Lock file written with parseable JSON contents.
    const raw = await readFile(result.lockPath, "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.pid).toBe(process.pid);
    expect(parsed.worker_id).toBe(result.workerId);
    expect(typeof parsed.acquired_at).toBe("string");
  });

  it("second acquire when lock held by ALIVE pid returns owned:false with ownerPid", async () => {
    // Pretend a different PID holds the lock and is alive.
    const otherPid = 99999;
    await writeLock(stateDir, otherPid);

    const result = await acquireWorkerLock(stateDir, {
      // Our own PID
      pid: 12345,
      isAlive: (pid) => (pid === otherPid ? "alive" : "dead"),
    });

    expect(result.owned).toBe(false);
    if (result.owned) throw new Error("expected owned:false");
    expect(result.ownerPid).toBe(otherPid);
    expect(result.reason).toBe("lock_held_by_alive_pid");
  });

  it("second acquire when lock held by DEAD pid reclaims and acquires", async () => {
    const deadPid = 99998;
    await writeLock(stateDir, deadPid);

    const result = await acquireWorkerLock(stateDir, {
      pid: 12345,
      isAlive: (pid) => (pid === deadPid ? "dead" : "alive"),
    });

    expect(result.owned).toBe(true);
    if (!result.owned) throw new Error("expected owned:true");
    expect(result.ownerPid).toBe(12345);

    // Lock file reflects the new owner.
    const raw = await readFile(result.lockPath, "utf8");
    expect(JSON.parse(raw).pid).toBe(12345);
  });

  it("EPERM (unknown_owner) is treated as alive — does NOT reclaim", async () => {
    const otherPid = 1; // root pid — process.kill(1, 0) typically EPERM
    await writeLock(stateDir, otherPid);

    const result = await acquireWorkerLock(stateDir, {
      pid: 12345,
      isAlive: () => "unknown_owner",
    });

    expect(result.owned).toBe(false);
    if (result.owned) throw new Error("expected owned:false");
    expect(result.ownerPid).toBe(otherPid);
  });

  it("unreadable lock contents are treated as stale and acquired", async () => {
    // Write a corrupt lock file (not JSON).
    await writeFile(join(stateDir, WORKER_LOCK_FILENAME), "garbage{not}json");

    const result = await acquireWorkerLock(stateDir, {
      pid: 12345,
      isAlive: () => "alive",
    });

    expect(result.owned).toBe(true);
    if (!result.owned) throw new Error("expected owned:true");
    expect(result.ownerPid).toBe(12345);
  });

  it("empty lock file is treated as stale and acquired", async () => {
    await writeFile(join(stateDir, WORKER_LOCK_FILENAME), "");

    const result = await acquireWorkerLock(stateDir, {
      pid: 12345,
      isAlive: () => "alive",
    });

    expect(result.owned).toBe(true);
  });

  it("releaseWorkerLock removes the lock file", async () => {
    const acquired = await acquireWorkerLock(stateDir);
    expect(acquired.owned).toBe(true);

    await releaseWorkerLock(stateDir);

    await expect(
      access(join(stateDir, WORKER_LOCK_FILENAME)),
    ).rejects.toThrow();
  });

  it("releaseWorkerLock is idempotent (no-op when no lock exists)", async () => {
    // Should not throw.
    await expect(releaseWorkerLock(stateDir)).resolves.toBeUndefined();
  });

  it("after release, a fresh acquire succeeds", async () => {
    await acquireWorkerLock(stateDir);
    await releaseWorkerLock(stateDir);
    const result = await acquireWorkerLock(stateDir);
    expect(result.owned).toBe(true);
  });

  it("two simultaneous acquires produce one owner + one not-owned (atomic O_EXCL)", async () => {
    // Both calls race for the same lock. Only one wins. Since we force
    // distinct PIDs, both calls' isAlive sees the OTHER pid alive.
    const [a, b] = await Promise.all([
      acquireWorkerLock(stateDir, {
        pid: 11111,
        isAlive: () => "alive",
      }),
      acquireWorkerLock(stateDir, {
        pid: 22222,
        isAlive: () => "alive",
      }),
    ]);
    const owners = [a, b].filter((r) => r.owned);
    const notOwners = [a, b].filter((r) => !r.owned);
    expect(owners).toHaveLength(1);
    expect(notOwners).toHaveLength(1);
  });
});

// =============================================================================
// Helpers
// =============================================================================

async function writeLock(stateDir: string, pid: number): Promise<void> {
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    join(stateDir, WORKER_LOCK_FILENAME),
    JSON.stringify({
      pid,
      worker_id: "00000000-0000-4000-8000-000000000000",
      acquired_at: "2026-01-01T00:00:00.000Z",
    }),
  );
}
