/**
 * Project Metadata Store
 *
 * Flat JSON storage for per-project metadata entries.
 * Open schema — any key, no pre-registration. Upsert semantics.
 * Shared across worktrees via external state directory.
 */

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { mkdir } from "fs/promises";
import {
  ProjectMetadataEntrySchema,
  type ProjectMetadataEntry,
} from "../types";
import { appendDebugLog } from "../utils/debug-log";
import { atomicWriteFile, acquireFileLock } from "../utils/fs";

// =============================================================================
// File Paths
// =============================================================================

/**
 * Get the project metadata file path.
 *
 * When `overridePath` is provided (e.g. from ProjectPaths.projectMetadata),
 * it is returned directly — supporting external state directories.
 * Otherwise falls back to `{projectDir}/.adv/project-metadata.json`.
 */
export const getProjectMetadataPath = (
  projectDir: string,
  overridePath?: string,
): string => {
  return overridePath ?? join(projectDir, ".adv", "project-metadata.json");
};

// =============================================================================
// Read
// =============================================================================

/**
 * Read all project metadata entries.
 * Returns a Record keyed by entry.key. Missing or corrupt file returns {}.
 * Validates each entry with ProjectMetadataEntrySchema — skips malformed.
 */
export async function readProjectMetadata(
  projectDir: string,
  overridePath?: string,
  options?: { _skipLock?: boolean },
): Promise<Record<string, ProjectMetadataEntry>> {
  const path = getProjectMetadataPath(projectDir, overridePath);

  if (!existsSync(path)) {
    return {};
  }

  const doRead = async (): Promise<string> => {
    return readFile(path, "utf-8");
  };

  let content: string;
  if (options?._skipLock) {
    content = await doRead();
  } else {
    const releaseLock = await acquireFileLock(path);
    try {
      content = await doRead();
    } finally {
      await releaseLock();
    }
  }

  if (!content.trim()) {
    return {};
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (e) {
    appendDebugLog(
      "project-metadata",
      `Corrupt JSON at ${path}: ${(e as Error).message}`,
    );
    return {};
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    appendDebugLog(
      "project-metadata",
      `Invalid root type at ${path}: expected object`,
    );
    return {};
  }

  const entries: Record<string, ProjectMetadataEntry> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const result = ProjectMetadataEntrySchema.safeParse(value);
    if (result.success) {
      entries[key] = result.data;
    } else {
      appendDebugLog(
        "project-metadata",
        `Skipping invalid entry "${key}": ${result.error.message}`,
      );
    }
  }

  return entries;
}

// =============================================================================
// Write
// =============================================================================

/**
 * Write a project metadata entry.
 * Upsert semantics: reads current state, merges new entry under entry.key,
 * writes back atomically with file locking.
 */
export async function writeProjectMetadataEntry(
  projectDir: string,
  entry: ProjectMetadataEntry,
  overridePath?: string,
): Promise<ProjectMetadataEntry> {
  const path = getProjectMetadataPath(projectDir, overridePath);

  // Ensure directory exists
  await mkdir(dirname(path), { recursive: true });

  const releaseLock = await acquireFileLock(path);
  try {
    const current = await readProjectMetadata(projectDir, overridePath, {
      _skipLock: true,
    });

    // Merge: new entry overwrites any existing entry with same key
    current[entry.key] = entry;

    await atomicWriteFile(path, JSON.stringify(current, null, 2));
  } finally {
    await releaseLock();
  }

  return entry;
}
