/**
 * Visibility-API helpers for Epic membership lookup (rq-epicTemporalConstraints01).
 *
 * Pattern: queries Temporal Visibility on the per-change `AdvEpicId` search
 * attribute (single-value Keyword) plus `AdvAffectedProjects` for project scope
 * and `AdvLifecycleState = "open"` + `ExecutionStatus = "Running"` for open
 * membership filtering. `AdvChangeStatus` remains compatibility/read-model
 * metadata and is not open-membership authority. The change workflow ID itself
 * carries the change ID, so callers can enumerate members without hydrating each
 * change.
 */

import type { ChangeStatus } from "../types";
import {
  escapeVisibilityValue,
  isLegacyOpenStatusSet,
  openLifecycleVisibilityClauses,
} from "./lifecycle-visibility";

/**
 * Legacy statuses treated as open for compatibility. Default membership reads
 * are lifecycle-based; pass `null` to disable filtering entirely (e.g. for
 * archive sweeps).
 */
const DEFAULT_STATUSES: readonly ChangeStatus[] = [
  "draft",
  "pending",
  "active",
];

const CHANGE_WORKFLOW_PREFIX = "adv/change/";

export interface EpicMembersQueryOptions {
  projectId: string;
  epicId: string;
  /**
   * Statuses to include. Defaults to open lifecycle. Legacy open statuses map
   * to lifecycle filtering. Pass `null` to skip the filter entirely.
   */
  statuses?: ChangeStatus[] | null;
}

export interface EpicMembersVisibilityClient {
  workflow: {
    list: (opts: { query: string }) => AsyncIterable<{
      workflowId: string;
    }>;
  };
}

/**
 * Build the Visibility query for active members of an Epic.
 *
 * rq-epicTemporalConstraints01: `AdvEpicId` is a single-value Keyword on
 * change workflows, derived from `state.epic_membership.epic_id`.
 */
export function buildEpicMembersVisibilityQuery(
  options: EpicMembersQueryOptions,
): string {
  const safeProjectId = escapeVisibilityValue(options.projectId);
  const safeEpicId = escapeVisibilityValue(options.epicId);
  const parts: string[] = [
    `AdvAffectedProjects = "${safeProjectId}"`,
    `AdvEpicId = "${safeEpicId}"`,
  ];

  const statuses =
    options.statuses === null
      ? null
      : options.statuses && options.statuses.length > 0
        ? options.statuses
        : DEFAULT_STATUSES;

  if (statuses) {
    if (isLegacyOpenStatusSet(statuses)) {
      parts.push(...openLifecycleVisibilityClauses());
    } else {
      const list = statuses.map((s) => `"${s}"`).join(", ");
      parts.push(`AdvChangeStatus IN (${list})`);
    }
  }

  return parts.join(" AND ");
}

export interface QueryChangeIdsByEpicIdOptions {
  /** Hard cap on result count — stops iteration early. */
  limit?: number;
  statuses?: ChangeStatus[] | null;
}

/**
 * Bounded lookup of change IDs belonging to an Epic.
 *
 * Returns change IDs only (extracted from workflow IDs) and never hydrates
 * the underlying change workflows. Use `limit` to bound the result set.
 */
export async function queryChangeIdsByEpicId(
  client: EpicMembersVisibilityClient,
  projectId: string,
  epicId: string,
  options: QueryChangeIdsByEpicIdOptions = {},
): Promise<string[]> {
  const query = buildEpicMembersVisibilityQuery({
    projectId,
    epicId,
    statuses: options.statuses,
  });
  const projectPrefix = `${CHANGE_WORKFLOW_PREFIX}${projectId}/`;
  const limit = options.limit;
  const ids: string[] = [];

  for await (const wf of client.workflow.list({ query })) {
    const wfid = wf.workflowId;
    if (!wfid.startsWith(projectPrefix)) continue;
    const changeId = wfid.slice(projectPrefix.length);
    if (changeId.length === 0) continue;
    ids.push(changeId);
    if (limit !== undefined && ids.length >= limit) break;
  }

  return ids;
}
