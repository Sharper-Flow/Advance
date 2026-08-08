/**
 * Bun structural guard for root CLI imports into plugin source.
 *
 * Run with: bun test bin/lib/cli-source-boundary.test.ts
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { dirname, join, normalize, relative, resolve } from "path";

const REPO_ROOT = resolve(import.meta.dir, "../..");
const BIN_ROOT = join(REPO_ROOT, "bin");
const PLUGIN_SRC = join(REPO_ROOT, "plugin/src");

const APPROVED_BIN_PLUGIN_IMPORTS = new Set([
  "../../plugin/src/shared/cli-projection",
  "../../../plugin/src/shared/cli-projection",
  "../../plugin/src/cli/projection-boundary",
]);

const FORBIDDEN_PLUGIN_SRC_PREFIXES = [
  "plugin/src/storage/",
  "plugin/src/tools/",
  "plugin/src/tool-registry",
  "plugin/src/plugin-init",
  "plugin/src/index",
];

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      out.push(...walkFiles(path));
    } else if (entry.endsWith(".ts") || path === join(BIN_ROOT, "adv")) {
      out.push(path);
    }
  }
  return out;
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const pattern =
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    specs.push(match[1]);
  }
  const dynamicPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((match = dynamicPattern.exec(source)) !== null) {
    specs.push(match[1]);
  }
  return specs;
}

function resolveRelativeImport(
  fromFile: string,
  specifier: string,
): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [base, `${base}.ts`, join(base, "index.ts")];
  return (
    candidates.find(
      (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
    ) ?? null
  );
}

function repoRelative(path: string): string {
  return normalize(relative(REPO_ROOT, path)).replaceAll("\\", "/");
}

function assertNoForbiddenPluginSrcPath(path: string) {
  const rel = repoRelative(path);
  for (const forbidden of FORBIDDEN_PLUGIN_SRC_PREFIXES) {
    expect(
      rel,
      `${rel} must not be reachable from CLI boundary`,
    ).not.toStartWith(forbidden);
  }
}

describe("root CLI plugin source boundary", () => {
  test("import scanner includes dynamic imports", () => {
    expect(importSpecifiers('await import("./local-module")')).toEqual([
      "./local-module",
    ]);
  });

  test("bin/adv and bin/lib import plugin source only through approved boundaries", () => {
    const violations: string[] = [];
    for (const file of walkFiles(BIN_ROOT)) {
      const source = readFileSync(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        if (
          specifier.includes("plugin/src") &&
          !APPROVED_BIN_PLUGIN_IMPORTS.has(specifier)
        ) {
          violations.push(`${repoRelative(file)} -> ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("Projection CLI boundary exists and avoids forbidden plugin internals transitively", () => {
    const boundary = join(PLUGIN_SRC, "cli/projection-boundary.ts");
    expect(existsSync(boundary)).toBe(true);

    const visited = new Set<string>();
    const stack = [boundary];
    while (stack.length > 0) {
      const file = stack.pop()!;
      if (visited.has(file)) continue;
      visited.add(file);
      assertNoForbiddenPluginSrcPath(file);

      const source = readFileSync(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        const next = resolveRelativeImport(file, specifier);
        if (next && next.startsWith(PLUGIN_SRC)) {
          stack.push(next);
        }
      }
    }
  });
});
