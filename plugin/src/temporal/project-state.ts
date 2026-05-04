import { nanoid } from "nanoid";
import {
  AGENDA_PRIORITY_ORDER,
  type AgendaItem,
  type WisdomType,
} from "../types";
import {
  DEFAULT_CHANGE_SUMMARIES_CAP,
  type MigrationLedgerEntry,
  type PendingWorktreeDelete,
  type ProjectWisdomEntry,
  type ProjectWorkflowInput,
  type ProjectWorkflowState,
  type ChangeSummaryPayload,
  type MaterializedWorktreeRecord,
  type SessionRecord,
  type WorktreeRecord,
  assertProjectWorkflowReachable,
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
  const worktreeRegistry = Object.fromEntries(
    Object.entries(input.worktreeRegistry ?? {}).map(([branch, record]) => [
      branch,
      normalizeWorktreeRecord(record),
    ]),
  );

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
    // T4 (KD-1): worktree + session registries — state authority lives in
    // the project workflow. Spec: rq-worktreeRegistry01.
    // Branch-aware registry contract: rq-wl-branchRegistry01.
    worktree_registry: worktreeRegistry,
    pending_worktree_deletes: input.pendingWorktreeDeletes ?? {},
    session_registry: input.sessionRegistry ?? {},
  };
}

export function normalizeWorktreeRecord(
  record: WorktreeRecord,
): WorktreeRecord {
  const materialized = record.materialized ?? Boolean(record.path);
  const setupReady =
    record.setupReady ?? (materialized && record.status !== "setup_failed");
  return {
    ...record,
    materialized,
    setupReady,
    cleanupEligible: record.cleanupEligible ?? false,
    cleanupBlockedBy: record.cleanupBlockedBy ?? [],
  };
}

export function listWorktreeRegistryFromProjectState(
  state: ProjectWorkflowState,
  filter: {
    materialized?: boolean;
    status?: WorktreeRecord["status"];
    changeId?: string;
  } = {},
): WorktreeRecord[] {
  assertProjectWorkflowReachable(state);
  return Object.values(state.worktree_registry)
    .map(normalizeWorktreeRecord)
    .filter((record) => {
      if (
        filter.materialized !== undefined &&
        record.materialized !== filter.materialized
      ) {
        return false;
      }
      if (filter.status !== undefined && record.status !== filter.status) {
        return false;
      }
      if (
        filter.changeId !== undefined &&
        record.changeId !== filter.changeId
      ) {
        return false;
      }
      return true;
    });
}

export function listMaterializedWorktreesFromProjectState(
  state: ProjectWorkflowState,
): MaterializedWorktreeRecord[] {
  return listWorktreeRegistryFromProjectState(state, {
    materialized: true,
  }).filter(
    (record): record is MaterializedWorktreeRecord =>
      record.materialized === true && typeof record.path === "string",
  );
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

// =============================================================================
// T6 (KD-1): worktree + session lifecycle mutators
// Spec anchors: rq-worktreeRegistry01, rq-multiSessionCoordination01.
//
// Replay-determinism guarantees:
// - Monotonic `sourceVersion` per worktree-id / session-id for dedup
//   (out-of-order updates skipped if version <= existing)
// - All timestamps come in via the payload (no Date.now() in mutator body)
// - No floating-point math; no random IDs in the mutator body
// - Object iteration uses insertion order (ES2019+) for determinism
//
// Each mutator invokes `assertProjectWorkflowReachable()` first so a
// degraded workflow state (e.g. continue-as-new from an older snapshot
// that lacks the new registries) returns a deterministic
// WORKFLOW_NOT_READY error instead of a NPE.
// =============================================================================

/** Payload for `adv.project.addWorktreeSession`. */
export interface AddWorktreeSessionPayload {
  branch: string;
  path: string;
  changeId?: string;
  baseRef: string;
  headSha: string;
  source: WorktreeRecord["source"];
  /** ISO 8601 timestamp; mutator must NOT use Date.now(). */
  now: string;
  /** Monotonic version per branch for dedup. */
  sourceVersion: number;
}

/** Payload for branch-aware workspace registry upserts. */
export interface UpdateWorktreeRecordPayload {
  branch: string;
  path?: string;
  materialized?: boolean;
  changeId?: string;
  status: WorktreeRecord["status"];
  baseRef: string;
  headSha: string;
  source: WorktreeRecord["source"];
  now: string;
  sourceVersion: number;
  setupReady?: boolean;
  setupFailureReason?: string;
  dirty?: boolean;
  merged?: boolean;
  cleanupEligible?: boolean;
  cleanupBlockedBy?: string[];
}

/** Payload for `adv.project.removeWorktreeSession`. */
export interface RemoveWorktreeSessionPayload {
  branch: string;
  /**
   * `soft` flips status to "deleted" (audit trail preserved); `hard`
   * removes the registry entry entirely. Defaults to `soft`.
   */
  mode?: "soft" | "hard";
  /** ISO 8601 timestamp for lastSeenAt update before removal. */
  now: string;
}

/** Payload for `adv.project.setPendingWorktreeDelete`. */
export interface SetPendingWorktreeDeletePayload {
  branch: string;
  path: string;
  reason: string;
  /** ISO 8601 timestamp. */
  now: string;
}

/** Payload for `adv.project.clearPendingWorktreeDelete`. */
export interface ClearPendingWorktreeDeletePayload {
  branch: string;
}

/** Payload for `adv.project.incrementPendingWorktreeDeleteAttempts`. */
export interface IncrementPendingWorktreeDeleteAttemptsPayload {
  branch: string;
}

/** Payload for `adv.project.registerSession`. */
export interface RegisterSessionPayload {
  sessionId: string;
  worktreeBranch?: string;
  worktreePath: string;
  pid: number;
  /** ISO 8601 timestamp. */
  now: string;
}

/** Payload for `adv.project.unregisterSession`. */
export interface UnregisterSessionPayload {
  sessionId: string;
}

/** Payload for `adv.project.updateSessionActivity`. */
export interface UpdateSessionActivityPayload {
  sessionId: string;
  /** ISO 8601 timestamp; becomes new lastSeenAt. */
  now: string;
  activeChangeId?: string;
  currentTaskId?: string;
  activeGate?: string;
}

function isDuplicateWorktreeSessionPayload(
  existing: WorktreeRecord,
  payload: AddWorktreeSessionPayload,
): boolean {
  return (
    existing.status === "active" &&
    existing.path === payload.path &&
    existing.changeId === payload.changeId &&
    existing.baseRef === payload.baseRef &&
    existing.headSha === payload.headSha &&
    existing.source === payload.source &&
    existing.lastSeenAt === payload.now
  );
}

/**
 * Insert or update a worktree registry record. Monotonic
 * `sourceVersion` per branch ensures replay-determinism for
 * out-of-order updates. Lower versions and exact duplicate equal-version
 * payloads are skipped; equal-version payloads with different content are
 * promoted to `existing.sourceVersion + 1` so two same-millisecond
 * multi-session updates do not silently drop the later workflow update.
 */
export function applyAddWorktreeSession(
  state: ProjectWorkflowState,
  payload: AddWorktreeSessionPayload,
): WorktreeRecord {
  assertProjectWorkflowReachable(state);
  const existing = state.worktree_registry[payload.branch];
  if (existing) {
    if (payload.sourceVersion < existing.sourceVersion) {
      // Out-of-order — preserve existing record.
      return existing;
    }
    if (
      payload.sourceVersion === existing.sourceVersion &&
      isDuplicateWorktreeSessionPayload(existing, payload)
    ) {
      // Exact duplicate — preserve existing record.
      return existing;
    }
  }
  const sourceVersion = existing
    ? Math.max(payload.sourceVersion, existing.sourceVersion + 1)
    : payload.sourceVersion;
  const next: WorktreeRecord = {
    branch: payload.branch,
    path: payload.path,
    materialized: true,
    changeId: payload.changeId,
    status: "active",
    createdAt: existing?.createdAt ?? payload.now,
    lastSeenAt: payload.now,
    baseRef: payload.baseRef || existing?.baseRef || "",
    headSha: payload.headSha || existing?.headSha || "",
    source: payload.source,
    sourceVersion,
    setupReady: true,
    setupFailureReason: undefined,
    dirty: existing?.dirty,
    merged: existing?.merged,
    cleanupEligible: existing?.cleanupEligible ?? false,
    cleanupBlockedBy: existing?.cleanupBlockedBy ?? [],
    pendingDelete: existing?.pendingDelete,
  };
  state.worktree_registry[payload.branch] = next;
  return next;
}

/**
 * Upsert a branch-aware workspace registry record. Supports both
 * materialized worktrees and branch-only records with no path.
 */
export function applyUpdateWorktreeRecord(
  state: ProjectWorkflowState,
  payload: UpdateWorktreeRecordPayload,
): WorktreeRecord {
  assertProjectWorkflowReachable(state);
  const existing = state.worktree_registry[payload.branch];
  if (existing && payload.sourceVersion < existing.sourceVersion) {
    return normalizeWorktreeRecord(existing);
  }
  const sourceVersion = existing
    ? Math.max(payload.sourceVersion, existing.sourceVersion + 1)
    : payload.sourceVersion;
  const materialized = payload.materialized ?? Boolean(payload.path);
  const next = normalizeWorktreeRecord({
    branch: payload.branch,
    path: payload.path,
    materialized,
    changeId: payload.changeId,
    status: payload.status,
    createdAt: existing?.createdAt ?? payload.now,
    lastSeenAt: payload.now,
    baseRef: payload.baseRef,
    headSha: payload.headSha,
    source: payload.source,
    sourceVersion,
    setupReady: payload.setupReady,
    setupFailureReason: payload.setupFailureReason,
    dirty: payload.dirty,
    merged: payload.merged,
    cleanupEligible: payload.cleanupEligible,
    cleanupBlockedBy: payload.cleanupBlockedBy,
    pendingDelete: existing?.pendingDelete,
  });
  state.worktree_registry[payload.branch] = next;
  return next;
}

/**
 * Soft-delete (status=`deleted`) or hard-remove a worktree registry
 * entry. Soft is the default — preserves audit trail. Hard is used by
 * the migration / triage path when an entry is provably stale.
 */
export function applyRemoveWorktreeSession(
  state: ProjectWorkflowState,
  payload: RemoveWorktreeSessionPayload,
): WorktreeRecord | null {
  assertProjectWorkflowReachable(state);
  const existing = state.worktree_registry[payload.branch];
  if (!existing) return null;
  const mode = payload.mode ?? "soft";
  if (mode === "hard") {
    delete state.worktree_registry[payload.branch];
    return null;
  }
  existing.status = "deleted";
  existing.lastSeenAt = payload.now;
  return existing;
}

/**
 * Idempotent merge into pending_worktree_deletes. If an entry already
 * exists, attempts counter is preserved.
 */
export function applySetPendingWorktreeDelete(
  state: ProjectWorkflowState,
  payload: SetPendingWorktreeDeletePayload,
): PendingWorktreeDelete {
  assertProjectWorkflowReachable(state);
  const existing = state.pending_worktree_deletes[payload.branch];
  const next: PendingWorktreeDelete = {
    branch: payload.branch,
    path: payload.path,
    reason: payload.reason,
    recordedAt: existing?.recordedAt ?? payload.now,
    attempts: existing?.attempts ?? 0,
  };
  state.pending_worktree_deletes[payload.branch] = next;
  return next;
}

/** Remove an entry from pending_worktree_deletes. Idempotent. */
export function applyClearPendingWorktreeDelete(
  state: ProjectWorkflowState,
  payload: ClearPendingWorktreeDeletePayload,
): void {
  assertProjectWorkflowReachable(state);
  delete state.pending_worktree_deletes[payload.branch];
}

/**
 * RMW (read-modify-write) increment of pending-delete attempt counter.
 * No-op (returns null) if the pending entry has been cleared between
 * caller's check and the workflow update.
 */
export function applyIncrementPendingWorktreeDeleteAttempts(
  state: ProjectWorkflowState,
  payload: IncrementPendingWorktreeDeleteAttemptsPayload,
): PendingWorktreeDelete | null {
  assertProjectWorkflowReachable(state);
  const existing = state.pending_worktree_deletes[payload.branch];
  if (!existing) return null;
  existing.attempts += 1;
  return existing;
}

/**
 * Insert a session registry entry. If the same sessionId is registered
 * twice (typical when a session restarts under the same ID), the
 * latest payload wins — heartbeat fields are refreshed from `now`.
 */
export function applyRegisterSession(
  state: ProjectWorkflowState,
  payload: RegisterSessionPayload,
): SessionRecord {
  assertProjectWorkflowReachable(state);
  const existing = state.session_registry[payload.sessionId];
  const next: SessionRecord = {
    sessionId: payload.sessionId,
    worktreeBranch: payload.worktreeBranch,
    worktreePath: payload.worktreePath,
    pid: payload.pid,
    startedAt: existing?.startedAt ?? payload.now,
    lastSeenAt: payload.now,
    activeChangeId: existing?.activeChangeId,
    currentTaskId: existing?.currentTaskId,
    activeGate: existing?.activeGate,
  };
  state.session_registry[payload.sessionId] = next;
  return next;
}

/** Remove a session from the registry. Idempotent. */
export function applyUnregisterSession(
  state: ProjectWorkflowState,
  payload: UnregisterSessionPayload,
): void {
  assertProjectWorkflowReachable(state);
  delete state.session_registry[payload.sessionId];
}

/**
 * Update session heartbeat + active-context fields. No-op (returns
 * null) if the session has been unregistered between caller and the
 * workflow update.
 */
export function applyUpdateSessionActivity(
  state: ProjectWorkflowState,
  payload: UpdateSessionActivityPayload,
): SessionRecord | null {
  assertProjectWorkflowReachable(state);
  const existing = state.session_registry[payload.sessionId];
  if (!existing) return null;
  existing.lastSeenAt = payload.now;
  if (payload.activeChangeId !== undefined) {
    existing.activeChangeId = payload.activeChangeId;
  }
  if (payload.currentTaskId !== undefined) {
    existing.currentTaskId = payload.currentTaskId;
  }
  if (payload.activeGate !== undefined) {
    existing.activeGate = payload.activeGate;
  }
  return existing;
}
