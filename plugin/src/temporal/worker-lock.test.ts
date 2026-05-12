import { writeFile } from "fs/promises";
import { join } from "path";
import { afterEach, describe, expect, test } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import {
  WORKER_LOCK_FILENAME,
  acquireWorkerLock,
  readLockContents,
  tryReclaimStaleLock,
} from "./worker-lock";

const NOW = new Date("2026-05-12T00:00:00.000Z");

describe("worker lock", () => {
  let tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => cleanupTempDir(dir)));
    tempDirs = [];
  });

  const tempDir = async () => {
    const dir = await createTempDir("worker-lock-");
    tempDirs.push(dir);
    return dir;
  };

  const writeLock = async (
    dir: string,
    contents: Record<string, unknown>,
  ): Promise<string> => {
    const lockPath = join(dir, WORKER_LOCK_FILENAME);
    await writeFile(lockPath, JSON.stringify(contents, null, 2));
    return lockPath;
  };

  test("writes and reads v2 lock contents with heartbeat and queue", async () => {
    const dir = await tempDir();

    const result = await acquireWorkerLock(dir, {
      pid: 1234,
      schemaVersion: 2,
      expectedQueue: "adv-test-queue",
      now: () => NOW,
    });

    expect(result.owned).toBe(true);
    const contents = await readLockContents(result.lockPath);
    expect(contents).toMatchObject({
      pid: 1234,
      schema_version: 2,
      last_heartbeat: NOW.toISOString(),
      expected_queue: "adv-test-queue",
    });
  });

  test("keeps v1 lock reads backward-compatible", async () => {
    const dir = await tempDir();
    const lockPath = await writeLock(dir, {
      pid: 2222,
      worker_id: "legacy-worker",
      acquired_at: NOW.toISOString(),
    });

    await expect(readLockContents(lockPath)).resolves.toMatchObject({
      pid: 2222,
      worker_id: "legacy-worker",
      acquired_at: NOW.toISOString(),
      schema_version: 1,
    });
  });

  test("reclaims a lock held by a dead PID and retries acquire once", async () => {
    const dir = await tempDir();
    await writeLock(dir, {
      pid: 3333,
      worker_id: "dead-worker",
      acquired_at: NOW.toISOString(),
      schema_version: 2,
      last_heartbeat: NOW.toISOString(),
      expected_queue: "adv-test-queue",
    });

    const result = await tryReclaimStaleLock(dir, {
      pid: 4444,
      schemaVersion: 2,
      expectedQueue: "adv-test-queue",
      now: () => NOW,
      isPidAlive: () => false,
    });

    expect(result).toMatchObject({ owned: true, ownerPid: 4444 });
    await expect(readLockContents(result.lockPath)).resolves.toMatchObject({
      pid: 4444,
      schema_version: 2,
    });
  });

  test("reclaims a v2 lock with stale heartbeat from an alive PID", async () => {
    const dir = await tempDir();
    await writeLock(dir, {
      pid: 5555,
      worker_id: "stale-worker",
      acquired_at: "2026-05-12T00:00:00.000Z",
      schema_version: 2,
      last_heartbeat: "2026-05-12T00:00:01.000Z",
      expected_queue: "adv-test-queue",
    });

    const result = await tryReclaimStaleLock(dir, {
      pid: 6666,
      schemaVersion: 2,
      expectedQueue: "adv-test-queue",
      now: () => new Date("2026-05-12T00:02:10.000Z"),
      staleHeartbeatGraceMs: 60_000,
      isPidAlive: () => true,
    });

    expect(result).toMatchObject({ owned: true, ownerPid: 6666 });
  });

  test("does not reclaim a fresh v2 lock from an alive PID", async () => {
    const dir = await tempDir();
    await writeLock(dir, {
      pid: 7777,
      worker_id: "fresh-worker",
      acquired_at: NOW.toISOString(),
      schema_version: 2,
      last_heartbeat: NOW.toISOString(),
      expected_queue: "adv-test-queue",
    });

    const result = await tryReclaimStaleLock(dir, {
      pid: 8888,
      schemaVersion: 2,
      expectedQueue: "adv-test-queue",
      now: () => new Date("2026-05-12T00:00:30.000Z"),
      staleHeartbeatGraceMs: 60_000,
      isPidAlive: () => true,
    });

    expect(result).toMatchObject({
      owned: false,
      ownerPid: 7777,
      reason: "lock_held_by_alive_pid",
    });
  });
});
