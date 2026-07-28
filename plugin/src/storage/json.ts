/**
 * JSON File Storage
 *
 * Handles JSON disk projection for specs and changes. Temporal workflows are
 * the authoritative runtime state; JSON files serve projection and legacy
 * compatibility paths.
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
  activeEpics: string;
  retiredEpics: string;
  wisdom: string;
  reflections: string;
  projectMetadata: string;
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
      activeEpics: join(ext, "active-epics"),
      retiredEpics: join(ext, "retired-epics"),
      wisdom: join(ext, "wisdom.jsonl"),
      reflections: join(ext, "reflections.jsonl"),
      projectMetadata: join(ext, "project-metadata.json"),
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
    activeEpics: join(root, ".adv/active-epics"),
    retiredEpics: join(root, ".adv/retired-epics"),
    wisdom: join(root, ".adv/wisdom.jsonl"),
    reflections: join(root, ".adv/reflections.jsonl"),
    projectMetadata: join(root, ".adv/project-metadata.json"),
    snapshotRepairAudit: join(root, ".adv/snapshot-repair-audit.jsonl"),
    external: null,
  };
}

// =============================================================================
// Project Config
// =============================================================================

export async function loadProjectConfig(
  root: string,
): Promise<ProjectConfig | null> {
  const configPath = join(root, "project.json");

  try {
    const content = await readFile(configPath, "utf-8");
    return ProjectConfigSchema.parse(JSON.parse(content));
  } catch (error) {
    // File not found is normal — use defaults
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    // Schema validation failure on a legacy/invalid project.json must NOT abort
    // plugin initialization. Log a warning and fall back to defaults so the
    // rest of the plugin (tools, events, status markers) remains available.
    // Use loadProjectConfigWithDiagnostics for structured error reporting.
    if (error instanceof ZodError) {
      logger.warn(
        `project.json failed schema validation at ${configPath}; continuing with defaults. Run adv-status for details.`,
      );
      return null;
    }
    // Malformed JSON, permission errors — surface to caller
    throw error;
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

  // Check file existence first for a clean not_found signal
  try {
    await access(configPath);
  } catch {
    return {
      success: false,
      error: `project.json not found at ${configPath}`,
      type: "not_found",
    };
  }

  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch (e) {
    return {
      success: false,
      error: `Failed to read project.json: ${(e as Error).message}`,
      type: "read_error",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return {
      success: false,
      error: `project.json contains invalid JSON: ${(e as Error).message}`,
      type: "read_error",
    };
  }

  try {
    const config = ProjectConfigSchema.parse(parsed);
    return { success: true, data: config };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: formatZodError(error, {
          type: "project config",
          id: "project.json",
          path: configPath,
        }),
        type: "schema_error",
      };
    }
    return {
      success: false,
      error: `Unexpected error parsing project.json: ${(error as Error).message}`,
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
        `matches reserved pattern (changeRoundtrip*, gateParity*, parityTemporal*, ` +
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

/**
 * Load proposal.md from a change directory with graceful fallback.
 *
 * Returns the proposal content and an optional warning if the file was
 * missing or empty. Never throws — downstream commands can always proceed.
 *
 * @param changeDir - Absolute path to the change directory (e.g. .adv/changes/myChange)
 * @param changeTitle - Used to generate the scaffold title if proposal.md is absent
 */
export interface LoadProposalOptions {
  archiveDir?: string;
  changeId?: string;
}

export async function loadProposalWithFallback(
  changeDir: string,
  changeTitle: string,
  options?: LoadProposalOptions,
): Promise<{ content: string; warning?: string }> {
  const proposalPath = join(changeDir, "proposal.md");

  try {
    const raw = await readFile(proposalPath, "utf-8");
    if (raw.trim().length > 0) {
      return { content: raw };
    }
    // File exists but is empty — fall through to archive / scaffold
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn(
        `Unexpected error reading proposal: ${(err as Error).message}`,
      );
    }
    // File missing or unreadable — fall through to archive / scaffold
  }

  // Archive bundle fallback — read proposal.md from the latest bundle
  // when active dir is missing (archived changes are cleaned up).
  if (options?.archiveDir && options?.changeId) {
    try {
      const { findArchiveBundle } = await import("../archive/archive");
      const bundleDir = await findArchiveBundle(
        options.archiveDir,
        options.changeId,
      );
      if (bundleDir) {
        const raw = await readFile(join(bundleDir, "proposal.md"), "utf-8");
        if (raw.trim().length > 0) {
          return { content: raw };
        }
      }
    } catch {
      // Archive bundle missing or unreadable — fall through to scaffold
    }
  }

  const scaffold = `# ${changeTitle}

## Intent

<!-- Auto-generated scaffold: proposal.md was missing or empty. -->
<!-- Update this file with the actual intent, scope, and user outcomes. -->

## Scope

- (unknown — proposal.md not found)

## User Outcomes

- [ ] Users can see what outcome this change is meant to deliver
- [ ] Discovery firms acceptance criteria and success criteria downstream
`;

  return {
    content: scaffold,
    warning: `⚠️  proposal.md not found or empty at ${proposalPath}. Using auto-generated scaffold. Run /adv-proposal to create a proper proposal.`,
  };
}

export async function createChangeScaffold(
  changesDir: string,
  changeId: string,
  title: string,
  artifacts?: import("../types").ArtifactPayload,
): Promise<{
  changePath: string;
  proposalPath: string;
  problemStatementPath?: string;
  agreementPath?: string;
  designPath?: string;
  executiveSummaryPath?: string;
}> {
  const proposalContent = artifacts?.proposal;
  const problemStatementContent = artifacts?.problemStatement;
  const agreementContent = artifacts?.agreement;
  const designContent = artifacts?.design;
  const executiveSummaryContent = artifacts?.executiveSummary;
  const changeDir = join(changesDir, changeId);
  const changePath = join(changeDir, "change.json");
  const proposalPath = join(changeDir, "proposal.md");

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

  // Create proposal.md template with structured sections
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

  await atomicWriteFile(
    proposalPath,
    proposalContent ?? defaultProposalContent,
  );

  // Optional narrative artifacts — table-driven so adding a new artifact
  // is a single descriptor entry rather than four hand-coded if-blocks.
  // Mirror of the artifact array in updateChangeArtifacts() — keep in sync.
  const optionalArtifacts = [
    {
      key: "problemStatementPath",
      content: problemStatementContent,
      filename: "problem-statement.md",
    },
    {
      key: "agreementPath",
      content: agreementContent,
      filename: "agreement.md",
    },
    { key: "designPath", content: designContent, filename: "design.md" },
    {
      key: "executiveSummaryPath",
      content: executiveSummaryContent,
      filename: "executive-summary.md",
    },
  ] as const;

  const optionalPaths: {
    problemStatementPath?: string;
    agreementPath?: string;
    designPath?: string;
    executiveSummaryPath?: string;
  } = {};

  for (const { key, content, filename } of optionalArtifacts) {
    if (!content) continue;
    const filePath = join(changeDir, filename);
    await atomicWriteFile(filePath, content);
    optionalPaths[key] = filePath;
  }

  return {
    changePath,
    proposalPath,
    ...optionalPaths,
  };
}

/**
 * Update any narrative artifact file (proposal.md, problem-statement.md,
 * agreement.md, design.md, executive-summary.md) for an existing change.
 * Does NOT modify change.json — artifact-only update.
 *
 * Content params are optional — only provided files are written; omitted
 * files are left unchanged. Returns file paths for written files on
 * success, or an error message if the change directory does not exist or
 * a write fails.
 */
export async function updateChangeArtifacts(
  changesDir: string,
  changeId: string,
  artifacts: import("../types").ArtifactPayload,
): Promise<{
  proposalPath?: string;
  problemStatementPath?: string;
  agreementPath?: string;
  designPath?: string;
  executiveSummaryPath?: string;
  error?: string;
}> {
  const proposalContent = artifacts.proposal;
  const problemStatementContent = artifacts.problemStatement;
  const agreementContent = artifacts.agreement;
  const designContent = artifacts.design;
  const executiveSummaryContent = artifacts.executiveSummary;
  const changeDir = join(changesDir, changeId);

  // Validate the change directory exists
  try {
    await access(changeDir);
  } catch {
    return {
      error: `Change not found: "${changeId}". Cannot update artifacts for a change that does not exist.`,
    };
  }

  // Table-driven artifact writes — each entry maps a content param to its
  // filename and the result-shape key. Mirror of createChangeScaffold's
  // optionalArtifacts table (plus a proposal entry); keep in sync.
  const artifactEntries = [
    {
      key: "proposalPath",
      field: "proposal",
      content: proposalContent,
      filename: "proposal.md",
    },
    {
      key: "problemStatementPath",
      field: "problemStatement",
      content: problemStatementContent,
      filename: "problem-statement.md",
    },
    {
      key: "agreementPath",
      field: "agreement",
      content: agreementContent,
      filename: "agreement.md",
    },
    {
      key: "designPath",
      field: "design",
      content: designContent,
      filename: "design.md",
    },
    {
      key: "executiveSummaryPath",
      field: "executiveSummary",
      content: executiveSummaryContent,
      filename: "executive-summary.md",
    },
  ] as const;

  // rq-toolArgBlankArtifactLinkage01: storage rejects blank artifact writes
  // before any partial write so tool-layer bypasses cannot erase content.
  const blankFields = artifactEntries
    .filter(
      ({ content }) =>
        content !== undefined &&
        typeof content === "string" &&
        content.trim().length === 0,
    )
    .map(({ field }) => field);
  if (blankFields.length > 0) {
    return {
      error: `Blank artifact fields are not allowed: ${blankFields.join(", ")}. Omit fields you do not intend to change.`,
    };
  }

  const result: {
    proposalPath?: string;
    problemStatementPath?: string;
    agreementPath?: string;
    designPath?: string;
    executiveSummaryPath?: string;
    error?: string;
  } = {};

  for (const { key, content, filename } of artifactEntries) {
    if (content === undefined) continue;
    const filePath = join(changeDir, filename);
    try {
      await atomicWriteFile(filePath, content);
      (result as Record<string, string>)[key] = filePath;
    } catch (err) {
      return {
        ...result,
        error: `Failed to write ${filename}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return result;
}

// =============================================================================
// File Utilities
// =============================================================================

/**
 * Remove a change's on-disk directory (proposal.md, change.json, etc.)
 * recursively and force-idempotently. Used by `changes.create`'s
 * transactional rollback (P1.4) when the Temporal workflow start fails
 * AFTER the disk scaffold was written.
 *
 * `force: true` makes the operation a no-op if the directory doesn't
 * exist — critical for the re-throw semantics in store-temporal.ts's
 * rollback path: we must propagate the ORIGINAL Temporal error, not
 * mask it with an ENOENT from a double-rollback.
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
