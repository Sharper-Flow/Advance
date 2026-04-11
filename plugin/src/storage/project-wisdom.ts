/**
 * Project-Level Wisdom Store
 *
 * JSONL-based storage for durable cross-change learnings.
 * Mirrors agenda.ts patterns: append-only, atomic writes, compaction.
 *
 * Only durable learnings should be promoted here.
 * Cap at 50 entries. Convention and pattern entries are prioritized during pruning.
 */

import { readFile, appendFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { nanoid } from "nanoid";
import { z } from "zod";
import { WisdomTypeSchema, type WisdomType } from "../types";
import { atomicWriteFile, acquireFileLock } from "../utils/fs";

// =============================================================================
// Types
// =============================================================================

export interface ProjectWisdomEntry {
  /** Unique ID (pw-{nanoid(8)}) */
  id: string;
  /** Category of this learning */
  type: WisdomType;
  /** The actual learning content */
  content: string;
  /** Change that originated this wisdom */
  source_change?: string;
  /** Task that originated this wisdom */
  source_task?: string;
  /** ISO8601 timestamp when promoted to project level */
  promoted_at: string;
  /** Optional relevance tags for future filtering (e.g. ["sqlite", "auth"]) */
  tags?: string[];
  /** If set, identifies the change that superseded this wisdom (soft-delete marker) */
  invalidated_by?: string;
}

/**
 * Zod schema for project wisdom entry validation during loading.
 * Rejects entries with invalid types, missing fields, or bad timestamps.
 */
export const ProjectWisdomEntrySchema = z.object({
  id: z.string().startsWith("pw-"),
  type: WisdomTypeSchema,
  content: z.string().min(1).max(2000),
  source_change: z.string().optional(),
  source_task: z.string().optional(),
  promoted_at: z.string().datetime({ offset: true }),
  // Optional staleness metadata — new fields, backwards compatible
  tags: z.array(z.string()).optional(),
  invalidated_by: z.string().optional(),
});

// =============================================================================
// Constants
// =============================================================================

const ADV_DIR = ".adv";
const WISDOM_FILE = "wisdom.jsonl";
const DEFAULT_MAX_ENTRIES = 50;

// =============================================================================
// File Paths
// =============================================================================

/**
 * Get the project wisdom file path.
 *
 * When `overridePath` is provided (e.g. from ProjectPaths.wisdom),
 * it is returned directly — supporting external state directories.
 * Otherwise falls back to `{projectDir}/.adv/wisdom.jsonl`.
 */
export const getProjectWisdomPath = (
  projectDir: string,
  overridePath?: string,
): string => {
  return overridePath ?? join(projectDir, ADV_DIR, WISDOM_FILE);
};

// =============================================================================
// Operations
// =============================================================================

/**
 * Add a new project-level wisdom entry.
 * Appends to the JSONL file (creates file if needed).
 */
export async function addProjectWisdom(
  projectDir: string,
  input: {
    type: WisdomType | string;
    content: string;
    sourceChange?: string;
    sourceTask?: string;
    /** Optional relevance tags for future filtering */
    tags?: string[];
    /** If set, marks this entry as superseding a prior wisdom entry */
    invalidated_by?: string;
    /** Override path — pass ProjectPaths.wisdom for external state support */
    wisdomPath?: string;
  },
): Promise<ProjectWisdomEntry> {
  // Validate type
  const typeResult = WisdomTypeSchema.safeParse(input.type);
  if (!typeResult.success) {
    throw new Error(
      `Invalid wisdom type: ${input.type}. Must be one of: pattern, success, failure, gotcha, convention`,
    );
  }

  // Validate content
  if (!input.content || input.content.trim().length === 0) {
    throw new Error("Wisdom content cannot be empty");
  }
  if (input.content.length > 2000) {
    throw new Error("Wisdom content exceeds 2000 character limit");
  }

  const path = getProjectWisdomPath(projectDir, input.wisdomPath);

  // Ensure directory exists
  await mkdir(dirname(path), { recursive: true });

  const entry: ProjectWisdomEntry = {
    id: `pw-${nanoid(8)}`,
    type: typeResult.data,
    content: input.content,
    source_change: input.sourceChange,
    source_task: input.sourceTask,
    promoted_at: new Date().toISOString(),
    ...(input.tags !== undefined && { tags: input.tags }),
    ...(input.invalidated_by !== undefined && {
      invalidated_by: input.invalidated_by,
    }),
  };

  const releaseLock = await acquireFileLock(path);
  try {
    await appendFile(path, JSON.stringify(entry) + "\n", "utf-8");
  } finally {
    await releaseLock();
  }
  return entry;
}

/**
 * Parse JSONL content into validated ProjectWisdomEntry array.
 * Internal helper — does not acquire locks or read files.
 */
function parseWisdomEntries(content: string): ProjectWisdomEntry[] {
  const lines = content.split("\n");
  const entries: ProjectWisdomEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const raw = JSON.parse(trimmed);
      const result = ProjectWisdomEntrySchema.safeParse(raw);
      if (result.success) {
        entries.push(result.data as ProjectWisdomEntry);
      } else if (process.env.ADV_DEBUG) {
        console.warn(
          `[adv:wisdom] Skipping invalid entry: ${result.error.message}`,
        );
      }
    } catch (e) {
      if (process.env.ADV_DEBUG) {
        console.warn(
          `[adv:wisdom] Skipping malformed JSON line: ${(e as Error).message}`,
        );
      }
    }
  }

  // Sort by recency (newest first)
  entries.sort((a, b) => b.promoted_at.localeCompare(a.promoted_at));
  return entries;
}

/**
 * List all project-level wisdom entries.
 * Returns entries sorted by recency (newest first).
 * Uses file locking to prevent reading partial writes.
 */
export async function listProjectWisdom(
  projectDir: string,
  options?: { maxEntries?: number; _skipLock?: boolean; wisdomPath?: string },
): Promise<ProjectWisdomEntry[]> {
  const path = getProjectWisdomPath(projectDir, options?.wisdomPath);

  if (!existsSync(path)) {
    return [];
  }

  let content: string;
  if (options?._skipLock) {
    // Called from within compaction which already holds the lock
    content = await readFile(path, "utf-8");
  } else {
    const releaseLock = await acquireFileLock(path);
    try {
      content = await readFile(path, "utf-8");
    } finally {
      await releaseLock();
    }
  }

  const entries = parseWisdomEntries(content);

  // Apply maxEntries limit
  if (
    options?.maxEntries !== undefined &&
    entries.length > options.maxEntries
  ) {
    return entries.slice(0, options.maxEntries);
  }

  return entries;
}

/**
 * Compact project wisdom: prune entries beyond cap.
 * Prioritizes convention and pattern entries — removes oldest non-priority entries first.
 * Uses atomic write to prevent corruption.
 */
export async function compactProjectWisdom(
  projectDir: string,
  options?: { maxEntries?: number; wisdomPath?: string },
): Promise<void> {
  const path = getProjectWisdomPath(projectDir, options?.wisdomPath);

  if (!existsSync(path)) {
    return;
  }

  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;

  const releaseLock = await acquireFileLock(path);
  try {
    // Re-read under lock to get consistent state (skip lock — we already hold it)
    const entries = await listProjectWisdom(projectDir, {
      _skipLock: true,
      wisdomPath: options?.wisdomPath,
    });

    if (entries.length <= maxEntries) {
      return; // Nothing to compact
    }

    // Separate priority types (conventions + patterns) from others
    const isPriority = (e: ProjectWisdomEntry) =>
      e.type === "convention" || e.type === "pattern";
    const priority = entries.filter(isPriority);
    const others = entries.filter((e) => !isPriority(e));

    // Keep all priority entries (up to cap), fill remaining with newest others
    let kept: ProjectWisdomEntry[];
    if (priority.length >= maxEntries) {
      // If we have more priority entries than cap, keep newest ones
      kept = priority.slice(0, maxEntries);
    } else {
      // Keep all priority entries + fill remaining slots with newest non-priority
      const remainingSlots = maxEntries - priority.length;
      kept = [...priority, ...others.slice(0, remainingSlots)];
    }

    // Re-sort by promoted_at descending (newest first) for consistency
    kept.sort((a, b) => b.promoted_at.localeCompare(a.promoted_at));

    // Write compacted file atomically
    // Store in chronological order on disk (oldest first) since that's append order
    const chronological = [...kept].reverse();
    const lines = chronological.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await atomicWriteFile(path, lines);
  } finally {
    await releaseLock();
  }
}
