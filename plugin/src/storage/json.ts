/**
 * JSON File Storage
 *
 * Handles reading/writing JSON files for specs and changes.
 * JSON files are the source of truth.
 */

import { join, basename } from "path";
import { readdir, mkdir, readFile, access, stat } from "fs/promises";
import { SpecSchema, ChangeSchema, ProjectConfigSchema } from "../types";
import type { Spec, Change, ProjectConfig } from "../types";
import { ZodError } from "zod";
import { atomicWriteFile } from "../utils/fs";

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
  } catch {
    return null;
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
  } catch {
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
  } catch {
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
    return { success: true, data: ChangeSchema.parse(JSON.parse(content)) };
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
  } catch {
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
): Promise<{
  changePath: string;
  proposalPath: string;
  problemStatementPath?: string;
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

  return { changePath, proposalPath, problemStatementPath };
}

// =============================================================================
// File Utilities
// =============================================================================

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function getFileMtime(path: string): Promise<Date | null> {
  try {
    const stats = await stat(path);
    return stats.mtime;
  } catch {
    return null;
  }
}
