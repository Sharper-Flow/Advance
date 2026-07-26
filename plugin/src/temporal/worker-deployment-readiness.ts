/**
 * worker-deployment-readiness — prerequisite-gated enablement check for
 * Temporal Worker Deployments (rq-workerEvolutionSafety01.2, AC8, D9).
 *
 * ADV currently runs a singleton worker process that the plugin host replaces
 * in-place on bundle drift (worker-multi.ts / worker-roll.ts). That topology
 * cannot safely support pinned Worker Deployment routing because it cannot keep
 * an old worker alive while a new worker drains in-flight executions. This
 * module evaluates the typed readiness checklist and fails closed until every
 * operational prerequisite is proven.
 *
 * Do not enable Worker Deployments while any prerequisite is absent or while
 * the topology is singleton replace-in-place.
 */

export const WORKER_DEPLOYMENT_TOPOLOGIES = [
  "singleton_replace_in_place",
  "pinned_old_new",
  "unknown",
] as const;

export type WorkerDeploymentTopology =
  (typeof WORKER_DEPLOYMENT_TOPOLOGIES)[number];

export interface WorkerDeploymentReadinessInput {
  /** Temporal Server supports Worker Versioning / Worker Deployments. */
  serverDeploymentCapability: boolean;
  /** Stable per-project deployment name (not a random or session-derived id). */
  deploymentName: string | undefined;
  /** Immutable Build ID derived from the artifact digest, not a version string. */
  buildId: string | undefined;
  /** Current runtime topology for worker replacement. */
  topology: WorkerDeploymentTopology;
  /** Both old and new worker processes have been observed polling simultaneously. */
  oldAndNewPollersObserved: boolean;
  /** Current (default) version channel exists and is operator-selectable. */
  currentVersionControl: boolean;
  /** Ramping version channel exists and is operator-selectable. */
  rampingVersionControl: boolean;
  /** Ramp percentage can be adjusted and observed (0-100). */
  rampPercentageControl: boolean;
  /** Drainage has been observed and retirement is automated (not manual guess). */
  drainageObserved: boolean;
  /** Written plan for migrating unversioned legacy workflows/histories. */
  legacyMigrationPlan: string | undefined;
  /** Operator-only rollback / reset procedure documented and executable. */
  operatorRollbackProcedure: string | undefined;
}

export interface WorkerDeploymentPrerequisites {
  serverCapability: boolean;
  stableDeploymentName: boolean;
  immutableBuildId: boolean;
  topology: WorkerDeploymentTopology;
  simultaneousOldNewPollers: boolean;
  currentVersionControl: boolean;
  rampingVersionControl: boolean;
  rampPercentageControl: boolean;
  drainageObservedRetirement: boolean;
  legacyMigration: boolean;
  operatorRollback: boolean;
}

export interface WorkerDeploymentReadinessResult {
  ready: boolean;
  blockers: string[];
  prerequisites: WorkerDeploymentPrerequisites;
}

const BLOCKER_CODES = {
  serverCapability: "WORKER_DEPLOYMENT_SERVER_CAPABILITY_MISSING",
  stableDeploymentName: "WORKER_DEPLOYMENT_NAME_MISSING",
  immutableBuildId: "WORKER_DEPLOYMENT_BUILD_ID_MISSING",
  topologyNotPinned: "WORKER_DEPLOYMENT_TOPOLOGY_NOT_PINNED",
  simultaneousOldNewPollers: "WORKER_DEPLOYMENT_POLLERS_MISSING",
  currentVersionControl: "WORKER_DEPLOYMENT_CURRENT_VERSION_CONTROL_MISSING",
  rampingVersionControl: "WORKER_DEPLOYMENT_RAMPING_VERSION_CONTROL_MISSING",
  rampPercentageControl: "WORKER_DEPLOYMENT_RAMP_PERCENTAGE_CONTROL_MISSING",
  drainageObservedRetirement: "WORKER_DEPLOYMENT_DRAINAGE_NOT_OBSERVED",
  legacyMigration: "WORKER_DEPLOYMENT_LEGACY_MIGRATION_MISSING",
  operatorRollback: "WORKER_DEPLOYMENT_OPERATOR_ROLLBACK_MISSING",
} as const;

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Evaluate whether Temporal Worker Deployment routing may be enabled.
 *
 * Fails closed: any missing prerequisite or an unpinned topology produces a
 * typed blocker. The current ADV singleton replace-in-place topology is
 * explicitly not ready because it cannot retain an old worker until pinned
 * executions drain.
 */
export function evaluateWorkerDeploymentReadiness(
  input: WorkerDeploymentReadinessInput,
): WorkerDeploymentReadinessResult {
  const blockers: string[] = [];

  if (!input.serverDeploymentCapability) {
    blockers.push(BLOCKER_CODES.serverCapability);
  }

  if (!isNonEmptyString(input.deploymentName)) {
    blockers.push(BLOCKER_CODES.stableDeploymentName);
  }

  if (!isNonEmptyString(input.buildId)) {
    blockers.push(BLOCKER_CODES.immutableBuildId);
  }

  if (input.topology !== "pinned_old_new") {
    blockers.push(BLOCKER_CODES.topologyNotPinned);
  }

  if (!input.oldAndNewPollersObserved) {
    blockers.push(BLOCKER_CODES.simultaneousOldNewPollers);
  }

  if (!input.currentVersionControl) {
    blockers.push(BLOCKER_CODES.currentVersionControl);
  }

  if (!input.rampingVersionControl) {
    blockers.push(BLOCKER_CODES.rampingVersionControl);
  }

  if (!input.rampPercentageControl) {
    blockers.push(BLOCKER_CODES.rampPercentageControl);
  }

  if (!input.drainageObserved) {
    blockers.push(BLOCKER_CODES.drainageObservedRetirement);
  }

  if (!isNonEmptyString(input.legacyMigrationPlan)) {
    blockers.push(BLOCKER_CODES.legacyMigration);
  }

  if (!isNonEmptyString(input.operatorRollbackProcedure)) {
    blockers.push(BLOCKER_CODES.operatorRollback);
  }

  const prerequisites: WorkerDeploymentPrerequisites = {
    serverCapability: input.serverDeploymentCapability,
    stableDeploymentName: isNonEmptyString(input.deploymentName),
    immutableBuildId: isNonEmptyString(input.buildId),
    topology: input.topology,
    simultaneousOldNewPollers: input.oldAndNewPollersObserved,
    currentVersionControl: input.currentVersionControl,
    rampingVersionControl: input.rampingVersionControl,
    rampPercentageControl: input.rampPercentageControl,
    drainageObservedRetirement: input.drainageObserved,
    legacyMigration: isNonEmptyString(input.legacyMigrationPlan),
    operatorRollback: isNonEmptyString(input.operatorRollbackProcedure),
  };

  return {
    ready: blockers.length === 0,
    blockers,
    prerequisites,
  };
}

/**
 * Serialize a readiness result into a readable, historical/unversioned
 * evidence record. This preserves the assessment even when the underlying
 * runtime configuration is later lost or changed, satisfying the requirement
 * that historical/unversioned evidence remains readable.
 */
export function workerDeploymentReadinessEvidence(
  result: WorkerDeploymentReadinessResult,
): {
  ready: boolean;
  blockers: string[];
  topology: WorkerDeploymentTopology;
  prerequisites: WorkerDeploymentPrerequisites;
  evaluatedAt: string;
} {
  return {
    ready: result.ready,
    blockers: [...result.blockers],
    topology: result.prerequisites.topology,
    prerequisites: result.prerequisites,
    evaluatedAt: new Date().toISOString(),
  };
}
