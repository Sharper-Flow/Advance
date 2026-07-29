import { describe, expect, it } from "vitest";
import {
  collectSaveChangeCallSitesFromText,
  findExecutableSaveChangeCalls,
  isAllowedSaveChangeCaller,
} from "./save-change-allow-list";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(import.meta.filename), "../../..");

/**
 * Mechanical guard: every executable `saveChange(...)` call site in plugin/src
 * must be listed in the save-change allow-list with a rationale. Unlisted
 * callers indicate an active-projection write that bypasses the storage-owned
 * conditional commit boundary.
 *
 * Detection uses the TypeScript AST so literals, line comments, and block
 * comments cannot self-match.
 */
describe("saveChange caller inventory", () => {
  it("has no unenumerated active-projection raw saveChange callers", async () => {
    const calls = await findExecutableSaveChangeCalls(repoRoot);
    const violations: string[] = [];

    for (const call of calls) {
      const { allowed } = isAllowedSaveChangeCaller(call.file, call.contexts);
      if (!allowed) {
        violations.push(
          `${call.file}:${call.line}:${call.column}: ${call.content.trim()}`,
        );
      }
    }

    expect(violations).toEqual([]);
  });
});

describe("saveChange AST call detection", () => {
  it("ignores literals and comments but flags an executable unallowlisted call", () => {
    const source = `
      // A line comment containing saveChange( must not be treated as a call.
      /* A block comment containing saveChange( must also be ignored. */
      const searchLiteral = "export async function saveChange(path, change)";
      function suspiciousWriter() {
        saveChange("plugin/src/storage/unknown.ts", {});
      }
    `;
    const calls = collectSaveChangeCallSitesFromText(
      source,
      "plugin/src/storage/unknown-fixture.ts",
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].contexts).toContain("suspiciousWriter");
    expect(
      isAllowedSaveChangeCaller(calls[0].file, calls[0].contexts).allowed,
    ).toBe(false);
  });
});
