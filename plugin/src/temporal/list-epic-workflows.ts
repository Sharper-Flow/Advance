/**
 * Visibility-API-backed Epic enumeration.
 *
 * Mirrors list-change-workflows.ts but scopes to the Epic workflow type.
 * Epic workflows do not use custom search attributes; the workflow ID carries
 * project scope, so we enumerate by workflow type and filter the canonical
 * `adv/epic/{projectId}/` prefix in-process.
 * rq-epicCliList01
 */

import { EPIC_WORKFLOW_NAME, EPIC_WORKFLOW_PREFIX } from "./contracts";

export interface ListEpicWorkflowIdsOptions {
  projectId: string;
  /**
   * Active/default mode restricts the query to running executions only.
   * "all" returns every epicWorkflow execution and is used by richer MCP
   * candidate reports that hydrate state in-process.
   */
  status?: "active" | "all";
  /** Hard cap on result count — stops iteration early. */
  limit?: number;
}

/**
 * Minimal `Client` shape used by listEpicWorkflowIds.
 */
export interface ListEpicClient {
  workflow: {
    list: (opts: { query: string }) => AsyncIterable<{
      workflowId: string;
    }>;
  };
}

/**
 * Build the visibility-API query string for epic-workflow enumeration.
 *
 * Default active mode filters to running executions (`ExecutionStatus = "Running"`).
 * Retired/archived Epic workflows are no longer running, so they are
 * structurally excluded without per-Epic hydration (rq-epicRetiredListing01).
 */
export function buildEpicVisibilityQuery(
  _projectId: string,
  status: "active" | "all" = "active",
): string {
  const parts = [`WorkflowType = "${EPIC_WORKFLOW_NAME}"`];
  if (status === "active") {
    parts.push('ExecutionStatus = "Running"');
  }
  return parts.join(" AND ");
}

/**
 * Return the Epic IDs for epic-workflows belonging to a project,
 * via Temporal Visibility API pagination.
 *
 * Default `status` is "active", which enumerates running workflows only.
 */
export async function listEpicWorkflowIds(
  client: ListEpicClient,
  options: ListEpicWorkflowIdsOptions,
): Promise<string[]> {
  const query = buildEpicVisibilityQuery(options.projectId, options.status);
  const projectPrefix = `${EPIC_WORKFLOW_PREFIX}${options.projectId}/`;
  const limit = options.limit;
  const ids: string[] = [];

  for await (const wf of client.workflow.list({ query })) {
    const wfid = wf.workflowId;
    if (!wfid.startsWith(projectPrefix)) continue;
    const epicId = wfid.slice(projectPrefix.length);
    if (epicId.length === 0) continue;
    ids.push(epicId);
    if (limit !== undefined && ids.length >= limit) break;
  }

  return ids;
}
