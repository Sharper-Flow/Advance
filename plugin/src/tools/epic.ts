/**
 * Epic Tools
 *
 * MCP tools for Advance Epics: create, show, list, update, reorder,
 * add shell, promote shell, link/unlink change.
 *
 * Epic order is advisory — tools warn but never hard-block.
 */

import { z } from "zod";
import { resolve } from "path";
import type { Store } from "../storage/store-types";
import { deriveEpicScopeLabel, WorkNodeRefSchema } from "../types";
import type {
  Change,
  EpicEntry,
  FastFollowOf,
  RetiredEpicProjection,
  WorkNodeRef,
} from "../types";
import { formatToolOutput, paginate } from "../utils/tool-output";
import {
  buildD3ContextFromStore,
  enforceD3ForShellAdd,
  enforceD3ForShellPromote,
  type D3EnforcementError,
} from "../validator/work-graph-enforcement";
import { nodeRefKey } from "../validator/work-graph-validation";
import { getBacklogItem } from "../utils/backlog-store";
import {
  assertEpicAggregatePackets,
  assertPacketSize,
  parsePacket,
  ContextPacketTooLargeError,
  EpicAggregatePacketsExceededError,
} from "../utils/context-packet-validation";
import type { FutureWorkContextPacket } from "../types/future-work";
import {
  appendEpicRoutingContexts,
  EPIC_OWNER_ROUTING_ERROR_CODES,
  epicOwnerTargetPathSchema,
  formatEpicOwnerRoutingError,
  targetPathSchema,
  withTargetPathStore,
} from "./target-project";
import {
  convergeEpicMembership,
  findChangeEntry,
  getEpicEntryChangeId,
  isForeignProjectEntry,
  membershipFromChangeEntry,
  type ChildObservation,
} from "./epic-convergence";
import { getProjectId } from "../utils/project-id";

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
  const blockers =
    err instanceof Error
      ? ((err as { blockers?: unknown[] }).blockers ?? undefined)
      : undefined;
  return formatToolOutput({
    error: message,
    code,
    ...(blockers && { blockers }),
  });
}

function contextPacketError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof ContextPacketTooLargeError) {
    return formatToolOutput({
      success: false,
      error: message,
      code: "context_packet_too_large",
    });
  }
  if (err instanceof EpicAggregatePacketsExceededError) {
    return formatToolOutput({
      success: false,
      error: message,
      code: "epic_aggregate_context_packets_exceeded",
    });
  }
  return formatToolOutput({
    success: false,
    error: message,
    code: "invalid_context_packet",
  });
}

/**
 * Render a structured Future-Work Context section from a validated packet.
 * Only includes subsections for fields that are present.
 */
function renderContextPacketSection(packet: FutureWorkContextPacket): string {
  const lines: string[] = [
    "",
    "## Future-Work Context",
    "",
    "<!-- Injected from the promoted Epic shell's context_packet. -->",
    "",
  ];

  if (packet.background) {
    lines.push("### Background", "", packet.background, "");
  }

  if (packet.design_seed) {
    lines.push("### Design Seed", "", packet.design_seed, "");
  }

  if (packet.references && packet.references.length > 0) {
    lines.push("### References", "");
    for (const ref of packet.references) {
      lines.push(`- **${ref.label}**: ${ref.locator}`);
    }
    lines.push("");
  }

  if (packet.constraints && packet.constraints.length > 0) {
    lines.push("### Constraints", "");
    for (const constraint of packet.constraints) {
      lines.push(`- ${constraint}`);
    }
    lines.push("");
  }

  if (packet.avoidances && packet.avoidances.length > 0) {
    lines.push("### Avoidances", "");
    for (const avoidance of packet.avoidances) {
      lines.push(`- ${avoidance}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Render a placeholder section when a shell's context_packet is present but
 * cannot be safely injected (e.g., it exceeds the bounded size budget).
 */
function renderOmittedContextPacketSection(reason: string): string {
  return [
    "",
    "## Future-Work Context",
    "",
    `<!-- The promoted shell carried a context_packet, but it ${reason}. It was omitted to keep the proposal bounded. -->`,
    "",
  ].join("\n");
}

/**
 * Build the Future-Work Context appendix for a proposal seed.
 *
 * Re-validates the packet size before rendering. If the packet is oversized,
 * returns an omission section instead so promotion never crashes.
 */
function buildContextPacketSection(
  packet: FutureWorkContextPacket | undefined,
): { section: string; note?: string } {
  if (!packet) {
    return { section: "" };
  }

  try {
    assertPacketSize(packet);
    return { section: renderContextPacketSection(packet) };
  } catch (err) {
    const reason =
      err instanceof ContextPacketTooLargeError
        ? `exceeded the size budget (${err.actualBytes} bytes)`
        : "could not be bounded";
    return {
      section: renderOmittedContextPacketSection(reason),
      note: err instanceof Error ? err.message : String(err),
    };
  }
}

function formatD3Error(error: D3EnforcementError): string {
  switch (error.code) {
    case "INVALID_WORK_NODE_REF": {
      const reason = (error as { reason?: string }).reason;
      if (reason === "self_edge") return "Self-dependency is not allowed.";
      if (reason === "duplicate_ref")
        return "Duplicate dependency reference in blocked_by.";
      return "Invalid dependency reference.";
    }
    case "UNRESOLVED_DEPENDENCY":
      return "Dependency target does not exist in scope.";
    case "DEPENDENCY_CYCLE":
      return "Adding this dependency would create a cycle.";
    case "SHELL_PREREQ_NONTERMINAL": {
      const refs = (error as { blocking_refs: WorkNodeRef[] }).blocking_refs;
      return `Cannot add shell: prerequisites are not terminal: ${refs.map((r) => nodeRefKey(r)).join(", ")}`;
    }
    default:
      return `Dependency enforcement failed: ${error.code}`;
  }
}

// =============================================================================
// Fast-Follow Lineage Projection (rq-epicFastFollowLineage01)
// =============================================================================
//
// Advisory-only projection rendered on adv_epic_show entries when the child
// change carries typed fast_follow_of metadata. Bounded by Epic entry count,
// additive (never removes or reorders fields), and classification is a
// constant — fast_follow_of is reserved for non-operational advisory children
// per retireAgendaWorkflow design; operational work continues through
// ops_followup_links and is not in scope here. The projection MUST NOT add
// Epic task ownership, dependency enum, task readiness behavior, or release
// gating.

/**
 * Compact fast-follow lineage rendered on Epic change entries.
 *
 * - `source_change_id`: parent change the child fast-follows from
 * - `source_task_id`: task in the parent when known (derived from
 *   followup_ref.report_key); null when the report scope is change-level or
 *   unknown, or when followup_ref is absent
 * - `classification`: always `"non_blocking_advisory"` for fast-follow
 *   children; operational work uses ops_followup_links instead
 * - `linked_at`: when the fast-follow link was established on the child
 */
export type EpicFastFollowLineage = {
  source_change_id: string;
  source_task_id: string | null;
  classification: "non_blocking_advisory";
  linked_at: string;
};

/**
 * Derive the parent task ID from a subagentReportKey when the report scope
 * is task-level. Returns null for change scope, unknown scope, malformed
 * keys, or missing input.
 *
 * Report key formats (see subagent-reports.ts subagentReportKey):
 * - taskId present:          `changeId|taskId|agent|attempt`
 * - task scope (no taskId):  `changeId|task:<task_id>|agent|attempt`
 * - change scope:            `changeId|change:<scope_key>|agent|attempt`
 * - unknown:                 `changeId|unknown-scope|agent|attempt`
 */
function extractSourceTaskIdFromReportKey(
  reportKey: string | undefined,
): string | null {
  if (!reportKey) return null;
  const parts = reportKey.split("|");
  if (parts.length < 2) return null;
  const scopePart = parts[1];
  if (!scopePart) return null;
  if (scopePart.startsWith("task:")) {
    const id = scopePart.slice("task:".length);
    return id.length > 0 ? id : null;
  }
  if (scopePart.startsWith("change:")) return null;
  if (scopePart === "unknown-scope") return null;
  // Legacy taskId shape — second segment is the task id directly.
  return scopePart;
}

/**
 * Compute the advisory lineage for one child change, or null when the child
 * has no fast_follow_of or cannot be loaded. Cached per change_id for the
 * duration of a single render call so repeated entries referencing the same
 * child issue exactly one store read.
 */
async function loadFastFollowLineage(
  store: Store,
  changeId: string,
  cache: Map<string, EpicFastFollowLineage | null>,
): Promise<EpicFastFollowLineage | null> {
  if (cache.has(changeId)) return cache.get(changeId) ?? null;
  let lineage: EpicFastFollowLineage | null = null;
  try {
    const loaded = await store.changes.get(changeId);
    if (loaded.success && loaded.data) {
      const ff: FastFollowOf | undefined = loaded.data.fast_follow_of;
      if (ff) {
        lineage = {
          source_change_id: ff.parent_change_id,
          source_task_id: extractSourceTaskIdFromReportKey(
            ff.followup_ref?.report_key,
          ),
          classification: "non_blocking_advisory",
          linked_at: ff.linked_at,
        };
      }
    }
  } catch {
    lineage = null;
  }
  cache.set(changeId, lineage);
  return lineage;
}

/**
 * Build a per-entry-id map of fast-follow lineage for the given Epic entries.
 * Shell entries and change entries without fast_follow_of produce no row.
 * Bounded: at most one store read per unique child change_id.
 */
async function buildFastFollowLineageMap(
  store: Store,
  entries: readonly EpicEntry[],
): Promise<Map<string, EpicFastFollowLineage>> {
  const cache = new Map<string, EpicFastFollowLineage | null>();
  const map = new Map<string, EpicFastFollowLineage>();
  for (const entry of entries) {
    if (entry.kind !== "change") continue;
    const changeId = getEpicEntryChangeId(entry);
    if (!changeId) continue;
    const lineage = await loadFastFollowLineage(store, changeId, cache);
    if (lineage) map.set(entry.entry_id, lineage);
  }
  return map;
}

/**
 * Merge fast-follow lineage into a rendered Epic response. Additive only:
 * preserves all existing keys on each entry and never adds fields to shell
 * rows or entries whose child has no fast_follow_of. No-op when no lineage
 * was discovered.
 */
async function enrichEpicRenderWithFastFollowLineage<
  T extends {
    entries?: ReadonlyArray<Record<string, unknown>>;
    history?: ReadonlyArray<Record<string, unknown>>;
    next_work?: ReadonlyArray<Record<string, unknown>>;
  },
>(rendered: T, store: Store, entries: readonly EpicEntry[]): Promise<T> {
  const lineageMap = await buildFastFollowLineageMap(store, entries);
  if (lineageMap.size === 0) return rendered;

  const attach = <R extends Record<string, unknown>>(item: R): R => {
    const entryId = item.entry_id;
    if (typeof entryId !== "string") return item;
    const lineage = lineageMap.get(entryId);
    if (!lineage) return item;
    return { ...item, fast_follow_lineage: lineage };
  };

  const out: Record<string, unknown> = { ...rendered };
  if (rendered.entries) out.entries = rendered.entries.map(attach);
  if (rendered.history) out.history = rendered.history.map(attach);
  if (rendered.next_work) out.next_work = rendered.next_work.map(attach);
  return out as T;
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
          imported_from: entry.imported_from,
          context_packet: entry.context_packet,
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
      message:
        "Child projection may be stale; adv_epic_show convergence reconciles it.",
    };
  }
  return {
    status: "projection_missing" as const,
    last_checked_at: checkedAt,
    message:
      "Child projection is pending or missing; adv_epic_show convergence rebuilds it.",
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
  if (epic.progress.status !== "merged" && epic.progress.next_entry_id) {
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
    scope_label: deriveEpicScopeLabel(epic.epic_scope),
    merged_into: epic.merged_into,
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
    scope_label: deriveEpicScopeLabel(epic.epic_scope),
    merged_into: epic.merged_into,
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

function formatEpicWithRetired(
  epic: import("../types").Epic,
  retiredProjection: RetiredEpicProjection,
) {
  return {
    ...formatEpic(epic),
    retired: {
      retired_at: retiredProjection.retired_at,
      retired_by: retiredProjection.retired_by,
      evidence: retiredProjection.evidence,
      source_workflow_id: retiredProjection.source_workflow_id,
      source_version: retiredProjection.source_version,
      projection_status: retiredProjection.projection_status,
    },
  };
}

function formatEpicCompactWithRetired(
  epic: import("../types").Epic,
  retiredProjection: RetiredEpicProjection,
) {
  return {
    ...formatEpicCompact(epic),
    retired: {
      retired_at: retiredProjection.retired_at,
      retired_by: retiredProjection.retired_by,
      evidence: retiredProjection.evidence,
      source_workflow_id: retiredProjection.source_workflow_id,
      source_version: retiredProjection.source_version,
      projection_status: retiredProjection.projection_status,
    },
  };
}

function renderEpic(
  epic: import("../types").Epic,
  view: "compact" | "full",
  retiredProjection?: RetiredEpicProjection,
) {
  if (view === "full") {
    return retiredProjection
      ? formatEpicWithRetired(epic, retiredProjection)
      : formatEpic(epic);
  }
  return retiredProjection
    ? formatEpicCompactWithRetired(epic, retiredProjection)
    : formatEpicCompact(epic);
}

/**
 * Store-level retire dry-run errors that are expected business rejections,
 * not live-evaluation unavailability.
 */
const EPIC_RETIRE_STORE_ERROR_CODES = new Set([
  "epic_not_found",
  "epic_incomplete",
  "stale_version",
]);

/**
 * True when a retire dry-run failure indicates the live Epic workflow is
 * unreachable, as opposed to a per-Epic business blocker such as incomplete
 * entries or stale version.
 */
function isEpicRetirementEvaluationUnavailableError(err: unknown): boolean {
  const typed = err as { code?: string };
  if (typed.code && EPIC_RETIRE_STORE_ERROR_CODES.has(typed.code)) {
    return false;
  }
  return true;
}

async function loadEpic(store: Store, epicId: string) {
  const result = await store.epics.get(epicId);
  if (!result.success || !result.data) return null;
  return result.data;
}

async function loadEpicWithRetiredProjection(
  store: Store,
  epicId: string,
): Promise<{
  epic: import("../types").Epic;
  retiredProjection?: RetiredEpicProjection;
} | null> {
  const result = await store.epics.get(epicId);
  if (!result.success || !result.data) return null;
  if (result.source === "retired_projection") {
    const retired = await store.epics.getRetiredProjection(epicId);
    if (retired.success && retired.data) {
      return { epic: result.data, retiredProjection: retired.data };
    }
  }
  return { epic: result.data };
}

async function loadChange(
  store: Store,
  changeId: string,
): Promise<Change | null> {
  const result = await store.changes.get(changeId);
  if (!result.success || !result.data) return null;
  return result.data;
}

function terminalSummaryStatusForChange(
  status: string,
): "archived" | "closed" | null {
  return status === "archived" || status === "closed" ? status : null;
}

function terminalSummaryCompletedAt(
  change: Awaited<ReturnType<typeof loadChange>>,
): string {
  return (
    change?.lastSignalAt ??
    (change as { updated_at?: string } | null)?.updated_at ??
    change?.created_at ??
    new Date().toISOString()
  );
}

// rq-epicTerminalChildProjection01: project archived/closed child state onto
// the Epic entry when linking an already-terminal change.
async function projectTerminalStateForLinkedEntry(
  store: Store,
  epicId: string,
  entry: Extract<EpicEntry, { kind: "change" }>,
  change: Change,
  evidence: string,
): Promise<{
  entry: Extract<EpicEntry, { kind: "change" }>;
  terminalSummary: {
    status: "archived" | "closed";
    completed_at: string;
  } | null;
  projected: boolean;
}> {
  const terminalStatus = terminalSummaryStatusForChange(change.status);
  if (!terminalStatus) {
    return { entry, terminalSummary: null, projected: false };
  }
  const completedAt = terminalSummaryCompletedAt(change);
  const terminalSummary = { status: terminalStatus, completed_at: completedAt };
  await store.epics.setEntryTerminalSummary(epicId, {
    entryId: entry.entry_id,
    status: terminalStatus,
    completedAt,
  });
  const finalEntry = requireChangeEntry(
    await store.epics.setEntryMembershipStatus(epicId, {
      entryId: entry.entry_id,
      membershipStatus: "terminal",
      evidence,
    }),
  );
  return { entry: finalEntry, terminalSummary, projected: true };
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
      stateRequirement: "authoritative",
      target_confirmed: args.target_confirmed,
      confirmationEvidence: args.confirmationEvidence,
    },
    async ({ context, store: targetStore }) => ({
      context,
      store: targetStore,
    }),
  );
}

type EpicRoutingStore = {
  context: import("./target-project").TargetProjectContext | null;
  store: Store;
};

function setEpicOwnerProjectId(
  membership: NonNullable<Change["epic_membership"]>,
  owner: EpicRoutingStore,
): NonNullable<Change["epic_membership"]> {
  return owner.context
    ? { ...membership, epic_project_id: owner.context.projectId }
    : membership;
}

async function resolveEpicRoutingStores(
  store: Store,
  args: {
    epic_owner_target_path?: string;
    epic_owner_target_confirmed?: true;
    epic_owner_confirmationEvidence?: string;
    target_path?: string;
    target_confirmed?: true;
    confirmationEvidence?: string;
  },
): Promise<{ owner: EpicRoutingStore; child: EpicRoutingStore }> {
  const owner = await resolveEpicOwnerStore({
    store,
    epic_owner_target_path: args.epic_owner_target_path,
    epic_owner_target_confirmed: args.epic_owner_target_confirmed,
    epic_owner_confirmationEvidence: args.epic_owner_confirmationEvidence,
  });

  if (args.target_path) {
    const child = await resolveChildStore(store, {
      target_path: args.target_path,
      target_confirmed: args.target_confirmed,
      confirmationEvidence: args.confirmationEvidence,
    });
    return { owner, child };
  }

  return { owner, child: owner };
}

export async function resolveEpicOwnerStore(input: {
  store: Store;
  epic_owner_target_path?: string;
  epic_owner_target_confirmed?: true;
  epic_owner_confirmationEvidence?: string;
}): Promise<{
  context: import("./target-project").TargetProjectContext | null;
  store: Store;
}> {
  if (!input.epic_owner_target_path) {
    return { context: null, store: input.store };
  }

  return withTargetPathStore(
    {
      currentProjectPath: input.store.paths.root,
      target_path: input.epic_owner_target_path,
      stateRequirement: "authoritative",
      target_confirmed: input.epic_owner_target_confirmed,
      confirmationEvidence: input.epic_owner_confirmationEvidence,
    },
    async ({ context, store: targetStore }) => ({
      context,
      store: targetStore,
    }),
  );
}

function isSameProject(a: string, b: string): boolean {
  return resolve(a) === resolve(b);
}

function validateEpicRoutingShape(
  currentRoot: string,
  owner: EpicRoutingStore,
  child: EpicRoutingStore,
): { error: string; code: string } | undefined {
  const hasOwnerRoute = owner.context !== null;
  const hasChildRoute = child.context !== null && child.store !== owner.store;
  const ownerRoot = owner.context?.root ?? currentRoot;
  const childRoot = child.context?.root ?? currentRoot;

  if (hasOwnerRoute && hasChildRoute) {
    if (
      !isSameProject(ownerRoot, currentRoot) &&
      isSameProject(childRoot, currentRoot)
    ) {
      return {
        error:
          "Owner remote + child local routing is not supported. The child change must be in the owner project or a different remote project.",
        code: EPIC_OWNER_ROUTING_ERROR_CODES.OWNER_CHILD_ROUTING_UNSUPPORTED,
      };
    }
    return undefined;
  }

  if (hasOwnerRoute && !hasChildRoute) {
    if (!isSameProject(ownerRoot, currentRoot)) {
      // child defaults to owner store (same remote); supported
      return undefined;
    }
    return undefined;
  }

  return undefined;
}

function formatEpicRoutingOutput(
  output: string,
  owner: EpicRoutingStore,
  child: EpicRoutingStore,
): string {
  return appendEpicRoutingContexts(output, {
    ownerContext: owner.context,
    childContext:
      child.context && child.store !== owner.store ? child.context : null,
  });
}

function childRoutingRequiredForSameOwnerChange(changeId: string): string {
  return formatToolOutput({
    error: `Change not found in Epic owner project. Provide target_path for the child project: ${changeId}`,
    code: EPIC_OWNER_ROUTING_ERROR_CODES.CHILD_ROUTING_REQUIRED,
  });
}

function formatChildProjectionFailureOutput(
  owner: EpicRoutingStore,
  child: EpicRoutingStore,
  input: {
    entry: Extract<EpicEntry, { kind: "change" }>;
    membership: NonNullable<Change["epic_membership"]>;
    cause: unknown;
  },
): string {
  const causeMessage =
    input.cause instanceof Error ? input.cause.message : String(input.cause);
  return formatEpicRoutingOutput(
    formatToolOutput({
      success: false,
      error: `Owner Epic mutated but child projection failed: ${causeMessage}. The next adv_epic_show will run bounded direct convergence (rq-epicConvergence01) to reconcile; if drift persists, rerun the Epic mutation.`,
      code: EPIC_OWNER_ROUTING_ERROR_CODES.CHILD_PROJECTION_FAILED,
      owner_mutated: true,
      child_projection_failed: true,
      entry: mapEpicEntry(input.entry),
      epic_membership: input.membership,
      repair_action:
        "adv_epic_show convergence (automatic; rq-epicConvergence01)",
    }),
    owner,
    child,
  );
}

async function applyChildEpicMembership(
  childStore: EpicRoutingStore,
  owner: EpicRoutingStore,
  changeId: string,
  membership: NonNullable<Change["epic_membership"]>,
  entry: Extract<EpicEntry, { kind: "change" }>,
  expectedCurrent?: { epic_id: string; entry_id: string },
): Promise<string | null> {
  try {
    await childStore.store.changes.setEpicMembership(changeId, {
      ...(expectedCurrent ? { expectedCurrent } : {}),
      membership,
      setAt: membership.linked_at,
    });
    return null;
  } catch (err) {
    return formatChildProjectionFailureOutput(owner, childStore, {
      entry,
      membership,
      cause: err,
    });
  }
}

function changeAlreadyInEpic(change: import("../types").Change) {
  return formatToolOutput({
    error: `Change already belongs to Epic ${change.epic_membership?.epic_id}`,
    code: "CHANGE_ALREADY_IN_EPIC",
    current_membership: change.epic_membership,
  });
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

async function convergeEpicOnShow(
  ownerStore: Store,
  epic: import("../types").Epic,
  ownerProjectId: string | null,
): Promise<{
  epic: import("../types").Epic;
  repairs: Array<{
    entry_id: string;
    change_id: string;
    repair_kind: string;
    convergence_status: string;
  }>;
}> {
  const repairs: Array<{
    entry_id: string;
    change_id: string;
    repair_kind: string;
    convergence_status: string;
  }> = [];

  // Fast path: no change entries → nothing to converge.
  const changeEntries = epic.entries.filter(
    (e): e is Extract<EpicEntry, { kind: "change" }> => e.kind === "change",
  );
  if (changeEntries.length === 0) {
    return { epic, repairs };
  }

  let updatedEntries: EpicEntry[] = [...epic.entries];

  for (const entry of changeEntries) {
    const changeId = getEpicEntryChangeId(entry);
    if (!changeId) continue;

    // Skip entries owned by a different project. Those converge at mutation
    // time and through explicit operator paths; the entry's own
    // membership_status is preserved as-is.
    if (isForeignProjectEntry(entry, ownerProjectId)) {
      continue;
    }

    // Observe child state.
    let childObservation: ChildObservation;
    try {
      const change = await loadChange(ownerStore, changeId);
      childObservation = change
        ? { kind: "present", change }
        : { kind: "absent" };
    } catch {
      childObservation = { kind: "unreachable" };
    }

    const convergence = convergeEpicMembership({
      entry,
      epic_id: epic.id,
      child: childObservation,
    });

    if (!convergence.repair) continue;

    try {
      const repair = convergence.repair;
      let updatedEntry: EpicEntry | null = null;

      if (repair.kind === "mark_entry_linked") {
        updatedEntry = await ownerStore.epics.setEntryMembershipStatus(
          epic.id,
          {
            entryId: entry.entry_id,
            membershipStatus: "linked",
            evidence:
              "convergence: child epic_membership verified on adv_epic_show",
          },
        );
      } else if (
        repair.kind === "mark_entry_terminal" &&
        repair.terminal_summary
      ) {
        await ownerStore.epics.setEntryTerminalSummary(epic.id, {
          entryId: entry.entry_id,
          status: repair.terminal_summary.status,
          completedAt: repair.terminal_summary.completed_at,
        });
        updatedEntry = await ownerStore.epics.setEntryMembershipStatus(
          epic.id,
          {
            entryId: entry.entry_id,
            membershipStatus: "terminal",
            evidence:
              "convergence: child terminal state observed on adv_epic_show",
          },
        );
      } else if (
        repair.kind === "sync_child_projection" &&
        repair.expected_membership
      ) {
        // Rebuild derived child projection from Epic entry truth.
        // The expected_membership epic_id is sourced from the Epic itself.
        const expectedMembership = {
          ...repair.expected_membership,
          epic_id: epic.id,
        };
        await ownerStore.changes.setEpicMembership(changeId, {
          membership: expectedMembership,
          setAt: convergence.last_checked_at,
        });
        // Entry itself did not change; nothing to swap in updatedEntries.
      } else if (repair.kind === "clear_child_projection") {
        await ownerStore.changes.clearEpicMembership(changeId, {
          expected: { epic_id: epic.id, entry_id: entry.entry_id },
          clearedAt: convergence.last_checked_at,
        });
      }

      if (updatedEntry) {
        updatedEntries = updatedEntries.map((e) =>
          e.entry_id === entry.entry_id ? (updatedEntry as EpicEntry) : e,
        );
      }
      repairs.push({
        entry_id: entry.entry_id,
        change_id: changeId,
        repair_kind: repair.kind,
        convergence_status: convergence.status,
      });
    } catch {
      // Best-effort convergence: per-entry failures are swallowed so that
      // one bad entry does not poison the entire show response. The
      // convergence status on the next access will retry.
    }
  }

  return {
    epic: { ...epic, entries: updatedEntries },
    repairs,
  };
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
      ...epicOwnerTargetPathSchema,
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
        epic_owner_target_path,
        epic_owner_target_confirmed,
        epic_owner_confirmationEvidence,
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
        epic_owner_target_path?: string;
        epic_owner_target_confirmed?: true;
        epic_owner_confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      try {
        const owner = await resolveEpicOwnerStore({
          store,
          epic_owner_target_path,
          epic_owner_target_confirmed,
          epic_owner_confirmationEvidence,
        });
        const ownerStore = owner.store;
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
          ? await ownerStore.epics.create(epic_id, title, narrative, {
              epicScope,
            })
          : await ownerStore.epics.create(epic_id, title, narrative);
        const output = formatToolOutput({
          success: true,
          epic: formatEpic(epic),
        });
        return formatEpicRoutingOutput(output, owner, owner);
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
      ...epicOwnerTargetPathSchema,
    },
    execute: async (
      {
        epic_id,
        view,
        epic_owner_target_path,
        epic_owner_target_confirmed,
        epic_owner_confirmationEvidence,
      }: {
        epic_id: string;
        view?: "compact" | "full";
        epic_owner_target_path?: string;
        epic_owner_target_confirmed?: true;
        epic_owner_confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      try {
        const owner = await resolveEpicOwnerStore({
          store,
          epic_owner_target_path,
          epic_owner_target_confirmed,
          epic_owner_confirmationEvidence,
        });
        const loaded = await loadEpicWithRetiredProjection(
          owner.store,
          epic_id,
        );
        if (!loaded) return epicNotFound(epic_id);

        const isRetired = loaded.retiredProjection != null;
        const baseEpic = loaded.epic;

        // Render durable projection facts first. Retired snapshots are
        // read-only and skip convergence; the base render is always
        // available even when live evaluation is unreachable.
        let rendered = renderEpic(
          baseEpic,
          view ?? "compact",
          loaded.retiredProjection,
        );

        // rq-epicDirectConvergence01: advisory bounded direct convergence for
        // active Epics. This is best-effort and cannot block the base read.
        // Cross-project members and retired snapshots are skipped inside
        // convergeEpicOnShow.
        const unavailable: Array<{
          scope: string;
          status: "unavailable";
          reason: string;
        }> = [];
        if (!isRetired) {
          try {
            const ownerProjectId =
              owner.context?.projectId ??
              (await getProjectId(owner.store.paths.root));
            const converged = await convergeEpicOnShow(
              owner.store,
              baseEpic,
              ownerProjectId,
            );
            if (converged.repairs.length > 0) {
              // Preserve existing post-convergence rendering: repaired entries
              // are reflected in member_status and terminal summaries.
              rendered = renderEpic(
                converged.epic,
                view ?? "compact",
                loaded.retiredProjection,
              );
            }
          } catch (err) {
            const reason =
              err instanceof Error ? err.message : String(err ?? "");
            unavailable.push({
              scope: "membership_convergence",
              status: "unavailable",
              reason: `Live membership convergence is unreachable: ${reason}`,
            });
          }
        }

        // Advisory-only fast-follow lineage projection. Bounded by Epic entry
        // count, additive (never reorders/removes fields), and best-effort:
        // child-change load failures simply omit lineage for that entry.
        const enriched = await enrichEpicRenderWithFastFollowLineage(
          rendered,
          owner.store,
          baseEpic.entries,
        );
        const outputPayload: {
          success: true;
          epic: unknown;
          _unavailable?: Array<{
            scope: string;
            status: "unavailable";
            reason: string;
          }>;
        } = { success: true, epic: enriched };
        if (unavailable.length > 0) {
          outputPayload._unavailable = unavailable;
        }
        const output = formatToolOutput(outputPayload);
        return formatEpicRoutingOutput(output, owner, owner);
      } catch (err) {
        return epicError(err);
      }
    },
  },

  adv_epic_list: {
    description:
      "List active Epics by default, or enumerate retirement candidates/completed Epics without mutating state.",
    args: {
      status: z
        .enum(["active", "completed", "all"])
        .optional()
        .describe(
          "List mode: active (default, running active Epics), all (running Epics of any progress status), or completed (dry-run retirement candidates with blockers).",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Max Epics to return (default 50)."),
      offset: z.number().int().min(0).optional().describe("Pagination offset."),
      ...epicOwnerTargetPathSchema,
    },
    execute: async (
      {
        status,
        limit,
        offset,
        epic_owner_target_path,
        epic_owner_target_confirmed,
        epic_owner_confirmationEvidence,
      }: {
        status?: "active" | "completed" | "all";
        limit?: number;
        offset?: number;
        epic_owner_target_path?: string;
        epic_owner_target_confirmed?: true;
        epic_owner_confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      try {
        const owner = await resolveEpicOwnerStore({
          store,
          epic_owner_target_path,
          epic_owner_target_confirmed,
          epic_owner_confirmationEvidence,
        });
        const mode = status ?? "active";

        if (mode === "active" || mode === "all") {
          const epics = await owner.store.epics.list({
            status: mode === "active" ? "active" : "all",
          });
          const { items, pagination } = paginate(epics, {
            limit,
            offset,
            tool: "adv_epic_list",
          });
          const output = formatToolOutput({
            success: true,
            status_filter: mode,
            epics: items.map(formatEpic),
            pagination,
          });
          return formatEpicRoutingOutput(output, owner, owner);
        }

        // Completed-candidate dry-run report: use the existing store retirement
        // dry-run path to verify eligibility without mutating state. Eligible
        // Epics become candidates; ineligible Epics are reported as blocked.
        // AC4: if the live evaluation is unreachable, the entire completed-mode
        // report is typed as unavailable rather than returning an empty-success
        // result with zero candidates.
        const allRunning = await owner.store.epics.list({ status: "all" });
        const candidates: Array<{
          id: string;
          title: string;
          version: number;
          status: string;
          projection_status: string;
        }> = [];
        const blocked: Array<{
          id: string;
          title: string;
          status: string;
          code: string;
          reason: string;
          blockers?: Array<{ entry_id: string; kind: string; reason: string }>;
        }> = [];

        for (const epic of allRunning) {
          try {
            const projection = await owner.store.epics.retire(epic.id, {
              expectedVersion: epic.version,
              evidence: "completed-candidate dry-run report",
              retiredBy: "agent",
              dryRun: true,
            });
            candidates.push({
              id: epic.id,
              title: epic.title,
              version: epic.version,
              status: epic.progress.status,
              projection_status: projection.projection_status,
            });
          } catch (err) {
            const typed = err as {
              code?: string;
              message?: string;
              blockers?: Array<{
                entry_id: string;
                kind: string;
                reason: string;
              }>;
            };
            if (isEpicRetirementEvaluationUnavailableError(err)) {
              return formatEpicRoutingOutput(
                formatToolOutput({
                  success: false,
                  error: `Completed-candidate evaluation is unavailable: ${typed.message ?? String(err)}`,
                  code: "epic_retirement_unavailable",
                  status_filter: "completed",
                  _unavailable: [
                    {
                      scope: "completed_candidate_evaluation",
                      status: "unavailable",
                      reason:
                        typed.message ??
                        "Live Epic workflow is unreachable; cannot evaluate retirement candidates.",
                    },
                  ],
                }),
                owner,
                owner,
              );
            }
            blocked.push({
              id: epic.id,
              title: epic.title,
              status: epic.progress.status,
              code: typed.code ?? "unknown",
              reason: typed.message ?? String(err),
              blockers: typed.blockers,
            });
          }
        }

        const { items: pageItems, pagination } = paginate(candidates, {
          limit,
          offset,
          tool: "adv_epic_list",
        });

        const output = formatToolOutput({
          success: true,
          status_filter: "completed",
          report: {
            candidates: pageItems,
            total_candidates: candidates.length,
            blocked,
          },
          pagination,
        });
        return formatEpicRoutingOutput(output, owner, owner);
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
      ...epicOwnerTargetPathSchema,
    },
    execute: async (
      {
        epic_id,
        title,
        narrative,
        expected_version,
        epic_owner_target_path,
        epic_owner_target_confirmed,
        epic_owner_confirmationEvidence,
      }: {
        epic_id: string;
        title?: string;
        narrative?: string;
        expected_version: number;
        epic_owner_target_path?: string;
        epic_owner_target_confirmed?: true;
        epic_owner_confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      if (title === undefined && narrative === undefined) {
        return formatToolOutput({
          error: "At least one of title or narrative must be provided.",
        });
      }
      try {
        const owner = await resolveEpicOwnerStore({
          store,
          epic_owner_target_path,
          epic_owner_target_confirmed,
          epic_owner_confirmationEvidence,
        });
        const epic = await owner.store.epics.update(epic_id, {
          title,
          narrative,
          expectedVersion: expected_version,
        });
        const output = formatToolOutput({
          success: true,
          epic: formatEpic(epic),
        });
        return formatEpicRoutingOutput(output, owner, owner);
      } catch (err) {
        return epicError(err);
      }
    },
  },

  adv_epic_add_shell: {
    description:
      "Add a lightweight shell entry to an Epic roadmap. Shells represent future work and carry a title + success hint for later promotion. When backlog_ref is provided, title and success_hint are derived from the backlog item unless explicitly supplied.",
    args: {
      epic_id: EPIC_ID_SCHEMA,
      backlog_ref: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Repo backlog item id to import. When present, title and success_hint default to the backlog item values.",
        ),
      title: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Shell title displayed in roadmap. Required when backlog_ref is absent.",
        ),
      success_hint: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Rough success/AC hint used during promotion and planning. Required when backlog_ref is absent.",
        ),
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
      blocked_by: z
        .array(WorkNodeRefSchema)
        .default([])
        .describe(
          "Same-project hard prerequisite edges. Shell promotion is refused while any prereq is nonterminal.",
        ),
      context_packet: z
        .unknown()
        .optional()
        .describe(
          "Optional durable future-work context packet. Validated and persisted on the shell entry.",
        ),
      ...epicOwnerTargetPathSchema,
    },
    execute: async (
      {
        epic_id,
        backlog_ref,
        title,
        success_hint,
        entry_id,
        order,
        blocked_by,
        context_packet,
        epic_owner_target_path,
        epic_owner_target_confirmed,
        epic_owner_confirmationEvidence,
      }: {
        epic_id: string;
        backlog_ref?: string;
        title?: string;
        success_hint?: string;
        entry_id?: string;
        order?: number;
        blocked_by?: WorkNodeRef[];
        context_packet?: unknown;
        epic_owner_target_path?: string;
        epic_owner_target_confirmed?: true;
        epic_owner_confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      try {
        const owner = await resolveEpicOwnerStore({
          store,
          epic_owner_target_path,
          epic_owner_target_confirmed,
          epic_owner_confirmationEvidence,
        });

        const epic = await loadEpic(owner.store, epic_id);

        let validatedContextPacket: FutureWorkContextPacket | undefined;
        if (context_packet !== undefined) {
          try {
            const packet = parsePacket(context_packet);
            assertPacketSize(packet);
            if (epic) {
              const existingShells = epic.entries.filter(
                (e): e is Extract<EpicEntry, { kind: "shell" }> =>
                  e.kind === "shell",
              );
              const incomingBytes = Buffer.byteLength(
                JSON.stringify(packet),
                "utf8",
              );
              assertEpicAggregatePackets(existingShells, incomingBytes);
            }
            validatedContextPacket = packet;
          } catch (err) {
            return contextPacketError(err);
          }
        }

        let importedFrom:
          | { backlog_id: string; imported_at: string }
          | undefined;
        let finalTitle = title;
        let finalSuccessHint = success_hint;

        if (backlog_ref) {
          const backlogItem = await getBacklogItem(
            owner.store.paths.root,
            backlog_ref,
            true,
          );
          if (!backlogItem) {
            return formatToolOutput({
              success: false,
              error: `Backlog item not found: ${backlog_ref}`,
              code: "backlog_not_found",
            });
          }
          if (backlogItem.status === "archived") {
            return formatToolOutput({
              success: false,
              error: `Cannot import archived backlog item: ${backlog_ref}`,
              code: "backlog_archived",
            });
          }
          finalTitle = finalTitle ?? backlogItem.title;
          finalSuccessHint = finalSuccessHint ?? backlogItem.success_hint;
          importedFrom = {
            backlog_id: backlog_ref,
            imported_at: new Date().toISOString(),
          };
        }

        if (!finalTitle || !finalSuccessHint) {
          return formatToolOutput({
            success: false,
            error:
              "title and success_hint are required when backlog_ref is absent.",
            code: "missing_required_fields",
          });
        }

        const sourceRef: WorkNodeRef = {
          kind: "epic_entry",
          epic_id: epic_id,
          entry_id: entry_id ?? `shell-${Date.now()}`,
        };
        const d3Ctx = await buildD3ContextFromStore(owner.store);
        const d3Result = enforceD3ForShellAdd(
          sourceRef,
          blocked_by ?? [],
          d3Ctx,
        );
        if (!d3Result.ok) {
          return formatToolOutput({
            success: false,
            error: formatD3Error(d3Result.error),
            code: d3Result.error.code,
            ...(d3Result.error.code === "SHELL_PREREQ_NONTERMINAL" ||
            d3Result.error.code === "DEP_PREREQ_NONTERMINAL"
              ? {
                  blocking_refs: (
                    d3Result.error as { blocking_refs: WorkNodeRef[] }
                  ).blocking_refs,
                }
              : {}),
          });
        }

        const entry = await owner.store.epics.addShell(epic_id, {
          entryId: entry_id,
          title: finalTitle,
          successHint: finalSuccessHint,
          order,
          importedFrom,
          blockedBy: blocked_by,
          ...(validatedContextPacket !== undefined
            ? { context_packet: validatedContextPacket }
            : {}),
        });
        const output = formatToolOutput({
          success: true,
          entry: mapEpicEntry(entry),
        });
        return formatEpicRoutingOutput(output, owner, owner);
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
      ...epicOwnerTargetPathSchema,
    },
    execute: async (
      {
        epic_id,
        entry_id,
        change_id,
        promoted_by,
        epic_owner_target_path,
        epic_owner_target_confirmed,
        epic_owner_confirmationEvidence,
      }: {
        epic_id: string;
        entry_id: string;
        change_id?: string;
        promoted_by?: string;
        epic_owner_target_path?: string;
        epic_owner_target_confirmed?: true;
        epic_owner_confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      try {
        const owner = await resolveEpicOwnerStore({
          store,
          epic_owner_target_path,
          epic_owner_target_confirmed,
          epic_owner_confirmationEvidence,
        });
        const ownerStore = owner.store;
        const epic = await loadEpic(ownerStore, epic_id);
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

        // Refuse promotion when same-project prerequisites are nonterminal.
        // Edges are validated at shell-add time; promotion only checks terminal
        // status.
        const d3Ctx = await buildD3ContextFromStore(ownerStore);
        const d3Result = enforceD3ForShellPromote(
          shell.blocked_by ?? [],
          d3Ctx,
        );
        if (!d3Result.ok) {
          return formatToolOutput({
            success: false,
            error: formatD3Error(d3Result.error),
            code: d3Result.error.code,
            blocking_refs: (d3Result.error as { blocking_refs: WorkNodeRef[] })
              .blocking_refs,
          });
        }

        let contextPacketAppendix: { section: string; note?: string } = {
          section: "",
        };
        let finalChangeId = change_id;
        if (!finalChangeId) {
          if (owner.context !== null && ownerStore !== store) {
            return formatEpicOwnerRoutingError({
              code: "UNSUPPORTED_EPIC_ROUTING_SHAPE",
              error:
                "Remote child change creation during shell promotion is not supported. Provide an existing change_id from the Epic owner project.",
              ownerContext: owner.context,
            });
          }
          contextPacketAppendix = buildContextPacketSection(
            shell.context_packet,
          );
          const proposal = `# ${shell.title}\n\n## Intent\n\n${shell.success_hint}\n\n## Scope\n\n- Promoted from Epic ${epic_id} shell ${entry_id}.\n${contextPacketAppendix.section}`;
          const problemStatement = `## Problem\n\n${shell.title}\n\n## Success Criteria\n\n${shell.success_hint}\n`;
          const createResult = await ownerStore.changes.create(shell.title, {
            artifacts: { proposal, problemStatement },
          });
          finalChangeId = createResult.changeId;
        }

        const promotion = await ownerStore.epics.promoteShell(
          epic_id,
          entry_id,
          finalChangeId,
          promoted_by ?? "agent",
        );
        finalChangeId = promotion.changeId;

        const promotedEpic = await loadEpic(ownerStore, epic_id);
        const promotedEntry = promotedEpic
          ? findChangeEntry(promotedEpic, {
              mode: "entry_id",
              entryId: promotion.entryId,
            })
          : undefined;
        if (!promotedEntry) {
          return formatToolOutput({
            success: false,
            error: `Promoted Epic entry not found: ${promotion.entryId}`,
            code: "PROMOTED_ENTRY_NOT_FOUND",
            entry_id: promotion.entryId,
            change_id: promotion.changeId,
          });
        }

        const membership = setEpicOwnerProjectId(
          membershipFromChangeEntry(
            epic_id,
            promotedEntry,
            shell.title,
            "promote_shell",
          ),
          owner,
        );
        const projectionError = await applyChildEpicMembership(
          owner,
          owner,
          promotion.changeId,
          membership,
          promotedEntry,
        );
        if (projectionError) return projectionError;

        const output = formatToolOutput({
          success: true,
          entry_id: promotion.entryId,
          change_id: finalChangeId,
          promoted: true,
          note: [
            `Shell '${shell.title}' promoted to change ${finalChangeId}.`,
            contextPacketAppendix.note,
          ]
            .filter(Boolean)
            .join(" "),
        });
        return formatEpicRoutingOutput(output, owner, owner);
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
      epic_owner_target_path: targetPathSchema.shape.target_path.describe(
        "Optional absolute path to the Epic owner ADV project. When provided, resolves the Epic in that project instead of the current one.",
      ),
      epic_owner_target_confirmed:
        targetPathSchema.shape.target_confirmed.describe(
          "Required for untrusted epic_owner_target_path mutation. Confirms the Epic owner project was explicitly approved.",
        ),
      epic_owner_confirmationEvidence:
        targetPathSchema.shape.confirmationEvidence.describe(
          "Required with epic_owner_target_confirmed for untrusted epic_owner_target_path mutation. Cite user approval evidence.",
        ),
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
        epic_owner_target_path,
        epic_owner_target_confirmed,
        epic_owner_confirmationEvidence,
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
        epic_owner_target_path?: string;
        epic_owner_target_confirmed?: true;
        epic_owner_confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      try {
        const routing = await resolveEpicRoutingStores(store, {
          epic_owner_target_path,
          epic_owner_target_confirmed,
          epic_owner_confirmationEvidence,
          target_path,
          target_confirmed,
          confirmationEvidence,
        });
        const ownerStore = routing.owner.store;
        const childStore = routing.child;

        const shapeError = validateEpicRoutingShape(
          store.paths.root,
          routing.owner,
          routing.child,
        );
        if (shapeError) {
          return formatEpicOwnerRoutingError({
            ...shapeError,
            ownerContext: routing.owner.context,
            childContext: routing.child.context,
          });
        }

        const change = await loadChange(childStore.store, change_id);
        if (!change) {
          if (
            routing.owner.context !== null &&
            childStore.store === routing.owner.store
          ) {
            return formatToolOutput({
              error: `Change not found in Epic owner project. Provide target_path for the child project: ${change_id}`,
              code: EPIC_OWNER_ROUTING_ERROR_CODES.CHILD_ROUTING_REQUIRED,
            });
          }
          return formatToolOutput({
            error: `Change not found: ${change_id}`,
            code: "CHANGE_NOT_FOUND",
          });
        }

        const requestedEntryId = entry_id ?? change.epic_membership?.entry_id;

        if (change.epic_membership) {
          const membership = change.epic_membership;
          if (
            membership.epic_id !== epic_id ||
            membership.entry_id !== requestedEntryId
          ) {
            return changeAlreadyInEpic(change);
          }

          const currentEpic = await loadEpic(ownerStore, epic_id);
          if (!currentEpic) {
            if (
              routing.owner.context === null &&
              routing.child.context !== null
            ) {
              return formatToolOutput({
                error: `Epic not found in current project. Provide epic_owner_target_path for the Epic owner project: ${epic_id}`,
                code: EPIC_OWNER_ROUTING_ERROR_CODES.OWNER_ROUTING_AMBIGUOUS,
              });
            }
            return epicNotFound(epic_id);
          }

          const parentEntry = findChangeEntry(currentEpic, {
            mode: "entry_id",
            entryId: membership.entry_id,
          });
          const parentChangeId = parentEntry
            ? getEpicEntryChangeId(parentEntry)
            : undefined;

          if (!parentEntry) {
            const linkedEntry = requireChangeEntry(
              await ownerStore.epics.linkChange(epic_id, {
                entryId: membership.entry_id,
                changeId: change_id,
                title: title ?? change.title,
                order,
                linkedBy: linked_by ?? "agent",
                linkEvidence: link_evidence,
                changeProjectId: childStore.context?.projectId,
                repoId: repo_id ?? membership.repo_id,
                targetPath: childStore.context?.root,
              }),
            );
            const { entry, terminalSummary, projected } =
              await projectTerminalStateForLinkedEntry(
                ownerStore,
                epic_id,
                linkedEntry,
                change,
                link_evidence,
              );
            const rebuiltMembership = setEpicOwnerProjectId(
              membershipFromChangeEntry(
                epic_id,
                entry,
                title ?? change.title,
                "link_existing",
              ),
              routing.owner,
            );
            const projectionError = await applyChildEpicMembership(
              childStore,
              routing.owner,
              change_id,
              rebuiltMembership,
              entry,
            );
            if (projectionError) return projectionError;
            const output = formatToolOutput({
              success: true,
              rebuilt: true,
              entry: mapEpicEntry(entry),
              epic_membership: rebuiltMembership,
              ...(projected
                ? {
                    terminal_summary_projected: true,
                    terminal_summary: terminalSummary,
                  }
                : {}),
              member_status: memberStatusForEntry(entry),
            });
            return formatEpicRoutingOutput(
              output,
              routing.owner,
              routing.child,
            );
          }

          if (parentChangeId && parentChangeId !== change_id) {
            const changeRef = childStore.context
              ? {
                  change_id: change_id,
                  project_id: childStore.context.projectId,
                  ...((repo_id ?? membership.repo_id)
                    ? { repo_id: repo_id ?? membership.repo_id }
                    : {}),
                  target_path: childStore.context.root,
                }
              : undefined;
            const retargetedLinkedEntry = requireChangeEntry(
              await ownerStore.epics.retargetChange(epic_id, {
                entryId: membership.entry_id,
                fromChangeId: parentChangeId,
                toChangeId: change_id,
                title: title ?? change.title,
                ...(changeRef ? { changeRef } : {}),
                retargetedBy: linked_by ?? "agent",
                retargetEvidence: link_evidence,
              }),
            );
            const {
              entry: retargetedEntry,
              terminalSummary,
              projected,
            } = await projectTerminalStateForLinkedEntry(
              ownerStore,
              epic_id,
              retargetedLinkedEntry,
              change,
              link_evidence,
            );
            const retargetedMembership = setEpicOwnerProjectId(
              membershipFromChangeEntry(
                epic_id,
                retargetedEntry,
                title ?? change.title,
                "link_existing",
              ),
              routing.owner,
            );
            const projectionError = await applyChildEpicMembership(
              childStore,
              routing.owner,
              change_id,
              retargetedMembership,
              retargetedEntry,
            );
            if (projectionError) return projectionError;
            const output = formatToolOutput({
              success: true,
              retargeted: true,
              repaired: true,
              entry: mapEpicEntry(retargetedEntry),
              epic_membership: retargetedMembership,
              ...(projected
                ? {
                    terminal_summary_projected: true,
                    terminal_summary: terminalSummary,
                  }
                : {}),
              member_status: memberStatusForEntry(retargetedEntry),
            });
            return formatEpicRoutingOutput(
              output,
              routing.owner,
              routing.child,
            );
          }

          const {
            entry: refreshedEntry,
            terminalSummary,
            projected,
          } = await projectTerminalStateForLinkedEntry(
            ownerStore,
            epic_id,
            parentEntry,
            change,
            link_evidence,
          );
          const refreshedMembership = setEpicOwnerProjectId(
            membershipFromChangeEntry(
              epic_id,
              refreshedEntry,
              title ?? change.title,
              "link_existing",
            ),
            routing.owner,
          );
          const projectionError = await applyChildEpicMembership(
            childStore,
            routing.owner,
            change_id,
            refreshedMembership,
            refreshedEntry,
          );
          if (projectionError) return projectionError;
          const output = formatToolOutput({
            success: true,
            idempotent: true,
            entry: mapEpicEntry(refreshedEntry),
            epic_membership: refreshedMembership,
            ...(projected
              ? {
                  terminal_summary_projected: true,
                  terminal_summary: terminalSummary,
                }
              : {}),
            member_status: memberStatusForEntry(refreshedEntry),
          });
          return formatEpicRoutingOutput(output, routing.owner, routing.child);
        }

        const currentEpic = await loadEpic(ownerStore, epic_id);
        if (!currentEpic) {
          if (
            routing.owner.context === null &&
            routing.child.context !== null
          ) {
            return formatToolOutput({
              error: `Epic not found in current project. Provide epic_owner_target_path for the Epic owner project: ${epic_id}`,
              code: EPIC_OWNER_ROUTING_ERROR_CODES.OWNER_ROUTING_AMBIGUOUS,
            });
          }
          return epicNotFound(epic_id);
        }
        const existingEntry = findChangeEntry(currentEpic, {
          mode: "entry_id_or_change_id",
          changeId: change_id,
        });
        if (existingEntry) {
          const {
            entry: finalEntry,
            terminalSummary,
            projected,
          } = await projectTerminalStateForLinkedEntry(
            ownerStore,
            epic_id,
            existingEntry,
            change,
            link_evidence,
          );
          const membership = setEpicOwnerProjectId(
            membershipFromChangeEntry(
              epic_id,
              finalEntry,
              title ?? change.title,
              "link_existing",
            ),
            routing.owner,
          );
          const projectionError = await applyChildEpicMembership(
            childStore,
            routing.owner,
            change_id,
            membership,
            finalEntry,
            // Re-linking an entry that already exists: the child's projection
            // should already name it. Stating that expectation turns a child
            // that has drifted to another Epic into a typed conflict instead
            // of a silent overwrite. A child with no projection yet is not a
            // conflict, so the rebuild case still works.
            { epic_id, entry_id: finalEntry.entry_id },
          );
          if (projectionError) return projectionError;
          const output = formatToolOutput({
            success: true,
            idempotent: true,
            entry: mapEpicEntry(finalEntry),
            epic_membership: membership,
            ...(projected
              ? {
                  terminal_summary_projected: true,
                  terminal_summary: terminalSummary,
                }
              : {}),
            member_status: memberStatusForEntry(finalEntry),
          });
          return formatEpicRoutingOutput(output, routing.owner, routing.child);
        }

        const linkedEntry = requireChangeEntry(
          await ownerStore.epics.linkChange(epic_id, {
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
        const { entry, terminalSummary, projected } =
          await projectTerminalStateForLinkedEntry(
            ownerStore,
            epic_id,
            linkedEntry,
            change,
            link_evidence,
          );
        const membership = setEpicOwnerProjectId(
          membershipFromChangeEntry(
            epic_id,
            entry,
            title ?? change.title,
            "link_existing",
          ),
          routing.owner,
        );
        const projectionError = await applyChildEpicMembership(
          childStore,
          routing.owner,
          change_id,
          membership,
          entry,
        );
        if (projectionError) return projectionError;
        const output = formatToolOutput({
          success: true,
          entry: mapEpicEntry(entry),
          epic_membership: membership,
          ...(projected
            ? {
                terminal_summary_projected: true,
                terminal_summary: terminalSummary,
              }
            : {}),
          member_status: memberStatusForEntry(entry),
        });
        return formatEpicRoutingOutput(output, routing.owner, routing.child);
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
      epic_owner_target_path: targetPathSchema.shape.target_path.describe(
        "Optional absolute path to the Epic owner ADV project. When provided, resolves the Epic in that project instead of the current one.",
      ),
      epic_owner_target_confirmed:
        targetPathSchema.shape.target_confirmed.describe(
          "Required for untrusted epic_owner_target_path mutation. Confirms the Epic owner project was explicitly approved.",
        ),
      epic_owner_confirmationEvidence:
        targetPathSchema.shape.confirmationEvidence.describe(
          "Required with epic_owner_target_confirmed for untrusted epic_owner_target_path mutation. Cite user approval evidence.",
        ),
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
        epic_owner_target_path,
        epic_owner_target_confirmed,
        epic_owner_confirmationEvidence,
      }: {
        epic_id: string;
        entry_id?: string;
        change_id?: string;
        unlink_evidence: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
        epic_owner_target_path?: string;
        epic_owner_target_confirmed?: true;
        epic_owner_confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      try {
        const routing = await resolveEpicRoutingStores(store, {
          epic_owner_target_path,
          epic_owner_target_confirmed,
          epic_owner_confirmationEvidence,
          target_path,
          target_confirmed,
          confirmationEvidence,
        });
        const ownerStore = routing.owner.store;
        const childStore = routing.child;

        const shapeError = validateEpicRoutingShape(
          store.paths.root,
          routing.owner,
          routing.child,
        );
        if (shapeError) {
          return formatEpicOwnerRoutingError({
            ...shapeError,
            ownerContext: routing.owner.context,
            childContext: routing.child.context,
          });
        }

        const epic = await loadEpic(ownerStore, epic_id);
        if (!epic) {
          if (
            routing.owner.context === null &&
            routing.child.context !== null
          ) {
            return formatToolOutput({
              error: `Epic not found in current project. Provide epic_owner_target_path for the Epic owner project: ${epic_id}`,
              code: EPIC_OWNER_ROUTING_ERROR_CODES.OWNER_ROUTING_AMBIGUOUS,
            });
          }
          return epicNotFound(epic_id);
        }
        const entry = findChangeEntry(epic, {
          mode: "entry_id_or_change_id",
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
        await childStore.store.changes.clearEpicMembership(finalChangeId, {
          expected: { epic_id, entry_id: entry.entry_id },
        });
        try {
          await ownerStore.epics.unlinkChange(
            epic_id,
            entry.entry_id,
            unlink_evidence,
          );
        } catch (err) {
          const causeMessage = err instanceof Error ? err.message : String(err);
          return formatEpicRoutingOutput(
            formatToolOutput({
              success: false,
              error: `Child projection cleared but Epic unlink failed: ${causeMessage}. The next adv_epic_show will run bounded direct convergence (rq-epicConvergence01) to reconcile.`,
              code: EPIC_OWNER_ROUTING_ERROR_CODES.MEMBERSHIP_PARTIAL_FAILURE,
              child_projection_cleared: true,
              owner_unlink_failed: true,
              entry_id: entry.entry_id,
              change_id: finalChangeId,
              repair_action:
                "adv_epic_show convergence (automatic; rq-epicConvergence01)",
            }),
            routing.owner,
            routing.child,
          );
        }
        const output = formatToolOutput({
          success: true,
          entry_id: entry.entry_id,
          change_id: finalChangeId,
          unlinked: true,
        });
        return formatEpicRoutingOutput(output, routing.owner, routing.child);
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
      epic_owner_target_path: targetPathSchema.shape.target_path.describe(
        "Optional absolute path to the Epic owner ADV project. When provided, resolves both source and destination Epics in that project instead of the current one.",
      ),
      epic_owner_target_confirmed:
        targetPathSchema.shape.target_confirmed.describe(
          "Required for untrusted epic_owner_target_path mutation. Confirms the Epic owner project was explicitly approved.",
        ),
      epic_owner_confirmationEvidence:
        targetPathSchema.shape.confirmationEvidence.describe(
          "Required with epic_owner_target_confirmed for untrusted epic_owner_target_path mutation. Cite user approval evidence.",
        ),
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
        epic_owner_target_path,
        epic_owner_target_confirmed,
        epic_owner_confirmationEvidence,
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
        epic_owner_target_path?: string;
        epic_owner_target_confirmed?: true;
        epic_owner_confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      try {
        const routing = await resolveEpicRoutingStores(store, {
          epic_owner_target_path,
          epic_owner_target_confirmed,
          epic_owner_confirmationEvidence,
          target_path,
          target_confirmed,
          confirmationEvidence,
        });
        const ownerStore = routing.owner.store;
        const childStore = routing.child;

        const shapeError = validateEpicRoutingShape(
          store.paths.root,
          routing.owner,
          routing.child,
        );
        if (shapeError) {
          return formatEpicOwnerRoutingError({
            ...shapeError,
            ownerContext: routing.owner.context,
            childContext: routing.child.context,
          });
        }

        const fromEpic = await loadEpic(ownerStore, from_epic_id);
        if (!fromEpic) {
          if (
            routing.owner.context === null &&
            routing.child.context !== null
          ) {
            return formatToolOutput({
              error: `Source Epic not found in current project. Provide epic_owner_target_path for the Epic owner project: ${from_epic_id}`,
              code: EPIC_OWNER_ROUTING_ERROR_CODES.OWNER_ROUTING_AMBIGUOUS,
            });
          }
          return epicNotFound(from_epic_id);
        }
        const toEpic = await loadEpic(ownerStore, to_epic_id);
        if (!toEpic) {
          if (
            routing.owner.context === null &&
            routing.child.context !== null
          ) {
            return formatToolOutput({
              error: `Destination Epic not found in current project. Provide epic_owner_target_path for the Epic owner project: ${to_epic_id}`,
              code: EPIC_OWNER_ROUTING_ERROR_CODES.OWNER_ROUTING_AMBIGUOUS,
            });
          }
          return epicNotFound(to_epic_id);
        }
        const sourceEntry = findChangeEntry(fromEpic, {
          mode: "entry_id_or_change_id",
          entryId: from_entry_id,
          changeId: change_id,
        });
        if (!sourceEntry) {
          return formatToolOutput({
            error: `Source entry not found in Epic ${from_epic_id}`,
            code: "ENTRY_NOT_FOUND",
          });
        }
        const change = await loadChange(childStore.store, change_id);
        if (!change) {
          if (routing.owner.context !== null && !target_path) {
            return childRoutingRequiredForSameOwnerChange(change_id);
          }
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
          await ownerStore.epics.linkChange(to_epic_id, {
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
        const membership = setEpicOwnerProjectId(
          membershipFromChangeEntry(
            to_epic_id,
            destEntry,
            change.title,
            "move",
          ),
          routing.owner,
        );
        const projectionError = await applyChildEpicMembership(
          childStore,
          routing.owner,
          change_id,
          membership,
          destEntry,
          {
            epic_id: from_epic_id,
            entry_id: sourceEntry.entry_id,
          },
        );
        if (projectionError) return projectionError;
        try {
          await ownerStore.epics.unlinkChange(
            from_epic_id,
            sourceEntry.entry_id,
            move_evidence,
          );
        } catch (err) {
          const causeMessage = err instanceof Error ? err.message : String(err);
          return formatEpicRoutingOutput(
            formatToolOutput({
              success: false,
              error: `Child projection updated but source Epic unlink failed: ${causeMessage}. The next adv_epic_show will run bounded direct convergence (rq-epicConvergence01) to reconcile.`,
              code: EPIC_OWNER_ROUTING_ERROR_CODES.MEMBERSHIP_PARTIAL_FAILURE,
              owner_partially_mutated: true,
              source_unlink_failed: true,
              from_entry_id: sourceEntry.entry_id,
              to_entry: mapEpicEntry(destEntry),
              epic_membership: membership,
              repair_action:
                "adv_epic_show convergence (automatic; rq-epicConvergence01)",
            }),
            routing.owner,
            routing.child,
          );
        }
        const output = formatToolOutput({
          success: true,
          from_entry_id: sourceEntry.entry_id,
          to_entry: mapEpicEntry(destEntry),
          epic_membership: membership,
          moved: true,
        });
        return formatEpicRoutingOutput(output, routing.owner, routing.child);
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
      ...epicOwnerTargetPathSchema,
    },
    execute: async (
      {
        epic_id,
        entry_ids,
        expected_version,
        epic_owner_target_path,
        epic_owner_target_confirmed,
        epic_owner_confirmationEvidence,
      }: {
        epic_id: string;
        entry_ids: string[];
        expected_version: number;
        epic_owner_target_path?: string;
        epic_owner_target_confirmed?: true;
        epic_owner_confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      try {
        const owner = await resolveEpicOwnerStore({
          store,
          epic_owner_target_path,
          epic_owner_target_confirmed,
          epic_owner_confirmationEvidence,
        });
        const epic = await owner.store.epics.reorder(
          epic_id,
          entry_ids,
          expected_version,
        );
        const output = formatToolOutput({
          success: true,
          epic: formatEpic(epic),
        });
        return formatEpicRoutingOutput(output, owner, owner);
      } catch (err) {
        return epicError(err);
      }
    },
  },

  adv_epic_retire: {
    description:
      "Retire a completed Epic. Fires the terminal archive signal, persists a retired projection, and returns the retirement summary. Requires evidence and expected_version. Use dryRun to preview eligibility without mutating state.",
    args: {
      epic_id: EPIC_ID_SCHEMA,
      expected_version: z
        .number()
        .int()
        .min(0)
        .describe("Current Epic version from adv_epic_show."),
      evidence: z
        .string()
        .trim()
        .min(1)
        .describe("Required non-blank audit evidence for the retirement."),
      retired_by: z
        .string()
        .trim()
        .min(1)
        .optional()
        .default("agent")
        .describe("Identity retiring the Epic. Defaults to agent."),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "Preview retirement eligibility and projection without firing the archive signal or persisting state.",
        ),
      ...epicOwnerTargetPathSchema,
    },
    execute: async (
      {
        epic_id,
        expected_version,
        evidence,
        retired_by,
        dryRun,
        epic_owner_target_path,
        epic_owner_target_confirmed,
        epic_owner_confirmationEvidence,
      }: {
        epic_id: string;
        expected_version: number;
        evidence: string;
        retired_by?: string;
        dryRun?: boolean;
        epic_owner_target_path?: string;
        epic_owner_target_confirmed?: true;
        epic_owner_confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      try {
        const owner = await resolveEpicOwnerStore({
          store,
          epic_owner_target_path,
          epic_owner_target_confirmed,
          epic_owner_confirmationEvidence,
        });
        const projection = await owner.store.epics.retire(epic_id, {
          expectedVersion: expected_version,
          evidence,
          retiredBy: retired_by ?? "agent",
          dryRun: dryRun ?? false,
        });
        const output = formatToolOutput({
          success: true,
          epic_id,
          dryRun: dryRun ?? false,
          epic: formatEpic(projection.epic_snapshot),
          retired: {
            retired_at: projection.retired_at,
            retired_by: projection.retired_by,
            evidence: projection.evidence,
            source_workflow_id: projection.source_workflow_id,
            source_version: projection.source_version,
            projection_status: projection.projection_status,
          },
        });
        return formatEpicRoutingOutput(output, owner, owner);
      } catch (err) {
        return epicError(err);
      }
    },
  },
};
