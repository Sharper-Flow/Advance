import type { Store } from "../store-types";
import type { GateId } from "../../types";
import type { SignalDefinition } from "@temporalio/workflow";
import { makeTemporalOperationContext } from "../../temporal/operations";
import { buildChangeWorkflowId } from "../../temporal/client";
import type { ChangeWorkflowState } from "../../temporal/contracts";
import {
  gateCompletedSignal,
  gateReenteredSignal,
  changeStateQuery,
} from "../../temporal/messages";
import {
  getGuardedChangeHandle,
  getTemporalOwner,
  changeCommand,
  fallbackOperationId,
  buildSummaryCommitProjection,
  type ChangeCommandOutcome,
  type StoreDeps,
} from "./shared";
import { type TemporalMutationOutcome } from "../../temporal/mutation-safety";
import { computeHostCommandPayloadHash } from "../../utils/command-payload-hash";

export { fireSignalWithMutationGuard };

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
  signalName: SignalDefinition<unknown[]>,
  args: readonly unknown[],
): Promise<TemporalMutationOutcome> {
  const owner = getTemporalOwner(input);
  const workflowId = buildChangeWorkflowId(input.projectId, changeId);
  const handle = await getGuardedChangeHandle(input, changeId);
  const signalCtx = makeTemporalOperationContext(
    input.projectId,
    workflowId,
    "signal",
    signalName.name,
    5_000,
  );
  const queryCtx = makeTemporalOperationContext(
    input.projectId,
    workflowId,
    "query",
    "changeStateQuery",
    5_000,
  );
  const outcome = await owner.signal<ChangeWorkflowState>(
    signalCtx,
    handle,
    signalName,
    [...args],
    {
      readback: async () => {
        const result = await owner.query(queryCtx, handle, changeStateQuery);
        if (result.kind !== "complete") {
          throw result.error ?? new Error("change state query incomplete");
        }
        return result.value;
      },
    },
  );
  switch (outcome.kind) {
    case "confirmed":
      return "confirmed";
    case "confirmed_failure":
      return "failed_before_ack";
    case "outcome_unknown":
    case "timeout_unavailable":
      return "outcome_unknown_readback_unavailable";
    default:
      throw new Error("Unexpected signal outcome kind");
  }
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
