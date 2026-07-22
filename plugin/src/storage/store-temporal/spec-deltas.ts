import type { Store } from "../store-types";
import type {
  Delta,
  DeltaAdd,
  DeltaModify,
  DeltaRemove,
  DeltaRename,
} from "../../types";
import {
  SpecDeltaAddedSignalPayloadSchema,
  SpecDeltaAmendedSignalPayloadSchema,
  SpecDeltaModifiedSignalPayloadSchema,
  SpecDeltaRemovedSignalPayloadSchema,
  SpecDeltaRenamedSignalPayloadSchema,
  SpecDeltaRetractedSignalPayloadSchema,
} from "../../types";
import {
  specDeltaAddedSignal,
  specDeltaAmendedSignal,
  specDeltaModifiedSignal,
  specDeltaRemovedSignal,
  specDeltaRenamedSignal,
  specDeltaRetractedSignal,
  changeStateQuery,
} from "../../temporal/messages";
import {
  runTemporalQuery,
  getGuardedChangeHandle,
  type StoreDeps,
} from "./shared";
import { fireSignalWithMutationGuard } from "./gates";

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
      setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
      persistStateToDisk(changeId, state);
      return appended as DeltaAdd;
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
      setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
      persistStateToDisk(changeId, state);
      return appended as DeltaModify;
    },
    amend: async (changeId, capability, deltaId, delta: Delta, options) => {
      invalidateChange(changeId);
      const now = new Date().toISOString();
      const payload = SpecDeltaAmendedSignalPayloadSchema.parse({
        capability,
        deltaId,
        delta,
        amendedAt: now,
        amendedBy: options?.amendedBy,
      });
      const amendOutcome = await fireSignalWithMutationGuard(
        input,
        changeId,
        specDeltaAmendedSignal,
        [payload],
      );
      if (amendOutcome === "outcome_unknown_readback_unavailable") {
        throw new Error(
          `specDeltas.amend(${changeId}): signal acknowledged but post-signal readback unavailable — outcome classified as outcome_unknown_readback_unavailable.`,
        );
      }
      const state = (await runTemporalQuery(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as import("../../temporal/contracts").ChangeWorkflowState;
      const amended = state.deltas[capability]?.find(
        (entry) => entry.id === deltaId,
      );
      if (!amended) {
        const rejections = state.signal_rejections ?? [];
        const latest = rejections[rejections.length - 1];
        throw new Error(
          latest?.signalName === "specDeltaAmended"
            ? `Spec delta amend rejected for change ${changeId}: ${latest.errorMessage}`
            : `Spec delta amend for change ${changeId} completed without replacing delta ${deltaId} under capability ${capability}`,
        );
      }
      setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
      persistStateToDisk(changeId, state);
      return amended as Delta;
    },
    retract: async (changeId, capability, deltaId, options) => {
      invalidateChange(changeId);
      const now = new Date().toISOString();
      const payload = SpecDeltaRetractedSignalPayloadSchema.parse({
        capability,
        deltaId,
        retractedAt: now,
        retractedBy: options?.retractedBy,
      });
      const retractOutcome = await fireSignalWithMutationGuard(
        input,
        changeId,
        specDeltaRetractedSignal,
        [payload],
      );
      if (retractOutcome === "outcome_unknown_readback_unavailable") {
        throw new Error(
          `specDeltas.retract(${changeId}): signal acknowledged but post-signal readback unavailable — outcome classified as outcome_unknown_readback_unavailable.`,
        );
      }
      const state = (await runTemporalQuery(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as import("../../temporal/contracts").ChangeWorkflowState;
      const stillPresent = state.deltas[capability]?.find(
        (entry) => entry.id === deltaId,
      );
      if (stillPresent) {
        const rejections = state.signal_rejections ?? [];
        const latest = rejections[rejections.length - 1];
        throw new Error(
          latest?.signalName === "specDeltaRetracted"
            ? `Spec delta retract rejected for change ${changeId}: ${latest.errorMessage}`
            : `Spec delta retract for change ${changeId} completed without removing delta ${deltaId} under capability ${capability}`,
        );
      }
      setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
      persistStateToDisk(changeId, state);
    },
    remove: async (changeId, capability, delta: DeltaRemove, options) => {
      invalidateChange(changeId);
      const now = new Date().toISOString();
      const payload = SpecDeltaRemovedSignalPayloadSchema.parse({
        capability,
        delta,
        removedAt: now,
        removedBy: options?.removedBy,
      });
      const removeOutcome = await fireSignalWithMutationGuard(
        input,
        changeId,
        specDeltaRemovedSignal,
        [payload],
      );
      if (removeOutcome === "outcome_unknown_readback_unavailable") {
        throw new Error(
          `specDeltas.remove(${changeId}): signal acknowledged but post-signal readback unavailable — outcome classified as outcome_unknown_readback_unavailable.`,
        );
      }
      const state = (await runTemporalQuery(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as import("../../temporal/contracts").ChangeWorkflowState;
      const appended = state.deltas[capability]?.find(
        (entry) => entry.id === delta.id && entry.operation === "remove",
      );
      if (!appended) {
        const rejections = state.signal_rejections ?? [];
        const latest = rejections[rejections.length - 1];
        throw new Error(
          latest?.signalName === "specDeltaRemoved"
            ? `Spec delta remove rejected for change ${changeId}: ${latest.errorMessage}`
            : `Spec delta remove for change ${changeId} completed without appending delta ${delta.id} under capability ${capability}`,
        );
      }
      setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
      persistStateToDisk(changeId, state);
      return appended as DeltaRemove;
    },
    rename: async (changeId, capability, delta: DeltaRename, options) => {
      invalidateChange(changeId);
      const now = new Date().toISOString();
      const payload = SpecDeltaRenamedSignalPayloadSchema.parse({
        capability,
        delta,
        renamedAt: now,
        renamedBy: options?.renamedBy,
      });
      const renameOutcome = await fireSignalWithMutationGuard(
        input,
        changeId,
        specDeltaRenamedSignal,
        [payload],
      );
      if (renameOutcome === "outcome_unknown_readback_unavailable") {
        throw new Error(
          `specDeltas.rename(${changeId}): signal acknowledged but post-signal readback unavailable — outcome classified as outcome_unknown_readback_unavailable.`,
        );
      }
      const state = (await runTemporalQuery(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as import("../../temporal/contracts").ChangeWorkflowState;
      const appended = state.deltas[capability]?.find(
        (entry) => entry.id === delta.id && entry.operation === "rename",
      );
      if (!appended) {
        const rejections = state.signal_rejections ?? [];
        const latest = rejections[rejections.length - 1];
        throw new Error(
          latest?.signalName === "specDeltaRenamed"
            ? `Spec delta rename rejected for change ${changeId}: ${latest.errorMessage}`
            : `Spec delta rename for change ${changeId} completed without appending delta ${delta.id} under capability ${capability}`,
        );
      }
      setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
      persistStateToDisk(changeId, state);
      return appended as DeltaRename;
    },
  };
}
