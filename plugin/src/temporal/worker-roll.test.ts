import { writeFile } from "fs/promises";
import { join } from "path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import { acquireWorkerLock, readLockContents } from "./worker-lock";
import { writeWorkerBundleManifest } from "./worker-bundle-manifest";
import { startWorkerLockHeartbeat } from "./worker-heartbeat";
import {
  createWorkerBundleRollMonitor,
  initWorkerBundleRoll,
} from "./worker-roll";

const NOW = new Date("2026-07-15T00:00:00.000Z");

describe("worker bundle roll monitor", () => {
  let tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => cleanupTempDir(dir)));
    tempDirs = [];
  });

  const tempDir = async (prefix: string) => {
    const dir = await createTempDir(prefix);
    tempDirs.push(dir);
    return dir;
  };

  /**
   * Fixture: a project state dir holding worker.lock and a bundle dir
   * holding worker.js + workflows.js + the generation manifest.
   */
  const setup = async (options: {
    lockGeneration?: string;
    lockMatchesManifest?: boolean;
    lockPid?: number;
    withManifest?: boolean;
  }) => {
    const stateDir = await tempDir("worker-roll-state-");
    const bundleDir = await tempDir("worker-roll-bundle-");

    let manifestGeneration: string | null = null;
    if (options.withManifest !== false) {
      await writeFile(join(bundleDir, "worker.js"), "// worker v1\n");
      await writeFile(join(bundleDir, "workflows.js"), "// workflows v1\n");
      const manifest = await writeWorkerBundleManifest(bundleDir, {
        now: () => NOW,
      });
      manifestGeneration = manifest.generation;
    }

    const lockGeneration = options.lockMatchesManifest
      ? (manifestGeneration ?? undefined)
      : (options.lockGeneration ?? "gen-stale");
    const lock = await acquireWorkerLock(stateDir, {
      pid: options.lockPid ?? process.pid,
      schemaVersion: 2,
      expectedQueue: "adv-test-queue",
      bundleGeneration: lockGeneration,
      now: () => NOW,
    });

    return { stateDir, bundleDir, manifestGeneration, lockPath: lock.lockPath };
  };

  test("drift between manifest and lock generation triggers exactly one restart and hands the new generation to the heartbeat", async () => {
    const { stateDir, bundleDir, manifestGeneration, lockPath } = await setup({
      lockGeneration: "gen-stale",
    });
    const restartChild = vi.fn(async () => {});
    const setBundleGeneration = vi.fn();

    const monitor = createWorkerBundleRollMonitor({
      projectStateDir: stateDir,
      bundleDir,
      restartChild,
      setBundleGeneration,
    });

    const result = await monitor.checkNow();

    expect(result).toEqual({ rolled: true, generation: manifestGeneration });
    expect(restartChild).toHaveBeenCalledTimes(1);
    expect(setBundleGeneration).toHaveBeenCalledTimes(1);
    expect(setBundleGeneration).toHaveBeenCalledWith(manifestGeneration);
    // The monitor NEVER writes the lock itself — the heartbeat (sole
    // lock writer) stamps the handed-off generation on its next beat.
    await expect(readLockContents(lockPath)).resolves.toMatchObject({
      bundle_generation: "gen-stale",
    });
    expect(monitor.lastRolledGeneration()).toBe(manifestGeneration);
  });

  test("same generation is a no-op", async () => {
    const { stateDir, bundleDir } = await setup({ lockMatchesManifest: true });
    const restartChild = vi.fn(async () => {});

    const monitor = createWorkerBundleRollMonitor({
      projectStateDir: stateDir,
      bundleDir,
      restartChild,
    });

    const result = await monitor.checkNow();

    expect(result).toEqual({ rolled: false, reason: "same_generation" });
    expect(restartChild).not.toHaveBeenCalled();
  });

  test("concurrent checks single-flight: one restart for two overlapping beats", async () => {
    const { stateDir, bundleDir } = await setup({});
    let releaseRoll!: () => void;
    const restartChild = vi.fn(
      () => new Promise<void>((resolve) => (releaseRoll = resolve)),
    );

    const monitor = createWorkerBundleRollMonitor({
      projectStateDir: stateDir,
      bundleDir,
      restartChild,
    });

    const first = monitor.checkNow();
    const second = monitor.checkNow();

    // Let both calls run into the latch.
    await new Promise((r) => setTimeout(r, 20));
    releaseRoll();

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(restartChild).toHaveBeenCalledTimes(1);
    const rolledCount = [firstResult, secondResult].filter(
      (r) => r.rolled,
    ).length;
    const latchedCount = [firstResult, secondResult].filter(
      (r) => !r.rolled && r.reason === "roll_in_flight",
    ).length;
    expect(rolledCount).toBe(1);
    expect(latchedCount).toBe(1);
  });

  test("the generation is handed to the heartbeat only AFTER the replacement child is ready", async () => {
    const { stateDir, bundleDir, manifestGeneration } = await setup({
      lockGeneration: "gen-stale",
    });

    const handed: string[] = [];
    let handedDuringRoll: string[] = [];
    const restartChild = vi.fn(async () => {
      // Readiness gate: while the roll is executing, no generation may
      // have been handed off yet — the handoff happens after resolve.
      handedDuringRoll = [...handed];
    });

    const monitor = createWorkerBundleRollMonitor({
      projectStateDir: stateDir,
      bundleDir,
      restartChild,
      setBundleGeneration: (generation) => handed.push(generation),
    });

    await monitor.checkNow();

    expect(handedDuringRoll).toEqual([]);
    expect(handed).toEqual([manifestGeneration]);
  });

  test("a failed roll leaves the recorded generation untouched and the next check retries", async () => {
    const { stateDir, bundleDir, manifestGeneration, lockPath } = await setup({
      lockGeneration: "gen-stale",
    });
    const onRollError = vi.fn();
    const setBundleGeneration = vi.fn();
    const restartChild = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("child never became ready"))
      .mockResolvedValueOnce(undefined);

    const monitor = createWorkerBundleRollMonitor({
      projectStateDir: stateDir,
      bundleDir,
      restartChild,
      setBundleGeneration,
      onRollError,
    });

    const failed = await monitor.checkNow();

    expect(failed).toMatchObject({ rolled: false, reason: "roll_failed" });
    expect(onRollError).toHaveBeenCalledTimes(1);
    // No handoff — the child never became ready, so neither the
    // in-memory generation nor the lock may claim the new generation.
    expect(setBundleGeneration).not.toHaveBeenCalled();
    await expect(readLockContents(lockPath)).resolves.toMatchObject({
      bundle_generation: "gen-stale",
    });
    expect(monitor.lastRolledGeneration()).toBeNull();

    // Latch released: the next beat retries the roll.
    const retried = await monitor.checkNow();
    expect(restartChild).toHaveBeenCalledTimes(2);
    expect(retried).toEqual({ rolled: true, generation: manifestGeneration });
    expect(setBundleGeneration).toHaveBeenCalledWith(manifestGeneration);
  });

  test("does not roll when the lock is held by a different pid (owner-driven only)", async () => {
    const { stateDir, bundleDir } = await setup({ lockPid: 999_999 });
    const restartChild = vi.fn(async () => {});

    const monitor = createWorkerBundleRollMonitor({
      projectStateDir: stateDir,
      bundleDir,
      restartChild,
    });

    const result = await monitor.checkNow();

    expect(result).toEqual({ rolled: false, reason: "not_lock_owner" });
    expect(restartChild).not.toHaveBeenCalled();
  });

  test("does not roll when the manifest is missing", async () => {
    const { stateDir, bundleDir } = await setup({ withManifest: false });
    const restartChild = vi.fn(async () => {});

    const monitor = createWorkerBundleRollMonitor({
      projectStateDir: stateDir,
      bundleDir,
      restartChild,
    });

    const result = await monitor.checkNow();

    expect(result).toEqual({ rolled: false, reason: "manifest_unavailable" });
    expect(restartChild).not.toHaveBeenCalled();
  });

  test("does not roll when the lock is missing or not v2", async () => {
    const stateDir = await tempDir("worker-roll-nolock-");
    const bundleDir = await tempDir("worker-roll-nolock-bundle-");
    await writeFile(join(bundleDir, "worker.js"), "// worker\n");
    await writeFile(join(bundleDir, "workflows.js"), "// workflows\n");
    await writeWorkerBundleManifest(bundleDir);
    const restartChild = vi.fn(async () => {});

    const monitor = createWorkerBundleRollMonitor({
      projectStateDir: stateDir,
      bundleDir,
      restartChild,
    });

    const result = await monitor.checkNow();

    expect(result).toEqual({ rolled: false, reason: "lock_unavailable" });
    expect(restartChild).not.toHaveBeenCalled();
  });

  test("single-writer flow: a lagging lock stamp cannot trigger a re-roll", async () => {
    const { stateDir, bundleDir, manifestGeneration, lockPath } = await setup({
      lockGeneration: "gen-stale",
    });
    const restartChild = vi.fn(async () => {});
    const heartbeat = startWorkerLockHeartbeat(stateDir, { now: () => NOW });

    const monitor = createWorkerBundleRollMonitor({
      projectStateDir: stateDir,
      bundleDir,
      restartChild,
      setBundleGeneration: (generation) =>
        heartbeat.setBundleGeneration(generation),
    });

    const rolled = await monitor.checkNow();
    expect(rolled).toEqual({ rolled: true, generation: manifestGeneration });

    // The lock still shows the stale generation — the heartbeat has not
    // beaten since the handoff. The in-memory generation is
    // authoritative, so an immediate re-check is a no-op (AC5).
    await expect(readLockContents(lockPath)).resolves.toMatchObject({
      bundle_generation: "gen-stale",
    });
    await expect(monitor.checkNow()).resolves.toEqual({
      rolled: false,
      reason: "same_generation",
    });
    expect(restartChild).toHaveBeenCalledTimes(1);

    // The heartbeat stamps the handed-off generation together with the
    // next beat — one writer, no lost update.
    await heartbeat.beatNow();
    await expect(readLockContents(lockPath)).resolves.toMatchObject({
      bundle_generation: manifestGeneration,
      last_heartbeat: NOW.toISOString(),
    });

    await heartbeat.stop();
  });

  test("a successful roll stamps the generation immediately via the heartbeat stamp path", async () => {
    const { stateDir, bundleDir, manifestGeneration, lockPath } = await setup({
      lockGeneration: "gen-stale",
    });
    const restartChild = vi.fn(async () => {});
    const heartbeat = startWorkerLockHeartbeat(stateDir, { now: () => NOW });

    const monitor = createWorkerBundleRollMonitor({
      projectStateDir: stateDir,
      bundleDir,
      restartChild,
      stampBundleGeneration: (generation) =>
        heartbeat.stampBundleGeneration(generation),
    });

    const result = await monitor.checkNow();

    expect(result).toEqual({ rolled: true, generation: manifestGeneration });
    // The heartbeat is the sole writer: the generation is stamped
    // immediately after the replacement child is ready, not on the next beat.
    await expect(readLockContents(lockPath)).resolves.toMatchObject({
      bundle_generation: manifestGeneration,
      last_heartbeat: NOW.toISOString(),
    });

    await heartbeat.stop();
  });

  test("initWorkerBundleRoll stamps the current generation immediately after readiness and converges the monitor", async () => {
    const { stateDir, bundleDir, manifestGeneration, lockPath } = await setup({
      lockGeneration: "gen-stale",
    });
    const restartChild = vi.fn(async () => {});
    const heartbeat = startWorkerLockHeartbeat(stateDir, { now: () => NOW });

    // The worker child was JUST spawned from the current bundle (ready
    // handshake already resolved) — hand the generation to the heartbeat
    // and stamp it without rolling.
    const monitor = await initWorkerBundleRoll({
      projectStateDir: stateDir,
      bundleDir,
      restartChild,
      stampBundleGeneration: (generation) =>
        heartbeat.stampBundleGeneration(generation),
    });

    expect(restartChild).not.toHaveBeenCalled();
    // The heartbeat stamps the handed-off generation right after the child
    // passes its ready handshake — no waiting for the next scheduled beat.
    await expect(readLockContents(lockPath)).resolves.toMatchObject({
      bundle_generation: manifestGeneration,
      last_heartbeat: NOW.toISOString(),
    });

    // Converged: subsequent beats are same-generation no-ops.
    const result = await monitor.checkNow();
    expect(result).toEqual({ rolled: false, reason: "same_generation" });
    expect(restartChild).not.toHaveBeenCalled();

    await heartbeat.stop();
  });
});
