import { describe, expect, test, vi } from "vitest";

import { evaluateGateWorktreeIsolation } from "./gate";
import type { Change } from "../types";

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

describe("evaluateGateWorktreeIsolation (block_only mode preserved)", () => {
  test("allows metadata-only gates from main checkout when flag is enabled", async () => {
    await expect(
      evaluateGateWorktreeIsolation({
        gateId: "discovery",
        features: { worktree_guard_enforce: true },
        cwd: "/repo/main",
        getSessionContext: mainCtx,
      }),
    ).resolves.toEqual({ decision: "ALLOW" });

    await expect(
      evaluateGateWorktreeIsolation({
        gateId: "design",
        features: { worktree_guard_enforce: true },
        cwd: "/repo/main",
        getSessionContext: mainCtx,
      }),
    ).resolves.toEqual({ decision: "ALLOW" });
  });

  test("blocks worktree-mutation gates from main checkout when flag is enabled", async () => {
    const result = await evaluateGateWorktreeIsolation({
      gateId: "planning",
      features: { worktree_guard_enforce: true },
      cwd: "/repo/main",
      getSessionContext: mainCtx,
    });

    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeIsolationViolation",
      mainCheckoutPath: "/repo/main",
    });
    expect(result.remediation).not.toContain("workdir=");
    // block_only path: no auto-create-specific fields
    expect(result.code).toBeUndefined();
    expect(result.expectedWorktreePath).toBeUndefined();
  });

  test("keeps proposal gate exempt regardless of activation", async () => {
    await expect(
      evaluateGateWorktreeIsolation({
        gateId: "proposal",
        features: { worktree_guard_enforce: true },
        cwd: "/repo/main",
        getSessionContext: mainCtx,
      }),
    ).resolves.toEqual({ decision: "ALLOW" });

    await expect(
      evaluateGateWorktreeIsolation({
        gateId: "proposal",
        features: { worktree_guard_enforce: true },
        cwd: "/repo/main",
        change: autoManagedChange(),
        getSessionContext: mainCtx,
      }),
    ).resolves.toEqual({ decision: "ALLOW" });
  });

  test("allows when flag is explicitly disabled (legacy permissive)", async () => {
    await expect(
      evaluateGateWorktreeIsolation({
        gateId: "execution",
        features: { worktree_guard_enforce: false },
        cwd: "/repo/main",
        getSessionContext: mainCtx,
      }),
    ).resolves.toEqual({ decision: "ALLOW" });
  });
});

describe("evaluateGateWorktreeIsolation (auto_manage mode, AC5)", () => {
  test("auto-managed metadata gates allow without resuming a worktree", async () => {
    const resume = vi.fn();

    await expect(
      evaluateGateWorktreeIsolation({
        gateId: "design",
        features: undefined,
        cwd: "/repo/main",
        change: autoManagedChange(),
        getSessionContext: mainCtx,
        autoManageDeps: {
          resume,
          resumeRuntime: {
            projectRoot: "/repo/main",
            database: {},
            log: {
              debug: vi.fn(),
              info: vi.fn(),
              warn: vi.fn(),
              error: vi.fn(),
            },
          } as never,
        },
      }),
    ).resolves.toEqual({ decision: "ALLOW" });
    expect(resume).not.toHaveBeenCalled();
  });

  test("auto-managed change allows when worktree is created via resume", async () => {
    const resume = vi.fn().mockResolvedValue({
      ok: true,
      branch: "change/autoManaged",
      path: "/repo/wt/autoManaged",
      baseRef: "trunk",
      headSha: "abc",
      reused: false,
      materialized: true,
    });
    const result = await evaluateGateWorktreeIsolation({
      gateId: "planning",
      features: undefined,
      cwd: "/repo/main",
      change: autoManagedChange(),
      getSessionContext: mainCtx,
      autoManageDeps: {
        resume,
        resumeRuntime: {
          projectRoot: "/repo/main",
          database: {},
          log: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
          },
        } as never,
      },
    });
    expect(result).toMatchObject({
      decision: "ALLOW",
    });
    expect(resume).toHaveBeenCalledOnce();
  });

  test("auto-managed change allows when cwd is already a worktree", async () => {
    const result = await evaluateGateWorktreeIsolation({
      gateId: "execution",
      features: undefined,
      cwd: "/repo/wt/autoManaged",
      change: autoManagedChange(),
      getSessionContext: worktreeCtx,
    });
    expect(result).toEqual({ decision: "ALLOW" });
  });

  test("legacy change preserves block_only behavior under post-flip default", async () => {
    // Flag omitted → defaults to true post-E1 → block_only for legacy
    const result = await evaluateGateWorktreeIsolation({
      gateId: "execution",
      features: undefined,
      cwd: "/repo/main",
      change: legacyChange(),
      getSessionContext: mainCtx,
    });
    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeIsolationViolation",
    });
    // block_only path: no auto-create attempted, no AC6 fields
    expect(result.code).toBeUndefined();
    expect(result.expectedWorktreePath).toBeUndefined();
  });

  test("legacy change with explicit flag false stays permissive (escape hatch)", async () => {
    const result = await evaluateGateWorktreeIsolation({
      gateId: "execution",
      features: { worktree_guard_enforce: false },
      cwd: "/repo/main",
      change: legacyChange(),
      getSessionContext: mainCtx,
    });
    expect(result).toEqual({ decision: "ALLOW" });
  });
});
