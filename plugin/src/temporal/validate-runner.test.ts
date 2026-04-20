import { describe, expect, it, vi } from "vitest";
import {
  createValidationTempDir,
  runTemporalValidation,
} from "./validate-runner";
import type { TemporalValidationEvidence } from "./decision-engine";

function passingEvidence(): TemporalValidationEvidence {
  return {
    integration: { pass: true, details: "ok" },
    replay: { pass: true, historyCount: 3 },
    workerLifecycle: {
      pass: true,
      checks: {
        sigtermFlush: true,
        duplicateSignal: true,
        restartNoRedo: true,
      },
    },
    divergence: { pass: true, unresolvedCount: 0 },
    latency: {
      pass: true,
      ratios: { taskUpdate: 1.1, changeGet: 1.2, gateComplete: 1.3 },
    },
    memory: { pass: true, peakRssBytes: 500_000_000 },
    operatorSetup: { pass: true, elapsedMinutes: 5 },
    parity: { pass: true, unresolvedMismatches: 0, scenarioCount: 18 },
    dryRunMigration: { pass: true, projectCount: 16, unmappableProjects: [] },
    smoke: { pass: true, historyCaptured: true },
  };
}

describe("validate runner", () => {
  it("creates an isolated tempdir under system tmp", async () => {
    const dir = await createValidationTempDir("validateTemporalStorageShapeIs");
    expect(dir).toContain("validateTemporalStorageShapeIs");
  });

  it("runs modules in order and returns AUTO_GO result when all evidence passes", async () => {
    const calls: string[] = [];
    const result = await runTemporalValidation({
      context: {
        changeId: "validateTemporalStorageShapeIs",
        title: "Validate Temporal storage shape",
      },
      modules: {
        integration: async () => (
          calls.push("integration"),
          passingEvidence().integration
        ),
        replay: async () => (calls.push("replay"), passingEvidence().replay),
        workerLifecycle: async () => (
          calls.push("workerLifecycle"),
          passingEvidence().workerLifecycle
        ),
        parity: async () => (calls.push("parity"), passingEvidence().parity),
        dryRunMigration: async () => (
          calls.push("dryRunMigration"),
          passingEvidence().dryRunMigration
        ),
        smoke: async () => (calls.push("smoke"), passingEvidence().smoke),
        latency: async () => (calls.push("latency"), passingEvidence().latency),
        memory: async () => (calls.push("memory"), passingEvidence().memory),
        operatorSetup: async () => (
          calls.push("operatorSetup"),
          passingEvidence().operatorSetup
        ),
      },
      writeDecision: async () => {},
      reviewedAt: "2026-04-20T00:00:00.000Z",
    });

    expect(calls).toEqual([
      "integration",
      "replay",
      "workerLifecycle",
      "parity",
      "dryRunMigration",
      "smoke",
      "latency",
      "memory",
      "operatorSetup",
    ]);
    expect(result.decision.verdict).toBe("AUTO_GO");
  });

  it("writes the decision artifact markdown", async () => {
    const writeDecision = vi.fn(async () => {});
    await runTemporalValidation({
      context: {
        changeId: "validateTemporalStorageShapeIs",
        title: "Validate Temporal storage shape",
      },
      modules: {
        integration: async () => passingEvidence().integration,
        replay: async () => passingEvidence().replay,
        workerLifecycle: async () => passingEvidence().workerLifecycle,
        parity: async () => passingEvidence().parity,
        dryRunMigration: async () => passingEvidence().dryRunMigration,
        smoke: async () => passingEvidence().smoke,
        latency: async () => passingEvidence().latency,
        memory: async () => passingEvidence().memory,
        operatorSetup: async () => passingEvidence().operatorSetup,
      },
      writeDecision,
      reviewedAt: "2026-04-20T00:00:00.000Z",
    });

    expect(writeDecision).toHaveBeenCalledTimes(1);
    const body = writeDecision.mock.calls[0][0] as string;
    expect(body).toContain("# Temporal Readiness Decision");
    expect(body).toContain("AUTO_GO");
  });
});
