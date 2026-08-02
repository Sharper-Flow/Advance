/**
 * rq-statusHealthCandidateOrientation01: source-backed global recency is
 * established before bounded hydration; cache warmth cannot rank candidates.
 *
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
import type { TemporalOperations } from "./operations";
import { makeTemporalOperationContext } from "./operations";

export interface SourceRankedCandidate {
  id: string;
  source: "visibility" | "disk";
  /** ISO 8601 timestamp from the source (AdvLastSignalAt for Visibility). */
  lastSignalAt?: string;
  /** ISO 8601 timestamp from the source (AdvCreatedAt for Visibility). */
  createdAt?: string;
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
  // Resolve each candidate's source-backed activity independently, then
  // compare globally. AdvLastSignalAt is the per-candidate primary signal;
  // AdvCreatedAt/durable created_at is its fallback. Presence of a
  // last-signal field must not make an older candidate outrank a newer
  // disk-only candidate with a valid creation timestamp.
  const aActivity = a.lastSignalAt ?? a.createdAt;
  const bActivity = b.lastSignalAt ?? b.createdAt;
  if (aActivity && bActivity) {
    const cmp = bActivity.localeCompare(aActivity);
    if (cmp !== 0) return cmp;
  } else if (aActivity) {
    return -1;
  } else if (bActivity) {
    return 1;
  }

  // Canonical-ID tie-break keeps ordering deterministic and independent of
  // enumeration or memo warmth.
  return a.id.localeCompare(b.id);
}

export async function listSourceRankedCandidates(
  owner: TemporalOperations,
  options: ListSourceRankedCandidatesOptions,
): Promise<ListSourceRankedCandidatesResult> {
  const { projectId, statuses, limit, diskCandidates = [] } = options;
  const projectPrefix = `${CHANGE_WORKFLOW_PREFIX}${projectId}/`;
  const effectiveLimit = limit ?? 10;

  const query = buildVisibilityQuery({ projectId, statuses });
  const ctx = makeTemporalOperationContext(
    projectId,
    "source-ranked-list",
    "list",
    "listSourceRankedCandidates",
    5_000,
  );
  const candidates: SourceRankedCandidate[] = [];
  const seenIds = new Set<string>();
  const result = await owner.list<{
    workflowId: string;
    searchAttributes?: Record<string, unknown>;
  }>(ctx, query, { limit: effectiveLimit * 2 });
  if (result.kind !== "complete") {
    throw result.error;
  }
  for (const record of result.value) {
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
