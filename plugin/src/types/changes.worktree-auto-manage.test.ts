/**
 * ChangeSchema worktree-auto-manage fields (rq-autoManageAdvWorktrees AC3/AC4).
 *
 * Three optional fields decouple per-change auto-management from the legacy
 * `worktree_guard_enforce` global flag and store cross-project worktree
 * routing on the originating change:
 *
 * - `worktree_auto_managed: boolean` — per-change marker (AC3, sticky)
 * - `target_worktree_path: string | null` — cross-project worktree (AC4)
 * - `scope_worktrees: Record<repo_id, string>` — product-linked worktrees (AC4)
 *
 * All three fields are optional with safe defaults so legacy change.json
 * snapshots (lacking the fields) continue to load unchanged (agreement C3).
 */

import { describe, expect, test } from "vitest";
import { ChangeSchema } from "./changes";
import type { Change } from "./changes";

const minimalValidChange = {
  id: "test-change",
  title: "Test",
  status: "draft",
  created_at: "2026-01-01T00:00:00.000Z",
  tasks: [],
  deltas: {},
};

describe("ChangeSchema worktree-auto-manage fields", () => {
  test("parses change with all three worktree fields populated", () => {
    const result = ChangeSchema.parse({
      ...minimalValidChange,
      worktree_auto_managed: true,
      target_worktree_path: "/abs/path/to/target/worktree",
      scope_worktrees: {
        repoA: "/abs/path/to/repoA-worktree",
        repoB: "/abs/path/to/repoB-worktree",
      },
    });
    expect(result.worktree_auto_managed).toBe(true);
    expect(result.target_worktree_path).toBe("/abs/path/to/target/worktree");
    expect(result.scope_worktrees).toEqual({
      repoA: "/abs/path/to/repoA-worktree",
      repoB: "/abs/path/to/repoB-worktree",
    });
  });

  test("parses change with all three worktree fields absent (legacy compat)", () => {
    const result = ChangeSchema.parse(minimalValidChange);
    expect(result.worktree_auto_managed).toBeUndefined();
    expect(result.target_worktree_path).toBeUndefined();
    expect(result.scope_worktrees).toBeUndefined();
  });

  test("accepts target_worktree_path: null (explicitly cleared after cleanup)", () => {
    const result = ChangeSchema.parse({
      ...minimalValidChange,
      target_worktree_path: null,
    });
    expect(result.target_worktree_path).toBeNull();
  });

  test("accepts empty scope_worktrees record (post-cleanup state)", () => {
    const result = ChangeSchema.parse({
      ...minimalValidChange,
      scope_worktrees: {},
    });
    expect(result.scope_worktrees).toEqual({});
  });

  test("accepts worktree_auto_managed: false (grandfathered legacy change)", () => {
    const result = ChangeSchema.parse({
      ...minimalValidChange,
      worktree_auto_managed: false,
    });
    expect(result.worktree_auto_managed).toBe(false);
  });

  test("rejects non-boolean worktree_auto_managed", () => {
    expect(() =>
      ChangeSchema.parse({
        ...minimalValidChange,
        worktree_auto_managed: "true",
      }),
    ).toThrow();
  });

  test("rejects non-string target_worktree_path", () => {
    expect(() =>
      ChangeSchema.parse({
        ...minimalValidChange,
        target_worktree_path: 42,
      }),
    ).toThrow();
  });

  test("rejects non-string scope_worktrees values", () => {
    expect(() =>
      ChangeSchema.parse({
        ...minimalValidChange,
        scope_worktrees: { repoA: 42 },
      }),
    ).toThrow();
  });

  test("type alias Change is assignable to populated/absent variants", () => {
    const populated: Change = {
      ...minimalValidChange,
      status: "draft",
      worktree_auto_managed: true,
      target_worktree_path: "/abs",
      scope_worktrees: { r: "/abs/r" },
    } as Change;
    const absent: Change = { ...minimalValidChange, status: "draft" } as Change;
    expect(populated.worktree_auto_managed).toBe(true);
    expect(absent.worktree_auto_managed).toBeUndefined();
  });
});
