import type { Store } from "../store-types";
import type { GateId } from "../../types";
import {
  gateCompletedSignal,
  gateReenteredSignal,
  changeStateQuery,
} from "../../temporal/messages";
import {
  classifyTemporalReadFailure,
  runTemporal,
  getGuardedChangeHandle,
  type StoreDeps,
  createTemporalReadContext,
  isTemporalReadExpired,
  type TemporalReadContext,
} from "./shared";
import {
  composeTypedMutationResult,
  enforceMutationEligibilityForError,
  type TemporalMutationOutcome,
} from "../../temporal/mutation-safety";
import { collectErrorText } from "../../temporal/error-text";
import { createLogger } from "../../utils/debug-log";
import { isSchemaError } from "../json";

export { fireSignalWithMutationGuard };

const logger = createLogger("store-temporal-gates");

/**
 * rq-temporalMutationSafety01 — SC6 outcome classification for a
 * signal+readback sequence. The signal is dispatched; if the dispatch
 * succeeds, the post-signal readback is attempted. The result is composed
 * via `composeTypedMutationResult` so the caller can surface an
 * `outcome_unknown_readback_unavailable` typed error rather than masking
 * an ambiguous result as a confirmed mutation.
 *
 * On an SC4 mutation-ineligible class (no-poller / unregistered-query /
 * deadline / unknown / query-rejected / resource-exhaustion / permission)
 * the signal error is re-thrown as `TemporalMutationIneligibleError` so
 * the caller never authorizes a mutation against an unreachable workflow.
 *
 * `not_found` and `poisoned_history` are passed through with the original
 * error — they require additional operator safeguards handled elsewhere.
 */
async function fireSignalWithMutationGuard(
  input: import("./shared").TemporalStoreBackendInput,
  changeId: string,
  signalName: unknown,
  args: readonly unknown[],
): Promise<TemporalMutationOutcome> {
  let signalError: unknown;
  try {
    await runTemporal(async () => {
      const handle = await getGuardedChangeHandle(input, changeId);
      await handle.signal(signalName, ...(args as unknown[]));
    });
  } catch (err) {
    signalError = err;
  }
  // SC4 guard at signal-dispatch boundary.
  if (signalError !== undefined) {
    enforceMutationEligibilityForError(signalError);
    // Surviving path: SC4-pass (not_found / poisoned_history).
  }
  // SC6: post-signal readback. Ambiguous result is reported as
  // `outcome_unknown_readback_unavailable`; callers MUST surface this.
  let readbackError: unknown;
  try {
    await runTemporal(async () =>
      (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
    );
  } catch (err) {
    readbackError = err;
    logger.debug(
      `SC6 post-signal readback failed for ${String(signalName)} on ${changeId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  const composed = composeTypedMutationResult({
    ...(signalError !== undefined ? { signalError } : {}),
    ...(readbackError !== undefined ? { readbackError } : {}),
  });
  return composed.outcome;
}

export function createGateOps(deps: StoreDeps): Store["gates"] {
  const {
    input,
    legacy,
    invalidateChange,
    setCachedChange,
    emitChangeSummarySignal,
    persistStateToDisk,
    getTemporalChange,
  } = deps;

  return {
    ...legacy.gates,
    get: async (changeId: string) => {
      // SC3 aggregate-budget compliance: build ONE
      // `TemporalReadContext` per call and thread it through both the
      // primary read and the fallback read. The previous implementation
      // created a fresh context for the fallback path, which violated the
      // request-scoped aggregate deadline (`rq-temporalRecoveryOutcome01`).
      const ctx: TemporalReadContext = createTemporalReadContext();
      try {
        const result = await getTemporalChange(changeId, { context: ctx });
        if (isSchemaError(result)) {
          throw new Error(result.error);
        }
        if (result.success && result.data) {
          return result.data.gates ?? null;
        }
        throw new Error(`Failed to load gates for change ${changeId}`);
      } catch (error) {
        const failure = await classifyTemporalReadFailure(
          input,
          changeId,
          error,
        );
        if (failure.errorClass !== "fallback") {
          throw error;
        }
        // Fallback may reuse the existing context only if it has budget
        // remaining. Once expired, return a typed degraded read result
        // rather than silently starting a new budget.
        if (isTemporalReadExpired(ctx)) {
          throw new Error(
            `Aggregate read budget exhausted during fallback for change ${changeId}: original error preserved (${collectErrorText(error)})`,
            { cause: error },
          );
        }
        const recovered = await getTemporalChange(changeId, { context: ctx });
        if (isSchemaError(recovered)) {
          // Preserve the outer caught `error` as cause for traceability
          // (preserve-caught-error). The schema_error message in
          // `recovered.error` is the primary symptom; `error` is the
          // Temporal read failure that triggered the fallback path.
          throw new Error(recovered.error, { cause: error });
        }
        if (recovered.success && recovered.data) {
          return recovered.data.gates ?? null;
        }
        throw error;
      }
    },
    complete: async (changeId: string, gateId: GateId, notes?: string) => {
      invalidateChange(changeId);
      // SC4 + SC6: classify-and-classify. `outcome_unknown_readback_unavailable`
      // surfaces a typed error rather than silently confirming a mutation
      // whose post-signal readback failed.
      const outcome = await fireSignalWithMutationGuard(
        input,
        changeId,
        gateCompletedSignal,
        [
          {
            gateId,
            approvalEvidence: notes,
            completedBy: "agent",
            completedAt: new Date().toISOString(),
          },
        ],
      );
      if (outcome === "outcome_unknown_readback_unavailable") {
        throw new Error(
          `gate.complete(${changeId}, ${gateId}): signal acknowledged but post-signal readback unavailable — outcome classified as outcome_unknown_readback_unavailable. Do not retry without stable idempotency evidence.`,
        );
      }
      const state = (await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as import("../../temporal/contracts").ChangeWorkflowState;
      setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
      persistStateToDisk(changeId, state);
    },
    reopenFrom: async (
      changeId,
      fromGate,
      reason,
      scopeDelta,
      reopenedBy,
      _approvalEvidence,
    ) => {
      invalidateChange(changeId);
      const outcome = await fireSignalWithMutationGuard(
        input,
        changeId,
        gateReenteredSignal,
        [
          {
            fromGateId: fromGate,
            reason,
            scopeDelta: scopeDelta ?? undefined,
            reenteredBy: reopenedBy ?? "agent",
            reenteredAt: new Date().toISOString(),
          },
        ],
      );
      if (outcome === "outcome_unknown_readback_unavailable") {
        throw new Error(
          `gate.reopenFrom(${changeId}, ${fromGate}): signal acknowledged but post-signal readback unavailable — outcome classified as outcome_unknown_readback_unavailable. Do not retry without stable idempotency evidence.`,
        );
      }
      const state = (await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as import("../../temporal/contracts").ChangeWorkflowState;
      setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
      persistStateToDisk(changeId, state);
    },
  };
}
