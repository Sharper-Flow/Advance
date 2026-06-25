/**
 * Visibility-API-backed change enumeration (P2.4 / rq-visibilityProjectScope01).
 *
 * Replaces the legacy `listChangeDirs(legacy.paths.changes)` cold-start
 * path with a Temporal-native query against the visibility store.
 *
 * Why Visibility, not disk-listing?
 *   - Disk-listing assumes the Temporal store and disk are in sync, which
 *     is the precise invariant breaking when a workflow is missing on the
 *     server but present on disk (P1.5 orphan case).
 *   - Visibility is the canonical source-of-truth for "which workflows
 *     exist right now". Pagination and filtering live there.
 *   - Memo (the in-memory summary cache) hydrates from the project
 *     workflow's `change_summaries` and is fed by per-change ChangeSummary
 *     signals — so the listed IDs from Visibility are mostly used at cold
 *     start before Memo warms up.
 *
 * Pagination: the Temporal SDK's `client.workflow.list({ query })` returns
 * an AsyncIterable that handles cursor-based pagination internally
 * (default page size 1000). Consumers iterate; the SDK fetches more pages
 * as needed. This module wraps the iteration with project-scoped
 * filtering and an optional hard `limit` cap.
 *
 * Search-attribute strategy: ADV registers `AdvAffectedProjects`
 * (KeywordList), `AdvLifecycleState` (Keyword), and `AdvChangeStatus`
 * (Keyword) as custom search attributes (see
 * `search-attributes.ts:ADV_SEARCH_ATTRIBUTES` and
 * `service.ts:registerAdvSearchAttributes`). The default visibility query
 * filters on project scope + `AdvLifecycleState = "open"` + running
 * executions. `AdvAffectedProjects` matches the backlog-claim Visibility
 * scope (`visibility-claim-queries.ts`) so list/claim paths use the same
 * registered attribute.
 */

import type { ChangeStatus } from "../types";
import {
  escapeVisibilityValue,
  isLegacyOpenStatusSet,
  openLifecycleVisibilityClauses,
} from "./lifecycle-visibility";
import { CHANGE_WORKFLOW_PREFIX } from "./contracts";

/**
 * Statuses included by default — `draft`, `pending`, `active`. Excludes
 * `archived` and `closed` to mirror the legacy `changes.list({}).changes`
 * default. Pass `null` to disable status filtering entirely (for archive
 * sweeps and audit tooling).
 */
const DEFAULT_STATUSES: readonly ChangeStatus[] = [
  "draft",
  "pending",
  "active",
];

export interface ListChangeWorkflowIdsOptions {
  projectId: string;
  /**
   * Statuses to include. Defaults to non-archived. Pass `null` to skip
   * the status filter entirely.
   */
  statuses?: ChangeStatus[] | null;
  /** Hard cap on result count — stops iteration early. */
  limit?: number;
}

/**
 * Minimal `Client` shape used by listChangeWorkflowIds. Real
 * `@temporalio/client` Client satisfies this structurally.
 */
export interface ListClient {
  workflow: {
    list: (opts: { query: string }) => AsyncIterable<{
      workflowId: string;
    }>;
  };
}

/**
 * Build the visibility-API query string for change-workflow enumeration.
 *
 * Exposed for testing (and for callers that need to tweak the query and
 * pass it directly to `client.workflow.list`).
 */
export function buildVisibilityQuery(
  options: ListChangeWorkflowIdsOptions,
): string {
  const { projectId, statuses } = options;
  const parts: string[] = [];

  // Escape double-quotes in projectId. SHA-based project IDs never
  // contain quotes in practice, but the safety net guards against
  // visibility-query injection if someone ever runs the sweep against a
  // user-supplied label.
  //
  // rq-visibilityProjectScope01 (advance-meta v1.12): filter on the
  // registered `AdvAffectedProjects` KeywordList rather than the legacy
  // `AdvProjectId` Keyword. KeywordList equality matches any element in
  // the list, so a single registered attribute serves both single-project
  // and multi-project change workflows. This converges list-change-workflows
  // with visibility-claim-queries on the same registered attribute.
  const safeProjectId = escapeVisibilityValue(projectId);
  parts.push(`AdvAffectedProjects = "${safeProjectId}"`);

  // statuses=null is the explicit "all statuses" mode; statuses=undefined
  // falls back to DEFAULT_STATUSES; statuses=[] also disables (no rows).
  const effectiveStatuses =
    statuses === null
      ? null
      : statuses && statuses.length > 0
        ? statuses
        : DEFAULT_STATUSES;

  if (effectiveStatuses) {
    if (isLegacyOpenStatusSet(effectiveStatuses)) {
      parts.push(...openLifecycleVisibilityClauses());
    } else {
      const list = effectiveStatuses.map((s) => `"${s}"`).join(", ");
      parts.push(`AdvChangeStatus IN (${list})`);
    }
  }

  return parts.join(" AND ");
}


/**
 * Return the change IDs for all change-workflows belonging to a project,
 * via Temporal Visibility API pagination.
 */
export async function listChangeWorkflowIds(
  client: ListClient,
  options: ListChangeWorkflowIdsOptions,
): Promise<string[]> {
  const query = buildVisibilityQuery(options);
  const projectPrefix = `${CHANGE_WORKFLOW_PREFIX}${options.projectId}/`;
  const limit = options.limit;
  const ids: string[] = [];

  for await (const wf of client.workflow.list({ query })) {
    const wfid = wf.workflowId;
    // Defensive: visibility may include workflows that match the search
    // attributes but use a non-change workflow ID format (e.g. project
    // workflows). Filter by the canonical `adv/change/{projectId}/` prefix.
    if (!wfid.startsWith(projectPrefix)) continue;
    const changeId = wfid.slice(projectPrefix.length);
    if (changeId.length === 0) continue;
    ids.push(changeId);
    if (limit !== undefined && ids.length >= limit) break;
  }

  return ids;
}
