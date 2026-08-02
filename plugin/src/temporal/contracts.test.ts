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
import { evaluateGateReadiness } from "./gate-readiness";
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

    state.projectId = "0000d00ab0000000000000000000000000000000";
    state.initializedAt = "2026-07-25T00:00:00.000Z";
    state.title = "Durability test";
    state.worker_bundle_impact = {
      kind: "required",
      rationale: "Builds worker bundle",
      confirmed_at: "2026-07-25T00:00:00.000Z",
    };

    applyTestRunRecordedToState(state, {
      taskId: "tk-409ae138e9ba",
      runId: "tr_build_001",
      phase: "verify",
      exitCode: 0,
      classification: "passed",
      command: "pnpm run build:worker",
      durationMs: 500,
      evidence_kind: "build_worker",
      recordedAt: "2026-07-25T00:00:10.000Z",
    });

    applyTestRunRecordedToState(state, {
      taskId: "tk-409ae138e9ba",
      runId: "tr_replay_001",
      phase: "verify",
      exitCode: 0,
      classification: "passed",
      command: "bin/oc-test targeted -- replay-determinism.test.ts",
      durationMs: 600,
      evidence_kind: "replay_determinism",
      recordedAt: "2026-07-25T00:00:20.000Z",
    });

    applyWorkerBundleProvenanceRecordedToState(state, {
      source_sha: "sha256-abc",
      build_run_id: "tr_build_001",
      replay_run_id: "tr_replay_001",
      worker_manifest_generation: 5,
      recorded_at: "2026-07-25T00:00:30.000Z",
    });

    return state;
  }

  const input: ChangeWorkflowInput = {
    projectId: "0000d00ab0000000000000000000000000000000",
    changeId: "c-durability",
    title: "Durability test",
    initializedAt: "2026-07-25T00:00:00.000Z",
  };

  it("preserves testRuns, workerBundleProvenance, and worker_bundle_impact in continue-as-new seed", () => {
    const state = setupState();
    const seed = buildChangeWorkflowContinueAsNewSeed(input, state);

    expect(seed.seedState?.testRuns?.["tk-409ae138e9ba"]).toHaveLength(2);
    expect(seed.seedState?.testRuns?.["tk-409ae138e9ba"]?.[0]?.runId).toBe(
      "tr_build_001",
    );
    expect(seed.seedState?.testRuns?.["tk-409ae138e9ba"]?.[1]?.runId).toBe(
      "tr_replay_001",
    );
    expect(seed.seedState?.workerBundleProvenance).toMatchObject({
      source_sha: "sha256-abc",
      build_run_id: "tr_build_001",
      replay_run_id: "tr_replay_001",
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

  it("KD6: release gate still reads provenance evidence after continue-as-new seed rotation", () => {
    const state = setupState();
    const seed = buildChangeWorkflowContinueAsNewSeed(input, state);

    // Simulate the workflow start seed-application path (createChangeWorkflowState
    // builds a base state, then the workflow copies seedState fields onto it).
    const rotatedState = createChangeWorkflowState({
      changeId: input.changeId,
      title: input.title,
      createdAt: input.initializedAt,
    });
    rotatedState.projectId = input.projectId;
    rotatedState.initializedAt = input.initializedAt;
    rotatedState.worker_bundle_impact = seed.seedState?.worker_bundle_impact;
    rotatedState.workerBundleProvenance =
      seed.seedState?.workerBundleProvenance;
    rotatedState.testRuns = seed.seedState?.testRuns;

    // Seed fields must round-trip into the freshly-created state.
    expect(rotatedState.worker_bundle_impact?.kind).toBe("required");
    expect(rotatedState.workerBundleProvenance).toMatchObject({
      source_sha: "sha256-abc",
      build_run_id: "tr_build_001",
      replay_run_id: "tr_replay_001",
    });
    expect(rotatedState.testRuns?.["tk-409ae138e9ba"]).toHaveLength(2);

    // After rotation the release gate can still evaluate the provenance.
    const result = evaluateGateReadiness(rotatedState, "release", {
      enforceWorkerBundleProvenance: true,
    });
    expect(
      result.blockers.some((b) =>
        b.code.startsWith("WORKER_BUNDLE_PROVENANCE"),
      ),
    ).toBe(false);
  });

  it("KD6: release gate still reads provenance evidence after disk reseed", () => {
    const change = {
      id: "c-durability",
      title: "Durability test",
      status: "draft",
      created_at: "2026-07-25T00:00:00.000Z",
      tasks: [],
      test_runs: {
        "tk-409ae138e9ba": [
          {
            runId: "tr_build_001",
            phase: "verify",
            exitCode: 0,
            classification: "passed",
            command: "pnpm run build:worker",
            durationMs: 500,
            evidence_kind: "build_worker",
            recordedAt: "2026-07-25T00:00:10.000Z",
          },
          {
            runId: "tr_replay_001",
            phase: "verify",
            exitCode: 0,
            classification: "passed",
            command: "bin/oc-test targeted -- replay-determinism.test.ts",
            durationMs: 600,
            evidence_kind: "replay_determinism",
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
        build_run_id: "tr_build_001",
        replay_run_id: "tr_replay_001",
        worker_manifest_generation: 5,
        recorded_at: "2026-07-25T00:00:30.000Z",
      },
    } as any;

    const seed = changeSeedStateFromChange(change);
    const reseededInput: ChangeWorkflowInput = {
      projectId: "0000d00ab0000000000000000000000000000000",
      changeId: "c-durability",
      title: "Durability test",
      initializedAt: "2026-07-25T00:00:00.000Z",
      seedState: seed,
    };

    // Simulate the workflow start seed-application path.
    const state = createChangeWorkflowState({
      changeId: reseededInput.changeId,
      title: reseededInput.title,
      createdAt: reseededInput.initializedAt,
    });
    state.projectId = reseededInput.projectId;
    state.initializedAt = reseededInput.initializedAt;
    state.worker_bundle_impact = reseededInput.seedState?.worker_bundle_impact;
    state.workerBundleProvenance =
      reseededInput.seedState?.workerBundleProvenance;
    state.testRuns = reseededInput.seedState?.testRuns;

    const result = evaluateGateReadiness(state, "release", {
      enforceWorkerBundleProvenance: true,
    });
    expect(
      result.blockers.some((b) =>
        b.code.startsWith("WORKER_BUNDLE_PROVENANCE"),
      ),
    ).toBe(false);
  });
});
