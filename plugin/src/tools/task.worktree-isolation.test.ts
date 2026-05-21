import { describe, expect, test, vi } from "vitest";

import {
  evaluateTaskAddWorktreeIsolation,
  evaluateTaskUpdateWorktreeIsolation,
} from "./task";
import type { Change } from "../types";

function autoManagedChange(): Change {
  return {
    id: "autoManaged",
    title: "Auto-managed",
    status: "active",
    created_at: "2026-05-21T00:00:00.000Z",
    tasks: [],
    deltas: {},
    worktree_auto_managed: true,
  } as Change;
}

function legacyChange(): Change {
  return {
    id: "legacy",
    title: "Legacy",
    status: "active",
    created_at: "2026-05-21T00:00:00.000Z",
    tasks: [],
    deltas: {},
    worktree_auto_managed: false,
  } as Change;
}

const mainCtx = () => ({
  isWorktree: false,
  isMainCheckout: true,
  mainCheckoutPath: "/repo/main",
});

const worktreeCtx = () => ({
  isWorktree: true,
  isMainCheckout: false,
  mainCheckoutPath: "/repo/main",
});

const fakeRuntime = {
  projectRoot: "/repo/main",
  database: {},
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
} as never;

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

// =============================================================================
// AC5 — per-change-marker conditioning (auto_manage mode)
// =============================================================================

describe("evaluateTaskAddWorktreeIsolation (auto_manage mode, AC5)", () => {
  test("auto-managed change BLOCKs with expectedWorktreePath on auto-create", async () => {
    const resume = vi.fn().mockResolvedValue({
      ok: true,
      branch: "change/autoManaged",
      path: "/repo/wt/autoManaged",
      baseRef: "trunk",
      headSha: "abc",
      reused: false,
      materialized: true,
    });
    const result = await evaluateTaskAddWorktreeIsolation({
      features: undefined,
      cwd: "/repo/main",
      change: autoManagedChange(),
      getSessionContext: mainCtx,
      autoManageDeps: { resume, resumeRuntime: fakeRuntime },
    });
    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeIsolationViolation",
      expectedWorktreePath: "/repo/wt/autoManaged",
    });
  });

  test("auto-managed change ALLOWs when cwd is already a worktree", async () => {
    const result = await evaluateTaskAddWorktreeIsolation({
      features: undefined,
      cwd: "/repo/wt/autoManaged",
      change: autoManagedChange(),
      getSessionContext: worktreeCtx,
    });
    expect(result).toEqual({ decision: "ALLOW" });
  });

  test("legacy change preserves block_only behavior under post-flip default", async () => {
    const result = await evaluateTaskAddWorktreeIsolation({
      features: undefined,
      cwd: "/repo/main",
      change: legacyChange(),
      getSessionContext: mainCtx,
    });
    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeIsolationViolation",
    });
    expect(result.code).toBeUndefined();
    expect(result.expectedWorktreePath).toBeUndefined();
  });

  test("legacy change with explicit flag false stays permissive", async () => {
    const result = await evaluateTaskAddWorktreeIsolation({
      features: { worktree_guard_enforce: false },
      cwd: "/repo/main",
      change: legacyChange(),
      getSessionContext: mainCtx,
    });
    expect(result).toEqual({ decision: "ALLOW" });
  });
});

describe("evaluateTaskUpdateWorktreeIsolation (auto_manage mode, AC5)", () => {
  test("auto-managed change BLOCKs in_progress mutation with expectedWorktreePath", async () => {
    const resume = vi.fn().mockResolvedValue({
      ok: true,
      branch: "change/autoManaged",
      path: "/repo/wt/autoManaged",
      baseRef: "trunk",
      headSha: "abc",
      reused: false,
      materialized: true,
    });
    const result = await evaluateTaskUpdateWorktreeIsolation({
      status: "in_progress",
      features: undefined,
      cwd: "/repo/main",
      change: autoManagedChange(),
      getSessionContext: mainCtx,
      autoManageDeps: { resume, resumeRuntime: fakeRuntime },
    });
    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeIsolationViolation",
      expectedWorktreePath: "/repo/wt/autoManaged",
    });
  });

  test("auto-managed change ALLOWs non-mutating pending update from main (preserved)", async () => {
    const result = await evaluateTaskUpdateWorktreeIsolation({
      status: "pending",
      features: undefined,
      cwd: "/repo/main",
      change: autoManagedChange(),
      getSessionContext: mainCtx,
    });
    expect(result).toEqual({ decision: "ALLOW" });
  });

  test("auto-managed change BLOCKs done update with expectedWorktreePath", async () => {
    const resume = vi.fn().mockResolvedValue({
      ok: true,
      branch: "change/autoManaged",
      path: "/repo/wt/autoManaged",
      baseRef: "trunk",
      headSha: "abc",
      reused: false,
      materialized: true,
    });
    const result = await evaluateTaskUpdateWorktreeIsolation({
      status: "done",
      features: undefined,
      cwd: "/repo/main",
      change: autoManagedChange(),
      getSessionContext: mainCtx,
      autoManageDeps: { resume, resumeRuntime: fakeRuntime },
    });
    expect(result.decision).toBe("BLOCK");
    expect(result.expectedWorktreePath).toBe("/repo/wt/autoManaged");
  });
});

// =============================================================================
// AC4 D1/D2 — cross-project / scope_repos role propagation
// =============================================================================

describe("evaluateTask*WorktreeIsolation (AC4 D1/D2 role propagation)", () => {
  test("task_add with role=target fires attachment hook tagged target", async () => {
    const resume = vi.fn().mockResolvedValue({
      ok: true,
      branch: "change/autoManaged",
      path: "/target-project/wt/autoManaged",
      baseRef: "trunk",
      headSha: "abc",
      reused: false,
      materialized: true,
    });
    const attachments: unknown[] = [];
    const result = await evaluateTaskAddWorktreeIsolation({
      features: undefined,
      cwd: "/target-project/main",
      change: autoManagedChange(),
      role: "target",
      getSessionContext: () => ({
        isWorktree: false,
        isMainCheckout: true,
        mainCheckoutPath: "/target-project/main",
      }),
      autoManageDeps: {
        resume,
        resumeRuntime: fakeRuntime,
        onAttached: (info) => {
          attachments.push(info);
        },
      },
    });
    expect(result.expectedWorktreePath).toBe("/target-project/wt/autoManaged");
    expect(attachments[0]).toMatchObject({
      changeId: "autoManaged",
      role: "target",
      path: "/target-project/wt/autoManaged",
    });
  });

  test("task_update with role=scope + repoId fires attachment hook tagged scope", async () => {
    const resume = vi.fn().mockResolvedValue({
      ok: true,
      branch: "change/autoManaged",
      path: "/repoA/wt/autoManaged",
      baseRef: "trunk",
      headSha: "abc",
      reused: false,
      materialized: true,
    });
    const attachments: unknown[] = [];
    await evaluateTaskUpdateWorktreeIsolation({
      status: "in_progress",
      features: undefined,
      cwd: "/repoA/main",
      change: autoManagedChange(),
      role: "scope",
      repoId: "repoA",
      getSessionContext: () => ({
        isWorktree: false,
        isMainCheckout: true,
        mainCheckoutPath: "/repoA/main",
      }),
      autoManageDeps: {
        resume,
        resumeRuntime: fakeRuntime,
        onAttached: (info) => {
          attachments.push(info);
        },
      },
    });
    expect(attachments[0]).toMatchObject({
      changeId: "autoManaged",
      role: "scope",
      repoId: "repoA",
      path: "/repoA/wt/autoManaged",
    });
  });

  test("omitting role defaults to current (backward compat)", async () => {
    const resume = vi.fn().mockResolvedValue({
      ok: true,
      branch: "change/autoManaged",
      path: "/repo/wt/autoManaged",
      baseRef: "trunk",
      headSha: "abc",
      reused: false,
      materialized: true,
    });
    const attachments: unknown[] = [];
    await evaluateTaskAddWorktreeIsolation({
      features: undefined,
      cwd: "/repo/main",
      change: autoManagedChange(),
      getSessionContext: mainCtx,
      autoManageDeps: {
        resume,
        resumeRuntime: fakeRuntime,
        onAttached: (info) => {
          attachments.push(info);
        },
      },
    });
    expect(attachments[0]).toMatchObject({ role: "current" });
  });
});
