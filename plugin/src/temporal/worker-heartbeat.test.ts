import { readFile } from "fs/promises";
import { afterEach, describe, expect, test, vi } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import { acquireWorkerLock, readLockContents } from "./worker-lock";
import { startWorkerLockHeartbeat } from "./worker-heartbeat";

describe("worker lock heartbeat", () => {
  let tempDirs: string[] = [];

  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(tempDirs.map((dir) => cleanupTempDir(dir)));
    tempDirs = [];
  });

  const tempDir = async () => {
    const dir = await createTempDir("worker-heartbeat-");
    tempDirs.push(dir);
    return dir;
  };

  test("updates v2 heartbeat on interval cadence", async () => {
    const dir = await tempDir();
    let now = new Date("2026-05-12T00:00:00.000Z");
    const lock = await acquireWorkerLock(dir, {
      pid: 1000,
      schemaVersion: 2,
      expectedQueue: "adv-test-queue",
      now: () => now,
    });

    let intervalHandler: (() => void) | undefined;
    const timer = { unref: vi.fn() } as unknown as NodeJS.Timeout;
    const setIntervalFn = vi.fn((handler: () => void, timeout: number) => {
      intervalHandler = handler;
      expect(timeout).toBe(10_000);
      return timer;
    });

    const heartbeat = startWorkerLockHeartbeat(dir, {
      intervalMs: 10_000,
      now: () => now,
      setIntervalFn,
      clearIntervalFn: vi.fn(),
    });

    now = new Date("2026-05-12T00:00:10.000Z");
    intervalHandler?.();
    await heartbeat.beatNow();

    await expect(readLockContents(lock.lockPath)).resolves.toMatchObject({
      pid: 1000,
      worker_id: lock.workerId,
      expected_queue: "adv-test-queue",
      last_heartbeat: "2026-05-12T00:00:10.000Z",
    });

    await heartbeat.stop();
  });

  test("atomic heartbeat rewrite preserves lock owner fields", async () => {
    const dir = await tempDir();
    let now = new Date("2026-05-12T00:00:00.000Z");
    const lock = await acquireWorkerLock(dir, {
      pid: 2000,
      schemaVersion: 2,
      expectedQueue: "adv-test-queue",
      now: () => now,
    });

    const heartbeat = startWorkerLockHeartbeat(dir, { now: () => now });
    now = new Date("2026-05-12T00:00:11.000Z");
    await heartbeat.beatNow();

    const raw = await readFile(lock.lockPath, "utf8");
    expect(raw).toContain('"pid": 2000');
    expect(raw).toContain(`"worker_id": "${lock.workerId}"`);
    expect(raw).toContain('"last_heartbeat": "2026-05-12T00:00:11.000Z"');

    await heartbeat.stop();
  });

  test("unrefs interval timer", async () => {
    const dir = await tempDir();
    await acquireWorkerLock(dir, { schemaVersion: 2 });
    const unref = vi.fn();
    const timer = { unref } as unknown as NodeJS.Timeout;
    const setIntervalFn = vi.fn(() => timer);
    const clearIntervalFn = vi.fn();

    const heartbeat = startWorkerLockHeartbeat(dir, {
      setIntervalFn,
      clearIntervalFn,
    });

    expect(unref).toHaveBeenCalledOnce();
    await heartbeat.stop();
    expect(clearIntervalFn).toHaveBeenCalledWith(timer);
  });

  test("stops renewing after serviceability grace expires", async () => {
    const dir = await tempDir();
    let now = new Date("2026-05-12T00:00:00.000Z");
    const lock = await acquireWorkerLock(dir, {
      pid: 3000,
      schemaVersion: 2,
      now: () => now,
    });

    const timer = { unref: vi.fn() } as unknown as NodeJS.Timeout;
    const heartbeat = startWorkerLockHeartbeat(dir, {
      intervalMs: 10_000,
      serviceabilityGraceMs: 20_000,
      now: () => now,
      isServiceable: () => false,
      setIntervalFn: vi.fn(() => timer),
      clearIntervalFn: vi.fn(),
    });

    now = new Date("2026-05-12T00:00:10.000Z");
    await heartbeat.beatNow();
    now = new Date("2026-05-12T00:00:31.000Z");
    await heartbeat.beatNow();

    await expect(readLockContents(lock.lockPath)).resolves.toMatchObject({
      last_heartbeat: "2026-05-12T00:00:10.000Z",
    });
    expect(heartbeat.isStopped()).toBe(true);
  });
});
