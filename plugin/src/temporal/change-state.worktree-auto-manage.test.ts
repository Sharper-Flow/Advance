/**
 * change-state worktree-auto-manage handlers (rq-autoManageAdvWorktrees AC3, AC4).
 *
 * Verifies the two new pure-mutation helpers backing
 * `worktreeAutoManagedSignal` and `worktreeAttachedSignal`:
 *
 * - `applyWorktreeAutoManagedToState` — sticky once-set per-change marker.
 * - `applyWorktreeAttachedToState` — idempotent projection of worktree
 *   paths onto the change record (registry remains canonical).
 *
 * Both helpers MUST stay pure (no Temporal SDK imports, no node:* imports,
 * no storage/tools imports) so the workflow-bundle boundary contract
 * (`workflow-bundle-boundary.test.ts`) is preserved.
 */

import { describe, expect, it } from "vitest";

import {
  applyWorktreeAttachedToState,
  applyWorktreeAutoManagedToState,
  createChangeWorkflowState,
} from "./change-state";

const ISO = "2026-05-21T03:40:00.000Z";

function freshState() {
  return createChangeWorkflowState({
    changeId: "tk-test",
    title: "Test",
    createdAt: ISO,
  });
}

describe("applyWorktreeAutoManagedToState", () => {
  it("stamps value when state.worktree_auto_managed is undefined", () => {
    const state = freshState();
    expect(state.worktree_auto_managed).toBeUndefined();

    applyWorktreeAutoManagedToState(state, {
      value: true,
      source: "create",
      recordedAt: ISO,
    });

    expect(state.worktree_auto_managed).toBe(true);
    expect(state.lastSignalAt).toBe(ISO);
  });

  it("migrates legacy state to false on first read signal", () => {
    const state = freshState();

    applyWorktreeAutoManagedToState(state, {
      value: false,
      source: "migrate",
      recordedAt: ISO,
    });

    expect(state.worktree_auto_managed).toBe(false);
  });

  it("is sticky — second signal with different value is ignored", () => {
    const state = freshState();

    applyWorktreeAutoManagedToState(state, {
      value: true,
      source: "create",
      recordedAt: ISO,
    });
    applyWorktreeAutoManagedToState(state, {
      value: false,
      source: "migrate",
      recordedAt: "2026-05-21T04:00:00.000Z",
    });

    expect(state.worktree_auto_managed).toBe(true);
    // lastSignalAt unchanged because the second signal short-circuited
    expect(state.lastSignalAt).toBe(ISO);
  });

  it("is sticky — same-value repeated signal is a no-op", () => {
    const state = freshState();

    applyWorktreeAutoManagedToState(state, {
      value: false,
      source: "migrate",
      recordedAt: ISO,
    });
    const before = state.lastSignalAt;
    applyWorktreeAutoManagedToState(state, {
      value: false,
      source: "migrate",
      recordedAt: "2026-05-21T04:00:00.000Z",
    });

    expect(state.worktree_auto_managed).toBe(false);
    expect(state.lastSignalAt).toBe(before);
  });
});

describe("applyWorktreeAttachedToState", () => {
  it("sets target_worktree_path on role=target", () => {
    const state = freshState();

    applyWorktreeAttachedToState(state, {
      role: "target",
      path: "/abs/target/wt",
      recordedAt: ISO,
    });

    expect(state.target_worktree_path).toBe("/abs/target/wt");
    expect(state.lastSignalAt).toBe(ISO);
  });

  it("clears target_worktree_path on role=target with path=null", () => {
    const state = freshState();
    state.target_worktree_path = "/abs/old";

    applyWorktreeAttachedToState(state, {
      role: "target",
      path: null,
      recordedAt: ISO,
    });

    expect(state.target_worktree_path).toBeNull();
  });

  it("is a no-op when target path matches existing (idempotent)", () => {
    const state = freshState();
    state.target_worktree_path = "/abs/target/wt";
    state.lastSignalAt = "2026-05-21T01:00:00.000Z";

    applyWorktreeAttachedToState(state, {
      role: "target",
      path: "/abs/target/wt",
      recordedAt: ISO,
    });

    expect(state.target_worktree_path).toBe("/abs/target/wt");
    // lastSignalAt unchanged because mutation was a no-op
    expect(state.lastSignalAt).toBe("2026-05-21T01:00:00.000Z");
  });

  it("populates scope_worktrees[repoId] on role=scope", () => {
    const state = freshState();

    applyWorktreeAttachedToState(state, {
      role: "scope",
      repoId: "repoA",
      path: "/abs/repoA/wt",
      recordedAt: ISO,
    });

    expect(state.scope_worktrees).toEqual({ repoA: "/abs/repoA/wt" });
  });

  it("accumulates multiple scope_worktrees entries preserving insertion order", () => {
    const state = freshState();

    applyWorktreeAttachedToState(state, {
      role: "scope",
      repoId: "repoA",
      path: "/abs/repoA/wt",
      recordedAt: ISO,
    });
    applyWorktreeAttachedToState(state, {
      role: "scope",
      repoId: "repoB",
      path: "/abs/repoB/wt",
      recordedAt: ISO,
    });
    applyWorktreeAttachedToState(state, {
      role: "scope",
      repoId: "repoC",
      path: "/abs/repoC/wt",
      recordedAt: ISO,
    });

    expect(state.scope_worktrees).toEqual({
      repoA: "/abs/repoA/wt",
      repoB: "/abs/repoB/wt",
      repoC: "/abs/repoC/wt",
    });
    expect(Object.keys(state.scope_worktrees ?? {})).toEqual([
      "repoA",
      "repoB",
      "repoC",
    ]);
  });

  it("clears a single scope_worktrees[repoId] entry on path=null", () => {
    const state = freshState();
    state.scope_worktrees = {
      repoA: "/abs/repoA/wt",
      repoB: "/abs/repoB/wt",
    };

    applyWorktreeAttachedToState(state, {
      role: "scope",
      repoId: "repoA",
      path: null,
      recordedAt: ISO,
    });

    expect(state.scope_worktrees).toEqual({ repoB: "/abs/repoB/wt" });
  });

  it("is a no-op when scope path matches existing (idempotent)", () => {
    const state = freshState();
    state.scope_worktrees = { repoA: "/abs/repoA/wt" };
    state.lastSignalAt = "2026-05-21T01:00:00.000Z";

    applyWorktreeAttachedToState(state, {
      role: "scope",
      repoId: "repoA",
      path: "/abs/repoA/wt",
      recordedAt: ISO,
    });

    expect(state.scope_worktrees).toEqual({ repoA: "/abs/repoA/wt" });
    expect(state.lastSignalAt).toBe("2026-05-21T01:00:00.000Z");
  });

  it("is a no-op for role=scope when repoId is missing (defensive)", () => {
    const state = freshState();

    applyWorktreeAttachedToState(state, {
      role: "scope",
      path: "/abs/orphan",
      recordedAt: ISO,
    });

    expect(state.scope_worktrees).toBeUndefined();
    expect(state.lastSignalAt).toBeUndefined();
  });

  it("is a no-op for role=current (reserved; registry handles current-repo today)", () => {
    const state = freshState();

    applyWorktreeAttachedToState(state, {
      role: "current",
      path: "/abs/current/wt",
      recordedAt: ISO,
    });

    expect(state.target_worktree_path).toBeUndefined();
    expect(state.scope_worktrees).toBeUndefined();
    expect(state.lastSignalAt).toBeUndefined();
  });
});
