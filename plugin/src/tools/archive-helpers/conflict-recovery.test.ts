/**
 * Conflict recovery integration tests (T28 → T28d → T28b → T28c chain).
 *
 * J3 SCOPE EXPANSION — exercises the full classification → resolution → loop
 * integration with stubbed git/file deps.
 */

import { describe, it, expect, vi } from "vitest";
import { navigateConflicts, ConflictRecord } from "./conflict-loop";
import {
  applyResolveAction,
  ResolveAction,
  ResolveActionResult,
} from "./conflict-resolve";

describe("conflict-recovery matrix", () => {
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

  const makeApply = (
    depOverrides: Partial<Parameters<typeof applyResolveAction>[3]> = {},
  ) => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const gitAdd = vi.fn().mockResolvedValue({ ok: true });
    const gitRebaseSkip = vi.fn().mockResolvedValue({ ok: true });
    const gitRebaseContinue = vi.fn().mockResolvedValue({ ok: true });
    const gitRebaseAbort = vi.fn().mockResolvedValue({ ok: true });

    const calls: Array<{
      action: ResolveAction;
      filePath: string;
      repoRoot: string;
    }> = [];

    const apply = async (
      action: ResolveAction,
      filePath: string,
      repoRoot: string,
    ): Promise<ResolveActionResult> => {
      calls.push({ action, filePath, repoRoot });
      return applyResolveAction(action, filePath, repoRoot, {
        writeFile,
        gitAdd,
        gitRebaseSkip,
        gitRebaseContinue,
        gitRebaseAbort,
        ...depOverrides,
      });
    };

    return {
      apply,
      calls,
      writeFile,
      gitAdd,
      gitRebaseSkip,
      gitRebaseContinue,
      gitRebaseAbort,
    };
  };

  // -------------------------------------------------------------------------
  // Scenario 1: Clean rebase, no conflicts
  // -------------------------------------------------------------------------
  it(
    "S1 clean rebase: navigateConflicts with empty array returns ok=true, " +
      "no deps touched",
    async () => {
      const { apply, calls, gitRebaseSkip } = makeApply();

      const result = await navigateConflicts({
        conflicts: [],
        repoRoot,
        deps: { apply, prompt: vi.fn() },
      });

      expect(result.ok).toBe(true);
      expect(result.mode).toBe("auto");
      expect(result.applied).toEqual([]);
      expect(calls).toHaveLength(0);
      expect(gitRebaseSkip).not.toHaveBeenCalled();
    },
  );

  // -------------------------------------------------------------------------
  // Scenario 2: Single duplicate-content
  // -------------------------------------------------------------------------
  it("S2 duplicate-content: auto mode applies skip via git rebase --skip", async () => {
    const {
      apply,
      calls,
      writeFile,
      gitAdd,
      gitRebaseSkip,
      gitRebaseContinue,
    } = makeApply();
    const conflicts = [makeConflict("dup.ts", "duplicate_content")];

    const result = await navigateConflicts({
      conflicts,
      repoRoot,
      deps: {
        apply,
        prompt: vi.fn().mockResolvedValue("auto"),
        resolveDivergent: vi.fn(),
      },
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("auto");
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]).toEqual({
      filePath: "dup.ts",
      action: "skip",
      auditEntry: "skipped: duplicate_content reason",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].action).toEqual({
      kind: "skip",
      reason: "duplicate_content reason",
    });
    expect(calls[0].filePath).toBe("dup.ts");
    expect(calls[0].repoRoot).toBe(repoRoot);

    expect(gitRebaseSkip).toHaveBeenCalledTimes(1);
    expect(gitRebaseSkip).toHaveBeenCalledWith(repoRoot);
    expect(writeFile).not.toHaveBeenCalled();
    expect(gitAdd).not.toHaveBeenCalled();
    expect(gitRebaseContinue).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Single auto-resolvable trivial
  // -------------------------------------------------------------------------
  it(
    "S3 auto-resolvable trivial: auto mode writes THEIRS content, " +
      "git add, continue",
    async () => {
      const {
        apply,
        calls,
        writeFile,
        gitAdd,
        gitRebaseSkip,
        gitRebaseContinue,
      } = makeApply();
      const conflicts = [
        makeConflict("triv.ts", "auto_resolvable_trivial", [
          { ours: "line1\nline2", theirs: "line1 \nline2" },
        ]),
      ];

      const result = await navigateConflicts({
        conflicts,
        repoRoot,
        deps: {
          apply,
          prompt: vi.fn().mockResolvedValue("auto"),
          resolveDivergent: vi.fn(),
        },
      });

      expect(result.ok).toBe(true);
      expect(result.mode).toBe("auto");
      expect(result.applied).toHaveLength(1);
      expect(result.applied[0]).toEqual({
        filePath: "triv.ts",
        action: "auto_resolve",
        auditEntry: "auto-resolved: auto_resolvable_trivial reason",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].action).toEqual({
        kind: "auto_resolve",
        resolvedContent: "line1 \nline2",
        reason: "auto_resolvable_trivial reason",
      });

      expect(writeFile).toHaveBeenCalledTimes(1);
      expect(writeFile).toHaveBeenCalledWith("triv.ts", "line1 \nline2");
      expect(gitAdd).toHaveBeenCalledTimes(1);
      expect(gitAdd).toHaveBeenCalledWith("triv.ts", repoRoot);
      expect(gitRebaseContinue).toHaveBeenCalledTimes(1);
      expect(gitRebaseContinue).toHaveBeenCalledWith(repoRoot);
      expect(gitRebaseSkip).not.toHaveBeenCalled();
    },
  );

  // -------------------------------------------------------------------------
  // Scenario 4: Single divergent → user resolve-in-place
  // -------------------------------------------------------------------------
  it(
    "S4 divergent step mode: resolveDivergent returns user_resolve_in_place, " +
      "writes user content",
    async () => {
      const {
        apply,
        calls,
        writeFile,
        gitAdd,
        gitRebaseSkip,
        gitRebaseContinue,
      } = makeApply();
      const conflicts = [
        makeConflict("div.ts", "divergent_content", [
          { ours: "old", theirs: "new" },
        ]),
      ];

      const result = await navigateConflicts({
        conflicts,
        repoRoot,
        deps: {
          apply,
          prompt: vi.fn().mockResolvedValue("step"),
          resolveDivergent: vi.fn().mockResolvedValue({
            kind: "user_resolve_in_place",
            resolvedContent: "user fixed content",
            userReason: "fixed manually",
          } as ResolveAction),
        },
      });

      expect(result.ok).toBe(true);
      expect(result.mode).toBe("step");
      expect(result.applied).toHaveLength(1);
      expect(result.applied[0]).toEqual({
        filePath: "div.ts",
        action: "user_resolve_in_place",
        auditEntry: "user-resolved-in-place: fixed manually",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].action).toEqual({
        kind: "user_resolve_in_place",
        resolvedContent: "user fixed content",
        userReason: "fixed manually",
      });

      expect(writeFile).toHaveBeenCalledTimes(1);
      expect(writeFile).toHaveBeenCalledWith("div.ts", "user fixed content");
      expect(gitAdd).toHaveBeenCalledTimes(1);
      expect(gitAdd).toHaveBeenCalledWith("div.ts", repoRoot);
      expect(gitRebaseContinue).toHaveBeenCalledTimes(1);
      expect(gitRebaseContinue).toHaveBeenCalledWith(repoRoot);
      expect(gitRebaseSkip).not.toHaveBeenCalled();
    },
  );

  // -------------------------------------------------------------------------
  // Scenario 5: Multi-mixed (1 duplicate + 1 trivial + 1 divergent)
  // -------------------------------------------------------------------------
  it(
    "S5 multi-mixed: batch summary buckets correctly, applies " +
      "skip → auto_resolve → user_resolve_in_place",
    async () => {
      const {
        apply,
        calls,
        writeFile,
        gitAdd,
        gitRebaseSkip,
        gitRebaseContinue,
      } = makeApply();
      const conflicts = [
        makeConflict("dup.ts", "duplicate_content"),
        makeConflict("triv.ts", "auto_resolvable_trivial", [
          { ours: "x", theirs: "x " },
        ]),
        makeConflict("div.ts", "divergent_content", [
          { ours: "old", theirs: "new" },
        ]),
      ];

      const prompt = vi.fn().mockResolvedValue("auto");
      const resolveDivergent = vi.fn().mockResolvedValue({
        kind: "user_resolve_in_place",
        resolvedContent: "user resolved div",
        userReason: "user accepted divergence",
      } as ResolveAction);

      const result = await navigateConflicts({
        conflicts,
        repoRoot,
        deps: { apply, prompt, resolveDivergent },
      });

      // Batch summary assertions
      expect(prompt).toHaveBeenCalledTimes(1);
      const summary = vi.mocked(prompt).mock.calls[0][0] as string;
      expect(summary).toContain("3 conflicts detected");
      expect(summary).toContain("auto-skippable: 1");
      expect(summary).toContain("auto-resolvable: 1");
      expect(summary).toContain("divergent (user input needed): 1");

      // Applied in order
      expect(result.ok).toBe(true);
      expect(result.mode).toBe("auto");
      expect(result.applied).toHaveLength(3);

      expect(result.applied[0]).toEqual({
        filePath: "dup.ts",
        action: "skip",
        auditEntry: "skipped: duplicate_content reason",
      });
      expect(result.applied[1]).toEqual({
        filePath: "triv.ts",
        action: "auto_resolve",
        auditEntry: "auto-resolved: auto_resolvable_trivial reason",
      });
      expect(result.applied[2]).toEqual({
        filePath: "div.ts",
        action: "user_resolve_in_place",
        auditEntry: "user-resolved-in-place: user accepted divergence",
      });

      // Call tracking
      expect(calls).toHaveLength(3);
      expect(calls[0].action.kind).toBe("skip");
      expect(calls[1].action.kind).toBe("auto_resolve");
      expect(calls[2].action.kind).toBe("user_resolve_in_place");

      // Git ops
      expect(gitRebaseSkip).toHaveBeenCalledTimes(1);
      expect(gitRebaseSkip).toHaveBeenCalledWith(repoRoot);

      expect(writeFile).toHaveBeenCalledTimes(2);
      expect(writeFile).toHaveBeenNthCalledWith(1, "triv.ts", "x ");
      expect(writeFile).toHaveBeenNthCalledWith(
        2,
        "div.ts",
        "user resolved div",
      );

      expect(gitAdd).toHaveBeenCalledTimes(2);
      expect(gitAdd).toHaveBeenNthCalledWith(1, "triv.ts", repoRoot);
      expect(gitAdd).toHaveBeenNthCalledWith(2, "div.ts", repoRoot);

      expect(gitRebaseContinue).toHaveBeenCalledTimes(2);
      expect(gitRebaseContinue).toHaveBeenNthCalledWith(1, repoRoot);
      expect(gitRebaseContinue).toHaveBeenNthCalledWith(2, repoRoot);
    },
  );
});
