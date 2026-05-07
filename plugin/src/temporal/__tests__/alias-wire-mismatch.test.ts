/**
 * Wire-name mismatch proxy test (R1.0 → R1.3).
 *
 * Proves that the store-layer aliases have been removed and only
 * clean signal definitions remain.
 */
import { describe, expect, it } from "vitest";
import * as messages from "../messages";

describe("update aliases removed (R1.3)", () => {
  it("does not export completeGateUpdate alias", () => {
    expect(messages).not.toHaveProperty("completeGateUpdate");
  });

  it("does not export addTaskUpdate alias", () => {
    expect(messages).not.toHaveProperty("addTaskUpdate");
  });

  it("does not export updateTaskUpdate alias", () => {
    expect(messages).not.toHaveProperty("updateTaskUpdate");
  });

  it("does not export cancelTaskUpdate alias", () => {
    expect(messages).not.toHaveProperty("cancelTaskUpdate");
  });

  it("does not export reclassifyTaskTddUpdate alias", () => {
    expect(messages).not.toHaveProperty("reclassifyTaskTddUpdate");
  });

  it("does not export reopenFromGateUpdate alias", () => {
    expect(messages).not.toHaveProperty("reopenFromGateUpdate");
  });

  it("does not export addChangeWisdomUpdate alias", () => {
    expect(messages).not.toHaveProperty("addChangeWisdomUpdate");
  });

  it("does not export updateArtifactMetadataUpdate alias", () => {
    expect(messages).not.toHaveProperty("updateArtifactMetadataUpdate");
  });

  it("does not export archiveChangeUpdate alias", () => {
    expect(messages).not.toHaveProperty("archiveChangeUpdate");
  });

  it("does not export closeChangeUpdate alias", () => {
    expect(messages).not.toHaveProperty("closeChangeUpdate");
  });

  it("exports new archiveChangeSignal", () => {
    expect(messages).toHaveProperty("archiveChangeSignal");
    expect(messages.archiveChangeSignal.name).toBe("adv.change.archiveChange");
  });

  it("exports new closeChangeSignal", () => {
    expect(messages).toHaveProperty("closeChangeSignal");
    expect(messages.closeChangeSignal.name).toBe("adv.change.closeChange");
  });

  it("exports new updateArtifactMetadataSignal", () => {
    expect(messages).toHaveProperty("updateArtifactMetadataSignal");
    expect(messages.updateArtifactMetadataSignal.name).toBe(
      "adv.change.updateArtifactMetadata",
    );
  });
});
