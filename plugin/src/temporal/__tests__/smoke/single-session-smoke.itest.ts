/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the Temporal cutover
 * decision is made.
 */

import { describe, expect, it } from "vitest";
import { runSingleSessionSmoke } from "./single-session-smoke";

describe("single-session smoke", () => {
  it("requires ADV_TEMPORAL_PILOT=true before using a real Temporal bundle", async () => {
    await expect(
      runSingleSessionSmoke({
        env: {},
      }),
    ).rejects.toThrow(/ADV_TEMPORAL_PILOT=true/);
  });

  it("returns a captured history path and basic operation counts when enabled", async () => {
    await expect(
      runSingleSessionSmoke({
        env: { ADV_TEMPORAL_PILOT: "true" } as NodeJS.ProcessEnv,
      }),
    ).resolves.toMatchObject({
      pass: true,
      historyPath: expect.stringContaining("smoke-captured.json"),
      counters: expect.objectContaining({
        changesCreated: 1,
        tasksAdded: 1,
        gatesCompleted: 1,
        wisdomAdded: 1,
        reentries: 1,
      }),
    });
  }, 15_000);
});
