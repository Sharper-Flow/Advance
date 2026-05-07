/**
 * Temporal activities for ADV plugin.
 *
 * Activities are the canonical Temporal pattern for side-effecting I/O.
 * They run on workers (not in workflow code) and survive worker restarts
 * via Temporal's at-least-once retry semantics.
 *
 * Two families live here:
 *
 * 1. Disk-artifact activities (P2.1 — Phase 2 of completeTemporalOnlyMigration).
 *    Read/write `.adv/changes/{id}/{kind}.md`, `.adv/specs/`, and cross-repo
 *    files. Migrating these off the legacy in-process store is the gating
 *    step for retiring `legacy.*` callsites in store-temporal.ts (P2.2-P2.6).
 *
 * All activities return a discriminated `{ ok: true, ... } | { ok: false, error }`
 * shape. Activities never throw across the workflow boundary — the workflow
 * layer decides retry vs surface vs fail.
 */

import { mkdir, readFile, stat, unlink } from "fs/promises";
import { join, normalize, isAbsolute, resolve, dirname, sep } from "path";

import { listSpecDirs } from "../storage/json";
import { atomicWriteFile } from "../utils/fs";
import type { ChangeWorkflowState } from "./contracts";
import { renderBriefSummary } from "../utils/archive-summary";
import { applySpecDelta } from "../utils/spec-deltas";
import { appendWisdom } from "../utils/wisdom-append";
import { execGit } from "../utils/git";

// =============================================================================
// Disk-artifact activities (P2.1)
// =============================================================================

/**
 * Per-change artifact kinds. Stored as `{kind}.md` next to `change.json`.
 *
 * Kept in lockstep with the artifact set in `createChangeScaffold` /
 * `updateChangeArtifacts` (storage/json.ts).
 */
export type ArtifactKind =
  | "proposal"
  | "problem-statement"
  | "agreement"
  | "design";

const ARTIFACT_FILENAME: Record<ArtifactKind, string> = {
  proposal: "proposal.md",
  "problem-statement": "problem-statement.md",
  agreement: "agreement.md",
  design: "design.md",
};

export interface ReadArtifactInput {
  changesDir: string;
  changeId: string;
  kind: ArtifactKind;
}

export type ReadArtifactResult =
  | { ok: true; content: string }
  | { ok: false; error: string; content?: undefined };

export async function readArtifactActivity(
  input: ReadArtifactInput,
): Promise<ReadArtifactResult> {
  const filename = ARTIFACT_FILENAME[input.kind];
  const path = join(input.changesDir, input.changeId, filename);
  try {
    const content = await readFile(path, "utf-8");
    return { ok: true, content };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error:
        code === "ENOENT"
          ? `Artifact not found: ${path}`
          : `Read failed (${code ?? "unknown"}): ${message}`,
    };
  }
}

export interface WriteArtifactInput {
  changesDir: string;
  changeId: string;
  kind: ArtifactKind;
  content: string;
}

export type WriteArtifactResult =
  | { ok: true; path: string }
  | { ok: false; error: string; path?: undefined };

export async function writeArtifactActivity(
  input: WriteArtifactInput,
): Promise<WriteArtifactResult> {
  const filename = ARTIFACT_FILENAME[input.kind];
  const changeDir = join(input.changesDir, input.changeId);
  const path = join(changeDir, filename);
  try {
    await mkdir(changeDir, { recursive: true });
    await atomicWriteFile(path, input.content);
    return { ok: true, path };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Write failed: ${message}` };
  }
}

export interface ListSpecsInput {
  specsDir: string;
}

export type ListSpecsResult =
  | { ok: true; specs: string[] }
  | { ok: false; error: string; specs?: undefined };

export async function listSpecsActivity(
  input: ListSpecsInput,
): Promise<ListSpecsResult> {
  try {
    // listSpecDirs swallows ENOENT and returns []. Anything else propagates.
    const specs = await listSpecDirs(input.specsDir);
    return { ok: true, specs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `listSpecs failed: ${message}` };
  }
}

export interface ShowSpecInput {
  specsDir: string;
  capability: string;
}

export type ShowSpecResult =
  | { ok: true; content: string; path: string }
  | { ok: false; error: string; content?: undefined; path?: undefined };

export async function showSpecActivity(
  input: ShowSpecInput,
): Promise<ShowSpecResult> {
  const path = join(input.specsDir, input.capability, "spec.json");
  try {
    const content = await readFile(path, "utf-8");
    return { ok: true, content, path };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error:
        code === "ENOENT"
          ? `Spec not found: ${input.capability} (${path})`
          : `Read failed (${code ?? "unknown"}): ${message}`,
    };
  }
}

export interface CrossRepoArtifactInput {
  /** Absolute path to the target repo root. */
  target_path: string;
  /** Path relative to target_path. Must NOT escape via `..`. */
  relative_path: string;
  operation: "read" | "write";
  /** Required when operation === "write". */
  content?: string;
}

export type CrossRepoArtifactResult =
  | { ok: true; content?: string; path: string }
  | { ok: false; error: string; content?: undefined; path?: undefined };

/**
 * Standalone validation that a `target_path` is suitable for cross-repo
 * I/O. Used both by `crossRepoArtifactActivity` (before file operations)
 * and by upstream tools (e.g. `adv_change_create` cross-project flow) to
 * reject invalid targets before opening any store.
 *
 * Returns `{ ok: true }` when target_path exists, is a directory, and
 * contains a `.git` entry. Returns `{ ok: false, error }` otherwise.
 */
export async function validateCrossRepoTarget(
  target_path: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let stats;
  try {
    stats = await stat(target_path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return {
      ok: false,
      error:
        code === "ENOENT"
          ? `target_path does not exist: ${target_path}`
          : `target_path stat failed (${code ?? "unknown"}): ${(err as Error).message}`,
    };
  }
  if (!stats.isDirectory()) {
    return {
      ok: false,
      error: `target_path is not a directory: ${target_path}`,
    };
  }
  try {
    await stat(join(target_path, ".git"));
  } catch {
    return {
      ok: false,
      error: `target_path is not a git repo (no .git entry): ${target_path}`,
    };
  }
  return { ok: true };
}

/**
 * Cross-repo file I/O activity (per design.md KD-4).
 *
 * Validation rules:
 *   - target_path must exist and be a directory
 *   - target_path must contain a `.git` entry (file or dir, both valid for
 *     git worktrees and submodules)
 *   - relative_path must not be absolute and must not escape target_path
 *     after path normalization
 *   - For writes, content is required
 *
 * Failures return structured `{ ok: false, error }` — never throw. The
 * workflow caller decides retry vs surface.
 */
export async function crossRepoArtifactActivity(
  input: CrossRepoArtifactInput,
): Promise<CrossRepoArtifactResult> {
  const { target_path, relative_path, operation, content } = input;

  // 1. relative_path must not be absolute
  if (isAbsolute(relative_path)) {
    return {
      ok: false,
      error: `relative_path must be relative (got absolute path: ${relative_path})`,
    };
  }

  // 2+3. target_path validation (existence + directory + git repo)
  const validation = await validateCrossRepoTarget(target_path);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  // 4. relative_path must not escape target_path after normalization
  const absoluteTarget = resolve(target_path);
  const absoluteFile = resolve(absoluteTarget, normalize(relative_path));
  if (
    absoluteFile !== absoluteTarget &&
    !absoluteFile.startsWith(absoluteTarget + sep)
  ) {
    return {
      ok: false,
      error: `relative_path escapes target_path: ${relative_path}`,
    };
  }

  // 5. dispatch
  if (operation === "read") {
    try {
      const data = await readFile(absoluteFile, "utf-8");
      return { ok: true, content: data, path: absoluteFile };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error:
          code === "ENOENT"
            ? `File not found: ${absoluteFile}`
            : `Read failed (${code ?? "unknown"}): ${message}`,
      };
    }
  }

  // operation === "write"
  if (typeof content !== "string") {
    return {
      ok: false,
      error: `content is required for write operations`,
    };
  }
  try {
    // mkdir parents — relative_path may include nested subdirs
    const parentDir = dirname(absoluteFile);
    await mkdir(parentDir, { recursive: true });
    await atomicWriteFile(absoluteFile, content);
    return { ok: true, path: absoluteFile };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Write failed: ${message}` };
  }
}

// =============================================================================
// Change projection activities (signal-driven workflow disk cache)
// =============================================================================

export interface WriteChangeProjectionInput {
  /** External mutable-state changes dir: `$stateRoot/{projectId}/changes`. */
  projectionChangesDir: string;
  /** Full in-memory workflow state to expose to external readers. */
  state: ChangeWorkflowState;
  /** Deterministic workflow timestamp for idempotent payload rendering. */
  projectedAt: string;
}

export type WriteChangeProjectionResult =
  | { ok: true; path: string }
  | { ok: false; error: string; path?: undefined };

export interface DeleteActiveProjectionInput {
  projectionChangesDir: string;
  changeId: string;
}

export type DeleteActiveProjectionResult =
  | { ok: true; path: string; deleted: boolean }
  | { ok: false; error: string; path?: undefined; deleted?: undefined };

function projectionPath(
  projectionChangesDir: string,
  changeId: string,
): string {
  return join(projectionChangesDir, `${changeId}.json`);
}

/**
 * Write the external-reader projection for a signal-driven change workflow.
 *
 * Workflow history remains authoritative; this JSON file is a downstream cache
 * for humans, conformance CI, and migration tooling. Shape is intentionally
 * wrapper-first (`schemaVersion: 2`) so future projection changes can evolve
 * without pretending this is the workflow state contract itself.
 */
export async function writeChangeProjection(
  input: WriteChangeProjectionInput,
): Promise<WriteChangeProjectionResult> {
  const path = projectionPath(input.projectionChangesDir, input.state.changeId);
  try {
    await atomicWriteFile(
      path,
      `${JSON.stringify(
        {
          schemaVersion: 2,
          projectId: input.state.projectId,
          changeId: input.state.changeId,
          projectedAt: input.projectedAt,
          state: input.state,
        },
        null,
        2,
      )}\n`,
    );
    return { ok: true, path };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Projection write failed: ${message}` };
  }
}

/** Remove the active projection after archive promotion consumes it. */
export async function deleteActiveProjection(
  input: DeleteActiveProjectionInput,
): Promise<DeleteActiveProjectionResult> {
  const path = projectionPath(input.projectionChangesDir, input.changeId);
  try {
    await unlink(path);
    return { ok: true, path, deleted: true };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { ok: true, path, deleted: false };
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Projection delete failed: ${message}` };
  }
}

// =============================================================================
// Archive activity (durable trinity)
// =============================================================================

export interface ArchiveProjectInput {
  projectPath: string;
}

export interface ArchiveChangeActivityInput {
  state: ChangeWorkflowState;
  projects: ArchiveProjectInput[];
  status: "archived" | "cancelled";
  archivedAt: string;
  approvalEvidence: string;
  approvedBy: string;
}

export type ArchiveChangeActivityResult =
  | {
      ok: true;
      changeId: string;
      projects: Array<{
        projectPath: string;
        summaryPath: string;
        commitSha: string | null;
      }>;
    }
  | { ok: false; error: string; phase: "preflight" | "write" | "commit" };

async function ensureCleanWorktree(projectPath: string): Promise<void> {
  const status = await execGit(["status", "--porcelain"], projectPath);
  if (status.trim()) {
    throw new Error(`Worktree is not clean: ${projectPath}`);
  }
}

async function getOptionalGitValue(
  projectPath: string,
  args: string[],
  fallback: string,
): Promise<string> {
  try {
    const value = await execGit(args, projectPath);
    return value.trim() || fallback;
  } catch {
    return fallback;
  }
}

async function commitDurableTrinity(
  projectPath: string,
  changeId: string,
): Promise<string | null> {
  await execGit(["add", ".adv"], projectPath);
  const status = await execGit(["status", "--porcelain"], projectPath);
  if (!status.trim()) return null;
  await execGit(
    ["commit", "-m", `archive(${changeId}): durable trinity`],
    projectPath,
  );
  return (await execGit(["rev-parse", "HEAD"], projectPath)).trim();
}

export async function archiveChangeActivity(
  input: ArchiveChangeActivityInput,
): Promise<ArchiveChangeActivityResult> {
  if (input.projects.length === 0) {
    return { ok: false, phase: "preflight", error: "No projects to archive" };
  }

  try {
    for (const project of input.projects) {
      await ensureCleanWorktree(project.projectPath);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, phase: "preflight", error: message };
  }

  const archivedProjects: Exclude<
    ArchiveChangeActivityResult,
    { ok: false }
  >["projects"] = [];

  for (const project of input.projects) {
    const summaryPath = join(
      project.projectPath,
      ".adv",
      "archive",
      `${input.state.changeId}.md`,
    );
    try {
      const branch = await getOptionalGitValue(
        project.projectPath,
        ["branch", "--show-current"],
        `change/${input.state.changeId}`,
      );
      const headSha = await getOptionalGitValue(
        project.projectPath,
        ["rev-parse", "HEAD"],
        "pending",
      );
      if (input.status === "archived") {
        for (const [capability, deltas] of Object.entries(
          input.state.deltas ?? {},
        )) {
          if (deltas.length === 0) continue;
          const result = await applySpecDelta(
            project.projectPath,
            capability,
            deltas,
          );
          if (!result.ok) {
            return {
              ok: false,
              phase: "write",
              error: `Spec delta failed for ${capability}: ${result.error}`,
            };
          }
        }
      }
      await appendWisdom(project.projectPath, input.state.wisdom ?? []);
      await atomicWriteFile(
        summaryPath,
        renderBriefSummary({
          state: input.state,
          status: input.status,
          archivedAt: input.archivedAt,
          branch,
          mergeSha: headSha,
          approvalEvidence: input.approvalEvidence,
          approvedBy: input.approvedBy,
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, phase: "write", error: message };
    }

    try {
      const commitSha = await commitDurableTrinity(
        project.projectPath,
        input.state.changeId,
      );
      archivedProjects.push({
        projectPath: project.projectPath,
        summaryPath,
        commitSha,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, phase: "commit", error: message };
    }
  }

  return {
    ok: true,
    changeId: input.state.changeId,
    projects: archivedProjects,
  };
}
