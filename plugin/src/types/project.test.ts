import { describe, expect, test } from "vitest";

import { FeatureFlagsSchema, withStabilityFeatureDefaults } from "./project";

describe("FeatureFlagsSchema stability defaults", () => {
  // rq-autoManageAdvWorktrees AC2 — default flipped from false to true.
  // Explicit `false` continues to work as the legacy escape hatch.
  test("defaults worktree_guard_enforce to true when omitted", () => {
    expect(FeatureFlagsSchema.parse({})).toMatchObject({
      worktree_guard_enforce: true,
    });
  });

  test("preserves explicit worktree_guard_enforce values", () => {
    expect(
      FeatureFlagsSchema.parse({ worktree_guard_enforce: true }),
    ).toMatchObject({ worktree_guard_enforce: true });
    expect(
      FeatureFlagsSchema.parse({ worktree_guard_enforce: false }),
    ).toMatchObject({ worktree_guard_enforce: false });
  });

  test("shared stability defaults include worker singleton and worktree guard", () => {
    expect(withStabilityFeatureDefaults(undefined)).toMatchObject({
      worker_singleton_enforce: true,
      worktree_guard_enforce: true,
    });
    expect(
      withStabilityFeatureDefaults({
        worker_singleton_enforce: false,
        worktree_guard_enforce: false,
      }),
    ).toMatchObject({
      worker_singleton_enforce: false,
      worktree_guard_enforce: false,
    });
  });
});
