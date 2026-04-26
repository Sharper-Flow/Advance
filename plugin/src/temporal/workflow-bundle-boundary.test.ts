import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = normalize(
  join(dirname(fileURLToPath(import.meta.url)), ".."),
);
const workflowRoot = normalize(join(repoRoot, "temporal", "workflows.ts"));

const importSourcePattern =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;

function rel(path: string): string {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

function resolveLocalImport(fromFile: string, source: string): string | undefined {
  if (!source.startsWith(".")) return undefined;

  const base = normalize(join(dirname(fromFile), source));
  const candidates = [base, `${base}.ts`, join(base, "index.ts")];
  return candidates.find((candidate) => existsSync(candidate));
}

function importSources(filePath: string): string[] {
  const source = readFileSync(filePath, "utf8");
  return [...source.matchAll(importSourcePattern)].map((match) => match[1]);
}

function reachableFrom(root: string): Map<string, string | undefined> {
  const parents = new Map<string, string | undefined>([[root, undefined]]);
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const source of importSources(current)) {
      const resolved = resolveLocalImport(current, source);
      if (!resolved || parents.has(resolved)) continue;
      parents.set(resolved, current);
      queue.push(resolved);
    }
  }

  return parents;
}

function pathFromRoot(
  parents: Map<string, string | undefined>,
  target: string,
): string {
  const parts: string[] = [];
  let current: string | undefined = target;

  while (current) {
    parts.unshift(rel(current));
    current = parents.get(current);
  }

  return parts.join(" → ");
}

describe("workflow bundle transitive boundary", () => {
  /**
   * Architecture invariant (see AGENTS.md): Temporal workflow bundles must
   * not transitively reach Node-only or side-effect-heavy plugin layers.
   * Dynamic imports are out of scope; workflow code uses static ESM imports.
   */
  it("does not reach forbidden internal layers from workflows.ts", () => {
    const parents = reachableFrom(workflowRoot);
    const forbidden = [...parents.keys()].filter((filePath) =>
      /^storage\/|^tools\/|^tool-registry\.ts$|^plugin-init\.ts$/.test(
        rel(filePath),
      ),
    );

    expect(
      forbidden.map((filePath) => pathFromRoot(parents, filePath)),
    ).toEqual([]);
  });

  it("does not import node:* modules from the workflow reachable set", () => {
    const parents = reachableFrom(workflowRoot);
    const nodeImports = [...parents.keys()].flatMap((filePath) =>
      importSources(filePath)
        .filter((source) => source.startsWith("node:"))
        .map((source) => `${pathFromRoot(parents, filePath)} imports ${source}`),
    );

    expect(nodeImports).toEqual([]);
  });
});
