/**
 * Tests for the worktree-auto-manage helper module (Block B).
 *
 * Coverage matrix:
 *   - evaluateWorktreeGuardActivation: 3 modes × per-change marker variants
 *     × global flag variants.
 *   - ensureWorktreeForMutation:
 *       activation matrix × cwd state (main / worktree / non-git)
 *       × existing-worktree-on-main vs. not
 *       × auto-create success → BLOCK with expectedWorktreePath + attachment
 *       × each AdvWorktreeResumeResult failure variant → AC6 errorClass + code
 *       × auto-create throw → structured GIT_FAILED
 *       × missing resumeRuntime → defensive structured failure
 */

import { describe, expect, it, vi } from "vitest";

import {
  buildWorktreeAutoManageDeps,
  ensureWorktreeForMutation,
  evaluateWorktreeGuardActivation,
} from "./worktree-auto-manage";
import type { AdvWorktreeResumeResult } from "./worktree";
import type { Change } from "../types";
import type { Store } from "../storage/store";

function legacyChange(overrides: Partial<Change> = {}): Change {
  return {
    id: "legacyChange",
    title: "Legacy",
    status: "active",
    created_at: "2026-05-21T00:00:00.000Z",
    tasks: [],
    deltas: {},
    ...overrides,
  } as Change;
}

function autoManagedChange(overrides: Partial<Change> = {}): Change {
  return legacyChange({
    id: "autoManagedChange",
    worktree_auto_managed: true,
    ...overrides,
  });
}

const mainCtx = {
  isWorktree: false,
  isMainCheckout: true,
  mainCheckoutPath: "/repo/main",
};

const worktreeCtx = {
  isWorktree: true,
  isMainCheckout: false,
  mainCheckoutPath: "/repo/main",
};

// Minimal runtime bundle shape for tests. Production callers wire a
// fully-populated bundle via the tool layer; here we only need the
// fields the helper itself touches (none today — resume is mocked).
const fakeRuntime = {
  projectRoot: "/repo/main",
  database: {},
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
} as never;

function fakeStore(root = "/repo/main"): Store {
  return {
    paths: { root },
  } as Store;
}

// ===========================================================================
// production dependency builder
// ===========================================================================

describe("buildWorktreeAutoManageDeps", () => {
  it("builds resumeRuntime from the active store", async () => {
    const deps = await buildWorktreeAutoManageDeps(fakeStore());

    expect(deps.resumeRuntime).toMatchObject({
      projectRoot: "/repo/main",
      store: fakeStore(),
    });
    expect(deps.resumeRuntime?.database).toMatchObject({
      projectDir: "/repo/main",
    });
    expect(deps.resumeRuntime?.log).toMatchObject({
      debug: expect.any(Function),
      info: expect.any(Function),
      warn: expect.any(Function),
      error: expect.any(Function),
    });
  });

  it("preserves caller overrides while supplying resumeRuntime", async () => {
    const getSessionContext = vi.fn(() => mainCtx);
    const onWarning = vi.fn();
    const deps = await buildWorktreeAutoManageDeps(fakeStore(), {
      getSessionContext,
      onWarning,
    });

    expect(deps.getSessionContext).toBe(getSessionContext);
    expect(deps.onWarning).toBe(onWarning);
    expect(deps.resumeRuntime?.projectRoot).toBe("/repo/main");
  });
});

// ===========================================================================
// evaluateWorktreeGuardActivation
// ===========================================================================

describe("evaluateWorktreeGuardActivation", () => {
  it("returns auto_manage when change marker is true (regardless of flag)", () => {
    const change = autoManagedChange();
    expect(
      evaluateWorktreeGuardActivation(change, {
        worktree_guard_enforce: false,
      }),
    ).toEqual({ mode: "auto_manage" });
    expect(
      evaluateWorktreeGuardActivation(change, {
        worktree_guard_enforce: true,
      }),
    ).toEqual({ mode: "auto_manage" });
    expect(evaluateWorktreeGuardActivation(change, undefined)).toEqual({
      mode: "auto_manage",
    });
  });

  it("returns block_only when marker is false and flag is true (legacy + enforced)", () => {
    const change = legacyChange({ worktree_auto_managed: false });
    expect(
      evaluateWorktreeGuardActivation(change, {
        worktree_guard_enforce: true,
      }),
    ).toEqual({ mode: "block_only" });
  });

  it("returns off when marker is false and flag is false (legacy + permissive)", () => {
    const change = legacyChange({ worktree_auto_managed: false });
    expect(
      evaluateWorktreeGuardActivation(change, {
        worktree_guard_enforce: false,
      }),
    ).toEqual({ mode: "off" });
  });

  it("treats undefined marker like legacy (defers to flag)", () => {
    const change = legacyChange();
    expect(
      evaluateWorktreeGuardActivation(change, {
        worktree_guard_enforce: false,
      }),
    ).toEqual({ mode: "off" });
    expect(
      evaluateWorktreeGuardActivation(change, {
        worktree_guard_enforce: true,
      }),
    ).toEqual({ mode: "block_only" });
  });

  it("treats missing features object as flag=true (post-E1 default)", () => {
    // Post-flip default: omitted features → flag true → block_only for legacy
    const change = legacyChange();
    expect(evaluateWorktreeGuardActivation(change, undefined)).toEqual({
      mode: "block_only",
    });
  });

  it("treats undefined change as flag-only (no marker available)", () => {
    expect(
      evaluateWorktreeGuardActivation(undefined, {
        worktree_guard_enforce: true,
      }),
    ).toEqual({ mode: "block_only" });
    expect(
      evaluateWorktreeGuardActivation(undefined, {
        worktree_guard_enforce: false,
      }),
    ).toEqual({ mode: "off" });
  });
});

// ===========================================================================
// ensureWorktreeForMutation — ALLOW paths
// ===========================================================================

describe("ensureWorktreeForMutation — ALLOW paths", () => {
  it("ALLOW when activation=off (legacy change, flag false)", async () => {
    const result = await ensureWorktreeForMutation({
      change: legacyChange({ worktree_auto_managed: false }),
      cwd: "/repo/main",
      features: { worktree_guard_enforce: false },
      deps: { getSessionContext: () => mainCtx },
    });
    expect(result).toEqual({ decision: "ALLOW" });
  });

  it("ALLOW when cwd is a worktree (any activation mode)", async () => {
    const result = await ensureWorktreeForMutation({
      change: autoManagedChange(),
      cwd: "/repo/wt/change-x",
      deps: { getSessionContext: () => worktreeCtx },
    });
    expect(result).toEqual({ decision: "ALLOW" });
  });

  it("ALLOW + warn when git context detection throws (non-git workdir)", async () => {
    const warnings: string[] = [];
    const result = await ensureWorktreeForMutation({
      change: autoManagedChange(),
      cwd: "/tmp/not-a-repo",
      deps: {
        getSessionContext: () => {
          throw new Error("not a git repository");
        },
        onWarning: (msg) => warnings.push(msg),
      },
    });
    expect(result).toEqual({ decision: "ALLOW" });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("git context detection failed");
  });
});

// ===========================================================================
// ensureWorktreeForMutation — block_only mode (legacy enforced)
// ===========================================================================

describe("ensureWorktreeForMutation — block_only mode", () => {
  it("BLOCK from main checkout with legacy WorktreeIsolationViolation", async () => {
    const result = await ensureWorktreeForMutation({
      change: legacyChange({ worktree_auto_managed: false }),
      cwd: "/repo/main",
      features: { worktree_guard_enforce: true },
      deps: { getSessionContext: () => mainCtx },
    });
    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeIsolationViolation",
      mainCheckoutPath: "/repo/main",
    });
    expect(result.remediation).toContain("adv_worktree");
    // block_only mode MUST NOT carry the auto-create-specific fields
    expect(result.code).toBeUndefined();
    expect(result.expectedWorktreePath).toBeUndefined();
  });
});

// ===========================================================================
// ensureWorktreeForMutation — auto_manage mode
// ===========================================================================

describe("ensureWorktreeForMutation — auto_manage mode (existing worktree)", () => {
  it("ALLOW when lookup returns an existing path (worktree ready, no CWD block needed)", async () => {
    const attachments: unknown[] = [];
    const result = await ensureWorktreeForMutation({
      change: autoManagedChange(),
      cwd: "/repo/main",
      deps: {
        getSessionContext: () => mainCtx,
        lookupExistingPath: () => "/repo/wt/autoManagedChange",
        onAttached: (info) => {
          attachments.push(info);
        },
      },
    });
    expect(result).toMatchObject({
      decision: "ALLOW",
    });
    // Existing-path lookup also fires the attachment hook so the projection
    // re-syncs even if a peer session created the worktree out-of-band.
    expect(attachments).toEqual([
      {
        changeId: "autoManagedChange",
        role: "current",
        repoId: undefined,
        path: "/repo/wt/autoManagedChange",
      },
    ]);
  });
});

describe("ensureWorktreeForMutation — auto_manage mode (auto-create success)", () => {
  function makeResumeOk(path = "/repo/wt/freshly-created"): {
    resume: ReturnType<typeof vi.fn>;
    expected: AdvWorktreeResumeResult;
  } {
    const expected: AdvWorktreeResumeResult = {
      ok: true,
      branch: "change/autoManagedChange",
      path,
      baseRef: "trunk",
      headSha: "abc123",
      reused: false,
      materialized: true,
    };
    return { resume: vi.fn().mockResolvedValue(expected), expected };
  }

  it("ALLOW after advWorktreeResume succeeds (worktree ready, no CWD block needed)", async () => {
    const { resume } = makeResumeOk();
    const attachments: unknown[] = [];
    const result = await ensureWorktreeForMutation({
      change: autoManagedChange(),
      cwd: "/repo/main",
      deps: {
        getSessionContext: () => mainCtx,
        resume,
        resumeRuntime: fakeRuntime,
        onAttached: (info) => {
          attachments.push(info);
        },
      },
    });
    expect(resume).toHaveBeenCalledWith(
      { changeId: "autoManagedChange" },
      {},
      fakeRuntime,
    );
    expect(result).toMatchObject({
      decision: "ALLOW",
    });
    expect(attachments).toEqual([
      {
        changeId: "autoManagedChange",
        role: "current",
        repoId: undefined,
        path: "/repo/wt/freshly-created",
      },
    ]);
  });

  it("propagates role=target + path in attachment hook for cross-project mutations", async () => {
    const { resume } = makeResumeOk("/target-project/wt/autoManagedChange");
    const attachments: unknown[] = [];
    const result = await ensureWorktreeForMutation({
      change: autoManagedChange(),
      cwd: "/target-project/main",
      role: "target",
      deps: {
        getSessionContext: () => ({
          isWorktree: false,
          isMainCheckout: true,
          mainCheckoutPath: "/target-project/main",
        }),
        resume,
        resumeRuntime: fakeRuntime,
        onAttached: (info) => {
          attachments.push(info);
        },
      },
    });
    expect(result.decision).toBe("ALLOW");
    expect(attachments[0]).toMatchObject({ role: "target" });
  });

  it("propagates role=scope + repoId in attachment hook for product-linked changes", async () => {
    const { resume } = makeResumeOk("/repoA/wt/autoManagedChange");
    const attachments: unknown[] = [];
    await ensureWorktreeForMutation({
      change: autoManagedChange(),
      cwd: "/repoA/main",
      role: "scope",
      repoId: "repoA",
      deps: {
        getSessionContext: () => ({
          isWorktree: false,
          isMainCheckout: true,
          mainCheckoutPath: "/repoA/main",
        }),
        resume,
        resumeRuntime: fakeRuntime,
        onAttached: (info) => {
          attachments.push(info);
        },
      },
    });
    expect(attachments[0]).toMatchObject({
      role: "scope",
      repoId: "repoA",
      path: "/repoA/wt/autoManagedChange",
    });
  });

  it("ALLOW result when onAttached throws (warns, still allows since worktree is ready)", async () => {
    const { resume } = makeResumeOk();
    const warnings: string[] = [];
    const result = await ensureWorktreeForMutation({
      change: autoManagedChange(),
      cwd: "/repo/main",
      deps: {
        getSessionContext: () => mainCtx,
        resume,
        resumeRuntime: fakeRuntime,
        onAttached: () => {
          throw new Error("projection signal failed");
        },
        onWarning: (msg) => warnings.push(msg),
      },
    });
    expect(result.decision).toBe("ALLOW");
    expect(warnings.some((w) => w.includes("onAttached hook"))).toBe(true);
  });
});

describe("ensureWorktreeForMutation — auto_manage mode (auto-create failures, AC6)", () => {
  async function runFailure(
    failure: Extract<AdvWorktreeResumeResult, { ok: false }>,
  ) {
    const resume = vi.fn().mockResolvedValue(failure);
    return ensureWorktreeForMutation({
      change: autoManagedChange(),
      cwd: "/repo/main",
      deps: {
        getSessionContext: () => mainCtx,
        resume,
        resumeRuntime: fakeRuntime,
      },
    });
  }

  it("TARGET_REQUIRED → WorktreeAutoCreateFailure / RESUME_INVALID_TARGET", async () => {
    const result = await runFailure({
      ok: false,
      error: "TARGET_REQUIRED",
      hint: "Pass either branch or changeId",
    });
    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeAutoCreateFailure",
      code: "RESUME_INVALID_TARGET",
    });
  });

  it("SETUP_FAILED → WorktreeSetupFailed / SETUP_HOOK_FAILED", async () => {
    const result = await runFailure({
      ok: false,
      error: "SETUP_FAILED",
      branch: "change/x",
      path: "/repo/wt/x",
      reason: "post-create hook exited with code 1",
    });
    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeSetupFailed",
      code: "SETUP_HOOK_FAILED",
      underlying_error: "post-create hook exited with code 1",
    });
  });

  it("BRANCH_IN_USE → WorktreeBranchCollision / BRANCH_IN_USE_BY_OTHER_CHANGE", async () => {
    const result = await runFailure({
      ok: false,
      error: "BRANCH_IN_USE",
      branch: "change/autoManagedChange",
      ownerChangeIds: ["someOtherChange"],
      hint: "Branch is already registered",
    });
    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeBranchCollision",
      code: "BRANCH_IN_USE_BY_OTHER_CHANGE",
    });
    expect(result.reason).toContain("someOtherChange");
  });

  it("BRANCH_LOCKED → WorktreeAutoCreateFailure / BRANCH_LOCKED", async () => {
    const result = await runFailure({
      ok: false,
      error: "BRANCH_LOCKED",
      hint: "Another session is creating a worktree",
    });
    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeAutoCreateFailure",
      code: "BRANCH_LOCKED",
    });
  });

  it("DEFAULT_BRANCH_UNRESOLVABLE → WorktreeAutoCreateFailure / DEFAULT_BRANCH_UNRESOLVABLE", async () => {
    const result = await runFailure({
      ok: false,
      error: "DEFAULT_BRANCH_UNRESOLVABLE",
      hint: "Specify opts.base explicitly or fix repo HEAD",
    });
    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeAutoCreateFailure",
      code: "DEFAULT_BRANCH_UNRESOLVABLE",
    });
  });

  it("STALE_BASE → WorktreeAutoCreateFailure / STALE_BASE", async () => {
    const result = await runFailure({
      ok: false,
      error: "STALE_BASE",
      reason: "branch trunk is merged and deleted",
      suggestion: "git switch main",
    });
    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeAutoCreateFailure",
      code: "STALE_BASE",
    });
    expect(result.reason).toContain("Suggested:");
  });

  it("GIT_FAILED disk-full → WorktreeAutoCreateFailure / DISK_FULL", async () => {
    const result = await runFailure({
      ok: false,
      error: "GIT_FAILED",
      reason: "fatal: write error: No space left on device",
    });
    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeAutoCreateFailure",
      code: "DISK_FULL",
    });
  });

  it("GIT_FAILED permission → WorktreeAutoCreateFailure / PERMISSION_DENIED", async () => {
    const result = await runFailure({
      ok: false,
      error: "GIT_FAILED",
      reason: "fatal: Permission denied (publickey)",
    });
    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeAutoCreateFailure",
      code: "PERMISSION_DENIED",
    });
  });

  it("GIT_FAILED generic → WorktreeAutoCreateFailure / GIT_FAILED", async () => {
    const result = await runFailure({
      ok: false,
      error: "GIT_FAILED",
      reason: "fatal: refusing to fetch into branch",
    });
    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeAutoCreateFailure",
      code: "GIT_FAILED",
    });
  });

  it("INVALID_BRANCH → WorktreeAutoCreateFailure / INVALID_BRANCH", async () => {
    const result = await runFailure({
      ok: false,
      error: "INVALID_BRANCH",
      reason: "branch name contains illegal characters",
    });
    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeAutoCreateFailure",
      code: "INVALID_BRANCH",
    });
  });

  it("resume throws → WorktreeAutoCreateFailure / GIT_FAILED with underlying_error", async () => {
    const resume = vi
      .fn()
      .mockRejectedValue(new Error("unhandled git plumbing failure"));
    const result = await ensureWorktreeForMutation({
      change: autoManagedChange(),
      cwd: "/repo/main",
      deps: {
        getSessionContext: () => mainCtx,
        resume,
        resumeRuntime: fakeRuntime,
      },
    });
    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeAutoCreateFailure",
      code: "GIT_FAILED",
      underlying_error: "unhandled git plumbing failure",
    });
  });

  it("missing resumeRuntime → defensive structured failure (does not throw)", async () => {
    const resume = vi.fn();
    const result = await ensureWorktreeForMutation({
      change: autoManagedChange(),
      cwd: "/repo/main",
      deps: {
        getSessionContext: () => mainCtx,
        resume,
      },
    });
    expect(result).toMatchObject({
      decision: "BLOCK",
      errorClass: "WorktreeAutoCreateFailure",
      code: "GIT_FAILED",
    });
    expect(result.reason).toContain("resumeRuntime missing");
    expect(resume).not.toHaveBeenCalled();
  });

  it("DONT1 — auto-create failure does NOT silently retry", async () => {
    let calls = 0;
    const resume = vi.fn().mockImplementation(async () => {
      calls += 1;
      return {
        ok: false,
        error: "GIT_FAILED",
        reason: "transient flake",
      } satisfies Extract<AdvWorktreeResumeResult, { ok: false }>;
    });
    await ensureWorktreeForMutation({
      change: autoManagedChange(),
      cwd: "/repo/main",
      deps: {
        getSessionContext: () => mainCtx,
        resume,
        resumeRuntime: fakeRuntime,
      },
    });
    expect(calls).toBe(1);
  });
});
