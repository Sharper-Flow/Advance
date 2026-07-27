/**
 * Durable fail-all batch-close coordinator.
 *
 * Implements the prepare/commit/abort saga described in the projection-first
 * CQRS-lite design: a stable batch operation id records per-target phase and
 * outcome, reducer-side reservations block conflicting lifecycle commands, and
 * crash recovery resumes from the durable record.
 */

import type { ChangeClosure } from "../../types";
import { ChangeClosureSchema } from "../../types";
import type { ChangeWorkflowState } from "../../temporal/contracts";
import { z } from "zod";

export const BatchCloseTargetPhaseSchema = z.enum([
  "pending",
  "prepared",
  "rejected",
  "committed",
  "aborted",
]);

export const BatchCloseOverallStateSchema = z.enum([
  "preparing",
  "prepared_all",
  "committing",
  "committed_all",
  "aborting",
  "aborted",
  "rejected",
]);

export const BatchCloseTargetRecordSchema = z.object({
  changeId: z.string().min(1),
  phase: BatchCloseTargetPhaseSchema,
  state_revision_at_prepare: z.number().optional(),
  error: z.string().optional(),
});

export const BatchCloseOperationSchema = z.object({
  batch_id: z.string().min(1),
  target_ids: z.array(z.string().min(1)),
  closure: ChangeClosureSchema,
  overall_state: BatchCloseOverallStateSchema,
  per_target: z.record(z.string(), BatchCloseTargetRecordSchema),
  created_at: z.string(),
  updated_at: z.string(),
});

export type BatchCloseTargetPhase =
  | "pending"
  | "prepared"
  | "rejected"
  | "committed"
  | "aborted";

export interface BatchCloseTargetRecord {
  changeId: string;
  phase: BatchCloseTargetPhase;
  state_revision_at_prepare?: number;
  error?: string;
}

export type BatchCloseOverallState =
  | "preparing"
  | "prepared_all"
  | "committing"
  | "committed_all"
  | "aborting"
  | "aborted"
  | "rejected";

export interface BatchCloseOperation {
  batch_id: string;
  target_ids: string[];
  closure: ChangeClosure;
  overall_state: BatchCloseOverallState;
  per_target: Record<string, BatchCloseTargetRecord>;
  created_at: string;
  updated_at: string;
}

export type BatchCloseCoordinationResult =
  | { kind: "committed_all"; operation: BatchCloseOperation; message: string }
  | { kind: "aborted"; operation: BatchCloseOperation; message: string }
  | { kind: "rejected"; operation: BatchCloseOperation; message: string }
  | { kind: "in_progress"; operation: BatchCloseOperation; message: string }
  | {
      kind: "repair_required";
      operation: BatchCloseOperation;
      message: string;
    };

export interface BatchCloseCoordinationDeps {
  loadOperation(batch_id: string): Promise<BatchCloseOperation | undefined>;
  persistOperation(op: BatchCloseOperation): Promise<void>;
  resolveChange(
    changeId: string,
  ): Promise<
    { state: ChangeWorkflowState } | { notFound: true; reason: string }
  >;
  sendSignal(
    changeId: string,
    signal: "prepare" | "commit" | "abort",
    payload: unknown,
  ): Promise<void>;
  queryState(changeId: string): Promise<ChangeWorkflowState>;
  now(): string;
}

/**
 * Coordinate a durable fail-all batch close.
 *
 * The coordinator uses an injectable, durable operation record to survive
 * crashes and retries. A single invocation drives the full prepare→commit cycle
 * when possible; on failure it aborts all prepared targets (fail-all) or
 * returns typed `in_progress`/`repair_required` when partial convergence cannot
 * be resolved automatically.
 */
export async function coordinateBatchClose(
  deps: BatchCloseCoordinationDeps,
  input: {
    batch_id: string;
    target_ids: string[];
    closure: ChangeClosure;
  },
): Promise<BatchCloseCoordinationResult> {
  const { batch_id, target_ids, closure } = input;
  const now = deps.now();

  let operation = await deps.loadOperation(batch_id);
  if (!operation) {
    operation = createInitialOperation(batch_id, target_ids, closure, now);

    for (const changeId of target_ids) {
      const resolved = await deps.resolveChange(changeId);
      if ("notFound" in resolved) {
        operation.per_target[changeId] = {
          changeId,
          phase: "rejected",
          error: resolved.reason,
        };
      }
    }

    if (hasRejectedTarget(operation)) {
      operation.overall_state = "rejected";
      operation.updated_at = deps.now();
      await deps.persistOperation(operation);
      return {
        kind: "rejected",
        operation,
        message: `Batch ${batch_id} rejected: one or more target changes are unknown.`,
      };
    }

    await deps.persistOperation(operation);
  }

  // Terminal/idempotent states.
  if (operation.overall_state === "committed_all") {
    return {
      kind: "committed_all",
      operation,
      message: `Batch ${batch_id} already committed for all targets.`,
    };
  }
  if (operation.overall_state === "aborted") {
    return {
      kind: "aborted",
      operation,
      message: `Batch ${batch_id} was aborted.`,
    };
  }
  if (operation.overall_state === "rejected") {
    return {
      kind: "rejected",
      operation,
      message: `Batch ${batch_id} was rejected.`,
    };
  }

  // Prepare phase.
  if (operation.overall_state === "preparing") {
    let prepareIncomplete = false;
    for (const changeId of target_ids) {
      const record = operation.per_target[changeId];
      if (record.phase !== "pending") continue;

      await deps.sendSignal(changeId, "prepare", {
        batch_id,
        closure,
      });
      const state = await deps.queryState(changeId);
      const reservation = state.batch_close_reservations?.[batch_id];
      const rejection = latestSignalRejectionSince(
        state,
        "prepareBatchClose",
        operation.created_at,
      );

      if (reservation?.phase === "prepared") {
        record.phase = "prepared";
        record.state_revision_at_prepare = state.state_revision;
      } else if (rejection) {
        record.phase = "rejected";
        record.error = rejection.errorMessage;
      } else {
        // No durable proof of prepare success or failure yet. Do not falsely
        // reject; return in_progress and retry on the next invocation.
        prepareIncomplete = true;
      }

      operation.updated_at = deps.now();
      await deps.persistOperation(operation);
    }

    if (hasRejectedTarget(operation)) {
      operation.overall_state = "aborting";
      operation.updated_at = deps.now();
      await deps.persistOperation(operation);

      const preparedIds = target_ids.filter(
        (id) => operation.per_target[id].phase === "prepared",
      );
      let allAborted = true;
      for (const changeId of preparedIds) {
        await deps.sendSignal(changeId, "abort", {
          batch_id,
          reason: "sibling target rejected during prepare",
        });
        const state = await deps.queryState(changeId);
        const reservation = state.batch_close_reservations?.[batch_id];
        if (!reservation || reservation.phase === "aborted") {
          operation.per_target[changeId].phase = "aborted";
        } else {
          allAborted = false;
          operation.per_target[changeId].error =
            "abort did not clear the reservation";
        }
        operation.updated_at = deps.now();
        await deps.persistOperation(operation);
      }

      if (allAborted) {
        operation.overall_state = "aborted";
        operation.updated_at = deps.now();
        await deps.persistOperation(operation);
        return {
          kind: "aborted",
          operation,
          message: `Batch ${batch_id} aborted because one or more targets rejected prepare.`,
        };
      }

      return {
        kind: "repair_required",
        operation,
        message: `Batch ${batch_id} abort could not be confirmed for all prepared targets; manual repair required.`,
      };
    }

    if (prepareIncomplete) {
      return {
        kind: "in_progress",
        operation,
        message: `Batch ${batch_id} prepare is still in progress.`,
      };
    }

    operation.overall_state = "prepared_all";
    operation.updated_at = deps.now();
    await deps.persistOperation(operation);
  }

  // Commit phase.
  if (
    operation.overall_state === "prepared_all" ||
    operation.overall_state === "committing"
  ) {
    operation.overall_state = "committing";
    operation.updated_at = deps.now();
    await deps.persistOperation(operation);

    let allCommitted = true;
    let needsRepair = false;

    for (const changeId of target_ids) {
      const record = operation.per_target[changeId];
      if (record.phase === "committed") continue;
      if (record.phase !== "prepared") {
        allCommitted = false;
        if (record.phase === "rejected") needsRepair = true;
        continue;
      }

      await deps.sendSignal(changeId, "commit", { batch_id });
      const state = await deps.queryState(changeId);
      const reservation = state.batch_close_reservations?.[batch_id];

      if (state.status === "closed" && reservation?.phase === "committed") {
        record.phase = "committed";
      } else {
        allCommitted = false;
        const rejection = latestSignalRejectionSince(
          state,
          "commitBatchClose",
          operation.created_at,
        );
        if (rejection || !reservation || reservation.phase !== "committed") {
          needsRepair = true;
          record.phase = "rejected";
          record.error =
            rejection?.errorMessage ??
            "commit did not confirm a closed reservation";
        }
      }

      operation.updated_at = deps.now();
      await deps.persistOperation(operation);
    }

    if (allCommitted) {
      operation.overall_state = "committed_all";
      operation.updated_at = deps.now();
      await deps.persistOperation(operation);
      return {
        kind: "committed_all",
        operation,
        message: `Batch ${batch_id} committed for all targets.`,
      };
    }

    return {
      kind: needsRepair ? "repair_required" : "in_progress",
      operation,
      message: needsRepair
        ? `Batch ${batch_id} has targets that could not be committed; manual repair required.`
        : `Batch ${batch_id} commit is still in progress.`,
    };
  }

  return {
    kind: "repair_required",
    operation,
    message: `Batch ${batch_id} is in unexpected state ${operation.overall_state}.`,
  };
}

function createInitialOperation(
  batch_id: string,
  target_ids: string[],
  closure: ChangeClosure,
  created_at: string,
): BatchCloseOperation {
  const per_target: Record<string, BatchCloseTargetRecord> = {};
  for (const changeId of target_ids) {
    per_target[changeId] = { changeId, phase: "pending" };
  }
  return {
    batch_id,
    target_ids: [...target_ids],
    closure,
    overall_state: "preparing",
    per_target,
    created_at,
    updated_at: created_at,
  };
}

function hasRejectedTarget(operation: BatchCloseOperation): boolean {
  return Object.values(operation.per_target).some(
    (record) => record.phase === "rejected",
  );
}

/**
 * Return the most recent signal rejection for `signalName` that happened at or
 * after `since`. This prevents an unrelated historical rejection from being
 * misattributed to the current batch operation.
 */
function latestSignalRejectionSince(
  state: ChangeWorkflowState,
  signalName: string,
  since: string,
): { errorMessage: string; rejectedAt: string } | undefined {
  const rejections = (state.signal_rejections ?? []).filter(
    (r) => r.signalName === signalName && r.rejectedAt >= since,
  );
  if (rejections.length === 0) return undefined;
  return rejections[rejections.length - 1];
}
