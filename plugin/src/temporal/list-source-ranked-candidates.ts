/**
 * Lightweight source-ranked candidate orientation for bounded health status.
 *
 * Enumerates change workflow candidates from registered Visibility search
 * attributes (AdvLastSignalAt, AdvCreatedAt precedence), merges durable
 * disk-only active projections, and ranks deterministically before hydration.
 *
 * Constraints:
 *   - Memo warmth never ranks or introduces candidates.
 *   - Invalid or missing source timestamps degrade visibly rather than being
 *     silently treated as recency.
 *   - Canonical IDs provide a stable deterministic tie-break.
 */

import type { ChangeStatus } from "../types";
import { CHANGE_WORKFLOW_PREFIX } from "./contracts";
import { buildVisibilityQuery } from "./list-change-workflows";

export interface SourceRankedCandidate {
  id: string;
  source: "visibility" | "disk";
  /** ISO 8601 timestamp from the source (AdvLastSignalAt for Visibility). */
  lastSignalAt?: string;
  /** ISO 8601 timestamp from the source (AdvCreatedAt for Visibility). */
  createdAt?: string;
}

export interface SourceRankedListClient {
  workflow: {
    list: (opts: { query: string }) => AsyncIterable<{
      workflowId: string;
      searchAttributes?: Record<string, unknown>;
    }>;
  };
}

export interface ListSourceRankedCandidatesOptions {
  projectId: string;
  statuses?: ChangeStatus[] | null;
  limit?: number;
  /** Durable active projections not currently visible in the running workflow set. */
  diskCandidates?: SourceRankedCandidate[];
}

export interface ListSourceRankedCandidatesResult {
  /** Admitted candidates in ranked order (only these may hydrate). */
  admitted: SourceRankedCandidate[];
  /** Total candidates not admitted. */
  omittedCount: number;
  /** Bounded deterministic sample of omitted IDs. */
  omittedIds: string[];
  /** Complete internal omitted set; callers must bound any public projection. */
  omittedCandidates: SourceRankedCandidate[];
  /** True when one or more candidates lacked valid source-backed timestamps. */
  degraded: boolean;
  /** IDs of candidates with missing or invalid timestamps. */
  missingTimestampIds: string[];
}

const BOUNDED_OMITTED_SAMPLE_LIMIT = 20;

function parseTimestamp(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return value.toISOString();
  }
  if (typeof value === "string") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString();
  }
  return undefined;
}

function extractTimestamp(
  searchAttributes: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (!searchAttributes) return undefined;
  const value = searchAttributes[key];
  if (Array.isArray(value)) {
    return parseTimestamp(value[0]);
  }
  return parseTimestamp(value);
}

function compareCandidates(
  a: SourceRankedCandidate,
  b: SourceRankedCandidate,
): number {
  // AdvLastSignalAt precedence: candidates with a valid lastSignalAt outrank
  // candidates without one, and timestamps are compared descending.
  if (a.lastSignalAt && b.lastSignalAt) {
    const cmp = b.lastSignalAt.localeCompare(a.lastSignalAt);
    if (cmp !== 0) return cmp;
  } else if (a.lastSignalAt) {
    return -1;
  } else if (b.lastSignalAt) {
    return 1;
  }

  // AdvCreatedAt fallback: used when lastSignalAt is missing or tied.
  if (a.createdAt && b.createdAt) {
    const cmp = b.createdAt.localeCompare(a.createdAt);
    if (cmp !== 0) return cmp;
  } else if (a.createdAt) {
    return -1;
  } else if (b.createdAt) {
    return 1;
  }

  // Canonical-ID tie-break keeps ordering deterministic and independent of
  // enumeration or memo warmth.
  return a.id.localeCompare(b.id);
}

export async function listSourceRankedCandidates(
  client: SourceRankedListClient,
  options: ListSourceRankedCandidatesOptions,
): Promise<ListSourceRankedCandidatesResult> {
  const { projectId, statuses, limit, diskCandidates = [] } = options;
  const projectPrefix = `${CHANGE_WORKFLOW_PREFIX}${projectId}/`;
  const effectiveLimit = limit ?? 10;

  const query = buildVisibilityQuery({ projectId, statuses });
  const candidates: SourceRankedCandidate[] = [];
  const seenIds = new Set<string>();

  for await (const record of client.workflow.list({ query })) {
    const wfid = record.workflowId;
    // Defensive prefix filter: Visibility may return workflows that match the
    // search attributes but belong to a different project or workflow type.
    if (!wfid.startsWith(projectPrefix)) continue;
    const changeId = wfid.slice(projectPrefix.length);
    if (changeId.length === 0) continue;
    if (seenIds.has(changeId)) continue;
    seenIds.add(changeId);

    candidates.push({
      id: changeId,
      source: "visibility",
      lastSignalAt: extractTimestamp(
        record.searchAttributes,
        "AdvLastSignalAt",
      ),
      createdAt: extractTimestamp(record.searchAttributes, "AdvCreatedAt"),
    });
  }

  // Merge durable disk-only projections. Visibility is authoritative for
  // running workflows; disk entries are only admitted when the ID is not already
  // visible.
  for (const candidate of diskCandidates) {
    if (seenIds.has(candidate.id)) continue;
    seenIds.add(candidate.id);
    candidates.push(candidate);
  }

  const ranked = [...candidates].sort(compareCandidates);

  const missingTimestampIds: string[] = [];
  for (const candidate of ranked) {
    if (!candidate.lastSignalAt && !candidate.createdAt) {
      missingTimestampIds.push(candidate.id);
    }
  }

  const admitted = ranked.slice(0, effectiveLimit);
  const omitted = ranked.slice(effectiveLimit);
  const omittedIds = omitted
    .map((c) => c.id)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, BOUNDED_OMITTED_SAMPLE_LIMIT);

  return {
    admitted,
    omittedCount: omitted.length,
    omittedIds,
    omittedCandidates: omitted,
    degraded: missingTimestampIds.length > 0,
    missingTimestampIds,
  };
}
