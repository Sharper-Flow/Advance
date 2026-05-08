import type { Store } from "../store-types";
import type { GateId } from "../../types";
import {
  gateCompletedSignal,
  gateReenteredSignal,
  changeStateQuery,
} from "../../temporal/messages";
import { classifyTemporalError } from "../../temporal/retry-wrapper";
import { runTemporal, getGuardedChangeHandle, type StoreDeps } from "./shared";

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
      try {
        const state = (await runTemporal(async () =>
          (await getGuardedChangeHandle(input, changeId)).query(
            changeStateQuery,
          ),
        )) as import("../../temporal/contracts").ChangeWorkflowState;
        return state.gates;
      } catch (error) {
        if (classifyTemporalError(error) !== "fallback") {
          throw error;
        }
        const recovered = await getTemporalChange(changeId);
        if (recovered.success && recovered.data) {
          return recovered.data.gates ?? null;
        }
        throw error;
      }
    },
    complete: async (changeId: string, gateId: GateId, notes?: string) => {
      invalidateChange(changeId);
      await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).signal(
          gateCompletedSignal,
          {
            gateId,
            approvalEvidence: notes,
            completedBy: "agent",
            completedAt: new Date().toISOString(),
          },
        ),
      );
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
      await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).signal(
          gateReenteredSignal,
          {
            fromGateId: fromGate,
            reason,
            scopeDelta: scopeDelta ?? undefined,
            reenteredBy: reopenedBy ?? "agent",
            reenteredAt: new Date().toISOString(),
          },
        ),
      );
      const state = (await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as import("../../temporal/contracts").ChangeWorkflowState;
      setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
      persistStateToDisk(changeId, state);
    },
  };
}
