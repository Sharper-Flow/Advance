import { isDeepStrictEqual } from "node:util";
import type { Store } from "../store-types";
import type { DeltaAdd, DeltaModify } from "../../types";
import {
  DeltaAddSchema,
  DeltaModifySchema,
  SpecDeltaAddedSignalPayloadSchema,
  SpecDeltaModifiedSignalPayloadSchema,
} from "../../types";
import {
  specDeltaAddedSignal,
  specDeltaModifiedSignal,
  changeStateQuery,
} from "../../temporal/messages";
import {
  runTemporalQuery,
  getGuardedChangeHandle,
  type StoreDeps,
} from "./shared";
import { fireSignalWithMutationGuard } from "./gates";

function assertPersistedAdd(
  observed: unknown,
  expected: DeltaAdd,
  context: string,
): DeltaAdd {
  const parsed = DeltaAddSchema.safeParse(observed);
  if (!parsed.success) {
    throw new Error(
      `${context}: authoritative add readback was malformed: ${parsed.error.message}`,
    );
  }
  if (!isDeepStrictEqual(parsed.data, expected)) {
    throw new Error(
      `${context}: authoritative add readback payload mismatch for delta ${expected.id}`,
    );
  }
  return parsed.data;
}

function assertPersistedModify(
  observed: unknown,
  expected: DeltaModify,
  context: string,
): DeltaModify {
  const parsed = DeltaModifySchema.safeParse(observed);
  if (!parsed.success) {
    throw new Error(
      `${context}: authoritative modify readback was malformed: ${parsed.error.message}`,
    );
  }
  if (!isDeepStrictEqual(parsed.data, expected)) {
    throw new Error(
      `${context}: authoritative modify readback payload mismatch for delta ${expected.id}`,
    );
  }
  return parsed.data;
}

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
      // SC4 + SC6: guard the signal; classify readback outcome.
      const addOutcome = await fireSignalWithMutationGuard(
        input,
        changeId,
        specDeltaAddedSignal,
        [payload],
      );
      if (addOutcome === "outcome_unknown_readback_unavailable") {
        throw new Error(
          `specDeltas.add(${changeId}): signal acknowledged but post-signal readback unavailable — outcome classified as outcome_unknown_readback_unavailable.`,
        );
      }
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
      const persisted = assertPersistedAdd(
        appended,
        delta,
        `specDeltas.add(${changeId})`,
      );
      setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
      persistStateToDisk(changeId, state);
      return persisted;
    },
    modify: async (changeId, capability, delta: DeltaModify, options) => {
      invalidateChange(changeId);
      const now = new Date().toISOString();
      const payload = SpecDeltaModifiedSignalPayloadSchema.parse({
        capability,
        delta,
        modifiedAt: now,
        modifiedBy: options?.modifiedBy,
      });
      const modifyOutcome = await fireSignalWithMutationGuard(
        input,
        changeId,
        specDeltaModifiedSignal,
        [payload],
      );
      if (modifyOutcome === "outcome_unknown_readback_unavailable") {
        throw new Error(
          `specDeltas.modify(${changeId}): signal acknowledged but post-signal readback unavailable — outcome classified as outcome_unknown_readback_unavailable.`,
        );
      }
      const state = (await runTemporalQuery(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as import("../../temporal/contracts").ChangeWorkflowState;
      const appended = state.deltas[capability]?.find(
        (entry) => entry.id === delta.id && entry.operation === "modify",
      );
      if (!appended) {
        const rejections = state.signal_rejections ?? [];
        const latest = rejections[rejections.length - 1];
        throw new Error(
          latest?.signalName === "specDeltaModified"
            ? `Spec delta modify rejected for change ${changeId}: ${latest.errorMessage}`
            : `Spec delta modify for change ${changeId} completed without appending delta ${delta.id} under capability ${capability}`,
        );
      }
      const persisted = assertPersistedModify(
        appended,
        delta,
        `specDeltas.modify(${changeId})`,
      );
      setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
      persistStateToDisk(changeId, state);
      return persisted;
    },
  };
}
