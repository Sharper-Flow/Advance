/**
 * Temporal activities for ADV plugin.
 *
 * Activities are the canonical Temporal pattern for side-effecting I/O.
 * They run on workers (not in workflow code) and survive worker restarts
 * via Temporal's at-least-once retry semantics.
 *
 * Two families live here:
 *
 * 1. Telemetry / event-recording activities (legacy placeholders kept for
 *    infrastructure tests). They are pure and idempotent.
 *
 * 2. Disk-artifact activities (P2.1 — Phase 2 of completeTemporalOnlyMigration).
 *    Read/write `.adv/changes/{id}/{kind}.md`, `.adv/specs/`, and cross-repo
 *    files. Migrating these off the legacy in-process store is the gating
 *    step for retiring `legacy.*` callsites in store-temporal.ts (P2.2-P2.6).
 *
 * All activities return a discriminated `{ ok: true, ... } | { ok: false, error }`
 * shape. Activities never throw across the workflow boundary — the workflow
 * layer decides retry vs surface vs fail.
 */

import { mkdir, readFile, stat } from "fs/promises";
import { join, normalize, isAbsolute, resolve, sep } from "path";

import { listSpecDirs } from "../storage/json";
import { atomicWriteFile } from "../utils/fs";

// =============================================================================
// Telemetry placeholders (kept for infra tests)
// =============================================================================

export async function recordTemporalFoundationEvent(input: {
  scope: "change" | "project";
  id: string;
}): Promise<{ scope: "change" | "project"; id: string; recordedAt: string }> {
  return {
    ...input,
    recordedAt: new Date().toISOString(),
  };
}

export async function recordProjectWisdomExport(input: {
  projectId: string;
  entryCount: number;
}): Promise<{ projectId: string; entryCount: number; exportedAt: string }> {
  return {
    ...input,
    exportedAt: new Date().toISOString(),
  };
}

export async function recordProjectMigrationEvent(input: {
  projectId: string;
  key: string;
  status: "pending" | "done" | "failed";
}): Promise<{
  projectId: string;
  key: string;
  status: "pending" | "done" | "failed";
  recordedAt: string;
}> {
  return {
    ...input,
    recordedAt: new Date().toISOString(),
  };
}

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
    const parentDir = absoluteFile.substring(0, absoluteFile.lastIndexOf(sep));
    await mkdir(parentDir, { recursive: true });
    await atomicWriteFile(absoluteFile, content);
    return { ok: true, path: absoluteFile };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Write failed: ${message}` };
  }
}
