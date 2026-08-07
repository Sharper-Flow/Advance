/**
 * Disk operations for artifacts, specs, projections, cross-repository files,
 * and archive summaries.
 *
 * Every operation returns a discriminated `{ ok: true, ... } | { ok: false,
 * error }` result and never throws across this boundary. Callers can therefore
 * decide whether to surface, retry, or fail closed without catching an
 * operation-specific exception.
 */

import { mkdir, readFile, stat, unlink } from "fs/promises";
import { join, normalize, isAbsolute, resolve, dirname, sep } from "path";
import { createHash } from "crypto";

import { atomicWriteFile } from "../utils/fs";
import { createLogger } from "../utils/debug-log";
import { buildLauncherProjection } from "../storage/launcher-projection";
import {
  listSpecsFilesystem,
  readSpecFilesystem,
  type ListSpecsInput,
  type ListSpecsResult,
  type ShowSpecInput,
  type ShowSpecResult,
} from "../storage/spec-filesystem";
import {
  deriveSummaryShard,
  summaryPaths,
  type SummaryIndexPaths,
} from "../storage/change-summary-shard-reader";
import type { ChangeState } from "../types/change-state";
import { CHANGE_BRANCH_PREFIX } from "../types";
import {
  ChangeStatusSchema,
  normalizeLegacyChangeStatus,
  type Change,
} from "../types";
import { renderBriefSummary } from "../utils/archive-summary";
import { applySpecDelta } from "../utils/spec-deltas";
import { appendWisdom } from "../utils/wisdom-append";
import { execGit } from "../utils/git";
import {
  ArchiveProjectionProofReceiptSchema,
  type ArchiveProjectionProofReceipt,
} from "../types";

const logger = createLogger("disk-operations");

// =============================================================================
// Disk artifact operations
// =============================================================================

/**
 * Per-change artifact kinds. Stored as `{kind}.md` next to `change.json`.
 *
 * Canonical source: `plugin/src/types/artifacts.ts`. Kept in lockstep with
 * the artifact set in `createChangeScaffold` / `updateChangeArtifacts`
 * (`storage/json.ts`). Naming standard: camelCase at the type/signal layer;
 * kebab-case appears only at this filesystem boundary through
 * `ARTIFACT_FILENAME` from the canonical artifact type module.
 */
export type { ArtifactKind } from "../types/artifacts";
import { ARTIFACT_FILENAME, type ArtifactKind } from "../types/artifacts";

export interface ReadArtifactInput {
  changesDir: string;
  changeId: string;
  kind: ArtifactKind;
}

export type ReadArtifactResult =
  | { ok: true; content: string }
  | { ok: false; error: string; content?: undefined };

export async function readArtifact(
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

export interface InspectArtifactInput {
  changesDir: string;
  changeId: string;
  kind: ArtifactKind;
}

export type InspectArtifactResult =
  | {
      ok: true;
      kind: ArtifactKind;
      path: string;
      contentHash: string;
      nonWhitespaceChars: number;
      checkedAt: string;
    }
  | {
      ok: false;
      kind: ArtifactKind;
      path: string;
      code: "missing" | "unreadable";
      error: string;
      checkedAt: string;
    };

export async function inspectArtifact(
  input: InspectArtifactInput,
): Promise<InspectArtifactResult> {
  const filename = ARTIFACT_FILENAME[input.kind];
  const path = join(input.changesDir, input.changeId, filename);
  const checkedAt = new Date().toISOString();
  try {
    const content = await readFile(path, "utf-8");
    return {
      ok: true,
      kind: input.kind,
      path,
      contentHash: createHash("sha256").update(content).digest("hex"),
      nonWhitespaceChars: content.replace(/\s/g, "").length,
      checkedAt,
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      kind: input.kind,
      path,
      code: code === "ENOENT" ? "missing" : "unreadable",
      error:
        code === "ENOENT"
          ? `Artifact not found: ${path}`
          : `Inspect failed (${code ?? "unknown"}): ${message}`,
      checkedAt,
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

export async function writeArtifact(
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

// =============================================================================
// T13 / KD-13 — materializeBundleArtifacts
//
// Reads `state.documents` from the workflow at archive time and writes the
// six markdown files into the bundle directory for the git commit. This is
// the SOLE production point where artifact content touches disk (AC8).
//
// Bundle layout, filenames, and git commit semantics unchanged (C2) — the
// activity writes each kind's content to its canonical kebab-case filename
// in the bundle dir; everything else (manifest, etc.) is unchanged.
// =============================================================================

export interface MaterializeBundleArtifactsInput {
  /** Absolute path to the bundle dir (`.adv/archive/{cid}-{ts}/`). */
  bundleDir: string;
  /** Workflow state.documents — kind→content map. Undefined kinds skipped. */
  documents: Partial<Record<ArtifactKind, string | undefined>> | undefined;
}

export interface MaterializeBundleArtifactsResult {
  /** Kinds successfully written into the bundle. */
  written: ArtifactKind[];
  /** Kinds skipped because no content was available in state.documents. */
  skipped: ArtifactKind[];
  /** Per-kind error messages when a write failed for an otherwise-present kind. */
  errors: Array<{ kind: ArtifactKind; error: string }>;
}

export async function materializeBundleArtifacts(
  input: MaterializeBundleArtifactsInput,
): Promise<MaterializeBundleArtifactsResult> {
  const written: ArtifactKind[] = [];
  const skipped: ArtifactKind[] = [];
  const errors: Array<{ kind: ArtifactKind; error: string }> = [];

  // mkdir the bundle dir if it doesn't exist; activity is called as part of
  // bundle materialization where the dir is expected to already be created
  // by the archive workflow, but make it idempotent.
  try {
    await mkdir(input.bundleDir, { recursive: true });
  } catch (err) {
    return {
      written,
      skipped: ARTIFACT_KIND_ORDER.slice(),
      errors: [
        {
          kind: "proposal" as ArtifactKind,
          error: `Bundle dir mkdir failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        },
      ],
    };
  }

  for (const kind of ARTIFACT_KIND_ORDER) {
    const content = input.documents?.[kind];
    if (content === undefined || content === null || content === "") {
      skipped.push(kind);
      continue;
    }
    const filename = ARTIFACT_FILENAME[kind];
    const path = join(input.bundleDir, filename);
    try {
      await atomicWriteFile(path, content);
      written.push(kind);
    } catch (err) {
      errors.push({
        kind,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { written, skipped, errors };
}

const ARTIFACT_KIND_ORDER: ReadonlyArray<ArtifactKind> = [
  "proposal",
  "problemStatement",
  "agreement",
  "design",
  "executiveSummary",
  "acceptance",
];

export async function listSpecs(
  input: ListSpecsInput,
): Promise<ListSpecsResult> {
  return listSpecsFilesystem(input);
}

export async function showSpec(input: ShowSpecInput): Promise<ShowSpecResult> {
  return readSpecFilesystem(input);
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
 * I/O. Used both by `crossRepoArtifact` (before file operations)
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
export async function crossRepoArtifact(
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
// Change projection operations
// =============================================================================

export interface WriteChangeProjectionInput {
  /** External mutable-state changes dir: `$stateRoot/{projectId}/changes`. */
  projectionChangesDir: string;
  /** Full in-memory workflow state to expose to external readers. */
  state: ChangeState;
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Projection write failed: ${message}` };
  }

  // Canonical post-pointer aggregate producer: publish an immutable summary
  // shard and atomic per-change pointer, then rebuild the launcher aggregate
  // solely from the durable summary pointers. The per-change wrapper projection
  // remains authoritative; the aggregate and pointer are downstream caches and
  // must not fail the activity or change the return value.
  try {
    const externalRoot = dirname(input.projectionChangesDir);
    const summariesDir = join(externalRoot, "summaries");
    const paths: SummaryIndexPaths = {
      changesDir: input.projectionChangesDir,
      summariesDir,
    };
    const summary = summaryPaths(paths, input.state.changeId);
    await mkdir(summary.changeDir, { recursive: true });
    await mkdir(summary.revDir, { recursive: true });

    const projectionRevision = input.state.state_revision ?? 0;
    const stateRevision = input.state.state_revision ?? 0;
    const operationId = `projection:${input.state.changeId}:${input.state.lastSignalAt ?? input.projectedAt}`;

    const normalizedStatus = ChangeStatusSchema.parse(
      normalizeLegacyChangeStatus(input.state.status),
    );
    const shard = deriveSummaryShard(
      {
        ...input.state,
        created_at: input.state.createdAt,
        status: normalizedStatus,
      } as Change,
      operationId,
      projectionRevision,
    );
    const shardPath = join(summary.revDir, `${projectionRevision}.json`);
    await atomicWriteFile(shardPath, `${JSON.stringify(shard, null, 2)}\n`);

    const pointer = {
      schema_version: 1 as const,
      change_id: input.state.changeId,
      state_revision: stateRevision,
      projection_revision: projectionRevision,
      operation_id: operationId,
      shard_path: shardPath,
      snapshot_path: path,
      committed_at: input.projectedAt,
    };
    await atomicWriteFile(
      summary.pointerPath,
      `${JSON.stringify(pointer, null, 2)}\n`,
    );

    const projection = await buildLauncherProjection({
      changesDir: input.projectionChangesDir,
      summariesDir,
      archiveDir: join(externalRoot, "archive"),
      generatedAt: input.state.lastSignalAt ?? input.projectedAt,
      degradedThresholdMs: 300_000,
    });
    await atomicWriteFile(
      join(externalRoot, "active-launcher-state.json"),
      `${JSON.stringify(projection, null, 2)}\n`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("launcher-projection-aggregate-failed", {
      changeId: input.state.changeId,
      projectionChangesDir: input.projectionChangesDir,
      error: message,
    });
  }

  return { ok: true, path };
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

export interface ArchiveChangeInput {
  state: ChangeState;
  projects: ArchiveProjectInput[];
  status: "archived" | "cancelled";
  archivedAt: string;
  approvalEvidence: string;
  approvedBy: string;
  /** Legacy replays mutate specs; new histories verify proof and write summary only. */
  mode?: "legacy_mutate" | "verify_summary";
  projectionProof?: ArchiveProjectionProofReceipt;
}

export type ArchiveChangeResult =
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

export async function archiveChange(
  input: ArchiveChangeInput,
): Promise<ArchiveChangeResult> {
  if (input.projects.length === 0) {
    return { ok: false, phase: "preflight", error: "No projects to archive" };
  }

  if (input.mode === "verify_summary") {
    const proof = ArchiveProjectionProofReceiptSchema.safeParse(
      input.projectionProof,
    );
    if (!proof.success || proof.data.change_id !== input.state.changeId) {
      return {
        ok: false,
        phase: "preflight",
        error: proof.success
          ? `Projection proof change mismatch: ${proof.data.change_id} != ${input.state.changeId}`
          : "Verified archive projection proof is required",
      };
    }
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
    ArchiveChangeResult,
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
        `${CHANGE_BRANCH_PREFIX}${input.state.changeId}`,
      );
      const headSha = await getOptionalGitValue(
        project.projectPath,
        ["rev-parse", "HEAD"],
        "pending",
      );
      if (input.status === "archived" && input.mode !== "verify_summary") {
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
