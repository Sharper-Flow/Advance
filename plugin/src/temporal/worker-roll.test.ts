import { writeFile } from "fs/promises";
import { join } from "path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import { acquireWorkerLock, readLockContents } from "./worker-lock";
import { writeWorkerBundleManifest } from "./worker-bundle-manifest";
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

  test("drift between manifest and lock generation triggers exactly one restart and stamps the lock", async () => {
    const { stateDir, bundleDir, manifestGeneration, lockPath } = await setup({
      lockGeneration: "gen-stale",
    });
    const restartChild = vi.fn(async () => {});

    const monitor = createWorkerBundleRollMonitor({
      projectStateDir: stateDir,
      bundleDir,
      restartChild,
    });

    const result = await monitor.checkNow();

    expect(result).toEqual({
      rolled: true,
      generation: manifestGeneration,
      lockUpdated: true,
    });
    expect(restartChild).toHaveBeenCalledTimes(1);
    await expect(readLockContents(lockPath)).resolves.toMatchObject({
      bundle_generation: manifestGeneration,
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

  test("lock generation is stamped only AFTER the replacement child is ready", async () => {
    const { stateDir, bundleDir, manifestGeneration, lockPath } = await setup({
      lockGeneration: "gen-stale",
    });

    let generationDuringRoll: string | null = null;
    const restartChild = vi.fn(async () => {
      // Readiness gate: while the roll is executing, the lock must still
      // show the OLD generation — the stamp happens after resolve.
      const contents = await readLockContents(lockPath);
      generationDuringRoll =
        contents?.schema_version === 2
          ? (contents.bundle_generation ?? null)
          : null;
    });

    const monitor = createWorkerBundleRollMonitor({
      projectStateDir: stateDir,
      bundleDir,
      restartChild,
    });

    await monitor.checkNow();

    expect(generationDuringRoll).toBe("gen-stale");
    await expect(readLockContents(lockPath)).resolves.toMatchObject({
      bundle_generation: manifestGeneration,
    });
  });

  test("a failed roll leaves the lock generation untouched and the next check retries", async () => {
    const { stateDir, bundleDir, manifestGeneration, lockPath } = await setup({
      lockGeneration: "gen-stale",
    });
    const onRollError = vi.fn();
    const restartChild = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("child never became ready"))
      .mockResolvedValueOnce(undefined);

    const monitor = createWorkerBundleRollMonitor({
      projectStateDir: stateDir,
      bundleDir,
      restartChild,
      onRollError,
    });

    const failed = await monitor.checkNow();

    expect(failed).toMatchObject({ rolled: false, reason: "roll_failed" });
    expect(onRollError).toHaveBeenCalledTimes(1);
    // Lock NOT stamped — the child never became ready.
    await expect(readLockContents(lockPath)).resolves.toMatchObject({
      bundle_generation: "gen-stale",
    });
    expect(monitor.lastRolledGeneration()).toBeNull();

    // Latch released: the next beat retries the roll.
    const retried = await monitor.checkNow();
    expect(restartChild).toHaveBeenCalledTimes(2);
    expect(retried).toEqual({
      rolled: true,
      generation: manifestGeneration,
      lockUpdated: true,
    });
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

  test("initWorkerBundleRoll stamps the current generation post-readiness and converges the monitor", async () => {
    const { stateDir, bundleDir, manifestGeneration, lockPath } = await setup({
      lockGeneration: "gen-stale",
    });
    const restartChild = vi.fn(async () => {});

    // The worker child was JUST spawned from the current bundle (ready
    // handshake already resolved) — stamp the lock without rolling.
    const monitor = await initWorkerBundleRoll({
      projectStateDir: stateDir,
      bundleDir,
      restartChild,
    });

    expect(restartChild).not.toHaveBeenCalled();
    await expect(readLockContents(lockPath)).resolves.toMatchObject({
      bundle_generation: manifestGeneration,
    });

    // Converged: subsequent beats are same-generation no-ops.
    const result = await monitor.checkNow();
    expect(result).toEqual({ rolled: false, reason: "same_generation" });
    expect(restartChild).not.toHaveBeenCalled();
  });
});
