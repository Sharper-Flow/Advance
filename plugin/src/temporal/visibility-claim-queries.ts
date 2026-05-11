/**
 * Visibility-API helpers for backlog-claim coordination (rq-backlogCoord01,
 * rq-backlogCoord02, rq-backlogCoord05).
 *
 * Pattern: queries Temporal Visibility on the per-change `AdvBacklogIssueNumber`
 * search attribute (added in task A1) plus `AdvAffectedProjects` for project
 * scope and `AdvChangeStatus` for non-terminal filter. The change workflow
 * itself IS the durable claim record — its non-terminal status proves the
 * claim is held; archive/close releases the claim automatically.
 *
 * Project-scope attribute: uses `AdvAffectedProjects` (the registered
 * KeywordList in `ADV_SEARCH_ATTRIBUTES`). The existing
 * `list-change-workflows.ts:buildVisibilityQuery` uses `AdvProjectId` which
 * is a pre-existing inconsistency (not in the registered set) — out of
 * scope to fix here; logged as agenda follow-up.
 */

import type { ChangeStatus } from "../types";

/**
 * Statuses considered "claim held" — non-terminal change states. Mirrors
 * `list-change-workflows.ts:DEFAULT_STATUSES` for consistency.
 */
const CLAIM_HELD_STATUSES: readonly ChangeStatus[] = [
  "draft",
  "pending",
  "active",
];

const CLAIM_HELD_STATUSES_LITERAL = CLAIM_HELD_STATUSES.map(
  (s) => `"${s}"`,
).join(", ");

const CHANGE_WORKFLOW_PREFIX = "adv/change/";

/**
 * Maximum issue numbers per Visibility call. Temporal Visibility queries
 * have an implementation-defined query-string length limit; 100 keyword
 * values per `IN (...)` clause stays comfortably under it while reducing
 * round-trips. Larger inputs are batched.
 */
const BULK_QUERY_CHUNK_SIZE = 100;

function escapeQueryValue(value: string): string {
  return value.replace(/"/g, '\\"');
}

export interface SingleClaimQueryOptions {
  projectId: string;
  issueNumber: number;
}

export interface BulkClaimQueryOptions {
  projectId: string;
  issueNumbers: number[];
}

export interface ClaimVisibilityResult {
  changeId: string;
}

/**
 * Minimal Visibility-list client shape. Real `@temporalio/client` Client
 * satisfies this structurally.
 */
export interface VisibilityListClient {
  workflow: {
    list: (opts: { query: string }) => AsyncIterable<{
      workflowId: string;
      searchAttributes?: Record<string, unknown>;
    }>;
  };
}

/**
 * Build the Visibility query for the single-issue claim collision check.
 *
 * rq-backlogCoord02: `adv_change_create` calls this before workflow start
 * to detect duplicate claims. The post-create double-check (5s window)
 * reuses the same query to catch eventual-consistency races.
 */
export function buildClaimVisibilityQuery(
  options: SingleClaimQueryOptions,
): string {
  const safeProjectId = escapeQueryValue(options.projectId);
  return [
    `AdvAffectedProjects = "${safeProjectId}"`,
    `AdvBacklogIssueNumber = "${options.issueNumber}"`,
    `AdvChangeStatus IN (${CLAIM_HELD_STATUSES_LITERAL})`,
  ].join(" AND ");
}

/**
 * Build the Visibility query for the bulk active-claims lookup. Returns
 * null when `issueNumbers` is empty so the caller skips the Temporal call.
 *
 * rq-backlogCoord05: replaces the O(n×m) `buildActiveChangeIndex` in
 * `plugin/src/tools/roadmap.ts` with a single Visibility query per chunk.
 */
export function buildActiveClaimsVisibilityQuery(
  options: BulkClaimQueryOptions,
): string | null {
  if (options.issueNumbers.length === 0) return null;
  const safeProjectId = escapeQueryValue(options.projectId);
  const issueLiterals = options.issueNumbers.map((n) => `"${n}"`).join(", ");
  return [
    `AdvAffectedProjects = "${safeProjectId}"`,
    `AdvBacklogIssueNumber IN (${issueLiterals})`,
    `AdvChangeStatus IN (${CLAIM_HELD_STATUSES_LITERAL})`,
  ].join(" AND ");
}

/**
 * Detect existing claims on a single issue. Used by `adv_change_create`
 * for pre-create and post-create collision detection (rq-backlogCoord02,
 * rq-backlogCoord03).
 */
export async function queryClaimsByIssueNumber(
  client: VisibilityListClient,
  projectId: string,
  issueNumber: number,
): Promise<ClaimVisibilityResult[]> {
  const query = buildClaimVisibilityQuery({ projectId, issueNumber });
  const projectPrefix = `${CHANGE_WORKFLOW_PREFIX}${projectId}/`;
  const results: ClaimVisibilityResult[] = [];

  for await (const wf of client.workflow.list({ query })) {
    const wfid = wf.workflowId;
    if (!wfid.startsWith(projectPrefix)) continue;
    const changeId = wfid.slice(projectPrefix.length);
    if (changeId.length === 0) continue;
    results.push({ changeId });
  }

  return results;
}

/**
 * Bulk lookup: which issue numbers have active changes? Returns a Map keyed
 * by issue number for O(1) annotation by callers (e.g., `adv_backlog_state`
 * active-change cross-reference replacing `buildActiveChangeIndex`).
 *
 * Implementation detail: chunks input into batches of 100 to stay under
 * Temporal Visibility query-string limits while minimizing round trips.
 * Empty input array skips the Temporal call entirely.
 */
export async function queryActiveChangesByIssueNumbers(
  client: VisibilityListClient,
  projectId: string,
  issueNumbers: number[],
): Promise<Map<number, ClaimVisibilityResult>> {
  const result = new Map<number, ClaimVisibilityResult>();
  if (issueNumbers.length === 0) return result;

  const projectPrefix = `${CHANGE_WORKFLOW_PREFIX}${projectId}/`;

  // Chunk to stay under query-string length limits.
  for (let i = 0; i < issueNumbers.length; i += BULK_QUERY_CHUNK_SIZE) {
    const chunk = issueNumbers.slice(i, i + BULK_QUERY_CHUNK_SIZE);
    const query = buildActiveClaimsVisibilityQuery({
      projectId,
      issueNumbers: chunk,
    });
    if (query === null) continue;

    for await (const wf of client.workflow.list({ query })) {
      const wfid = wf.workflowId;
      if (!wfid.startsWith(projectPrefix)) continue;
      const changeId = wfid.slice(projectPrefix.length);
      if (changeId.length === 0) continue;

      // Extract the issue number from search attributes when present.
      // Multiple changes per issue are not expected in normal operation
      // (atomic claim check at create time prevents it), but the race
      // window allows transient duplicates — first observed wins for the
      // map; callers detect duplicates via the single-issue query.
      const attrs = wf.searchAttributes;
      if (!attrs) continue;
      const rawValue = (attrs as Record<string, unknown>)[
        "AdvBacklogIssueNumber"
      ];
      const issueStr = Array.isArray(rawValue)
        ? String(rawValue[0])
        : typeof rawValue === "string"
          ? rawValue
          : null;
      if (issueStr === null) continue;
      const issueNumber = parseInt(issueStr, 10);
      if (Number.isNaN(issueNumber)) continue;

      if (!result.has(issueNumber)) {
        result.set(issueNumber, { changeId });
      }
    }
  }

  return result;
}
