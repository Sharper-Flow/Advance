import type { Store } from "../store-types";
import type { Epic } from "../../types";
import { ensureEpicWorkflowStarted } from "../../temporal/workflow-start";
import {
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
} from "../../temporal/messages";
import { runTemporal, runTemporalQuery, type StoreDeps } from "./shared";

interface EpicHandleLike {
  query: (definition: unknown, ...args: unknown[]) => Promise<unknown>;
  signal: (definition: unknown, ...args: unknown[]) => Promise<void>;
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
    | "retarget_source_mismatch"
    | "retarget_duplicate_target"
    | "temporal_unavailable"
    | "signal_rejected";
  message: string;
  rejection?: { signalName: string; errorMessage: string };
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
      searchAttributesEnabled: false,
    });
    return asEpicHandle(handle);
  }

  async function queryEpic(epicId: string): Promise<Epic | null> {
    const handle = getEpicHandle(epicId);
    const state = await tryQueryEpicState(handle);
    return state?.epic ?? null;
  }

  async function assertEpicExists(epicId: string): Promise<Epic> {
    const epic = await queryEpic(epicId);
    if (!epic) {
      throw Object.assign(new Error(`Epic not found: ${epicId}`), {
        code: "epic_not_found",
      });
    }
    return epic;
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
      try {
        const epic = await queryEpic(epicId);
        if (!epic) return { success: true, data: null };
        return { success: true, data: epic };
      } catch (err) {
        const typed = extractMutationRejection(err);
        if (typed.code === "epic_not_found") {
          return { success: true, data: null };
        }
        return {
          success: false,
          error: typed.message,
          type: "read_error",
        };
      }
    },

    list: async () => {
      const client =
        getTemporalClient() as unknown as import("../../temporal/list-epic-workflows").ListEpicClient;
      const ids = await listEpicWorkflowIds(client, {
        projectId: input.projectId,
      });
      const epics: Epic[] = [];
      for (const id of ids) {
        try {
          const epic = await queryEpic(id);
          if (epic) epics.push(epic);
        } catch (err) {
          logger.debug(
            `[list] query failed for epic ${id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
      epics.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return epics;
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

      const updated = await queryEpic(epicId);
      if (!updated) {
        throw new Error(`Epic disappeared during update: ${epicId}`);
      }
      return updated;
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

      const updated = await queryEpic(epicId);
      if (!updated) {
        throw new Error(`Epic disappeared during scope update: ${epicId}`);
      }
      return updated;
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

      const updated = await queryEpic(epicId);
      if (!updated) {
        throw new Error(
          `Epic disappeared during merge finalization: ${epicId}`,
        );
      }
      return updated;
    },

    addShell: async (epicId, { entryId, title, successHint, order }) => {
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

      const epic = await queryEpic(epicId);
      const entry = epic?.entries.find((e) => e.entry_id === finalEntryId);
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

      const epic = await queryEpic(epicId);
      const entry = epic?.entries.find((e) => e.entry_id === finalEntryId);
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

      const epic = await queryEpic(epicId);
      const entry = epic?.entries.find((e) => e.entry_id === entryId);
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

      const epic = await queryEpic(epicId);
      const entry = epic?.entries.find((e) => e.entry_id === entryId);
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

      const epic = await queryEpic(epicId);
      const entry = epic?.entries.find((e) => e.entry_id === entryId);
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

      const updated = await queryEpic(epicId);
      if (!updated) {
        throw new Error(`Epic disappeared during reorder: ${epicId}`);
      }
      return updated;
    },
  };
}
