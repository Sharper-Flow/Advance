import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, relative, dirname, join } from "node:path";

import tsupConfig from "../tsup.config";

const PLUGIN_ROOT = resolve(__dirname, "..");

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function entryRoots(): string[] {
  const knip = readJson(resolve(PLUGIN_ROOT, "knip.json"));
  return Array.isArray(knip.entry) &&
    knip.entry.every((entry) => typeof entry === "string")
    ? knip.entry
    : [];
}

function packageScriptTypeScriptPaths(): string[] {
  const packageJson = readJson(resolve(PLUGIN_ROOT, "package.json"));
  const scripts = packageJson.scripts;
  if (
    scripts === null ||
    typeof scripts !== "object" ||
    Array.isArray(scripts)
  ) {
    return [];
  }

  const paths = new Set<string>();
  const pathPattern =
    /(?:^|[\s"'`])((?:scripts|src)\/[A-Za-z0-9_./-]+\.ts)(?=$|[\s"'`;&|])/g;
  for (const command of Object.values(scripts)) {
    if (typeof command !== "string") continue;
    for (const match of command.matchAll(pathPattern)) paths.add(match[1]);
  }
  return [...paths].sort();
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern =
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  for (const match of source.matchAll(
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  )) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

function resolveSourceImport(
  fromFile: string,
  specifier: string,
): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), specifier.replace(/\.js$/, ""));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
  ];
  return (
    candidates.find((candidate) => {
      try {
        return readFileSync(candidate, "utf8") !== undefined;
      } catch {
        return false;
      }
    }) ?? null
  );
}

function reachableSourceFiles(roots: string[]): Set<string> {
  const visited = new Set<string>();
  const stack = roots.map((root) => resolve(PLUGIN_ROOT, root));
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    let source: string;
    try {
      source = readFileSync(current, "utf8");
    } catch {
      continue;
    }
    visited.add(current);
    for (const specifier of importSpecifiers(source)) {
      const next = resolveSourceImport(current, specifier);
      if (next?.startsWith(`${PLUGIN_ROOT}/`)) stack.push(next);
    }
  }
  return new Set([...visited].map((path) => relative(PLUGIN_ROOT, path)));
}

describe("Knip execution-root coverage", () => {
  test("covers the package main and every emitted production bundle entry", () => {
    const roots = new Set(entryRoots());
    const packageJson = readJson(resolve(PLUGIN_ROOT, "package.json"));
    const main = packageJson.main;
    const bundleEntries = Object.values(tsupConfig.entry ?? {}).filter(
      (entry): entry is string => typeof entry === "string",
    );

    expect(typeof main).toBe("string");
    expect(roots.has(main as string)).toBe(true);
    for (const entry of bundleEntries) {
      expect(roots.has(entry), `${entry} must remain a Knip entry root`).toBe(
        true,
      );
    }
  });

  test("derives every TypeScript package-script path as an explicit covered root", () => {
    const roots = new Set(entryRoots());
    const project = readJson(resolve(PLUGIN_ROOT, "knip.json")).project;

    expect(project).toEqual(["src/**/*.ts"]);
    for (const path of packageScriptTypeScriptPaths()) {
      expect(readFileSync(resolve(PLUGIN_ROOT, path), "utf8")).toBeTruthy();
      expect(roots.has(path), `${path} must be a derived Knip entry root`).toBe(
        true,
      );
    }
  });

  test("keeps the root CLI projection boundary explicitly covered", () => {
    expect(entryRoots()).toContain("src/cli/projection-boundary.ts");
  });

  test("uses explicit roots rather than an all-files entry glob", () => {
    const roots = entryRoots();
    expect(roots.length).toBeGreaterThan(0);
    expect(roots.some((entry) => /\*|\{|\}/.test(entry))).toBe(false);
    expect(roots).toEqual([...roots].sort());
  });

  test("anchors registration and generated-agent-manifest reachability", () => {
    const roots = entryRoots();
    const reachable = reachableSourceFiles(roots);
    expect(reachable).toContain("src/tool-registry.ts");
    expect(reachable).toContain("src/manifest.ts");
    expect(reachable).toContain("scripts/generate-agent-manifests.ts");

    const generator = readFileSync(
      resolve(PLUGIN_ROOT, "scripts/generate-agent-manifests.ts"),
      "utf8",
    );
    expect(generator).toContain(
      'import { AGENT_TOOL_POLICY } from "../src/tool-role-policy"',
    );
    expect(generator).toContain('join(repoRoot, ".opencode/agents")');

    const parityTest = readFileSync(
      resolve(PLUGIN_ROOT, "scripts/generate-agent-manifests.test.ts"),
      "utf8",
    );
    expect(parityTest).toContain('from "./generate-agent-manifests"');
    expect(parityTest).toContain("runGenerate");
  });
});
