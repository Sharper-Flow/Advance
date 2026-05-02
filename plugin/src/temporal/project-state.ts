import { nanoid } from "nanoid";
import {
  AGENDA_PRIORITY_ORDER,
  type AgendaItem,
  type WisdomType,
} from "../types";
import {
  DEFAULT_CHANGE_SUMMARIES_CAP,
  type MigrationLedgerEntry,
  type ProjectWisdomEntry,
  type ProjectWorkflowInput,
  type ProjectWorkflowState,
  type ChangeSummaryPayload,
} from "./contracts";

function toAgendaId(raw: string): string {
  return raw.startsWith("ag-") ? raw : `ag-${raw}`;
}

function toProjectWisdomId(raw: string): string {
  return raw.startsWith("pw-") ? raw : `pw-${raw}`;
}

export function createProjectWorkflowState(
  input: ProjectWorkflowInput,
): ProjectWorkflowState {
  return {
    projectId: input.projectId,
    initializedAt: input.initializedAt,
    agenda: input.agenda ?? [],
    project_wisdom: input.projectWisdom ?? [],
    migration_ledger: input.migrationLedger ?? [],
    change_summaries: input.changeSummaries ?? {},
    source_versions: input.sourceVersions ?? {},
    change_summaries_cap:
      typeof input.changeSummariesCap === "number" &&
      Number.isFinite(input.changeSummariesCap) &&
      input.changeSummariesCap > 0
        ? input.changeSummariesCap
        : DEFAULT_CHANGE_SUMMARIES_CAP,
  };
}

export function listAgendaItemsFromProjectState(
  state: ProjectWorkflowState,
  status?: AgendaItem["status"],
): AgendaItem[] {
  const filtered = status
    ? state.agenda.filter((item) => item.status === status)
    : state.agenda;

  return [...filtered].sort((a, b) => {
    const priorityDiff =
      AGENDA_PRIORITY_ORDER[a.priority] - AGENDA_PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return a.created_at.localeCompare(b.created_at);
  });
}

export function addAgendaItemToProjectState(
  state: ProjectWorkflowState,
  input: {
    title: string;
    description?: string;
    priority?: AgendaItem["priority"];
    category?: string;
    blocked_by?: string;
  },
  deps: { now: string; uuid?: () => string },
): AgendaItem {
  const idSource = deps.uuid ? deps.uuid() : nanoid(8);
  const item: AgendaItem = {
    id: toAgendaId(idSource),
    title: input.title,
    description: input.description,
    priority: input.priority ?? "medium",
    status: "pending",
    category: input.category,
    blocked_by: input.blocked_by,
    created_at: deps.now,
    tdd_phase: "none",
  };

  state.agenda.push(item);
  return item;
}

export function updateAgendaItemInProjectState(
  state: ProjectWorkflowState,
  itemId: string,
  update: {
    status?: AgendaItem["status"];
    now: string;
    description?: string;
    priority?: AgendaItem["priority"];
    category?: string;
    blocked_by?: string;
    completion_notes?: string;
  },
): AgendaItem {
  const item = state.agenda.find((entry) => entry.id === itemId);
  if (!item) {
    throw new Error(`Agenda item not found: ${itemId}`);
  }

  if (update.description !== undefined) item.description = update.description;
  if (update.priority !== undefined) item.priority = update.priority;
  if (update.category !== undefined) item.category = update.category;
  if (update.blocked_by !== undefined) item.blocked_by = update.blocked_by;
  if (update.completion_notes !== undefined) {
    item.completion_notes = update.completion_notes;
  }

  if (update.status !== undefined) {
    item.status = update.status;
    if (update.status === "active" && !item.started_at) {
      item.started_at = update.now;
    }
    if (
      (update.status === "done" || update.status === "cancelled") &&
      !item.completed_at
    ) {
      item.completed_at = update.now;
    }
  }

  return item;
}

export function listProjectWisdomFromProjectState(
  state: ProjectWorkflowState,
  type?: WisdomType,
): ProjectWisdomEntry[] {
  const filtered = type
    ? state.project_wisdom.filter((entry) => entry.type === type)
    : state.project_wisdom;
  return [...filtered].sort((a, b) => b.promotedAt.localeCompare(a.promotedAt));
}

export function addProjectWisdomToProjectState(
  state: ProjectWorkflowState,
  input: {
    type: WisdomType;
    content: string;
    sourceChange?: string;
    sourceTask?: string;
    tags?: string[];
    invalidatedBy?: string;
  },
  deps: { now: string; uuid?: () => string },
): ProjectWisdomEntry {
  const idSource = deps.uuid ? deps.uuid() : nanoid(8);
  const entry: ProjectWisdomEntry = {
    id: toProjectWisdomId(idSource),
    type: input.type,
    content: input.content,
    sourceChange: input.sourceChange,
    sourceTask: input.sourceTask,
    promotedAt: deps.now,
    tags: input.tags,
    invalidatedBy: input.invalidatedBy,
  };

  state.project_wisdom.push(entry);
  return entry;
}

export function recordMigrationEntryInProjectState(
  state: ProjectWorkflowState,
  entry: MigrationLedgerEntry,
): MigrationLedgerEntry {
  // Remove ALL entries matching this key so stray duplicates (from bugs or
  // concurrent writers) cannot silently persist. Uniqueness is a stronger
  // guarantee than first-match replacement.
  state.migration_ledger = state.migration_ledger.filter(
    (candidate) => candidate.key !== entry.key,
  );
  state.migration_ledger.push(entry);
  return entry;
}

/**
 * Apply a change summary signal to the project workflow state.
 * Uses monotonic source_version for dedupe — skips if incoming
 * version is <= existing version for the same changeId.
 *
 * After insert/update, if the registry size exceeds
 * `state.change_summaries_cap`, evict the oldest archived entry by
 * `lastActivityAt`. Active and other non-archived statuses are never
 * evicted regardless of count. Eviction is replay-deterministic
 * (ES2019+ stable sort + monotonic source_version dedupe).
 *
 * Spec: rq-changeSummariesCap01.
 */
export function applyChangeSummaryToProjectState(
  state: ProjectWorkflowState,
  payload: ChangeSummaryPayload,
): void {
  const existing = state.source_versions[payload.changeId] ?? 0;
  if (payload.sourceVersion <= existing) {
    // Out-of-order or duplicate — skip
    return;
  }
  state.source_versions[payload.changeId] = payload.sourceVersion;
  state.change_summaries[payload.changeId] = payload;

  evictArchivedFromChangeSummariesIfNeeded(state);
}

/**
 * Eviction helper: when `state.change_summaries` size exceeds the cap,
 * remove the oldest archived entry (by `lastActivityAt`) along with its
 * `source_versions` entry. Skips entirely when no archived entry exists
 * (active changes are never evicted).
 *
 * Replay-determinism: `localeCompare` on ISO 8601 strings is stable,
 * `Object.entries` iterates in insertion order, and the ES2019+ Array
 * sort is required to be stable. Same inputs always produce the same
 * eviction outcome.
 */
function evictArchivedFromChangeSummariesIfNeeded(
  state: ProjectWorkflowState,
): void {
  const cap = state.change_summaries_cap;
  if (typeof cap !== "number" || cap <= 0) return;

  while (Object.keys(state.change_summaries).length > cap) {
    const archivedEntries = Object.entries(state.change_summaries).filter(
      ([, summary]) => summary.status === "archived",
    );
    if (archivedEntries.length === 0) {
      // Cap exceeded but only by non-archived entries; never evict those.
      return;
    }
    archivedEntries.sort((a, b) =>
      a[1].lastActivityAt.localeCompare(b[1].lastActivityAt),
    );
    const [oldestId] = archivedEntries[0];
    delete state.change_summaries[oldestId];
    delete state.source_versions[oldestId];
  }
}

/**
 * Remove a specific change from `change_summaries` and `source_versions`.
 * Idempotent: purging an unknown changeId is a no-op. Used by the
 * `adv.project.purgeChangeSummary` workflow update (rq-archivePurge01).
 */
export function purgeChangeSummaryFromProjectState(
  state: ProjectWorkflowState,
  changeId: string,
): void {
  delete state.change_summaries[changeId];
  delete state.source_versions[changeId];
}
