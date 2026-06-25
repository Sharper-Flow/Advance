/**
 * Agenda Storage
 *
 * JSONL-based lightweight task storage for quick work items.
 * Append-only format for durability, with periodic compaction.
 */

import { readFile, appendFile, mkdir, unlink, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { nanoid } from "nanoid";
import {
  AgendaItemSchema,
  AgendaMetaSchema,
  AGENDA_PRIORITY_ORDER,
  type AgendaItem,
  type AgendaMeta,
  type AgendaPriority,
  type AgendaStatus,
} from "../types";
import { atomicWriteFile, acquireFileLock } from "../utils/fs";
import { appendDebugLog } from "../utils/debug-log";

// =============================================================================
// Constants
// =============================================================================

const AGENDA_DIR = ".adv";
const AGENDA_FILE = "agenda.jsonl";
export const AGENDA_AUTO_COMPACT_MAX_LINES = 100;

// =============================================================================
// File Safety Utilities
// =============================================================================

/**
 * Create a backup of a file before destructive operations.
 */
async function createBackup(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null;

  const backupPath = `${filePath}.backup.${Date.now()}`;
  try {
    await copyFile(filePath, backupPath);
    return backupPath;
  } catch {
    return null;
  }
}

/**
 * Clean up old backup files (keep only the most recent).
 */
async function cleanupOldBackups(filePath: string): Promise<void> {
  const { readdir } = await import("fs/promises");
  const dir = dirname(filePath);
  const baseName = filePath.split("/").pop() ?? "";

  try {
    const files = await readdir(dir);
    const backups = files
      .filter((f) => f.startsWith(`${baseName}.backup.`))
      .sort()
      .slice(0, -1); // Keep most recent

    for (const backup of backups) {
      try {
        await unlink(join(dir, backup));
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch {
    // Ignore errors
  }
}

// =============================================================================
// File Paths
// =============================================================================

/**
 * Get the agenda file path for a project.
 *
 * When `overridePath` is provided (e.g. from ProjectPaths.agenda),
 * it is returned directly — supporting external state directories.
 * Otherwise falls back to `{projectDir}/.adv/agenda.jsonl`.
 */
export const getAgendaPath = (
  projectDir: string,
  overridePath?: string,
): string => {
  return overridePath ?? join(projectDir, AGENDA_DIR, AGENDA_FILE);
};

/**
 * Ensure the agenda parent directory exists.
 */
const ensureAgendaDir = async (
  projectDir: string,
  overridePath?: string,
): Promise<void> => {
  const dir = overridePath
    ? dirname(overridePath)
    : join(projectDir, AGENDA_DIR);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
};

/**
 * Result of parsing a single JSONL line. Distinguishes intentional skips
 * (blank/comment lines) from malformed lines so the loader can surface and
 * preserve corruption instead of silently dropping it (rq-agendaDurableParse01).
 */
type ParseLineResult =
  | { kind: "skip" }
  | { kind: "malformed"; error: string }
  | { kind: "meta"; value: AgendaMeta }
  | { kind: "item"; value: AgendaItem };

/**
 * Parse a JSONL line into an agenda item or meta.
 */
const parseLine = (line: string): ParseLineResult => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return { kind: "skip" };

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.type === "meta") {
      return { kind: "meta", value: AgendaMetaSchema.parse(parsed) };
    }
    return { kind: "item", value: AgendaItemSchema.parse(parsed) };
  } catch (err) {
    return { kind: "malformed", error: (err as Error).message };
  }
};

const maybeAutoCompactAgenda = async (
  projectDir: string,
  agendaPath?: string,
): Promise<void> => {
  const path = getAgendaPath(projectDir, agendaPath);
  if (!existsSync(path)) return;

  const content = await readFile(path, "utf-8");
  const lineCount = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;

  if (lineCount > AGENDA_AUTO_COMPACT_MAX_LINES) {
    await compactAgenda(projectDir, { agendaPath });
  }
};

// =============================================================================
// Agenda Operations
// =============================================================================

/**
 * Load all agenda items from JSONL file.
 * Returns items in priority order.
 */
export const loadAgenda = async (
  projectDir: string,
  options?: { agendaPath?: string },
): Promise<{
  meta: AgendaMeta | null;
  items: AgendaItem[];
  skippedMalformed: number;
}> => {
  const path = getAgendaPath(projectDir, options?.agendaPath);

  if (!existsSync(path)) {
    return { meta: null, items: [], skippedMalformed: 0 };
  }

  const content = await readFile(path, "utf-8");
  const lines = content.split("\n");

  let meta: AgendaMeta | null = null;
  let skippedMalformed = 0;
  const itemsById = new Map<string, AgendaItem>();

  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed.kind === "skip") continue;
    if (parsed.kind === "malformed") {
      // Surface the corruption instead of silently dropping it. The line is
      // not added to the in-memory result, but the on-disk content is left
      // intact so a later compaction does not destroy it (rq-agendaDurableParse01).
      skippedMalformed += 1;
      appendDebugLog(
        "agenda",
        `Skipping malformed line in ${path}: ${parsed.error}`,
      );
      continue;
    }
    if (parsed.kind === "meta") {
      meta = parsed.value;
    } else {
      // Later entries override earlier ones (for updates)
      itemsById.set(parsed.value.id, parsed.value);
    }
  }

  // Sort by priority, then by created_at
  const items = Array.from(itemsById.values()).sort((a, b) => {
    const priorityDiff =
      AGENDA_PRIORITY_ORDER[a.priority] - AGENDA_PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return a.created_at.localeCompare(b.created_at);
  });

  return { meta, items, skippedMalformed };
};

/**
 * Initialize a new agenda file.
 */
export const initAgenda = async (
  projectDir: string,
  projectName?: string,
  options?: { agendaPath?: string },
): Promise<AgendaMeta> => {
  await ensureAgendaDir(projectDir, options?.agendaPath);
  const path = getAgendaPath(projectDir, options?.agendaPath);

  const meta: AgendaMeta = {
    type: "meta",
    version: "1.0",
    created_at: new Date().toISOString(),
    project: projectName,
  };

  // Use atomic write for safety
  await atomicWriteFile(path, JSON.stringify(meta) + "\n");
  return meta;
};

/**
 * Add a new item to the agenda.
 */
export const addAgendaItem = async (
  projectDir: string,
  title: string,
  options?: {
    description?: string;
    priority?: AgendaPriority;
    category?: string;
    blocked_by?: string;
    agendaPath?: string;
  },
): Promise<AgendaItem> => {
  await ensureAgendaDir(projectDir, options?.agendaPath);
  const path = getAgendaPath(projectDir, options?.agendaPath);

  // Initialize if doesn't exist
  if (!existsSync(path)) {
    await initAgenda(projectDir, undefined, {
      agendaPath: options?.agendaPath,
    });
  }

  const item: AgendaItem = {
    id: `ag-${nanoid(8)}`,
    title,
    description: options?.description,
    priority: options?.priority ?? "medium",
    status: "pending",
    category: options?.category,
    blocked_by: options?.blocked_by,
    created_at: new Date().toISOString(),
  };

  // Acquire lock to prevent interleaved appends from concurrent worktrees
  const releaseLock = await acquireFileLock(path);
  try {
    await appendFile(path, JSON.stringify(item) + "\n", "utf-8");
  } finally {
    await releaseLock();
  }
  await maybeAutoCompactAgenda(projectDir, options?.agendaPath);
  return item;
};

/**
 * Update an existing agenda item.
 * Appends a new version (JSONL is append-only, latest wins).
 */
export const updateAgendaItem = async (
  projectDir: string,
  itemId: string,
  updates: Partial<Omit<AgendaItem, "id" | "created_at">>,
  options?: { agendaPath?: string },
): Promise<AgendaItem | null> => {
  const path = getAgendaPath(projectDir, options?.agendaPath);

  // If the agenda file doesn't exist, no items to update
  if (!existsSync(path)) return null;

  // Acquire lock to prevent interleaved read-modify-append from concurrent worktrees
  const releaseLock = await acquireFileLock(path);
  let updated: AgendaItem | undefined;
  try {
    const { items } = await loadAgenda(projectDir, {
      agendaPath: options?.agendaPath,
    });
    const existing = items.find((i) => i.id === itemId);

    if (!existing) return null;

    updated = {
      ...existing,
      ...updates,
    };

    await appendFile(path, JSON.stringify(updated) + "\n", "utf-8");
  } finally {
    await releaseLock();
  }

  if (updated) {
    await maybeAutoCompactAgenda(projectDir, options?.agendaPath);
  }

  return updated;
};

/**
 * Start working on an agenda item.
 */
export const startAgendaItem = async (
  projectDir: string,
  itemId: string,
  options?: { agendaPath?: string },
): Promise<AgendaItem | null> => {
  return updateAgendaItem(
    projectDir,
    itemId,
    {
      status: "active",
      started_at: new Date().toISOString(),
    },
    options,
  );
};

/**
 * Complete an agenda item.
 */
export const completeAgendaItem = async (
  projectDir: string,
  itemId: string,
  notes?: string,
  options?: { agendaPath?: string },
): Promise<AgendaItem | null> => {
  return updateAgendaItem(
    projectDir,
    itemId,
    {
      status: "done",
      completed_at: new Date().toISOString(),
      completion_notes: notes,
    },
    options,
  );
};

/**
 * Cancel an agenda item.
 */
export const cancelAgendaItem = async (
  projectDir: string,
  itemId: string,
  reason?: string,
  options?: { agendaPath?: string },
): Promise<AgendaItem | null> => {
  return updateAgendaItem(
    projectDir,
    itemId,
    {
      status: "cancelled",
      completed_at: new Date().toISOString(),
      completion_notes: reason,
    },
    options,
  );
};

/**
 * Block an agenda item.
 */
const _blockAgendaItem = async (
  projectDir: string,
  itemId: string,
  blockedBy: string,
  options?: { agendaPath?: string },
): Promise<AgendaItem | null> => {
  return updateAgendaItem(
    projectDir,
    itemId,
    {
      status: "blocked",
      blocked_by: blockedBy,
    },
    options,
  );
};

/**
 * Reprioritize an agenda item.
 */
export const reprioritizeAgendaItem = async (
  projectDir: string,
  itemId: string,
  priority: AgendaPriority,
  options?: { agendaPath?: string },
): Promise<AgendaItem | null> => {
  return updateAgendaItem(projectDir, itemId, { priority }, options);
};

/**
 * Get pending/active items (the current work queue).
 */
export const getActiveAgenda = async (
  projectDir: string,
  options?: { agendaPath?: string },
): Promise<AgendaItem[]> => {
  const { items } = await loadAgenda(projectDir, {
    agendaPath: options?.agendaPath,
  });
  return items.filter((i) => i.status === "pending" || i.status === "active");
};

/**
 * Get the next item to work on (highest priority pending item).
 */
export const getNextAgendaItem = async (
  projectDir: string,
  options?: { agendaPath?: string },
): Promise<AgendaItem | null> => {
  const { items } = await loadAgenda(projectDir, {
    agendaPath: options?.agendaPath,
  });

  // First check for active items
  const active = items.find((i) => i.status === "active");
  if (active) return active;

  // Then find highest priority pending that's not blocked
  const blockedIds = new Set(
    items.filter((i) => i.status === "blocked").map((i) => i.blocked_by),
  );

  return (
    items.find(
      (i) =>
        i.status === "pending" &&
        !blockedIds.has(i.id) &&
        (!i.blocked_by ||
          items.find((b) => b.id === i.blocked_by)?.status === "done"),
    ) ?? null
  );
};

/**
 * Compact the agenda file (remove superseded entries).
 * Call periodically to keep file size manageable.
 *
 * Creates a backup before compacting and uses file locking
 * to prevent concurrent access issues.
 */
export const compactAgenda = async (
  projectDir: string,
  options?: { agendaPath?: string },
): Promise<void> => {
  const path = getAgendaPath(projectDir, options?.agendaPath);

  // Acquire lock to prevent concurrent modifications
  const releaseLock = await acquireFileLock(path);

  try {
    const { meta, items, skippedMalformed } = await loadAgenda(projectDir, {
      agendaPath: options?.agendaPath,
    });

    // Durability guard (rq-agendaDurableParse01.2): compaction rewrites the
    // file from successfully parsed entries only. If the load skipped any
    // malformed line, rewriting would permanently destroy that content. Skip
    // compaction and surface a warning so the corrupt line survives for
    // manual inspection.
    if (skippedMalformed > 0) {
      appendDebugLog(
        "agenda",
        `Skipping compaction of ${path}: ${skippedMalformed} malformed line(s) present; ` +
          `compaction would permanently discard unparsed content. Inspect and repair the file manually.`,
      );
      return;
    }

    // Create backup before destructive operation
    const backupPath = await createBackup(path);

    const lines: string[] = [];

    if (meta) {
      lines.push(JSON.stringify(meta));
    }

    for (const item of items) {
      lines.push(JSON.stringify(item));
    }

    // Use atomic write to prevent corruption
    await atomicWriteFile(path, lines.join("\n") + "\n");

    // Clean up old backups (keep only most recent)
    if (backupPath) {
      await cleanupOldBackups(path);
    }
  } finally {
    await releaseLock();
  }
};

/**
 * Get agenda statistics.
 */
export const getAgendaStats = async (
  projectDir: string,
  options?: { agendaPath?: string },
): Promise<{
  total: number;
  byStatus: Record<AgendaStatus, number>;
  byPriority: Record<AgendaPriority, number>;
  byCategory: Record<string, number>;
}> => {
  const { items } = await loadAgenda(projectDir, {
    agendaPath: options?.agendaPath,
  });

  const byStatus: Record<AgendaStatus, number> = {
    pending: 0,
    active: 0,
    blocked: 0,
    done: 0,
    cancelled: 0,
  };

  const byPriority: Record<AgendaPriority, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    backlog: 0,
  };

  const byCategory: Record<string, number> = {};

  for (const item of items) {
    byStatus[item.status]++;
    byPriority[item.priority]++;
    if (item.category) {
      byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    }
  }

  return {
    total: items.length,
    byStatus,
    byPriority,
    byCategory,
  };
};
