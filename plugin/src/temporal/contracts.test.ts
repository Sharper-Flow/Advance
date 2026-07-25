import { describe, expect, it } from "vitest";
import {
  TestRunRecordedSignalPayloadSchema,
  WorkerBundleProvenanceRecordedSignalPayloadSchema,
  ChangeSchema,
} from "../types";
import {
  applyWorkerBundleProvenanceRecordedToState,
  createChangeWorkflowState,
} from "./change-state";
import { type TestRunRecord } from "./contracts";

describe("worker bundle provenance + evidence_kind typed additions", () => {
  it("ChangeSchema accepts worker_bundle_impact", () => {
    const parsed = ChangeSchema.parse({
      id: "worker-bundle-change",
      title: "Worker bundle impact",
      status: "draft",
      created_at: "2026-07-25T00:00:00.000Z",
      tasks: [],
      deltas: {},
      worker_bundle_impact: {
        kind: "required",
        rationale: "Builds worker bundle",
        confirmed_at: "2026-07-25T00:00:00.000Z",
      },
    });

    expect(parsed.worker_bundle_impact).toMatchObject({
      kind: "required",
      rationale: "Builds worker bundle",
      confirmed_at: "2026-07-25T00:00:00.000Z",
    });
  });

  it("workerBundleProvenanceRecordedSignal reduces into state.workerBundleProvenance", () => {
    const payload = WorkerBundleProvenanceRecordedSignalPayloadSchema.parse({
      source_sha: "abc123",
      build_run_id: "build-42",
      replay_run_id: "replay-7",
      worker_manifest_generation: 3,
      recorded_at: "2026-07-25T00:00:01.000Z",
    });

    const state = createChangeWorkflowState({
      changeId: "c-wbp",
      title: "WBP test",
      createdAt: "2026-07-25T00:00:00.000Z",
    });

    applyWorkerBundleProvenanceRecordedToState(state, payload);

    expect(state.workerBundleProvenance).toMatchObject({
      source_sha: "abc123",
      build_run_id: "build-42",
      replay_run_id: "replay-7",
      worker_manifest_generation: 3,
      recorded_at: "2026-07-25T00:00:01.000Z",
    });
    expect(state.lastSignalAt).toBe("2026-07-25T00:00:01.000Z");
  });

  it("TestRunRecord signal payload accepts evidence_kind", () => {
    const payload = TestRunRecordedSignalPayloadSchema.parse({
      taskId: "tk-foo",
      runId: "tr_001",
      phase: "green",
      exitCode: 0,
      classification: "passed",
      command: "pnpm test",
      durationMs: 1000,
      evidence_kind: "build_worker",
      recordedAt: "2026-07-25T00:00:02.000Z",
    });

    expect(payload.evidence_kind).toBe("build_worker");

    // Ensure the record shape flows through to the TestRunRecord type.
    const record = payload as unknown as TestRunRecord;
    expect(record.evidence_kind).toBe("build_worker");
  });
});
