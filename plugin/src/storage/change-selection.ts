/**
 * Change Selection Helper
 *
 * Pure function for resolving bulk-close target selections.
 * Shared between legacy and Temporal storage adapters to prevent filter drift.
 */

import type { BulkCloseSelector, Change, ChangeListResponse } from "../types";
import type { LoadResult } from "./json";

export interface SelectionDeps {
  list: (filter?: {
    status?: string;
    includeArchived?: boolean;
    includeClosed?: boolean;
  }) => Promise<ChangeListResponse>;
  get: (changeId: string) => Promise<LoadResult<Change | null>>;
}

export type SelectionResult =
  | { ok: true; changeIds: string[] }
  | { ok: false; error: string };

/**
 * Resolve a bulk-close selector into a validated list of change IDs.
 *
 * Returns SELECTION_ERROR if any target is invalid, ambiguous, protected,
 * or if the filter produces an empty result set.
 */
export async function resolveChangeSelection(
  selector: BulkCloseSelector,
  deps: SelectionDeps,
): Promise<SelectionResult> {
  if (selector.kind === "explicit") {
    return resolveExplicit(selector.changeIds, deps);
  }
  return resolveFilter(selector.filter, deps);
}

async function resolveExplicit(
  changeIds: string[],
  deps: SelectionDeps,
): Promise<SelectionResult> {
  const seen = new Set<string>();
  const resolved: string[] = [];

  for (const id of changeIds) {
    const result = await deps.get(id);
    if (!result.success || !result.data) {
      return {
        ok: false,
        error: `SELECTION_ERROR: ${result.success === false ? result.error : "Change not found"}`,
      };
    }

    const change = result.data;
    if (change.status !== "draft" && change.status !== "pending") {
      return {
        ok: false,
        error: `SELECTION_ERROR: Change "${change.id}" has protected status "${change.status}". Only draft or pending changes can be bulk-closed.`,
      };
    }

    if (seen.has(change.id)) {
      continue;
    }
    seen.add(change.id);
    resolved.push(change.id);
  }

  return { ok: true, changeIds: resolved };
}

async function resolveFilter(
  filter: Extract<BulkCloseSelector, { kind: "filter" }>["filter"],
  deps: SelectionDeps,
): Promise<SelectionResult> {
  const hasStaleness = filter.createdBefore || filter.lastActivityBefore;
  if (!filter.status && !hasStaleness) {
    return {
      ok: false,
      error: "SELECTION_ERROR: Filter-based bulk close requires either a status filter or a staleness filter (createdBefore / lastActivityBefore).",
    };
  }

  const listResult = await deps.list({ status: filter.status });
  let candidates = listResult.changes;

  if (filter.prefix) {
    candidates = candidates.filter((c) => c.id.startsWith(filter.prefix!));
  }
  if (filter.titleContains) {
    candidates = candidates.filter((c) =>
      c.title.includes(filter.titleContains!),
    );
  }

  let changeIds = candidates.map((c) => c.id);

  if (filter.createdBefore || filter.lastActivityBefore) {
    const fullChanges: Change[] = [];
    for (const id of changeIds) {
      const result = await deps.get(id);
      if (result.success && result.data) {
        fullChanges.push(result.data);
      }
    }

    if (filter.createdBefore) {
      const cutoff = new Date(filter.createdBefore).getTime();
      changeIds = fullChanges
        .filter((c) => new Date(c.created_at).getTime() < cutoff)
        .map((c) => c.id);
    }

    if (filter.lastActivityBefore) {
      const cutoff = new Date(filter.lastActivityBefore).getTime();
      const eligible = fullChanges.filter((c) => {
        const lastActivity = getLastActivityTimestamp(c);
        return lastActivity < cutoff;
      });
      // If both createdBefore and lastActivityBefore are present, intersect
      if (filter.createdBefore) {
        changeIds = eligible.map((c) => c.id);
      } else {
        changeIds = eligible.map((c) => c.id);
      }
    }
  }

  // Eligibility gating: all must be draft or pending
  for (const id of changeIds) {
    const result = await deps.get(id);
    if (result.success && result.data) {
      const status = result.data.status;
      if (status !== "draft" && status !== "pending") {
        return {
          ok: false,
          error: `SELECTION_ERROR: Change "${id}" has protected status "${status}". Only draft or pending changes can be bulk-closed.`,
        };
      }
    }
  }

  if (changeIds.length === 0) {
    return {
      ok: false,
      error: "SELECTION_ERROR: Empty result set — no changes matched the provided filter.",
    };
  }

  return { ok: true, changeIds };
}

function getLastActivityTimestamp(change: Change): number {
  let latest = new Date(change.created_at).getTime();

  if (change.batch_surfaced_at) {
    latest = Math.max(latest, new Date(change.batch_surfaced_at).getTime());
  }

  for (const task of change.tasks) {
    if (task.started_at) {
      latest = Math.max(latest, new Date(task.started_at).getTime());
    }
    if (task.completed_at) {
      latest = Math.max(latest, new Date(task.completed_at).getTime());
    }
  }

  if (change.gates) {
    for (const gate of Object.values(change.gates)) {
      if (gate.completed_at) {
        latest = Math.max(latest, new Date(gate.completed_at).getTime());
      }
    }
  }

  return latest;
}
