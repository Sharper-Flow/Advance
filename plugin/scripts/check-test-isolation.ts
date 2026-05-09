#!/usr/bin/env node
/**
 * CI lint script: ensure test files calling adv_change_create / changeCreate
 * use isolated project setup (createTempDir / tmpdir / os.tmpdir).
 */

import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";

export const ALLOWLIST = [
  /-assets\.test\.ts$/,
  /target-project\.test\.ts$/,
];

export function isAllowlisted(filePath: string): boolean {
  return ALLOWLIST.some((pattern) => pattern.test(filePath));
}

/**
 * Strip comments from TypeScript-like source so we don't
 * flag occurrences inside comments or string literals.
 */
export function stripCommentsAndStrings(source: string): string {
  // Remove single-line comments
  let cleaned = source.replace(/\/\/.*$/gm, "");
  // Remove multi-line comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove string literals (double quotes, single quotes, template literals)
  cleaned = cleaned.replace(/`(?:[^`\\]|\\.)*`/g, "``");
  cleaned = cleaned.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  cleaned = cleaned.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  return cleaned;
}

export function hasApiCall(source: string): boolean {
  const cleaned = stripCommentsAndStrings(source);
  return (
    /\badv_change_create\b/.test(cleaned) ||
    /\bchangeCreate\b/.test(cleaned) ||
    /\bgetWorktreeBase\b/.test(cleaned) ||
    /\bgetDataHome\b/.test(cleaned)
  );
}

export function hasIsolation(source: string): boolean {
  return (
    /\bcreateTempDir\b/.test(source) ||
    /\btmpdir\b/.test(source) ||
    /\bos\.tmpdir\b/.test(source) ||
    /\bXDG_DATA_HOME\b/.test(source)
  );
}

export async function* walkTestFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkTestFiles(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      yield fullPath;
    }
  }
}

export async function runLint(targetDir: string): Promise<string[]> {
  const srcDir = join(targetDir, "src");
  const violations: string[] = [];

  try {
    for await (const filePath of walkTestFiles(srcDir)) {
      const relPath = relative(srcDir, filePath);

      if (isAllowlisted(relPath)) {
        continue;
      }

      const source = await readFile(filePath, "utf-8");

      if (hasApiCall(source) && !hasIsolation(source)) {
        violations.push(relPath);
      }
    }
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(`Source directory not found: ${srcDir}`);
    }
    throw err;
  }

  return violations;
}

async function main() {
  const targetDir = process.argv[2] || process.cwd();
  const violations = await runLint(targetDir);

  if (violations.length > 0) {
    for (const v of violations) {
      console.log(v);
    }
    process.exit(1);
  }
}

main();
