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
        "Create or resume an ADV worktree (adv_worktree_create / adv_worktree_resume) and retry from inside the worktree.",
    });
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
