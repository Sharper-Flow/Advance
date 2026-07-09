/**
 * Visibility-API-backed Epic enumeration.
 *
 * Mirrors list-change-workflows.ts but scopes to the Epic workflow type.
 * Epic workflows expose lifecycle through `AdvEpicStatus`; the workflow ID
 * carries project scope, so we enumerate by workflow type/status and filter the
 * canonical `adv/epic/{projectId}/` prefix in-process.
 * rq-epicCliList01
 */

import { EPIC_WORKFLOW_NAME, EPIC_WORKFLOW_PREFIX } from "./contracts";

export interface ListEpicWorkflowIdsOptions {
  projectId: string;
  /**
   * Active/default mode restricts the query to running executions only.
   * "all" returns every epicWorkflow execution and is used by richer MCP
   * candidate reports that hydrate state in-process.
   * "running" returns running executions without the AdvEpicStatus filter; used
   * by the legacy search-attribute index repair path.
   */
  status?: "active" | "all" | "running";
  /** Hard cap on result count — stops iteration early. */
  limit?: number;
}

export interface EpicWorkflowListEntry {
  id: string;
  startTime: Date | null;
}

function normalizeVisibilityStartTime(value: unknown): Date | null {
  if (!(value instanceof Date)) return null;
  if (Number.isNaN(value.getTime())) return null;
  return value;
}

/**
 * Minimal `Client` shape used by listEpicWorkflowIds.
 */
export interface ListEpicClient {
  workflow: {
    list: (opts: { query: string }) => AsyncIterable<{
      workflowId: string;
      startTime?: Date | null;
    }>;
  };
}

/**
 * Build the visibility-API query string for epic-workflow enumeration.
 *
 * Default active mode filters to running executions whose Epic status is
 * structurally active. Retired/archived, merged, and completed candidate Epics
 * are excluded without per-Epic hydration (rq-epicRetiredListing01).
 */
export function buildEpicVisibilityQuery(
  _projectId: string,
  status: "active" | "all" | "running" = "active",
): string {
  const parts = [`WorkflowType = "${EPIC_WORKFLOW_NAME}"`];
  if (status === "active") {
    parts.push('AdvEpicStatus = "active"');
    parts.push('ExecutionStatus = "Running"');
  } else if (status === "running") {
    parts.push('ExecutionStatus = "Running"');
  }
  return parts.join(" AND ");
}

/**
 * Return the Epic entries for epic-workflows belonging to a project,
 * via Temporal Visibility API pagination.
 *
 * Default `status` is "active", which enumerates running workflows only.
 */
export async function listEpicWorkflows(
  client: ListEpicClient,
  options: ListEpicWorkflowIdsOptions,
): Promise<EpicWorkflowListEntry[]> {
  const query = buildEpicVisibilityQuery(options.projectId, options.status);
  const projectPrefix = `${EPIC_WORKFLOW_PREFIX}${options.projectId}/`;
  const limit = options.limit;
  const epics: EpicWorkflowListEntry[] = [];

  for await (const wf of client.workflow.list({ query })) {
    const wfid = wf.workflowId;
    if (!wfid.startsWith(projectPrefix)) continue;
    const epicId = wfid.slice(projectPrefix.length);
    if (epicId.length === 0) continue;
    epics.push({
      id: epicId,
      startTime: normalizeVisibilityStartTime(wf.startTime),
    });
    if (limit !== undefined && epics.length >= limit) break;
  }

  return epics;
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
  const epics = await listEpicWorkflows(client, options);
  return epics.map((epic) => epic.id);
}
