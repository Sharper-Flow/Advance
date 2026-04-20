import { describe, expect, it } from "vitest";
import {
  evaluateTemporalReadiness,
  renderTemporalReadinessDecision,
  type TemporalValidationEvidence,
} from "./decision-engine";

function makePassingEvidence(): TemporalValidationEvidence {
  return {
    integration: { pass: true, details: "queries/updates covered" },
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
      ratios: { taskUpdate: 1.3, changeGet: 1.4, gateComplete: 1.2 },
    },
    memory: { pass: true, peakRssBytes: 750 * 1024 * 1024 },
    operatorSetup: { pass: true, elapsedMinutes: 6 },
    parity: { pass: true, unresolvedMismatches: 0, scenarioCount: 18 },
    dryRunMigration: { pass: true, projectCount: 16, unmappableProjects: [] },
    smoke: { pass: true, historyCaptured: true },
  };
}

describe("decision engine", () => {
  it("returns AUTO_GO when all 10 checks pass", () => {
    const decision = evaluateTemporalReadiness(makePassingEvidence());
    expect(decision.verdict).toBe("AUTO_GO");
    expect(decision.failedChecks).toEqual([]);
    expect(decision.summary.totalChecks).toBe(10);
    expect(decision.summary.passedChecks).toBe(10);
  });

  it("returns AMBIGUOUS when any single check fails", () => {
    const evidence = makePassingEvidence();
    evidence.latency.pass = false;
    evidence.latency.ratios.gateComplete = 2.4;

    const decision = evaluateTemporalReadiness(evidence);
    expect(decision.verdict).toBe("AMBIGUOUS");
    expect(decision.failedChecks).toEqual(["latency"]);
    expect(decision.summary.passedChecks).toBe(9);
  });

  it("returns AMBIGUOUS when evidence is partial/incomplete", () => {
    const evidence = makePassingEvidence();
    evidence.smoke.historyCaptured = false;
    evidence.smoke.pass = false;

    const decision = evaluateTemporalReadiness(evidence);
    expect(decision.verdict).toBe("AMBIGUOUS");
    expect(decision.failedChecks).toContain("smoke");
  });

  it("renders markdown decision artifact with verdict, checks, and next step", () => {
    const decision = evaluateTemporalReadiness(makePassingEvidence());
    const md = renderTemporalReadinessDecision({
      changeId: "validateTemporalStorageShapeIs",
      title: "Validate Temporal storage shape",
      decision,
      evidence: makePassingEvidence(),
      reviewedAt: "2026-04-20T00:00:00.000Z",
    });

    expect(md).toContain("# Temporal Readiness Decision");
    expect(md).toContain("AUTO_GO");
    expect(md).toContain("validateTemporalStorageShapeIs");
    expect(md).toContain("migrateAdvStateTemporalRetire");
    expect(md).toContain("Latency");
    expect(md).toContain("Memory");
  });
});
