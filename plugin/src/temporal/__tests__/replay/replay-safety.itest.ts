/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the Temporal cutover
 * decision is made.
 */

import { describe, expect, it } from "vitest";
import { REPLAY_HISTORY_FILES, replayWorkflowHistories } from "./replay-safety";

describe("replay safety", () => {
  it("declares the 2 synthetic history fixtures and the future smoke fixture", () => {
    expect(REPLAY_HISTORY_FILES.syntheticChangeLifecycle).toContain(
      "synthetic-change-lifecycle.json",
    );
    expect(REPLAY_HISTORY_FILES.syntheticReentryAndClosure).toContain(
      "synthetic-reentry-and-closure.json",
    );
    expect(REPLAY_HISTORY_FILES.smokeCaptured).toContain("smoke-captured.json");
  });

  it("replays provided histories without determinism failures", async () => {
    await expect(
      replayWorkflowHistories({
        histories: [REPLAY_HISTORY_FILES.syntheticChangeLifecycle],
      }),
    ).resolves.toMatchObject({
      pass: true,
      replayed: 1,
    });
  });
});
