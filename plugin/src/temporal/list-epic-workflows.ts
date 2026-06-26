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
 */
export function buildEpicVisibilityQuery(_projectId: string): string {
  return `WorkflowType = "${EPIC_WORKFLOW_NAME}"`;
}

/**
 * Return the Epic IDs for all epic-workflows belonging to a project,
 * via Temporal Visibility API pagination.
 */
export async function listEpicWorkflowIds(
  client: ListEpicClient,
  options: ListEpicWorkflowIdsOptions,
): Promise<string[]> {
  const query = buildEpicVisibilityQuery(options.projectId);
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
