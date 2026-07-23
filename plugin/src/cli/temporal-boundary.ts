/**
 * Internal CLI-safe Temporal boundary for root `bin/adv`.
 *
 * This module is not a public package API. It is the only approved live
 * Temporal source boundary for root CLI code. Keep the export set narrow and
 * covered by `bin/lib/cli-source-boundary.test.ts`.
 * rq-cliSourceBoundary01
 */

export {
  buildChangeWorkflowId,
  buildEpicWorkflowId,
  createTemporalClientBundle,
} from "../temporal/client";
export {
  CHANGE_WORKFLOW_QUERY_NAMES,
  EPIC_WORKFLOW_QUERY_NAMES,
} from "../temporal/contracts";
export { escapeVisibilityValue } from "../temporal/lifecycle-visibility";
export { listChangeWorkflowIds } from "../temporal/list-change-workflows";
export {
  listEpicWorkflowIds,
  listEpicWorkflows,
  type EpicWorkflowListEntry,
  type ListEpicClient,
} from "../temporal/list-epic-workflows";
