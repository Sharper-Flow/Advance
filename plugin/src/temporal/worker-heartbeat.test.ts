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

  test("heartbeat preserves bundle_generation", async () => {
    const dir = await tempDir();
    let now = new Date("2026-05-12T00:00:00.000Z");
    const lock = await acquireWorkerLock(dir, {
      pid: 4000,
      schemaVersion: 2,
      bundleGeneration: "gen-pinned",
      now: () => now,
    });

    const heartbeat = startWorkerLockHeartbeat(dir, { now: () => now });
    now = new Date("2026-05-12T00:00:12.000Z");
    await heartbeat.beatNow();

    await expect(readLockContents(lock.lockPath)).resolves.toMatchObject({
      pid: 4000,
      bundle_generation: "gen-pinned",
      last_heartbeat: "2026-05-12T00:00:12.000Z",
    });

    await heartbeat.stop();
  });

  test("invokes onBeat after each successful beat (fire-and-forget safe)", async () => {
    const dir = await tempDir();
    const now = new Date("2026-05-12T00:00:00.000Z");
    await acquireWorkerLock(dir, {
      pid: 5000,
      schemaVersion: 2,
      now: () => now,
    });

    const onBeat = vi.fn();
    const heartbeat = startWorkerLockHeartbeat(dir, {
      now: () => now,
      onBeat,
    });

    await heartbeat.beatNow();
    await heartbeat.beatNow();

    expect(onBeat).toHaveBeenCalledTimes(2);

    await heartbeat.stop();
  });

  test("does not invoke onBeat when the beat has no v2 lock to renew", async () => {
    const dir = await tempDir();
    const onBeat = vi.fn();
    const heartbeat = startWorkerLockHeartbeat(dir, { onBeat });

    await heartbeat.beatNow();

    expect(onBeat).not.toHaveBeenCalled();

    await heartbeat.stop();
  });

  test("writes a handed-off bundle_generation together with the heartbeat on every beat", async () => {
    const dir = await tempDir();
    let now = new Date("2026-05-12T00:00:00.000Z");
    const lock = await acquireWorkerLock(dir, {
      pid: 7000,
      schemaVersion: 2,
      expectedQueue: "adv-test-queue",
      bundleGeneration: "gen-old",
      now: () => now,
    });

    const heartbeat = startWorkerLockHeartbeat(dir, { now: () => now });
    // Roll handoff: the generation is applied at write time, not read
    // from the beat's lock snapshot.
    heartbeat.setBundleGeneration("gen-new");

    now = new Date("2026-05-12T00:00:10.000Z");
    await heartbeat.beatNow();

    await expect(readLockContents(lock.lockPath)).resolves.toMatchObject({
      pid: 7000,
      expected_queue: "adv-test-queue",
      bundle_generation: "gen-new",
      last_heartbeat: "2026-05-12T00:00:10.000Z",
    });

    // The override persists: later beats keep stamping it alongside the
    // renewed heartbeat.
    now = new Date("2026-05-12T00:00:20.000Z");
    await heartbeat.beatNow();

    await expect(readLockContents(lock.lockPath)).resolves.toMatchObject({
      bundle_generation: "gen-new",
      last_heartbeat: "2026-05-12T00:00:20.000Z",
    });

    await heartbeat.stop();
  });

  test("a generation handed off mid-beat is not lost to the beat's stale snapshot", async () => {
    const dir = await tempDir();
    let now = new Date("2026-05-12T00:00:00.000Z");
    const lock = await acquireWorkerLock(dir, {
      pid: 6000,
      schemaVersion: 2,
      bundleGeneration: "gen-old",
      now: () => now,
    });

    // Park the beat inside its read-modify-write window: the lock read
    // has resolved (snapshot holds gen-old), the rewrite has not run.
    let releaseRead!: () => void;
    let readReached!: () => void;
    const readParked = new Promise<void>((resolve) => (readReached = resolve));
    const readGate = new Promise<void>((resolve) => (releaseRead = resolve));
    const heartbeat = startWorkerLockHeartbeat(dir, {
      now: () => now,
      onBeatLockRead: async () => {
        readReached();
        await readGate;
      },
    });

    now = new Date("2026-05-12T00:00:10.000Z");
    const beat = heartbeat.beatNow();
    await readParked;

    // The roll hands the new generation to the heartbeat (the sole lock
    // writer) while the beat is parked on a stale snapshot.
    heartbeat.setBundleGeneration("gen-new");
    releaseRead();
    await beat;

    // AC5: the handed-off generation is applied at write time, so the
    // interleaved beat cannot lose it.
    await expect(readLockContents(lock.lockPath)).resolves.toMatchObject({
      bundle_generation: "gen-new",
      last_heartbeat: "2026-05-12T00:00:10.000Z",
    });

    await heartbeat.stop();
  });

  test("stamps a handed-off bundle generation immediately without waiting for the next beat", async () => {
    const dir = await tempDir();
    const now = new Date("2026-05-12T00:00:00.000Z");
    const lock = await acquireWorkerLock(dir, {
      pid: 8000,
      schemaVersion: 2,
      bundleGeneration: "gen-old",
      now: () => now,
    });

    const heartbeat = startWorkerLockHeartbeat(dir, { now: () => now });
    await heartbeat.stampBundleGeneration("gen-new");

    await expect(readLockContents(lock.lockPath)).resolves.toMatchObject({
      pid: 8000,
      bundle_generation: "gen-new",
      last_heartbeat: now.toISOString(),
    });

    await heartbeat.stop();
  });

  test("stamping a generation sets the override so subsequent beats keep it", async () => {
    const dir = await tempDir();
    let now = new Date("2026-05-12T00:00:00.000Z");
    const lock = await acquireWorkerLock(dir, {
      pid: 8100,
      schemaVersion: 2,
      bundleGeneration: "gen-old",
      now: () => now,
    });

    const heartbeat = startWorkerLockHeartbeat(dir, { now: () => now });
    await heartbeat.stampBundleGeneration("gen-new");

    now = new Date("2026-05-12T00:00:10.000Z");
    await heartbeat.beatNow();

    await expect(readLockContents(lock.lockPath)).resolves.toMatchObject({
      pid: 8100,
      bundle_generation: "gen-new",
      last_heartbeat: "2026-05-12T00:00:10.000Z",
    });

    await heartbeat.stop();
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
