import type { Store } from "../store-types";
import type { DeltaAdd } from "../../types";
import { SpecDeltaAddedSignalPayloadSchema } from "../../types";
import {
  specDeltaAddedSignal,
  changeStateQuery,
} from "../../temporal/messages";
import {
  runTemporal,
  runTemporalQuery,
  getGuardedChangeHandle,
  type StoreDeps,
} from "./shared";

/**
 * Temporal store operation for the append-only spec-delta writer
 * (addSpecDeltaWriter change). Mirrors the adv_wisdom_add writer pattern:
 * validate the payload structurally, signal the change workflow, read back
 * authoritative state, then refresh cache/summary/disk projection.
 *
 * The workflow reducer is the durable append path; archive remains the sole
 * global-spec writer. When the signal is rejected (duplicate delta id,
 * duplicate requirement id, malformed capability), the read-back delta
 * lookup fails and this op throws a typed error without touching caches or
 * disk projection — the change delta record is unchanged.
 */
export function createSpecDeltaOps(deps: StoreDeps): Store["specDeltas"] {
  const {
    input,
    legacy,
    invalidateChange,
    setCachedChange,
    emitChangeSummarySignal,
    persistStateToDisk,
  } = deps;

  return {
    ...legacy.specDeltas,
    add: async (changeId, capability, delta: DeltaAdd, options) => {
      invalidateChange(changeId);
      const now = new Date().toISOString();
      const payload = SpecDeltaAddedSignalPayloadSchema.parse({
        capability,
        delta,
        addedAt: now,
        addedBy: options?.addedBy,
      });
      await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).signal(
          specDeltaAddedSignal,
          payload,
        ),
      );
      const state = (await runTemporalQuery(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as import("../../temporal/contracts").ChangeWorkflowState;
      const appended = state.deltas[capability]?.find(
        (entry) => entry.id === delta.id,
      );
      if (!appended) {
        const rejections = state.signal_rejections ?? [];
        const latest = rejections[rejections.length - 1];
        throw new Error(
          latest?.signalName === "specDeltaAdded"
            ? `Spec delta add rejected for change ${changeId}: ${latest.errorMessage}`
            : `Spec delta add for change ${changeId} completed without appending delta ${delta.id} under capability ${capability}`,
        );
      }
      setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
      persistStateToDisk(changeId, state);
      return appended as DeltaAdd;
    },
  };
}
