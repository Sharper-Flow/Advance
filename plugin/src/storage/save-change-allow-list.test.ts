import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async () => {
  const actual =
    await vi.importActual<typeof import("node:child_process")>(
      "node:child_process",
    );
  return {
    ...actual,
    execFileSync: vi.fn((...args: any[]) => actual.execFileSync(...args)),
    execSync: vi.fn((...args: any[]) => actual.execSync(...args)),
    execFile: vi.fn((...args: any[]) => actual.execFile(...args)),
    exec: vi.fn((...args: any[]) => actual.exec(...args)),
    spawn: vi.fn((...args: any[]) => actual.spawn(...args)),
    spawnSync: vi.fn((...args: any[]) => actual.spawnSync(...args)),
  };
});

import {
  execFileSync as mockedExecFileSync,
  execSync,
  execFile,
  exec,
  spawn,
  spawnSync,
} from "node:child_process";
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

  it("returns an empty array when the plugin/src scan root is missing", async () => {
    const fixtureRoot = await createTempDir("save-change-allow-list-");
    try {
      const calls = await findExecutableSaveChangeCalls(fixtureRoot);
      expect(calls).toEqual([]);
    } finally {
      await cleanupTempDir(fixtureRoot);
    }
  });

  it("produces deterministic output ordering across repeated scans", async () => {
    const first = await findExecutableSaveChangeCalls(repoRoot);
    const second = await findExecutableSaveChangeCalls(repoRoot);
    expect(first).toEqual(second);
    expect(first).toEqual(expect.arrayContaining([expect.any(Object)]));
  });
});

/**
 * Guard: the scanner must never shell out to an external process. It is the
 * source of the CI failure (`spawnSync rg ENOENT`) on GitHub Actions runners
 * that do not install ripgrep.
 *
 * Limit: Vitest module mocks intercept ESM imports of `node:child_process` in
 * this test file and its direct dependencies. They do NOT intercept dynamic
 * `require()` calls, native code that spawns processes, or subprocesses started
 * by transitive dependencies. This assertion is therefore a guard on the
 * intentional implementation surface, not a complete sandbox guarantee.
 */
describe("saveChange caller scan does not spawn processes", () => {
  it("never invokes a process-spawning function while scanning", async () => {
    // Verify the mock actually intercepted the ESM import of the built-in.
    // A non-mocked import would be the real Node function and would not have a
    // Vitest `.mock` property.
    expect(typeof (mockedExecFileSync as any).mock).toBe("object");

    mockedExecFileSync.mockClear();
    execSync.mockClear();
    execFile.mockClear();
    exec.mockClear();
    spawn.mockClear();
    spawnSync.mockClear();

    await findExecutableSaveChangeCalls(repoRoot);

    expect(mockedExecFileSync).not.toHaveBeenCalled();
    expect(execSync).not.toHaveBeenCalled();
    expect(execFile).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalled();
  });
});
