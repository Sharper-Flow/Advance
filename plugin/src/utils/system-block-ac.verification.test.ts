/**
 * AC1+AC8 standalone verification tests
 *
 * - AC1: zero `output.system.push(` call sites remain in plugin/src/index.ts
 *   (only doc comments may reference the prior pattern).
 * - AC8: assembleSystemBlock() places `--- ADV:VOLATILE ---` between stable
 *   header and volatile suffix ONLY when both exist; never as an orphan
 *   divider (no leading or trailing sentinel).
 *
 * Marked separate_verification per task metadata; runs alongside the
 * inline TDD suite in system-block.test.ts but owns no behavioral
 * branches itself.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  VOLATILE_SENTINEL,
  assembleSystemBlock,
  type AssembleSystemBlockState,
} from "./system-block";

const cleanState = (
  overrides: Partial<AssembleSystemBlockState> = {},
): AssembleSystemBlockState => ({
  activeChange: { id: null, objective: null },
  lastCompletedTask: null,
  isWorktree: false,
  lastSessionHealthIssue: null,
  ...overrides,
});

const indexPath = resolve(__dirname, "..", "index.ts");
const indexSource = readFileSync(indexPath, "utf8");

// Strip line-comments and block-comments before grepping. We only want to
// detect *real* code call sites — the post-refactor file legitimately
// references the prior pattern in doc comments to explain why the
// refactor exists. Greps must look only at executable code.
function stripComments(source: string): string {
  // Remove block comments (non-greedy, including doc comments).
  const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove single-line // comments (preserve newlines so line counts
  // remain meaningful for any future failure messages).
  return noBlock
    .split(/\r?\n/)
    .map((line) => {
      // Naive but sufficient: strip everything from a `//` to end of line,
      // unless inside a string literal. Since we only scan for the literal
      // sequence `output.system.push(`, a naive strip is safe — the
      // sequence does not occur inside string literals in this file.
      const idx = line.indexOf("//");
      if (idx === -1) return line;
      return line.slice(0, idx);
    })
    .join("\n");
}

describe("AC1 — single-entry emission contract", () => {
  it("plugin/src/index.ts has zero `output.system.push(` call sites in code", () => {
    const code = stripComments(indexSource);
    const matches = code.match(/output\.system\.push\(/g);
    expect(matches).toBeNull();
  });

  it("plugin/src/index.ts has at least one applyAdvSystemBlock(...) call site", () => {
    const code = stripComments(indexSource);
    const matches = code.match(/applyAdvSystemBlock\(/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(1);
  });
});

describe("AC8 — sentinel placement invariants", () => {
  it("emits sentinel only when BOTH stable and volatile content exist", () => {
    const block = assembleSystemBlock({
      state: cleanState({
        activeChange: { id: "c1", objective: null },
        lastCompletedTask: { id: "tk-1", title: "Foo" },
      }),
      initError: null,
      storeAvailable: true,
      existingSystem: null,
    });
    expect(block).not.toBeNull();
    expect(block).toContain(VOLATILE_SENTINEL);
  });

  it("never emits a leading sentinel (stable-only)", () => {
    const block = assembleSystemBlock({
      state: cleanState({
        activeChange: { id: "c1", objective: null },
        lastCompletedTask: null,
      }),
      initError: null,
      storeAvailable: true,
      existingSystem: null,
    });
    expect(block).not.toBeNull();
    expect(block).not.toContain(VOLATILE_SENTINEL);
    expect(block!.startsWith(VOLATILE_SENTINEL)).toBe(false);
  });

  it("never emits a trailing sentinel (volatile-only)", () => {
    const block = assembleSystemBlock({
      state: cleanState({
        activeChange: { id: null, objective: null },
        lastCompletedTask: { id: "tk-1", title: "Foo" },
      }),
      initError: null,
      storeAvailable: true,
      existingSystem: null,
    });
    expect(block).not.toBeNull();
    expect(block).not.toContain(VOLATILE_SENTINEL);
    expect(block!.endsWith(VOLATILE_SENTINEL)).toBe(false);
  });

  it("sentinel appears at most once per block", () => {
    const block = assembleSystemBlock({
      state: cleanState({
        activeChange: { id: "c1", objective: null },
        lastCompletedTask: { id: "tk-1", title: "Foo" },
      }),
      initError: null,
      storeAvailable: true,
      existingSystem: null,
    });
    expect(block).not.toBeNull();
    const occurrences = block!.split(VOLATILE_SENTINEL).length - 1;
    expect(occurrences).toBe(1);
  });
});
