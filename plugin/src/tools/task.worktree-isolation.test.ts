import { describe, expect, test } from "vitest";

import {
  evaluateTaskAddWorktreeIsolation,
  evaluateTaskUpdateWorktreeIsolation,
} from "./task";

describe("evaluateTaskAddWorktreeIsolation", () => {
  test("blocks task add from main checkout when flag is enabled", () => {
    const result = evaluateTaskAddWorktreeIsolation({
      features: { worktree_guard_enforce: true },
      cwd: "/repo/main",
      getSessionContext: () => ({
        isWorktree: false,
        isMainCheckout: true,
        mainCheckoutPath: "/repo/main",
      }),
    });

    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeIsolationViolation",
      mainCheckoutPath: "/repo/main",
    });
  });

  test("allows task add from worktree", () => {
    expect(
      evaluateTaskAddWorktreeIsolation({
        features: { worktree_guard_enforce: true },
        cwd: "/repo/wt/change",
        getSessionContext: () => ({
          isWorktree: true,
          isMainCheckout: false,
          mainCheckoutPath: "/repo/main",
        }),
      }),
    ).toEqual({ decision: "ALLOW" });
  });

  test("allows task add when flag is disabled", () => {
    expect(
      evaluateTaskAddWorktreeIsolation({
        features: { worktree_guard_enforce: false },
        cwd: "/repo/main",
        getSessionContext: () => ({
          isWorktree: false,
          isMainCheckout: true,
          mainCheckoutPath: "/repo/main",
        }),
      }),
    ).toEqual({ decision: "ALLOW" });
  });
});

describe("evaluateTaskUpdateWorktreeIsolation", () => {
  test("blocks in_progress update from main checkout when flag is enabled", () => {
    const result = evaluateTaskUpdateWorktreeIsolation({
      status: "in_progress",
      features: { worktree_guard_enforce: true },
      cwd: "/repo/main",
      getSessionContext: () => ({
        isWorktree: false,
        isMainCheckout: true,
        mainCheckoutPath: "/repo/main",
      }),
    });

    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeIsolationViolation",
      mainCheckoutPath: "/repo/main",
    });
  });

  test("blocks done update from main checkout when flag is enabled", () => {
    const result = evaluateTaskUpdateWorktreeIsolation({
      status: "done",
      features: { worktree_guard_enforce: true },
      cwd: "/repo/main",
      getSessionContext: () => ({
        isWorktree: false,
        isMainCheckout: true,
        mainCheckoutPath: "/repo/main",
      }),
    });

    expect(result.decision).toBe("BLOCK");
  });

  test("blocks cancelled update from main checkout when flag is enabled", () => {
    const result = evaluateTaskUpdateWorktreeIsolation({
      status: "cancelled",
      features: { worktree_guard_enforce: true },
      cwd: "/repo/main",
      getSessionContext: () => ({
        isWorktree: false,
        isMainCheckout: true,
        mainCheckoutPath: "/repo/main",
      }),
    });

    expect(result.decision).toBe("BLOCK");
  });

  test("allows update from worktree", () => {
    expect(
      evaluateTaskUpdateWorktreeIsolation({
        status: "done",
        features: { worktree_guard_enforce: true },
        cwd: "/repo/wt/change",
        getSessionContext: () => ({
          isWorktree: true,
          isMainCheckout: false,
          mainCheckoutPath: "/repo/main",
        }),
      }),
    ).toEqual({ decision: "ALLOW" });
  });

  test("allows non-mutating status update from main checkout", () => {
    expect(
      evaluateTaskUpdateWorktreeIsolation({
        status: "pending",
        features: { worktree_guard_enforce: true },
        cwd: "/repo/main",
        getSessionContext: () => ({
          isWorktree: false,
          isMainCheckout: true,
          mainCheckoutPath: "/repo/main",
        }),
      }),
    ).toEqual({ decision: "ALLOW" });
  });

  test("allows mutating status update when flag is disabled", () => {
    expect(
      evaluateTaskUpdateWorktreeIsolation({
        status: "in_progress",
        features: { worktree_guard_enforce: false },
        cwd: "/repo/main",
        getSessionContext: () => ({
          isWorktree: false,
          isMainCheckout: true,
          mainCheckoutPath: "/repo/main",
        }),
      }),
    ).toEqual({ decision: "ALLOW" });
  });
});
