/**
 * Orphan Sweep — re-seed disk-only changes back into Temporal.
 *
 * Background:
 *   ADV state lives in two places: durable disk artifacts under
 *   `{state-root}/{projectId}/changes/{changeId}/` and live workflow state
 *   inside Temporal. The two are kept in sync by `reImportChangeState`,
 *   which is called whenever the plugin starts up against a project.
 *
 *   When Temporal loses a workflow (server reset, namespace change, ad-hoc
 *   `tctl workflow terminate`, etc.) but the disk snapshot survives, the
 *   change becomes an "orphan" — visible to legacy fallbacks but unusable
 *   through the Temporal-only tool path. The orphan-sweep walks each
 *   project, detects orphans, and re-seeds them.
 *
 * This module exports two surfaces:
 *   - `sweepProject({ projectId, changesDir, client })` — sweeps a single
 *     project; used by tests and by the multi-project sweep.
 *   - `sweepAllProjects({ stateRoot, client })` — sweeps every directory
 *     under the ADV state root that looks like a 40-char SHA project id.
 *
 * Corruption policy (per design.md KD-9):
 *   Disk snapshots that fail to parse (malformed JSON, schema errors,
 *   read errors) are SKIPPED with a structured warning. The sweep does
 *   not delete or attempt to repair corrupted snapshots — that requires
 *   user judgment.
 *
 * Failure policy:
 *   Workflow.start() failures (transient Temporal errors, validation
 *   errors) are recorded under `failed[]` per change, NOT surfaced as
 *   thrown exceptions. The sweep is best-effort across all projects;
 *   one bad project must not stop the rest.
 */

import { readdir } from "fs/promises";
import { join } from "path";

import { listChangeDirs, loadChange } from "../storage/json";
import { createLogger } from "../utils/debug-log";
import { buildChangeWorkflowId } from "./client";

const logger = createLogger("orphan-sweep");
import { reImportChangeState } from "./migration";
import type { Change } from "../types";

// =============================================================================
// Types
// =============================================================================

/**
 * Minimal Temporal client shape used by the sweep. Matches the duck-typed
 * `WorkflowClientLike` interface in `migration.ts` plus a `getHandle`
 * leg with a `describe()` method for orphan detection.
 *
 * Tests construct a hand-rolled mock; production callers pass the real
 * `@temporalio/client` Client which already conforms.
 */
export interface SweepClient {
  workflow: {
    start: (
      workflow: unknown,
      options: {
        workflowId: string;
        taskQueue: string;
        args: [unknown];
        searchAttributes?: Record<string, unknown[]>;
      },
    ) => Promise<unknown>;
    getHandle: (workflowId: string) => {
      describe: () => Promise<unknown>;
    };
  };
}

/**
 * Per-project sweep result. All counts add up: processed = reseeded +
 * (already-existing) + skipped + failed.
 */
export interface ProjectSweepResult {
  projectId: string;
  /** Number of change dirs walked, including skipped + failed. */
  processed: number;
  /** Change ids that were re-seeded into Temporal during this sweep. */
  reseeded: string[];
  /** Snapshots skipped because they couldn't be parsed/loaded. */
  skipped: Array<{ changeId: string; reason: string }>;
  /** Snapshots loaded successfully but workflow.start failed. */
  failed: Array<{ changeId: string; error: string }>;
}

export interface AllProjectsSweepResult {
  stateRoot: string;
  totalProcessed: number;
  totalReseeded: number;
  totalSkipped: number;
  totalFailed: number;
  perProject: ProjectSweepResult[];
}

// =============================================================================
// sweepProject
// =============================================================================

/**
 * Detect whether a workflow with the given id currently exists in Temporal.
 *
 * Returns `true` when `describe()` resolves, `false` for any thrown error
 * whose message indicates the workflow is missing. Other errors (auth,
 * connection refused) are NOT swallowed — they propagate so that callers
 * see real infrastructure problems instead of silently re-seeding every
 * project on every connection failure.
 */
async function workflowExists(
  client: SweepClient,
  workflowId: string,
): Promise<boolean> {
  try {
    await client.workflow.getHandle(workflowId).describe();
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Temporal SDK uses gRPC status code 5 (NOT_FOUND) for missing workflows.
    // The error message also includes "workflow execution not found" or
    // similar variants depending on SDK version.
    const code = (err as { code?: number }).code;
    if (
      code === 5 ||
      /not found|does not exist|no such workflow execution/i.test(message)
    ) {
      return false;
    }
    // Anything else is a real error — surface it.
    throw err;
  }
}

export interface SweepProjectInput {
  projectId: string;
  changesDir: string;
  client: SweepClient;
}

export async function sweepProject(
  input: SweepProjectInput,
): Promise<ProjectSweepResult> {
  const { projectId, changesDir, client } = input;
  const result: ProjectSweepResult = {
    projectId,
    processed: 0,
    reseeded: [],
    skipped: [],
    failed: [],
  };

  const dirs = await listChangeDirs(changesDir);
  for (const dir of dirs) {
    result.processed += 1;

    // Phase 1: load the on-disk change snapshot
    const loadResult = await loadChange(changesDir, dir);
    if (!loadResult.success) {
      result.skipped.push({
        changeId: dir,
        reason: loadResult.error,
      });
      logger.warn(
        `[orphan-sweep] skip ${projectId}/${dir}: ${loadResult.error}`,
      );
      continue;
    }
    if (loadResult.data === null) {
      // ENOENT — directory exists but no change.json. Treat as not-a-change.
      result.skipped.push({
        changeId: dir,
        reason: "missing change.json",
      });
      continue;
    }

    const change: Change = loadResult.data;

    // Phase 2: check Temporal for existing workflow
    const workflowId = buildChangeWorkflowId(projectId, change.id);
    let exists: boolean;
    try {
      exists = await workflowExists(client, workflowId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed.push({
        changeId: change.id,
        error: `describe failed: ${message}`,
      });
      logger.warn(
        `[orphan-sweep] describe ${projectId}/${change.id}: ${message}`,
      );
      continue;
    }

    if (exists) {
      // Healthy — disk and Temporal both have the change. Nothing to do.
      continue;
    }

    // Phase 3: orphan detected — reseed via reImportChangeState
    try {
      await reImportChangeState(client as never, {
        projectId,
        change,
      });
      result.reseeded.push(change.id);
      logger.info(`[orphan-sweep] reseeded ${projectId}/${change.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed.push({
        changeId: change.id,
        error: message,
      });
      logger.warn(
        `[orphan-sweep] reseed ${projectId}/${change.id}: ${message}`,
      );
    }
  }

  return result;
}

// =============================================================================
// sweepAllProjects
// =============================================================================

/**
 * 40-char lowercase hex string — the shape of a git root commit SHA.
 * Used to filter ADV state directories from stray cache files or
 * partial-write artifacts.
 */
const PROJECT_ID_REGEX = /^[0-9a-f]{40}$/;

export interface SweepAllInput {
  /**
   * Path to the ADV state root, e.g.
   * `~/.local/share/opencode/plugins/advance/`. Each subdirectory whose
   * name matches `PROJECT_ID_REGEX` is treated as a project.
   */
  stateRoot: string;
  client: SweepClient;
}

export async function sweepAllProjects(
  input: SweepAllInput,
): Promise<AllProjectsSweepResult> {
  const { stateRoot, client } = input;
  const aggregate: AllProjectsSweepResult = {
    stateRoot,
    totalProcessed: 0,
    totalReseeded: 0,
    totalSkipped: 0,
    totalFailed: 0,
    perProject: [],
  };

  let entries;
  try {
    entries = await readdir(stateRoot, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return aggregate;
    }
    throw err;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!PROJECT_ID_REGEX.test(entry.name)) continue;

    const projectId = entry.name;
    const changesDir = join(stateRoot, projectId, "changes");

    const projectResult = await sweepProject({
      projectId,
      changesDir,
      client,
    });
    aggregate.perProject.push(projectResult);
    aggregate.totalProcessed += projectResult.processed;
    aggregate.totalReseeded += projectResult.reseeded.length;
    aggregate.totalSkipped += projectResult.skipped.length;
    aggregate.totalFailed += projectResult.failed.length;
  }

  return aggregate;
}

// =============================================================================
// Summary formatter
// =============================================================================

/**
 * Format an `AllProjectsSweepResult` as a human-readable summary suitable
 * for emitting alongside `[ADV:ATTN]`. Used by the CLI entrypoint and by
 * the optional plugin-init bootstrap path.
 */
export function formatSweepSummary(result: AllProjectsSweepResult): string {
  const lines: string[] = [];
  lines.push(`Orphan sweep complete: ${result.stateRoot}`);
  lines.push(`  Projects scanned: ${result.perProject.length}`);
  lines.push(`  Changes processed: ${result.totalProcessed}`);
  lines.push(`  Reseeded: ${result.totalReseeded}`);
  lines.push(`  Skipped (corrupted): ${result.totalSkipped}`);
  lines.push(`  Failed (workflow.start error): ${result.totalFailed}`);

  if (result.totalReseeded > 0) {
    lines.push("");
    lines.push("Reseeded changes:");
    for (const p of result.perProject) {
      for (const id of p.reseeded) {
        lines.push(`  ${p.projectId.slice(0, 8)}…/${id}`);
      }
    }
  }

  if (result.totalSkipped > 0) {
    lines.push("");
    lines.push("Skipped (require manual triage):");
    for (const p of result.perProject) {
      for (const s of p.skipped) {
        lines.push(`  ${p.projectId.slice(0, 8)}…/${s.changeId}: ${s.reason}`);
      }
    }
  }

  if (result.totalFailed > 0) {
    lines.push("");
    lines.push("Failed (transient Temporal errors — retry suggested):");
    for (const p of result.perProject) {
      for (const f of p.failed) {
        lines.push(`  ${p.projectId.slice(0, 8)}…/${f.changeId}: ${f.error}`);
      }
    }
  }

  return lines.join("\n");
}
