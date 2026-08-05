import type { Change } from "../types";
import type { TemporalWorkflowDiagnostic } from "./diagnostics";
import {
  TemporalOperationsOwner,
  type TemporalOperations,
  type TemporalWorkflowHandle,
  type WorkflowQueueMode,
  type TemporalMutationServerOutcome,
} from "./operations";
import type { ChangeWorkflowInput, EpicWorkflowInput } from "./contracts";
import { changeSeedStateFromChange } from "./change-state";
import { buildChangeWorkflowId, buildEpicWorkflowId } from "./client";

export { IncompatibleActiveSessionQueuesError } from "./operations";

/**
 * Distinct error thrown when a start workflow operation returns a non-confirmed
 * outcome. Callers can branch on `kind` to distinguish timeout/unavailable,
 * confirmed failure, and outcome-unknown.
 */
export class StartWorkflowOutcomeError extends Error {
  readonly name = "StartWorkflowOutcomeError";
  constructor(
    readonly kind: Exclude<
      TemporalMutationServerOutcome<unknown>["kind"],
      "confirmed"
    >,
    readonly causeError: unknown,
    readonly diagnostic: TemporalWorkflowDiagnostic,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Backwards-compatible helpers that delegate to the closed TemporalOperationsOwner.
 * Kept for a few callers that still import these names; new code should call
 * owner.startChangeWorkflow / owner.startEpicWorkflow directly.
 */

export async function ensureChangeWorkflowStarted(
  temporal: TemporalOperations | TemporalOperationsOwner,
  input: ChangeWorkflowInput,
  _options?: {
    workflowQueueMode?: WorkflowQueueMode;
    budgetMs?: number;
  },
): Promise<TemporalWorkflowHandle> {
  // Temporal bypass: return a stub handle without starting a workflow.
  // Mutations write directly to disk via the recovery path; reads fall back
  // to disk projections when Temporal queries fail.
  // See: simplifyAdvanceCore Phase 3 — rip-the-band-aid.
  const workflowId = buildChangeWorkflowId(input.projectId, input.changeId);
  return { workflowId } as TemporalWorkflowHandle;
}

export async function ensureEpicWorkflowStarted(
  temporal: TemporalOperations | TemporalOperationsOwner,
  input: EpicWorkflowInput,
  _options?: { budgetMs?: number },
): Promise<TemporalWorkflowHandle> {
  // Temporal bypass: return a stub handle without starting a workflow.
  const workflowId = buildEpicWorkflowId(input.projectId, input.epicId);
  return { workflowId } as TemporalWorkflowHandle;
}

export async function reImportChangeState(
  temporal: TemporalOperations | TemporalOperationsOwner,
  input: {
    projectId: string;
    change: Change;
    initializedAt?: string;
    projectionChangesDir?: string;
    archiveProjects?: Array<{ projectPath: string }>;
  },
): Promise<TemporalWorkflowHandle> {
  return ensureChangeWorkflowStarted(temporal, {
    projectId: input.projectId,
    changeId: input.change.id,
    title: input.change.title,
    initializedAt: input.initializedAt ?? input.change.created_at,
    projectionChangesDir: input.projectionChangesDir,
    archiveProjects: input.archiveProjects,
    seedState: changeSeedStateFromChange(input.change),
  });
}
