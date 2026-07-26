import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { isAllowedSaveChangeCaller } from "./save-change-allow-list";

const repoRoot = resolve(dirname(import.meta.filename), "../../..");

/**
 * Mechanical guard: every raw `saveChange(` call site in plugin/src must be
 * listed in the save-change allow-list with a rationale. Unlisted callers
 * indicate an active-projection write that bypasses the storage-owned
 * conditional commit boundary.
 */
describe("saveChange caller inventory", () => {
  it("has no unenumerated active-projection raw saveChange callers", async () => {
    const output = execSync(
      'rg --vimgrep "saveChange\\(" plugin/src --type ts',
      { cwd: repoRoot, encoding: "utf-8" },
    );
    const lines = output.split("\n").filter(Boolean);
    const violations: string[] = [];

    for (const line of lines) {
      const [file, lineNo, column, ...rest] = line.split(":");
      const content = rest.join(":");
      if (!file) continue;

      const absoluteFile = resolve(repoRoot, file);
      const fileContent = await readFile(absoluteFile, "utf-8");
      const linesArray = fileContent.split("\n");
      const idx = Number(lineNo) - 1;
      const callLine = linesArray[idx];

      // Skip comment-only lines and the helper definition line.
      const trimmed = callLine.trim();
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("/*")
      ) {
        continue;
      }
      if (trimmed.startsWith("export async function saveChange(")) {
        continue;
      }

      // Walk up to collect containing function/method names.
      const contexts: string[] = [];
      for (let i = idx - 1; i >= 0 && contexts.length < 8; i--) {
        const l = linesArray[i];
        const fnMatch = l.match(
          /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
        );
        if (fnMatch) {
          contexts.push(fnMatch[1]);
          continue;
        }
        const methodMatch = l.match(
          /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*(?:async\s+)?\(/,
        );
        if (methodMatch) {
          contexts.push(methodMatch[1]);
          continue;
        }
        const arrowMatch = l.match(
          /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/,
        );
        if (arrowMatch) {
          contexts.push(arrowMatch[1]);
        }
      }

      const { allowed } = isAllowedSaveChangeCaller(file, contexts);
      if (!allowed) {
        violations.push(`${file}:${lineNo}:${column}: ${content.trim()}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
