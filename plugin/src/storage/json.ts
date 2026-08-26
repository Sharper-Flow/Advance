/**
 * JSON File Storage
 *
 * Handles JSON disk projections for specs and changes.
 */

import { join, basename } from "path";
import { mkdir, readFile, access, rm } from "fs/promises";
import { ProjectConfigSchema } from "../types";
import type { Change, ProjectConfig } from "../types";
import { ZodError } from "zod";
import { atomicWriteFile } from "../utils/fs";
import { createLogger } from "../utils/debug-log";
import { isSyntheticValidationDraftPattern } from "../utils/synthetic-fixture-detector";

const logger = createLogger("json");

import type { LoadResult } from "./change-projection-reader";
import { listChangeDirs, loadChange } from "./change-projection-reader";
export type { LoadResult } from "./change-projection-reader";
export {
  isSchemaError,
  listChangeDirs,
  resolveChangeId,
  loadChange,
  loadAllChanges,
} from "./change-projection-reader";
export {
  listSpecDirs,
  loadSpec,
  loadAllSpecs,
  saveSpec,
} from "./spec-filesystem";

// =============================================================================
// Result Types
// =============================================================================

/**
 * Format a Zod validation error into a human-readable string for AI agents.
 */
function formatZodError(
  error: ZodError,
  context: { type: string; id: string; path: string },
): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join(".");
    return `  - ${path || "(root)"}: ${issue.message}`;
  });
  return (
    `Schema validation failed for ${context.type} "${context.id}":\n` +
    `File: ${context.path}\n` +
    `Issues:\n${issues.join("\n")}\n` +
    `Hint: Ensure the ${context.type}.json matches the schema.`
  );
}

// =============================================================================
// File Paths
// =============================================================================

export interface ProjectPaths {
  // In-repo (immutable, git-tracked)
  root: string;
  specs: string;
  docs: string;
  config: string;

  // Mutable (external when externalRoot is provided, else in-repo fallback)
  changes: string;
  summariesDir: string;
  archive: string;
  closed: string;
  activeEpics: string;
  retiredEpics: string;
  wisdom: string;
  reflections: string;
  projectMetadata: string;
  /** Storage-owned completion marker for the bounded artifact metadata migration. */
  artifactMetadataMigrationMarker: string;
  /** Storage-owned quarantine tree for unreadable projections. */
  quarantineChanges: string;
  /** Reconcile-owned artifacts; scanners must never report these as noise. */
  reconcileDir: string;
  /**
   * Append-only audit log for adv_snapshot_health repairs. Purpose-specific
   * (not Agenda) per retireAgendaWorkflow AC4: every successful snapshot
   * repair retains a durable audit record without creating Agenda work, and
   * the log stays outside planning, gates, backlog, and Epic state.
   */
  snapshotRepairAudit: string;

  /** External root directory, or null when using legacy in-repo paths */
  external: string | null;
}

export function getProjectPaths(
  root: string,
  config?: Partial<ProjectConfig>,
  options?: { externalRoot?: string },
): ProjectPaths {
  const ext = options?.externalRoot || null; // Reject empty strings

  // Immutable paths always resolve within the repo
  const specs = join(root, config?.specs_dir ?? ".adv/specs");
  const docs = join(root, config?.docs_dir ?? "docs/specs");
  const configPath = join(root, "project.json");

  if (ext) {
    // Mutable paths resolve within the external state directory.
    // Use basename() to extract the leaf directory name from config paths
    // like ".adv/changes" -> "changes", "my-changes" -> "my-changes"
    const changesDir = basename(config?.changes_dir ?? ".adv/changes");
    const archiveDir = basename(config?.archive_dir ?? ".adv/archive");

    return {
      root,
      specs,
      docs,
      config: configPath,
      changes: join(ext, changesDir),
      summariesDir: join(ext, "summaries"),
      archive: join(ext, archiveDir),
      closed: join(ext, "closed"),
      activeEpics: join(ext, "active-epics"),
      retiredEpics: join(ext, "retired-epics"),
      wisdom: join(ext, "wisdom.jsonl"),
      reflections: join(ext, "reflections.jsonl"),
      projectMetadata: join(ext, "project-metadata.json"),
      artifactMetadataMigrationMarker: join(
        ext,
        "artifact-metadata-migration-complete.json",
      ),
      quarantineChanges: join(ext, ".adv", "quarantine", "changes"),
      reconcileDir: join(ext, ".reconcile"),
      snapshotRepairAudit: join(ext, "snapshot-repair-audit.jsonl"),
      external: ext,
    };
  }

  // Legacy fallback: all paths in-repo under .adv/
  return {
    root,
    specs,
    docs,
    config: configPath,
    changes: join(root, config?.changes_dir ?? ".adv/changes"),
    summariesDir: join(root, ".adv/summaries"),
    archive: join(root, config?.archive_dir ?? ".adv/archive"),
    closed: join(root, ".adv/closed"),
    activeEpics: join(root, ".adv/active-epics"),
    retiredEpics: join(root, ".adv/retired-epics"),
    wisdom: join(root, ".adv/wisdom.jsonl"),
    reflections: join(root, ".adv/reflections.jsonl"),
    projectMetadata: join(root, ".adv/project-metadata.json"),
    artifactMetadataMigrationMarker: join(
      root,
      ".adv/artifact-metadata-migration-complete.json",
    ),
    quarantineChanges: join(root, ".adv/quarantine/changes"),
    reconcileDir: join(root, ".adv/.reconcile"),
    snapshotRepairAudit: join(root, ".adv/snapshot-repair-audit.jsonl"),
    external: null,
  };
}

// =============================================================================
// Project Config
// =============================================================================

type ProjectConfigLoad =
  | { kind: "ok"; config: ProjectConfig }
  | { kind: "not_found" }
  | { kind: "read_error"; error: Error }
  | { kind: "schema_error"; error: ZodError };

function errorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function parseProjectConfigFile(
  root: string,
): Promise<ProjectConfigLoad> {
  const configPath = join(root, "project.json");

  try {
    await access(configPath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return { kind: "not_found" };
    }
    return { kind: "read_error", error: asError(error) };
  }

  let content: string;
  try {
    content = await readFile(configPath, "utf-8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return { kind: "not_found" };
    }
    return { kind: "read_error", error: asError(error) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return { kind: "read_error", error: asError(error) };
  }

  try {
    return { kind: "ok", config: ProjectConfigSchema.parse(parsed) };
  } catch (error) {
    if (error instanceof ZodError) {
      return { kind: "schema_error", error };
    }
    return { kind: "read_error", error: asError(error) };
  }
}

export async function loadProjectConfig(
  root: string,
): Promise<ProjectConfig | null> {
  const configPath = join(root, "project.json");

  const result = await parseProjectConfigFile(root);
  switch (result.kind) {
    case "ok":
      return result.config;
    case "not_found":
      return null;
    case "schema_error":
      // Schema validation failure on a legacy/invalid project.json must NOT abort
      // plugin initialization. Log a warning and fall back to defaults so the
      // rest of the plugin (tools, events, status markers) remains available.
      // Use loadProjectConfigWithDiagnostics for structured error reporting.
      logger.warn(
        `project.json failed schema validation at ${configPath}; continuing with defaults. Run adv-status for details.`,
      );
      return null;
    case "read_error":
      // Malformed JSON, permission errors — surface to caller.
      throw result.error;
  }
}

/**
 * Load and validate project.json with structured diagnostics.
 *
 * Unlike loadProjectConfig (which silently returns null), this function
 * returns a LoadResult with actionable error messages for:
 * - Missing file (not_found)
 * - Invalid JSON syntax (read_error)
 * - Schema validation failures with field-level detail (schema_error)
 *
 * Use this in adv-status and other commands that need to surface config
 * problems to the agent/user rather than silently ignoring them.
 */
export async function loadProjectConfigWithDiagnostics(
  root: string,
): Promise<LoadResult<ProjectConfig>> {
  const configPath = join(root, "project.json");

  const result = await parseProjectConfigFile(root);
  switch (result.kind) {
    case "ok":
      return { success: true, data: result.config };
    case "not_found":
      return {
        success: false,
        error: `project.json not found at ${configPath}`,
        type: "not_found",
      };
    case "schema_error":
      return {
        success: false,
        error: formatZodError(result.error, {
          type: "project config",
          id: "project.json",
          path: configPath,
        }),
        type: "schema_error",
      };
    case "read_error":
      if (result.error instanceof SyntaxError) {
        return {
          success: false,
          error: `project.json contains invalid JSON: ${result.error.message}`,
          type: "read_error",
        };
      }
      if (errorCode(result.error)) {
        return {
          success: false,
          error: `Failed to read project.json: ${result.error.message}`,
          type: "read_error",
        };
      }
      return {
        success: false,
        error: `Unexpected error parsing project.json: ${result.error.message}`,
        type: "read_error",
      };
  }
}

export async function saveProjectConfig(
  root: string,
  config: ProjectConfig,
): Promise<void> {
  const configPath = join(root, "project.json");
  await atomicWriteFile(configPath, JSON.stringify(config, null, 2));
}

// =============================================================================
// Change Operations
// =============================================================================

export async function saveChange(
  changesDir: string,
  change: Change,
): Promise<string> {
  // rq-synthstate01 disk-layer guard: reject synthetic-validation-draft
  // change IDs at the lowest write path so leaked test fixtures can't
  // accumulate via legacy / direct-disk-write code paths that bypass
  // adv_change_create's tool-layer guard. See utils/synthetic-fixture-detector
  // and the audit at 2026-05-07 (~600 leaked records reaped manually
  // across 16 ADV project directories before this guard landed).
  if (isSyntheticValidationDraftPattern(change.id)) {
    throw new Error(
      `Refusing to write change with synthetic-validation-draft ID "${change.id}": ` +
        `matches reserved pattern (changeRoundtrip*, gateParity*, parityLegacy*, ` +
        `latencyLegacy*, etc). These IDs are reserved for ADV's own validation/parity/` +
        `latency/roundtrip workflows which must use isolated temp storage, not live ADV ` +
        `state. Spec: rq-synthstate01.`,
    );
  }

  const changeDir = join(changesDir, change.id);
  const changePath = join(changeDir, "change.json");

  await atomicWriteFile(changePath, JSON.stringify(change, null, 2));

  return changePath;
}

export async function createChangeScaffold(
  changesDir: string,
  changeId: string,
  title: string,
  artifacts?: import("../types").ArtifactPayload,
): Promise<{
  changePath: string;
  documents: import("../types").ArtifactPayload;
}> {
  const proposalContent = artifacts?.proposal;
  const problemStatementContent = artifacts?.problemStatement;
  const agreementContent = artifacts?.agreement;
  const designContent = artifacts?.design;
  const executiveSummaryContent = artifacts?.executiveSummary;
  const changeDir = join(changesDir, changeId);
  const changePath = join(changeDir, "change.json");

  // rq-toolArgBlankArtifactLinkage01: storage rejects blank artifact writes
  // before any partial scaffold write so tool-layer bypasses cannot create
  // blank narrative artifacts.
  const blankFields = [
    { field: "proposal", content: proposalContent },
    { field: "problemStatement", content: problemStatementContent },
    { field: "agreement", content: agreementContent },
    { field: "design", content: designContent },
    { field: "executiveSummary", content: executiveSummaryContent },
  ]
    .filter(
      ({ content }) =>
        content !== undefined &&
        typeof content === "string" &&
        content.trim().length === 0,
    )
    .map(({ field }) => field);
  if (blankFields.length > 0) {
    throw new Error(
      `Blank artifact fields are not allowed: ${blankFields.join(", ")}. Omit fields you do not intend to change.`,
    );
  }

  await mkdir(changeDir, { recursive: true });

  // Build the initial projection documents. Narrative markdown is a legacy
  // read fallback; the projection is the active record for newly-created
  // changes.
  const defaultProposalContent = `# ${title}

## Why

<!-- What problem does this change solve? Why is it needed now? -->

## What Changes

<!-- Describe the specific modifications: new files, modified APIs, changed behavior -->

## User Outcomes

<!-- What user-perspective outcomes should this change deliver? Keep these implementation-free; discovery firms AC/SC. -->

- [ ] User outcome 1
- [ ] User outcome 2
- [ ] Discovery will firm acceptance criteria and success criteria

## Affected Code

<!-- List files, modules, or subsystems that will be modified -->

- \`path/to/file.ts\` — description of change
- \`path/to/other.ts\` — description of change

## Constraints

<!-- Technical, time, or resource constraints that shape the solution -->

## Impact

<!-- Who/what is affected? Breaking changes? Migration needed? -->

## Risks

<!-- What could go wrong? Dependencies on external systems? -->

## Validation Plan

<!-- How will correctness be verified? TDD: write tests first (red → green → refactor) -->

- Write failing tests for new behavior (red phase)
- Implement to make tests pass (green phase)
- Run full test suite to verify no regressions
`;

  return {
    changePath,
    documents: {
      proposal: proposalContent ?? defaultProposalContent,
      ...(problemStatementContent !== undefined
        ? { problemStatement: problemStatementContent }
        : {}),
      ...(agreementContent !== undefined
        ? { agreement: agreementContent }
        : {}),
      ...(designContent !== undefined ? { design: designContent } : {}),
      ...(executiveSummaryContent !== undefined
        ? { executiveSummary: executiveSummaryContent }
        : {}),
    },
  };
}

// =============================================================================
// File Utilities
// =============================================================================

/**
 * Remove a change's on-disk directory (proposal.md, change.json, etc.)
 * recursively and force-idempotently. Used by `changes.create`'s
 * transactional rollback when the disk scaffold was written before a later
 * operation failed.
 *
 * `force: true` makes the operation a no-op if the directory doesn't
 * exist — critical for rollback paths that must propagate the original error,
 * not mask it with an ENOENT from a double-rollback.
 *
 * See design.md § KD-7 (validator-corrected).
 */
export async function removeChangeDir(
  changesDir: string,
  changeId: string,
): Promise<void> {
  await rm(join(changesDir, changeId), { recursive: true, force: true });
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether an archive bundle exists for a change ID.
 *
 * Tests for a `change.json` sentinel file whose parsed `id` matches the stable
 * change ID. Archive bundle directory names are not canonical: current bundles
 * may be date-prefixed (`archive/2026-06-15-<changeId>/change.json`) while some
 * tests/legacy paths use `archive/<changeId>/change.json`.
 *
 * Used by `listResolvedChanges` (Layer A1) to detect archived changes whose
 * source `changes/<id>/` directory persists with stale `status: "draft"` —
 * a zombie shadow caused by `removeChangeDir` cleanup failure or process
 * crash between archive transition and source cleanup.
 *
 * Spec: rq-archiveRetirement01.1 — "Default active change lists do not
 * include the archived change." This helper enables that contract to be
 * upheld even when disk-fallback returns stale status.
 */
export async function hasArchiveBundle(
  archivePath: string,
  changeId: string,
): Promise<boolean> {
  if (await fileExists(join(archivePath, changeId, "change.json"))) {
    return true;
  }

  const dirs = await listChangeDirs(archivePath);
  for (const dir of dirs) {
    if (dir === changeId) continue;
    if (!dir.includes(changeId)) continue;
    const loaded = await loadChange(archivePath, dir);
    if (loaded.success && loaded.data?.id === changeId) {
      return true;
    }
    // Schema-invalid archive bundles are intentionally NOT reported here.
    // Archive bundles are write-targets for split-brain recovery; reporting
    // them as existing would cause loadArchiveBundleDominantProjection to
    // be entered, but the bundle content is unreadable. Letting the scan
    // continue (and returning false if no valid bundle matches) allows the
    // caller to fall through to the live workflow path, which is what
    // recovery needs. Schema errors in the ACTIVE change.json are still
    // surfaced verbatim via loadDiskTerminalProjection (issue #258 Defect 1).
  }

  return false;
}

/**
 * Load a closed change from its canonical, plain-ID bundle path.
 *
 * Closed bundle directory names are canonical, so this helper intentionally
 * probes only `closed/<changeId>/change.json` and never scans siblings.
 */
export async function loadClosedChange(
  closedPath: string,
  changeId: string,
): Promise<LoadResult<Change | null>> {
  return loadChange(closedPath, changeId);
}
