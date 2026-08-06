import type { Store } from "../store-types";
import type { Epic, RetiredEpicProjection } from "../../types";
import {
  epicArchivedSignal,
  epicCreatedSignal,
  epicMergedSignal,
  epicScopeUpdatedSignal,
  epicUpdatedSignal,
  shellAddedSignal,
  shellPromotedSignal,
  changeLinkedSignal,
  changeProjectionStatusUpdatedSignal,
  changeRetargetedSignal,
  changeUnlinkedSignal,
  entriesReorderedSignal,
  entryTerminalSummarySignal,
  searchAttributesRefreshedSignal,
} from "../../temporal/messages";
import {
  runTemporal,
  createTemporalReadContext,
  type StoreDeps,
  type TemporalReadContext,
  type TemporalWorkflowHandle,
  getTemporalOwner,
} from "./shared";
import {
  makeTemporalOperationContext,
  type TemporalOperations,
} from "../../temporal/operations";
import { StartWorkflowOutcomeError } from "../../temporal/workflow-start";
import { TemporalMutationOutcomeError } from "../../temporal/outcome-errors";
import type { EpicWorkflowInput } from "../../temporal/contracts";
import {
  listActiveEpicProjections,
  listRetiredEpicProjections,
  loadActiveEpicProjection,
  loadRetiredEpicProjection,
} from "../epic-projection-reader";
import {
  removeActiveEpicProjection,
  saveActiveEpicProjection,
  saveRetiredEpicProjection,
} from "../epic-projection";
import { buildEpicWorkflowId } from "../../temporal/client";

export interface EpicMutationError {
  code:
    | "epic_not_found"
    | "stale_version"
    | "entry_not_found"
    | "shell_not_found"
    | "already_promoted"
    | "entry_already_exists"
    | "epic_not_active"
    | "epic_archived"
    | "epic_incomplete"
    | "retarget_source_mismatch"
    | "retarget_duplicate_target"
    | "temporal_unavailable"
    | "signal_rejected";
  message: string;
  rejection?: { signalName: string; errorMessage: string };
  blockers?: { entry_id: string; kind: string; reason: string }[];
}

function idempotencyKey(prefix: string, ...parts: string[]): string {
  return [prefix, ...parts].join("|");
}

function extractMutationRejection(
  error: unknown,
): Pick<EpicMutationError, "code" | "message" | "rejection"> {
  const text = error instanceof Error ? error.message : String(error);
  if (/Workflow not found|not found|Workflow execution not found/i.test(text)) {
    return { code: "epic_not_found", message: text };
  }
  return { code: "signal_rejected", message: text };
}

type DiskEpicState = {
  epic: Epic;
  status: "active" | "archived" | "merged";
  rejections?: import("../../temporal/contracts").EpicSignalRejection[];
};

async function queryEpicState(
  activeEpicsDir: string | undefined,
  retiredEpicsDir: string | undefined,
  epicId: string,
): Promise<DiskEpicState | null> {
  const retired = await loadRetiredEpicProjection(retiredEpicsDir, epicId);
  if (!retired.success) throw new Error(retired.error);
  if (retired.data) {
    return { epic: retired.data.epic_snapshot, status: "archived" };
  }

  const active = await loadActiveEpicProjection(activeEpicsDir, epicId);
  if (!active.success) throw new Error(active.error);
  return active.data ? { epic: active.data, status: "active" } : null;
}

function isWorkflowNotFoundError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /Workflow not found|Workflow execution not found|not found/i.test(
    text,
  );
}

async function tryQueryEpicState(
  activeEpicsDir: string | undefined,
  retiredEpicsDir: string | undefined,
  epicId: string,
): Promise<DiskEpicState | null> {
  try {
    return await queryEpicState(activeEpicsDir, retiredEpicsDir, epicId);
  } catch (error) {
    if (isWorkflowNotFoundError(error)) return null;
    throw error;
  }
}

async function verifyEpicStatusSearchAttributeImpl(
  owner: TemporalOperations,
  projectId: string,
  handle: TemporalWorkflowHandle,
  status: string,
): Promise<{ verified: true } | { verified: false; error: string }> {
  void owner;
  void projectId;
  void handle;
  void status;
  return {
    verified: false,
    error:
      "Search-attribute refresh delivered, but no disk equivalent exists for Temporal describe verification.",
  };
}

function lastRejectionFor(
  state: {
    rejections?: import("../../temporal/contracts").EpicSignalRejection[];
  } | null,
  signalName: string,
  since: string,
):
  | { signalName: string; errorMessage: string; rejectedAt: string }
  | undefined {
  const rejections = state?.rejections ?? [];
  for (let i = rejections.length - 1; i >= 0; i--) {
    const r = rejections[i];
    if (r.signalName === signalName && r.rejectedAt >= since) return r;
  }
  return undefined;
}

function codeFromRejectionMessage(message: string): EpicMutationError["code"] {
  if (/stale_version|Expected Epic version/i.test(message))
    return "stale_version";
  if (/entry_not_found|Reordered entry IDs do not match/i.test(message))
    return "entry_not_found";
  if (/shell_not_found|Shell entry not found/i.test(message))
    return "shell_not_found";
  if (/already_promoted|Entry is not a shell/i.test(message))
    return "already_promoted";
  if (/entry_already_exists|Entry already exists/i.test(message))
    return "entry_already_exists";
  if (/retarget_source_mismatch|Retarget source mismatch/i.test(message))
    return "retarget_source_mismatch";
  if (/retarget_duplicate_target|Target change already linked/i.test(message))
    return "retarget_duplicate_target";
  if (
    /epic_not_active|Epic is not active|Completed Epics cannot be merged/i.test(
      message,
    )
  )
    return "epic_not_active";
  if (/epic_archived|Epic is archived/i.test(message)) return "epic_archived";
  if (/epic_incomplete|incomplete entries/i.test(message))
    return "epic_incomplete";
  return "signal_rejected";
}

async function fireEpicSignalImpl(
  owner: TemporalOperations,
  projectId: string,
  handle: TemporalWorkflowHandle,
  activeEpicsDir: string | undefined,
  retiredEpicsDir: string | undefined,
  epicId: string,
  signalName: string,
  rejectionSince: string,
  signal: import("@temporalio/workflow").SignalDefinition<unknown[]>,
  ...args: unknown[]
): Promise<void> {
  const ctx = makeTemporalOperationContext(
    projectId,
    handle.workflowId,
    "signal",
    signalName,
    5_000,
  );
  const outcome = await runTemporal(() =>
    owner.signal(ctx, handle, signal, args),
  );
  if (outcome.kind !== "confirmed") {
    throw new TemporalMutationOutcomeError(outcome);
  }
  const state = await queryEpicState(activeEpicsDir, retiredEpicsDir, epicId);
  const rejection = lastRejectionFor(state, signalName, rejectionSince);
  if (rejection) {
    const error: EpicMutationError = {
      code: codeFromRejectionMessage(rejection.errorMessage),
      message: rejection.errorMessage,
      rejection: {
        signalName: rejection.signalName,
        errorMessage: rejection.errorMessage,
      },
    };
    throw Object.assign(new Error(error.message), error);
  }
}

/**
 * Fire the terminal `epicArchived` signal and detect any rejection recorded by
 * the workflow. Unlike `fireEpicSignal`, this helper does not treat a "workflow
 * not found" query failure as an error: a completed Epic workflow is no longer
 * queryable, which is the expected outcome of a successful archive.
 */
async function fireEpicArchiveSignalImpl(
  owner: TemporalOperations,
  projectId: string,
  handle: TemporalWorkflowHandle,
  activeEpicsDir: string | undefined,
  retiredEpicsDir: string | undefined,
  epicId: string,
  payload: {
    archivedAt: string;
    archivedBy: string;
    expectedVersion: number;
    idempotencyKey: string;
  },
): Promise<void> {
  const ctx = makeTemporalOperationContext(
    projectId,
    handle.workflowId,
    "signal",
    "epicArchived",
    5_000,
  );
  const outcome = await runTemporal(() =>
    owner.signal(ctx, handle, epicArchivedSignal, [payload]),
  );
  if (outcome.kind !== "confirmed") {
    throw new TemporalMutationOutcomeError(outcome);
  }
  try {
    const state = await queryEpicState(activeEpicsDir, retiredEpicsDir, epicId);
    const rejection = lastRejectionFor(
      state,
      "epicArchived",
      payload.archivedAt,
    );
    if (rejection) {
      const error: EpicMutationError = {
        code: codeFromRejectionMessage(rejection.errorMessage),
        message: rejection.errorMessage,
        rejection: {
          signalName: rejection.signalName,
          errorMessage: rejection.errorMessage,
        },
      };
      throw Object.assign(new Error(error.message), error);
    }
  } catch (error) {
    if (isWorkflowNotFoundError(error)) return;
    throw error;
  }
}

export function createEpicOps(deps: StoreDeps): Store["epics"] {
  const { input } = deps;
  const owner = getTemporalOwner(input);

  function makeEpicCtx(
    workflowId: string,
    opKind: import("../../temporal/operations").TemporalOperationKind,
    opType: string,
    budgetMs = 5_000,
  ) {
    return makeTemporalOperationContext(
      input.projectId,
      workflowId,
      opKind,
      opType,
      budgetMs,
    );
  }

  function getEpicHandle(epicId: string): TemporalWorkflowHandle {
    const workflowId = buildEpicWorkflowId(input.projectId, epicId);
    return owner.getHandle(
      makeEpicCtx(workflowId, "describe", "getEpicHandle"),
    );
  }

  async function ensureEpicHandle(
    epicId: string,
  ): Promise<TemporalWorkflowHandle> {
    const workflowId = buildEpicWorkflowId(input.projectId, epicId);
    const ctx = makeEpicCtx(workflowId, "start", "ensureEpicHandle", 10_000);
    const startInput: EpicWorkflowInput = {
      projectId: input.projectId,
      epicId,
      title: epicId,
      narrative: "",
      initializedAt: new Date().toISOString(),
    };
    const outcome = await owner.startEpicWorkflow(ctx, startInput);
    if (outcome.kind !== "confirmed") {
      throw new StartWorkflowOutcomeError(
        outcome.kind,
        outcome.error,
        outcome.diagnostic,
        `startEpicWorkflow ${outcome.kind}`,
      );
    }
    return outcome.value;
  }

  async function queryEpicStateRead(
    activeEpicsDir: string | undefined,
    retiredEpicsDir: string | undefined,
    epicId: string,
  ): Promise<DiskEpicState | null> {
    return queryEpicState(activeEpicsDir, retiredEpicsDir, epicId);
  }

  async function tryQueryEpicStateRead(
    activeEpicsDir: string | undefined,
    retiredEpicsDir: string | undefined,
    epicId: string,
    ctx: TemporalReadContext,
  ): Promise<
    | {
        kind: "ok";
        state: DiskEpicState;
      }
    | { kind: "not_found" }
    | { kind: "unresponsive" }
  > {
    try {
      const state = await queryEpicStateRead(
        activeEpicsDir,
        retiredEpicsDir,
        epicId,
      );
      if (!state) return { kind: "not_found" };
      ctx.recordResponsiveMember();
      return { kind: "ok", state };
    } catch (error) {
      if (isWorkflowNotFoundError(error)) return { kind: "not_found" };
      throw error;
    }
  }

  async function queryEpic(
    epicId: string,
    ctx: TemporalReadContext,
  ): Promise<
    | { kind: "ok"; epic: Epic }
    | { kind: "not_found" }
    | { kind: "unresponsive" }
  > {
    const result = await tryQueryEpicStateRead(
      deps.legacy?.paths?.activeEpics,
      deps.legacy?.paths?.retiredEpics,
      epicId,
      ctx,
    );
    if (result.kind === "ok") return { kind: "ok", epic: result.state.epic };
    return result;
  }

  async function assertEpicExists(epicId: string): Promise<Epic> {
    const result = await loadActiveEpicProjection(
      deps.legacy?.paths?.activeEpics,
      epicId,
    );
    if (!result.success) throw new Error(result.error);
    if (result.data) return result.data;
    throw Object.assign(new Error(`Epic not found: ${epicId}`), {
      code: "epic_not_found",
    });
  }

  async function queryEpicFresh(epicId: string): Promise<Epic> {
    const ctx = createTemporalReadContext();
    const result = await queryEpic(epicId, ctx);
    if (result.kind === "ok") return result.epic;
    if (result.kind === "unresponsive") {
      throw new Error(`Epic workflow unresponsive during readback: ${epicId}`);
    }
    throw Object.assign(new Error(`Epic not found: ${epicId}`), {
      code: "epic_not_found",
    });
  }

  async function persistFreshEpic(epicId: string): Promise<Epic> {
    const epic = await queryEpicFresh(epicId);
    const activeEpicsDir = deps.legacy?.paths?.activeEpics;
    if (!activeEpicsDir) {
      throw new Error(
        `Cannot save active projection for ${epicId}: activeEpics path is not configured`,
      );
    }
    await saveActiveEpicProjection(activeEpicsDir, epic);
    return epic;
  }

  async function fireEpicSignal(
    handle: TemporalWorkflowHandle,
    signalName: string,
    rejectionSince: string,
    signal: import("@temporalio/workflow").SignalDefinition<unknown[]>,
    ...args: unknown[]
  ): Promise<void> {
    return fireEpicSignalImpl(
      owner,
      input.projectId,
      handle,
      deps.legacy?.paths?.activeEpics,
      deps.legacy?.paths?.retiredEpics,
      handle.workflowId.split("/").at(-1) ?? "",
      signalName,
      rejectionSince,
      signal,
      ...args,
    );
  }

  async function fireEpicArchiveSignal(
    handle: TemporalWorkflowHandle,
    payload: {
      archivedAt: string;
      archivedBy: string;
      expectedVersion: number;
      idempotencyKey: string;
    },
  ): Promise<void> {
    return fireEpicArchiveSignalImpl(
      owner,
      input.projectId,
      handle,
      deps.legacy?.paths?.activeEpics,
      deps.legacy?.paths?.retiredEpics,
      handle.workflowId.split("/").at(-1) ?? "",
      payload,
    );
  }

  async function verifyEpicStatusSearchAttribute(
    handle: TemporalWorkflowHandle,
    status: string,
  ): Promise<{ verified: true } | { verified: false; error: string }> {
    return verifyEpicStatusSearchAttributeImpl(
      owner,
      input.projectId,
      handle,
      status,
    );
  }

  return {
    create: async (epicId, title, narrative, options) => {
      const handle = await ensureEpicHandle(epicId);

      const now = new Date().toISOString();
      const epic: Epic = {
        id: epicId,
        title,
        narrative,
        ...(options?.epicScope ? { epic_scope: options.epicScope } : {}),
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

      await fireEpicSignal(handle, "epicCreated", now, epicCreatedSignal, epic);
      return persistFreshEpic(epicId);
    },

    get: async (epicId) => {
      const retired = await loadRetiredEpicProjection(
        deps.legacy?.paths?.retiredEpics,
        epicId,
      );
      if (!retired.success) {
        return { success: false, error: retired.error, type: retired.type };
      }
      if (retired.data) {
        return {
          success: true,
          data: retired.data.epic_snapshot,
          source: "retired_projection",
        };
      }
      const active = await loadActiveEpicProjection(
        deps.legacy?.paths?.activeEpics,
        epicId,
      );
      if (!active.success) {
        return { success: false, error: active.error, type: active.type };
      }
      return active.data
        ? { success: true, data: active.data, source: "active_projection" }
        : { success: true, data: null };
    },

    getRetiredProjection: async (epicId) =>
      loadRetiredEpicProjection(deps.legacy?.paths?.retiredEpics, epicId),

    saveRetiredProjection: async (epicId, projection) => {
      const retiredEpicsDir = deps.legacy?.paths?.retiredEpics;
      if (!retiredEpicsDir) {
        throw new Error(
          `Cannot save retired projection for ${epicId}: retiredEpics path is not configured`,
        );
      }
      await saveRetiredEpicProjection(retiredEpicsDir, epicId, projection);
    },

    retire: async (
      epicId,
      { expectedVersion, evidence, retiredBy, dryRun },
    ) => {
      const handle = getEpicHandle(epicId);
      const state = await tryQueryEpicState(
        deps.legacy?.paths?.activeEpics,
        deps.legacy?.paths?.retiredEpics,
        epicId,
      );
      if (!state) {
        throw Object.assign(new Error(`Epic not found: ${epicId}`), {
          code: "epic_not_found" as const,
        });
      }

      const blockers = state.epic.entries
        .filter(
          (entry) =>
            entry.kind === "shell" ||
            (entry.kind === "change" && entry.terminal_summary?.status == null),
        )
        .map((entry) => ({
          entry_id: entry.entry_id,
          kind: entry.kind,
          reason: entry.kind === "shell" ? "future" : "active",
        }));

      if (state.epic.progress.status !== "completed" || blockers.length > 0) {
        const error = new Error(
          `Epic ${epicId} has incomplete entries and cannot be retired`,
        );
        throw Object.assign(error, {
          code: "epic_incomplete" as const,
          message: error.message,
          blockers,
        });
      }

      if (state.epic.version !== expectedVersion) {
        throw Object.assign(
          new Error(
            `Expected Epic version ${expectedVersion}, found ${state.epic.version}`,
          ),
          {
            code: "stale_version" as const,
          },
        );
      }

      const workflowId = buildEpicWorkflowId(input.projectId, epicId);
      const retiredAt = new Date().toISOString();

      const projection: RetiredEpicProjection = {
        epic_snapshot: JSON.parse(JSON.stringify(state.epic)) as Epic,
        retired_at: retiredAt,
        retired_by: retiredBy,
        evidence,
        source_workflow_id: workflowId,
        source_version: state.epic.version,
        projection_status: dryRun ? "prepared" : "retired",
      };

      if (dryRun) {
        return projection;
      }

      await deps.legacy.epics.saveRetiredProjection(epicId, projection);

      await fireEpicArchiveSignal(handle, {
        archivedAt: retiredAt,
        archivedBy: retiredBy,
        expectedVersion: state.epic.version,
        idempotencyKey: idempotencyKey(
          "epic-retire",
          epicId,
          String(state.epic.version),
        ),
      });
      await removeActiveEpicProjection(deps.legacy?.paths?.activeEpics, epicId);

      return projection;
    },

    list: async (filter?: { status?: "active" | "all" }) => {
      const status = filter?.status ?? "active";
      const active = await listActiveEpicProjections(
        deps.legacy?.paths?.activeEpics,
      );
      if (!active.success) return [];
      const retired = await listRetiredEpicProjections(
        deps.legacy?.paths?.retiredEpics,
      );
      if (!retired.success) {
        return status === "active"
          ? active.data.filter((epic) => epic.progress.status === "active")
          : active.data;
      }
      // A retired projection is terminal and therefore wins if a crash left a
      // stale active projection behind after retirement.
      const retiredIds = new Set(retired.data.map((epic) => epic.id));
      const combined = [
        ...active.data.filter((epic) => !retiredIds.has(epic.id)),
        ...retired.data,
      ];
      return (
        status === "active"
          ? combined.filter((epic) => epic.progress.status === "active")
          : combined
      ).sort(
        (a, b) =>
          b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id),
      );
    },

    update: async (epicId, { title, narrative, expectedVersion }) => {
      await assertEpicExists(epicId);
      const handle = getEpicHandle(epicId);

      const payload = {
        ...(title !== undefined ? { title } : {}),
        ...(narrative !== undefined ? { narrative } : {}),
        expectedVersion,
        idempotencyKey: idempotencyKey(
          "epic-update",
          epicId,
          String(expectedVersion),
        ),
        updatedAt: new Date().toISOString(),
      };

      await fireEpicSignal(
        handle,
        "epicUpdated",
        payload.updatedAt,
        epicUpdatedSignal,
        payload,
      );

      return await persistFreshEpic(epicId);
    },

    updateScope: async (
      epicId,
      { epicScope, expectedVersion, updatedBy, auditEvidence },
    ) => {
      await assertEpicExists(epicId);
      const handle = getEpicHandle(epicId);

      const payload = {
        ...(epicScope !== undefined ? { epicScope } : {}),
        expectedVersion,
        updatedBy: updatedBy ?? "agent",
        auditEvidence,
        idempotencyKey: idempotencyKey(
          "epic-scope-update",
          epicId,
          String(expectedVersion),
        ),
        updatedAt: new Date().toISOString(),
      };

      await fireEpicSignal(
        handle,
        "epicScopeUpdated",
        payload.updatedAt,
        epicScopeUpdatedSignal,
        payload,
      );

      return await persistFreshEpic(epicId);
    },

    markMerged: async (epicId, { mergedInto, expectedVersion }) => {
      await assertEpicExists(epicId);
      const handle = getEpicHandle(epicId);

      const payload = {
        mergedInto,
        expectedVersion,
        idempotencyKey: idempotencyKey(
          "epic-merged",
          epicId,
          mergedInto.epic_id,
          String(expectedVersion),
        ),
      };

      await fireEpicSignal(
        handle,
        "epicMerged",
        mergedInto.merged_at,
        epicMergedSignal,
        payload,
      );

      return await persistFreshEpic(epicId);
    },

    addShell: async (
      epicId,
      {
        entryId,
        title,
        successHint,
        order,
        importedFrom,
        blockedBy,
        context_packet,
      },
    ) => {
      await assertEpicExists(epicId);
      const handle = getEpicHandle(epicId);

      const finalEntryId =
        entryId ??
        `shell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const payload = {
        entryId: finalEntryId,
        title,
        successHint,
        order,
        ...(importedFrom ? { importedFrom } : {}),
        ...(blockedBy !== undefined && blockedBy.length > 0
          ? { blockedBy }
          : {}),
        ...(context_packet !== undefined ? { context_packet } : {}),
        idempotencyKey: idempotencyKey("add-shell", epicId, finalEntryId),
        addedAt: new Date().toISOString(),
      };

      await fireEpicSignal(
        handle,
        "shellAdded",
        payload.addedAt,
        shellAddedSignal,
        payload,
      );

      const epic = await persistFreshEpic(epicId);
      const entry = epic.entries.find((e) => e.entry_id === finalEntryId);
      if (!entry) {
        throw new Error(`Shell entry not found after add: ${finalEntryId}`);
      }
      return entry;
    },

    promoteShell: async (epicId, entryId, changeId, promotedBy) => {
      await assertEpicExists(epicId);
      const handle = getEpicHandle(epicId);

      const payload = {
        entryId,
        changeId,
        promotedBy,
        idempotencyKey: idempotencyKey(
          "promote-shell",
          epicId,
          entryId,
          changeId,
        ),
        promotedAt: new Date().toISOString(),
      };

      await fireEpicSignal(
        handle,
        "shellPromoted",
        payload.promotedAt,
        shellPromotedSignal,
        payload,
      );

      await persistFreshEpic(epicId);
      return { entryId, changeId };
    },

    linkChange: async (
      epicId,
      {
        entryId,
        changeId,
        title,
        order,
        linkedBy,
        linkEvidence,
        changeProjectId,
        repoId,
        targetPath,
      },
    ) => {
      await assertEpicExists(epicId);
      const handle = getEpicHandle(epicId);

      const finalEntryId =
        entryId ??
        `change-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const payload = {
        entryId: finalEntryId,
        changeId,
        changeRef: {
          change_id: changeId,
          project_id: changeProjectId ?? input.projectId,
          ...(repoId ? { repo_id: repoId } : {}),
          ...(targetPath ? { target_path: targetPath } : {}),
        },
        title,
        order,
        membershipStatus: "projection_pending" as const,
        linkedBy: linkedBy ?? "agent",
        ...(linkEvidence ? { linkEvidence } : {}),
        idempotencyKey: idempotencyKey(
          "link-change",
          epicId,
          finalEntryId,
          changeId,
        ),
        linkedAt: new Date().toISOString(),
      };

      await fireEpicSignal(
        handle,
        "changeLinked",
        payload.linkedAt,
        changeLinkedSignal,
        payload,
      );

      const epic = await persistFreshEpic(epicId);
      const entry = epic.entries.find((e) => e.entry_id === finalEntryId);
      if (!entry) {
        throw new Error(`Change entry not found after link: ${finalEntryId}`);
      }
      return entry;
    },

    retargetChange: async (
      epicId,
      {
        entryId,
        fromChangeId,
        toChangeId,
        title,
        changeRef,
        membershipStatus,
        retargetedBy,
        retargetEvidence,
      },
    ) => {
      await assertEpicExists(epicId);
      const handle = getEpicHandle(epicId);

      const retargetedAt = new Date().toISOString();
      const payload = {
        entryId,
        fromChangeId,
        toChangeId,
        ...(title !== undefined ? { title } : {}),
        ...(changeRef ? { changeRef } : {}),
        ...(membershipStatus ? { membershipStatus } : {}),
        retargetedBy: retargetedBy ?? "agent",
        retargetEvidence: retargetEvidence ?? "",
        idempotencyKey: idempotencyKey(
          "retarget-change",
          epicId,
          entryId,
          fromChangeId,
          toChangeId,
        ),
        retargetedAt,
      };

      await fireEpicSignal(
        handle,
        "changeRetargeted",
        retargetedAt,
        changeRetargetedSignal,
        payload,
      );

      const epic = await persistFreshEpic(epicId);
      const entry = epic.entries.find((e) => e.entry_id === entryId);
      if (!entry) {
        throw new Error(`Change entry not found after retarget: ${entryId}`);
      }
      return entry;
    },

    unlinkChange: async (epicId, entryId, unlinkEvidence) => {
      await assertEpicExists(epicId);
      const handle = getEpicHandle(epicId);

      const payload = {
        entryId,
        unlinkEvidence,
        idempotencyKey: idempotencyKey("unlink-change", epicId, entryId),
        unlinkedAt: new Date().toISOString(),
      };

      await fireEpicSignal(
        handle,
        "changeUnlinked",
        payload.unlinkedAt,
        changeUnlinkedSignal,
        payload,
      );
      await persistFreshEpic(epicId);
    },

    setEntryMembershipStatus: async (
      epicId,
      { entryId, membershipStatus, evidence },
    ) => {
      await assertEpicExists(epicId);
      const handle = getEpicHandle(epicId);
      const updatedAt = new Date().toISOString();
      const payload = {
        entryId,
        membershipStatus,
        evidence,
        idempotencyKey: idempotencyKey(
          "projection-status",
          epicId,
          entryId,
          membershipStatus,
        ),
        updatedAt,
      };

      await fireEpicSignal(
        handle,
        "changeProjectionStatusUpdated",
        updatedAt,
        changeProjectionStatusUpdatedSignal,
        payload,
      );

      const epic = await persistFreshEpic(epicId);
      const entry = epic.entries.find((e) => e.entry_id === entryId);
      if (!entry) {
        throw new Error(
          `Change entry not found after status update: ${entryId}`,
        );
      }
      return entry;
    },

    setEntryTerminalSummary: async (
      epicId,
      { entryId, status, completedAt },
    ) => {
      await assertEpicExists(epicId);
      const handle = getEpicHandle(epicId);
      const payload = {
        entryId,
        status,
        completedAt,
        idempotencyKey: idempotencyKey(
          "terminal-summary",
          epicId,
          entryId,
          status,
        ),
      };

      await fireEpicSignal(
        handle,
        "entryTerminalSummary",
        completedAt,
        entryTerminalSummarySignal,
        payload,
      );

      const epic = await persistFreshEpic(epicId);
      const entry = epic.entries.find((e) => e.entry_id === entryId);
      if (!entry) {
        throw new Error(
          `Change entry not found after terminal summary update: ${entryId}`,
        );
      }
      return entry;
    },

    reorder: async (epicId, entryIds, expectedVersion) => {
      await assertEpicExists(epicId);
      const handle = getEpicHandle(epicId);

      const payload = {
        entryIds,
        expectedVersion,
        idempotencyKey: idempotencyKey(
          "reorder",
          epicId,
          String(expectedVersion),
          entryIds.join(","),
        ),
        reorderedAt: new Date().toISOString(),
      };

      await fireEpicSignal(
        handle,
        "entriesReordered",
        payload.reorderedAt,
        entriesReorderedSignal,
        payload,
      );

      return await persistFreshEpic(epicId);
    },

    repairIndex: async ({ evidence, dryRun }) => {
      const activeProjections = await listActiveEpicProjections(
        deps.legacy?.paths?.activeEpics,
      );
      if (!activeProjections.success) throw new Error(activeProjections.error);
      const ids = activeProjections.data.map((epic) => epic.id);

      const refreshedAt = new Date().toISOString();
      const report: Awaited<
        ReturnType<Store["epics"]["repairIndex"]>
      >["epics"] = [];
      let backfilled = 0;
      let refreshed = 0;
      let unverified = 0;
      let skipped = 0;
      let unreachable = 0;

      for (const epicId of ids) {
        const handle = getEpicHandle(epicId);
        let state: DiskEpicState | null;
        try {
          state = await tryQueryEpicState(
            deps.legacy?.paths?.activeEpics,
            deps.legacy?.paths?.retiredEpics,
            epicId,
          );
        } catch {
          state = null;
        }
        if (!state) {
          unreachable += 1;
          report.push({
            epic_id: epicId,
            status: "unknown",
            action: "unreachable",
            error: "Workflow state unavailable",
          });
          continue;
        }

        const status = state.epic.progress.status;
        if (state.status === "archived" || state.status === "merged") {
          skipped += 1;
          report.push({
            epic_id: epicId,
            status,
            action: "skipped",
          });
          continue;
        }

        const projection = await loadActiveEpicProjection(
          deps.legacy?.paths?.activeEpics,
          epicId,
        );
        if (!projection.success) {
          unverified += 1;
          report.push({
            epic_id: epicId,
            status,
            action: "unverified",
            error: projection.error,
          });
          continue;
        }
        const needsBackfill = !projection.data;

        if (dryRun) {
          report.push({
            epic_id: epicId,
            status,
            action: needsBackfill ? "would_backfill" : "would_refresh",
          });
          continue;
        }

        let didBackfill = false;
        if (needsBackfill) {
          const activeEpicsDir = deps.legacy?.paths?.activeEpics;
          if (!activeEpicsDir) {
            skipped += 1;
            report.push({
              epic_id: epicId,
              status,
              action: "skipped",
              error:
                "Cannot backfill Epic projection: activeEpics path is not configured",
            });
            continue;
          }
          try {
            await saveActiveEpicProjection(activeEpicsDir, state.epic);
            backfilled += 1;
            didBackfill = true;
          } catch (err) {
            skipped += 1;
            report.push({
              epic_id: epicId,
              status,
              action: "skipped",
              error: `Failed to backfill active Epic projection: ${err instanceof Error ? err.message : String(err)}`,
            });
            continue;
          }
        }

        const payload = {
          evidence,
          refreshedAt,
          idempotencyKey: idempotencyKey(
            "repair-index",
            input.projectId,
            epicId,
            refreshedAt,
          ),
        };

        try {
          await fireEpicSignal(
            handle,
            "searchAttributesRefreshed",
            refreshedAt,
            searchAttributesRefreshedSignal,
            payload,
          );
          const verification = await verifyEpicStatusSearchAttribute(
            handle,
            status,
          );
          if (verification.verified) {
            refreshed += 1;
            report.push({
              epic_id: epicId,
              status,
              action: didBackfill ? "backfilled" : "refreshed",
            });
          } else {
            unverified += 1;
            report.push({
              epic_id: epicId,
              status,
              action: didBackfill ? "backfilled" : "unverified",
              error: verification.error,
            });
          }
        } catch (err) {
          const typed = extractMutationRejection(err);
          skipped += 1;
          report.push({
            epic_id: epicId,
            status,
            action: didBackfill ? "backfilled" : "skipped",
            error: typed.message,
          });
        }
      }

      return {
        total: ids.length,
        backfilled,
        refreshed,
        unverified,
        skipped,
        unreachable,
        epics: report,
      };
    },
  };
}
