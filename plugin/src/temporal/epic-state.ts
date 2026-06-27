/**
 * Epic Workflow Pure State Helpers
 *
 * All Epic state transitions are pure functions so they can be unit-tested
 * without a Temporal runtime. The `epicWorkflow` signal handlers wire these
 * helpers and convert recoverable conflicts into state-mutation rejections.
 */

import type {
  Epic,
  EpicEntry,
  EpicProgressSummary,
  ShellPromotedSignalPayload,
  EpicCreatedSignalPayload,
  EpicUpdatedSignalPayload,
  ShellAddedSignalPayload,
  ChangeLinkedSignalPayload,
  ChangeProjectionStatusUpdatedSignalPayload,
  ChangeRetargetedSignalPayload,
  ChangeUnlinkedSignalPayload,
  EntriesReorderedSignalPayload,
  EntryTerminalSummarySignalPayload,
  EpicArchivedSignalPayload,
  EpicMergedSignalPayload,
  EpicScopeUpdatedSignalPayload,
} from "../types";
import { EpicStatusSchema } from "../types";
import type {
  EpicSignalRejection,
  EpicWorkflowInput,
  EpicWorkflowState,
} from "./contracts";
import { describePayloadDigest } from "./digest";

export const EPIC_SIGNAL_REJECTION_RING_BUFFER_LIMIT = 20;

export interface EpicMutationSuccess<T = void> {
  ok: true;
  value: T;
}

export interface EpicMutationFailure {
  ok: false;
  code:
    | "stale_version"
    | "duplicate_idempotency_key"
    | "entry_not_found"
    | "shell_not_found"
    | "already_promoted"
    | "entry_already_exists"
    | "epic_not_active"
    | "epic_archived"
    | "retarget_source_mismatch"
    | "retarget_duplicate_target";
  message: string;
}

export type EpicMutationResult<T = void> =
  | EpicMutationSuccess<T>
  | EpicMutationFailure;

function setLastSignalAt(state: EpicWorkflowState, at: string): void {
  if (state.lastSignalAt && state.lastSignalAt > at) return;
  state.lastSignalAt = at;
}

function isArchived(state: EpicWorkflowState): boolean {
  return state.status === "archived";
}

function isClosedForMutation(state: EpicWorkflowState): boolean {
  return (
    isArchived(state) || state.status === "merged" || !!state.epic.merged_into
  );
}

function closedForMutationFailure(): EpicMutationFailure {
  return {
    ok: false,
    code: "epic_not_active",
    message: "Epic is not active",
  };
}

function bumpVersion(epic: Epic): void {
  epic.version += 1;
  epic.updated_at = new Date().toISOString();
}

function recordIdempotency(
  state: EpicWorkflowState,
  key: string,
  processedAt: string,
  outcome = "applied",
): void {
  state.idempotencyLedger[key] = { processedAt, outcome };
}

function hasIdempotencyKey(state: EpicWorkflowState, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(state.idempotencyLedger, key);
}

function checkIdempotency(
  state: EpicWorkflowState,
  key: string,
): EpicMutationFailure | undefined {
  if (hasIdempotencyKey(state, key)) {
    return {
      ok: false,
      code: "duplicate_idempotency_key",
      message: `Idempotency key already processed: ${key}`,
    };
  }
  return undefined;
}

function checkVersion(
  state: EpicWorkflowState,
  expectedVersion: number,
): EpicMutationFailure | undefined {
  if (state.epic.version !== expectedVersion) {
    return {
      ok: false,
      code: "stale_version",
      message: `Expected Epic version ${expectedVersion}, found ${state.epic.version}`,
    };
  }
  return undefined;
}

function findEntryIndex(state: EpicWorkflowState, entryId: string): number {
  return state.epic.entries.findIndex((entry) => entry.entry_id === entryId);
}

function entryChangeId(entry: EpicEntry): string | undefined {
  return entry.kind === "change"
    ? (entry.change_id ?? entry.change_ref?.change_id)
    : undefined;
}

export function createEpicWorkflowState(
  input: EpicWorkflowInput,
): EpicWorkflowState {
  const now = input.initializedAt;
  const epic: Epic = {
    id: input.epicId,
    title: input.title,
    narrative: input.narrative,
    entries: [],
    progress: {
      status: "active",
      total_entries: 0,
      completed_entries: 0,
      active_entries: 0,
      next_entry_id: null,
      updated_at: now,
    },
    created_at: now,
    updated_at: now,
    version: 0,
  };
  return {
    ...input,
    id: input.epicId,
    status: "active",
    epic,
    idempotencyLedger: {},
  };
}

export function applyEpicCreatedToState(
  state: EpicWorkflowState,
  payload: EpicCreatedSignalPayload,
): EpicWorkflowState {
  state.epic = { ...payload };
  state.title = payload.title;
  state.narrative = payload.narrative;
  state.epicId = payload.id;
  state.id = payload.id;
  recomputeEpicProgress(state);
  return state;
}

export function applyEpicUpdatedToState(
  state: EpicWorkflowState,
  payload: EpicUpdatedSignalPayload,
): EpicMutationResult<{ version: number }> {
  if (isClosedForMutation(state)) return closedForMutationFailure();

  const idempotency = checkIdempotency(state, payload.idempotencyKey);
  if (idempotency) return idempotency;

  const version = checkVersion(state, payload.expectedVersion);
  if (version) return version;

  if (payload.title !== undefined) state.epic.title = payload.title;
  if (payload.narrative !== undefined) state.epic.narrative = payload.narrative;

  bumpVersion(state.epic);
  recordIdempotency(state, payload.idempotencyKey, payload.updatedAt);
  setLastSignalAt(state, payload.updatedAt);
  recomputeEpicProgress(state);

  return { ok: true, value: { version: state.epic.version } };
}

export function applyEpicScopeUpdatedToState(
  state: EpicWorkflowState,
  payload: EpicScopeUpdatedSignalPayload,
): EpicMutationResult<{ version: number }> {
  if (isClosedForMutation(state)) return closedForMutationFailure();

  const idempotency = checkIdempotency(state, payload.idempotencyKey);
  if (idempotency) return idempotency;

  const version = checkVersion(state, payload.expectedVersion);
  if (version) return version;

  if (payload.epicScope) state.epic.epic_scope = payload.epicScope;
  else delete state.epic.epic_scope;

  bumpVersion(state.epic);
  recordIdempotency(state, payload.idempotencyKey, payload.updatedAt);
  setLastSignalAt(state, payload.updatedAt);
  recomputeEpicProgress(state);

  return { ok: true, value: { version: state.epic.version } };
}

export function applyShellAddedToState(
  state: EpicWorkflowState,
  payload: ShellAddedSignalPayload,
): EpicMutationResult<{ entryId: string }> {
  if (isClosedForMutation(state)) return closedForMutationFailure();

  const idempotency = checkIdempotency(state, payload.idempotencyKey);
  if (idempotency) return idempotency;

  if (findEntryIndex(state, payload.entryId) !== -1) {
    return {
      ok: false,
      code: "entry_already_exists",
      message: `Entry already exists: ${payload.entryId}`,
    };
  }

  const order = payload.order ?? nextAvailableOrder(state.epic.entries);
  const entry: EpicEntry = {
    kind: "shell",
    entry_id: payload.entryId,
    order,
    title: payload.title,
    success_hint: payload.successHint,
  };
  state.epic.entries.push(entry);

  bumpVersion(state.epic);
  recordIdempotency(state, payload.idempotencyKey, payload.addedAt);
  setLastSignalAt(state, payload.addedAt);
  recomputeEpicProgress(state);

  return { ok: true, value: { entryId: entry.entry_id } };
}

export function applyShellPromotedToState(
  state: EpicWorkflowState,
  payload: ShellPromotedSignalPayload,
): EpicMutationResult<{ entryId: string; changeId: string }> {
  if (isClosedForMutation(state)) return closedForMutationFailure();

  const idempotency = checkIdempotency(state, payload.idempotencyKey);
  if (idempotency) return idempotency;

  const index = findEntryIndex(state, payload.entryId);
  if (index !== -1) {
    const existingEntry = state.epic.entries[index];
    if (existingEntry.kind === "change") {
      // Idempotent retry: shell was already promoted in-place to this change.
      if (
        (existingEntry.change_id ?? existingEntry.change_ref?.change_id) ===
        payload.changeId
      ) {
        recordIdempotency(
          state,
          payload.idempotencyKey,
          payload.promotedAt,
          "idempotent",
        );
        setLastSignalAt(state, payload.promotedAt);
        return {
          ok: true,
          value: {
            entryId: existingEntry.entry_id,
            changeId: payload.changeId,
          },
        };
      }
      return {
        ok: false,
        code: "already_promoted",
        message: `Entry is not a shell: ${payload.entryId}`,
      };
    }

    const changeEntry: EpicEntry = {
      kind: "change",
      entry_id: existingEntry.entry_id,
      order: existingEntry.order,
      change_id: payload.changeId,
      promotion: {
        shell_entry_id: existingEntry.entry_id,
        shell_title: existingEntry.title,
        shell_success_hint: existingEntry.success_hint,
        promoted_at: payload.promotedAt,
        promoted_by: payload.promotedBy,
        change_id: payload.changeId,
      },
    };
    state.epic.entries[index] = changeEntry;

    bumpVersion(state.epic);
    recordIdempotency(state, payload.idempotencyKey, payload.promotedAt);
    setLastSignalAt(state, payload.promotedAt);
    recomputeEpicProgress(state);

    return {
      ok: true,
      value: { entryId: changeEntry.entry_id, changeId: payload.changeId },
    };
  }

  // Idempotent retry after promotion: the shell row is gone, but a change
  // row with matching promotion provenance may exist.
  const existing = state.epic.entries.find(
    (entry) =>
      entry.kind === "change" &&
      entry.promotion?.shell_entry_id === payload.entryId &&
      (entry.change_id ?? entry.change_ref?.change_id) === payload.changeId,
  );
  if (existing) {
    recordIdempotency(
      state,
      payload.idempotencyKey,
      payload.promotedAt,
      "idempotent",
    );
    setLastSignalAt(state, payload.promotedAt);
    return {
      ok: true,
      value: { entryId: existing.entry_id, changeId: payload.changeId },
    };
  }

  return {
    ok: false,
    code: "shell_not_found",
    message: `Shell entry not found: ${payload.entryId}`,
  };
}

export function applyChangeLinkedToState(
  state: EpicWorkflowState,
  payload: ChangeLinkedSignalPayload,
): EpicMutationResult<{ entryId: string }> {
  if (isClosedForMutation(state)) return closedForMutationFailure();

  const idempotency = checkIdempotency(state, payload.idempotencyKey);
  if (idempotency) return idempotency;

  if (findEntryIndex(state, payload.entryId) !== -1) {
    return {
      ok: false,
      code: "entry_already_exists",
      message: `Entry already exists: ${payload.entryId}`,
    };
  }

  const duplicateChange = state.epic.entries.find(
    (entry) => entryChangeId(entry) === payload.changeId,
  );
  if (duplicateChange) {
    return {
      ok: false,
      code: "entry_already_exists",
      message: `Change already linked to Epic: ${payload.changeId}`,
    };
  }

  const order = payload.order ?? nextAvailableOrder(state.epic.entries);
  const entry: EpicEntry = {
    kind: "change",
    entry_id: payload.entryId,
    order,
    ...(payload.changeRef ? { change_ref: payload.changeRef } : {}),
    ...(!payload.changeRef ? { change_id: payload.changeId } : {}),
    title: payload.title,
    membership_status: payload.membershipStatus ?? "projection_pending",
    linked_at: payload.linkedAt,
    linked_by: payload.linkedBy ?? "agent",
    ...(payload.linkEvidence ? { link_evidence: payload.linkEvidence } : {}),
  };
  state.epic.entries.push(entry);

  bumpVersion(state.epic);
  recordIdempotency(state, payload.idempotencyKey, payload.linkedAt);
  setLastSignalAt(state, payload.linkedAt);
  recomputeEpicProgress(state);

  return { ok: true, value: { entryId: entry.entry_id } };
}

export function applyChangeProjectionStatusUpdatedToState(
  state: EpicWorkflowState,
  payload: ChangeProjectionStatusUpdatedSignalPayload,
): EpicMutationResult<{ entryId: string }> {
  if (isClosedForMutation(state)) return closedForMutationFailure();

  const idempotency = checkIdempotency(state, payload.idempotencyKey);
  if (idempotency) return idempotency;

  const index = findEntryIndex(state, payload.entryId);
  if (index === -1) {
    return {
      ok: false,
      code: "entry_not_found",
      message: `Entry not found: ${payload.entryId}`,
    };
  }

  const entry = state.epic.entries[index];
  if (entry.kind !== "change") {
    return {
      ok: false,
      code: "entry_not_found",
      message: `Entry is not a change entry: ${payload.entryId}`,
    };
  }

  state.epic.entries[index] = {
    ...entry,
    membership_status: payload.membershipStatus,
  };
  bumpVersion(state.epic);
  recordIdempotency(state, payload.idempotencyKey, payload.updatedAt);
  setLastSignalAt(state, payload.updatedAt);
  recomputeEpicProgress(state);

  return { ok: true, value: { entryId: payload.entryId } };
}

export function applyChangeRetargetedToState(
  state: EpicWorkflowState,
  payload: ChangeRetargetedSignalPayload,
): EpicMutationResult<{ entryId: string; changeId: string }> {
  if (isClosedForMutation(state)) return closedForMutationFailure();

  const index = findEntryIndex(state, payload.entryId);
  if (index === -1) {
    return {
      ok: false,
      code: "entry_not_found",
      message: `Entry not found: ${payload.entryId}`,
    };
  }

  const entry = state.epic.entries[index];
  if (entry.kind !== "change") {
    return {
      ok: false,
      code: "entry_not_found",
      message: `Entry is not a linked change: ${payload.entryId}`,
    };
  }
  const currentChangeId = entryChangeId(entry);

  // Idempotent retry: the entry already reflects this retarget.
  if (
    currentChangeId === payload.toChangeId &&
    entry.retargeted_from_change_id === payload.fromChangeId
  ) {
    return {
      ok: true,
      value: { entryId: entry.entry_id, changeId: payload.toChangeId },
    };
  }

  if (currentChangeId !== payload.fromChangeId) {
    return {
      ok: false,
      code: "retarget_source_mismatch",
      message: `Retarget source mismatch: entry ${payload.entryId} is ${currentChangeId}, expected ${payload.fromChangeId}`,
    };
  }

  const duplicateTarget = state.epic.entries.find(
    (e) =>
      e.entry_id !== payload.entryId && entryChangeId(e) === payload.toChangeId,
  );
  if (duplicateTarget) {
    return {
      ok: false,
      code: "retarget_duplicate_target",
      message: `Target change already linked to Epic: ${payload.toChangeId}`,
    };
  }

  const updated: EpicEntry = { ...entry };

  if (payload.changeRef) {
    updated.change_ref = {
      ...payload.changeRef,
      change_id: payload.toChangeId,
    };
    delete (updated as { change_id?: string }).change_id;
  } else if (updated.change_ref) {
    updated.change_ref = {
      ...updated.change_ref,
      change_id: payload.toChangeId,
    };
  } else {
    updated.change_id = payload.toChangeId;
  }

  if (payload.title !== undefined) updated.title = payload.title;
  if (payload.membershipStatus !== undefined) {
    updated.membership_status = payload.membershipStatus;
  }

  updated.retargeted_from_change_id = payload.fromChangeId;
  updated.retargeted_at = payload.retargetedAt;
  updated.retargeted_by = payload.retargetedBy;
  updated.retarget_evidence = payload.retargetEvidence;

  // change_ref entries require linked_at/linked_by; ensure they exist when
  // converting from a legacy change_id-only entry.
  if (updated.change_ref) {
    if (!updated.linked_at) updated.linked_at = payload.retargetedAt;
    if (!updated.linked_by) updated.linked_by = payload.retargetedBy;
    if (!updated.link_evidence)
      updated.link_evidence = payload.retargetEvidence;
    if (!updated.title) updated.title = payload.title ?? payload.toChangeId;
    if (!updated.membership_status)
      updated.membership_status = "projection_pending";
  }

  state.epic.entries[index] = updated;

  bumpVersion(state.epic);
  recordIdempotency(state, payload.idempotencyKey, payload.retargetedAt);
  setLastSignalAt(state, payload.retargetedAt);
  recomputeEpicProgress(state);

  return {
    ok: true,
    value: { entryId: updated.entry_id, changeId: payload.toChangeId },
  };
}

export function applyChangeUnlinkedToState(
  state: EpicWorkflowState,
  payload: ChangeUnlinkedSignalPayload,
): EpicMutationResult<void> {
  if (isClosedForMutation(state)) return closedForMutationFailure();

  const idempotency = checkIdempotency(state, payload.idempotencyKey);
  if (idempotency) return idempotency;

  const index = findEntryIndex(state, payload.entryId);
  if (index === -1) {
    // Idempotent: entry already removed.
    recordIdempotency(
      state,
      payload.idempotencyKey,
      payload.unlinkedAt,
      "idempotent",
    );
    setLastSignalAt(state, payload.unlinkedAt);
    return { ok: true, value: undefined };
  }

  state.epic.entries.splice(index, 1);
  bumpVersion(state.epic);
  recordIdempotency(state, payload.idempotencyKey, payload.unlinkedAt);
  setLastSignalAt(state, payload.unlinkedAt);
  recomputeEpicProgress(state);

  return { ok: true, value: undefined };
}

export function applyEntriesReorderedToState(
  state: EpicWorkflowState,
  payload: EntriesReorderedSignalPayload,
): EpicMutationResult<{ version: number }> {
  if (isClosedForMutation(state)) return closedForMutationFailure();

  const idempotency = checkIdempotency(state, payload.idempotencyKey);
  if (idempotency) return idempotency;

  const version = checkVersion(state, payload.expectedVersion);
  if (version) return version;

  if (payload.entryIds.length !== state.epic.entries.length) {
    return {
      ok: false,
      code: "entry_not_found",
      message: "Reordered entry IDs do not match current entries",
    };
  }

  const currentIds = new Set(state.epic.entries.map((e) => e.entry_id));
  const requestedIds = new Set(payload.entryIds);
  if (
    currentIds.size !== requestedIds.size ||
    !payload.entryIds.every((id) => currentIds.has(id))
  ) {
    return {
      ok: false,
      code: "entry_not_found",
      message: "Reordered entry IDs do not match current entries",
    };
  }

  const byId = new Map(
    state.epic.entries.map((entry) => [entry.entry_id, entry]),
  );
  state.epic.entries = payload.entryIds.map((id, index) => ({
    ...byId.get(id)!,
    order: index,
  }));

  bumpVersion(state.epic);
  recordIdempotency(state, payload.idempotencyKey, payload.reorderedAt);
  setLastSignalAt(state, payload.reorderedAt);
  recomputeEpicProgress(state);

  return { ok: true, value: { version: state.epic.version } };
}

export function applyEntryTerminalSummaryToState(
  state: EpicWorkflowState,
  payload: EntryTerminalSummarySignalPayload,
): EpicMutationResult<void> {
  if (isClosedForMutation(state)) return closedForMutationFailure();

  const idempotency = checkIdempotency(state, payload.idempotencyKey);
  if (idempotency) return idempotency;

  const index = findEntryIndex(state, payload.entryId);
  if (index === -1) {
    return {
      ok: false,
      code: "entry_not_found",
      message: `Entry not found: ${payload.entryId}`,
    };
  }

  const entry = state.epic.entries[index];
  if (entry.kind !== "change") {
    return {
      ok: false,
      code: "entry_not_found",
      message: `Entry is not a linked change: ${payload.entryId}`,
    };
  }

  entry.terminal_summary = {
    status: payload.status,
    completed_at: payload.completedAt,
  };

  bumpVersion(state.epic);
  recordIdempotency(state, payload.idempotencyKey, payload.completedAt);
  setLastSignalAt(state, payload.completedAt);
  recomputeEpicProgress(state);

  return { ok: true, value: undefined };
}

export function applyEpicMergedToState(
  state: EpicWorkflowState,
  payload: EpicMergedSignalPayload,
): EpicMutationResult<{ version: number }> {
  if (isClosedForMutation(state)) return closedForMutationFailure();
  if (state.epic.progress.status === "completed") {
    return {
      ok: false,
      code: "epic_not_active",
      message: "Completed Epics cannot be merged as active sources",
    };
  }

  const idempotency = checkIdempotency(state, payload.idempotencyKey);
  if (idempotency) return idempotency;

  const version = checkVersion(state, payload.expectedVersion);
  if (version) return version;

  state.status = "merged";
  state.epic.merged_into = payload.mergedInto;
  bumpVersion(state.epic);
  recordIdempotency(
    state,
    payload.idempotencyKey,
    payload.mergedInto.merged_at,
  );
  setLastSignalAt(state, payload.mergedInto.merged_at);
  recomputeEpicProgress(state);

  return { ok: true, value: { version: state.epic.version } };
}

export function applyEpicArchivedToState(
  state: EpicWorkflowState,
  payload: EpicArchivedSignalPayload,
): EpicWorkflowState {
  state.status = "archived";
  state.epic.progress.status = EpicStatusSchema.enum.archived;
  state.epic.updated_at = payload.archivedAt;
  setLastSignalAt(state, payload.archivedAt);
  recomputeEpicProgress(state);
  return state;
}

export function recordEpicSignalRejectionToState(
  state: EpicWorkflowState,
  input: {
    signalName: string;
    error: unknown;
    payload: unknown;
    rejectedAt: string;
  },
): EpicWorkflowState {
  const error = input.error;
  const rejection: EpicSignalRejection = {
    signalName: input.signalName,
    errorMessage: error instanceof Error ? error.message : String(error),
    payloadDigest: describePayloadDigest(input.payload),
    rejectedAt: input.rejectedAt,
  };

  const existing = state.rejections ?? [];
  state.rejections = [...existing, rejection].slice(
    -EPIC_SIGNAL_REJECTION_RING_BUFFER_LIMIT,
  );
  setLastSignalAt(state, input.rejectedAt);
  return state;
}

export function buildEpicSeedState(
  state: EpicWorkflowState,
): NonNullable<EpicWorkflowInput["seedState"]> {
  return {
    epic: JSON.parse(JSON.stringify(state.epic)),
    status: state.status,
    idempotencyLedger: { ...state.idempotencyLedger },
    lastSignalAt: state.lastSignalAt,
    rejections: state.rejections ? [...state.rejections] : undefined,
  };
}

export function nextAvailableOrder(entries: EpicEntry[]): number {
  if (entries.length === 0) return 0;
  return Math.max(...entries.map((entry) => entry.order), -1) + 1;
}

export function recomputeEpicProgress(
  state: EpicWorkflowState,
): EpicProgressSummary {
  const entries = state.epic.entries;
  const total = entries.length;
  const completed = entries.filter(
    (entry) =>
      entry.kind === "change" && entry.terminal_summary?.status != null,
  ).length;
  const active = entries.filter(
    (entry) =>
      entry.kind === "change" && entry.terminal_summary?.status == null,
  ).length;

  if (state.status === "merged" || state.epic.merged_into) {
    const summary: EpicProgressSummary = {
      status: EpicStatusSchema.enum.merged,
      total_entries: total,
      completed_entries: completed,
      active_entries: 0,
      next_entry_id: null,
      updated_at: new Date().toISOString(),
    };
    state.epic.progress = summary;
    return summary;
  }

  let next_entry_id: string | null = null;
  if (state.status !== "archived") {
    for (const entry of entries) {
      if (entry.kind === "shell" || entry.terminal_summary?.status == null) {
        next_entry_id = entry.entry_id;
        break;
      }
    }
  }

  const summary: EpicProgressSummary = {
    status:
      state.status === "archived"
        ? EpicStatusSchema.enum.archived
        : completed === total && total > 0
          ? EpicStatusSchema.enum.completed
          : EpicStatusSchema.enum.active,
    total_entries: total,
    completed_entries: completed,
    active_entries: active,
    next_entry_id,
    updated_at: new Date().toISOString(),
  };

  state.epic.progress = summary;
  return summary;
}
