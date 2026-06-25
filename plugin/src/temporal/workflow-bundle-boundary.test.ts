import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = normalize(join(dirname(fileURLToPath(import.meta.url)), ".."));
const workflowRoot = normalize(join(repoRoot, "temporal", "workflows.ts"));

const importSourcePattern =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;

function rel(path: string): string {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function resolveLocalImport(
  fromFile: string,
  source: string,
): string | undefined {
  if (!source.startsWith(".")) return undefined;

  const base = normalize(join(dirname(fromFile), source));
  // Order: exact .ts file, exact path (only if file), directory/index.ts.
  // The bare base is checked LAST and only as a file to avoid resolving a
  // directory (e.g. `import "../types"` where `types/` exists as a folder).
  const candidates = [`${base}.ts`, join(base, "index.ts"), base];
  return candidates.find(
    (candidate) => existsSync(candidate) && isFile(candidate),
  );
}

function importSources(filePath: string): string[] {
  const source = readFileSync(filePath, "utf8");
  return [...source.matchAll(importSourcePattern)].map((match) => match[1]);
}

function forbiddenWorkflowSurfaceUsages(source: string): string[] {
  const usages = new Set<string>();
  if (/\bwf\s*\.\s*defineUpdate\b/.test(source)) {
    usages.add("wf.defineUpdate");
  }
  if (/(^|[^.\w])defineUpdate\s*\(/.test(source)) {
    usages.add("defineUpdate");
  }
  return [...usages];
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
  it("detects forbidden update-surface declarations without flagging deterministic Date/random APIs", () => {
    expect(
      forbiddenWorkflowSurfaceUsages(
        "const update = wf.defineUpdate('x');\nDate.now();\nnew Date();\nMath.random();",
      ),
    ).toEqual(["wf.defineUpdate"]);
  });

  it("does not define update handlers in workflow-reachable production code", () => {
    const parents = reachableFrom(workflowRoot);
    const forbidden = [...parents.keys()].flatMap((filePath) =>
      forbiddenWorkflowSurfaceUsages(readFileSync(filePath, "utf8")).map(
        (usage) => `${pathFromRoot(parents, filePath)} uses ${usage}`,
      ),
    );

    expect(forbidden).toEqual([]);
  });

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
        .map(
          (source) => `${pathFromRoot(parents, filePath)} imports ${source}`,
        ),
    );

    expect(nodeImports).toEqual([]);
  });

  it("exports epicWorkflow from the workflow bundle root", () => {
    const source = readFileSync(workflowRoot, "utf8");
    expect(source).toMatch(/export\s+async\s+function\s+epicWorkflow\b/);
  });

  it("does not transitively reach forbidden layers from epicWorkflow", () => {
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
});
