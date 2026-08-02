/**
 * Internal CLI-safe Temporal boundary for root `bin/adv`.
 *
 * This module is not a public package API. It is the only approved live
 * Temporal source boundary for root CLI code. Keep the export set narrow and
 * covered by `bin/lib/cli-source-boundary.test.ts`.
 * rq-cliSourceBoundary01
 */

export { buildChangeWorkflowId, buildEpicWorkflowId } from "../temporal/client";
export {
  CHANGE_WORKFLOW_QUERY_NAMES,
  EPIC_WORKFLOW_QUERY_NAMES,
} from "../temporal/contracts";
export { escapeVisibilityValue } from "../temporal/lifecycle-visibility";
export { listChangeWorkflowIds } from "../temporal/list-change-workflows";
export {
  buildVisibilityQuery,
  type ListChangeWorkflowIdsOptions,
} from "../temporal/list-change-workflows";
export {
  listEpicWorkflowIds,
  listEpicWorkflows,
  type EpicWorkflowListEntry,
} from "../temporal/list-epic-workflows";
export {
  makeTemporalOperationContext,
  type TemporalOperations,
  type TemporalWorkflowHandle,
  type TemporalReadOutcome,
  type TemporalMutationServerOutcome,
  type TemporalListOutcome,
} from "../temporal/operations";
export {
  TemporalListOutcomeError,
  TemporalReadOutcomeError,
} from "../temporal/outcome-errors";
import { TemporalOperationsOwner } from "../temporal/operations";

/**
 * Run a function with a fresh TemporalOperations owner for a project.
 * The owner is created from the environment (ADV_TEMPORAL_ADDRESS /
 * ADV_TEMPORAL_NAMESPACE) and closed after the callback settles, regardless
 * of success or failure. This is the only approved way for root CLI code to
 * open a live Temporal connection.
 */
export async function withTemporalOperations<T>(
  projectId: string,
  fn: (
    owner: import("../temporal/operations").TemporalOperations,
  ) => Promise<T>,
  env?: NodeJS.ProcessEnv,
  options?: { connectTimeoutMs?: number },
): Promise<T> {
  const owner = await TemporalOperationsOwner.fromEnv(projectId, env, options);
  try {
    return await fn(owner);
  } finally {
    await owner.close();
  }
}
