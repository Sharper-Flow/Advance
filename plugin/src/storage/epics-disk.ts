/**
 * Disk-owned Epic mutations.
 *
 * Active Epic projections are the sole authority. Every mutation takes the
 * per-Epic lock, reads the latest validated projection,
 * applies the domain transition, writes atomically, and validates the readback.
 */

import { access, mkdir, rm } from "fs/promises";
import { join } from "path";

import type {
  Epic,
  EpicChangeRef,
  EpicEntry,
  RetiredEpicProjection,
} from "../types";
import { EpicSchema, RetiredEpicProjectionSchema } from "../types";
import { acquireFileLock, atomicWriteFile } from "../utils/fs";
import {
  listActiveEpicProjections,
  loadActiveEpicProjection,
  loadRetiredEpicProjection,
} from "./epic-projection-reader";
import { saveActiveEpicProjection } from "./epic-projection";
import type { Store } from "./store-types";

type EpicDiskMutationOps = Pick<
  Store["epics"],
  | "create"
  | "update"
  | "updateScope"
  | "markMerged"
  | "addShell"
  | "promoteShell"
  | "linkChange"
  | "retargetChange"
  | "unlinkChange"
  | "setEntryMembershipStatus"
  | "setEntryTerminalSummary"
  | "reorder"
  | "retire"
  | "repairIndex"
>;

type MutationResult<T> = { value: T; changed?: boolean };

function epicError(
  message: string,
  code:
    | "epic_not_found"
    | "stale_version"
    | "entry_not_found"
    | "shell_not_found"
    | "already_promoted"
    | "entry_already_exists"
    | "epic_not_active"
    | "epic_incomplete"
    | "retarget_source_mismatch"
    | "retarget_duplicate_target",
): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function cloneEpic(epic: Epic): Epic {
  return JSON.parse(JSON.stringify(epic)) as Epic;
}

function entryChangeId(entry: EpicEntry): string | undefined {
  return entry.kind === "change"
    ? (entry.change_id ?? entry.change_ref?.change_id)
    : undefined;
}

function nextAvailableOrder(entries: EpicEntry[]): number {
  return entries.length === 0
    ? 0
    : Math.max(...entries.map((entry) => entry.order), -1) + 1;
}

function nextEntryId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function localNextEntryId(entries: EpicEntry[]): string | null {
  const byId = new Map(entries.map((entry) => [entry.entry_id, entry]));
  for (const entry of [...entries].sort((a, b) => a.order - b.order)) {
    if (entry.kind === "change" && entry.terminal_summary) continue;
    if (entry.kind === "shell") {
      const blocked = (entry.blocked_by ?? []).some((prerequisite) => {
        if (prerequisite.kind !== "epic_entry") return true;
        const required = byId.get(prerequisite.entry_id);
        return (
          !required ||
          required.kind !== "change" ||
          required.terminal_summary === undefined
        );
      });
      if (blocked) continue;
    }
    return entry.entry_id;
  }
  return null;
}

function recomputeProgress(epic: Epic): void {
  const entries = epic.entries;
  const completed = entries.filter(
    (entry) => entry.kind === "change" && entry.terminal_summary !== undefined,
  ).length;
  const active = entries.filter(
    (entry) => entry.kind === "change" && entry.terminal_summary === undefined,
  ).length;
  const isMerged =
    epic.merged_into !== undefined || epic.progress.status === "merged";
  const isArchived = epic.progress.status === "archived";

  epic.progress = {
    status: isMerged
      ? "merged"
      : isArchived
        ? "archived"
        : completed === entries.length && entries.length > 0
          ? "completed"
          : "active",
    total_entries: entries.length,
    completed_entries: completed,
    active_entries: active,
    next_entry_id: isMerged || isArchived ? null : localNextEntryId(entries),
    updated_at: new Date().toISOString(),
  };
}

function bumpVersion(epic: Epic): void {
  epic.version += 1;
  epic.updated_at = new Date().toISOString();
  recomputeProgress(epic);
}

function assertOpenForMutation(epic: Epic): void {
  if (
    epic.progress.status === "archived" ||
    epic.progress.status === "merged" ||
    epic.merged_into
  ) {
    throw epicError(`Epic is not active: ${epic.id}`, "epic_not_active");
  }
}

async function assertDirectory(path: string, label: string): Promise<void> {
  try {
    await access(path);
  } catch (error) {
    throw new Error(
      `Cannot access ${label} directory ${path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

async function loadActiveRequired(
  activeEpicsDir: string,
  epicId: string,
): Promise<Epic> {
  await assertDirectory(activeEpicsDir, "active Epic");
  const result = await loadActiveEpicProjection(activeEpicsDir, epicId);
  if (!result.success) throw new Error(result.error);
  if (!result.data)
    throw epicError(`Epic not found: ${epicId}`, "epic_not_found");
  return result.data;
}

async function withEpicLock<T>(
  activeEpicsDir: string,
  epicId: string,
  operation: () => Promise<T>,
): Promise<T> {
  await assertDirectory(activeEpicsDir, "active Epic");
  const lockTarget = join(
    activeEpicsDir,
    `.epic-${encodeURIComponent(epicId)}.mutation`,
  );
  const release = await acquireFileLock(lockTarget);
  try {
    return await operation();
  } finally {
    await release();
  }
}

async function mutateEpic<T>(
  activeEpicsDir: string,
  epicId: string,
  expectedVersion: number | undefined,
  mutation: (epic: Epic) => MutationResult<T>,
): Promise<T> {
  return withEpicLock(activeEpicsDir, epicId, async () => {
    const latest = await loadActiveRequired(activeEpicsDir, epicId);
    if (expectedVersion !== undefined && latest.version !== expectedVersion) {
      throw epicError(
        `Expected Epic version ${expectedVersion}, found ${latest.version}`,
        "stale_version",
      );
    }
    assertOpenForMutation(latest);

    const candidate = cloneEpic(latest);
    const result = mutation(candidate);
    if (result.changed === false) return result.value;

    const validated = EpicSchema.parse(candidate);
    await saveActiveEpicProjection(activeEpicsDir, validated);
    const readback = await loadActiveRequired(activeEpicsDir, epicId);
    if (readback.version !== validated.version) {
      throw new Error(
        `Active Epic readback version mismatch for ${epicId}: expected ${validated.version}, found ${readback.version}`,
      );
    }
    return result.value;
  });
}

function entryOrThrow(
  epic: Epic,
  entryId: string,
): { entry: EpicEntry; index: number } {
  const index = epic.entries.findIndex((entry) => entry.entry_id === entryId);
  if (index < 0)
    throw epicError(`Entry not found: ${entryId}`, "entry_not_found");
  return { entry: epic.entries[index], index };
}

async function saveRetiredProjectionDisk(
  retiredEpicsDir: string,
  epicId: string,
  projection: RetiredEpicProjection,
): Promise<void> {
  const validated = RetiredEpicProjectionSchema.parse(projection);
  const path = join(retiredEpicsDir, epicId, "retired-projection.json");
  await mkdir(join(retiredEpicsDir, epicId), { recursive: true });
  await atomicWriteFile(path, JSON.stringify(validated, null, 2));
}

export function createEpicDiskOps(options: {
  activeEpicsDir: string;
  retiredEpicsDir: string;
}): EpicDiskMutationOps {
  const { activeEpicsDir, retiredEpicsDir } = options;

  return {
    create: async (epicId, title, narrative, createOptions) => {
      await assertDirectory(activeEpicsDir, "active Epic");
      await assertDirectory(retiredEpicsDir, "retired Epic");
      return withEpicLock(activeEpicsDir, epicId, async () => {
        const existing = await loadActiveEpicProjection(activeEpicsDir, epicId);
        if (!existing.success) throw new Error(existing.error);
        if (existing.data) throw new Error(`Epic already exists: ${epicId}`);
        const retired = await loadRetiredEpicProjection(
          retiredEpicsDir,
          epicId,
        );
        if (!retired.success) throw new Error(retired.error);
        if (retired.data) throw new Error(`Epic already exists: ${epicId}`);

        const now = new Date().toISOString();
        const epic = EpicSchema.parse({
          id: epicId,
          title,
          narrative,
          ...(createOptions?.epicScope
            ? { epic_scope: createOptions.epicScope }
            : {}),
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
        });
        await saveActiveEpicProjection(activeEpicsDir, epic);
        return loadActiveRequired(activeEpicsDir, epicId);
      });
    },

    update: (epicId, input) =>
      mutateEpic(activeEpicsDir, epicId, input.expectedVersion, (epic) => {
        if (input.title !== undefined) epic.title = input.title;
        if (input.narrative !== undefined) epic.narrative = input.narrative;
        bumpVersion(epic);
        return { value: epic };
      }),

    updateScope: (epicId, input) =>
      mutateEpic(activeEpicsDir, epicId, input.expectedVersion, (epic) => {
        if (input.epicScope !== undefined) epic.epic_scope = input.epicScope;
        else delete epic.epic_scope;
        bumpVersion(epic);
        return { value: epic };
      }),

    markMerged: (epicId, input) =>
      mutateEpic(activeEpicsDir, epicId, input.expectedVersion, (epic) => {
        if (epic.progress.status === "completed") {
          throw epicError(
            "Completed Epics cannot be merged as active sources",
            "epic_not_active",
          );
        }
        epic.merged_into = input.mergedInto;
        bumpVersion(epic);
        return { value: epic };
      }),

    addShell: (epicId, input) =>
      mutateEpic(activeEpicsDir, epicId, undefined, (epic) => {
        const entryId = input.entryId ?? nextEntryId("shell");
        if (epic.entries.some((entry) => entry.entry_id === entryId)) {
          throw epicError(
            `Entry already exists: ${entryId}`,
            "entry_already_exists",
          );
        }
        const entry: EpicEntry = {
          kind: "shell",
          entry_id: entryId,
          order: input.order ?? nextAvailableOrder(epic.entries),
          title: input.title,
          success_hint: input.successHint,
          blocked_by: input.blockedBy ?? [],
          ...(input.importedFrom ? { imported_from: input.importedFrom } : {}),
          ...(input.context_packet
            ? { context_packet: input.context_packet }
            : {}),
        };
        epic.entries.push(entry);
        bumpVersion(epic);
        return { value: entry };
      }),

    promoteShell: (epicId, entryId, changeId, promotedBy) =>
      mutateEpic(activeEpicsDir, epicId, undefined, (epic) => {
        const existing = epic.entries.find(
          (entry) => entry.entry_id === entryId,
        );
        if (!existing) {
          const promoted = epic.entries.find(
            (entry) =>
              entry.kind === "change" &&
              entry.promotion?.shell_entry_id === entryId &&
              entryChangeId(entry) === changeId,
          );
          if (promoted) return { value: { entryId, changeId }, changed: false };
          throw epicError(
            `Shell entry not found: ${entryId}`,
            "shell_not_found",
          );
        }
        if (existing.kind === "change") {
          if (entryChangeId(existing) === changeId) {
            return { value: { entryId, changeId }, changed: false };
          }
          throw epicError(
            `Entry is not a shell: ${entryId}`,
            "already_promoted",
          );
        }
        const promoted: EpicEntry = {
          kind: "change",
          entry_id: existing.entry_id,
          order: existing.order,
          change_id: changeId,
          promotion: {
            shell_entry_id: existing.entry_id,
            shell_title: existing.title,
            shell_success_hint: existing.success_hint,
            promoted_at: new Date().toISOString(),
            promoted_by: promotedBy,
            change_id: changeId,
          },
        };
        epic.entries[epic.entries.indexOf(existing)] = promoted;
        bumpVersion(epic);
        return { value: { entryId, changeId } };
      }),

    linkChange: (epicId, input) =>
      mutateEpic(activeEpicsDir, epicId, undefined, (epic) => {
        const entryId = input.entryId ?? nextEntryId("change");
        if (
          epic.entries.some(
            (entry) =>
              entry.entry_id === entryId ||
              entryChangeId(entry) === input.changeId,
          )
        ) {
          throw epicError(
            `Change already linked to Epic: ${input.changeId}`,
            "entry_already_exists",
          );
        }
        const changeRef: EpicChangeRef | undefined = input.changeProjectId
          ? {
              change_id: input.changeId,
              project_id: input.changeProjectId,
              ...(input.repoId ? { repo_id: input.repoId } : {}),
              ...(input.targetPath ? { target_path: input.targetPath } : {}),
            }
          : undefined;
        const entry: EpicEntry = {
          kind: "change",
          entry_id: entryId,
          order: input.order ?? nextAvailableOrder(epic.entries),
          ...(changeRef
            ? { change_ref: changeRef }
            : { change_id: input.changeId }),
          title: input.title,
          membership_status:
            input.membershipStatus ??
            (input.terminalSummary ? "terminal" : "projection_pending"),
          linked_at: input.linkedAt ?? new Date().toISOString(),
          linked_by: input.linkedBy ?? "agent",
          ...(input.linkEvidence ? { link_evidence: input.linkEvidence } : {}),
          ...(input.terminalSummary
            ? {
                terminal_summary: {
                  status: input.terminalSummary.status,
                  completed_at: input.terminalSummary.completedAt,
                },
              }
            : {}),
        };
        epic.entries.push(entry);
        bumpVersion(epic);
        return { value: entry };
      }),

    retargetChange: (epicId, input) =>
      mutateEpic(activeEpicsDir, epicId, undefined, (epic) => {
        const { entry, index } = entryOrThrow(epic, input.entryId);
        if (entry.kind !== "change") {
          throw epicError(
            `Entry is not a linked change: ${input.entryId}`,
            "entry_not_found",
          );
        }
        const currentChangeId = entryChangeId(entry);
        if (currentChangeId === input.toChangeId)
          return { value: entry, changed: false };
        if (currentChangeId !== input.fromChangeId) {
          throw epicError(
            `Retarget source mismatch: entry ${input.entryId} is ${currentChangeId}, expected ${input.fromChangeId}`,
            "retarget_source_mismatch",
          );
        }
        if (
          epic.entries.some(
            (candidate) =>
              candidate.entry_id !== input.entryId &&
              entryChangeId(candidate) === input.toChangeId,
          )
        ) {
          throw epicError(
            `Target change already linked to Epic: ${input.toChangeId}`,
            "retarget_duplicate_target",
          );
        }
        const updated: EpicEntry = { ...entry };
        if (input.changeRef) {
          updated.change_ref = {
            ...input.changeRef,
            change_id: input.toChangeId,
          };
          delete updated.change_id;
        } else if (updated.change_ref) {
          updated.change_ref = {
            ...updated.change_ref,
            change_id: input.toChangeId,
          };
        } else {
          updated.change_id = input.toChangeId;
        }
        if (input.title !== undefined) updated.title = input.title;
        if (input.membershipStatus !== undefined)
          updated.membership_status = input.membershipStatus;
        updated.retargeted_from_change_id = input.fromChangeId;
        updated.retargeted_at = new Date().toISOString();
        updated.retargeted_by = input.retargetedBy ?? "agent";
        updated.retarget_evidence = input.retargetEvidence ?? "";
        if (updated.change_ref) {
          updated.linked_at ??= updated.retargeted_at;
          updated.linked_by ??= updated.retargeted_by;
          updated.link_evidence ??= updated.retarget_evidence;
          updated.title ??= input.title ?? input.toChangeId;
          updated.membership_status ??= "projection_pending";
        }
        epic.entries[index] = updated;
        bumpVersion(epic);
        return { value: updated };
      }),

    unlinkChange: (epicId, entryId, _unlinkEvidence) =>
      mutateEpic(activeEpicsDir, epicId, undefined, (epic) => {
        const index = epic.entries.findIndex(
          (entry) => entry.entry_id === entryId,
        );
        if (index < 0) return { value: undefined, changed: false };
        epic.entries.splice(index, 1);
        bumpVersion(epic);
        return { value: undefined };
      }),

    setEntryMembershipStatus: (epicId, input) =>
      mutateEpic(activeEpicsDir, epicId, undefined, (epic) => {
        const { entry, index } = entryOrThrow(epic, input.entryId);
        if (entry.kind !== "change") {
          throw epicError(
            `Entry is not a change entry: ${input.entryId}`,
            "entry_not_found",
          );
        }
        const updated: EpicEntry = {
          ...entry,
          membership_status: input.membershipStatus,
        };
        epic.entries[index] = updated;
        bumpVersion(epic);
        return { value: updated };
      }),

    setEntryTerminalSummary: (epicId, input) =>
      mutateEpic(activeEpicsDir, epicId, undefined, (epic) => {
        const { entry, index } = entryOrThrow(epic, input.entryId);
        if (entry.kind !== "change") {
          throw epicError(
            `Entry is not a linked change: ${input.entryId}`,
            "entry_not_found",
          );
        }
        const updated: EpicEntry = {
          ...entry,
          membership_status: "terminal",
          terminal_summary: {
            status: input.status,
            completed_at: input.completedAt,
          },
        };
        epic.entries[index] = updated;
        bumpVersion(epic);
        return { value: updated };
      }),

    reorder: (epicId, entryIds, expectedVersion) =>
      mutateEpic(activeEpicsDir, epicId, expectedVersion, (epic) => {
        if (entryIds.length !== epic.entries.length) {
          throw epicError(
            "Reordered entry IDs do not match current entries",
            "entry_not_found",
          );
        }
        const current = new Set(epic.entries.map((entry) => entry.entry_id));
        const requested = new Set(entryIds);
        if (
          current.size !== requested.size ||
          !entryIds.every((id) => current.has(id))
        ) {
          throw epicError(
            "Reordered entry IDs do not match current entries",
            "entry_not_found",
          );
        }
        const byId = new Map(
          epic.entries.map((entry) => [entry.entry_id, entry]),
        );
        epic.entries = entryIds.map((id, order) => ({
          ...byId.get(id)!,
          order,
        }));
        bumpVersion(epic);
        return { value: epic };
      }),

    retire: async (epicId, input) =>
      withEpicLock(activeEpicsDir, epicId, async () => {
        await assertDirectory(retiredEpicsDir, "retired Epic");
        const epic = await loadActiveRequired(activeEpicsDir, epicId);
        const blockers = epic.entries.filter(
          (entry) =>
            entry.kind === "shell" ||
            (entry.kind === "change" && !entry.terminal_summary),
        );
        if (epic.progress.status !== "completed" || blockers.length > 0) {
          throw epicError(
            `Epic ${epicId} has incomplete entries and cannot be retired`,
            "epic_incomplete",
          );
        }
        if (epic.version !== input.expectedVersion) {
          throw epicError(
            `Expected Epic version ${input.expectedVersion}, found ${epic.version}`,
            "stale_version",
          );
        }
        const projection: RetiredEpicProjection = {
          epic_snapshot: cloneEpic(epic),
          retired_at: new Date().toISOString(),
          retired_by: input.retiredBy,
          evidence: input.evidence,
          source_workflow_id: `disk:${epicId}`,
          source_version: epic.version,
          projection_status: input.dryRun ? "prepared" : "retired",
        };
        RetiredEpicProjectionSchema.parse(projection);
        if (input.dryRun) return projection;
        await saveRetiredProjectionDisk(retiredEpicsDir, epicId, projection);
        const readback = await loadRetiredEpicProjection(
          retiredEpicsDir,
          epicId,
        );
        if (!readback.success || !readback.data) {
          throw new Error(
            readback.success
              ? `Retired Epic readback missing: ${epicId}`
              : readback.error,
          );
        }
        await rm(join(activeEpicsDir, epicId), {
          recursive: true,
          force: false,
        });
        const activeAfter = await loadActiveEpicProjection(
          activeEpicsDir,
          epicId,
        );
        if (!activeAfter.success) throw new Error(activeAfter.error);
        if (activeAfter.data)
          throw new Error(`Active Epic remained after retirement: ${epicId}`);
        return readback.data;
      }),

    repairIndex: async ({ evidence }) => {
      if (!evidence.trim()) throw new Error("repairIndex requires evidence");
      await assertDirectory(activeEpicsDir, "active Epic");
      const result = await listActiveEpicProjections(activeEpicsDir);
      if (!result.success) throw new Error(result.error);
      const warnings = result.warnings ?? [];
      return {
        total: result.data.length + warnings.length,
        backfilled: 0,
        refreshed: 0,
        unverified: warnings.length,
        skipped: result.data.length,
        unreachable: 0,
        epics: [
          ...result.data.map((epic) => ({
            epic_id: epic.id,
            status: epic.progress.status,
            action: "skipped" as const,
            error:
              "Disk projections are authoritative; no secondary Epic index exists to repair.",
          })),
          ...warnings.map((warning) => ({
            epic_id: warning.path.split("/").at(-2) ?? "unknown",
            status: "unknown",
            action: "unverified" as const,
            error: warning.error,
          })),
        ],
      };
    },
  };
}
