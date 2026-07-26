import { describe, expect, it } from "vitest";
import {
  evaluateWorkerDeploymentReadiness,
  workerDeploymentReadinessEvidence,
  type WorkerDeploymentReadinessInput,
} from "./worker-deployment-readiness";

function allReadyInput(): WorkerDeploymentReadinessInput {
  return {
    serverDeploymentCapability: true,
    deploymentName: "advance-project-worker",
    buildId:
      "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567",
    topology: "pinned_old_new",
    oldAndNewPollersObserved: true,
    currentVersionControl: true,
    rampingVersionControl: true,
    rampPercentageControl: true,
    drainageObserved: true,
    legacyMigrationPlan:
      "Migrate legacy unversioned workflows via Continue-As-New and operator dry-run.",
    operatorRollbackProcedure:
      "Disable deployment receipt, pin previous Build ID, and drain via Temporal CLI.",
  };
}

describe("evaluateWorkerDeploymentReadiness", () => {
  it("AC8: all prerequisites + pinned topology = ready", () => {
    const result = evaluateWorkerDeploymentReadiness(allReadyInput());
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.prerequisites).toMatchObject({
      serverCapability: true,
      stableDeploymentName: true,
      immutableBuildId: true,
      topology: "pinned_old_new",
      simultaneousOldNewPollers: true,
      currentVersionControl: true,
      rampingVersionControl: true,
      rampPercentageControl: true,
      drainageObservedRetirement: true,
      legacyMigration: true,
      operatorRollback: true,
    });
  });

  it("current singleton replace-in-place topology evaluates not-ready", () => {
    const input = allReadyInput();
    input.topology = "singleton_replace_in_place";
    const result = evaluateWorkerDeploymentReadiness(input);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("WORKER_DEPLOYMENT_TOPOLOGY_NOT_PINNED");
  });

  it("unknown topology evaluates not-ready", () => {
    const input = allReadyInput();
    input.topology = "unknown";
    const result = evaluateWorkerDeploymentReadiness(input);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("WORKER_DEPLOYMENT_TOPOLOGY_NOT_PINNED");
  });

  it("missing server capability evaluates not-ready", () => {
    const input = allReadyInput();
    input.serverDeploymentCapability = false;
    const result = evaluateWorkerDeploymentReadiness(input);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain(
      "WORKER_DEPLOYMENT_SERVER_CAPABILITY_MISSING",
    );
  });

  it("missing deployment name evaluates not-ready", () => {
    const input = allReadyInput();
    input.deploymentName = undefined;
    const result = evaluateWorkerDeploymentReadiness(input);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("WORKER_DEPLOYMENT_NAME_MISSING");
  });

  it("whitespace-only deployment name evaluates not-ready", () => {
    const input = allReadyInput();
    input.deploymentName = "   ";
    const result = evaluateWorkerDeploymentReadiness(input);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("WORKER_DEPLOYMENT_NAME_MISSING");
  });

  it("missing build id evaluates not-ready", () => {
    const input = allReadyInput();
    input.buildId = undefined;
    const result = evaluateWorkerDeploymentReadiness(input);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("WORKER_DEPLOYMENT_BUILD_ID_MISSING");
  });

  it("missing simultaneous old/new pollers evaluates not-ready", () => {
    const input = allReadyInput();
    input.oldAndNewPollersObserved = false;
    const result = evaluateWorkerDeploymentReadiness(input);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("WORKER_DEPLOYMENT_POLLERS_MISSING");
  });

  it("missing current/ramping/ramp controls evaluate not-ready", () => {
    const input = allReadyInput();
    input.currentVersionControl = false;
    input.rampingVersionControl = false;
    input.rampPercentageControl = false;
    const result = evaluateWorkerDeploymentReadiness(input);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain(
      "WORKER_DEPLOYMENT_CURRENT_VERSION_CONTROL_MISSING",
    );
    expect(result.blockers).toContain(
      "WORKER_DEPLOYMENT_RAMPING_VERSION_CONTROL_MISSING",
    );
    expect(result.blockers).toContain(
      "WORKER_DEPLOYMENT_RAMP_PERCENTAGE_CONTROL_MISSING",
    );
  });

  it("missing drainage observation evaluates not-ready", () => {
    const input = allReadyInput();
    input.drainageObserved = false;
    const result = evaluateWorkerDeploymentReadiness(input);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain(
      "WORKER_DEPLOYMENT_DRAINAGE_NOT_OBSERVED",
    );
  });

  it("missing legacy migration plan evaluates not-ready", () => {
    const input = allReadyInput();
    input.legacyMigrationPlan = undefined;
    const result = evaluateWorkerDeploymentReadiness(input);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain(
      "WORKER_DEPLOYMENT_LEGACY_MIGRATION_MISSING",
    );
  });

  it("missing operator rollback procedure evaluates not-ready", () => {
    const input = allReadyInput();
    input.operatorRollbackProcedure = undefined;
    const result = evaluateWorkerDeploymentReadiness(input);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain(
      "WORKER_DEPLOYMENT_OPERATOR_ROLLBACK_MISSING",
    );
  });

  it("all missing prerequisites produce every blocker", () => {
    const result = evaluateWorkerDeploymentReadiness({
      serverDeploymentCapability: false,
      deploymentName: undefined,
      buildId: undefined,
      topology: "singleton_replace_in_place",
      oldAndNewPollersObserved: false,
      currentVersionControl: false,
      rampingVersionControl: false,
      rampPercentageControl: false,
      drainageObserved: false,
      legacyMigrationPlan: undefined,
      operatorRollbackProcedure: undefined,
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual([
      "WORKER_DEPLOYMENT_SERVER_CAPABILITY_MISSING",
      "WORKER_DEPLOYMENT_NAME_MISSING",
      "WORKER_DEPLOYMENT_BUILD_ID_MISSING",
      "WORKER_DEPLOYMENT_TOPOLOGY_NOT_PINNED",
      "WORKER_DEPLOYMENT_POLLERS_MISSING",
      "WORKER_DEPLOYMENT_CURRENT_VERSION_CONTROL_MISSING",
      "WORKER_DEPLOYMENT_RAMPING_VERSION_CONTROL_MISSING",
      "WORKER_DEPLOYMENT_RAMP_PERCENTAGE_CONTROL_MISSING",
      "WORKER_DEPLOYMENT_DRAINAGE_NOT_OBSERVED",
      "WORKER_DEPLOYMENT_LEGACY_MIGRATION_MISSING",
      "WORKER_DEPLOYMENT_OPERATOR_ROLLBACK_MISSING",
    ]);
  });
});

describe("workerDeploymentReadinessEvidence", () => {
  it("preserves a not-ready assessment as readable historical evidence", () => {
    const result = evaluateWorkerDeploymentReadiness({
      serverDeploymentCapability: false,
      deploymentName: undefined,
      buildId: undefined,
      topology: "singleton_replace_in_place",
      oldAndNewPollersObserved: false,
      currentVersionControl: false,
      rampingVersionControl: false,
      rampPercentageControl: false,
      drainageObserved: false,
      legacyMigrationPlan: undefined,
      operatorRollbackProcedure: undefined,
    });
    const evidence = workerDeploymentReadinessEvidence(result);
    expect(evidence.ready).toBe(false);
    expect(evidence.topology).toBe("singleton_replace_in_place");
    expect(evidence.blockers).toEqual(result.blockers);
    expect(evidence.prerequisites).toEqual(result.prerequisites);
    expect(evidence.evaluatedAt).toMatch(/^\d{4}-/);
  });
});
