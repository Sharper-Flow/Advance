/**
 * Epic membership direct convergence primitives.
 *
 * Epic entries own desired child membership; child `epic_membership` is
 * derived and rebuildable.
 * `adv_epic_show` and other access points call these primitives to observe
 * authoritative + derived state and produce a typed convergence result
 * instead of trusting a stale stored Epic-side `membership_status`.
 *
 * The primitives are pure: callers own store reads/writes and apply the
 * optional `repair` within their own bounded budget. Conflict refusal is
 * always preferred over overwrite.
 */
import type { Change, EpicEntry } from "../types";
import type { EpicMembershipVerification } from "../types/epics";
export type { EpicMembershipVerification } from "../types/epics";

export type ChildObservation =
  | { kind: "present"; change: Change }
  | { kind: "absent" }
  | { kind: "unreachable" };

export type ConvergenceStatus =
  /** Child truth matches Epic intent; no repair needed. */
  | "ok"
  /** Epic entry status is stale relative to child truth; entry can be repaired. */
  | "stale"
  /** Child project temporarily unreachable; retry on next access. */
  | "target_unreachable"
  /** Child project reachable but no matching projection; derived state can be rebuilt. */
  | "projection_missing"
  /** Child carries conflicting membership; refuse overwrite and surface to operator. */
  | "conflict";

export interface ConvergenceObservation {
  epic_entry_status: Extract<
    EpicEntry,
    { kind: "change" }
  >["membership_status"];
  child_epic_membership: NonNullable<Change["epic_membership"]> | null;
  child_terminal: {
    status: "archived" | "closed";
    completed_at: string;
  } | null;
}

export type ConvergenceRepairKind =
  /** Mark the Epic entry's membership_status as "linked" to match verified child. */
  | "mark_entry_linked"
  /** Mark the Epic entry's membership_status as "terminal" and backfill terminal_summary. */
  | "mark_entry_terminal"
  /** Sync the child change's epic_membership projection from the Epic entry. */
  | "sync_child_projection"
  /** Clear the child change's epic_membership projection (entry is unlinked). */
  | "clear_child_projection";

export type ConvergenceRepairTarget = "epic_entry" | "child";

export interface ConvergenceRepair {
  kind: ConvergenceRepairKind;
  target: ConvergenceRepairTarget;
  /** Expected membership to write for sync_child_projection. */
  expected_membership?: NonNullable<Change["epic_membership"]>;
  /** Terminal summary to write for mark_entry_terminal. */
  terminal_summary?: { status: "archived" | "closed"; completed_at: string };
}

export interface EpicMembershipConvergenceInput {
  entry: Extract<EpicEntry, { kind: "change" }>;
  /** Epic ID that owns the entry. Used to build expected_membership. */
  epic_id: string;
  child: ChildObservation;
  /** Optional override for `last_checked_at` (ISO); defaults to now. */
  checkedAt?: string;
}

export interface EpicMembershipConvergenceResult {
  status: ConvergenceStatus;
  last_checked_at: string;
  message: string;
  observed: ConvergenceObservation;
  /** Repair action the caller may apply within bounded budget. */
  repair?: ConvergenceRepair;
}

/**
 * Resolve the change ID an Epic change entry names, preferring the flat
 * `change_id` over the `change_ref` projection.
 */
export function getEpicEntryChangeId(
  entry: Extract<EpicEntry, { kind: "change" }>,
): string | undefined {
  return entry.change_id ?? entry.change_ref?.change_id;
}

/**
 * Selector for {@link findChangeEntry}.
 *
 * The mode is explicit and structural: `entry_id` cannot carry a `changeId`,
 * so a caller holding only an entry_id can never resolve an entry through a
 * change_id collision. Callers reconciling a child against its owner Epic —
 * where either identifier may be the surviving one — opt into the wider
 * `entry_id_or_change_id` match deliberately.
 */
export type EpicEntryQuery =
  | { mode: "entry_id"; entryId?: string }
  | { mode: "entry_id_or_change_id"; entryId?: string; changeId?: string };

export interface EpicMembershipLookup {
  kind: "available" | "unavailable";
  changeId?: string;
  localProjectId?: string | null;
  epic?: { entries: EpicEntry[]; retired: boolean };
}

/**
 * Find the Epic change entry a selector names.
 *
 * Non-change entries are never returned in any mode: shell entries share the
 * `entry_id` namespace, and returning one would hand callers an entry with no
 * child to project onto.
 *
 * Empty-string and absent selectors match nothing rather than falling through
 * to the first change entry.
 */
export function findChangeEntry(
  epic: { entries: EpicEntry[] },
  query: EpicEntryQuery,
): Extract<EpicEntry, { kind: "change" }> | undefined {
  const entryId = query.entryId ? query.entryId : undefined;
  const changeId =
    query.mode === "entry_id_or_change_id" && query.changeId
      ? query.changeId
      : undefined;
  if (!entryId && !changeId) return undefined;

  return epic.entries.find(
    (entry): entry is Extract<EpicEntry, { kind: "change" }> => {
      if (entry.kind !== "change") return false;
      if (entryId && entry.entry_id === entryId) return true;
      if (changeId && getEpicEntryChangeId(entry) === changeId) return true;
      return false;
    },
  );
}

/**
 * Classify the read-time truth of a child's stored Epic membership.
 *
 * This function is deliberately pure. The caller performs one bounded Epic
 * lookup and supplies either its result or an unavailable marker. Missing
 * entries on active Epics are actionable residue; retired Epics preserve
 * verified history when their entry is still present.
 */
export function classifyMembershipVerification(
  membership: NonNullable<Change["epic_membership"]>,
  epicLookup: EpicMembershipLookup,
): EpicMembershipVerification {
  if (epicLookup.kind === "unavailable") return "unknown";

  const { epic, localProjectId, changeId } = epicLookup;
  const foreignProjectId = membership.epic_project_id;
  if (
    typeof foreignProjectId === "string" &&
    foreignProjectId.length > 0 &&
    ((typeof localProjectId === "string" &&
      localProjectId.length > 0 &&
      foreignProjectId !== localProjectId) ||
      !epic)
  ) {
    return "owner_foreign";
  }

  if (!epic) return "owner_missing";

  const matchingEntry = findChangeEntry(epic, {
    mode: "entry_id_or_change_id",
    entryId: membership.entry_id,
    changeId,
  });
  if (matchingEntry) return "verified";
  return epic.retired ? "owner_missing" : "entry_missing";
}

/**
 * Derive a child membership projection from the authoritative Epic entry.
 * Seed arguments select the entry; they do not supply projection content.
 */
export function membershipFromChangeEntry(
  epicId: string,
  entry: Extract<EpicEntry, { kind: "change" }>,
  fallbackTitle: string,
  source: NonNullable<Change["epic_membership"]>["source"],
): NonNullable<Change["epic_membership"]> {
  const membership: NonNullable<Change["epic_membership"]> = {
    epic_id: epicId,
    entry_id: entry.entry_id,
    order: entry.order,
    title: entry.title ?? fallbackTitle,
    linked_at: entry.linked_at ?? new Date().toISOString(),
    source,
  };
  if (entry.change_ref?.repo_id) {
    membership.repo_id = entry.change_ref.repo_id;
  }
  return membership;
}

/**
 * Decide whether an Epic change entry belongs to a project other than the
 * Epic owner's, and so must be left to mutation-time and operator paths
 * rather than converged locally.
 *
 * `change_ref.project_id` records the project the child lives in. It is
 * written whenever the link had a resolved child context — including when
 * the child lives in the SAME project as a remote-owner Epic, where child
 * and owner stores are one and the same. Treating any recorded project as
 * foreign therefore strands same-project entries at projection_pending
 * forever, so the comparison must be against the owner's own project id.
 *
 * An unresolvable owner id yields `true`: without an identity to compare,
 * converging risks writing through the wrong store, and skipping preserves
 * the entry's existing membership_status untouched.
 */
export function isForeignProjectEntry(
  entry: Extract<EpicEntry, { kind: "change" }>,
  ownerProjectId: string | null | undefined,
): boolean {
  const entryProjectId = entry.change_ref?.project_id;
  if (typeof entryProjectId !== "string" || entryProjectId === "") return false;
  if (!ownerProjectId) return true;
  return entryProjectId !== ownerProjectId;
}

function buildExpectedMembership(
  entry: Extract<EpicEntry, { kind: "change" }>,
  epicId: string,
  linkedAt: string,
): NonNullable<Change["epic_membership"]> {
  const title = typeof entry.title === "string" ? entry.title : "Linked Change";
  return {
    epic_id: epicId,
    entry_id: entry.entry_id,
    order: entry.order,
    title,
    linked_at: linkedAt,
  };
}

/**
 * Classify the convergence state of one Epic change entry vs observed child.
 *
 * Pure function: no I/O. Callers apply the optional repair within their
 * own bounded budget. Conflict refusal is always preferred over overwrite.
 *
 * Decision matrix:
 *
 *  Child unreachable            → target_unreachable, no repair
 *  Child absent + entry linked  → conflict (cannot verify or rebuild)
 *  Child absent + entry pending → projection_missing (cannot rebuild safely)
 *  Child absent + entry unlinked→ ok (mutual absence)
 *
 *  Child present (terminal) + entry not terminal + membership matches
 *                               → stale, repair=mark_entry_terminal
 *
 *  Child present + membership matches + entry linked
 *                               → ok
 *  Child present + membership matches + entry status drifted (pending/stale)
 *                               → stale, repair=mark_entry_linked
 *
 *  Child present + membership mismatched entry_id
 *                               → conflict (refuse child overwrite)
 *
 *  Child present + no projection + entry linked/pending/stale
 *                               → projection_missing, repair=sync_child_projection
 *  Child present + no projection + entry unlinked
 *                               → ok (mutual absence)
 *  Child present + no projection + entry target_unreachable
 *                               → projection_missing, repair=sync_child_projection
 *
 *  Entry unlinked + child still has matching projection
 *                               → conflict, repair=clear_child_projection
 */
// Classify an Epic change entry against child membership and emit a bounded repair.
export function convergeEpicMembership(
  input: EpicMembershipConvergenceInput,
): EpicMembershipConvergenceResult {
  const { entry, child, epic_id } = input;
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const observed: ConvergenceObservation = {
    epic_entry_status: entry.membership_status,
    child_epic_membership: null,
    child_terminal: null,
  };

  if (child.kind === "present") {
    observed.child_epic_membership = child.change.epic_membership ?? null;
    if (
      child.change.status === "archived" ||
      child.change.status === "closed"
    ) {
      const completedAt =
        child.change.archived_at ??
        child.change.closed_at ??
        child.change.updated_at ??
        checkedAt;
      observed.child_terminal = {
        status: child.change.status,
        completed_at: typeof completedAt === "string" ? completedAt : checkedAt,
      };
    }
  }

  // Case 1: child project temporarily unreachable.
  if (child.kind === "unreachable") {
    return {
      status: "target_unreachable",
      last_checked_at: checkedAt,
      message:
        "Target project is unreachable; convergence deferred until next access.",
      observed,
    };
  }

  // Case 2: child project reachable but change absent.
  if (child.kind === "absent") {
    if (
      entry.membership_status === "linked" ||
      entry.membership_status === "terminal"
    ) {
      return {
        status: "conflict",
        last_checked_at: checkedAt,
        message:
          "Epic entry claims linked/terminal membership but the child change cannot be found; resolve explicitly.",
        observed,
      };
    }
    if (entry.membership_status === "unlinked") {
      return {
        status: "ok",
        last_checked_at: checkedAt,
        message: "Child change absent and Epic entry is unlinked; consistent.",
        observed,
      };
    }
    return {
      status: "projection_missing",
      last_checked_at: checkedAt,
      message:
        "Child change not found; Epic membership cannot be verified or rebuilt.",
      observed,
    };
  }

  // Case 3: child present. Compare actual child epic_membership against entry.
  const childMembership = observed.child_epic_membership;
  const childTerminal = observed.child_terminal;
  const entryId = entry.entry_id;

  // Sub-case 3a: entry is unlinked. Child state determines outcome.
  if (entry.membership_status === "unlinked") {
    if (childMembership && childMembership.entry_id === entryId) {
      // Entry was unlinked but child still believes; require explicit clear.
      return {
        status: "conflict",
        last_checked_at: checkedAt,
        message:
          "Epic entry is unlinked but child still carries a projection; clear child or relink explicitly.",
        observed,
        repair: {
          kind: "clear_child_projection",
          target: "child",
        },
      };
    }
    // Child has no matching projection; entry unlinked state is consistent.
    return {
      status: "ok",
      last_checked_at: checkedAt,
      message:
        "Epic entry is unlinked and child has no matching projection; consistent.",
      observed,
    };
  }

  // Sub-case 3b: child is terminal and entry has not adopted terminal status.
  // Backfill entry from child truth.
  if (
    childTerminal &&
    entry.membership_status !== "terminal" &&
    childMembership &&
    childMembership.entry_id === entryId
  ) {
    return {
      status: "stale",
      last_checked_at: checkedAt,
      message:
        "Child is terminal but Epic entry has not adopted terminal status; backfill available.",
      observed,
      repair: {
        kind: "mark_entry_terminal",
        target: "epic_entry",
        terminal_summary: childTerminal,
      },
    };
  }

  // Sub-case 3c: child has matching membership projection.
  if (
    childMembership &&
    childMembership.entry_id === entryId &&
    childMembership.epic_id === epic_id
  ) {
    if (entry.membership_status === "linked") {
      return {
        status: "ok",
        last_checked_at: checkedAt,
        message: "Child projection is linked.",
        observed,
      };
    }
    if (entry.membership_status === "terminal" && childTerminal) {
      return {
        status: "ok",
        last_checked_at: checkedAt,
        message: "Child projection is terminal and matches Epic entry.",
        observed,
      };
    }
    // Entry status drift (projection_pending, projection_stale, target_unreachable)
    // but child truth says linked. Repair the entry.
    return {
      status: "stale",
      last_checked_at: checkedAt,
      message:
        "Child projection matches Epic entry but entry status is stale; mark entry linked.",
      observed,
      repair: { kind: "mark_entry_linked", target: "epic_entry" },
    };
  }

  // Sub-case 3d: child has membership but mismatched entry_id or epic_id.
  // Refuse overwrite of child.
  if (
    childMembership &&
    (childMembership.entry_id !== entryId ||
      childMembership.epic_id !== epic_id)
  ) {
    return {
      status: "conflict",
      last_checked_at: checkedAt,
      message:
        "Child projection references a different Epic entry or Epic; refusing to overwrite child membership.",
      observed,
    };
  }

  // Sub-case 3e: child has no membership projection.
  if (!childMembership) {
    if (
      entry.membership_status === "linked" ||
      entry.membership_status === "terminal" ||
      entry.membership_status === "projection_pending" ||
      entry.membership_status === "projection_stale" ||
      entry.membership_status === "target_unreachable"
    ) {
      // Rebuild the derived child projection from Epic entry truth.
      const linkedAt =
        typeof entry.linked_at === "string" ? entry.linked_at : checkedAt;
      return {
        status: "projection_missing",
        last_checked_at: checkedAt,
        message:
          "Child is present but epic_membership projection is absent; rebuild from Epic entry.",
        observed,
        repair: {
          kind: "sync_child_projection",
          target: "child",
          expected_membership: buildExpectedMembership(
            entry,
            epic_id,
            linkedAt,
          ),
        },
      };
    }
    // Entry is in some other state (shouldn't happen since unlinked handled
    // above, but be exhaustive). Treat as conflict for safety.
  }

  // Fallback: cannot classify deterministically. Surface as conflict so
  // operators make the decision rather than silently guessing.
  return {
    status: "conflict",
    last_checked_at: checkedAt,
    message:
      "Epic membership state could not be classified automatically; resolve explicitly.",
    observed,
  };
}

/**
 * Helper for callers: produce the same shape as the legacy
 * `memberStatusForEntry` from a convergence result, so render paths can
 * switch without churn.
 */
export function legacyMemberStatusFromConvergence(
  result: EpicMembershipConvergenceResult,
): {
  status: "ok" | "target_unreachable" | "stale" | "projection_missing";
  last_checked_at: string;
  message: string;
} {
  switch (result.status) {
    case "ok":
      return {
        status: "ok",
        last_checked_at: result.last_checked_at,
        message: "Child projection is linked.",
      };
    case "target_unreachable":
      return {
        status: "target_unreachable",
        last_checked_at: result.last_checked_at,
        message:
          "Target project is unreachable; convergence deferred until next access.",
      };
    case "stale":
    case "conflict":
      return {
        status: "stale",
        last_checked_at: result.last_checked_at,
        message: result.message,
      };
    case "projection_missing":
      return {
        status: "projection_missing",
        last_checked_at: result.last_checked_at,
        message: result.message,
      };
  }
}
