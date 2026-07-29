import { describe, expect, test } from "vitest";

import {
  FeatureFlagsSchema,
  ProjectConfigSchema,
  withStabilityFeatureDefaults,
  resolveProjectFeaturePolicy,
} from "./project";

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
      worker_singleton_enforce: false,
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

describe("resolveProjectFeaturePolicy", () => {
  test("classifies omitted values as default with correct booleans", () => {
    const policy = resolveProjectFeaturePolicy(undefined);
    expect(policy.worker_singleton_enforce).toEqual({
      value: false,
      source: "default",
    });
    expect(policy.worktree_guard_enforce).toEqual({
      value: true,
      source: "default",
    });
    expect(policy.workflowQueueMode).toBe("session");
  });

  test("classifies explicit values and derives project queue mode", () => {
    const policy = resolveProjectFeaturePolicy({
      worker_singleton_enforce: true,
      worktree_guard_enforce: false,
    });
    expect(policy.worker_singleton_enforce).toEqual({
      value: true,
      source: "explicit",
    });
    expect(policy.worktree_guard_enforce).toEqual({
      value: false,
      source: "explicit",
    });
    expect(policy.workflowQueueMode).toBe("project");
  });

  test("classifies invalid values as invalid_fallback", () => {
    const policy = resolveProjectFeaturePolicy({
      worker_singleton_enforce: "yes",
      worktree_guard_enforce: 1,
    });
    expect(policy.worker_singleton_enforce).toEqual({
      value: false,
      source: "invalid_fallback",
    });
    expect(policy.worktree_guard_enforce).toEqual({
      value: true,
      source: "invalid_fallback",
    });
    expect(policy.workflowQueueMode).toBe("session");
  });

  test("withStabilityFeatureDefaults consumes resolver values", () => {
    expect(
      withStabilityFeatureDefaults({ worker_singleton_enforce: "nope" }),
    ).toMatchObject({
      worker_singleton_enforce: false,
      worktree_guard_enforce: true,
    });
    expect(
      withStabilityFeatureDefaults({ worktree_guard_enforce: null }),
    ).toMatchObject({
      worker_singleton_enforce: false,
      worktree_guard_enforce: true,
    });
  });
});

describe("ProjectConfigSchema archive finalization defaults", () => {
  const baseConfig = {
    name: "advance-test",
  };

  test("defaults archive finalization to direct mode with auto-push enabled", () => {
    expect(ProjectConfigSchema.parse(baseConfig)).toMatchObject({
      archive_mode: "direct",
      auto_push: true,
    });
  });

  test("preserves PR-mode archive opt-out and auto-push override", () => {
    expect(
      ProjectConfigSchema.parse({
        ...baseConfig,
        archive_mode: "pr",
        auto_push: false,
      }),
    ).toMatchObject({
      archive_mode: "pr",
      auto_push: false,
    });
  });

  test("rejects unknown archive modes structurally", () => {
    expect(() =>
      ProjectConfigSchema.parse({
        ...baseConfig,
        archive_mode: "manual",
      }),
    ).toThrow();
  });
});

describe("ProjectConfigSchema archive.pr_title_policy", () => {
  const baseConfig = {
    name: "advance-test",
  };

  test("no archive field validates and defaults format to plain", () => {
    const parsed = ProjectConfigSchema.parse(baseConfig);
    expect(parsed.archive).toMatchObject({
      pr_title_policy: { format: "plain" },
    });
  });

  test("valid conventional pr_title_policy with type arrays validates", () => {
    const parsed = ProjectConfigSchema.parse({
      ...baseConfig,
      archive: {
        pr_title_policy: {
          format: "conventional",
          release_types: ["feat", "fix", "perf"],
          allowed_types: ["feat", "fix", "perf", "chore"],
        },
      },
    });
    expect(parsed.archive).toMatchObject({
      pr_title_policy: {
        format: "conventional",
        release_types: ["feat", "fix", "perf"],
        allowed_types: ["feat", "fix", "perf", "chore"],
      },
    });
  });

  test("rejects bogus pr_title_policy format", () => {
    expect(() =>
      ProjectConfigSchema.parse({
        ...baseConfig,
        archive: { pr_title_policy: { format: "bogus" } },
      }),
    ).toThrow();
  });

  test("explicit plain pr_title_policy validates", () => {
    const parsed = ProjectConfigSchema.parse({
      ...baseConfig,
      archive: { pr_title_policy: { format: "plain" } },
    });
    expect(parsed.archive).toMatchObject({
      pr_title_policy: { format: "plain" },
    });
  });

  test("rejects empty release_types array", () => {
    expect(() =>
      ProjectConfigSchema.parse({
        ...baseConfig,
        archive: {
          pr_title_policy: {
            format: "conventional",
            release_types: [],
            allowed_types: ["fix"],
          },
        },
      }),
    ).toThrow();
  });

  test("rejects empty allowed_types array", () => {
    expect(() =>
      ProjectConfigSchema.parse({
        ...baseConfig,
        archive: {
          pr_title_policy: {
            format: "conventional",
            release_types: ["fix"],
            allowed_types: [],
          },
        },
      }),
    ).toThrow();
  });
});
