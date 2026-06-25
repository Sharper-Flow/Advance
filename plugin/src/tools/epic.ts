/**
 * Epic Tools
 *
 * MCP tools for Advance Epics: create, show, list, update, reorder,
 * add shell, promote shell, link/unlink change.
 *
 * Epic order is advisory — tools warn but never hard-block.
 */

import { z } from "zod";
import type { Store } from "../storage/store-types";
import type { EpicEntry } from "../types";
import { formatToolOutput, paginate } from "../utils/tool-output";

const EPIC_ID_SCHEMA = z
  .string()
  .min(1)
  .describe("Epic ID using ADV change naming convention (camelCase title).");

function epicNotFound(epicId: string) {
  return formatToolOutput({
    error: `Epic not found: ${epicId}`,
    code: "EPIC_NOT_FOUND",
  });
}

function epicError(err: unknown) {
  const code =
    err instanceof Error
      ? ((err as { code?: string }).code ?? "EPIC_ERROR")
      : "EPIC_ERROR";
  const message = err instanceof Error ? err.message : String(err);
  return formatToolOutput({ error: message, code });
}

function mapEpicEntry(entry: EpicEntry) {
  return {
    entry_id: entry.entry_id,
    kind: entry.kind,
    order: entry.order,
    ...(entry.kind === "shell"
      ? {
          title: entry.title,
          success_hint: entry.success_hint,
        }
      : {
          change_id: entry.change_id,
          promotion: entry.promotion,
          terminal_summary: entry.terminal_summary,
        }),
  };
}

function formatEpic(epic: import("../types").Epic) {
  return {
    id: epic.id,
    title: epic.title,
    narrative: epic.narrative,
    version: epic.version,
    status: epic.progress.status,
    progress: {
      total_entries: epic.progress.total_entries,
      completed_entries: epic.progress.completed_entries,
      active_entries: epic.progress.active_entries,
      next_entry_id: epic.progress.next_entry_id,
    },
    entries: epic.entries.map(mapEpicEntry),
    created_at: epic.created_at,
    updated_at: epic.updated_at,
  };
}

async function loadEpic(store: Store, epicId: string) {
  const result = await store.epics.get(epicId);
  if (!result.success || !result.data) return null;
  return result.data;
}

export const epicTools = {
  adv_epic_create: {
    description:
      "Create a new Advance Epic. Epics are durable initiative containers that group ADV changes and lightweight shell entries. Epic order is advisory.",
    args: {
      epic_id: EPIC_ID_SCHEMA,
      title: z.string().min(1).describe("Human-readable Epic title."),
      narrative: z
        .string()
        .min(1)
        .describe("Narrative context describing the initiative goal."),
    },
    execute: async (
      {
        epic_id,
        title,
        narrative,
      }: { epic_id: string; title: string; narrative: string },
      store: Store,
    ) => {
      try {
        const epic = await store.epics.create(epic_id, title, narrative);
        return formatToolOutput({ success: true, epic: formatEpic(epic) });
      } catch (err) {
        return epicError(err);
      }
    },
  },

  adv_epic_show: {
    description:
      "Show an Epic's current state, including roadmap entries and compact progress summary.",
    args: {
      epic_id: EPIC_ID_SCHEMA,
    },
    execute: async ({ epic_id }: { epic_id: string }, store: Store) => {
      try {
        const epic = await loadEpic(store, epic_id);
        if (!epic) return epicNotFound(epic_id);
        return formatToolOutput({ success: true, epic: formatEpic(epic) });
      } catch (err) {
        return epicError(err);
      }
    },
  },

  adv_epic_list: {
    description: "List all active Epics for the project.",
    args: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Max Epics to return (default 50)."),
      offset: z.number().int().min(0).optional().describe("Pagination offset."),
    },
    execute: async (
      { limit, offset }: { limit?: number; offset?: number },
      store: Store,
    ) => {
      try {
        const epics = await store.epics.list();
        const { items, pagination } = paginate(epics, {
          limit,
          offset,
          tool: "adv_epic_list",
        });
        return formatToolOutput({
          success: true,
          epics: items.map(formatEpic),
          pagination,
        });
      } catch (err) {
        return epicError(err);
      }
    },
  },

  adv_epic_update: {
    description:
      "Update an Epic's title or narrative. Requires expected_version for optimistic-concurrency control.",
    args: {
      epic_id: EPIC_ID_SCHEMA,
      title: z.string().min(1).optional(),
      narrative: z.string().min(1).optional(),
      expected_version: z
        .number()
        .int()
        .min(0)
        .describe("Current Epic version from adv_epic_show."),
    },
    execute: async (
      {
        epic_id,
        title,
        narrative,
        expected_version,
      }: {
        epic_id: string;
        title?: string;
        narrative?: string;
        expected_version: number;
      },
      store: Store,
    ) => {
      if (title === undefined && narrative === undefined) {
        return formatToolOutput({
          error: "At least one of title or narrative must be provided.",
        });
      }
      try {
        const epic = await store.epics.update(epic_id, {
          title,
          narrative,
          expectedVersion: expected_version,
        });
        return formatToolOutput({ success: true, epic: formatEpic(epic) });
      } catch (err) {
        return epicError(err);
      }
    },
  },

  adv_epic_add_shell: {
    description:
      "Add a lightweight shell entry to an Epic roadmap. Shells represent future work and carry a title + success hint for later promotion.",
    args: {
      epic_id: EPIC_ID_SCHEMA,
      title: z.string().min(1).describe("Shell title displayed in roadmap."),
      success_hint: z
        .string()
        .min(1)
        .describe("Rough success/AC hint used during promotion and planning."),
      entry_id: z
        .string()
        .min(1)
        .optional()
        .describe("Optional stable entry ID; auto-generated if omitted."),
      order: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          "Advisory display order; assigned next available if omitted.",
        ),
    },
    execute: async (
      {
        epic_id,
        title,
        success_hint,
        entry_id,
        order,
      }: {
        epic_id: string;
        title: string;
        success_hint: string;
        entry_id?: string;
        order?: number;
      },
      store: Store,
    ) => {
      try {
        const entry = await store.epics.addShell(epic_id, {
          entryId: entry_id,
          title,
          successHint: success_hint,
          order,
        });
        return formatToolOutput({
          success: true,
          entry: mapEpicEntry(entry),
        });
      } catch (err) {
        return epicError(err);
      }
    },
  },

  adv_epic_promote_shell: {
    description:
      "Promote an Epic shell entry into a linked ADV change. Replaces the shell row in-place with a change row carrying promotion provenance. Idempotent by shell entry + change ID.",
    args: {
      epic_id: EPIC_ID_SCHEMA,
      entry_id: z.string().min(1).describe("Shell entry ID to promote."),
      change_id: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Existing change ID to link. If omitted, a new change is created from the shell title/success hint.",
        ),
      promoted_by: z
        .string()
        .min(1)
        .optional()
        .describe("Identity performing the promotion (defaults to 'agent')."),
    },
    execute: async (
      {
        epic_id,
        entry_id,
        change_id,
        promoted_by,
      }: {
        epic_id: string;
        entry_id: string;
        change_id?: string;
        promoted_by?: string;
      },
      store: Store,
    ) => {
      try {
        const epic = await loadEpic(store, epic_id);
        if (!epic) return epicNotFound(epic_id);

        const shell = epic.entries.find(
          (e) => e.entry_id === entry_id && e.kind === "shell",
        );
        if (!shell || shell.kind !== "shell") {
          return formatToolOutput({
            error: `Shell entry not found: ${entry_id}`,
            code: "SHELL_NOT_FOUND",
          });
        }

        let finalChangeId = change_id;
        if (!finalChangeId) {
          const proposal = `# ${shell.title}\n\n## Intent\n\n${shell.success_hint}\n\n## Scope\n\n- Promoted from Epic ${epic_id} shell ${entry_id}.\n`;
          const problemStatement = `## Problem\n\n${shell.title}\n\n## Success Criteria\n\n${shell.success_hint}\n`;
          const createResult = await store.changes.create(shell.title, {
            artifacts: { proposal, problemStatement },
            initialMetadata: {
              epic_membership: {
                epic_id: epic_id,
                entry_id,
                order: shell.order,
                title: shell.title,
                linked_at: new Date().toISOString(),
              },
            },
          });
          finalChangeId = createResult.changeId;
        }

        await store.epics.promoteShell(
          epic_id,
          entry_id,
          finalChangeId,
          promoted_by ?? "agent",
        );

        return formatToolOutput({
          success: true,
          entry_id,
          change_id: finalChangeId,
          promoted: true,
          note: `Shell '${shell.title}' promoted to change ${finalChangeId}.`,
        });
      } catch (err) {
        return epicError(err);
      }
    },
  },

  adv_epic_link_change: {
    description: "Link an existing ADV change as a new Epic entry.",
    args: {
      epic_id: EPIC_ID_SCHEMA,
      change_id: z.string().min(1).describe("Existing ADV change ID to link."),
      title: z.string().min(1).describe("Display title for the entry."),
      entry_id: z.string().min(1).optional(),
      order: z.number().int().min(0).optional(),
    },
    execute: async (
      {
        epic_id,
        change_id,
        title,
        entry_id,
        order,
      }: {
        epic_id: string;
        change_id: string;
        title: string;
        entry_id?: string;
        order?: number;
      },
      store: Store,
    ) => {
      try {
        const entry = await store.epics.linkChange(epic_id, {
          entryId: entry_id,
          changeId: change_id,
          title,
          order,
        });
        return formatToolOutput({
          success: true,
          entry: mapEpicEntry(entry),
        });
      } catch (err) {
        return epicError(err);
      }
    },
  },

  adv_epic_unlink_change: {
    description: "Unlink a change entry from an Epic. The entry is removed.",
    args: {
      epic_id: EPIC_ID_SCHEMA,
      entry_id: z.string().min(1).describe("Entry ID to unlink."),
    },
    execute: async (
      { epic_id, entry_id }: { epic_id: string; entry_id: string },
      store: Store,
    ) => {
      try {
        await store.epics.unlinkChange(epic_id, entry_id);
        return formatToolOutput({
          success: true,
          entry_id,
          unlinked: true,
        });
      } catch (err) {
        return epicError(err);
      }
    },
  },

  adv_epic_reorder: {
    description:
      "Reorder Epic entries. order values become advisory display indices. Requires expected_version for optimistic-concurrency control.",
    args: {
      epic_id: EPIC_ID_SCHEMA,
      entry_ids: z
        .array(z.string().min(1))
        .min(1)
        .describe("Entry IDs in desired order. Must include all entries."),
      expected_version: z.number().int().min(0),
    },
    execute: async (
      {
        epic_id,
        entry_ids,
        expected_version,
      }: {
        epic_id: string;
        entry_ids: string[];
        expected_version: number;
      },
      store: Store,
    ) => {
      try {
        const epic = await store.epics.reorder(
          epic_id,
          entry_ids,
          expected_version,
        );
        return formatToolOutput({ success: true, epic: formatEpic(epic) });
      } catch (err) {
        return epicError(err);
      }
    },
  },
};
