/**
 * Backlog Shell Tools
 *
 * MCP surface for the repo backlog: add, list, show, promote, archive.
 *
 * Spec citations:
 *   rq-backlogDurability01, rq-backlogFormat01, rq-backlogLifecycle01,
 *   rq-backlogPromotion01, rq-backlogArchive01, rq-backlogConcurrency01 —
 *   typed MCP wrappers around the JSONL store.
 */

import { z } from "zod";
import { formatToolOutput } from "../utils/tool-output";
import type { Store } from "../storage/store-types";
import {
  addBacklogItem,
  archiveBacklogItem,
  getBacklogItem,
  promoteBacklogItem,
  readBacklog,
  BacklogError,
} from "../utils/backlog-store";
import {
  assertPacketSize,
  parsePacket,
} from "../utils/context-packet-validation";

// =============================================================================
// Helpers
// =============================================================================

function backlogErrorResponse(err: unknown) {
  if (err instanceof BacklogError) {
    return formatToolOutput({
      success: false,
      error: err.message,
      code: err.code,
    });
  }
  const message = err instanceof Error ? err.message : String(err);
  return formatToolOutput({ success: false, error: message });
}

function validateContextPacket(input: unknown) {
  try {
    const packet = parsePacket(input);
    assertPacketSize(packet);
    return { ok: true as const, packet };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err instanceof Error && err.name === "ContextPacketTooLargeError"
        ? "context_packet_too_large"
        : "invalid_context_packet";
    return { ok: false as const, error: message, code };
  }
}

function formatBacklogItem(item: import("../types/backlog").BacklogItem) {
  return {
    id: item.id,
    title: item.title,
    success_hint: item.success_hint,
    status: item.status,
    created_at: item.created_at,
    updated_at: item.updated_at,
    archived_at: item.archived_at,
    promoted_to: item.promoted_to,
    context_packet: item.context_packet,
  };
}

// =============================================================================
// Tool Definitions
// =============================================================================

export const backlogShellTools = {
  adv_backlog_add: {
    description:
      "Add a new item to the repo backlog. Generates a stable id if omitted. Reactivates an archived item when the same id is reused.",
    args: {
      title: z.string().min(1).describe("Item title displayed in backlog."),
      success_hint: z
        .string()
        .min(1)
        .describe("Rough success/AC hint used during promotion and planning."),
      id: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Optional stable backlog item id; auto-generated if omitted.",
        ),
      context_packet: z
        .unknown()
        .optional()
        .describe(
          "Optional durable future-work context packet. Validated and persisted on the backlog item.",
        ),
    },
    execute: async (
      {
        title,
        success_hint,
        id,
        context_packet,
      }: {
        title: string;
        success_hint: string;
        id?: string;
        context_packet?: unknown;
      },
      store: Store,
    ) => {
      try {
        let validatedPacket:
          | import("../types/future-work").FutureWorkContextPacket
          | undefined;
        if (context_packet !== undefined) {
          const validation = validateContextPacket(context_packet);
          if (!validation.ok) {
            return formatToolOutput({
              success: false,
              error: validation.error,
              code: validation.code,
            });
          }
          validatedPacket = validation.packet;
        }
        const item = await addBacklogItem(store.paths.root, {
          id,
          title,
          success_hint,
          ...(validatedPacket !== undefined
            ? { context_packet: validatedPacket }
            : {}),
        });
        return formatToolOutput({
          success: true,
          item: formatBacklogItem(item),
        });
      } catch (err) {
        return backlogErrorResponse(err);
      }
    },
  },

  adv_backlog_list: {
    description:
      "List repo backlog items. Default returns active items. For files larger than 1MB, only the most recent 1000 item lines are read.",
    args: {
      include_archived: z
        .boolean()
        .optional()
        .describe("Include archived items in the result."),
      tail_limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Override the default 1000-line tail limit for large files."),
    },
    execute: async (
      {
        include_archived,
        tail_limit,
      }: { include_archived?: boolean; tail_limit?: number },
      store: Store,
    ) => {
      try {
        const result = await readBacklog(store.paths.root, {
          includeArchived: include_archived,
          tailLimit: tail_limit,
        });
        return formatToolOutput({
          success: true,
          schema_version: result.header.schemaVersion,
          count: result.latestItems.length,
          items: result.latestItems.map(formatBacklogItem),
          malformed_lines: result.malformed,
        });
      } catch (err) {
        return backlogErrorResponse(err);
      }
    },
  },

  adv_backlog_show: {
    description: "Show a single repo backlog item by id.",
    args: {
      id: z.string().min(1).describe("Backlog item id."),
      include_archived: z
        .boolean()
        .optional()
        .describe("Allow returning an archived item."),
    },
    execute: async (
      { id, include_archived }: { id: string; include_archived?: boolean },
      store: Store,
    ) => {
      try {
        const item = await getBacklogItem(
          store.paths.root,
          id,
          include_archived,
        );
        if (!item) {
          return formatToolOutput({
            success: false,
            error: `Backlog item not found: ${id}`,
            code: "not_found",
          });
        }
        return formatToolOutput({
          success: true,
          item: formatBacklogItem(item),
        });
      } catch (err) {
        return backlogErrorResponse(err);
      }
    },
  },

  adv_backlog_promote: {
    description:
      "Promote a repo backlog item to an ADV change or Epic shell entry. Idempotent on (itemId, targetId). Refuses promotion of archived items.",
    args: {
      id: z.string().min(1).describe("Backlog item id."),
      kind: z.enum(["change", "epic_shell"]).describe("Promotion target kind."),
      target_id: z
        .string()
        .min(1)
        .describe("Target id (change id or Epic shell entry id)."),
    },
    execute: async (
      {
        id,
        kind,
        target_id,
      }: { id: string; kind: "change" | "epic_shell"; target_id: string },
      store: Store,
    ) => {
      try {
        const item = await promoteBacklogItem(store.paths.root, {
          id,
          kind,
          targetId: target_id,
        });
        return formatToolOutput({
          success: true,
          item: formatBacklogItem(item),
        });
      } catch (err) {
        return backlogErrorResponse(err);
      }
    },
  },

  adv_backlog_archive: {
    description: "Soft-delete a repo backlog item by archiving it.",
    args: {
      id: z.string().min(1).describe("Backlog item id."),
    },
    execute: async ({ id }: { id: string }, store: Store) => {
      try {
        const item = await archiveBacklogItem(store.paths.root, id);
        if (!item) {
          return formatToolOutput({
            success: false,
            error: `Backlog item not found: ${id}`,
            code: "not_found",
          });
        }
        return formatToolOutput({
          success: true,
          item: formatBacklogItem(item),
        });
      } catch (err) {
        return backlogErrorResponse(err);
      }
    },
  },
};
