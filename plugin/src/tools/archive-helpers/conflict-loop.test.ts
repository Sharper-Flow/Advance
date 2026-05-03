/**
 * Multi-conflict navigation UX tests (T28c — J3 SCOPE EXPANSION).
 */

import { describe, it, expect, vi } from "vitest";
import {
  navigateConflicts,
  ConflictRecord,
  NavigateConflictsDeps,
  NavigationResult,
} from "./conflict-loop";
import { ResolveAction, ResolveActionResult } from "./conflict-resolve";

describe("navigateConflicts", () => {
  const repoRoot = "/fake/repo";

  const makeConflict = (
    filePath: string,
    classificationClass: ConflictRecord["classification"]["class"],
    hunks: ConflictRecord["hunks"] = [],
  ): ConflictRecord => ({
    filePath,
    hunks,
    classification: {
      class: classificationClass,
      reason: `${classificationClass} reason`,
    },
  });

  const makeDeps = (overrides: Partial<NavigateConflictsDeps> = {}): NavigateConflictsDeps => ({
    prompt: vi.fn().mockResolvedValue("auto"),
    apply: vi.fn().mockResolvedValue({ ok: true, action: "skip", auditEntry: "audit" }),
    resolveDivergent: vi.fn().mockResolvedValue({
      kind: "user_resolve_in_place",
      resolvedContent: "resolved",
      userReason: "user reason",
    } as ResolveAction),
    ...overrides,
  });

  // ---------------------------------------------------------------------------
  // 1. Batch summary correctness
  // ---------------------------------------------------------------------------
  it("presents batch summary with correct counts", async () => {
    const conflicts: ConflictRecord[] = [
      makeConflict("a.ts", "duplicate_content"),
      makeConflict("b.ts", "duplicate_content"),
      makeConflict("c.ts", "auto_resolvable_trivial", [
        { ours: "x", theirs: "x " },
      ]),
      makeConflict("d.ts", "auto_resolvable_trivial", [
        { ours: "y", theirs: "y " },
      ]),
      makeConflict("e.ts", "divergent_content", [
        { ours: "old", theirs: "new" },
      ]),
    ];

    const deps = makeDeps();
    await navigateConflicts({ conflicts, repoRoot, deps });

    expect(deps.prompt).toHaveBeenCalledTimes(1);
    const promptCall = (deps.prompt as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(promptCall).toContain("5 conflicts detected");
    expect(promptCall).toContain("auto-skippable: 2");
    expect(promptCall).toContain("auto-resolvable: 2");
    expect(promptCall).toContain("divergent (user input needed): 1");
  });

  // ---------------------------------------------------------------------------
  // 2. auto mode bulk + divergent prompt
  // ---------------------------------------------------------------------------
  it("auto mode applies auto-skip, auto-resolve, then resolveDivergent for each divergent", async () => {
    const conflicts: ConflictRecord[] = [
      makeConflict("dup.ts", "duplicate_content"),
      makeConflict("triv.ts", "auto_resolvable_trivial", [
        { ours: "line1\nline2", theirs: "line1 \nline2" },
      ]),
      makeConflict("div.ts", "divergent_content", [
        { ours: "old", theirs: "new" },
      ]),
    ];

    const deps = makeDeps({
      prompt: vi.fn().mockResolvedValue("auto"),
      apply: vi.fn().mockImplementation((_action, _filePath): Promise<ResolveActionResult> => {
        if (_action.kind === "skip") {
          return Promise.resolve({ ok: true, action: "skip", auditEntry: "skipped: dup" });
        }
        if (_action.kind === "auto_resolve") {
          return Promise.resolve({ ok: true, action: "auto_resolve", auditEntry: "auto-resolved: triv" });
        }
        if (_action.kind === "user_resolve_in_place") {
          return Promise.resolve({ ok: true, action: "user_resolve_in_place", auditEntry: "user-resolved: div" });
        }
        return Promise.resolve({ ok: true, action: "skip", auditEntry: "audit" });
      }),
      resolveDivergent: vi.fn().mockResolvedValue({
        kind: "user_resolve_in_place",
        resolvedContent: "user resolved",
        userReason: "accepted divergence",
      } as ResolveAction),
    });

    const result = await navigateConflicts({ conflicts, repoRoot, deps });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("auto");
    expect(result.applied).toHaveLength(3);

    // dup.ts — skip
    expect(deps.apply).toHaveBeenNthCalledWith(1, { kind: "skip", reason: "duplicate_content reason" }, "dup.ts", repoRoot);
    expect(result.applied[0]).toEqual({ filePath: "dup.ts", action: "skip", auditEntry: "skipped: dup" });

    // triv.ts — auto_resolve with THEIRS content joined
    expect(deps.apply).toHaveBeenNthCalledWith(
      2,
      { kind: "auto_resolve", resolvedContent: "line1 \nline2", reason: "auto_resolvable_trivial reason" },
      "triv.ts",
      repoRoot,
    );
    expect(result.applied[1]).toEqual({ filePath: "triv.ts", action: "auto_resolve", auditEntry: "auto-resolved: triv" });

    // div.ts — resolveDivergent called, then apply
    expect(deps.resolveDivergent).toHaveBeenCalledWith(conflicts[2]);
    expect(deps.apply).toHaveBeenNthCalledWith(
      3,
      { kind: "user_resolve_in_place", resolvedContent: "user resolved", userReason: "accepted divergence" },
      "div.ts",
      repoRoot,
    );
    expect(result.applied[2]).toEqual({ filePath: "div.ts", action: "user_resolve_in_place", auditEntry: "user-resolved: div" });
  });

  // ---------------------------------------------------------------------------
  // 3. step mode walks each conflict
  // ---------------------------------------------------------------------------
  it("step mode calls resolveDivergent + apply for every conflict in order", async () => {
    const conflicts: ConflictRecord[] = [
      makeConflict("a.ts", "duplicate_content"),
      makeConflict("b.ts", "auto_resolvable_trivial", [{ ours: "x", theirs: "x " }]),
      makeConflict("c.ts", "divergent_content", [{ ours: "old", theirs: "new" }]),
    ];

    const deps = makeDeps({
      prompt: vi.fn().mockResolvedValue("step"),
      apply: vi.fn().mockImplementation((_action, _filePath): Promise<ResolveActionResult> => {
        return Promise.resolve({ ok: true, action: _action.kind, auditEntry: `audit:${_filePath}` });
      }),
      resolveDivergent: vi.fn().mockResolvedValue({
        kind: "user_resolve_in_place",
        resolvedContent: "resolved",
        userReason: "step reason",
      } as ResolveAction),
    });

    const result = await navigateConflicts({ conflicts, repoRoot, deps });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("step");
    expect(result.applied).toHaveLength(3);

    expect(deps.resolveDivergent).toHaveBeenCalledTimes(3);
    expect(deps.resolveDivergent).toHaveBeenNthCalledWith(1, conflicts[0]);
    expect(deps.resolveDivergent).toHaveBeenNthCalledWith(2, conflicts[1]);
    expect(deps.resolveDivergent).toHaveBeenNthCalledWith(3, conflicts[2]);

    expect(deps.apply).toHaveBeenCalledTimes(3);
    expect(deps.apply).toHaveBeenNthCalledWith(1, expect.any(Object), "a.ts", repoRoot);
    expect(deps.apply).toHaveBeenNthCalledWith(2, expect.any(Object), "b.ts", repoRoot);
    expect(deps.apply).toHaveBeenNthCalledWith(3, expect.any(Object), "c.ts", repoRoot);
  });

  // ---------------------------------------------------------------------------
  // 4. abort mode
  // ---------------------------------------------------------------------------
  it("abort mode applies abort_rebase exactly once and returns mode abort", async () => {
    const conflicts: ConflictRecord[] = [
      makeConflict("a.ts", "divergent_content", [{ ours: "old", theirs: "new" }]),
    ];

    const deps = makeDeps({
      prompt: vi.fn().mockResolvedValue("abort"),
      apply: vi.fn().mockResolvedValue({ ok: true, action: "abort_rebase", auditEntry: "rebase-aborted: user-requested abort" }),
    });

    const result = await navigateConflicts({ conflicts, repoRoot, deps });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("abort");
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]).toEqual({
      filePath: "",
      action: "abort_rebase",
      auditEntry: "rebase-aborted: user-requested abort",
    });
    expect(deps.apply).toHaveBeenCalledTimes(1);
    expect(deps.apply).toHaveBeenCalledWith(
      { kind: "abort_rebase", userReason: "user-requested abort" },
      "",
      repoRoot,
    );
  });

  // ---------------------------------------------------------------------------
  // BONUS: Ambiguous reply re-prompts (max 3 attempts)
  // ---------------------------------------------------------------------------
  it("re-prompts on ambiguous reply up to 3 times, then aborts", async () => {
    const conflicts: ConflictRecord[] = [
      makeConflict("a.ts", "divergent_content", [{ ours: "old", theirs: "new" }]),
    ];

    const deps = makeDeps({
      prompt: vi.fn().mockResolvedValueOnce("maybe").mockResolvedValueOnce("maybe").mockResolvedValueOnce("auto"),
      apply: vi.fn().mockResolvedValue({ ok: true, action: "skip", auditEntry: "audit" }),
      resolveDivergent: vi.fn().mockResolvedValue({
        kind: "user_resolve_in_place",
        resolvedContent: "resolved",
        userReason: "user reason",
      } as ResolveAction),
    });

    const result = await navigateConflicts({ conflicts, repoRoot, deps });

    expect(deps.prompt).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("auto");
  });

  it("aborts after 3 ambiguous replies", async () => {
    const conflicts: ConflictRecord[] = [
      makeConflict("a.ts", "divergent_content", [{ ours: "old", theirs: "new" }]),
    ];

    const deps = makeDeps({
      prompt: vi.fn().mockResolvedValue("maybe"),
    });

    const result = await navigateConflicts({ conflicts, repoRoot, deps });

    expect(deps.prompt).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(false);
    expect(result.mode).toBe("abort");
    expect(result.applied).toEqual([]);
    expect(result.aborted).toEqual({ reason: "ambiguous_reply" });
  });

  // ---------------------------------------------------------------------------
  // BONUS: Apply failure stops loop
  // ---------------------------------------------------------------------------
  it("stops applying when an apply fails and does not process remaining conflicts", async () => {
    const conflicts: ConflictRecord[] = [
      makeConflict("a.ts", "duplicate_content"),
      makeConflict("b.ts", "auto_resolvable_trivial", [{ ours: "x", theirs: "x " }]),
      makeConflict("c.ts", "divergent_content", [{ ours: "old", theirs: "new" }]),
    ];

    const deps = makeDeps({
      prompt: vi.fn().mockResolvedValue("auto"),
      apply: vi.fn().mockImplementation((_action, _filePath): Promise<ResolveActionResult> => {
        if (_filePath === "b.ts") {
          return Promise.resolve({ ok: false, error: "GIT_FAILED", detail: "merge failed" });
        }
        return Promise.resolve({ ok: true, action: _action.kind, auditEntry: `audit:${_filePath}` });
      }),
      resolveDivergent: vi.fn().mockResolvedValue({
        kind: "user_resolve_in_place",
        resolvedContent: "resolved",
        userReason: "user reason",
      } as ResolveAction),
    });

    const result = await navigateConflicts({ conflicts, repoRoot, deps });

    expect(result.ok).toBe(false);
    expect(result.mode).toBe("auto");
    expect(result.aborted).toEqual({ reason: "apply_failed" });
    expect(deps.apply).toHaveBeenCalledTimes(2); // a.ts and b.ts only
    expect(deps.apply).not.toHaveBeenCalledWith(expect.any(Object), "c.ts", repoRoot);
  });

  // ---------------------------------------------------------------------------
  // BONUS: Empty conflicts array
  // ---------------------------------------------------------------------------
  it("returns empty applied list when no conflicts", async () => {
    const deps = makeDeps();
    const result = await navigateConflicts({ conflicts: [], repoRoot, deps });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("auto");
    expect(result.applied).toEqual([]);
    expect(deps.prompt).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // BONUS: resolveDivergent returns abort_rebase in auto mode
  // ---------------------------------------------------------------------------
  it("stops and returns aborted when resolveDivergent returns abort_rebase in auto mode", async () => {
    const conflicts: ConflictRecord[] = [
      makeConflict("a.ts", "duplicate_content"),
      makeConflict("b.ts", "divergent_content", [{ ours: "old", theirs: "new" }]),
      makeConflict("c.ts", "divergent_content", [{ ours: "old2", theirs: "new2" }]),
    ];

    const deps = makeDeps({
      prompt: vi.fn().mockResolvedValue("auto"),
      apply: vi.fn().mockResolvedValue({ ok: true, action: "abort_rebase", auditEntry: "aborted" }),
      resolveDivergent: vi.fn().mockResolvedValue({
        kind: "abort_rebase",
        userReason: "user rejected",
      } as ResolveAction),
    });

    const result = await navigateConflicts({ conflicts, repoRoot, deps });

    expect(result.ok).toBe(false);
    expect(result.mode).toBe("auto");
    expect(result.aborted).toEqual({ reason: "abort_rebase" });
    expect(deps.apply).toHaveBeenCalledTimes(2); // a.ts skip + b.ts abort_rebase
    expect(deps.apply).not.toHaveBeenCalledWith(expect.any(Object), "c.ts", repoRoot);
  });

  // ---------------------------------------------------------------------------
  // BONUS: resolveDivergent returns abort_rebase in step mode
  // ---------------------------------------------------------------------------
  it("stops and returns unresolved when resolveDivergent returns abort_rebase in step mode", async () => {
    const conflicts: ConflictRecord[] = [
      makeConflict("a.ts", "duplicate_content"),
      makeConflict("b.ts", "divergent_content", [{ ours: "old", theirs: "new" }]),
      makeConflict("c.ts", "divergent_content", [{ ours: "old2", theirs: "new2" }]),
    ];

    const deps = makeDeps({
      prompt: vi.fn().mockResolvedValue("step"),
      apply: vi.fn().mockResolvedValue({ ok: true, action: "abort_rebase", auditEntry: "aborted" }),
      resolveDivergent: vi.fn().mockImplementation((conflict): Promise<ResolveAction> => {
        if (conflict.filePath === "b.ts") {
          return Promise.resolve({ kind: "abort_rebase", userReason: "user rejected" });
        }
        return Promise.resolve({ kind: "user_resolve_in_place", resolvedContent: "resolved", userReason: "ok" });
      }),
    });

    const result = await navigateConflicts({ conflicts, repoRoot, deps });

    expect(result.ok).toBe(false);
    expect(result.mode).toBe("step");
    expect(result.aborted).toEqual({ reason: "abort_rebase" });
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved![0].filePath).toBe("c.ts");
    expect(deps.apply).toHaveBeenCalledTimes(2); // a.ts + b.ts abort
  });
});
