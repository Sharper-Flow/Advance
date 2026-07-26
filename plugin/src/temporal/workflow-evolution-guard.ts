/**
 * workflow-evolution-guard — executable rule tying workflow-reachable
 * behavior changes to patch/replay evidence (rq-workerEvolutionSafety01.1,
 * SC5, AC7, D9).
 *
 * Workflow-reachable code is any file transitively imported from the workflow
 * bundle entry point. A behavior change in that set must either:
 *
 *   1. introduce a Temporal `wf.patched` / `wf.deprecatePatch` marker that is
 *      covered by a committed replay fixture, or
 *   2. be explicitly covered by a replay fixture entry.
 *
 * This is a static, deterministic check intended for CI / pre-deploy scripts.
 * It does not perform temporal replay itself; it enforces the *evidence rule*
 * that replay tests must exist before a workflow-reachable change is released.
 */

import { readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";

export interface FileSystemReader {
  readFile(path: string): string | undefined;
  isFile(path: string): boolean;
}

export function createRealFileSystemReader(): FileSystemReader {
  return {
    readFile(path: string): string | undefined {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return undefined;
      }
    },
    isFile(path: string): boolean {
      try {
        return statSync(path).isFile();
      } catch {
        return false;
      }
    },
  };
}

const importSourcePattern =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;

export function importSources(source: string): string[] {
  return [...source.matchAll(importSourcePattern)].map((match) => match[1]);
}

export function resolveLocalImport(
  fromFile: string,
  source: string,
  fs: FileSystemReader,
): string | undefined {
  if (!source.startsWith(".")) return undefined;

  const base = normalize(join(dirname(fromFile), source));
  // Order matters: exact path first, then explicit .ts, then directory index.
  const candidates = [base, `${base}.ts`, join(base, "index.ts")];
  return candidates.find((candidate) => fs.isFile(candidate));
}

/**
 * Build the transitive workflow-reachable file set from a bundle entry point.
 * Returns a map of absolute file path to its parent path (the file that first
 * imported it), useful for diagnostics.
 */
export function buildWorkflowReachabilityGraph(
  entryPoint: string,
  fs: FileSystemReader,
): Map<string, string | undefined> {
  const parents = new Map<string, string | undefined>([
    [entryPoint, undefined],
  ]);
  const queue = [entryPoint];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const source = fs.readFile(current);
    if (!source) continue;

    for (const importSource of importSources(source)) {
      const resolved = resolveLocalImport(current, importSource, fs);
      if (!resolved || parents.has(resolved)) continue;
      parents.set(resolved, current);
      queue.push(resolved);
    }
  }

  return parents;
}

export function extractPatchMarkers(source: string): string[] {
  const markers: string[] = [];
  const pattern =
    /wf\s*\.\s*(?:patched|deprecatePatch)\s*\(\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    markers.push(match[1]);
  }
  return markers;
}

export interface WorkflowBehaviorChangeEvidenceInput {
  /** Absolute path to the project root. Changed files are resolved against it. */
  repoRoot: string;
  /** Absolute path to the workflow bundle entry point (e.g. workflows.ts). */
  entryPoint: string;
  /** Changed file paths, relative to repoRoot. */
  changedFiles: string[];
  /** Coverage set from replay fixture metadata (patch markers + fixture ids). */
  fixtureCoverage: string[];
  /** Optional filesystem reader for tests. */
  fs?: FileSystemReader;
}

export interface WorkflowBehaviorChangeEvidence {
  ok: boolean;
  /** True if at least one changed file is workflow-reachable. */
  reachedWorkflow: boolean;
  /** Diagnostic strings for every missing evidence item. */
  missing: string[];
  /** Patch markers found in the changed workflow-reachable files. */
  patchMarkers: string[];
  /** Absolute paths of the changed files that are workflow-reachable. */
  reachedFiles: string[];
}

function relativeToRepoRoot(
  repoRoot: string,
  absolutePath: string,
): string | undefined {
  const rel = normalize(absolutePath).replace(normalize(repoRoot), "");
  if (rel === absolutePath) return undefined; // outside repoRoot
  return rel.replace(/^[/\\]/, "").replace(/\\/g, "/");
}

/**
 * Evaluate whether changed files have sufficient patch/replay evidence.
 *
 * Returns `ok: true` immediately when no changed file reaches the workflow
 * bundle. For workflow-reachable changes, every discovered patch marker must
 * appear in `fixtureCoverage`, OR the changed files themselves must be listed
 * in `fixtureCoverage` when no patch markers are present.
 */
export function evaluateWorkflowBehaviorChangeEvidence(
  input: WorkflowBehaviorChangeEvidenceInput,
): WorkflowBehaviorChangeEvidence {
  const fs = input.fs ?? createRealFileSystemReader();
  const graph = buildWorkflowReachabilityGraph(input.entryPoint, fs);
  const reachable = new Set(graph.keys());

  const reachedFiles: string[] = [];
  const allMarkers: string[] = [];
  const missing: string[] = [];

  for (const changed of input.changedFiles) {
    const absolute = resolve(input.repoRoot, changed);
    if (!reachable.has(absolute)) continue;
    reachedFiles.push(absolute);

    const source = fs.readFile(absolute);
    if (!source) {
      missing.push(`changed workflow-reachable file is unreadable: ${changed}`);
      continue;
    }
    const markers = extractPatchMarkers(source);
    allMarkers.push(...markers);
  }

  if (reachedFiles.length === 0) {
    return {
      ok: true,
      reachedWorkflow: false,
      missing: [],
      patchMarkers: [],
      reachedFiles: [],
    };
  }

  const coverage = new Set(input.fixtureCoverage);
  const reachedRelative = new Set(
    reachedFiles
      .map((p) => relativeToRepoRoot(input.repoRoot, p))
      .filter((r): r is string => r !== undefined),
  );

  const uniqueMarkers = [...new Set(allMarkers)];
  if (uniqueMarkers.length > 0) {
    for (const marker of uniqueMarkers) {
      if (!coverage.has(marker)) {
        missing.push(
          `workflow-reachable patch marker "${marker}" is not covered by a replay fixture`,
        );
      }
    }
  } else {
    const hasFixtureCoverage = [...reachedRelative].some((rel) =>
      coverage.has(rel),
    );
    if (!hasFixtureCoverage) {
      missing.push(
        "workflow-reachable behavior change introduces no Temporal patch marker and no listed replay fixture coverage",
      );
    }
  }

  return {
    ok: missing.length === 0,
    reachedWorkflow: true,
    missing,
    patchMarkers: uniqueMarkers,
    reachedFiles,
  };
}

/**
 * Convenience check that throws a typed error when workflow-reachable changes
 * lack patch/replay evidence. Intended for CI / pre-deploy scripts.
 */
export function assertWorkflowBehaviorChangeEvidence(
  input: WorkflowBehaviorChangeEvidenceInput,
): WorkflowBehaviorChangeEvidence {
  const result = evaluateWorkflowBehaviorChangeEvidence(input);
  if (!result.ok) {
    throw new Error(
      [
        "workflow-reachable behavior change lacks replay/patch evidence",
        ...result.missing,
      ].join("\n  - "),
    );
  }
  return result;
}
