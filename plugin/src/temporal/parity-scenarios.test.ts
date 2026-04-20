/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the Temporal cutover
 * decision is made.
 */

import { describe, expect, it } from "vitest";
import {
  STORAGE_LAYER_SCENARIOS,
  STORAGE_LAYER_SCENARIO_GROUPS,
} from "./parity-scenarios";

describe("storage-layer parity scenarios", () => {
  it("defines all 6 required scenario groups", () => {
    expect(Object.keys(STORAGE_LAYER_SCENARIO_GROUPS).sort()).toEqual([
      "changes",
      "gates",
      "reentry",
      "shutdown",
      "tasks",
      "wisdom",
    ]);
  });

  it("exports at least one runnable scenario per group", () => {
    for (const [group, scenarios] of Object.entries(
      STORAGE_LAYER_SCENARIO_GROUPS,
    )) {
      expect(scenarios.length).toBeGreaterThan(0);
      for (const scenario of scenarios) {
        expect(scenario.id).toContain(group);
        expect(typeof scenario.run).toBe("function");
      }
    }
  });

  it("assigns at least one requirement id to every scenario", () => {
    for (const scenario of STORAGE_LAYER_SCENARIOS) {
      expect(scenario.requirementIds?.length).toBeGreaterThan(0);
    }
  });

  it("uses unique scenario ids", () => {
    const ids = STORAGE_LAYER_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
