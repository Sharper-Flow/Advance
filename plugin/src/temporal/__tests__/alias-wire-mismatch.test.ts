/**
 * Wire-name mismatch proxy test (R1.0 RED).
 *
 * Proves that the store-layer aliases route update names to signal
 * definitions, causing WorkflowUpdateFailedError at runtime.
 */
import { describe, expect, it } from "vitest";
import {
  completeGateUpdate,
  addTaskUpdate,
  updateTaskUpdate,
  cancelTaskUpdate,
  reclassifyTaskTddUpdate,
  reopenFromGateUpdate,
  addChangeWisdomUpdate,
  updateArtifactMetadataUpdate,
  archiveChangeUpdate,
  closeChangeUpdate,
} from "../messages";
import {
  CHANGE_WORKFLOW_UPDATE_NAMES,
  CHANGE_WORKFLOW_SIGNAL_NAMES,
} from "../contracts";

describe("update alias wire-name mismatch (R1.0 RED)", () => {
  it("completeGateUpdate alias has signal wire name, not update name", () => {
    // The alias is `gateCompletedSignal as any`
    // Its name is the signal wire name, not the update wire name.
    expect(completeGateUpdate.name).toBe(
      CHANGE_WORKFLOW_SIGNAL_NAMES.gateCompleted,
    );
    expect(completeGateUpdate.name).not.toBe(
      CHANGE_WORKFLOW_UPDATE_NAMES.completeGate,
    );
  });

  it("addTaskUpdate alias has signal wire name, not update name", () => {
    expect(addTaskUpdate.name).toBe(CHANGE_WORKFLOW_SIGNAL_NAMES.taskAdded);
    expect(addTaskUpdate.name).not.toBe(CHANGE_WORKFLOW_UPDATE_NAMES.addTask);
  });

  it("updateTaskUpdate alias has signal wire name, not update name", () => {
    expect(updateTaskUpdate.name).toBe(
      CHANGE_WORKFLOW_SIGNAL_NAMES.taskUpdated,
    );
    expect(updateTaskUpdate.name).not.toBe(
      CHANGE_WORKFLOW_UPDATE_NAMES.updateTask,
    );
  });

  it("cancelTaskUpdate alias has signal wire name, not update name", () => {
    expect(cancelTaskUpdate.name).toBe(
      CHANGE_WORKFLOW_SIGNAL_NAMES.taskCancelled,
    );
    expect(cancelTaskUpdate.name).not.toBe(
      CHANGE_WORKFLOW_UPDATE_NAMES.cancelTask,
    );
  });

  it("reclassifyTaskTddUpdate alias has signal wire name", () => {
    expect(reclassifyTaskTddUpdate.name).toBe(
      CHANGE_WORKFLOW_SIGNAL_NAMES.taskUpdated,
    );
    expect(reclassifyTaskTddUpdate.name).not.toBe(
      CHANGE_WORKFLOW_UPDATE_NAMES.reclassifyTaskTdd,
    );
  });

  it("reopenFromGateUpdate alias has signal wire name, not update name", () => {
    expect(reopenFromGateUpdate.name).toBe(
      CHANGE_WORKFLOW_SIGNAL_NAMES.gateReentered,
    );
    expect(reopenFromGateUpdate.name).not.toBe(
      CHANGE_WORKFLOW_UPDATE_NAMES.reopenFromGate,
    );
  });

  it("addChangeWisdomUpdate alias has signal wire name, not update name", () => {
    expect(addChangeWisdomUpdate.name).toBe(
      CHANGE_WORKFLOW_SIGNAL_NAMES.wisdomAdded,
    );
    expect(addChangeWisdomUpdate.name).not.toBe(
      CHANGE_WORKFLOW_UPDATE_NAMES.addWisdom,
    );
  });

  it("updateArtifactMetadataUpdate alias has signal wire name", () => {
    expect(updateArtifactMetadataUpdate.name).toBe(
      CHANGE_WORKFLOW_SIGNAL_NAMES.taskUpdated,
    );
    expect(updateArtifactMetadataUpdate.name).not.toBe(
      CHANGE_WORKFLOW_UPDATE_NAMES.updateArtifactMetadata,
    );
  });

  it("archiveChangeUpdate alias has signal wire name, not update name", () => {
    expect(archiveChangeUpdate.name).toBe(
      CHANGE_WORKFLOW_SIGNAL_NAMES.archiveRequested,
    );
    expect(archiveChangeUpdate.name).not.toBe(
      CHANGE_WORKFLOW_UPDATE_NAMES.archiveChange,
    );
  });

  it("closeChangeUpdate alias has signal wire name, not update name", () => {
    expect(closeChangeUpdate.name).toBe(
      CHANGE_WORKFLOW_SIGNAL_NAMES.changeCancelled,
    );
    expect(closeChangeUpdate.name).not.toBe(
      CHANGE_WORKFLOW_UPDATE_NAMES.closeChange,
    );
  });
});
