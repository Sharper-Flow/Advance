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
import { deriveEpicScopeLabel } from "../types";
import type { EpicEntry, EpicMembershipStatus, EpicScope } from "../types";
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

const EpicToolScopeRepoSchema = z.object({
  repo_id: z.string().min(1),
  repo_project_id: z.string().min(1),
  path: z.string().min(1).optional(),
  role: z.enum(["primary", "secondary"]),
  required: z.boolean(),
});

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
          member_status: memberStatusForEntry(entry),
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
  | {
      entry_id: string;
      kind: "change";
      change_id: string;
      status: "active";
      member_status: ReturnType<typeof memberStatusForEntry>;
    };

function memberStatusForEntry(entry: Extract<EpicEntry, { kind: "change" }>) {
  const checkedAt = new Date().toISOString();
  const status = entry.membership_status;
  if (status === "linked" || status === "terminal") {
    return {
      status: "ok" as const,
      last_checked_at: checkedAt,
      message: "Child projection is linked.",
    };
  }
  if (status === "target_unreachable") {
    return {
      status: "target_unreachable" as const,
      last_checked_at: checkedAt,
      message:
        "Target project is unreachable; run repair after target recovers.",
    };
  }
  if (status === "projection_stale" || status === "unlinked") {
    return {
      status: "stale" as const,
      last_checked_at: checkedAt,
      message: "Child projection may be stale; run membership repair.",
    };
  }
  return {
    status: "projection_missing" as const,
    last_checked_at: checkedAt,
    message: "Child projection is pending or missing; run membership repair.",
  };
}

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
            member_status: memberStatusForEntry(entry),
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

function buildEpicScope(input: {
  ownerProjectId: string;
  ownerRepoId?: string;
  repos: EpicScope["repos"];
}): EpicScope {
  return {
    kind: input.repos.length > 1 ? "product" : "repo",
    owner_project_id: input.ownerProjectId,
    ...(input.ownerRepoId ? { owner_repo_id: input.ownerRepoId } : {}),
    repos: input.repos,
  };
}

function linkedEntriesForRemovedScopeRepos(
  epic: import("../types").Epic,
  nextRepos: EpicScope["repos"],
) {
  const currentRepos = epic.epic_scope?.repos ?? [];
  if (currentRepos.length === 0) return [];
  const nextRepoIds = new Set(nextRepos.map((repo) => repo.repo_id));
  const removedRepoIds = new Set(
    currentRepos
      .map((repo) => repo.repo_id)
      .filter((repoId) => !nextRepoIds.has(repoId)),
  );
  if (removedRepoIds.size === 0) return [];
  return epic.entries.filter(
    (entry) =>
      entry.kind === "change" &&
      entry.change_ref?.repo_id &&
      removedRepoIds.has(entry.change_ref.repo_id) &&
      entry.membership_status !== "unlinked",
  );
}

function terminalSummaryStatusForChange(
  status: string,
): "archived" | "closed" | null {
  return status === "archived" || status === "closed" ? status : null;
}

function terminalSummaryCompletedAt(
  change: Awaited<ReturnType<typeof loadChange>>,
) {
  return typeof change?.updated_at === "string"
    ? change.updated_at
    : new Date().toISOString();
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

async function clearMissingEpicProjection(
  store: Store,
  args: {
    epic_id: string;
    entry_id?: string;
    change_id?: string;
    target_path?: string;
    target_confirmed?: true;
    confirmationEvidence?: string;
    dryRun?: boolean;
  },
) {
  const missing = [
    ["entry_id", args.entry_id],
    ["change_id", args.change_id],
  ]
    .filter(([, value]) => !value)
    .map(([field]) => field);
  if (missing.length > 0) {
    return formatToolOutput({
      error:
        "clear_stale_projection for a missing Epic requires entry_id and change_id to identify the child projection safely.",
      code: "REPAIR_TARGET_REQUIRED",
      fields: missing,
    });
  }

  const childStore = await resolveChildStore(store, {
    target_path: args.target_path,
    target_confirmed: args.target_confirmed,
    confirmationEvidence: args.confirmationEvidence,
  });
  const finalChangeId = args.change_id as string;
  const entryId = args.entry_id as string;
  const change = await loadChange(childStore.store, finalChangeId);
  if (!change) {
    return formatToolOutput({
      error: `Change not found: ${finalChangeId}`,
      code: "CHANGE_NOT_FOUND",
    });
  }

  if (!change.epic_membership) {
    const output = formatToolOutput({
      success: true,
      repaired: false,
      entry_id: entryId,
      change_id: finalChangeId,
      member_status: {
        status: "projection_missing" as const,
        last_checked_at: new Date().toISOString(),
        message: "Child projection already absent.",
      },
    });
    return maybeAppendTargetContext(output, childStore.context);
  }

  if (
    change.epic_membership.epic_id !== args.epic_id ||
    change.epic_membership.entry_id !== entryId
  ) {
    return formatToolOutput({
      error: `Change projection does not match Epic ${args.epic_id}`,
      code: "PROJECTION_MISMATCH",
      current_membership: change.epic_membership,
    });
  }

  if (args.dryRun) {
    const output = formatToolOutput({
      success: true,
      dryRun: true,
      entry_id: entryId,
      change_id: finalChangeId,
      action: "clear_child_projection",
    });
    return maybeAppendTargetContext(output, childStore.context);
  }

  await childStore.store.changes.clearEpicMembership(finalChangeId, {
    expected: { epic_id: args.epic_id, entry_id: entryId },
  });
  const output = formatToolOutput({
    success: true,
    repaired: true,
    entry_id: entryId,
    change_id: finalChangeId,
    cleared: true,
  });
  return maybeAppendTargetContext(output, childStore.context);
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

const EpicRepairModeSchema = z.enum([
  "sync_child_projection",
  "clear_stale_projection",
  "mark_target_unreachable",
]);

const EpicMergeResolutionSchema = z.object({
  source_entry_id: z.string().min(1),
  action: z.enum(["skip"]),
  evidence: z.string().min(1).optional(),
});

type EpicMergeResolution = z.infer<typeof EpicMergeResolutionSchema>;

type ChangeEpicEntry = Extract<EpicEntry, { kind: "change" }>;
type ShellEpicEntry = Extract<EpicEntry, { kind: "shell" }>;

function buildEpicMergePlan(
  sourceEpic: import("../types").Epic,
  survivorEpic: import("../types").Epic,
) {
  const survivorChangeIds = new Map<string, ChangeEpicEntry>();
  const survivorEntryIds = new Set(survivorEpic.entries.map((e) => e.entry_id));
  for (const entry of survivorEpic.entries) {
    if (entry.kind !== "change") continue;
    const changeId = getEpicEntryChangeId(entry);
    if (changeId) survivorChangeIds.set(changeId, entry);
  }

  const uniqueChanges: ChangeEpicEntry[] = [];
  const uniqueShells: ShellEpicEntry[] = [];
  const conflicts: Array<{
    kind: "duplicate_change" | "duplicate_entry_id";
    source_entry_id: string;
    survivor_entry_id: string;
    change_id?: string;
  }> = [];
  const targetConfirmationsRequired: Array<{
    source_entry_id: string;
    change_id: string;
    target_path: string;
  }> = [];

  for (const entry of sourceEpic.entries) {
    if (entry.kind === "change") {
      const changeId = getEpicEntryChangeId(entry);
      if (!changeId) continue;
      const duplicate = survivorChangeIds.get(changeId);
      if (duplicate) {
        conflicts.push({
          kind: "duplicate_change",
          source_entry_id: entry.entry_id,
          survivor_entry_id: duplicate.entry_id,
          change_id: changeId,
        });
        continue;
      }
      if (survivorEntryIds.has(entry.entry_id)) {
        conflicts.push({
          kind: "duplicate_entry_id",
          source_entry_id: entry.entry_id,
          survivor_entry_id: entry.entry_id,
          change_id: changeId,
        });
        continue;
      }
      uniqueChanges.push(entry);
      if (entry.change_ref?.target_path) {
        targetConfirmationsRequired.push({
          source_entry_id: entry.entry_id,
          change_id: changeId,
          target_path: entry.change_ref.target_path,
        });
      }
      continue;
    }

    if (survivorEntryIds.has(entry.entry_id)) {
      conflicts.push({
        kind: "duplicate_entry_id",
        source_entry_id: entry.entry_id,
        survivor_entry_id: entry.entry_id,
      });
      continue;
    }
    uniqueShells.push(entry);
  }

  return {
    uniqueChanges,
    uniqueShells,
    conflicts,
    targetConfirmationsRequired,
  };
}

function renderEpicMergePlan(plan: ReturnType<typeof buildEpicMergePlan>) {
  return {
    unique_changes: plan.uniqueChanges.map(mapEpicEntry),
    unique_shells: plan.uniqueShells.map(mapEpicEntry),
    conflicts: plan.conflicts,
    target_confirmations_required: plan.targetConfirmationsRequired,
  };
}

function unresolvedMergeConflicts(
  plan: ReturnType<typeof buildEpicMergePlan>,
  resolutions: EpicMergeResolution[] | undefined,
) {
  const skipped = new Set(
    (resolutions ?? [])
      .filter((resolution) => resolution.action === "skip")
      .map((resolution) => resolution.source_entry_id),
  );
  return plan.conflicts.filter(
    (conflict) => !skipped.has(conflict.source_entry_id),
  );
}

function repairModeStatus(
  mode: z.infer<typeof EpicRepairModeSchema>,
): EpicMembershipStatus {
  if (mode === "mark_target_unreachable") return "target_unreachable";
  if (mode === "clear_stale_projection") return "projection_stale";
  return "linked";
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

  adv_epic_update_scope: {
    description:
      "Update an Epic's typed repo/project scope with audit evidence and optimistic-concurrency protection.",
    args: {
      epic_id: EPIC_ID_SCHEMA,
      owner_project_id: z
        .string()
        .min(1)
        .describe("ADV project ID that owns the Epic workflow."),
      owner_repo_id: z
        .string()
        .min(1)
        .optional()
        .describe("Product config repo ID of the owner repo when known."),
      scope_repos: z
        .array(EpicToolScopeRepoSchema)
        .describe("Repos covered by this Epic. Empty array clears scope."),
      expected_version: z
        .number()
        .int()
        .min(0)
        .describe("Current Epic version from adv_epic_show."),
      updated_by: z
        .string()
        .min(1)
        .optional()
        .describe("Identity updating scope. Defaults to agent."),
      audit_evidence: z
        .string()
        .min(1)
        .describe("Required audit evidence for the scope mutation."),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview scope mutation without firing a workflow signal."),
    },
    execute: async (
      {
        epic_id,
        owner_project_id,
        owner_repo_id,
        scope_repos,
        expected_version,
        updated_by,
        audit_evidence,
        dryRun,
      }: {
        epic_id: string;
        owner_project_id: string;
        owner_repo_id?: string;
        scope_repos: EpicScope["repos"];
        expected_version: number;
        updated_by?: string;
        audit_evidence: string;
        dryRun?: boolean;
      },
      store: Store,
    ) => {
      try {
        const epic = await loadEpic(store, epic_id);
        if (!epic) return epicNotFound(epic_id);

        const blockedEntries = linkedEntriesForRemovedScopeRepos(
          epic,
          scope_repos,
        );
        if (blockedEntries.length > 0) {
          return formatToolOutput({
            error:
              "Scope update would remove repos that still have linked Epic entries.",
            code: "SCOPE_REMOVAL_HAS_LINKED_ENTRIES",
            entries: blockedEntries.map(mapEpicEntry),
          });
        }

        const epicScope =
          scope_repos.length > 0
            ? buildEpicScope({
                ownerProjectId: owner_project_id,
                ownerRepoId: owner_repo_id,
                repos: scope_repos,
              })
            : undefined;
        const scopeLabel = deriveEpicScopeLabel(epicScope);

        if (dryRun) {
          return formatToolOutput({
            success: true,
            dryRun: true,
            epic_id,
            epic_scope: epicScope,
            scope_label: scopeLabel,
            expected_version,
          });
        }

        const updated = await store.epics.updateScope(epic_id, {
          epicScope,
          expectedVersion: expected_version,
          updatedBy: updated_by ?? "agent",
          auditEvidence: audit_evidence,
        });

        return formatToolOutput({
          success: true,
          scope_label: deriveEpicScopeLabel(updated.epic_scope),
          epic: formatEpic(updated),
        });
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
      "Link an existing ADV change from the current project or a target_path project as a new Epic entry and project compact epic_membership onto the child change.",
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

        const currentEpic = await loadEpic(store, epic_id);
        if (!currentEpic) return epicNotFound(epic_id);
        const existingEntry = findChangeEntry(currentEpic, {
          changeId: change_id,
        });
        if (existingEntry) {
          const membership = membershipFromChangeEntry(
            epic_id,
            existingEntry,
            title ?? change.title,
            "link_existing",
          );
          await childStore.store.changes.setEpicMembership(change_id, {
            membership,
            setAt: membership.linked_at,
          });
          const output = formatToolOutput({
            success: true,
            idempotent: true,
            entry: mapEpicEntry(existingEntry),
            epic_membership: membership,
          });
          return maybeAppendTargetContext(output, childStore.context);
        }

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
      "Unlink a current-project or target_path project change entry from an Epic after clearing the child epic_membership projection.",
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
        unlink_evidence,
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
        await store.epics.unlinkChange(
          epic_id,
          entry.entry_id,
          unlink_evidence,
        );
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
      "Move a current-project or target_path project change from one Epic to another, updating child epic_membership in between.",
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
        await store.epics.unlinkChange(
          from_epic_id,
          sourceEntry.entry_id,
          move_evidence,
        );
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

  adv_epic_merge: {
    description:
      "Plan or execute an audited merge of one active source Epic into a survivor Epic.",
    args: {
      source_epic_id: EPIC_ID_SCHEMA,
      survivor_epic_id: EPIC_ID_SCHEMA,
      expected_source_version: z.number().int().min(0),
      expected_survivor_version: z.number().int().min(0),
      merged_by: z.string().min(1).optional(),
      evidence: z
        .string()
        .min(1)
        .describe("Audit evidence for merging this source Epic."),
      conflict_resolutions: z.array(EpicMergeResolutionSchema).optional(),
      target_confirmed: targetPathSchema.shape.target_confirmed,
      confirmationEvidence: targetPathSchema.shape.confirmationEvidence,
      dryRun: z.boolean().optional(),
    },
    execute: async (
      {
        source_epic_id,
        survivor_epic_id,
        expected_source_version,
        expected_survivor_version,
        merged_by,
        evidence,
        conflict_resolutions,
        target_confirmed,
        confirmationEvidence,
        dryRun,
      }: {
        source_epic_id: string;
        survivor_epic_id: string;
        expected_source_version: number;
        expected_survivor_version: number;
        merged_by?: string;
        evidence: string;
        conflict_resolutions?: EpicMergeResolution[];
        target_confirmed?: true;
        confirmationEvidence?: string;
        dryRun?: boolean;
      },
      store: Store,
    ) => {
      try {
        if (source_epic_id === survivor_epic_id) {
          return formatToolOutput({
            error: "Source and survivor Epic must be different.",
            code: "EPIC_MERGE_SELF",
          });
        }
        const sourceEpic = await loadEpic(store, source_epic_id);
        if (!sourceEpic) return epicNotFound(source_epic_id);
        const survivorEpic = await loadEpic(store, survivor_epic_id);
        if (!survivorEpic) return epicNotFound(survivor_epic_id);

        if (sourceEpic.version !== expected_source_version) {
          return formatToolOutput({
            error: `Expected source Epic version ${expected_source_version}, found ${sourceEpic.version}`,
            code: "STALE_VERSION",
          });
        }
        if (survivorEpic.version !== expected_survivor_version) {
          return formatToolOutput({
            error: `Expected survivor Epic version ${expected_survivor_version}, found ${survivorEpic.version}`,
            code: "STALE_VERSION",
          });
        }
        if (
          sourceEpic.merged_into ||
          sourceEpic.progress.status === "merged" ||
          sourceEpic.progress.status === "archived" ||
          sourceEpic.progress.status === "completed"
        ) {
          return formatToolOutput({
            error: "Only active source Epics can be merged.",
            code: "SOURCE_EPIC_NOT_ACTIVE",
            status: sourceEpic.progress.status,
            merged_into: sourceEpic.merged_into,
          });
        }

        const plan = buildEpicMergePlan(sourceEpic, survivorEpic);
        const renderedPlan = renderEpicMergePlan(plan);

        if (dryRun) {
          return formatToolOutput({
            success: true,
            dryRun: true,
            source_epic_id,
            survivor_epic_id,
            plan: renderedPlan,
          });
        }

        const unresolved = unresolvedMergeConflicts(plan, conflict_resolutions);
        if (unresolved.length > 0) {
          return formatToolOutput({
            error: "Merge conflicts require explicit dispositions.",
            code: "MERGE_CONFLICTS_UNRESOLVED",
            conflicts: unresolved,
            plan: renderedPlan,
          });
        }

        if (
          plan.targetConfirmationsRequired.length > 0 &&
          (!target_confirmed || !confirmationEvidence)
        ) {
          return formatToolOutput({
            error:
              "Cross-project merge entries require target confirmation evidence.",
            code: "TARGET_CONFIRMATION_REQUIRED",
            target_confirmations_required: plan.targetConfirmationsRequired,
          });
        }

        const actor = merged_by ?? "agent";
        const movedChanges: ReturnType<typeof mapEpicEntry>[] = [];
        const copiedShells: ReturnType<typeof mapEpicEntry>[] = [];

        for (const shell of plan.uniqueShells) {
          const copied = await store.epics.addShell(survivor_epic_id, {
            entryId: shell.entry_id,
            title: shell.title,
            successHint: shell.success_hint,
            order: shell.order,
          });
          copiedShells.push(mapEpicEntry(copied));
        }

        for (const sourceEntry of plan.uniqueChanges) {
          const changeId = getEpicEntryChangeId(sourceEntry);
          if (!changeId) continue;
          const childStore = await resolveChildStore(store, {
            target_path: sourceEntry.change_ref?.target_path,
            target_confirmed,
            confirmationEvidence,
          });
          const change = await loadChange(childStore.store, changeId);
          if (!change) {
            return formatToolOutput({
              error: `Change not found: ${changeId}`,
              code: "CHANGE_NOT_FOUND",
            });
          }
          if (
            !change.epic_membership ||
            change.epic_membership.epic_id !== source_epic_id ||
            change.epic_membership.entry_id !== sourceEntry.entry_id
          ) {
            return formatToolOutput({
              error: `Change projection does not match source Epic ${source_epic_id}`,
              code: "PROJECTION_MISMATCH",
              current_membership: change.epic_membership,
            });
          }

          const destEntry = requireChangeEntry(
            await store.epics.linkChange(survivor_epic_id, {
              changeId,
              title: change.title,
              order: sourceEntry.order,
              linkedBy: actor,
              linkEvidence: evidence,
              changeProjectId:
                sourceEntry.change_ref?.project_id ??
                childStore.context?.projectId,
              repoId: sourceEntry.change_ref?.repo_id,
              targetPath:
                sourceEntry.change_ref?.target_path ?? childStore.context?.root,
            }),
          );
          const membership = membershipFromChangeEntry(
            survivor_epic_id,
            destEntry,
            change.title,
            "move",
          );
          await childStore.store.changes.setEpicMembership(changeId, {
            expectedCurrent: {
              epic_id: source_epic_id,
              entry_id: sourceEntry.entry_id,
            },
            membership,
            setAt: membership.linked_at,
          });
          await store.epics.unlinkChange(
            source_epic_id,
            sourceEntry.entry_id,
            evidence,
          );
          movedChanges.push(mapEpicEntry(destEntry));
        }

        const movedEntryCount = movedChanges.length + copiedShells.length;
        const mergedSource = await store.epics.markMerged(source_epic_id, {
          expectedVersion: expected_source_version + movedChanges.length,
          mergedInto: {
            epic_id: survivor_epic_id,
            merged_at: new Date().toISOString(),
            merged_by: actor,
            evidence,
            moved_entry_count: movedEntryCount,
          },
        });

        return formatToolOutput({
          success: true,
          source_epic_id,
          survivor_epic_id,
          moved_changes: movedChanges,
          copied_shells: copiedShells,
          skipped_conflicts: conflict_resolutions ?? [],
          source: formatEpic(mergedSource),
        });
      } catch (err) {
        return epicError(err);
      }
    },
  },

  adv_epic_repair_membership: {
    description:
      "Repair stale Epic membership projection state. Supports dry-run preview, target-path routing, and bounded member-status output.",
    args: {
      epic_id: EPIC_ID_SCHEMA,
      mode: EpicRepairModeSchema,
      entry_id: z.string().min(1).optional(),
      change_id: z.string().min(1).optional(),
      evidence: z
        .string()
        .min(1)
        .describe("Audit evidence explaining why repair is being applied."),
      target_path: targetPathSchema.shape.target_path,
      target_confirmed: targetPathSchema.shape.target_confirmed,
      confirmationEvidence: targetPathSchema.shape.confirmationEvidence,
      dryRun: z.boolean().optional(),
    },
    execute: async (
      {
        epic_id,
        mode,
        entry_id,
        change_id,
        evidence,
        target_path,
        target_confirmed,
        confirmationEvidence,
        dryRun,
      }: {
        epic_id: string;
        mode: z.infer<typeof EpicRepairModeSchema>;
        entry_id?: string;
        change_id?: string;
        evidence: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
        dryRun?: boolean;
      },
      store: Store,
    ) => {
      try {
        const epic = await loadEpic(store, epic_id);
        if (!epic) {
          if (mode === "clear_stale_projection") {
            return clearMissingEpicProjection(store, {
              epic_id,
              entry_id,
              change_id,
              target_path,
              target_confirmed,
              confirmationEvidence,
              dryRun,
            });
          }
          return epicNotFound(epic_id);
        }
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

        if (mode === "mark_target_unreachable") {
          const membershipStatus = repairModeStatus(mode);
          const previewEntry = {
            ...entry,
            membership_status: membershipStatus,
          };
          if (dryRun) {
            return formatToolOutput({
              success: true,
              dryRun: true,
              entry_id: entry.entry_id,
              change_id: finalChangeId,
              member_status: memberStatusForEntry(previewEntry),
            });
          }
          const updatedEntry = requireChangeEntry(
            await store.epics.setEntryMembershipStatus(epic_id, {
              entryId: entry.entry_id,
              membershipStatus,
              evidence,
            }),
          );
          return formatToolOutput({
            success: true,
            repaired: true,
            entry: mapEpicEntry(updatedEntry),
            member_status: memberStatusForEntry(updatedEntry),
          });
        }

        const childStore = await resolveChildStore(store, {
          target_path: target_path ?? entry.change_ref?.target_path,
          target_confirmed,
          confirmationEvidence,
        });
        const change = await loadChange(childStore.store, finalChangeId);
        if (!change) {
          return formatToolOutput({
            error: `Change not found: ${finalChangeId}`,
            code: "CHANGE_NOT_FOUND",
          });
        }

        if (mode === "clear_stale_projection") {
          if (!change.epic_membership) {
            const output = formatToolOutput({
              success: true,
              repaired: false,
              entry_id: entry.entry_id,
              change_id: finalChangeId,
              member_status: {
                status: "projection_missing" as const,
                last_checked_at: new Date().toISOString(),
                message: "Child projection already absent.",
              },
            });
            return maybeAppendTargetContext(output, childStore.context);
          }
          if (
            change.epic_membership.epic_id !== epic_id ||
            change.epic_membership.entry_id !== entry.entry_id
          ) {
            return formatToolOutput({
              error: `Change projection does not match Epic ${epic_id}`,
              code: "PROJECTION_MISMATCH",
              current_membership: change.epic_membership,
            });
          }
          if (dryRun) {
            const output = formatToolOutput({
              success: true,
              dryRun: true,
              entry_id: entry.entry_id,
              change_id: finalChangeId,
              action: "clear_child_projection",
            });
            return maybeAppendTargetContext(output, childStore.context);
          }
          await childStore.store.changes.clearEpicMembership(finalChangeId, {
            expected: { epic_id, entry_id: entry.entry_id },
          });
          const output = formatToolOutput({
            success: true,
            repaired: true,
            entry_id: entry.entry_id,
            change_id: finalChangeId,
            cleared: true,
          });
          return maybeAppendTargetContext(output, childStore.context);
        }

        if (
          change.epic_membership &&
          (change.epic_membership.epic_id !== epic_id ||
            change.epic_membership.entry_id !== entry.entry_id)
        ) {
          return formatToolOutput({
            error: `Change projection does not match Epic ${epic_id}`,
            code: "PROJECTION_MISMATCH",
            current_membership: change.epic_membership,
          });
        }

        const terminalStatus = terminalSummaryStatusForChange(change.status);
        if (terminalStatus) {
          const completedAt = terminalSummaryCompletedAt(change);
          const terminalSummary = {
            status: terminalStatus,
            completed_at: completedAt,
          };
          if (dryRun) {
            const output = formatToolOutput({
              success: true,
              dryRun: true,
              entry_id: entry.entry_id,
              change_id: finalChangeId,
              action: "project_terminal_summary",
              terminal_summary: terminalSummary,
            });
            return maybeAppendTargetContext(output, childStore.context);
          }

          const updatedEntry = requireChangeEntry(
            await store.epics.setEntryTerminalSummary(epic_id, {
              entryId: entry.entry_id,
              status: terminalStatus,
              completedAt,
            }),
          );
          const output = formatToolOutput({
            success: true,
            repaired: true,
            terminal_summary_projected: true,
            entry: mapEpicEntry(updatedEntry),
            terminal_summary: terminalSummary,
            member_status: memberStatusForEntry(updatedEntry),
          });
          return maybeAppendTargetContext(output, childStore.context);
        }

        const membership = membershipFromChangeEntry(
          epic_id,
          entry,
          entry.title ?? change.title,
          "link_existing",
        );
        if (dryRun) {
          const output = formatToolOutput({
            success: true,
            dryRun: true,
            entry_id: entry.entry_id,
            change_id: finalChangeId,
            epic_membership: membership,
          });
          return maybeAppendTargetContext(output, childStore.context);
        }
        await childStore.store.changes.setEpicMembership(finalChangeId, {
          membership,
          setAt: membership.linked_at,
        });
        const updatedEntry = requireChangeEntry(
          await store.epics.setEntryMembershipStatus(epic_id, {
            entryId: entry.entry_id,
            membershipStatus: repairModeStatus(mode),
            evidence,
          }),
        );
        const output = formatToolOutput({
          success: true,
          repaired: true,
          entry: mapEpicEntry(updatedEntry),
          epic_membership: membership,
          member_status: memberStatusForEntry(updatedEntry),
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
