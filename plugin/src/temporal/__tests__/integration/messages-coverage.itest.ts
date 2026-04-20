/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the Temporal cutover
 * decision is made.
 */

import { describe, expect, it } from "vitest";
import * as messages from "../../messages";
import { COVERED_CHANGE_MESSAGE_NAMES } from "./change-workflow.itest";
import { COVERED_PROJECT_MESSAGE_NAMES } from "./project-workflow.itest";

const EXPECTED_MESSAGE_NAMES = [
  "adv.change.bootstrap",
  "adv.change.state",
  "adv.change.tasks",
  "adv.change.ready",
  "adv.change.task",
  "adv.change.addTask",
  "adv.change.updateTask",
  "adv.change.recordTaskEvidence",
  "adv.change.setTaskPhase",
  "adv.change.cancelTask",
  "adv.change.reclassifyTaskTdd",
  "adv.change.completeGate",
  "adv.change.reopenFromGate",
  "adv.change.addWisdom",
  "adv.change.updateArtifactMetadata",
  "adv.change.closeChange",
  "adv.project.bootstrap",
  "adv.project.state",
  "adv.project.agenda",
  "adv.project.wisdom",
  "adv.project.migrationLedger",
  "adv.project.addAgendaItem",
  "adv.project.updateAgendaItem",
  "adv.project.addWisdom",
  "adv.project.recordMigrationEntry",
] as const;

describe("messages coverage", () => {
  it("keeps the message-name inventory complete and referenced by at least one integration test", () => {
    const covered = new Set([
      ...COVERED_CHANGE_MESSAGE_NAMES,
      ...COVERED_PROJECT_MESSAGE_NAMES,
    ]);
    for (const name of EXPECTED_MESSAGE_NAMES) {
      expect(covered.has(name)).toBe(true);
    }
  });

  it("exports every expected message binding", () => {
    const exportedNames = Object.values(messages)
      .filter(
        (value): value is { name?: string } =>
          typeof value === "object" && value !== null,
      )
      .map((value) => value.name)
      .filter((name): name is string => typeof name === "string");

    for (const name of EXPECTED_MESSAGE_NAMES) {
      expect(exportedNames).toContain(name);
    }
  });
});
