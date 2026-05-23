import { describe, expect, test } from "vitest";

import { checkWorktreeIsolation } from "./worktree-isolation-guard";
import type { GitSessionContext } from "../utils/git-session";

describe("checkWorktreeIsolation", () => {
  const mainCheckout: GitSessionContext = {
    isWorktree: false,
    isMainCheckout: true,
    mainCheckoutPath: "/repo/main",
  };

  const worktree: GitSessionContext = {
    isWorktree: true,
    isMainCheckout: false,
    mainCheckoutPath: "/repo/main",
  };

  test("blocks ADV mutations from main checkout", () => {
    const result = checkWorktreeIsolation("/repo/main", {
      getSessionContext: () => mainCheckout,
    });

    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeIsolationViolation",
      mainCheckoutPath: "/repo/main",
      remediation:
        "Resume or create the ADV worktree with adv_worktree_resume / adv_worktree_create, switch the session or tool workdir to the returned path, then retry from inside that worktree.",
    });
    expect(result.remediation).not.toContain("adv_gate_complete");
    expect(result.reason).toContain("main checkout");
  });

  test("allows ADV mutations from worktrees", () => {
    expect(
      checkWorktreeIsolation("/repo/wt/change", {
        getSessionContext: () => worktree,
      }),
    ).toEqual({ decision: "ALLOW" });
  });

  test("allows when git context cannot be resolved", () => {
    expect(
      checkWorktreeIsolation("/not-git", {
        getSessionContext: () => ({
          isWorktree: false,
          isMainCheckout: false,
        }),
      }),
    ).toEqual({ decision: "ALLOW" });
  });
});
