import type { Store } from "../store-types";
import type { Epic, RetiredEpicProjection } from "../../types";
import { ensureEpicWorkflowStarted } from "../../temporal/workflow-start";
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
  getEpicStateQuery,
  searchAttributesRefreshedSignal,
} from "../../temporal/messages";
import {
  runTemporal,
  runTemporalQuery,
  createTemporalReadContext,
  runTemporalRead,
  getTemporalConnection,
  TemporalQueryTimeoutError,
  type StoreDeps,
  type TemporalReadContext,
} from "./shared";
import {
  loadRetiredEpicProjection,
  saveRetiredEpicProjection,
} from "../epic-projection";
import { ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES } from "../../temporal/contracts";

interface EpicHandleLike {
  query: (definition: unknown, ...args: unknown[]) => Promise<unknown>;
  signal: (definition: unknown, ...args: unknown[]) => Promise<void>;
  describe?: () => Promise<unknown>;
}

function asEpicHandle(handle: unknown): EpicHandleLike {
  return handle as EpicHandleLike;
}

import { listEpicWorkflowIds } from "../../temporal/list-epic-workflows";
import { buildEpicWorkflowId } from "../../temporal/client";
import { createLogger } from "../../utils/debug-log";

const logger = createLogger("store-temporal-epics");

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

async function queryEpicState(
  handle: EpicHandleLike,
): Promise<import("../../temporal/contracts").EpicWorkflowState> {
  const state = await runTemporalQuery(() => handle.query(getEpicStateQuery));
  if (!isEpicWorkflowState(state)) {
    throw new Error("Epic workflow state query returned malformed state");
  }
  return state;
}

function isEpicWorkflowState(
  value: unknown,
): value is import("../../temporal/contracts").EpicWorkflowState {
  return (
    typeof value === "object" &&
    value !== null &&
    "epic" in value &&
    typeof (value as { epic?: unknown }).epic === "object" &&
    (value as { epic?: unknown }).epic !== null
  );
}

function isWorkflowNotFoundError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /Workflow not found|Workflow execution not found|not found/i.test(
    text,
  );
}

async function tryQueryEpicState(
  handle: EpicHandleLike,
): Promise<import("../../temporal/contracts").EpicWorkflowState | null> {
  try {
    return await queryEpicState(handle);
  } catch (error) {
    if (isWorkflowNotFoundError(error)) return null;
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function searchAttributeValueMatches(
  value: unknown,
  expected: string,
): boolean {
  if (value === expected) return true;
  if (Array.isArray(value)) {
    return value.some((item) => searchAttributeValueMatches(item, expected));
  }
  if (isRecord(value) && "value" in value) {
    return searchAttributeValueMatches(value.value, expected);
  }
  return false;
}

function describedSearchAttributesContainStatus(
  description: unknown,
  expectedStatus: string,
): boolean {
  if (!isRecord(description)) return false;
  const attrName = ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.epicStatus;
  const searchAttributes = description.searchAttributes;
  if (isRecord(searchAttributes)) {
    const value = searchAttributes[attrName];
    if (searchAttributeValueMatches(value, expectedStatus)) return true;
  }

  const typedSearchAttributes = description.typedSearchAttributes;
  if (Array.isArray(typedSearchAttributes)) {
    return typedSearchAttributes.some((pair) => {
      if (!isRecord(pair)) return false;
      const key = pair.key;
      const keyName = isRecord(key) ? key.name : key;
      return (
        keyName === attrName &&
        searchAttributeValueMatches(pair.value, expectedStatus)
      );
    });
  }

  return false;
}

async function verifyEpicStatusSearchAttribute(
  handle: EpicHandleLike,
  status: string,
): Promise<{ verified: true } | { verified: false; error: string }> {
  // rq-epicSearchAttributeRepair01: repair reports distinguish confirmed
  // search-attribute proof from skipped, unreachable, or unverified delivery.
  if (!handle.describe) {
    return {
      verified: false,
      error:
        "Search-attribute refresh signal delivered, but workflow describe is unavailable for AdvEpicStatus verification.",
    };
  }
  try {
    const description = await runTemporal(() => handle.describe!(), {
      opType: "describe-epic-search-attributes",
      timeoutMs: 5_000,
    });
    if (describedSearchAttributesContainStatus(description, status)) {
      return { verified: true };
    }
    return {
      verified: false,
      error: `Search-attribute refresh signal delivered, but AdvEpicStatus=${status} was not present in workflow describe output.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      verified: false,
      error: `Search-attribute refresh signal delivered, but workflow describe failed: ${message}`,
    };
  }
}

function lastRejectionFor(
  state: import("../../temporal/contracts").EpicWorkflowState,
  signalName: string,
  since: string,
):
  | { signalName: string; errorMessage: string; rejectedAt: string }
  | undefined {
  const rejections = state.rejections ?? [];
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

async function fireEpicSignal(
  handle: EpicHandleLike,
  signalName: string,
  rejectionSince: string,
  signal: unknown,
  ...args: unknown[]
): Promise<void> {
  await runTemporal(() => handle.signal(signal, ...args));
  const state = await queryEpicState(handle);
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
async function fireEpicArchiveSignal(
  handle: EpicHandleLike,
  payload: {
    archivedAt: string;
    archivedBy: string;
    expectedVersion: number;
    idempotencyKey: string;
  },
): Promise<void> {
  await runTemporal(() => handle.signal(epicArchivedSignal, payload));
  try {
    const state = await queryEpicState(handle);
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
  const { input, getTemporalWorkflowClient } = deps;

  function getTemporalClient(): ReturnType<typeof getTemporalWorkflowClient> {
    return getTemporalWorkflowClient();
  }

  function getEpicHandle(epicId: string): EpicHandleLike {
    const client = getTemporalClient();
    const handle = client.workflow.getHandle(
      buildEpicWorkflowId(input.projectId, epicId),
    );
    return asEpicHandle(handle);
  }

  async function ensureEpicHandle(epicId: string): Promise<EpicHandleLike> {
    const client = getTemporalClient();
    const handle = await ensureEpicWorkflowStarted(client, {
      projectId: input.projectId,
      epicId,
      title: epicId,
      narrative: "",
      initializedAt: new Date().toISOString(),
    });
    return asEpicHandle(handle);
  }

  async function queryEpicStateRead(
    handle: EpicHandleLike,
    ctx: TemporalReadContext,
  ): Promise<import("../../temporal/contracts").EpicWorkflowState> {
    const connection = getTemporalConnection(input);
    const read = await runTemporalRead(
      connection,
      async () => handle.query(getEpicStateQuery),
      ctx,
      { opType: "epicStateQuery", timeoutMs: 1_500 },
    );
    if (!read.complete) {
      throw read.error ?? new TemporalQueryTimeoutError(ctx.deadline.budgetMs);
    }
    const state = read.data;
    if (!isEpicWorkflowState(state)) {
      throw new Error("Epic workflow state query returned malformed state");
    }
    return state;
  }

  async function tryQueryEpicStateRead(
    handle: EpicHandleLike,
    ctx: TemporalReadContext,
  ): Promise<
    | {
        kind: "ok";
        state: import("../../temporal/contracts").EpicWorkflowState;
      }
    | { kind: "not_found" }
    | { kind: "unresponsive" }
  > {
    try {
      const state = await queryEpicStateRead(handle, ctx);
      return { kind: "ok", state };
    } catch (error) {
      if (isWorkflowNotFoundError(error)) return { kind: "not_found" };
      if (error instanceof TemporalQueryTimeoutError)
        return { kind: "unresponsive" };
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
    const handle = getEpicHandle(epicId);
    const result = await tryQueryEpicStateRead(handle, ctx);
    if (result.kind === "ok") return { kind: "ok", epic: result.state.epic };
    return result;
  }

  async function assertEpicExists(epicId: string): Promise<Epic> {
    const ctx = createTemporalReadContext();
    const result = await queryEpic(epicId, ctx);
    if (result.kind === "ok") return result.epic;
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

  function withEpicRecovery(
    epic: Epic,
    reason: "workflow_unresponsive",
  ): Epic & {
    _recovery: { mode: "temporal_query_fallback"; reason: typeof reason };
  } {
    return {
      ...epic,
      _recovery: { mode: "temporal_query_fallback", reason },
    };
  }

  async function loadDiskEpicProjection(epicId: string): Promise<Epic | null> {
    const retired = await loadRetiredEpicProjection(
      deps.legacy?.paths?.retiredEpics,
      epicId,
    );
    if (!retired.success || !retired.data) return null;
    return retired.data.epic_snapshot;
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

      return epic;
    },

    get: async (epicId) => {
      const ctx = createTemporalReadContext();

      // Disk-first: the retired projection is the only durable epic read model
      // the store currently writes. When present, treat it as authoritative and
      // use the workflow query only as enrichment.
      const diskEpic = await loadDiskEpicProjection(epicId);

      try {
        const result = await queryEpic(epicId, ctx);
        if (result.kind === "ok") {
          return { success: true, data: result.epic, source: "workflow" };
        }
        if (result.kind === "unresponsive") {
          if (diskEpic) {
            return {
              success: true,
              data: withEpicRecovery(diskEpic, "workflow_unresponsive"),
              source: "retired_projection",
            };
          }
          // No disk projection to fall back to; degrade gracefully rather than
          // hanging. The caller sees a null epic but the tool returns.
          return { success: true, data: null };
        }
        // not_found: fall through to retired-projection lookup below.
      } catch (err) {
        const typed = extractMutationRejection(err);
        if (typed.code !== "epic_not_found") {
          return {
            success: false,
            error: typed.message,
            type: "read_error",
          };
        }
        // not_found: fall through to retired-projection lookup below.
      }

      if (diskEpic) {
        return {
          success: true,
          data: diskEpic,
          source: "retired_projection",
        };
      }
      return { success: true, data: null };
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
      const state = await tryQueryEpicState(handle);
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

      return projection;
    },

    list: async (filter?: { status?: "active" | "all" }) => {
      const client =
        getTemporalClient() as unknown as import("../../temporal/list-epic-workflows").ListEpicClient;
      const status = filter?.status ?? "active";
      const ids = await listEpicWorkflowIds(client, {
        projectId: input.projectId,
        status,
      });
      const ctx = createTemporalReadContext();
      const epics: Epic[] = [];
      for (const id of ids) {
        try {
          const result = await queryEpic(id, ctx);
          if (result.kind === "ok") epics.push(result.epic);
        } catch (err) {
          logger.debug(
            `[list] query failed for epic ${id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
      const filtered =
        status === "active"
          ? epics.filter((epic) => epic.progress.status === "active")
          : epics;
      filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return filtered;
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

      return await queryEpicFresh(epicId);
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

      return await queryEpicFresh(epicId);
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

      return await queryEpicFresh(epicId);
    },

    addShell: async (
      epicId,
      { entryId, title, successHint, order, importedFrom, blockedBy },
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

      const epic = await queryEpicFresh(epicId);
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

      const epic = await queryEpicFresh(epicId);
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

      const epic = await queryEpicFresh(epicId);
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

      const epic = await queryEpicFresh(epicId);
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

      const epic = await queryEpicFresh(epicId);
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

      return await queryEpicFresh(epicId);
    },

    repairIndex: async ({ evidence, dryRun }) => {
      const client =
        getTemporalClient() as unknown as import("../../temporal/list-epic-workflows").ListEpicClient;
      const ids = await listEpicWorkflowIds(client, {
        projectId: input.projectId,
        status: "running",
      });

      const refreshedAt = new Date().toISOString();
      const report: Awaited<
        ReturnType<Store["epics"]["repairIndex"]>
      >["epics"] = [];
      let refreshed = 0;
      let unverified = 0;
      let skipped = 0;
      let unreachable = 0;

      for (const epicId of ids) {
        const handle = getEpicHandle(epicId);
        let state: import("../../temporal/contracts").EpicWorkflowState | null;
        try {
          state = await tryQueryEpicState(handle);
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

        if (dryRun) {
          report.push({
            epic_id: epicId,
            status,
            action: "would_refresh",
          });
          continue;
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
              action: "refreshed",
            });
          } else {
            unverified += 1;
            report.push({
              epic_id: epicId,
              status,
              action: "unverified",
              error: verification.error,
            });
          }
        } catch (err) {
          const typed = extractMutationRejection(err);
          skipped += 1;
          report.push({
            epic_id: epicId,
            status,
            action: "skipped",
            error: typed.message,
          });
        }
      }

      return {
        total: ids.length,
        refreshed,
        unverified,
        skipped,
        unreachable,
        epics: report,
      };
    },
  };
}
