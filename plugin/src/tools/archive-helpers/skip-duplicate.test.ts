/**
 * Skip-duplicate detection tests — pure unit tests with injected deps.
 */

import { describe, it, expect } from "vitest";
import { detectSkipDuplicate, SkipDuplicateDeps } from "./skip-duplicate";

describe("detectSkipDuplicate", () => {
  const defaultBranch = "main";
  const filePath = "src/foo.ts";
  const repoRoot = "/fake/repo";

  // Helper to build minimal deps
  const makeDeps = (
    overrides: Partial<SkipDuplicateDeps> = {},
  ): SkipDuplicateDeps => ({
    resolveDefaultBranch: async () => defaultBranch,
    treeAt: async () => "abc123",
    currentCommitRef: "REBASE_HEAD",
    ...overrides,
  });

  // ---------------------------------------------------------------------------
  // RED 1: Duplicate-content commit detected
  // ---------------------------------------------------------------------------
  it("returns isDuplicate=true when trees match", async () => {
    const deps = makeDeps({
      treeAt: async (_ref, _path, _cwd) => "same-oid-123",
    });

    const result = await detectSkipDuplicate(filePath, repoRoot, deps);

    expect(result.isDuplicate).toBe(true);
    expect(result.reason).toBe(
      "duplicate-content commit (already on default branch)",
    );
    expect(result.defaultBranch).toBe("main");
  });

  // ---------------------------------------------------------------------------
  // RED 2: Content-divergent conflict surfaced
  // ---------------------------------------------------------------------------
  it("returns isDuplicate=false with divergence reason when trees differ", async () => {
    let callCount = 0;
    const deps = makeDeps({
      treeAt: async (_ref, _path, _cwd) => {
        callCount++;
        return callCount === 1 ? "oid-current-456" : "oid-origin-789";
      },
    });

    const result = await detectSkipDuplicate(filePath, repoRoot, deps);

    expect(result.isDuplicate).toBe(false);
    expect(result.reason).toContain("divergent content");
    expect(result.defaultBranch).toBe("main");
  });

  // ---------------------------------------------------------------------------
  // BONUS: Missing tree-at-current
  // ---------------------------------------------------------------------------
  it("returns isDuplicate=false when current commit has no tree at path", async () => {
    const deps = makeDeps({
      treeAt: async (_ref, _path, _cwd) => {
        return _ref === "REBASE_HEAD" ? null : "oid-origin-789";
      },
    });

    const result = await detectSkipDuplicate(filePath, repoRoot, deps);

    expect(result.isDuplicate).toBe(false);
    expect(result.reason).toContain("missing at current commit");
    expect(result.defaultBranch).toBe("main");
  });

  // ---------------------------------------------------------------------------
  // BONUS: Default-branch unresolvable
  // ---------------------------------------------------------------------------
  it("returns isDuplicate=false with default_branch_unresolvable when branch cannot be resolved", async () => {
    const deps = makeDeps({
      resolveDefaultBranch: async () => null,
    });

    const result = await detectSkipDuplicate(filePath, repoRoot, deps);

    expect(result.isDuplicate).toBe(false);
    expect(result.reason).toBe("default_branch_unresolvable");
    expect(result.defaultBranch).toBe("");
  });

  // ---------------------------------------------------------------------------
  // BONUS: Missing tree-at-origin
  // ---------------------------------------------------------------------------
  it("returns isDuplicate=false when default branch has no tree at path", async () => {
    const deps = makeDeps({
      treeAt: async (_ref, _path, _cwd) => {
        return _ref.startsWith("origin/") ? null : "oid-current-456";
      },
    });

    const result = await detectSkipDuplicate(filePath, repoRoot, deps);

    expect(result.isDuplicate).toBe(false);
    expect(result.reason).toContain("missing on default branch");
    expect(result.defaultBranch).toBe("main");
  });

  // ---------------------------------------------------------------------------
  // BONUS: Both trees missing
  // ---------------------------------------------------------------------------
  it("returns isDuplicate=false when both trees are missing", async () => {
    const deps = makeDeps({
      treeAt: async () => null,
    });

    const result = await detectSkipDuplicate(filePath, repoRoot, deps);

    expect(result.isDuplicate).toBe(false);
    expect(result.reason).toContain("missing at current commit");
    expect(result.reason).toContain("missing on default branch");
    expect(result.defaultBranch).toBe("main");
  });

  // ---------------------------------------------------------------------------
  // BONUS: Custom currentCommitRef
  // ---------------------------------------------------------------------------
  it("uses custom currentCommitRef when provided", async () => {
    const requestedRefs: string[] = [];
    const deps = makeDeps({
      currentCommitRef: "deadbeef",
      treeAt: async (ref, _path, _cwd) => {
        requestedRefs.push(ref);
        return "same-oid";
      },
    });

    await detectSkipDuplicate(filePath, repoRoot, deps);

    expect(requestedRefs).toContain("deadbeef");
  });

  // ---------------------------------------------------------------------------
  // BONUS: resolveDefaultBranch throws
  // ---------------------------------------------------------------------------
  it("returns default_branch_unresolvable when resolveDefaultBranch throws", async () => {
    const deps = makeDeps({
      resolveDefaultBranch: async () => {
        throw new Error("git error");
      },
    });

    const result = await detectSkipDuplicate(filePath, repoRoot, deps);

    expect(result.isDuplicate).toBe(false);
    expect(result.reason).toBe("default_branch_unresolvable");
    expect(result.defaultBranch).toBe("");
  });
});
