import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  collectSaveChangeCallSitesFromText,
  findExecutableSaveChangeCalls,
  isAllowedSaveChangeCaller,
} from "./save-change-allow-list";
import { dirname, resolve } from "node:path";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";

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
      function spacedSuspiciousWriter() {
        saveChange ("plugin/src/storage/unknown.ts", {});
      }
      class Writer {
        suspiciousMethod() {
          saveChange("plugin/src/storage/unknown.ts", {});
        }
      }
    `;
    const calls = collectSaveChangeCallSitesFromText(
      source,
      "plugin/src/storage/unknown-fixture.ts",
    );

    expect(calls).toHaveLength(3);
    expect(calls[0].contexts).toContain("suspiciousWriter");
    expect(calls[1].contexts).toContain("spacedSuspiciousWriter");
    expect(calls[2].contexts).toContain("suspiciousMethod");
    for (const call of calls) {
      expect(isAllowedSaveChangeCaller(call.file, call.contexts).allowed).toBe(
        false,
      );
    }
  });

  it("prefilters candidate files before AST validation", async () => {
    const fixtureRoot = await createTempDir("save-change-allow-list-");
    try {
      const storageDir = join(fixtureRoot, "plugin/src/storage");
      await mkdir(storageDir, { recursive: true });
      await writeFile(
        join(storageDir, "writer.ts"),
        `// saveChange comment is a candidate but not a call.\nsaveChange("x", {});`,
      );
      await writeFile(
        join(storageDir, "malformed-unrelated.ts"),
        "this is not valid TypeScript and must not be parsed",
      );

      const calls = await findExecutableSaveChangeCalls(fixtureRoot);

      expect(calls).toEqual([
        expect.objectContaining({
          file: "plugin/src/storage/writer.ts",
          line: 2,
        }),
      ]);
    } finally {
      await cleanupTempDir(fixtureRoot);
    }
  });
});
