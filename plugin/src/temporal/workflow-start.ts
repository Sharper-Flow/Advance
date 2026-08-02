import type { Change } from "../types";
import type { TemporalWorkflowDiagnostic } from "./diagnostics";
import {
  TemporalOperationsOwner,
  type TemporalOperations,
  type TemporalWorkflowHandle,
  makeTemporalOperationContext,
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

function ownerFromTemporal(
  temporal: TemporalOperations | TemporalOperationsOwner,
): TemporalOperations {
  return temporal;
}

function makeStartContext(
  projectId: string,
  workflowId: string,
  budgetMs: number,
) {
  return makeTemporalOperationContext(
    projectId,
    workflowId,
    "start",
    "startWorkflow",
    budgetMs,
  );
}

export async function ensureChangeWorkflowStarted(
  temporal: TemporalOperations | TemporalOperationsOwner,
  input: ChangeWorkflowInput,
  options?: {
    workflowQueueMode?: WorkflowQueueMode;
    budgetMs?: number;
  },
): Promise<TemporalWorkflowHandle> {
  const owner = ownerFromTemporal(temporal);
  const workflowId = buildChangeWorkflowId(input.projectId, input.changeId);
  const ctx = makeStartContext(
    input.projectId,
    workflowId,
    options?.budgetMs ?? 10_000,
  );
  const outcome = await owner.startChangeWorkflow(ctx, input, {
    workflowQueueMode: options?.workflowQueueMode,
  });
  if (outcome.kind !== "confirmed") {
    if (outcome.kind === "confirmed_failure") {
      throw outcome.error ?? new Error(`startChangeWorkflow ${outcome.kind}`);
    }
    throw new StartWorkflowOutcomeError(
      outcome.kind,
      outcome.error,
      outcome.diagnostic,
      `startChangeWorkflow ${outcome.kind}`,
    );
  }
  return outcome.value;
}

export async function ensureEpicWorkflowStarted(
  temporal: TemporalOperations | TemporalOperationsOwner,
  input: EpicWorkflowInput,
  options?: { budgetMs?: number },
): Promise<TemporalWorkflowHandle> {
  const owner = ownerFromTemporal(temporal);
  const workflowId = buildEpicWorkflowId(input.projectId, input.epicId);
  const ctx = makeStartContext(
    input.projectId,
    workflowId,
    options?.budgetMs ?? 10_000,
  );
  const outcome = await owner.startEpicWorkflow(ctx, input);
  if (outcome.kind !== "confirmed") {
    if (outcome.kind === "confirmed_failure") {
      throw outcome.error ?? new Error(`startEpicWorkflow ${outcome.kind}`);
    }
    throw new StartWorkflowOutcomeError(
      outcome.kind,
      outcome.error,
      outcome.diagnostic,
      `startEpicWorkflow ${outcome.kind}`,
    );
  }
  return outcome.value;
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
