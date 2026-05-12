import { afterEach, describe, expect, test } from "vitest";

import { cleanupTempDir, createTempDir } from "./__tests__/setup";
import { resolveWorkerSingletonPlan } from "./plugin-init";
import { evaluateGateWorktreeIsolation } from "./tools/gate";
import {
  evaluateTaskAddWorktreeIsolation,
  evaluateTaskUpdateWorktreeIsolation,
} from "./tools/task";
import { createProbeCache } from "./tools/probe-cache";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("ADV stability hardening cross-cutting verification", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => cleanupTempDir(dir)));
    tempDirs.length = 0;
  });

  async function tempDir(): Promise<string> {
    const dir = await createTempDir("adv-stability-crosscut-");
    tempDirs.push(dir);
    return dir;
  }

  test("worker singleton elects one host, client-only peers, and reclaim paths", async () => {
    const sharedState = await tempDir();
    const now = new Date("2026-05-12T00:00:00.000Z");

    const first = await resolveWorkerSingletonPlan({
      projectStateDir: sharedState,
      expectedQueue: "adv-test-queue",
      workerSingletonEnforce: true,
      pid: 1001,
      now: () => now,
    });
    const second = await resolveWorkerSingletonPlan({
      projectStateDir: sharedState,
      expectedQueue: "adv-test-queue",
      workerSingletonEnforce: true,
      pid: 1002,
      now: () => now,
      isPidAlive: () => true,
    });
    const third = await resolveWorkerSingletonPlan({
      projectStateDir: sharedState,
      expectedQueue: "adv-test-queue",
      workerSingletonEnforce: true,
      pid: 1003,
      now: () => now,
      isPidAlive: () => true,
    });

    expect([first.workerRole, second.workerRole, third.workerRole]).toEqual([
      "host",
      "client",
      "client",
    ]);
    expect([
      first.shouldSpawnWorker,
      second.shouldSpawnWorker,
      third.shouldSpawnWorker,
    ]).toEqual([true, false, false]);

    const deadPidState = await tempDir();
    await resolveWorkerSingletonPlan({
      projectStateDir: deadPidState,
      expectedQueue: "adv-test-queue",
      workerSingletonEnforce: true,
      pid: 2001,
      now: () => now,
    });
    await expect(
      resolveWorkerSingletonPlan({
        projectStateDir: deadPidState,
        expectedQueue: "adv-test-queue",
        workerSingletonEnforce: true,
        pid: 2002,
        now: () => now,
        isPidAlive: () => false,
      }),
    ).resolves.toMatchObject({ shouldSpawnWorker: true, workerRole: "host" });

    const staleHeartbeatState = await tempDir();
    await resolveWorkerSingletonPlan({
      projectStateDir: staleHeartbeatState,
      expectedQueue: "adv-test-queue",
      workerSingletonEnforce: true,
      pid: 3001,
      now: () => now,
    });
    await expect(
      resolveWorkerSingletonPlan({
        projectStateDir: staleHeartbeatState,
        expectedQueue: "adv-test-queue",
        workerSingletonEnforce: true,
        pid: 3002,
        now: () => new Date(now.getTime() + 120_000),
        isPidAlive: () => true,
        staleHeartbeatGraceMs: 1,
      }),
    ).resolves.toMatchObject({ shouldSpawnWorker: true, workerRole: "host" });
  });

  test("worktree guard blocks main-checkout mutations but allows worktrees and exemptions", () => {
    const mainContext = () => ({
      isWorktree: false,
      isMainCheckout: true,
      mainCheckoutPath: "/repo/main",
    });
    const worktreeContext = () => ({
      isWorktree: true,
      isMainCheckout: false,
      mainCheckoutPath: "/repo/main",
    });

    expect(
      evaluateGateWorktreeIsolation({
        gateId: "execution",
        features: { worktree_guard_enforce: true },
        cwd: "/repo/main",
        getSessionContext: mainContext,
      }),
    ).toMatchObject({ decision: "BLOCK", mainCheckoutPath: "/repo/main" });
    expect(
      evaluateGateWorktreeIsolation({
        gateId: "proposal",
        features: { worktree_guard_enforce: true },
        cwd: "/repo/main",
        getSessionContext: mainContext,
      }),
    ).toEqual({ decision: "ALLOW" });
    expect(
      evaluateTaskAddWorktreeIsolation({
        features: { worktree_guard_enforce: true },
        cwd: "/repo/main",
        getSessionContext: mainContext,
      }),
    ).toMatchObject({ decision: "BLOCK", mainCheckoutPath: "/repo/main" });
    expect(
      evaluateTaskUpdateWorktreeIsolation({
        status: "done",
        features: { worktree_guard_enforce: true },
        cwd: "/repo/wt/change",
        getSessionContext: worktreeContext,
      }),
    ).toEqual({ decision: "ALLOW" });
  });

  test("probe cache coalesces concurrent status-style probes under latency budget", async () => {
    let calls = 0;
    const cache = createProbeCache<number>({
      name: "crosscut-status-probe",
      ttlMs: 1_000,
      fetch: async () => {
        calls += 1;
        await sleep(5);
        return 99;
      },
    });

    const started = Date.now();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => cache.fetch("health")),
    );
    const elapsedMs = Date.now() - started;

    expect(calls).toBe(1);
    expect(results.map((result) => result.value)).toEqual(Array(20).fill(99));
    expect(results.every((result) => result.freshness.stale === false)).toBe(
      true,
    );
    expect(elapsedMs).toBeLessThan(500);
  });
});
