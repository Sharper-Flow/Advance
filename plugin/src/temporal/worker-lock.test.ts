/**
 * Worker Lock Tests (rq-workerSingleton01)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, readFile, writeFile, access } from "fs/promises";
import { join } from "path";
import {
  acquireWorkerLock,
  HEARTBEAT_INTERVAL_MS,
  isV2Lock,
  readLockContents,
  releaseWorkerLock,
  STALE_HEARTBEAT_MS,
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

  describe("worker lock schema detection", () => {
    it("classifies schema_version 2 plus last_heartbeat as v2", () => {
      expect(
        isV2Lock({
          pid: 12345,
          worker_id: "00000000-0000-4000-8000-000000000000",
          acquired_at: "2026-01-01T00:00:00.000Z",
          schema_version: 2,
          last_heartbeat: "2026-01-01T00:00:05.000Z",
        }),
      ).toBe(true);
    });

    it("classifies missing schema_version as v1 even with last_heartbeat", () => {
      expect(
        isV2Lock({
          pid: 12345,
          worker_id: "00000000-0000-4000-8000-000000000000",
          acquired_at: "2026-01-01T00:00:00.000Z",
          last_heartbeat: "2026-01-01T00:00:05.000Z",
        }),
      ).toBe(false);
    });

    it("classifies missing last_heartbeat as v1 even with schema_version 2", () => {
      expect(
        isV2Lock({
          pid: 12345,
          worker_id: "00000000-0000-4000-8000-000000000000",
          acquired_at: "2026-01-01T00:00:00.000Z",
          schema_version: 2,
        }),
      ).toBe(false);
    });

    it("classifies schema_version 1 as v1", () => {
      expect(
        isV2Lock({
          pid: 12345,
          worker_id: "00000000-0000-4000-8000-000000000000",
          acquired_at: "2026-01-01T00:00:00.000Z",
          schema_version: 1,
          last_heartbeat: "2026-01-01T00:00:05.000Z",
        }),
      ).toBe(false);
    });
  });

  describe("heartbeat timing constants", () => {
    it("uses conservative default heartbeat timing", () => {
      expect(HEARTBEAT_INTERVAL_MS).toBe(5_000);
      expect(STALE_HEARTBEAT_MS).toBe(60_000);
      expect(STALE_HEARTBEAT_MS).toBeGreaterThan(2 * HEARTBEAT_INTERVAL_MS);
    });

    it("honors env overrides while preserving stale > 2 * interval", async () => {
      vi.resetModules();
      vi.stubEnv("ADV_WORKER_HEARTBEAT_INTERVAL_MS", "7000");
      vi.stubEnv("ADV_WORKER_HEARTBEAT_STALE_MS", "25000");

      const workerLock = await import("./worker-lock");

      expect(workerLock.HEARTBEAT_INTERVAL_MS).toBe(7_000);
      expect(workerLock.STALE_HEARTBEAT_MS).toBe(25_000);
      expect(workerLock.STALE_HEARTBEAT_MS).toBeGreaterThan(
        2 * workerLock.HEARTBEAT_INTERVAL_MS,
      );

      vi.unstubAllEnvs();
      vi.resetModules();
    });
  });

  describe("readLockContents schema derivation", () => {
    it("parses v1 lock files with derived schema_version 1", async () => {
      await writeLock(stateDir, 12345);

      const contents = await readLockContents(
        join(stateDir, WORKER_LOCK_FILENAME),
      );

      expect(contents?.schema_version).toBe(1);
      expect(contents).not.toHaveProperty("last_heartbeat");
    });

    it("parses v2 lock files with last_heartbeat intact", async () => {
      const lastHeartbeat = "2026-01-01T00:00:05.000Z";
      await writeLock(stateDir, 12345, {
        schema_version: 2,
        last_heartbeat: lastHeartbeat,
      });

      const contents = await readLockContents(
        join(stateDir, WORKER_LOCK_FILENAME),
      );

      expect(contents?.schema_version).toBe(2);
      expect(contents?.last_heartbeat).toBe(lastHeartbeat);
    });
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

  it("alive v2 lock with stale heartbeat is reclaimed", async () => {
    const otherPid = 99997;
    vi.setSystemTime(new Date("2026-01-01T00:02:00.000Z"));
    await writeLock(stateDir, otherPid, {
      schema_version: 2,
      last_heartbeat: "2026-01-01T00:00:00.000Z",
    });

    const result = await acquireWorkerLock(stateDir, {
      pid: 12345,
      isAlive: (pid) => (pid === otherPid ? "alive" : "dead"),
    });

    expect(result.owned).toBe(true);
    if (!result.owned) throw new Error("expected owned:true");
    expect(result.ownerPid).toBe(12345);
  });

  it("alive v2 lock with fresh heartbeat is respected", async () => {
    const otherPid = 99996;
    vi.setSystemTime(new Date("2026-01-01T00:00:30.000Z"));
    await writeLock(stateDir, otherPid, {
      schema_version: 2,
      last_heartbeat: "2026-01-01T00:00:00.000Z",
    });

    const result = await acquireWorkerLock(stateDir, {
      pid: 12345,
      isAlive: () => "alive",
    });

    expect(result.owned).toBe(false);
    if (result.owned) throw new Error("expected owned:false");
    expect(result.ownerPid).toBe(otherPid);
  });

  it("alive v1 lock is respected even without heartbeat", async () => {
    const otherPid = 99995;
    vi.setSystemTime(new Date("2026-01-01T00:02:00.000Z"));
    await writeLock(stateDir, otherPid);

    const result = await acquireWorkerLock(stateDir, {
      pid: 12345,
      isAlive: () => "alive",
    });

    expect(result.owned).toBe(false);
    if (result.owned) throw new Error("expected owned:false");
    expect(result.ownerPid).toBe(otherPid);
  });

  it("approved alive v1 lock reclaim records prior lock metadata", async () => {
    const otherPid = 99995;
    await writeLock(stateDir, otherPid);

    const result = await acquireWorkerLock(stateDir, {
      pid: 12345,
      isAlive: () => "alive",
      approvedLiveLegacyReclaim: {
        expectedQueue: "advance-proj123",
        approvalEvidence: "user approved suspect live v1 lock reclaim",
      },
    });

    expect(result.owned).toBe(true);
    if (!result.owned) throw new Error("expected owned:true");
    expect(result.ownerPid).toBe(12345);
    expect(result.reclaimed).toEqual({
      reason: "approved_live_legacy_lock",
      priorPid: otherPid,
      priorWorkerId: "00000000-0000-4000-8000-000000000000",
      priorSchemaVersion: 1,
      expectedQueue: "advance-proj123",
      approvalEvidence: "user approved suspect live v1 lock reclaim",
    });
  });

  it("unapproved fresh alive v2 lock is respected", async () => {
    const otherPid = 99996;
    vi.setSystemTime(new Date("2026-01-01T00:00:30.000Z"));
    await writeLock(stateDir, otherPid, {
      schema_version: 2,
      last_heartbeat: "2026-01-01T00:00:00.000Z",
    });

    const result = await acquireWorkerLock(stateDir, {
      pid: 12345,
      isAlive: () => "alive",
    });

    expect(result.owned).toBe(false);
    if (result.owned) throw new Error("expected owned:false");
    expect(result.ownerPid).toBe(otherPid);
  });

  it("approved alive v2 lock reclaim records prior lock metadata", async () => {
    const otherPid = 99996;
    vi.setSystemTime(new Date("2026-01-01T00:00:30.000Z"));
    await writeLock(stateDir, otherPid, {
      schema_version: 2,
      last_heartbeat: "2026-01-01T00:00:00.000Z",
    });

    const result = await acquireWorkerLock(stateDir, {
      pid: 12345,
      isAlive: () => "alive",
      approvedLiveLegacyReclaim: {
        expectedQueue: "advance-proj123",
        approvalEvidence: "user approved suspect live v2 lock reclaim",
      },
    });

    expect(result.owned).toBe(true);
    if (!result.owned) throw new Error("expected owned:true");
    expect(result.ownerPid).toBe(12345);
    expect(result.reclaimed).toEqual({
      reason: "approved_live_unserviceable_lock",
      priorPid: otherPid,
      priorWorkerId: "00000000-0000-4000-8000-000000000000",
      priorSchemaVersion: 2,
      expectedQueue: "advance-proj123",
      approvalEvidence: "user approved suspect live v2 lock reclaim",
    });
  });

  it("alive v2 lock with future heartbeat is reclaimed defensively", async () => {
    const otherPid = 99994;
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    await writeLock(stateDir, otherPid, {
      schema_version: 2,
      last_heartbeat: "2026-01-01T00:05:00.000Z",
    });

    const result = await acquireWorkerLock(stateDir, {
      pid: 12345,
      isAlive: (pid) => (pid === otherPid ? "alive" : "dead"),
    });

    expect(result.owned).toBe(true);
    if (!result.owned) throw new Error("expected owned:true");
    expect(result.ownerPid).toBe(12345);
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

  it("two simultaneous stale-heartbeat reclaimers produce exactly one new owner", async () => {
    const stalePid = 99993;
    await writeLock(stateDir, stalePid, {
      schema_version: 2,
      last_heartbeat: new Date(
        Date.now() - STALE_HEARTBEAT_MS - 1_000,
      ).toISOString(),
    });

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
    expect(notOwners[0].ownerPid).not.toBe(stalePid);

    const canonical = JSON.parse(
      await readFile(join(stateDir, WORKER_LOCK_FILENAME), "utf8"),
    ) as { pid: number; worker_id: string };
    expect(canonical.pid).toBe(owners[0].ownerPid);
  });

  // T2 (KD-7): parametrize lock filename so other coordination domains
  // (e.g. git-worktree-flock at T15) can reuse this lock primitive
  // without colliding with the default worker.lock file.
  describe("lockFilename option (T2)", () => {
    it("acquire honors custom lockFilename and does not collide with default", async () => {
      const customResult = await acquireWorkerLock(stateDir, {
        lockFilename: "test.lock",
      });
      expect(customResult.owned).toBe(true);
      if (!customResult.owned) throw new Error("expected owned:true");
      expect(customResult.lockPath).toBe(join(stateDir, "test.lock"));

      // Default lock is independent and still acquirable.
      const defaultResult = await acquireWorkerLock(stateDir);
      expect(defaultResult.owned).toBe(true);
      if (!defaultResult.owned) throw new Error("expected owned:true");
      expect(defaultResult.lockPath).toBe(join(stateDir, WORKER_LOCK_FILENAME));
    });

    it("release honors custom lockFilename", async () => {
      await acquireWorkerLock(stateDir, { lockFilename: "test.lock" });
      await releaseWorkerLock(stateDir, { lockFilename: "test.lock" });
      await expect(access(join(stateDir, "test.lock"))).rejects.toThrow();
    });

    it("two acquires of the same custom lockFilename respect O_EXCL", async () => {
      const [a, b] = await Promise.all([
        acquireWorkerLock(stateDir, {
          pid: 33333,
          isAlive: () => "alive",
          lockFilename: "shared.lock",
        }),
        acquireWorkerLock(stateDir, {
          pid: 44444,
          isAlive: () => "alive",
          lockFilename: "shared.lock",
        }),
      ]);
      const owners = [a, b].filter((r) => r.owned);
      const notOwners = [a, b].filter((r) => !r.owned);
      expect(owners).toHaveLength(1);
      expect(notOwners).toHaveLength(1);
      expect(owners[0].lockPath).toBe(join(stateDir, "shared.lock"));
    });

    it("default behavior unchanged when lockFilename omitted", async () => {
      const result = await acquireWorkerLock(stateDir);
      expect(result.owned).toBe(true);
      if (!result.owned) throw new Error("expected owned:true");
      expect(result.lockPath).toBe(join(stateDir, WORKER_LOCK_FILENAME));
    });
  });
});

// =============================================================================
// Helpers
// =============================================================================

async function writeLock(
  stateDir: string,
  pid: number,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    join(stateDir, WORKER_LOCK_FILENAME),
    JSON.stringify({
      pid,
      worker_id: "00000000-0000-4000-8000-000000000000",
      acquired_at: "2026-01-01T00:00:00.000Z",
      ...extra,
    }),
  );
}
