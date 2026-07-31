import type { Store } from "../store-types";
import type { GateId } from "../../types";
import {
  gateCompletedSignal,
  gateReenteredSignal,
  changeStateQuery,
} from "../../temporal/messages";
import {
  runTemporal,
  getGuardedChangeHandle,
  changeCommand,
  fallbackOperationId,
  buildSummaryCommitProjection,
  type ChangeCommandOutcome,
  type StoreDeps,
} from "./shared";
import {
  composeTypedMutationResult,
  enforceMutationEligibilityForError,
  type TemporalMutationOutcome,
} from "../../temporal/mutation-safety";
import { createLogger } from "../../utils/debug-log";
import { computeHostCommandPayloadHash } from "../../utils/command-payload-hash";

export { fireSignalWithMutationGuard };

const logger = createLogger("store-temporal-gates");

function buildGateCommandIdentity(
  commandKind: string,
  payload: Record<string, unknown>,
  callerOperationId?: string,
): { operationId: string; payloadHash: string } {
  const payloadHash = computeHostCommandPayloadHash(payload);
  const operationId =
    callerOperationId ?? fallbackOperationId(commandKind, payload);
  return { operationId, payloadHash };
}

function unwrapCommandOutcome(
  outcome: ChangeCommandOutcome,
  context: string,
): import("../../temporal/contracts").ChangeWorkflowState {
  if (outcome.kind === "accepted" || outcome.kind === "idempotent_replay") {
    return outcome.state;
  }
  throw new Error(`${context}: ${outcome.kind} — ${outcome.reason}`);
}

/**
 * rq-temporalMutationSafety01 — SC6 outcome classification for a
 * signal+readback sequence. The signal is dispatched; if the dispatch
 * succeeds, the post-signal readback is attempted. The result is composed
 * via `composeTypedMutationResult` so the caller can surface an
 * `outcome_unknown_readback_unavailable` typed error rather than masking
 * an ambiguous result as a confirmed mutation.
 *
 * On an SC4 mutation-ineligible class (no-poller / unregistered-query /
 * deadline / unknown / query-rejected / permission / resource-exhaustion)
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
    legacy,
    invalidateChange,
    setCachedChange,
    emitChangeSummarySignal,
    readChangeSnapshot,
  } = deps;

  return {
    ...legacy.gates,
    get: async (changeId: string) => {
      const snapshot = await readChangeSnapshot(changeId);
      if (!snapshot.found && snapshot.reason === "schema_error") {
        throw new Error(snapshot.error);
      }
      return snapshot.found ? (snapshot.snapshot.gates ?? null) : null;
    },
    complete: async (
      changeId: string,
      gateId: GateId,
      notes?: string,
      options?: { operationId?: string },
    ) => {
      invalidateChange(changeId);
      const commandKind = "gateCompleted";
      const payload = {
        gateId,
        approvalEvidence: notes,
        completedBy: "agent",
        completedAt: new Date().toISOString(),
      };
      const { operationId, payloadHash } = buildGateCommandIdentity(
        commandKind,
        payload,
        options?.operationId,
      );
      const outcome = await changeCommand({
        deps,
        changeId,
        operationId,
        commandKind,
        payloadHash,
        signal: gateCompletedSignal,
        signalArgs: [
          {
            ...payload,
            operation_id: operationId,
            command_kind: commandKind,
            payload_hash: payloadHash,
          },
        ],
        commitProjection: buildSummaryCommitProjection(
          legacy,
          changeId,
          operationId,
          payloadHash,
          commandKind,
        ),
      });
      const state = unwrapCommandOutcome(
        outcome,
        `gates.complete(${changeId}, ${gateId})`,
      );
      setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
    },
    reopenFrom: async (
      changeId,
      fromGate,
      reason,
      scopeDelta,
      reopenedBy,
      _approvalEvidence,
      options?: { operationId?: string },
    ) => {
      invalidateChange(changeId);
      const commandKind = "gateReentered";
      const payload = {
        fromGateId: fromGate,
        reason,
        scopeDelta: scopeDelta ?? undefined,
        reenteredBy: reopenedBy ?? "agent",
        reenteredAt: new Date().toISOString(),
      };
      const { operationId, payloadHash } = buildGateCommandIdentity(
        commandKind,
        payload,
        options?.operationId,
      );
      const outcome = await changeCommand({
        deps,
        changeId,
        operationId,
        commandKind,
        payloadHash,
        signal: gateReenteredSignal,
        signalArgs: [
          {
            ...payload,
            operation_id: operationId,
            command_kind: commandKind,
            payload_hash: payloadHash,
          },
        ],
        commitProjection: buildSummaryCommitProjection(
          legacy,
          changeId,
          operationId,
          payloadHash,
          commandKind,
        ),
      });
      const state = unwrapCommandOutcome(
        outcome,
        `gates.reopenFrom(${changeId}, ${fromGate})`,
      );
      setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
    },
  };
}
