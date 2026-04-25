/**
 * Content Search — substring/prefix matching for ADV changes and wisdom.
 *
 * Strategy: case-insensitive linear scan with on-demand lower-cased lookup.
 * No external dependency, no FTS index, no incremental update path.
 *
 * Why linear scan and not MiniSearch (the original P2.3 candidate)?
 *
 * Per `plugin/scripts/bench-content-search.ts` (run 2026-04-25 against a
 * synthetic 552-change dataset with ~1KB proposal bodies and 1000-iteration
 * query workload):
 *
 *   Strategy A: naive linear (case-sensitive)   p99 = 0.39ms  index = 0.00ms
 *   Strategy B: lower-cased linear (CI)         p99 = 0.41ms  index = 0.38ms
 *   Strategy C: MiniSearch                      <unavailable, dep not installed>
 *
 * Acceptance bar from design.md § KD-3: <500ms one-time index, <50ms p99
 * per query. Strategy B beats the bar by ~120×. Adopting MiniSearch would
 * add a dependency, a bundling concern (workflow-bundle scan), and an
 * incremental-index code path for zero observable speedup at this scale.
 *
 * Scaling note: linear scan is O(N×L) where N = number of changes/wisdom
 * entries, L = average content length. At 552 × 1KB this is well under
 * 1ms. If projects grow past ~10000 changes, revisit. The bench script is
 * shipped alongside this module so the decision is reproducible.
 */

import type { WisdomEntry, WisdomType } from "../types";

// =============================================================================
// Predicates
// =============================================================================

/**
 * Case-insensitive substring match on a title field.
 * Empty/undefined needle returns true (treats as "no filter applied").
 */
export function matchesTitleContains(
  title: string,
  needle: string | undefined,
): boolean {
  if (!needle) return true;
  return title.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Case-insensitive prefix match (anchored to start of haystack).
 * Empty/undefined needle returns true.
 */
export function matchesPrefix(
  haystack: string,
  needle: string | undefined,
): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().startsWith(needle.toLowerCase());
}

/**
 * Case-insensitive substring match across multiple text fields.
 * Returns true if any field contains the needle.
 */
export function matchesContent(
  title: string,
  bodyFields: string[],
  needle: string,
): boolean {
  if (!needle) return false;
  const lower = needle.toLowerCase();
  if (title.toLowerCase().includes(lower)) return true;
  for (const body of bodyFields) {
    if (body.toLowerCase().includes(lower)) return true;
  }
  return false;
}

// =============================================================================
// Filter helpers — used by store-temporal `changes.list`
// =============================================================================

export interface ChangeFilterShape {
  prefix?: string;
  titleContains?: string;
  createdBefore?: string;
  lastActivityBefore?: string;
}

export interface ChangeFilterable {
  id: string;
  title: string;
  created_at: string;
  lastActivityAt: string;
}

/**
 * Apply the supported substring/prefix/timestamp filters to a flat array of
 * changes. Used by `Store.changes.list({ filter })` in the Temporal-only
 * adapter.
 *
 * Filters AND-combine. An empty/undefined filter returns the input unchanged.
 */
export function filterChanges<T extends ChangeFilterable>(
  changes: T[],
  filter: ChangeFilterShape | undefined,
): T[] {
  if (!filter) return changes;
  const { prefix, titleContains, createdBefore, lastActivityBefore } = filter;

  let result = changes;
  if (prefix) {
    result = result.filter((c) => matchesPrefix(c.id, prefix));
  }
  if (titleContains) {
    result = result.filter((c) => matchesTitleContains(c.title, titleContains));
  }
  if (createdBefore) {
    result = result.filter((c) => c.created_at < createdBefore);
  }
  if (lastActivityBefore) {
    result = result.filter((c) => c.lastActivityAt < lastActivityBefore);
  }
  return result;
}

// =============================================================================
// Wisdom search
// =============================================================================

interface WisdomSearchOptions {
  changeId?: string;
  type?: WisdomType;
  limit?: number;
}

/**
 * Local wisdom-search shape covers both per-change wisdom (which has just
 * the WisdomEntry fields) and project-aggregated wisdom (which adds
 * `change_id` and `scope`).
 */
type WisdomCandidate = WisdomEntry & {
  scope?: string;
  change_id?: string;
};

/**
 * Linear-scan substring search across wisdom entries. Replaces the legacy
 * SQLite FTS path. Empty query returns [] (matching the legacy semantic
 * that an empty query is "show nothing", not "show everything").
 */
export function searchWisdom(
  entries: WisdomCandidate[],
  query: string,
  options: WisdomSearchOptions = {},
): WisdomCandidate[] {
  if (!query) return [];
  const lower = query.toLowerCase();
  const results: WisdomCandidate[] = [];
  for (const entry of entries) {
    if (options.type && entry.type !== options.type) continue;
    if (options.changeId && entry.change_id !== options.changeId) continue;
    if (!entry.content.toLowerCase().includes(lower)) continue;
    results.push(entry);
    if (options.limit !== undefined && results.length >= options.limit) {
      break;
    }
  }
  return results;
}
