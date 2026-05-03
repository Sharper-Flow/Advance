/**
 * Merge-Order Validator Tests
 *
 * TDD inline: red → green for computeMergeOrder.
 */

import { describe, test, expect, vi } from "vitest";
import {
  computeMergeOrder,
  type MergeOrderResult,
  type MergeOrderDeps,
} from "./merge-order";

// =============================================================================
// Tests 1-5 use injected deps (no Temporal I/O)
// =============================================================================

describe("computeMergeOrder with injected deps", () => {
  test("independent changes — disjoint touched_files, no dependencies", async () => {
    const deps: MergeOrderDeps = {
      changeSummaries: {
        "chg-a": {
          status: "archived",
          touched_files: ["src/foo.ts"],
          archived_at: "2024-01-01T00:00:00Z",
        },
        "chg-b": {
          status: "archived",
          touched_files: ["src/bar.ts"],
          archived_at: "2024-01-02T00:00:00Z",
        },
      },
    };

    const result = await computeMergeOrder("/project", deps);

    expect(result.unavailable).toBeUndefined();
    expect(result.queue).toHaveLength(2);
    expect(result.cycles).toBeUndefined();

    // Both should have empty dependsOn.
    for (const entry of result.queue) {
      expect(entry.dependsOn).toHaveLength(0);
    }

    // A archived first, so it should appear first.
    expect(result.queue[0].changeId).toBe("chg-a");
    expect(result.queue[1].changeId).toBe("chg-b");
  });

  test("dependent chain — later change depends on earlier overlapping one", async () => {
    const deps: MergeOrderDeps = {
      changeSummaries: {
        "chg-a": {
          status: "archived",
          touched_files: ["src/file1.ts"],
          archived_at: "2024-01-01T00:00:00Z",
        },
        "chg-b": {
          status: "archived",
          touched_files: ["src/file1.ts", "src/file2.ts"],
          archived_at: "2024-01-02T00:00:00Z",
        },
      },
    };

    const result = await computeMergeOrder("/project", deps);

    expect(result.unavailable).toBeUndefined();
    expect(result.queue).toHaveLength(2);
    expect(result.cycles).toBeUndefined();

    // A archived first, should be first in queue.
    expect(result.queue[0].changeId).toBe("chg-a");
    expect(result.queue[0].dependsOn).toHaveLength(0);

    // B depends on A because they share file1.ts.
    expect(result.queue[1].changeId).toBe("chg-b");
    expect(result.queue[1].dependsOn).toContain("chg-a");
  });

  test("empty — no archived entries returns empty queue", async () => {
    const deps: MergeOrderDeps = {
      changeSummaries: {
        "chg-a": {
          status: "active",
          touched_files: ["src/foo.ts"],
          archived_at: "2024-01-01T00:00:00Z",
        },
        "chg-b": {
          status: "draft",
          touched_files: ["src/bar.ts"],
        },
      },
    };

    const result = await computeMergeOrder("/project", deps);

    expect(result).toEqual({ queue: [] } as MergeOrderResult);
  });

  test("3-way diamond — valid topological order with multiple dependencies", async () => {
    const deps: MergeOrderDeps = {
      changeSummaries: {
        "chg-a": {
          status: "archived",
          touched_files: ["src/core.ts"],
          archived_at: "2024-01-01T00:00:00Z",
        },
        "chg-b": {
          status: "archived",
          touched_files: ["src/core.ts", "src/feature-b.ts"],
          archived_at: "2024-01-02T00:00:00Z",
        },
        "chg-c": {
          status: "archived",
          touched_files: ["src/core.ts", "src/feature-c.ts"],
          archived_at: "2024-01-03T00:00:00Z",
        },
      },
    };

    const result = await computeMergeOrder("/project", deps);

    expect(result.unavailable).toBeUndefined();
    expect(result.queue).toHaveLength(3);
    expect(result.cycles).toBeUndefined();

    // A is first (no dependencies).
    expect(result.queue[0].changeId).toBe("chg-a");
    expect(result.queue[0].dependsOn).toHaveLength(0);

    // B and C both depend on A.
    const bEntry = result.queue.find((e) => e.changeId === "chg-b")!;
    const cEntry = result.queue.find((e) => e.changeId === "chg-c")!;

    expect(bEntry.dependsOn).toContain("chg-a");
    expect(cEntry.dependsOn).toContain("chg-a");

    // C also depends on B because both touch src/core.ts (B archived earlier).
    expect(cEntry.dependsOn).toContain("chg-b");
    // B does not depend on C (C archived later).
    expect(bEntry.dependsOn).not.toContain("chg-c");

    // Topological constraint: A must come before B and C.
    const aIndex = result.queue.findIndex((e) => e.changeId === "chg-a");
    const bIndex = result.queue.findIndex((e) => e.changeId === "chg-b");
    const cIndex = result.queue.findIndex((e) => e.changeId === "chg-c");

    expect(aIndex).toBeLessThan(bIndex);
    expect(aIndex).toBeLessThan(cIndex);
  });

  test("filters out non-archived entries", async () => {
    const deps: MergeOrderDeps = {
      changeSummaries: {
        "chg-archived": {
          status: "archived",
          touched_files: ["src/foo.ts"],
          archived_at: "2024-01-01T00:00:00Z",
        },
        "chg-active": {
          status: "active",
          touched_files: ["src/foo.ts"],
          archived_at: "2024-01-02T00:00:00Z",
        },
        "chg-closed": {
          status: "closed",
          touched_files: ["src/foo.ts"],
        },
      },
    };

    const result = await computeMergeOrder("/project", deps);

    expect(result.queue).toHaveLength(1);
    expect(result.queue[0].changeId).toBe("chg-archived");
  });

  test("uses branch from summary or falls back to change/ prefix", async () => {
    const deps: MergeOrderDeps = {
      changeSummaries: {
        "chg-with-branch": {
          status: "archived",
          branch: "custom/branch-name",
          touched_files: ["src/foo.ts"],
          archived_at: "2024-01-01T00:00:00Z",
        },
        "chg-no-branch": {
          status: "archived",
          touched_files: ["src/bar.ts"],
          archived_at: "2024-01-02T00:00:00Z",
        },
      },
    };

    const result = await computeMergeOrder("/project", deps);

    const withBranch = result.queue.find(
      (e) => e.changeId === "chg-with-branch",
    )!;
    const noBranch = result.queue.find(
      (e) => e.changeId === "chg-no-branch",
    )!;

    expect(withBranch.branch).toBe("custom/branch-name");
    expect(noBranch.branch).toBe("change/chg-no-branch");
  });
});

// =============================================================================
// Test 6: Unavailable workflow (production path, mocked)
// =============================================================================

vi.mock("../tools/worktree/state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../tools/worktree/state")>();
  return {
    ...actual,
    initStateDb: vi.fn(async () => {
      throw new Error("workflow unreachable");
    }),
  };
});

describe("computeMergeOrder production path fallback", () => {
  test("returns unavailable when initStateDb throws", async () => {
    const result = await computeMergeOrder("/project");

    expect(result.unavailable).toBe(true);
    expect(result.queue).toHaveLength(0);
  });
});
