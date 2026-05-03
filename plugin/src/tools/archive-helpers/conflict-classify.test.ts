/**
 * Conflict classification taxonomy tests (T28d — J3 SCOPE EXPANSION).
 */

import { describe, it, expect } from "vitest";
import {
  classifyConflict,
  ConflictClassifyDeps,
  ConflictHunk,
} from "./conflict-classify";

describe("classifyConflict", () => {
  const filePath = "src/foo.ts";
  const repoRoot = "/fake/repo";

  const makeDeps = (
    overrides: Partial<ConflictClassifyDeps> = {},
  ): ConflictClassifyDeps => ({
    isDuplicate: async () => false,
    ...overrides,
  });

  // ---------------------------------------------------------------------------
  // 1. Duplicate-content (T28 case)
  // ---------------------------------------------------------------------------
  it('returns "duplicate_content" when isDuplicate is true', async () => {
    const deps = makeDeps({
      isDuplicate: async () => true,
    });

    const result = await classifyConflict(
      filePath,
      [{ ours: "anything", theirs: "anything" }],
      repoRoot,
      deps,
    );

    expect(result.class).toBe("duplicate_content");
    expect(result.reason).toBe(
      "duplicate-content commit (T28: tree matches origin/<default>)",
    );
  });

  // ---------------------------------------------------------------------------
  // 2. Whitespace-only conflict
  // ---------------------------------------------------------------------------
  it('returns "auto_resolvable_trivial" for whitespace-only differences', async () => {
    const deps = makeDeps();
    const hunks: ConflictHunk[] = [{ ours: "  hello\n", theirs: "hello\n" }];

    const result = await classifyConflict(filePath, hunks, repoRoot, deps);

    expect(result.class).toBe("auto_resolvable_trivial");
    expect(result.reason).toBe(
      "whitespace-only conflict; auto-resolve to incoming",
    );
  });

  // ---------------------------------------------------------------------------
  // 3. Line-ending-only conflict
  // ---------------------------------------------------------------------------
  it('returns "auto_resolvable_trivial" for CRLF vs LF differences', async () => {
    const deps = makeDeps();
    const hunks: ConflictHunk[] = [{ ours: "hello\r\n", theirs: "hello\n" }];

    const result = await classifyConflict(filePath, hunks, repoRoot, deps);

    expect(result.class).toBe("auto_resolvable_trivial");
    expect(result.reason).toBe(
      "whitespace-only conflict; auto-resolve to incoming",
    );
  });

  // ---------------------------------------------------------------------------
  // 4. Semantic divergence
  // ---------------------------------------------------------------------------
  it('returns "divergent_content" for semantic differences', async () => {
    const deps = makeDeps();
    const hunks: ConflictHunk[] = [{ ours: "let x = 1", theirs: "let x = 2" }];

    const result = await classifyConflict(filePath, hunks, repoRoot, deps);

    expect(result.class).toBe("divergent_content");
    expect(result.reason).toBe("1 hunk(s) require user resolution");
  });

  // ---------------------------------------------------------------------------
  // 5. Malformed conflict input — empty array
  // ---------------------------------------------------------------------------
  it('returns "divergent_content" for empty hunk array', async () => {
    const deps = makeDeps();

    const result = await classifyConflict(filePath, [], repoRoot, deps);

    expect(result.class).toBe("divergent_content");
    expect(result.reason).toBe(
      "malformed conflict input — caller should handle as divergent",
    );
  });

  // ---------------------------------------------------------------------------
  // BONUS: Malformed conflict input — missing ours/theirs
  // ---------------------------------------------------------------------------
  it('returns "divergent_content" when a hunk is missing ours or theirs', async () => {
    const deps = makeDeps();

    // Missing theirs
    const resultMissingTheirs = await classifyConflict(
      filePath,
      [{ ours: "hello", theirs: "" }],
      repoRoot,
      deps,
    );
    expect(resultMissingTheirs.class).toBe("divergent_content");
    expect(resultMissingTheirs.reason).toBe(
      "malformed conflict input — caller should handle as divergent",
    );

    // Missing ours
    const resultMissingOurs = await classifyConflict(
      filePath,
      [{ ours: "", theirs: "hello" }],
      repoRoot,
      deps,
    );
    expect(resultMissingOurs.class).toBe("divergent_content");
    expect(resultMissingOurs.reason).toBe(
      "malformed conflict input — caller should handle as divergent",
    );
  });

  // ---------------------------------------------------------------------------
  // BONUS: Multiple trivial hunks
  // ---------------------------------------------------------------------------
  it('returns "auto_resolvable_trivial" when all hunks are trivial', async () => {
    const deps = makeDeps();
    const hunks: ConflictHunk[] = [
      { ours: "  hello\n", theirs: "hello\n" },
      { ours: "world\r\n", theirs: "world\n" },
    ];

    const result = await classifyConflict(filePath, hunks, repoRoot, deps);

    expect(result.class).toBe("auto_resolvable_trivial");
  });

  // ---------------------------------------------------------------------------
  // BONUS: Mixed trivial + semantic hunks
  // ---------------------------------------------------------------------------
  it('returns "divergent_content" when any hunk is semantic', async () => {
    const deps = makeDeps();
    const hunks: ConflictHunk[] = [
      { ours: "  hello\n", theirs: "hello\n" },
      { ours: "let x = 1", theirs: "let x = 2" },
    ];

    const result = await classifyConflict(filePath, hunks, repoRoot, deps);

    expect(result.class).toBe("divergent_content");
    expect(result.reason).toBe("2 hunk(s) require user resolution");
  });

  // ---------------------------------------------------------------------------
  // BONUS: isDuplicate throws — falls through to trivial/divergent
  // ---------------------------------------------------------------------------
  it("falls through to trivial check when isDuplicate throws", async () => {
    const deps = makeDeps({
      isDuplicate: async () => {
        throw new Error("git failure");
      },
    });
    const hunks: ConflictHunk[] = [{ ours: "  hello\n", theirs: "hello\n" }];

    const result = await classifyConflict(filePath, hunks, repoRoot, deps);

    expect(result.class).toBe("auto_resolvable_trivial");
  });

  // ---------------------------------------------------------------------------
  // BONUS: Multi-line whitespace collapse
  // ---------------------------------------------------------------------------
  it("collapses internal whitespace runs for trivial comparison", async () => {
    const deps = makeDeps();
    const hunks: ConflictHunk[] = [
      { ours: "hello    world", theirs: "hello world" },
    ];

    const result = await classifyConflict(filePath, hunks, repoRoot, deps);

    expect(result.class).toBe("auto_resolvable_trivial");
  });
});
