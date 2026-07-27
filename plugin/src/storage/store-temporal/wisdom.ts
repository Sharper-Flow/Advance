import type { Store } from "../store-types";
import type { WisdomType, WisdomEntry } from "../../types";
import { wisdomAddedSignal, changeStateQuery } from "../../temporal/messages";
import {
  runTemporalQuery,
  getGuardedChangeHandle,
  changeCommand,
  fallbackOperationId,
  buildSummaryCommitProjection,
  type ChangeCommandOutcome,
  type StoreDeps,
} from "./shared";
import {
  computeHostCommandPayloadHash,
  sha256Hex,
} from "../../utils/command-payload-hash";

// Command outcomes surfaced: accepted, idempotent_replay, rejected,
// projection_failure, operator_required, outcome_unknown_readback_unavailable.

function buildWisdomCommandIdentity(
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

export function createWisdomOps(deps: StoreDeps): Store["wisdom"] {
  const { input, legacy, invalidateChange } = deps;

  return {
    ...legacy.wisdom,
    add: async (
      changeId,
      type: WisdomType,
      content,
      sourceTask,
      origin,
      options?: { operationId?: string },
    ) => {
      invalidateChange(changeId);
      const commandKind = "wisdomAdded";
      const now = new Date().toISOString();
      const operationIdHint =
        options?.operationId ??
        fallbackOperationId(commandKind, {
          changeId,
          type,
          content,
          sourceTask,
          origin,
        });
      const payload = {
        entry: {
          id: `ws-${sha256Hex(operationIdHint).slice(0, 16)}`,
          type,
          content,
          source_task: sourceTask,
          recorded_at: now,
          ...origin,
        },
        addedAt: now,
      };
      const { operationId, payloadHash } = buildWisdomCommandIdentity(
        commandKind,
        payload,
        operationIdHint,
      );
      const outcome = await changeCommand({
        deps,
        changeId,
        operationId,
        commandKind,
        payloadHash,
        signal: wisdomAddedSignal,
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
      const state = unwrapCommandOutcome(outcome, `wisdom.add(${changeId})`);
      const latest = state.wisdom[state.wisdom.length - 1] as
        | WisdomEntry
        | undefined;
      if (!latest) {
        throw new Error(
          `Temporal wisdom signal for change ${changeId} completed without returning an appended wisdom entry`,
        );
      }
      return latest;
    },
    list: async (changeId: string) => {
      const state = (await runTemporalQuery(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as import("../../temporal/contracts").ChangeWorkflowState;
      return state.wisdom;
    },
  };
}
