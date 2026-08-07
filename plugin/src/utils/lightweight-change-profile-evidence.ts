/**
 * Lightweight Change Profile — host-side evidence collection.
 *
 * Collects a complete eligibility snapshot from a git worktree against a
 * baseline revision. This module performs host I/O (git, filesystem, storage
 * projection) but stays outside runtime adapters. The resulting
 * LightweightProfileEvidenceSnapshot is consumed by the pure evaluator in
 * types/lightweight-change-profile.ts.
 *
 * Failures are represented as non-qualifying evidence surfaces inside the
 * snapshot rather than thrown errors, so callers can always proceed with an
 * evaluation.
 */

import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { z } from "zod";

import { execFileGitAsync } from "./git-binary";
import { loadChange } from "../storage/json";
import type { ProjectPaths } from "../storage/json";
import {
  LightweightProfileEvidenceSnapshotSchema,
  type LightweightProfileEvidenceSnapshot,
} from "../types/lightweight-change-profile";
import type { Change } from "../types";

// =============================================================================
// Public-root API compatibility policy
// =============================================================================

export const PublicRootPolicySchema = z.object({
  roots: z.array(z.string().min(1)).min(1),
});
export type PublicRootPolicy = z.infer<typeof PublicRootPolicySchema>;

// =============================================================================
// Dependency manifest / lockfile detection
// =============================================================================

const DEPENDENCY_MANIFEST_BASENAMES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "Cargo.toml",
  "Cargo.lock",
  "go.mod",
  "go.sum",
  "pyproject.toml",
  "poetry.lock",
  "requirements.txt",
  "Pipfile",
  "Pipfile.lock",
  "Gemfile",
  "Gemfile.lock",
  "composer.json",
  "composer.lock",
  "mix.exs",
  "mix.lock",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "gradle.lockfile",
]);

function isDependencyManifest(path: string): boolean {
  return DEPENDENCY_MANIFEST_BASENAMES.has(basename(path));
}

// =============================================================================
// Spec-law path detection
// =============================================================================

function isSpecLawPath(path: string): boolean {
  return path.startsWith(".adv/specs/");
}

// =============================================================================
// Git evidence
// =============================================================================

type GitStatusCode =
  | "M"
  | "A"
  | "D"
  | "R"
  | "C"
  | "U"
  | "??"
  | "MM"
  | "AM"
  | "DM"
  | string;

interface GitStatusEntry {
  code: GitStatusCode;
  path: string;
  originalPath?: string;
}

interface GitDiffEntry {
  status: GitStatusCode;
  path: string;
  originalPath?: string;
  score?: string;
}

interface GitEvidence {
  observedRevision: string | null;
  diffEntries: GitDiffEntry[];
  statusEntries: GitStatusEntry[];
  rangeStatus: LightweightProfileEvidenceSnapshot["changedPaths"]["rangeStatus"];
  diagnostics: string[];
}

async function runGitCommand(
  workdir: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; diagnostics: string[] }> {
  const { stdout, stderr } = await execFileGitAsync(args, { cwd: workdir });
  const diagnostics: string[] = [];
  if (stderr.trim()) {
    diagnostics.push(`git ${args[0]} stderr: ${stderr.trim()}`);
  }
  return { stdout, stderr, diagnostics };
}

async function collectGitEvidence(
  workdir: string,
  baselineRevision: string,
): Promise<GitEvidence> {
  const diagnostics: string[] = [];
  let observedRevision: string | null = null;
  let revParseFailed = false;

  try {
    const { stdout } = await runGitCommand(workdir, ["rev-parse", "HEAD"]);
    observedRevision = stdout.trim() || null;
    if (!observedRevision) {
      revParseFailed = true;
      diagnostics.push("Observed revision is empty");
    }
  } catch (error) {
    revParseFailed = true;
    diagnostics.push(
      `Failed to read observed revision: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const diffEntries: GitDiffEntry[] = [];
  let diffFailed = false;
  try {
    const { stdout, diagnostics: cmdDiagnostics } = await runGitCommand(
      workdir,
      ["diff", "--name-status", "--find-renames", `${baselineRevision}..HEAD`],
    );
    diagnostics.push(...cmdDiagnostics);
    diffEntries.push(...parseGitDiffNameStatus(stdout));
  } catch (error) {
    diffFailed = true;
    diagnostics.push(
      `Failed to collect committed diff: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const statusEntries: GitStatusEntry[] = [];
  let statusFailed = false;
  try {
    const { stdout, diagnostics: cmdDiagnostics } = await runGitCommand(
      workdir,
      ["status", "--porcelain"],
    );
    diagnostics.push(...cmdDiagnostics);
    statusEntries.push(...parseGitStatusPorcelain(stdout));
  } catch (error) {
    statusFailed = true;
    diagnostics.push(
      `Failed to collect working-tree status: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let rangeStatus: GitEvidence["rangeStatus"] = "complete";
  if (revParseFailed) {
    rangeStatus = "incomplete_rev_parse";
  } else if (diffFailed) {
    rangeStatus = "incomplete_diff";
  } else if (statusFailed) {
    rangeStatus = "incomplete_status";
  }

  return {
    observedRevision,
    diffEntries,
    statusEntries,
    rangeStatus,
    diagnostics,
  };
}

function parseGitDiffNameStatus(stdout: string): GitDiffEntry[] {
  const entries: GitDiffEntry[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Rename/copy lines: R<score><tab><original><tab><new>
    // Copy lines: C<score><tab><original><tab><new>
    if (trimmed.startsWith("R") || trimmed.startsWith("C")) {
      const parts = trimmed.split("\t");
      if (parts.length >= 3) {
        const status = parts[0] as GitStatusCode;
        const score = parts[0].slice(1);
        entries.push({
          status,
          path: parts[2],
          originalPath: parts[1],
          score,
        });
      }
      continue;
    }

    // Ordinary status lines: <status><tab><path>
    const parts = trimmed.split("\t");
    if (parts.length >= 2) {
      entries.push({
        status: parts[0] as GitStatusCode,
        path: parts[1],
      });
    }
  }
  return entries;
}

function parseGitStatusPorcelain(stdout: string): GitStatusEntry[] {
  const entries: GitStatusEntry[] = [];
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    // Porcelain format: XY <path> or XY <path> -> <newpath> for renames
    const code = line.slice(0, 2);
    const rest = line.slice(3);

    if (rest.includes(" -> ")) {
      const [originalPath, newPath] = rest.split(" -> ");
      entries.push({ code, path: newPath, originalPath });
    } else {
      entries.push({ code, path: rest });
    }
  }
  return entries;
}

// =============================================================================
// Merge git evidence into changed-path evidence
// =============================================================================

interface ChangedPathsEvidence {
  count: number;
  paths: string[];
  renames: number;
  deletions: number;
  untrackedCount: number;
  rangeStatus: LightweightProfileEvidenceSnapshot["changedPaths"]["rangeStatus"];
}

function mergeGitEvidenceIntoChangedPaths(
  diffEntries: GitDiffEntry[],
  statusEntries: GitStatusEntry[],
  rangeStatus: ChangedPathsEvidence["rangeStatus"],
): ChangedPathsEvidence {
  const paths = new Set<string>();
  let renames = 0;
  let deletions = 0;
  let untrackedCount = 0;

  for (const entry of diffEntries) {
    paths.add(entry.path);
    if (entry.status.startsWith("R") || entry.status.startsWith("C")) {
      renames++;
      if (entry.originalPath) {
        paths.add(entry.originalPath);
      }
    } else if (entry.status === "D") {
      deletions++;
    }
  }

  for (const entry of statusEntries) {
    if (entry.code === "??") {
      paths.add(entry.path);
      untrackedCount++;
    } else if (entry.code?.[0] === "R" || entry.code?.[1] === "R") {
      paths.add(entry.path);
      if (!diffEntries.some((d) => d.path === entry.path)) {
        renames++;
      }
    } else if (entry.code?.[0] === "D" || entry.code?.[1] === "D") {
      paths.add(entry.path);
      if (!diffEntries.some((d) => d.path === entry.path)) {
        deletions++;
      }
    } else if (
      entry.code?.[0] === "M" ||
      entry.code?.[1] === "M" ||
      entry.code?.[0] === "A" ||
      entry.code?.[1] === "A"
    ) {
      paths.add(entry.path);
    }
  }

  return {
    count: paths.size,
    paths: Array.from(paths).sort(),
    renames,
    deletions,
    untrackedCount,
    rangeStatus,
  };
}

// =============================================================================
// Content-sensitive fingerprint
// =============================================================================

async function computeFingerprint(
  workdir: string,
  observedRevision: string | null,
  baselineRevision: string,
  changedPaths: ChangedPathsEvidence,
): Promise<string> {
  const hash = createHash("sha256");
  hash.update(observedRevision ?? "unknown");
  hash.update(baselineRevision);
  hash.update(JSON.stringify(changedPaths.paths));
  hash.update(String(changedPaths.renames));
  hash.update(String(changedPaths.deletions));
  hash.update(String(changedPaths.untrackedCount));
  hash.update(changedPaths.rangeStatus);

  for (const path of changedPaths.paths) {
    const fullPath = join(workdir, path);
    try {
      const content = await readFile(fullPath);
      hash.update(path);
      hash.update(content);
    } catch {
      // File may be deleted, untracked but not yet on disk, or otherwise
      // unreadable. Use its path as a fallback so the fingerprint still
      // changes when the path set changes.
      hash.update(path);
    }
  }

  return hash.digest("hex");
}

// =============================================================================
// Durable task / delta / scope facts from storage projection
// =============================================================================

interface TaskFacts {
  total: number;
  implementation: number;
}

interface DeltaFacts {
  hasDelta: boolean;
  capabilities: string[];
}

interface ScopeFacts {
  currentProjectOnly: boolean;
  scopeRepos: number;
}

function extractTaskFacts(change: Change | null): TaskFacts {
  if (!change || !Array.isArray(change.tasks)) {
    return { total: 0, implementation: 0 };
  }
  const tasks = change.tasks;
  const implementation = tasks.filter(
    (t) => t.type === "code" || t.type === "verification",
  ).length;
  return { total: tasks.length, implementation };
}

function extractDeltaFacts(change: Change | null): DeltaFacts {
  if (!change || !change.deltas) {
    return { hasDelta: false, capabilities: [] };
  }
  const capabilities = Object.keys(change.deltas).filter(
    (k) => Array.isArray(change.deltas[k]) && change.deltas[k].length > 0,
  );
  return { hasDelta: capabilities.length > 0, capabilities };
}

function extractScopeFacts(change: Change | null): ScopeFacts {
  if (!change || !change.scope_repos || change.scope_repos.length === 0) {
    return { currentProjectOnly: true, scopeRepos: 1 };
  }
  return {
    currentProjectOnly: change.scope_repos.length <= 1,
    scopeRepos: change.scope_repos.length,
  };
}

// =============================================================================
// Public-root import/export reachability graph
// =============================================================================

interface ImportGraph {
  nodes: Set<string>;
  edges: Map<string, Set<string>>;
}

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

function normalizeRepoPath(workdir: string, filePath: string): string {
  return relative(workdir, resolve(workdir, filePath)).replace(/\\/g, "/");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveImportTarget(
  workdir: string,
  importerPath: string,
  importSpecifier: string,
): Promise<string | null> {
  if (
    importSpecifier.startsWith("node:") ||
    importSpecifier.startsWith("bun:") ||
    importSpecifier.startsWith("/") ||
    !importSpecifier.startsWith(".")
  ) {
    return null;
  }

  const importerDir = dirname(join(workdir, importerPath));
  const base = resolve(importerDir, importSpecifier);

  const candidates = [base];
  for (const ext of SOURCE_EXTENSIONS) {
    candidates.push(`${base}${ext}`);
  }
  for (const ext of SOURCE_EXTENSIONS) {
    candidates.push(join(base, `index${ext}`));
  }

  for (const candidate of candidates) {
    const repoPath = normalizeRepoPath(workdir, candidate);
    if (repoPath === importerPath) continue;
    if (await fileExists(candidate)) {
      return repoPath;
    }
  }

  return null;
}

function extractRelativeImports(content: string): string[] {
  const imports: string[] = [];
  const importFrom =
    /import\s+(?:(?:type\s+)?(?:[\s\w*{},\n]+from\s+)?['"]([^'"]+)['"]|['"]([^'"]+)['"])/g;
  const exportFrom = /export\s+(?:[^'"]+from\s+)['"]([^'"]+)['"]/g;
  const requireCall = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  let match: RegExpExecArray | null;
  while ((match = importFrom.exec(content)) !== null) {
    const specifier = match[1] ?? match[2];
    if (specifier) imports.push(specifier);
  }
  while ((match = exportFrom.exec(content)) !== null) {
    imports.push(match[1]);
  }
  while ((match = requireCall.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

async function buildImportGraph(
  workdir: string,
  changedPaths: ChangedPathsEvidence,
  publicRoots: string[],
  diagnostics: string[],
): Promise<{ graph: ImportGraph; readNodes: Set<string> }> {
  const nodes = new Set<string>();
  const edges = new Map<string, Set<string>>();
  const readNodes = new Set<string>();

  // Seed with changed source files and public roots so traversal reaches the
  // full public-to-changed dependency graph.
  for (const path of changedPaths.paths) {
    if (SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext))) {
      nodes.add(path);
    }
  }
  for (const root of publicRoots) {
    nodes.add(root);
  }

  const discovered = new Set<string>(nodes);
  const pending = Array.from(nodes);

  while (pending.length > 0) {
    const current = pending.pop()!;
    const fullPath = join(workdir, current);
    let content: string;
    try {
      content = await readFile(fullPath, "utf-8");
      readNodes.add(current);
    } catch (error) {
      diagnostics.push(
        `Graph read failed for ${current}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    const imports = extractRelativeImports(content);
    for (const specifier of imports) {
      const target = await resolveImportTarget(workdir, current, specifier);
      if (target === null) continue;

      if (!edges.has(current)) {
        edges.set(current, new Set());
      }
      edges.get(current)!.add(target);

      if (!discovered.has(target)) {
        discovered.add(target);
        nodes.add(target);
        pending.push(target);
      }
    }
  }

  return { graph: { nodes, edges }, readNodes };
}

async function evaluateApiCompatibilityAsync(
  workdir: string,
  changedPaths: ChangedPathsEvidence,
  policy: PublicRootPolicy | undefined,
  diagnostics: string[],
): Promise<LightweightProfileEvidenceSnapshot["apiCompatibility"]> {
  if (!policy || policy.roots.length === 0) {
    return { publicSurface: "policy_absent", publicRoots: [] };
  }

  const normalizedRoots = policy.roots.map((r) =>
    normalizeRepoPath(workdir, r),
  );
  const changedSet = new Set(changedPaths.paths);

  for (const root of normalizedRoots) {
    if (changedSet.has(root)) {
      return { publicSurface: "public_impact", publicRoots: normalizedRoots };
    }
  }

  try {
    const { graph, readNodes } = await buildImportGraph(
      workdir,
      changedPaths,
      normalizedRoots,
      diagnostics,
    );

    // If any public root could not be read, the graph is incomplete and we
    // must deny by default.
    const unreadableRoots = normalizedRoots.filter(
      (root) => !readNodes.has(root),
    );
    if (unreadableRoots.length > 0) {
      diagnostics.push(
        `Public root(s) unreadable or not source files: ${unreadableRoots.join(", ")}`,
      );
      return {
        publicSurface: "graph_failure",
        publicRoots: normalizedRoots,
      };
    }

    const reachable = new Set<string>();
    const queue = [...normalizedRoots];
    for (const root of normalizedRoots) {
      reachable.add(root);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = graph.edges.get(current) ?? new Set<string>();
      for (const neighbor of neighbors) {
        if (!reachable.has(neighbor)) {
          reachable.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    for (const changedPath of changedSet) {
      if (reachable.has(changedPath)) {
        return {
          publicSurface: "public_impact",
          publicRoots: normalizedRoots,
        };
      }
    }

    return { publicSurface: "proven_private", publicRoots: normalizedRoots };
  } catch (error) {
    diagnostics.push(
      `Public-root graph evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { publicSurface: "graph_failure", publicRoots: normalizedRoots };
  }
}

// =============================================================================
// Collector input/output
// =============================================================================

export interface CollectLightweightProfileEvidenceInput {
  workdir: string;
  projectId: string;
  changeId: string;
  baselineRevision: string;
  projectPaths: ProjectPaths;
  apiCompatibilityPolicy?: PublicRootPolicy;
}

export interface CollectLightweightProfileEvidenceResult {
  snapshot: LightweightProfileEvidenceSnapshot;
  diagnostics: string[];
}

export async function collectLightweightProfileEvidence(
  input: CollectLightweightProfileEvidenceInput,
): Promise<CollectLightweightProfileEvidenceResult> {
  const diagnostics: string[] = [];

  const gitEvidence = await collectGitEvidence(
    input.workdir,
    input.baselineRevision,
  );
  diagnostics.push(...gitEvidence.diagnostics);

  const changedPaths = mergeGitEvidenceIntoChangedPaths(
    gitEvidence.diffEntries,
    gitEvidence.statusEntries,
    gitEvidence.rangeStatus,
  );

  const dependencyChange = {
    hasDependencyChange: changedPaths.paths.some(isDependencyManifest),
    manifests: changedPaths.paths.filter(isDependencyManifest),
  };

  const specDelta = {
    hasDelta: changedPaths.paths.some(isSpecLawPath),
    capabilities: changedPaths.paths
      .filter(isSpecLawPath)
      .map((p) => {
        const parts = p.split("/");
        return parts[2] ?? "unknown";
      })
      .filter((c, i, arr) => arr.indexOf(c) === i),
  };

  const fingerprint = await computeFingerprint(
    input.workdir,
    gitEvidence.observedRevision,
    input.baselineRevision,
    changedPaths,
  );

  let change: Change | null = null;
  try {
    const result = await loadChange(input.projectPaths.changes, input.changeId);
    if (result.success) {
      change = result.data;
    } else {
      diagnostics.push(
        `Failed to load change ${input.changeId}: ${result.error}`,
      );
    }
  } catch (error) {
    diagnostics.push(
      `Unexpected error loading change ${input.changeId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const taskFacts = extractTaskFacts(change);
  const deltaFacts = extractDeltaFacts(change);
  const scopeFacts = extractScopeFacts(change);

  // If git evidence shows spec-law changes, that overrides the stored delta.
  const finalSpecDelta = specDelta.hasDelta ? specDelta : deltaFacts;

  const apiCompatibility = await evaluateApiCompatibilityAsync(
    input.workdir,
    changedPaths,
    input.apiCompatibilityPolicy,
    diagnostics,
  );

  const snapshot: LightweightProfileEvidenceSnapshot = {
    projectId: input.projectId,
    baselineRevision: input.baselineRevision,
    observedRevision: gitEvidence.observedRevision ?? "unknown",
    fingerprint,
    taskCount: taskFacts,
    changedPaths,
    specDelta: finalSpecDelta,
    dependencyChange,
    apiCompatibility,
    repoScope: scopeFacts,
  };

  const validated =
    LightweightProfileEvidenceSnapshotSchema.safeParse(snapshot);
  if (!validated.success) {
    diagnostics.push(
      `Snapshot schema validation failed: ${validated.error.message}`,
    );
  }

  return { snapshot, diagnostics };
}

export {
  parseGitDiffNameStatus,
  parseGitStatusPorcelain,
  mergeGitEvidenceIntoChangedPaths,
  computeFingerprint,
  isDependencyManifest,
  isSpecLawPath,
  extractTaskFacts,
  extractDeltaFacts,
  extractScopeFacts,
  buildImportGraph,
  evaluateApiCompatibilityAsync,
};
