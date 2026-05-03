/**
 * Decision-tree applier tests (T28b — J3 SCOPE EXPANSION).
 */

import { describe, it, expect, vi } from "vitest";
import {
  applyResolveAction,
  ResolveAction,
  ApplyResolveDeps,
} from "./conflict-resolve";

describe("applyResolveAction", () => {
  const filePath = "src/foo.ts";
  const repoRoot = "/fake/repo";

  const makeDeps = (overrides: Partial<ApplyResolveDeps> = {}): ApplyResolveDeps => ({
    writeFile: vi.fn().mockResolvedValue(undefined),
    gitAdd: vi.fn().mockResolvedValue({ ok: true }),
    gitRebaseSkip: vi.fn().mockResolvedValue({ ok: true }),
    gitRebaseContinue: vi.fn().mockResolvedValue({ ok: true }),
    gitRebaseAbort: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  });

  // ---------------------------------------------------------------------------
  // 1. skip path delegates to T28
  // ---------------------------------------------------------------------------
  it('skip: calls gitRebaseSkip and returns correct auditEntry', async () => {
    const deps = makeDeps();
    const action: ResolveAction = { kind: "skip", reason: "duplicate content (T28)" };

    const result = await applyResolveAction(action, filePath, repoRoot, deps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action).toBe("skip");
      expect(result.auditEntry).toBe("skipped: duplicate content (T28)");
    }
    expect(deps.gitRebaseSkip).toHaveBeenCalledWith(repoRoot);
    expect(deps.gitRebaseSkip).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // 2. auto-resolve trivial (whitespace conflict)
  // ---------------------------------------------------------------------------
  it('auto_resolve: writes file, adds, continues, and returns correct auditEntry', async () => {
    const deps = makeDeps();
    const action: ResolveAction = {
      kind: "auto_resolve",
      resolvedContent: "resolved\n",
      reason: "whitespace-only conflict",
    };

    const result = await applyResolveAction(action, filePath, repoRoot, deps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action).toBe("auto_resolve");
      expect(result.auditEntry).toBe("auto-resolved: whitespace-only conflict");
    }
    expect(deps.writeFile).toHaveBeenCalledWith(filePath, "resolved\n");
    expect(deps.gitAdd).toHaveBeenCalledWith(filePath, repoRoot);
    expect(deps.gitRebaseContinue).toHaveBeenCalledWith(repoRoot);
    expect(deps.writeFile).toHaveBeenCalledBefore(deps.gitAdd as ReturnType<typeof vi.fn>);
    expect(deps.gitAdd).toHaveBeenCalledBefore(deps.gitRebaseContinue as ReturnType<typeof vi.fn>);
  });

  // ---------------------------------------------------------------------------
  // 3. user resolve-in-place (semantic divergence accepted)
  // ---------------------------------------------------------------------------
  it('user_resolve_in_place: same flow as auto_resolve with user reason in audit', async () => {
    const deps = makeDeps();
    const action: ResolveAction = {
      kind: "user_resolve_in_place",
      resolvedContent: "user resolved\n",
      userReason: "accepted semantic divergence",
    };

    const result = await applyResolveAction(action, filePath, repoRoot, deps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action).toBe("user_resolve_in_place");
      expect(result.auditEntry).toBe("user-resolved-in-place: accepted semantic divergence");
    }
    expect(deps.writeFile).toHaveBeenCalledWith(filePath, "user resolved\n");
    expect(deps.gitAdd).toHaveBeenCalledWith(filePath, repoRoot);
    expect(deps.gitRebaseContinue).toHaveBeenCalledWith(repoRoot);
  });

  // ---------------------------------------------------------------------------
  // 4. user abort (semantic divergence rejected → rebase aborted)
  // ---------------------------------------------------------------------------
  it('abort_rebase: calls gitRebaseAbort and returns correct auditEntry', async () => {
    const deps = makeDeps();
    const action: ResolveAction = {
      kind: "abort_rebase",
      userReason: "rejected semantic divergence",
    };

    const result = await applyResolveAction(action, filePath, repoRoot, deps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action).toBe("abort_rebase");
      expect(result.auditEntry).toBe("rebase-aborted: rejected semantic divergence");
    }
    expect(deps.gitRebaseAbort).toHaveBeenCalledWith(repoRoot);
    expect(deps.gitRebaseAbort).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // 5. user skip-with-decision
  // ---------------------------------------------------------------------------
  it('skip_with_decision: calls gitRebaseSkip with user reason in audit', async () => {
    const deps = makeDeps();
    const action: ResolveAction = {
      kind: "skip_with_decision",
      userReason: "user accepted skip",
    };

    const result = await applyResolveAction(action, filePath, repoRoot, deps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action).toBe("skip_with_decision");
      expect(result.auditEntry).toBe("skipped-with-decision: user accepted skip");
    }
    expect(deps.gitRebaseSkip).toHaveBeenCalledWith(repoRoot);
    expect(deps.gitRebaseSkip).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // BONUS: Error propagation — writeFile fails → WRITE_FAILED
  // ---------------------------------------------------------------------------
  it('returns WRITE_FAILED when writeFile throws', async () => {
    const deps = makeDeps({
      writeFile: vi.fn().mockRejectedValue(new Error("disk full")),
    });
    const action: ResolveAction = {
      kind: "auto_resolve",
      resolvedContent: "content",
      reason: "test",
    };

    const result = await applyResolveAction(action, filePath, repoRoot, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("WRITE_FAILED");
      expect(result.detail).toBe("disk full");
    }
    expect(deps.gitAdd).not.toHaveBeenCalled();
    expect(deps.gitRebaseContinue).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // BONUS: Error propagation — gitRebaseAbort fails → REBASE_ABORT_FAILED
  // ---------------------------------------------------------------------------
  it('returns REBASE_ABORT_FAILED when gitRebaseAbort fails', async () => {
    const deps = makeDeps({
      gitRebaseAbort: vi.fn().mockResolvedValue({ ok: false, error: "no rebase in progress" }),
    });
    const action: ResolveAction = {
      kind: "abort_rebase",
      userReason: "aborting",
    };

    const result = await applyResolveAction(action, filePath, repoRoot, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("REBASE_ABORT_FAILED");
      expect(result.detail).toBe("no rebase in progress");
    }
  });

  // ---------------------------------------------------------------------------
  // BONUS: Error propagation — gitAdd fails → GIT_FAILED, no continue attempted
  // ---------------------------------------------------------------------------
  it('returns GIT_FAILED when gitAdd fails and does not continue', async () => {
    const deps = makeDeps({
      gitAdd: vi.fn().mockResolvedValue({ ok: false, error: "index lock" }),
    });
    const action: ResolveAction = {
      kind: "auto_resolve",
      resolvedContent: "content",
      reason: "test",
    };

    const result = await applyResolveAction(action, filePath, repoRoot, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("GIT_FAILED");
      expect(result.detail).toBe("index lock");
    }
    expect(deps.gitRebaseContinue).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // BONUS: Error propagation — gitRebaseContinue fails → GIT_FAILED
  // ---------------------------------------------------------------------------
  it('returns GIT_FAILED when gitRebaseContinue fails', async () => {
    const deps = makeDeps({
      gitRebaseContinue: vi.fn().mockResolvedValue({ ok: false, error: "merge conflict remains" }),
    });
    const action: ResolveAction = {
      kind: "user_resolve_in_place",
      resolvedContent: "content",
      userReason: "test",
    };

    const result = await applyResolveAction(action, filePath, repoRoot, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("GIT_FAILED");
      expect(result.detail).toBe("merge conflict remains");
    }
  });

  // ---------------------------------------------------------------------------
  // BONUS: Error propagation — gitRebaseSkip fails → GIT_FAILED
  // ---------------------------------------------------------------------------
  it('returns GIT_FAILED when gitRebaseSkip fails', async () => {
    const deps = makeDeps({
      gitRebaseSkip: vi.fn().mockResolvedValue({ ok: false, error: "fatal: no rebase" }),
    });
    const action: ResolveAction = { kind: "skip", reason: "test" };

    const result = await applyResolveAction(action, filePath, repoRoot, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("GIT_FAILED");
      expect(result.detail).toBe("fatal: no rebase");
    }
  });
});
