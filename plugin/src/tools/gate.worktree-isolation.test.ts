import { describe, expect, test } from "vitest";

import { evaluateGateWorktreeIsolation } from "./gate";

describe("evaluateGateWorktreeIsolation", () => {
  test("blocks non-proposal gates from main checkout when flag is enabled", () => {
    const result = evaluateGateWorktreeIsolation({
      gateId: "discovery",
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

  test("keeps proposal gate exempt", () => {
    expect(
      evaluateGateWorktreeIsolation({
        gateId: "proposal",
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

  test("allows when flag is disabled", () => {
    expect(
      evaluateGateWorktreeIsolation({
        gateId: "execution",
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
