import type { Store } from "../store-types";
import type { GateId } from "../../types";
import {
  completeGateUpdate,
  reopenFromGateUpdate,
  changeStateQuery,
} from "../../temporal/messages";
import { runTemporal, getGuardedChangeHandle, type StoreDeps } from "./shared";

export function createGateOps(deps: StoreDeps): Store["gates"] {
  const {
    input,
    legacy,
    invalidateChange,
    resolveStateOrQuery,
    setCachedChange,
    emitChangeSummarySignal,
    persistStateToDisk,
  } = deps;

  return {
    ...legacy.gates,
    get: async (changeId: string) => {
      const state = (await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as import("../../temporal/contracts").ChangeWorkflowState;
      return state.gates;
    },
    complete: async (changeId: string, gateId: GateId, notes?: string) => {
      invalidateChange(changeId);
      const raw = await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).executeUpdate(
          completeGateUpdate,
          {
            args: [gateId, notes, "agent"],
          },
        ),
      );
      const state = await resolveStateOrQuery(
        async () => await getGuardedChangeHandle(input, changeId),
        raw,
      );
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
      approvalEvidence,
    ) => {
      invalidateChange(changeId);
      const raw = await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).executeUpdate(
          reopenFromGateUpdate,
          {
            args: [
              fromGate,
              reason,
              scopeDelta,
              approvalEvidence ?? reopenedBy,
            ],
          },
        ),
      );
      const state = await resolveStateOrQuery(
        async () => await getGuardedChangeHandle(input, changeId),
        raw,
      );
      setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
      persistStateToDisk(changeId, state);
    },
  };
}
