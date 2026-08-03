import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { join } from "node:path";

import {
  cleanupTempDir,
  createTempDir,
  SAMPLE_CHANGE,
} from "../__tests__/setup";
import type { Change, Gates } from "../types";
import type { TestRunRecord } from "../temporal/contracts";
import { evaluateWorkerBundleProvenanceForChange } from "../temporal/gate-readiness";
import {
  getArchiveGatePreflightError,
  type ArchiveGateState,
} from "../tools/change/archive-gate";
import { loadChange, saveChange } from "./json";

const PROVENANCE: NonNullable<Change["workerBundleProvenance"]> = {
  source_sha: "b170f70b254c26e89126f3ce6c604e7bc9547836",
  build_run_id: "tr_build_worker_001",
  replay_run_id: "tr_replay_determinism_002",
  worker_manifest_generation: 7,
  recorded_at: "2026-08-03T16:37:32.551Z",
};

const TEST_RUNS: Record<string, TestRunRecord[]> = {
  "tk-worker-bundle": [
    {
      runId: PROVENANCE.build_run_id,
      phase: "green",
      exitCode: 0,
      classification: "passed",
      command: "pnpm run build:worker",
      durationMs: 1200,
      evidence_kind: "build_worker",
      recordedAt: "2026-08-03T16:36:00.000Z",
    },
    {
      runId: PROVENANCE.replay_run_id,
      phase: "green",
      exitCode: 0,
      classification: "passed",
      command: "pnpm test -- replay-determinism",
      durationMs: 900,
      evidence_kind: "replay_determinism",
      recordedAt: "2026-08-03T16:37:00.000Z",
    },
  ],
};

const RELEASE_PENDING_GATES: Gates = {
  proposal: { status: "done" },
  discovery: { status: "done" },
  design: { status: "done" },
  planning: { status: "done" },
  execution: { status: "done" },
  acceptance: { status: "done" },
  release: { status: "pending" },
} as Gates;

function makeChange(): Change {
  return {
    ...(SAMPLE_CHANGE as unknown as Change),
    id: "workerBundleGateDiskRoundTrip",
    worker_bundle_impact: {
      kind: "required",
      rationale: "Touches workflow-reachable worker code.",
      confirmed_at: "2026-08-03T16:35:00.000Z",
    },
    workerBundleProvenance: PROVENANCE,
    test_runs: TEST_RUNS,
  };
}

describe("worker-bundle provenance disk round trip", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("worker-bundle-round-trip-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("preserves provenance and passing runs so archive preflight passes", async () => {
    const changesDir = join(tempDir, ".adv", "changes");
    const original = makeChange();

    await saveChange(changesDir, original);

    const loaded = await loadChange(changesDir, original.id);
    expect(loaded.success).toBe(true);
    if (!loaded.success) throw new Error(loaded.error);

    expect(loaded.data.workerBundleProvenance).toEqual(PROVENANCE);
    expect(loaded.data.test_runs).toEqual(TEST_RUNS);

    const readiness = evaluateWorkerBundleProvenanceForChange(loaded.data);
    expect(readiness).toEqual({ ok: true, blockers: [] });

    const gateState: ArchiveGateState = {
      effectiveGates: RELEASE_PENDING_GATES,
      storeGates: RELEASE_PENDING_GATES,
      source: "store",
    };
    expect(
      getArchiveGatePreflightError(
        original.id,
        gateState,
        true,
        null,
        loaded.data,
      ),
    ).toBeNull();
  });
});
