/**
 * Reflection Storage
 *
 * JSONL-based storage for post-completion reflection reports.
 * Mirrors project-wisdom.ts patterns: append-only, atomic writes,
 * file locking, graceful degradation on malformed lines.
 */

import { readFile, appendFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { nanoid } from "nanoid";
import { z } from "zod";
import { acquireFileLock } from "../utils/fs";
import { appendDebugLog } from "../utils/debug-log";

// =============================================================================
// Types
// =============================================================================

export interface ReflectionEntry {
  /** Unique ID (rf-{nanoid(8)}) */
  id: string;
  /** Change ID this reflection belongs to */
  change_id: string;
  /** ISO8601 timestamp when reflection was created */
  created_at: string;

  plane1: {
    efficiency: {
      task_count: number;
      tasks_done: number;
      tasks_cancelled: number;
      retry_total: number;
      retry_density: number;
      active_elapsed_ms?: number;
      elapsed_ms: number;
      per_gate_ms: Record<string, number>;
      threshold_tier: string;
    };
    quality: {
      review_findings_count?: number;
      harden_findings_count?: number;
      tdd_compliance: number;
    };
    process: {
      gate_completion_rate: number;
      tdd_intent_distribution: Record<string, number>;
      delegation_count: number;
      drift_triggers: number;
    };
    wisdom: {
      entries_captured: number;
      entries_promoted: number;
      wisdom_reuse_hits: number;
    };
  };

  plane2: {
    friction_items: Array<{
      category:
        | "tool_gap"
        | "workaround"
        | "missing_capability"
        | "docs_gap"
        | "ux_friction"
        | "provider_specific";
      tool_name?: string;
      description: string;
      workaround?: string;
      provider_specific?: {
        provider: string;
        detail: string;
      };
    }>;
    highlights: string[];
    improvement_suggestions: string[];
  };
}

// =============================================================================
// Zod Schema
// =============================================================================

const ProviderSpecificSchema = z.object({
  provider: z.string(),
  detail: z.string(),
});

const FrictionItemSchema = z.object({
  category: z.enum([
    "tool_gap",
    "workaround",
    "missing_capability",
    "docs_gap",
    "ux_friction",
    "provider_specific",
  ]),
  tool_name: z.string().optional(),
  description: z.string().min(1),
  workaround: z.string().optional(),
  provider_specific: ProviderSpecificSchema.optional(),
});

const ReflectionEntrySchema = z.object({
  id: z.string().startsWith("rf-"),
  change_id: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  plane1: z.object({
    efficiency: z.object({
      task_count: z.number().int().min(0),
      tasks_done: z.number().int().min(0),
      tasks_cancelled: z.number().int().min(0),
      retry_total: z.number().int().min(0),
      retry_density: z.number().min(0),
      active_elapsed_ms: z.number().min(0).optional(),
      elapsed_ms: z.number().min(0),
      per_gate_ms: z.record(z.string(), z.number().min(0)),
      threshold_tier: z.string(),
    }),
    quality: z.object({
      review_findings_count: z.number().int().min(0).optional(),
      harden_findings_count: z.number().int().min(0).optional(),
      tdd_compliance: z.number().min(0).max(1),
    }),
    process: z.object({
      gate_completion_rate: z.number().min(0).max(1),
      tdd_intent_distribution: z.record(z.string(), z.number().int().min(0)),
      delegation_count: z.number().int().min(0),
      drift_triggers: z.number().int().min(0),
    }),
    wisdom: z.object({
      entries_captured: z.number().int().min(0),
      entries_promoted: z.number().int().min(0),
      wisdom_reuse_hits: z.number().int().min(0),
    }),
  }),
  plane2: z.object({
    friction_items: z.array(FrictionItemSchema),
    highlights: z.array(z.string()),
    improvement_suggestions: z.array(z.string()),
  }),
});

// =============================================================================
// Constants
// =============================================================================

const ADV_DIR = ".adv";
const REFLECTIONS_FILE = "reflections.jsonl";

// =============================================================================
// File Paths
// =============================================================================

/**
 * Get the reflections file path.
 *
 * When `overridePath` is provided (e.g. from ProjectPaths),
 * it is returned directly — supporting external state directories.
 * Otherwise falls back to `{projectDir}/.adv/reflections.jsonl`.
 */
export const getReflectionsPath = (
  projectDir: string,
  overridePath?: string,
): string => {
  return overridePath ?? join(projectDir, ADV_DIR, REFLECTIONS_FILE);
};

function getLegacyReflectionsPath(projectDir: string): string {
  return join(projectDir, ADV_DIR, REFLECTIONS_FILE);
}

function resolveReadableReflectionsPath(
  projectDir: string,
  overridePath?: string,
): string {
  const preferred = getReflectionsPath(projectDir, overridePath);
  if (existsSync(preferred)) return preferred;

  // External state used to be passed as `projectDir`, which expanded to
  // `{external}/.adv/reflections.jsonl`. Keep read compatibility without
  // creating that nested directory for new writes.
  if (overridePath) {
    const legacy = getLegacyReflectionsPath(projectDir);
    if (legacy !== preferred && existsSync(legacy)) return legacy;
  }

  return preferred;
}

// =============================================================================
// Operations
// =============================================================================

/**
 * Append a reflection entry to the JSONL file.
 * Generates a new nanoid if the entry lacks one.
 */
export async function appendReflection(
  projectDir: string,
  entry: ReflectionEntry,
  overridePath?: string,
): Promise<ReflectionEntry> {
  const path = getReflectionsPath(projectDir, overridePath);

  // Ensure directory exists
  await mkdir(dirname(path), { recursive: true });

  // Ensure id is set
  const finalEntry: ReflectionEntry = {
    ...entry,
    id: entry.id?.startsWith("rf-") ? entry.id : `rf-${nanoid(8)}`,
    created_at: entry.created_at || new Date().toISOString(),
  };

  const releaseLock = await acquireFileLock(path);
  try {
    await appendFile(path, JSON.stringify(finalEntry) + "\n", "utf-8");
  } finally {
    await releaseLock();
  }

  return finalEntry;
}

/**
 * Parse JSONL content into validated ReflectionEntry array.
 * Internal helper — does not acquire locks or read files.
 */
function parseReflectionEntries(content: string): ReflectionEntry[] {
  const lines = content.split("\n");
  const entries: ReflectionEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const raw = JSON.parse(trimmed);
      const result = ReflectionEntrySchema.safeParse(raw);
      if (result.success) {
        entries.push(result.data as ReflectionEntry);
      } else {
        appendDebugLog(
          "reflection",
          `Skipping invalid entry: ${result.error.message}`,
        );
      }
    } catch (e) {
      appendDebugLog(
        "reflection",
        `Skipping malformed JSON line: ${(e as Error).message}`,
      );
    }
  }

  // Sort by recency (newest first)
  entries.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return entries;
}

/**
 * Get a reflection entry by change_id.
 * Returns null if not found.
 */
export async function getReflection(
  projectDir: string,
  changeId: string,
  overridePath?: string,
): Promise<ReflectionEntry | null> {
  const path = resolveReadableReflectionsPath(projectDir, overridePath);

  if (!existsSync(path)) {
    return null;
  }

  const content = await readFile(path, "utf-8");
  const entries = parseReflectionEntries(content);

  // Return the most recent entry for this change_id
  const match = entries.find((e) => e.change_id === changeId);
  return match ?? null;
}

/**
 * List all reflection entries.
 * Returns entries sorted by recency (newest first).
 * Optionally filters by change_id.
 */
export async function listReflections(
  projectDir: string,
  options?: {
    changeId?: string;
    _skipLock?: boolean;
    reflectionsPath?: string;
  },
): Promise<ReflectionEntry[]> {
  const path = resolveReadableReflectionsPath(
    projectDir,
    options?.reflectionsPath,
  );

  if (!existsSync(path)) {
    return [];
  }

  const content = await readFile(path, "utf-8");
  let entries = parseReflectionEntries(content);

  if (options?.changeId) {
    entries = entries.filter((e) => e.change_id === options.changeId);
  }

  return entries;
}
