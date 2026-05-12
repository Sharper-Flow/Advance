import { describe, expect, test } from "vitest";

import { evaluateTaskAddWorktreeIsolation } from "./task";

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
