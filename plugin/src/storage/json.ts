/**
 * JSON File Storage
 *
 * Handles reading/writing JSON files for specs and changes.
 * JSON files are the source of truth.
 */

import { join, dirname } from "path";
import {
  readdir,
  mkdir,
  readFile,
  writeFile,
  access,
  stat,
  rename,
  unlink,
} from "fs/promises";
import { SpecSchema, ChangeSchema, ProjectConfigSchema } from "../types";
import type { Spec, Change, ProjectConfig } from "../types";
import { ZodError } from "zod";

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
// Atomic Write
// =============================================================================

/**
 * Atomically write a file by writing to a temp file first, then renaming.
 * This prevents corrupted files from interrupted writes.
 */
async function atomicWriteFile(
  filePath: string,
  content: string,
): Promise<void> {
  const tempPath = `${filePath}.tmp.${Date.now()}`;

  try {
    // Ensure parent directory exists
    await mkdir(dirname(filePath), { recursive: true });

    // Write to temp file
    await writeFile(tempPath, content, "utf-8");

    // Atomic rename (this is atomic on POSIX systems)
    await rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

// =============================================================================
// File Paths
// =============================================================================

export interface ProjectPaths {
  root: string;
  specs: string;
  changes: string;
  archive: string;
  docs: string;
  db: string;
  config: string;
}

export function getProjectPaths(
  root: string,
  config?: Partial<ProjectConfig>,
): ProjectPaths {
  return {
    root,
    specs: join(root, config?.specs_dir ?? ".adv/specs"),
    changes: join(root, config?.changes_dir ?? ".adv/changes"),
    archive: join(root, config?.archive_dir ?? ".adv/archive"),
    docs: join(root, config?.docs_dir ?? "docs/specs"),
    db: join(root, config?.db_dir ?? ".adv/db"),
    config: join(root, "project.json"),
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
 * - Full ID: "add-feature-abc1" → "add-feature-abc1"
 * - Suffix match: "abc1" → "add-feature-abc1" (if unique)
 * - Prefix match: "add-feat" → "add-feature-abc1" (if unique)
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

  // Suffix match (user typed just the nanoid part)
  const suffixMatches = dirs.filter((d) => d.endsWith(`-${partialId}`));
  if (suffixMatches.length === 1) {
    return { id: suffixMatches[0], candidates: suffixMatches };
  }
  if (suffixMatches.length > 1) {
    return { id: null, candidates: suffixMatches };
  }

  // Prefix match
  const prefixMatches = dirs.filter((d) => d.startsWith(partialId));
  if (prefixMatches.length === 1) {
    return { id: prefixMatches[0], candidates: prefixMatches };
  }
  if (prefixMatches.length > 1) {
    return { id: null, candidates: prefixMatches };
  }

  // Contains match (last resort)
  const containsMatches = dirs.filter((d) => d.includes(partialId));
  if (containsMatches.length === 1) {
    return { id: containsMatches[0], candidates: containsMatches };
  }

  return { id: null, candidates: containsMatches };
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

export async function createChangeScaffold(
  changesDir: string,
  changeId: string,
  title: string,
): Promise<{ changePath: string; proposalPath: string }> {
  const changeDir = join(changesDir, changeId);
  const changePath = join(changeDir, "change.json");
  const proposalPath = join(changeDir, "proposal.md");

  await mkdir(changeDir, { recursive: true });

  // Create proposal.md template
  const proposalContent = `# ${title}

## Summary

<!-- Brief description of what this change accomplishes -->

## Motivation

<!-- Why is this change needed? What problem does it solve? -->

## Design

<!-- How will this be implemented? -->

## Acceptance Criteria

<!-- How will we know when this is done? -->

- [ ] Criterion 1
- [ ] Criterion 2
`;

  await atomicWriteFile(proposalPath, proposalContent);

  return { changePath, proposalPath };
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
