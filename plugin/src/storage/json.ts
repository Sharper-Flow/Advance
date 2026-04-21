/**
 * JSON File Storage
 *
 * Handles reading/writing JSON files for specs and changes.
 * JSON files are the source of truth.
 */

import { join, basename } from "path";
import { readdir, mkdir, readFile, access } from "fs/promises";
import { SpecSchema, ChangeSchema, ProjectConfigSchema } from "../types";
import type { Spec, Change, ProjectConfig } from "../types";
import { ZodError } from "zod";
import { atomicWriteFile } from "../utils/fs";
import { createLogger } from "../utils/debug-log";

const logger = createLogger("json");

// =============================================================================
// Result Types
// =============================================================================

/**
 * Result type for load operations that can fail with schema validation errors.
 * Errors are returned as data, not logged to console, so AI agents can see them.
 */
export type LoadResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      type: "not_found" | "schema_error" | "read_error";
    };

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

/**
 * Rewrite historical 6-gate migration artifacts into the current 7-gate shape.
 *
 * Context: during the 6→7 gate migration, older change.json files could
 * contain:
 *   - gate records with `status: "legacy"` (meaning "this gate was retired,
 *     treat it as satisfied")
 *   - auxiliary fields `migrated_from` / `absorbed_completions` recording
 *     the 6-gate origin
 *
 * The current schema (`GateStatusSchema` in types.ts) still accepts "legacy"
 * as a valid value, but production code no longer writes it — changes start
 * with `createDefaultGates()` (all pending) and progress via
 * `store.gates.complete()` (sets "done"). The old `createLegacyGates()` helper
 * and `store.gates.migrate()` scaffold were removed in April 2026.
 *
 * This normalizer stays in place to handle any residual on-disk data from
 * projects that predate the 6→7 migration. It rewrites `status: "legacy"`
 * to `status: "done"` and strips the `migrated_from` / `absorbed_completions`
 * fields so the record validates against the current schema.
 *
 * When the normalizer touches a file, `loadChange` writes the normalized
 * form back to disk atomically so subsequent loads are no-ops.
 */
function normalizeLegacyGateData(value: unknown): [unknown, boolean] {
  let changed = false;

  if (Array.isArray(value)) {
    const next = value.map((item) => {
      const [normalized, itemChanged] = normalizeLegacyGateData(item);
      changed = changed || itemChanged;
      return normalized;
    });
    return [next, changed];
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};

    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (key === "migrated_from" || key === "absorbed_completions") {
        changed = true;
        continue;
      }

      if (key === "status" && raw === "legacy") {
        out[key] = "done";
        changed = true;
        continue;
      }

      const [normalized, childChanged] = normalizeLegacyGateData(raw);
      out[key] = normalized;
      changed = changed || childChanged;
    }

    return [out, changed];
  }

  return [value, false];
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
  archive: string;
  db: string;
  wisdom: string;
  agenda: string;
  handoff: string;

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
    const dbDir = basename(config?.db_dir ?? ".adv/db");

    return {
      root,
      specs,
      docs,
      config: configPath,
      changes: join(ext, changesDir),
      archive: join(ext, archiveDir),
      db: join(ext, dbDir),
      wisdom: join(ext, "wisdom.jsonl"),
      agenda: join(ext, "agenda.jsonl"),
      handoff: join(ext, "handoff.json"),
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
    archive: join(root, config?.archive_dir ?? ".adv/archive"),
    db: join(root, config?.db_dir ?? ".adv/db"),
    wisdom: join(root, ".adv/wisdom.jsonl"),
    agenda: join(root, ".adv/agenda.jsonl"),
    handoff: join(root, ".adv/handoff.json"),
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
// Spec Operations
// =============================================================================

export async function listSpecDirs(specsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(specsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn(
        `Unexpected error reading specs directory: ${(err as Error).message}`,
      );
    }
    return [];
  }
}

export async function loadSpec(
  specsDir: string,
  capability: string,
): Promise<LoadResult<Spec | null>> {
  const specPath = join(specsDir, capability, "spec.json");

  try {
    const content = await readFile(specPath, "utf-8");
    return { success: true, data: SpecSchema.parse(JSON.parse(content)) };
  } catch (error) {
    if (error instanceof ZodError) {
      // Provide helpful error message for schema violations
      return {
        success: false,
        error: formatZodError(error, {
          type: "spec",
          id: capability,
          path: specPath,
        }),
        type: "schema_error",
      };
    } else if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // File not found - not an error, just return null
      return { success: true, data: null };
    } else {
      return {
        success: false,
        error: `Failed to load spec ${capability}: ${String(error)}`,
        type: "read_error",
      };
    }
  }
}

export async function loadAllSpecs(
  specsDir: string,
): Promise<Map<string, Spec>> {
  const specs = new Map<string, Spec>();
  const dirs = await listSpecDirs(specsDir);

  for (const dir of dirs) {
    const spec = await loadSpec(specsDir, dir);
    if (spec.success && spec.data) {
      specs.set(spec.data.name, spec.data);
    }
  }

  return specs;
}

export async function saveSpec(specsDir: string, spec: Spec): Promise<string> {
  const specDir = join(specsDir, spec.name);
  const specPath = join(specDir, "spec.json");

  await atomicWriteFile(specPath, JSON.stringify(spec, null, 2));

  return specPath;
}

// =============================================================================
// Change Operations
// =============================================================================

export async function listChangeDirs(changesDir: string): Promise<string[]> {
  try {
    const entries = await readdir(changesDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn(
        `Unexpected error reading changes directory: ${(err as Error).message}`,
      );
    }
    return [];
  }
}

/**
 * Resolve a partial change ID to a full change ID.
 * Supports:
 * - Full ID: "addUserAuth" → "addUserAuth"
 * - Prefix match: "addUs" → "addUserAuth" (if unique)
 * - Case-insensitive prefix: "adduser" → "addUserAuth" (if unique)
 *
 * Returns null if no match or multiple matches found.
 */
export async function resolveChangeId(
  changesDir: string,
  partialId: string,
): Promise<{ id: string | null; candidates: string[] }> {
  const dirs = await listChangeDirs(changesDir);

  // Exact match first
  if (dirs.includes(partialId)) {
    return { id: partialId, candidates: [partialId] };
  }

  // Case-insensitive prefix match
  const prefixMatches = dirs.filter((d) =>
    d.toLowerCase().startsWith(partialId.toLowerCase()),
  );
  if (prefixMatches.length === 1) {
    return { id: prefixMatches[0], candidates: prefixMatches };
  }
  if (prefixMatches.length > 1) {
    return { id: null, candidates: prefixMatches };
  }

  return { id: null, candidates: [] };
}

export async function loadChange(
  changesDir: string,
  changeId: string,
): Promise<LoadResult<Change | null>> {
  const changePath = join(changesDir, changeId, "change.json");

  try {
    const content = await readFile(changePath, "utf-8");
    const parsed = JSON.parse(content);
    const [normalized, changed] = normalizeLegacyGateData(parsed);

    if (changed) {
      await atomicWriteFile(changePath, JSON.stringify(normalized, null, 2));
    }

    return { success: true, data: ChangeSchema.parse(normalized) };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: formatZodError(error, {
          type: "change",
          id: changeId,
          path: changePath,
        }),
        type: "schema_error",
      };
    } else if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // File not found - return success with null data
      return { success: true, data: null };
    } else {
      return {
        success: false,
        error: `Failed to read change ${changeId}: ${error instanceof Error ? error.message : String(error)}`,
        type: "read_error",
      };
    }
  }
}

export async function loadAllChanges(
  changesDir: string,
): Promise<Map<string, Change>> {
  const changes = new Map<string, Change>();
  const dirs = await listChangeDirs(changesDir);

  for (const dir of dirs) {
    const change = await loadChange(changesDir, dir);
    if (change.success && change.data) {
      changes.set(change.data.id, change.data);
    }
  }

  return changes;
}

export async function saveChange(
  changesDir: string,
  change: Change,
): Promise<string> {
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
export async function loadProposalWithFallback(
  changeDir: string,
  changeTitle: string,
): Promise<{ content: string; warning?: string }> {
  const proposalPath = join(changeDir, "proposal.md");

  try {
    const raw = await readFile(proposalPath, "utf-8");
    if (raw.trim().length > 0) {
      return { content: raw };
    }
    // File exists but is empty — fall through to scaffold
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn(
        `Unexpected error reading proposal: ${(err as Error).message}`,
      );
    }
    // File missing or unreadable — fall through to scaffold
  }

  const scaffold = `# ${changeTitle}

## Intent

<!-- Auto-generated scaffold: proposal.md was missing or empty. -->
<!-- Update this file with the actual intent, scope, and success criteria. -->

## Scope

- (unknown — proposal.md not found)

## Success Criteria

- [ ] All tasks completed
- [ ] All tests pass
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
  proposalContent?: string,
  problemStatementContent?: string,
  agreementContent?: string,
  designContent?: string,
): Promise<{
  changePath: string;
  proposalPath: string;
  problemStatementPath?: string;
  agreementPath?: string;
  designPath?: string;
}> {
  const changeDir = join(changesDir, changeId);
  const changePath = join(changeDir, "change.json");
  const proposalPath = join(changeDir, "proposal.md");

  await mkdir(changeDir, { recursive: true });

  // Create proposal.md template with structured sections
  const defaultProposalContent = `# ${title}

## Why

<!-- What problem does this change solve? Why is it needed now? -->

## What Changes

<!-- Describe the specific modifications: new files, modified APIs, changed behavior -->

## Success Criteria

<!-- How will we know this is done? Measurable outcomes. -->

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] All tests pass

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

  // Write problem-statement.md artifact when provided
  let problemStatementPath: string | undefined;
  if (problemStatementContent) {
    problemStatementPath = join(changeDir, "problem-statement.md");
    await atomicWriteFile(problemStatementPath, problemStatementContent);
  }

  // Write agreement.md artifact when provided
  let agreementPath: string | undefined;
  if (agreementContent) {
    agreementPath = join(changeDir, "agreement.md");
    await atomicWriteFile(agreementPath, agreementContent);
  }

  // Write design.md artifact when provided
  let designPath: string | undefined;
  if (designContent) {
    designPath = join(changeDir, "design.md");
    await atomicWriteFile(designPath, designContent);
  }

  return {
    changePath,
    proposalPath,
    problemStatementPath,
    agreementPath,
    designPath,
  };
}

/**
 * Update proposal.md and/or problem-statement.md for an existing change.
 * Does NOT modify change.json — artifact-only update.
 *
 * Both content params are optional — only provided files are written.
 * Returns file paths for written files on success, or an error message
 * if the change directory does not exist or a write fails.
 */
export async function updateChangeArtifacts(
  changesDir: string,
  changeId: string,
  proposalContent?: string,
  problemStatementContent?: string,
  agreementContent?: string,
  designContent?: string,
): Promise<{
  proposalPath?: string;
  problemStatementPath?: string;
  agreementPath?: string;
  designPath?: string;
  error?: string;
}> {
  const changeDir = join(changesDir, changeId);

  // Validate the change directory exists
  try {
    await access(changeDir);
  } catch {
    return {
      error: `Change not found: "${changeId}". Cannot update artifacts for a change that does not exist.`,
    };
  }

  const artifacts = [
    { key: "proposalPath", content: proposalContent, filename: "proposal.md" },
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
  ] as const;

  const result: {
    proposalPath?: string;
    problemStatementPath?: string;
    agreementPath?: string;
    designPath?: string;
    error?: string;
  } = {};

  for (const { key, content, filename } of artifacts) {
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

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
