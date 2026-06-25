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
import {
  appendTargetProjectContextOutput,
  targetPathSchema,
  withTargetPathStore,
} from "./target-project";

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
          change_ref: entry.change_ref,
          title: entry.title,
          membership_status: entry.membership_status,
          linked_at: entry.linked_at,
          linked_by: entry.linked_by,
          link_evidence: entry.link_evidence,
          promotion: entry.promotion,
          terminal_summary: entry.terminal_summary,
        }),
  };
}

function getEpicEntryChangeId(entry: Extract<EpicEntry, { kind: "change" }>) {
  return entry.change_id ?? entry.change_ref?.change_id;
}

const COMPACT_HISTORY_LIMIT = 5;
const COMPACT_NEXT_WORK_LIMIT = 3;

type CompactNextWorkEntry =
  | { entry_id: string; kind: "shell"; title: string; status: "future" }
  | { entry_id: string; kind: "change"; change_id: string; status: "active" };

function formatEpicCompact(epic: import("../types").Epic) {
  const terminalEntries = epic.entries.filter(
    (
      entry,
    ): entry is import("../types").EpicEntry & {
      kind: "change";
      terminal_summary: { status: "archived" | "closed"; completed_at: string };
    } => entry.kind === "change" && entry.terminal_summary != null,
  );

  const history = terminalEntries
    .sort((a, b) => a.order - b.order)
    .slice(0, COMPACT_HISTORY_LIMIT)
    .map((entry) => ({
      entry_id: entry.entry_id,
      kind: entry.kind,
      change_id: getEpicEntryChangeId(entry),
      status: entry.terminal_summary.status,
      completed_at: entry.terminal_summary.completed_at,
    }));

  let next_work: CompactNextWorkEntry[] = [];
  if (epic.progress.next_entry_id) {
    const startIndex = epic.entries.findIndex(
      (entry) => entry.entry_id === epic.progress.next_entry_id,
    );
    const candidates =
      startIndex >= 0 ? epic.entries.slice(startIndex) : epic.entries;
    next_work = candidates
      .filter(
        (entry) =>
          entry.kind === "shell" ||
          (entry.kind === "change" && entry.terminal_summary == null),
      )
      .slice(0, COMPACT_NEXT_WORK_LIMIT)
      .flatMap<CompactNextWorkEntry>((entry) => {
        if (entry.kind === "shell") {
          return [
            {
              entry_id: entry.entry_id,
              kind: "shell" as const,
              title: entry.title,
              status: "future" as const,
            },
          ];
        }
        const changeId = getEpicEntryChangeId(entry);
        if (!changeId) return [];
        return [
          {
            entry_id: entry.entry_id,
            kind: "change" as const,
            change_id: changeId,
            status: "active" as const,
          },
        ];
      });
  }

  return {
    id: epic.id,
    title: epic.title,
    narrative: epic.narrative,
    epic_scope: epic.epic_scope,
    version: epic.version,
    status: epic.progress.status,
    progress: {
      total_entries: epic.progress.total_entries,
      completed_entries: epic.progress.completed_entries,
      active_entries: epic.progress.active_entries,
      next_entry_id: epic.progress.next_entry_id,
    },
    history,
    history_total: terminalEntries.length,
    next_work,
    created_at: epic.created_at,
    updated_at: epic.updated_at,
  };
}

function formatEpic(epic: import("../types").Epic) {
  return {
    id: epic.id,
    title: epic.title,
    narrative: epic.narrative,
    epic_scope: epic.epic_scope,
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

async function loadChange(store: Store, changeId: string) {
  const result = await store.changes.get(changeId);
  if (!result.success || !result.data) return null;
  return result.data;
}

async function resolveChildStore(
  store: Store,
  args: {
    target_path?: string;
    target_confirmed?: true;
    confirmationEvidence?: string;
  },
) {
  if (!args.target_path) return { context: null, store };
  return withTargetPathStore(
    {
      currentProjectPath: store.paths.root,
      target_path: args.target_path,
      stateRequirement: "temporal-required",
      target_confirmed: args.target_confirmed,
      confirmationEvidence: args.confirmationEvidence,
    },
    async ({ context, store: targetStore }) => ({
      context,
      store: targetStore,
    }),
  );
}

function maybeAppendTargetContext(
  output: string,
  context: Awaited<ReturnType<typeof resolveChildStore>>["context"],
) {
  return context ? appendTargetProjectContextOutput(output, context) : output;
}

function changeAlreadyInEpic(change: import("../types").Change) {
  return formatToolOutput({
    error: `Change already belongs to Epic ${change.epic_membership?.epic_id}`,
    code: "CHANGE_ALREADY_IN_EPIC",
    current_membership: change.epic_membership,
  });
}

function findChangeEntry(
  epic: import("../types").Epic,
  input: { entryId?: string; changeId?: string },
) {
  return epic.entries.find((entry) => {
    if (entry.kind !== "change") return false;
    if (input.entryId && entry.entry_id === input.entryId) return true;
    if (input.changeId && getEpicEntryChangeId(entry) === input.changeId) {
      return true;
    }
    return false;
  }) as Extract<EpicEntry, { kind: "change" }> | undefined;
}

function requireChangeEntry(
  entry: EpicEntry,
): Extract<EpicEntry, { kind: "change" }> {
  if (entry.kind !== "change") {
    throw Object.assign(
      new Error(`Expected change entry, received ${entry.kind}`),
      {
        code: "ENTRY_NOT_FOUND",
      },
    );
  }
  return entry;
}

function membershipFromChangeEntry(
  epicId: string,
  entry: Extract<EpicEntry, { kind: "change" }>,
  fallbackTitle: string,
  source: NonNullable<import("../types").Change["epic_membership"]>["source"],
) {
  const membership: NonNullable<import("../types").Change["epic_membership"]> =
    {
      epic_id: epicId,
      entry_id: entry.entry_id,
      order: entry.order,
      title: entry.title ?? fallbackTitle,
      linked_at: entry.linked_at ?? new Date().toISOString(),
      source,
    };
  if (entry.change_ref?.project_id) {
    membership.epic_project_id = entry.change_ref.project_id;
  }
  if (entry.change_ref?.repo_id) {
    membership.repo_id = entry.change_ref.repo_id;
  }
  return membership;
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
      scope_kind: z.enum(["repo", "product"]).optional(),
      owner_project_id: z.string().min(1).optional(),
      owner_repo_id: z.string().min(1).optional(),
      scope_repos: z
        .array(
          z.object({
            repo_id: z.string().min(1),
            repo_project_id: z.string().min(1),
            path: z.string().optional(),
            role: z.enum(["primary", "secondary"]),
            required: z.boolean(),
          }),
        )
        .optional(),
    },
    execute: async (
      {
        epic_id,
        title,
        narrative,
        scope_kind,
        owner_project_id,
        owner_repo_id,
        scope_repos,
      }: {
        epic_id: string;
        title: string;
        narrative: string;
        scope_kind?: "repo" | "product";
        owner_project_id?: string;
        owner_repo_id?: string;
        scope_repos?: NonNullable<
          import("../types").Epic["epic_scope"]
        >["repos"];
      },
      store: Store,
    ) => {
      try {
        const epicScope = scope_kind
          ? {
              kind: scope_kind,
              owner_project_id:
                owner_project_id ?? store.productContext?.repoProjectId ?? "",
              ...(owner_repo_id ? { owner_repo_id } : {}),
              repos: scope_repos ?? [],
            }
          : undefined;
        if (epicScope && !epicScope.owner_project_id) {
          return formatToolOutput({
            error: "owner_project_id is required when scope_kind is provided.",
            code: "TARGET_CONFIRMATION_REQUIRED",
          });
        }
        const epic = epicScope
          ? await store.epics.create(epic_id, title, narrative, { epicScope })
          : await store.epics.create(epic_id, title, narrative);
        return formatToolOutput({ success: true, epic: formatEpic(epic) });
      } catch (err) {
        return epicError(err);
      }
    },
  },

  adv_epic_show: {
    description:
      'Show an Epic\'s current state. Default `view: "compact"` returns a bounded summary with archived/closed history and next active/future work; use `view: "full"` for complete entries.',
    args: {
      epic_id: EPIC_ID_SCHEMA,
      view: z
        .enum(["compact", "full"])
        .optional()
        .default("compact")
        .describe(
          'Rendering view: "compact" (default, bounded) or "full" (complete entry list).',
        ),
    },
    execute: async (
      { epic_id, view }: { epic_id: string; view?: "compact" | "full" },
      store: Store,
    ) => {
      try {
        const epic = await loadEpic(store, epic_id);
        if (!epic) return epicNotFound(epic_id);
        const rendered =
          view === "full" ? formatEpic(epic) : formatEpicCompact(epic);
        return formatToolOutput({ success: true, epic: rendered });
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
    description:
      "Link an existing same-project ADV change as a new Epic entry and project compact epic_membership onto the child change.",
    args: {
      epic_id: EPIC_ID_SCHEMA,
      change_id: z.string().min(1).describe("Existing ADV change ID to link."),
      title: z
        .string()
        .min(1)
        .optional()
        .describe("Display title for the entry. Defaults to the change title."),
      entry_id: z.string().min(1).optional(),
      order: z.number().int().min(0).optional(),
      repo_id: z.string().min(1).optional(),
      linked_by: z.string().min(1).optional(),
      link_evidence: z
        .string()
        .min(1)
        .describe(
          "Audit evidence for linking this existing change into the Epic.",
        ),
      target_path: targetPathSchema.shape.target_path,
      target_confirmed: targetPathSchema.shape.target_confirmed,
      confirmationEvidence: targetPathSchema.shape.confirmationEvidence,
    },
    execute: async (
      {
        epic_id,
        change_id,
        title,
        entry_id,
        order,
        repo_id,
        linked_by,
        link_evidence,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        epic_id: string;
        change_id: string;
        title?: string;
        entry_id?: string;
        order?: number;
        repo_id?: string;
        linked_by?: string;
        link_evidence: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      try {
        const childStore = await resolveChildStore(store, {
          target_path,
          target_confirmed,
          confirmationEvidence,
        });
        const change = await loadChange(childStore.store, change_id);
        if (!change) {
          return formatToolOutput({
            error: `Change not found: ${change_id}`,
            code: "CHANGE_NOT_FOUND",
          });
        }
        if (change.epic_membership) return changeAlreadyInEpic(change);

        const entry = requireChangeEntry(
          await store.epics.linkChange(epic_id, {
            entryId: entry_id,
            changeId: change_id,
            title: title ?? change.title,
            order,
            linkedBy: linked_by ?? "agent",
            linkEvidence: link_evidence,
            changeProjectId: childStore.context?.projectId,
            repoId: repo_id,
            targetPath: childStore.context?.root,
          }),
        );
        const membership = membershipFromChangeEntry(
          epic_id,
          entry,
          title ?? change.title,
          "link_existing",
        );
        await childStore.store.changes.setEpicMembership(change_id, {
          membership,
          setAt: membership.linked_at,
        });
        const output = formatToolOutput({
          success: true,
          entry: mapEpicEntry(entry),
          epic_membership: membership,
        });
        return maybeAppendTargetContext(output, childStore.context);
      } catch (err) {
        return epicError(err);
      }
    },
  },

  adv_epic_unlink_change: {
    description:
      "Unlink a same-project change entry from an Epic after clearing the child epic_membership projection.",
    args: {
      epic_id: EPIC_ID_SCHEMA,
      entry_id: z.string().min(1).optional().describe("Entry ID to unlink."),
      change_id: z
        .string()
        .min(1)
        .optional()
        .describe("Change ID to unlink when entry_id is omitted."),
      unlink_evidence: z
        .string()
        .min(1)
        .describe("Audit evidence for unlinking this change from the Epic."),
      target_path: targetPathSchema.shape.target_path,
      target_confirmed: targetPathSchema.shape.target_confirmed,
      confirmationEvidence: targetPathSchema.shape.confirmationEvidence,
    },
    execute: async (
      {
        epic_id,
        entry_id,
        change_id,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        epic_id: string;
        entry_id?: string;
        change_id?: string;
        unlink_evidence: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      try {
        const epic = await loadEpic(store, epic_id);
        if (!epic) return epicNotFound(epic_id);
        const entry = findChangeEntry(epic, {
          entryId: entry_id,
          changeId: change_id,
        });
        if (!entry) {
          return formatToolOutput({
            error: `Entry not found in Epic ${epic_id}`,
            code: "ENTRY_NOT_FOUND",
          });
        }
        const finalChangeId = getEpicEntryChangeId(entry);
        if (!finalChangeId) {
          return formatToolOutput({
            error: `Entry has no change reference: ${entry.entry_id}`,
            code: "PROJECTION_MISSING",
          });
        }
        const childStore = await resolveChildStore(store, {
          target_path,
          target_confirmed,
          confirmationEvidence,
        });
        await childStore.store.changes.clearEpicMembership(finalChangeId, {
          expected: { epic_id, entry_id: entry.entry_id },
        });
        await store.epics.unlinkChange(epic_id, entry.entry_id);
        const output = formatToolOutput({
          success: true,
          entry_id: entry.entry_id,
          change_id: finalChangeId,
          unlinked: true,
        });
        return maybeAppendTargetContext(output, childStore.context);
      } catch (err) {
        return epicError(err);
      }
    },
  },

  adv_epic_move_change: {
    description:
      "Move a same-project change from one Epic to another, updating child epic_membership in between.",
    args: {
      from_epic_id: EPIC_ID_SCHEMA,
      to_epic_id: EPIC_ID_SCHEMA,
      change_id: z.string().min(1),
      from_entry_id: z.string().min(1).optional(),
      to_entry_id: z.string().min(1).optional(),
      order: z.number().int().min(0).optional(),
      repo_id: z.string().min(1).optional(),
      moved_by: z.string().min(1).optional(),
      move_evidence: z
        .string()
        .min(1)
        .describe("Audit evidence for moving the change between Epics."),
      target_path: targetPathSchema.shape.target_path,
      target_confirmed: targetPathSchema.shape.target_confirmed,
      confirmationEvidence: targetPathSchema.shape.confirmationEvidence,
    },
    execute: async (
      {
        from_epic_id,
        to_epic_id,
        change_id,
        from_entry_id,
        to_entry_id,
        order,
        repo_id,
        moved_by,
        move_evidence,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        from_epic_id: string;
        to_epic_id: string;
        change_id: string;
        from_entry_id?: string;
        to_entry_id?: string;
        order?: number;
        repo_id?: string;
        moved_by?: string;
        move_evidence: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      try {
        const fromEpic = await loadEpic(store, from_epic_id);
        if (!fromEpic) return epicNotFound(from_epic_id);
        const toEpic = await loadEpic(store, to_epic_id);
        if (!toEpic) return epicNotFound(to_epic_id);
        const sourceEntry = findChangeEntry(fromEpic, {
          entryId: from_entry_id,
          changeId: change_id,
        });
        if (!sourceEntry) {
          return formatToolOutput({
            error: `Source entry not found in Epic ${from_epic_id}`,
            code: "ENTRY_NOT_FOUND",
          });
        }
        const childStore = await resolveChildStore(store, {
          target_path,
          target_confirmed,
          confirmationEvidence,
        });
        const change = await loadChange(childStore.store, change_id);
        if (!change) {
          return formatToolOutput({
            error: `Change not found: ${change_id}`,
            code: "CHANGE_NOT_FOUND",
          });
        }
        if (
          !change.epic_membership ||
          change.epic_membership.epic_id !== from_epic_id ||
          change.epic_membership.entry_id !== sourceEntry.entry_id
        ) {
          return formatToolOutput({
            error: `Change projection does not match source Epic ${from_epic_id}`,
            code: "PROJECTION_MISMATCH",
            current_membership: change.epic_membership,
          });
        }
        const destEntry = requireChangeEntry(
          await store.epics.linkChange(to_epic_id, {
            entryId: to_entry_id,
            changeId: change_id,
            title: change.title,
            order,
            linkedBy: moved_by ?? "agent",
            linkEvidence: move_evidence,
            changeProjectId: childStore.context?.projectId,
            repoId: repo_id,
            targetPath: childStore.context?.root,
          }),
        );
        const membership = membershipFromChangeEntry(
          to_epic_id,
          destEntry,
          change.title,
          "move",
        );
        await childStore.store.changes.setEpicMembership(change_id, {
          expectedCurrent: {
            epic_id: from_epic_id,
            entry_id: sourceEntry.entry_id,
          },
          membership,
          setAt: membership.linked_at,
        });
        await store.epics.unlinkChange(from_epic_id, sourceEntry.entry_id);
        const output = formatToolOutput({
          success: true,
          from_entry_id: sourceEntry.entry_id,
          to_entry: mapEpicEntry(destEntry),
          epic_membership: membership,
          moved: true,
        });
        return maybeAppendTargetContext(output, childStore.context);
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
