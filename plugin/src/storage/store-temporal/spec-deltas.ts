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
} from "../../temporal/messages";
import {
  changeCommand,
  fallbackOperationId,
  buildSummaryCommitProjection,
  type ChangeCommandOutcome,
  type StoreDeps,
} from "./shared";
import { computeHostCommandPayloadHash } from "../../utils/command-payload-hash";

// Command outcomes surfaced: accepted, idempotent_replay, rejected,
// projection_failure, operator_required, outcome_unknown_readback_unavailable.

function buildSpecDeltaCommandIdentity(
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
 * Temporal store operation for the append-only spec-delta writer
 * (addSpecDeltaWriter change). Mirrors the command primitive: validate the
 * payload structurally, signal the change workflow with an operation identity,
 * poll the operation ledger for an accepted outcome, and commit the disk
 * projection atomically. The workflow reducer is the durable append path;
 * archive remains the sole global-spec writer.
 */
export function createSpecDeltaOps(deps: StoreDeps): Store["specDeltas"] {
  const { legacy, invalidateChange, emitChangeSummarySignal } = deps;

  return {
    ...legacy.specDeltas,
    add: async (changeId, capability, delta: DeltaAdd, options) => {
      invalidateChange(changeId);
      const commandKind = "specDeltaAdded";
      const now = new Date().toISOString();
      const basePayload = {
        capability,
        delta,
        addedAt: now,
        addedBy: options?.addedBy,
      };
      const { operationId, payloadHash } = buildSpecDeltaCommandIdentity(
        commandKind,
        basePayload,
      );
      const payload = SpecDeltaAddedSignalPayloadSchema.parse({
        ...basePayload,
        operation_id: operationId,
        command_kind: commandKind,
        payload_hash: payloadHash,
      });
      const outcome = await changeCommand({
        deps,
        changeId,
        operationId,
        commandKind,
        payloadHash,
        signal: specDeltaAddedSignal,
        signalArgs: [payload],
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
        `specDeltas.add(${changeId})`,
      );
      const appended = state.deltas[capability]?.find(
        (entry) => entry.id === delta.id,
      );
      if (!appended) {
        throw new Error(
          `Spec delta add for change ${changeId} completed without appending delta ${delta.id} under capability ${capability}`,
        );
      }
      emitChangeSummarySignal(changeId, state);
      return appended as DeltaAdd;
    },
    modify: async (changeId, capability, delta: DeltaModify, options) => {
      invalidateChange(changeId);
      const commandKind = "specDeltaModified";
      const now = new Date().toISOString();
      const basePayload = {
        capability,
        delta,
        modifiedAt: now,
        modifiedBy: options?.modifiedBy,
      };
      const { operationId, payloadHash } = buildSpecDeltaCommandIdentity(
        commandKind,
        basePayload,
      );
      const payload = SpecDeltaModifiedSignalPayloadSchema.parse({
        ...basePayload,
        operation_id: operationId,
        command_kind: commandKind,
        payload_hash: payloadHash,
      });
      const outcome = await changeCommand({
        deps,
        changeId,
        operationId,
        commandKind,
        payloadHash,
        signal: specDeltaModifiedSignal,
        signalArgs: [payload],
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
        `specDeltas.modify(${changeId})`,
      );
      const appended = state.deltas[capability]?.find(
        (entry) => entry.id === delta.id && entry.operation === "modify",
      );
      if (!appended) {
        throw new Error(
          `Spec delta modify for change ${changeId} completed without appending delta ${delta.id} under capability ${capability}`,
        );
      }
      emitChangeSummarySignal(changeId, state);
      return appended as DeltaModify;
    },
    amend: async (changeId, capability, deltaId, delta: Delta, options) => {
      invalidateChange(changeId);
      const commandKind = "specDeltaAmended";
      const now = new Date().toISOString();
      const basePayload = {
        capability,
        deltaId,
        delta,
        amendedAt: now,
        amendedBy: options?.amendedBy,
      };
      const { operationId, payloadHash } = buildSpecDeltaCommandIdentity(
        commandKind,
        basePayload,
      );
      const payload = SpecDeltaAmendedSignalPayloadSchema.parse({
        ...basePayload,
        operation_id: operationId,
        command_kind: commandKind,
        payload_hash: payloadHash,
      });
      const outcome = await changeCommand({
        deps,
        changeId,
        operationId,
        commandKind,
        payloadHash,
        signal: specDeltaAmendedSignal,
        signalArgs: [payload],
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
        `specDeltas.amend(${changeId})`,
      );
      const amended = state.deltas[capability]?.find(
        (entry) => entry.id === deltaId,
      );
      if (!amended) {
        throw new Error(
          `Spec delta amend for change ${changeId} completed without replacing delta ${deltaId} under capability ${capability}`,
        );
      }
      emitChangeSummarySignal(changeId, state);
      return amended as Delta;
    },
    retract: async (changeId, capability, deltaId, options) => {
      invalidateChange(changeId);
      const commandKind = "specDeltaRetracted";
      const now = new Date().toISOString();
      const basePayload = {
        capability,
        deltaId,
        retractedAt: now,
        retractedBy: options?.retractedBy,
      };
      const { operationId, payloadHash } = buildSpecDeltaCommandIdentity(
        commandKind,
        basePayload,
      );
      const payload = SpecDeltaRetractedSignalPayloadSchema.parse({
        ...basePayload,
        operation_id: operationId,
        command_kind: commandKind,
        payload_hash: payloadHash,
      });
      const outcome = await changeCommand({
        deps,
        changeId,
        operationId,
        commandKind,
        payloadHash,
        signal: specDeltaRetractedSignal,
        signalArgs: [payload],
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
        `specDeltas.retract(${changeId})`,
      );
      const stillPresent = state.deltas[capability]?.find(
        (entry) => entry.id === deltaId,
      );
      if (stillPresent) {
        throw new Error(
          `Spec delta retract for change ${changeId} completed without removing delta ${deltaId} under capability ${capability}`,
        );
      }
      emitChangeSummarySignal(changeId, state);
    },
    remove: async (changeId, capability, delta: DeltaRemove, options) => {
      invalidateChange(changeId);
      const commandKind = "specDeltaRemoved";
      const now = new Date().toISOString();
      const basePayload = {
        capability,
        delta,
        removedAt: now,
        removedBy: options?.removedBy,
      };
      const { operationId, payloadHash } = buildSpecDeltaCommandIdentity(
        commandKind,
        basePayload,
      );
      const payload = SpecDeltaRemovedSignalPayloadSchema.parse({
        ...basePayload,
        operation_id: operationId,
        command_kind: commandKind,
        payload_hash: payloadHash,
      });
      const outcome = await changeCommand({
        deps,
        changeId,
        operationId,
        commandKind,
        payloadHash,
        signal: specDeltaRemovedSignal,
        signalArgs: [payload],
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
        `specDeltas.remove(${changeId})`,
      );
      const appended = state.deltas[capability]?.find(
        (entry) => entry.id === delta.id && entry.operation === "remove",
      );
      if (!appended) {
        throw new Error(
          `Spec delta remove for change ${changeId} completed without appending delta ${delta.id} under capability ${capability}`,
        );
      }
      emitChangeSummarySignal(changeId, state);
      return appended as DeltaRemove;
    },
    rename: async (changeId, capability, delta: DeltaRename, options) => {
      invalidateChange(changeId);
      const commandKind = "specDeltaRenamed";
      const now = new Date().toISOString();
      const basePayload = {
        capability,
        delta,
        renamedAt: now,
        renamedBy: options?.renamedBy,
      };
      const { operationId, payloadHash } = buildSpecDeltaCommandIdentity(
        commandKind,
        basePayload,
      );
      const payload = SpecDeltaRenamedSignalPayloadSchema.parse({
        ...basePayload,
        operation_id: operationId,
        command_kind: commandKind,
        payload_hash: payloadHash,
      });
      const outcome = await changeCommand({
        deps,
        changeId,
        operationId,
        commandKind,
        payloadHash,
        signal: specDeltaRenamedSignal,
        signalArgs: [payload],
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
        `specDeltas.rename(${changeId})`,
      );
      const appended = state.deltas[capability]?.find(
        (entry) => entry.id === delta.id && entry.operation === "rename",
      );
      if (!appended) {
        throw new Error(
          `Spec delta rename for change ${changeId} completed without appending delta ${delta.id} under capability ${capability}`,
        );
      }
      emitChangeSummarySignal(changeId, state);
      return appended as DeltaRename;
    },
  };
}
