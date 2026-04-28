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

import { mkdir, readFile, stat } from "fs/promises";
import { join, normalize, isAbsolute, resolve, dirname, sep } from "path";
import { z } from "zod";

import { listSpecDirs, loadChange, type ProjectPaths } from "../storage/json";
import { atomicWriteFile } from "../utils/fs";
import { loadAgenda } from "../storage/agenda";
import { listProjectWisdom } from "../storage/project-wisdom";
import { writeJsonlAtomic } from "../storage/jsonl-atomic-writer";
import { AgendaItemSchema, WisdomTypeSchema } from "../types";
import {
  rebuildProjectWorkflowState,
  reImportChangeState,
  type WorkflowClientLike,
} from "./migration";
import { buildProjectWorkflowId } from "./client";
import { projectAgendaQuery, projectWisdomQuery } from "./messages";

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
// repairChangeActivity (P2.6)
// =============================================================================

const RepairedProjectWisdomEntrySchema = z.object({
  id: z.string(),
  type: WisdomTypeSchema,
  content: z.string().min(1).max(2000),
  sourceChange: z.string().optional(),
  sourceTask: z.string().optional(),
  promotedAt: z.string(),
  tags: z.array(z.string()).optional(),
  invalidatedBy: z.string().optional(),
});

interface RepairWorkflowHandleLike {
  terminate: (reason?: string) => Promise<void>;
  query: (def: unknown, ...args: unknown[]) => Promise<unknown>;
  executeUpdate: (
    def: unknown,
    options: { args?: unknown[] },
  ) => Promise<unknown>;
}

interface RepairWorkflowClientLike {
  start: WorkflowClientLike["start"];
  getHandle: (workflowId: string) => RepairWorkflowHandleLike;
}

export interface RepairChangeInput {
  projectId: string;
  changeId: string;
  approvalEvidence: string;
  paths: Pick<ProjectPaths, "root" | "changes" | "agenda" | "wisdom">;
  client: { workflow: RepairWorkflowClientLike };
}

export type RepairChangeResult =
  | {
      ok: true;
      projectId: string;
      changeId: string;
      message: string;
    }
  | {
      ok: false;
      error: string;
      phase:
        | "load-change"
        | "load-derived-state"
        | "terminate-project"
        | "rebuild-project"
        | "reimport-change"
        | "query-derived-exports"
        | "write-derived-exports";
      projectRebuilt: boolean;
      changeReimported: boolean;
    };

function repairFailure(input: {
  phase: Exclude<RepairChangeResult, { ok: true }>["phase"];
  error: unknown;
  projectRebuilt?: boolean;
  changeReimported?: boolean;
}): Exclude<RepairChangeResult, { ok: true }> {
  return {
    ok: false,
    phase: input.phase,
    error:
      input.error instanceof Error ? input.error.message : String(input.error),
    projectRebuilt: input.projectRebuilt ?? false,
    changeReimported: input.changeReimported ?? false,
  };
}

/**
 * Rebuild the project workflow from disk snapshots and re-import a single
 * change. P2.6: extracted from the inline body of `adv_workflow_repair`
 * (`tools/temporal-ops.ts`) so the disk + workflow logic is callable as a
 * standalone activity.
 *
 * The activity does NOT close any connection — lifetime is owned by the
 * caller. This was the original poison-pill bug fixed in hotfix `4aa420e`
 * and is the structural concern P2.6 addresses by giving the call site
 * (tool body) a clean single-responsibility surface.
 */
export async function repairChangeActivity(
  input: RepairChangeInput,
): Promise<RepairChangeResult> {
  const { projectId, changeId, paths, client } = input;

  const changeResult = await loadChange(paths.changes, changeId);
  if (!changeResult.success) {
    return repairFailure({ phase: "load-change", error: changeResult.error });
  }
  if (!changeResult.data) {
    return repairFailure({
      phase: "load-change",
      error: `No legacy change snapshot found for ${changeId}`,
    });
  }

  let agendaResult: Awaited<ReturnType<typeof loadAgenda>>;
  let projectWisdom: Awaited<ReturnType<typeof listProjectWisdom>>;
  try {
    agendaResult = await loadAgenda(paths.root, {
      agendaPath: paths.agenda,
    });
    projectWisdom = await listProjectWisdom(paths.root, {
      wisdomPath: paths.wisdom,
    });
  } catch (err) {
    return repairFailure({ phase: "load-derived-state", error: err });
  }

  const projectHandle = client.workflow.getHandle(
    buildProjectWorkflowId(projectId),
  );
  try {
    await projectHandle.terminate(
      `repairChangeActivity: rebuild project workflow from legacy snapshot (${input.approvalEvidence.trim()})`,
    );
  } catch {
    // Missing/terminated project workflows are acceptable; rebuild below is authoritative.
  }

  try {
    await rebuildProjectWorkflowState(client, {
      projectId,
      initializedAt: new Date().toISOString(),
      agenda: agendaResult.items,
      projectWisdom: projectWisdom.map((entry) => ({
        id: entry.id,
        type: entry.type,
        content: entry.content,
        sourceChange: entry.source_change,
        sourceTask: entry.source_task,
        promotedAt: entry.promoted_at,
        tags: entry.tags,
        invalidatedBy: entry.invalidated_by,
      })),
      migrationLedger: [],
    });
  } catch (err) {
    return repairFailure({ phase: "rebuild-project", error: err });
  }

  try {
    await reImportChangeState(client, {
      projectId,
      change: changeResult.data,
    });
  } catch (err) {
    return repairFailure({
      phase: "reimport-change",
      error: err,
      projectRebuilt: true,
    });
  }

  const repairedHandle = client.workflow.getHandle(
    buildProjectWorkflowId(projectId),
  );
  let agenda: z.infer<typeof AgendaItemSchema>[];
  let wisdom: z.infer<typeof RepairedProjectWisdomEntrySchema>[];
  try {
    agenda = z
      .array(AgendaItemSchema)
      .parse(await repairedHandle.query(projectAgendaQuery, undefined));
    wisdom = z
      .array(RepairedProjectWisdomEntrySchema)
      .parse(await repairedHandle.query(projectWisdomQuery, undefined));
  } catch (err) {
    return repairFailure({
      phase: "query-derived-exports",
      error: err,
      projectRebuilt: true,
      changeReimported: true,
    });
  }

  try {
    await writeJsonlAtomic(paths.agenda, agenda);
    await writeJsonlAtomic(
      paths.wisdom,
      wisdom.map((entry) => ({
        id: entry.id,
        type: entry.type,
        content: entry.content,
        source_change: entry.sourceChange,
        source_task: entry.sourceTask,
        promoted_at: entry.promotedAt,
        tags: entry.tags,
        invalidated_by: entry.invalidatedBy,
      })),
    );
  } catch (err) {
    return repairFailure({
      phase: "write-derived-exports",
      error: err,
      projectRebuilt: true,
      changeReimported: true,
    });
  }

  return {
    ok: true,
    projectId,
    changeId,
    message: `Repaired workflow state for ${changeId} in project ${projectId}`,
  };
}
