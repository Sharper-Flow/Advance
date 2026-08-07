import { describe, expect, test } from "vitest";

import { evaluateGateWorktreeIsolation } from "./tools/gate";
import {
  evaluateTaskAddWorktreeIsolation,
  evaluateTaskUpdateWorktreeIsolation,
} from "./tools/task";
import { createProbeCache } from "./tools/probe-cache";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("ADV stability hardening cross-cutting verification", () => {
  test("worktree guard blocks main-checkout mutations but allows worktrees and exemptions", async () => {
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

    await expect(
      evaluateGateWorktreeIsolation({
        gateId: "execution",
        features: { worktree_guard_enforce: true },
        cwd: "/repo/main",
        getSessionContext: mainContext,
      }),
    ).resolves.toMatchObject({
      decision: "BLOCK",
      mainCheckoutPath: "/repo/main",
    });
    await expect(
      evaluateGateWorktreeIsolation({
        gateId: "proposal",
        features: { worktree_guard_enforce: true },
        cwd: "/repo/main",
        getSessionContext: mainContext,
      }),
    ).resolves.toEqual({ decision: "ALLOW" });
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
