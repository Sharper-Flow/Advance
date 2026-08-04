/**
 * Resume projection kernel — pure function that builds a dependency-aware
 * "what to work on next" view from changes + Epics.
 *
 * Pure: no I/O, no signal, no store mutation. The caller (MCP tool adapter or
 * bin/adv adapter) loads data from the store and passes it here.
 *
 * rq-workGraphTypes01 (addDependencyAwareResume) — Phase E
 */

import type {
  WorkNodeRef,
  ResumeProjection,
  ResumeRow,
  CrossEpicRedirect,
  ResumeRowLifecycle,
} from "../types/work-graph";
import { detectCycles } from "../validator/cycle-detect";
import { nodeRefKey } from "../validator/work-graph-validation";

// =============================================================================
// Input types — lightweight read views the caller maps from store types
// =============================================================================

export interface ChangeNodeInput {
  id: string;
  title: string;
  status: "draft" | "archived" | "closed";
  lifecycleState: "open" | "archived" | "closed";
  same_project_dependencies: WorkNodeRef[];
  hasInProgressTasks: boolean;
  epic_membership?: {
    epic_id: string;
    entry_id: string;
    order: number;
  };
}

export interface ShellEntryInput {
  kind: "shell";
  entry_id: string;
  order: number;
  title: string;
  success_hint?: string;
  blocked_by: WorkNodeRef[];
}

export interface ChangeEntryInput {
  kind: "change";
  entry_id: string;
  order: number;
  title: string;
  change_id: string;
}

export type EpicEntryInput = ShellEntryInput | ChangeEntryInput;

export interface EpicNodeInput {
  id: string;
  title: string;
  entries: EpicEntryInput[];
}

// Re-export the canonical nodeRefKey from the validation module so all
// work-graph consumers use the same stable key function.
export { nodeRefKey };

// =============================================================================
// Internal node model
// =============================================================================

interface InternalNode {
  ref: WorkNodeRef;
  title: string;
  kind: "change" | "epic_shell";
  advisory_rank: number;
  is_terminal: boolean;
  is_active: boolean;
  hard_prereqs: WorkNodeRef[];
  source_epic_id?: string;
}

/**
 * Width of one Epic's advisory-rank band. Epic N occupies
 * `[N * EPIC_BAND_SPAN, (N + 1) * EPIC_BAND_SPAN)`, indexed by entry order.
 * Shell entries use the same formula inline, so this span is shared.
 *
 * Invariant: an Epic entry's `order` must be `< EPIC_BAND_SPAN`. Orders are
 * small sequence indices, so this holds in practice; an order at or beyond the
 * span would bleed one Epic's band into the next. That property predates
 * rq-epicAdvisoryRankReachability01 and is not introduced by unlinked ranking.
 */
const EPIC_BAND_SPAN = 10000;

/**
 * Rank for an unlinked change whose work is already in progress.
 *
 * Sits at the tail of the FIRST Epic band: it can surface ahead of
 * not-yet-started later-Epic work, but never displaces the leading Epic band.
 * Reachability, not promotion — see rq-epicAdvisoryRankReachability01.
 *
 * Deliberately fractional. Epic-derived ranks are always integers, so a
 * half-step cannot tie with any Epic entry — including an Epic-0 entry at the
 * band's last integer order. It still sorts strictly after every band-0 entry
 * and strictly before band 1.
 */
const UNLINKED_ACTIVE_RANK = EPIC_BAND_SPAN - 0.5;

// =============================================================================
// Kernel
// =============================================================================

/**
 * Build a resume projection from loaded changes + Epics.
 *
 * @param changes - All changes in scope (active + archived + closed)
 * @param epics - All Epics in scope (active + retired)
 * @param scope - `{ project_id, epic_ids? }` — when epic_ids is omitted, all
 *   Epics are considered
 * @returns A `ResumeProjection` with ordered_next, actionable, blocked, active,
 *   redirects, and diagnostics. Pure — does not mutate inputs or fire signals.
 */
export function buildResumeProjection(
  changes: ReadonlyArray<ChangeNodeInput>,
  epics: ReadonlyArray<EpicNodeInput>,
  scope: { project_id: string; epic_ids?: string[] },
): ResumeProjection {
  const scopedEpics = scope.epic_ids
    ? epics.filter((e) => scope.epic_ids!.includes(e.id))
    : epics;

  const nodes: InternalNode[] = [];

  // Index promoted Epic entries by their unique epic_id+entry_id key so shell
  // iteration can skip them in O(1) instead of scanning the change list each
  // time. This also makes the deduplication explicit and stable.
  const promotedEntryKeys = new Set<string>();
  for (const change of changes) {
    if (change.epic_membership) {
      promotedEntryKeys.add(
        nodeRefKey({
          kind: "epic_entry",
          epic_id: change.epic_membership.epic_id,
          entry_id: change.epic_membership.entry_id,
        }),
      );
    }
  }

  // Change nodes.
  for (const change of changes) {
    const ref: WorkNodeRef = {
      kind: "change",
      project_id: scope.project_id,
      change_id: change.id,
    };

    // A change is terminal when either its workflow status or lifecycleState
    // says so. We OR both fields because some legacy/projection paths only set
    // one of them, and the resume projection must be conservative (never treat
    // a terminal node as blocking).
    const isTerminal =
      change.status === "archived" ||
      change.status === "closed" ||
      change.lifecycleState === "archived" ||
      change.lifecycleState === "closed";

    nodes.push({
      ref,
      title: change.title,
      kind: "change",
      advisory_rank: computeChangeRank(change, scopedEpics),
      is_terminal: isTerminal,
      is_active: change.hasInProgressTasks && !isTerminal,
      hard_prereqs: change.same_project_dependencies,
      source_epic_id: change.epic_membership?.epic_id,
    });
  }

  // Shell-entry nodes (only those NOT yet promoted to a change).
  for (const epic of scopedEpics) {
    const epicIndex = scopedEpics.indexOf(epic);
    for (const entry of epic.entries) {
      if (entry.kind !== "shell") continue;

      const shellKey = nodeRefKey({
        kind: "epic_entry",
        epic_id: epic.id,
        entry_id: entry.entry_id,
      });
      // Skip shells that have already been promoted to a change.
      if (promotedEntryKeys.has(shellKey)) continue;

      const ref: WorkNodeRef = {
        kind: "epic_entry",
        epic_id: epic.id,
        entry_id: entry.entry_id,
      };

      nodes.push({
        ref,
        title: entry.title,
        kind: "epic_shell",
        advisory_rank: epicIndex * 10000 + entry.order,
        is_terminal: false, // shells are never terminal
        is_active: false, // shells are never active (no tasks)
        hard_prereqs: entry.blocked_by,
        source_epic_id: epic.id,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Step 2: Build a lookup for resolving prereqs → node status.
  // -------------------------------------------------------------------------

  const nodeByKey = new Map<string, InternalNode>();
  for (const node of nodes) {
    nodeByKey.set(nodeRefKey(node.ref), node);
  }

  // Also consider changes outside the node list (e.g., archived changes loaded
  // as terminal). For prereq resolution, a preref resolves if its key matches
  // any node in the lookup. If the prereq doesn't resolve, it's unresolved.
  const resolvePrereq = (
    prereq: WorkNodeRef,
  ): { node: InternalNode; resolved: true } | { resolved: false } => {
    const key = nodeRefKey(prereq);
    const node = nodeByKey.get(key);
    if (node) return { node, resolved: true };
    return { resolved: false };
  };

  // -------------------------------------------------------------------------
  // Step 3: Classify lifecycle and build result arrays.
  // -------------------------------------------------------------------------

  const actionable: ResumeRow[] = [];
  const blocked: ResumeRow[] = [];
  const activeList: ResumeRow[] = [];
  const unresolvedRefs: WorkNodeRef[] = [];
  const redirects: CrossEpicRedirect[] = [];

  for (const node of nodes) {
    if (node.is_terminal) continue; // done nodes are excluded from all lists

    // Resolve prerequisites.
    const blockingPrereqs: WorkNodeRef[] = [];
    for (const prereq of node.hard_prereqs) {
      const result = resolvePrereq(prereq);
      if (!result.resolved) {
        // Unresolved ref — collect for diagnostics.
        if (!unresolvedRefs.some((r) => nodeRefKey(r) === nodeRefKey(prereq))) {
          unresolvedRefs.push(prereq);
        }
        // Unresolved prereqs are treated as blocking (can't verify they're terminal).
        blockingPrereqs.push(prereq);
        continue;
      }
      if (!result.node.is_terminal) {
        blockingPrereqs.push(prereq);

        // Check for cross-Epic redirect: node in Epic A blocked by node in Epic B.
        if (
          node.source_epic_id &&
          result.node.source_epic_id &&
          node.source_epic_id !== result.node.source_epic_id
        ) {
          redirects.push({
            source_epic_id: node.source_epic_id,
            target_epic_id: result.node.source_epic_id,
            blocker_node: result.node.ref,
            blocked_node: node.ref,
          });
        }
      }
    }

    // Determine lifecycle.
    let lifecycle: ResumeRowLifecycle;
    if (node.is_active) {
      lifecycle = "active";
    } else if (blockingPrereqs.length > 0) {
      lifecycle = "blocked";
    } else if (node.kind === "change") {
      lifecycle = "ready_to_start";
    } else {
      lifecycle = "ready_to_promote";
    }

    const row: ResumeRow = {
      node: node.ref,
      title: node.title,
      kind: node.kind,
      lifecycle,
      advisory_rank: node.advisory_rank,
      blockers: blockingPrereqs,
      ...(node.source_epic_id ? { source_epic_id: node.source_epic_id } : {}),
      ...(lifecycle === "blocked" &&
      redirects.some((r) => r.blocked_node === node.ref)
        ? {
            target_epic_id: redirects.find((r) => r.blocked_node === node.ref)
              ?.target_epic_id,
          }
        : {}),
    };

    switch (lifecycle) {
      case "active":
        activeList.push(row);
        break;
      case "blocked":
        blocked.push(row);
        break;
      case "ready_to_start":
      case "ready_to_promote":
        actionable.push(row);
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: Compute ordered_next — first non-done node by advisory_rank.
  // -------------------------------------------------------------------------

  const allNonDone = nodes
    .filter((n) => !n.is_terminal)
    .sort((a, b) => a.advisory_rank - b.advisory_rank);

  let orderedNext: ResumeRow | null = null;
  if (allNonDone.length > 0) {
    const first = allNonDone[0];
    // Find the matching row in the appropriate array.
    const row =
      actionable.find((r) => nodeRefKey(r.node) === nodeRefKey(first.ref)) ??
      blocked.find((r) => nodeRefKey(r.node) === nodeRefKey(first.ref)) ??
      activeList.find((r) => nodeRefKey(r.node) === nodeRefKey(first.ref));

    if (row) {
      orderedNext = row;
    } else {
      // Shouldn't happen, but construct a minimal row.
      orderedNext = {
        node: first.ref,
        title: first.title,
        kind: first.kind,
        lifecycle: first.is_active ? "active" : "ready_to_start",
        advisory_rank: first.advisory_rank,
        blockers: [],
      };
    }
  }

  // -------------------------------------------------------------------------
  // Step 5: Sort lists by advisory_rank for stable output.
  // -------------------------------------------------------------------------

  const sortByRank = (a: ResumeRow, b: ResumeRow) =>
    a.advisory_rank - b.advisory_rank;

  actionable.sort(sortByRank);
  blocked.sort(sortByRank);
  activeList.sort(sortByRank);

  // -------------------------------------------------------------------------
  // Step 6: Diagnostics — cycle detection on the full graph.
  // -------------------------------------------------------------------------

  const cycleNodes: WorkNodeRef[] = nodes.map((n) => n.ref);
  const cycleDeps = new Map<string, WorkNodeRef[]>();
  for (const node of nodes) {
    cycleDeps.set(nodeRefKey(node.ref), node.hard_prereqs);
  }

  const { cycles: detectedCycles } = detectCycles<WorkNodeRef>(
    cycleNodes,
    (ref) => cycleDeps.get(nodeRefKey(ref)) ?? [],
    nodeRefKey,
  );

  // -------------------------------------------------------------------------
  // Step 7: Assemble projection.
  // -------------------------------------------------------------------------

  return {
    generated_at: new Date().toISOString(),
    scope: {
      project_id: scope.project_id,
      ...(scope.epic_ids ? { epic_ids: scope.epic_ids } : {}),
    },
    ordered_next: orderedNext,
    actionable,
    blocked,
    active: activeList,
    redirects,
    diagnostics: {
      cycles: detectedCycles,
      unresolved_refs: unresolvedRefs,
    },
  };
}

// =============================================================================
// Private helpers
// =============================================================================

function computeChangeRank(
  change: ChangeNodeInput,
  epics: ReadonlyArray<EpicNodeInput>,
): number {
  if (!change.epic_membership) return unlinkedRank(change, epics);
  const epicIndex = epics.findIndex(
    (e) => e.id === change.epic_membership!.epic_id,
  );
  if (epicIndex === -1) return unlinkedRank(change, epics);
  return epicIndex * EPIC_BAND_SPAN + change.epic_membership.order;
}

/**
 * Advisory rank for a change carrying no resolvable Epic membership.
 *
 * Epic membership is optional (rq-epicOptionalMembership01), so its absence
 * must not acquire gating authority over next-work visibility. Previously
 * these changes received `Number.MAX_SAFE_INTEGER`, which meant a single
 * Epic-linked change made every unlinked change permanently unreachable as
 * `ordered_next`.
 *
 * Rank is now conditional on the change's own strongest available signal —
 * whether work is already in progress — and is always finite:
 *
 * - in progress → tail of the first Epic band, ahead of later-Epic work
 * - idle        → after every Epic band, but still finite and reachable
 *
 * Epic-linked ranks are untouched, so relative order among Epic entries (and
 * alignment with shell entries, which share the band formula) is preserved.
 */
function unlinkedRank(
  change: ChangeNodeInput,
  epics: ReadonlyArray<EpicNodeInput>,
): number {
  if (change.hasInProgressTasks) return UNLINKED_ACTIVE_RANK;
  return (epics.length + 1) * EPIC_BAND_SPAN;
}
