/**
 * Agenda Storage
 *
 * JSONL-based lightweight task storage for quick work items.
 * Append-only format for durability, with periodic compaction.
 */

import { readFile, writeFile, appendFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
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

// =============================================================================
// Constants
// =============================================================================

const AGENDA_DIR = ".adv";
const AGENDA_FILE = "agenda.jsonl";

// =============================================================================
// File Operations
// =============================================================================

/**
 * Get the agenda file path for a project.
 */
export const getAgendaPath = (projectDir: string): string => {
  return join(projectDir, AGENDA_DIR, AGENDA_FILE);
};

/**
 * Ensure the .adv directory exists.
 */
const ensureAgendaDir = async (projectDir: string): Promise<void> => {
  const dir = join(projectDir, AGENDA_DIR);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
};

/**
 * Parse a JSONL line into an agenda item or meta.
 */
const parseLine = (line: string): AgendaItem | AgendaMeta | null => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.type === "meta") {
      return AgendaMetaSchema.parse(parsed);
    }
    return AgendaItemSchema.parse(parsed);
  } catch {
    return null;
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
): Promise<{ meta: AgendaMeta | null; items: AgendaItem[] }> => {
  const path = getAgendaPath(projectDir);

  if (!existsSync(path)) {
    return { meta: null, items: [] };
  }

  const content = await readFile(path, "utf-8");
  const lines = content.split("\n");

  let meta: AgendaMeta | null = null;
  const itemsById = new Map<string, AgendaItem>();

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;

    if ("type" in parsed && parsed.type === "meta") {
      meta = parsed as AgendaMeta;
    } else {
      // Later entries override earlier ones (for updates)
      const item = parsed as AgendaItem;
      itemsById.set(item.id, item);
    }
  }

  // Sort by priority, then by created_at
  const items = Array.from(itemsById.values()).sort((a, b) => {
    const priorityDiff =
      AGENDA_PRIORITY_ORDER[a.priority] - AGENDA_PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return a.created_at.localeCompare(b.created_at);
  });

  return { meta, items };
};

/**
 * Initialize a new agenda file.
 */
export const initAgenda = async (
  projectDir: string,
  projectName?: string,
): Promise<AgendaMeta> => {
  await ensureAgendaDir(projectDir);
  const path = getAgendaPath(projectDir);

  const meta: AgendaMeta = {
    type: "meta",
    version: "1.0",
    created_at: new Date().toISOString(),
    project: projectName,
  };

  await writeFile(path, JSON.stringify(meta) + "\n", "utf-8");
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
  },
): Promise<AgendaItem> => {
  await ensureAgendaDir(projectDir);
  const path = getAgendaPath(projectDir);

  // Initialize if doesn't exist
  if (!existsSync(path)) {
    await initAgenda(projectDir);
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
    tdd_phase: "none",
  };

  await appendFile(path, JSON.stringify(item) + "\n", "utf-8");
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
): Promise<AgendaItem | null> => {
  const { items } = await loadAgenda(projectDir);
  const existing = items.find((i) => i.id === itemId);

  if (!existing) return null;

  const updated: AgendaItem = {
    ...existing,
    ...updates,
  };

  const path = getAgendaPath(projectDir);
  await appendFile(path, JSON.stringify(updated) + "\n", "utf-8");
  return updated;
};

/**
 * Start working on an agenda item.
 */
export const startAgendaItem = async (
  projectDir: string,
  itemId: string,
): Promise<AgendaItem | null> => {
  return updateAgendaItem(projectDir, itemId, {
    status: "active",
    started_at: new Date().toISOString(),
  });
};

/**
 * Complete an agenda item.
 */
export const completeAgendaItem = async (
  projectDir: string,
  itemId: string,
  notes?: string,
): Promise<AgendaItem | null> => {
  return updateAgendaItem(projectDir, itemId, {
    status: "done",
    completed_at: new Date().toISOString(),
    completion_notes: notes,
  });
};

/**
 * Cancel an agenda item.
 */
export const cancelAgendaItem = async (
  projectDir: string,
  itemId: string,
  reason?: string,
): Promise<AgendaItem | null> => {
  return updateAgendaItem(projectDir, itemId, {
    status: "cancelled",
    completed_at: new Date().toISOString(),
    completion_notes: reason,
  });
};

/**
 * Block an agenda item.
 */
export const blockAgendaItem = async (
  projectDir: string,
  itemId: string,
  blockedBy: string,
): Promise<AgendaItem | null> => {
  return updateAgendaItem(projectDir, itemId, {
    status: "blocked",
    blocked_by: blockedBy,
  });
};

/**
 * Reprioritize an agenda item.
 */
export const reprioritizeAgendaItem = async (
  projectDir: string,
  itemId: string,
  priority: AgendaPriority,
): Promise<AgendaItem | null> => {
  return updateAgendaItem(projectDir, itemId, { priority });
};

/**
 * Get pending/active items (the current work queue).
 */
export const getActiveAgenda = async (
  projectDir: string,
): Promise<AgendaItem[]> => {
  const { items } = await loadAgenda(projectDir);
  return items.filter((i) => i.status === "pending" || i.status === "active");
};

/**
 * Get the next item to work on (highest priority pending item).
 */
export const getNextAgendaItem = async (
  projectDir: string,
): Promise<AgendaItem | null> => {
  const { items } = await loadAgenda(projectDir);

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
 */
export const compactAgenda = async (projectDir: string): Promise<void> => {
  const { meta, items } = await loadAgenda(projectDir);
  const path = getAgendaPath(projectDir);

  const lines: string[] = [];

  if (meta) {
    lines.push(JSON.stringify(meta));
  }

  for (const item of items) {
    lines.push(JSON.stringify(item));
  }

  await writeFile(path, lines.join("\n") + "\n", "utf-8");
};

/**
 * Get agenda statistics.
 */
export const getAgendaStats = async (
  projectDir: string,
): Promise<{
  total: number;
  byStatus: Record<AgendaStatus, number>;
  byPriority: Record<AgendaPriority, number>;
  byCategory: Record<string, number>;
}> => {
  const { items } = await loadAgenda(projectDir);

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
