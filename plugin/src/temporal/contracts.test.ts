import { describe, expect, it } from "vitest";
import {
  TestRunRecordedSignalPayloadSchema,
  WorkerBundleImpactSetSignalPayloadSchema,
  WorkerBundleProvenanceRecordedSignalPayloadSchema,
  ChangeSchema,
} from "../types";
import {
  applyTestRunRecordedToState,
  applyWorkerBundleProvenanceRecordedToState,
  applyWorkerBundleImpactSetToState,
  changeSeedStateFromChange,
  createChangeWorkflowState,
} from "./change-state";
import { buildChangeWorkflowContinueAsNewSeed } from "./workflows";
import { type ChangeWorkflowInput, type TestRunRecord } from "./contracts";

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

  it("workerBundleImpactSetSignal reduces into state.worker_bundle_impact", () => {
    const payload = WorkerBundleImpactSetSignalPayloadSchema.parse({
      worker_bundle_impact: {
        kind: "required",
        rationale: "Touches workflow-reachable code",
        confirmed_at: "2026-07-25T00:00:02.000Z",
      },
      set_at: "2026-07-25T00:00:02.000Z",
    });

    const state = createChangeWorkflowState({
      changeId: "c-wbp",
      title: "WBP test",
      createdAt: "2026-07-25T00:00:00.000Z",
    });

    applyWorkerBundleImpactSetToState(state, payload);

    expect(state.worker_bundle_impact).toMatchObject({
      kind: "required",
      rationale: "Touches workflow-reachable code",
      confirmed_at: "2026-07-25T00:00:02.000Z",
    });
    expect(state.lastSignalAt).toBe("2026-07-25T00:00:02.000Z");
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

// rq-TDD009seq / KD6: test-run evidence must survive workflow rotation.
describe("continue-as-new seed durability", () => {
  function setupState() {
    const state = createChangeWorkflowState({
      changeId: "c-durability",
      title: "Durability test",
      createdAt: "2026-07-25T00:00:00.000Z",
    });

    state.projectId = "proj-durability";
    state.initializedAt = "2026-07-25T00:00:00.000Z";
    state.title = "Durability test";
    state.worker_bundle_impact = {
      kind: "required",
      rationale: "Builds worker bundle",
      confirmed_at: "2026-07-25T00:00:00.000Z",
    };

    applyTestRunRecordedToState(state, {
      taskId: "tk-409ae138e9ba",
      runId: "tr_red_001",
      phase: "red",
      exitCode: 1,
      classification: "failed",
      command: "pnpm test -- contracts.test.ts",
      durationMs: 500,
      recordedAt: "2026-07-25T00:00:10.000Z",
    });

    applyTestRunRecordedToState(state, {
      taskId: "tk-409ae138e9ba",
      runId: "tr_green_001",
      phase: "green",
      exitCode: 0,
      classification: "passed",
      command: "pnpm test -- contracts.test.ts",
      durationMs: 600,
      recordedAt: "2026-07-25T00:00:20.000Z",
    });

    applyWorkerBundleProvenanceRecordedToState(state, {
      source_sha: "sha256-abc",
      build_run_id: "build-42",
      replay_run_id: "replay-7",
      worker_manifest_generation: 5,
      recorded_at: "2026-07-25T00:00:30.000Z",
    });

    return state;
  }

  const input: ChangeWorkflowInput = {
    projectId: "proj-durability",
    changeId: "c-durability",
    title: "Durability test",
    initializedAt: "2026-07-25T00:00:00.000Z",
  };

  it("preserves testRuns, workerBundleProvenance, and worker_bundle_impact in continue-as-new seed", () => {
    const state = setupState();
    const seed = buildChangeWorkflowContinueAsNewSeed(input, state);

    expect(seed.seedState?.testRuns?.["tk-409ae138e9ba"]).toHaveLength(2);
    expect(seed.seedState?.testRuns?.["tk-409ae138e9ba"]?.[0]?.runId).toBe(
      "tr_red_001",
    );
    expect(seed.seedState?.testRuns?.["tk-409ae138e9ba"]?.[1]?.runId).toBe(
      "tr_green_001",
    );
    expect(seed.seedState?.workerBundleProvenance).toMatchObject({
      source_sha: "sha256-abc",
      build_run_id: "build-42",
      replay_run_id: "replay-7",
      worker_manifest_generation: 5,
      recorded_at: "2026-07-25T00:00:30.000Z",
    });
    expect(seed.seedState?.worker_bundle_impact).toMatchObject({
      kind: "required",
      rationale: "Builds worker bundle",
    });
  });

  it("preserves testRuns, workerBundleProvenance, and worker_bundle_impact across disk reseed", () => {
    const change = {
      id: "c-durability",
      title: "Durability test",
      status: "draft",
      created_at: "2026-07-25T00:00:00.000Z",
      tasks: [],
      test_runs: {
        "tk-409ae138e9ba": [
          {
            runId: "tr_red_001",
            phase: "red",
            exitCode: 1,
            classification: "failed",
            command: "pnpm test -- contracts.test.ts",
            durationMs: 500,
            recordedAt: "2026-07-25T00:00:10.000Z",
          },
          {
            runId: "tr_green_001",
            phase: "green",
            exitCode: 0,
            classification: "passed",
            command: "pnpm test -- contracts.test.ts",
            durationMs: 600,
            recordedAt: "2026-07-25T00:00:20.000Z",
          },
        ],
      },
      deltas: {},
      worker_bundle_impact: {
        kind: "required",
        rationale: "Builds worker bundle",
        confirmed_at: "2026-07-25T00:00:00.000Z",
      },
      workerBundleProvenance: {
        source_sha: "sha256-abc",
        build_run_id: "build-42",
        replay_run_id: "replay-7",
        worker_manifest_generation: 5,
        recorded_at: "2026-07-25T00:00:30.000Z",
      },
    } as any;

    const seed = changeSeedStateFromChange(change);

    expect(seed.testRuns?.["tk-409ae138e9ba"]).toHaveLength(2);
    expect(seed.testRuns?.["tk-409ae138e9ba"]?.[0]?.runId).toBe("tr_red_001");
    expect(seed.testRuns?.["tk-409ae138e9ba"]?.[1]?.runId).toBe("tr_green_001");
    expect(seed.workerBundleProvenance).toMatchObject({
      source_sha: "sha256-abc",
      build_run_id: "build-42",
      replay_run_id: "replay-7",
      worker_manifest_generation: 5,
      recorded_at: "2026-07-25T00:00:30.000Z",
    });
    expect(seed.worker_bundle_impact).toMatchObject({
      kind: "required",
      rationale: "Builds worker bundle",
    });
  });
});
