/**
 * Validation-specific Store projection.
 *
 * Returns a typed conflict inventory in one bounded pass using capability data
 * already exposed by the Store's list surface, removing the duplicate
 * active-peer hydration loop from validation context loading.
 */

import type { Store } from "../../storage/store-types";
import type {
  ConflictInventory,
  ConflictInventoryEntry,
} from "../../validator/types";
import {
  remainingDeadlineMs,
  TemporalQueryTimeoutError,
  type TemporalReadDeadline,
} from "../../temporal/retry-wrapper";

export interface ValidationInventoryOptions {
  /**
   * Request-scoped aggregate deadline. When provided, every enumeration step is
   * admitted against the remaining budget.
   */
  deadline?: TemporalReadDeadline;
}

/**
 * Race a Store read against the remaining aggregate deadline. On expiry it
 * rejects with TemporalQueryTimeoutError so callers can record typed
 * incompleteness rather than hanging or returning a misleading fallback.
 */
export async function raceWithDeadline<T>(
  op: Promise<T>,
  deadline: TemporalReadDeadline | undefined,
): Promise<T> {
  if (!deadline) return op;

  const remaining = remainingDeadlineMs(deadline);
  if (remaining <= 0) {
    throw new TemporalQueryTimeoutError(deadline.budgetMs);
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      op,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new TemporalQueryTimeoutError(deadline.budgetMs)),
          remaining,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function hasIncompleteMetadata(
  listResult: Awaited<ReturnType<Store["changes"]["list"]>>,
): boolean {
  if (listResult.hydrationStats?.deadlineExceeded) return true;
  if (listResult.hydrationStats?.boundedOmitted) return true;
  if (
    listResult.warnings?.some(
      (w: { code?: string }) =>
        w.code === "SOURCE_DEADLINE_EXCEEDED" ||
        w.code === "SOURCE_BOUND_EXCEEDED",
    )
  )
    return true;
  return false;
}

function hasDegradedMetadata(
  listResult: Awaited<ReturnType<Store["changes"]["list"]>>,
): boolean {
  if (
    listResult.warnings?.some(
      (w: { code?: string }) =>
        w.code === "TERMINAL_SOURCE_DEGRADED" ||
        w.code === "TERMINAL_CANDIDATE_OMITTED",
    )
  )
    return true;
  return false;
}

/**
 * Build a bounded, one-pass validation inventory projection.
 *
 * Stably orders peers by id and derives conflict-inventory entries from the
 * Store's own list row, which now carries the capability names derived from
 * deltas in the same single read. No per-peer `store.changes.get` is performed.
 *
 * Incomplete Store enumeration metadata (deadline/bound/warnings) is
 * propagated to blocked or non-conclusive inventory state so validation can
 * never draw a clean conclusion from a truncated view.
 */
export async function loadValidationInventory(
  store: Store,
  changeId: string,
  options?: ValidationInventoryOptions,
): Promise<ConflictInventory> {
  const deadline = options?.deadline;
  const warnings: string[] = [];

  // 1. Enumerate changes with shared deadline admission.
  let changeList: Awaited<ReturnType<typeof store.changes.list>>;
  try {
    changeList = await raceWithDeadline(
      store.changes.list({ includeArchived: true, includeClosed: true }),
      deadline,
    );
  } catch (err) {
    warnings.push(
      `Change inventory source unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      entries: [],
      completeness: "blocked",
      warnings,
      source: "validation-inventory-projection",
      ownChangeId: changeId,
      canConcludeClean: false,
    };
  }

  // 2. Propagate Store-level incomplete metadata before any conclusion.
  if (hasIncompleteMetadata(changeList)) {
    const code = changeList.hydrationStats?.deadlineExceeded
      ? "deadline"
      : changeList.hydrationStats?.boundedOmitted
        ? "bound"
        : "source";
    warnings.push(
      `Store inventory enumeration is incomplete (${code}); peer capabilities may be missing.`,
    );
  }
  if (hasDegradedMetadata(changeList)) {
    warnings.push(
      "Store inventory enumeration reported degraded terminal sources; some rows may be incomplete.",
    );
  }

  // 3. Stable input ordering by id (DC2 / C3).
  const orderedSummaries = [...changeList.changes].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  // 4. Build lightweight inventory entries from the one-pass list row.
  //    Preserve presence/absence of capabilities structurally: if the Store
  //    exposed an explicit array (even empty), keep it; if it omitted the field,
  //    leave it undefined so downstream code can distinguish "no deltas" from
  //    "capabilities not exposed".
  const entries: ConflictInventoryEntry[] = orderedSummaries.map((summary) => {
    const isOwnChange = summary.id === changeId;
    const isArchived =
      summary.status === "archived" || summary.status === "closed";
    const entry: ConflictInventoryEntry = {
      id: summary.id,
      title: summary.title,
      status: summary.status,
      isArchived,
      isOwnChange,
      ...(summary.epic_membership
        ? {
            epic: {
              id: summary.epic_membership.epic_id,
              title: summary.epic_membership.title,
              entry_id: summary.epic_membership.entry_id,
            },
          }
        : {}),
    };
    if (summary.capabilities !== undefined) {
      entry.capabilities = summary.capabilities;
    }
    return entry;
  });

  // 5. Detect active non-own peers whose capabilities were not exposed by the
  //    Store without a second read. A peer with `capabilities: []` has zero
  //    deltas and is complete; a peer with *missing* capabilities is degraded.
  const peersWithoutCapabilities = entries
    .filter((e) => !e.isArchived && !e.isOwnChange)
    .filter((e) => e.capabilities === undefined);
  if (peersWithoutCapabilities.length > 0) {
    for (const peer of peersWithoutCapabilities) {
      warnings.push(
        `Peer change ${peer.id} capabilities not exposed by one-pass Store list; conflict detection may be incomplete.`,
      );
    }
  }

  let completeness: ConflictInventory["completeness"] = "complete";
  if (peersWithoutCapabilities.length > 0) {
    completeness = "degraded";
  }
  if (hasIncompleteMetadata(changeList)) {
    completeness = "non-conclusive";
  }
  if (hasDegradedMetadata(changeList) && completeness === "complete") {
    completeness = "degraded";
  }

  return {
    entries,
    completeness,
    warnings,
    source: "validation-inventory-projection",
    ownChangeId: changeId,
    canConcludeClean: completeness === "complete",
  };
}
