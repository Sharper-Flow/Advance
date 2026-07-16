/**
 * Lightweight Change Profile Types
 *
 * Typed, fail-closed eligibility state for small, low-risk ADV changes.
 * The profile preserves the seven-gate lifecycle while allowing bounded
 * omission of optional advisory work only when all six structural criteria
 * are explicitly satisfied.
 *
 * All evaluation is pure and host-I/O-free. Git/worktree evidence collection
 * lives outside this module; the evaluator consumes a normalized snapshot.
 */

import { z } from "zod";

export const LightweightProfileCriterionIdSchema = z.enum([
  "implementation_task_count",
  "changed_file_count",
  "spec_delta",
  "dependency_change",
  "api_compatibility",
  "repository_scope",
]);
export type LightweightProfileCriterionId = z.infer<
  typeof LightweightProfileCriterionIdSchema
>;

export const LightweightProfileCriterionStatusSchema = z.enum([
  "satisfied",
  "failed",
  "unknown",
]);
export type LightweightProfileCriterionStatus = z.infer<
  typeof LightweightProfileCriterionStatusSchema
>;

export const LightweightProfileRequestSchema = z.object({
  requestId: z.string().min(1),
  baselineRevision: z.string().min(1),
  requestedAt: z.string(),
  requestedBy: z.string().optional(),
});
export type LightweightProfileRequest = z.infer<
  typeof LightweightProfileRequestSchema
>;

export const LightweightProfileEvidenceSnapshotSchema = z.object({
  projectId: z.string().min(1),
  baselineRevision: z.string().min(1),
  observedRevision: z.string().min(1),
  fingerprint: z.string().min(1),
  taskCount: z.object({
    total: z.number().int().nonnegative(),
    implementation: z.number().int().nonnegative(),
  }),
  changedPaths: z.object({
    count: z.number().int().nonnegative(),
    paths: z.array(z.string()),
    renames: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    untrackedCount: z.number().int().nonnegative(),
    rangeStatus: z.enum([
      "complete",
      "incomplete_rev_parse",
      "incomplete_diff",
      "incomplete_status",
    ]),
  }),
  specDelta: z.object({
    hasDelta: z.boolean(),
    capabilities: z.array(z.string()),
  }),
  dependencyChange: z.object({
    hasDependencyChange: z.boolean(),
    manifests: z.array(z.string()),
  }),
  apiCompatibility: z.object({
    publicSurface: z.enum([
      "proven_private",
      "public_impact",
      "unknown",
      "graph_failure",
      "policy_absent",
    ]),
    publicRoots: z.array(z.string()).optional(),
  }),
  repoScope: z.object({
    currentProjectOnly: z.boolean(),
    scopeRepos: z.number().int().nonnegative(),
  }),
});
export type LightweightProfileEvidenceSnapshot = z.infer<
  typeof LightweightProfileEvidenceSnapshotSchema
>;

export const LightweightProfileCriterionRecordSchema = z.object({
  criterion: LightweightProfileCriterionIdSchema,
  status: LightweightProfileCriterionStatusSchema,
  reason: z.string(),
});
export type LightweightProfileCriterionRecord = z.infer<
  typeof LightweightProfileCriterionRecordSchema
>;

export const LightweightProfileResultSchema = z.enum([
  "qualified",
  "ineligible",
  "downgraded",
]);
export type LightweightProfileResult = z.infer<
  typeof LightweightProfileResultSchema
>;

export const LightweightProfilePhaseSchema = z.enum([
  "initial",
  "execution_boundary",
  "acceptance_boundary",
]);
export type LightweightProfilePhase = z.infer<
  typeof LightweightProfilePhaseSchema
>;

export const LightweightProfileEvaluationSchema = z.object({
  evaluationKey: z.string().min(1),
  phase: LightweightProfilePhaseSchema,
  result: LightweightProfileResultSchema,
  criteria: z.array(LightweightProfileCriterionRecordSchema).min(6).max(6),
  evidenceFingerprint: z.string().min(1),
  observedRevision: z.string().min(1),
  evaluatedAt: z.string(),
  downgradeReason: z.string().optional(),
});
export type LightweightProfileEvaluation = z.infer<
  typeof LightweightProfileEvaluationSchema
>;

export const LightweightProfileOmissionPolicySchema = z.object({
  omitDeepScans: z.boolean(),
  omitGenericExternalResearch: z.boolean(),
  omitOpportunityScouting: z.boolean(),
  omitDefaultSpecialistDelegation: z.boolean(),
});
export type LightweightProfileOmissionPolicy = z.infer<
  typeof LightweightProfileOmissionPolicySchema
>;

export const LightweightChangeProfileSchema = z.object({
  request: LightweightProfileRequestSchema,
  omissionPolicy: LightweightProfileOmissionPolicySchema,
  evaluations: z.array(LightweightProfileEvaluationSchema).default([]),
});
export type LightweightChangeProfile = z.infer<
  typeof LightweightChangeProfileSchema
>;

export function buildLightweightProfileEvaluationKey(
  requestId: string,
  phase: LightweightProfilePhase,
  fingerprint: string,
): string {
  return `${requestId}:${phase}:${fingerprint}`;
}

export const CRITERION_ORDER: LightweightProfileCriterionId[] = [
  "implementation_task_count",
  "changed_file_count",
  "spec_delta",
  "dependency_change",
  "api_compatibility",
  "repository_scope",
];

function evaluateTaskCount(
  taskCount: LightweightProfileEvidenceSnapshot["taskCount"],
): LightweightProfileCriterionRecord {
  if (
    typeof taskCount !== "object" ||
    taskCount === null ||
    typeof taskCount.total !== "number" ||
    typeof taskCount.implementation !== "number"
  ) {
    return {
      criterion: "implementation_task_count",
      status: "unknown",
      reason: "Task count evidence is malformed or unavailable",
    };
  }
  if (taskCount.implementation === 1 && taskCount.total <= 2) {
    return {
      criterion: "implementation_task_count",
      status: "satisfied",
      reason: `Exactly one implementation task (${taskCount.total} total)`,
    };
  }
  return {
    criterion: "implementation_task_count",
    status: "failed",
    reason: `Expected one implementation task and at most two total, got ${taskCount.implementation} implementation / ${taskCount.total} total`,
  };
}

function evaluateChangedPaths(
  changedPaths: LightweightProfileEvidenceSnapshot["changedPaths"],
): LightweightProfileCriterionRecord {
  if (
    typeof changedPaths !== "object" ||
    changedPaths === null ||
    typeof changedPaths.count !== "number" ||
    !Array.isArray(changedPaths.paths)
  ) {
    return {
      criterion: "changed_file_count",
      status: "unknown",
      reason: "Changed-path evidence is malformed or unavailable",
    };
  }
  if (changedPaths.rangeStatus !== "complete") {
    return {
      criterion: "changed_file_count",
      status: "failed",
      reason: `Changed-path evidence is incomplete (${changedPaths.rangeStatus}); complete range cannot be trusted`,
    };
  }
  if (changedPaths.untrackedCount > 0) {
    return {
      criterion: "changed_file_count",
      status: "failed",
      reason: `Untracked paths present (${changedPaths.untrackedCount}); complete range cannot be trusted`,
    };
  }
  const effectiveCount =
    changedPaths.count + changedPaths.renames + changedPaths.deletions;
  if (effectiveCount > 2) {
    return {
      criterion: "changed_file_count",
      status: "failed",
      reason: `More than two changed paths including renames/deletions (${effectiveCount})`,
    };
  }
  return {
    criterion: "changed_file_count",
    status: "satisfied",
    reason: `At most two changed paths across complete range (${effectiveCount} effective)`,
  };
}

function evaluateSpecDelta(
  specDelta: LightweightProfileEvidenceSnapshot["specDelta"],
): LightweightProfileCriterionRecord {
  if (
    typeof specDelta !== "object" ||
    specDelta === null ||
    typeof specDelta.hasDelta !== "boolean"
  ) {
    return {
      criterion: "spec_delta",
      status: "unknown",
      reason: "Spec-delta evidence is malformed or unavailable",
    };
  }
  if (specDelta.hasDelta) {
    return {
      criterion: "spec_delta",
      status: "failed",
      reason: `Spec delta present under ${specDelta.capabilities.join(", ") || "unknown capability"}`,
    };
  }
  return {
    criterion: "spec_delta",
    status: "satisfied",
    reason: "No spec delta present",
  };
}

function evaluateDependencyChange(
  dependencyChange: LightweightProfileEvidenceSnapshot["dependencyChange"],
): LightweightProfileCriterionRecord {
  if (
    typeof dependencyChange !== "object" ||
    dependencyChange === null ||
    typeof dependencyChange.hasDependencyChange !== "boolean"
  ) {
    return {
      criterion: "dependency_change",
      status: "unknown",
      reason: "Dependency-change evidence is malformed or unavailable",
    };
  }
  if (dependencyChange.hasDependencyChange) {
    return {
      criterion: "dependency_change",
      status: "failed",
      reason: `Dependency manifest/lockfile changes present (${dependencyChange.manifests.join(", ") || "unknown"})`,
    };
  }
  return {
    criterion: "dependency_change",
    status: "satisfied",
    reason: "No dependency manifest or lockfile changes",
  };
}

function evaluateApiCompatibility(
  apiCompatibility: LightweightProfileEvidenceSnapshot["apiCompatibility"],
): LightweightProfileCriterionRecord {
  if (
    typeof apiCompatibility !== "object" ||
    apiCompatibility === null ||
    typeof apiCompatibility.publicSurface !== "string"
  ) {
    return {
      criterion: "api_compatibility",
      status: "unknown",
      reason: "API-compatibility evidence is malformed or unavailable",
    };
  }
  switch (apiCompatibility.publicSurface) {
    case "proven_private":
      return {
        criterion: "api_compatibility",
        status: "satisfied",
        reason:
          "Changed paths are proven private by public-root reachability policy",
      };
    case "public_impact":
      return {
        criterion: "api_compatibility",
        status: "failed",
        reason: "Changed paths reach or alter a public interface",
      };
    case "graph_failure":
      return {
        criterion: "api_compatibility",
        status: "failed",
        reason: "Public-surface reachability graph could not be evaluated",
      };
    case "policy_absent":
      return {
        criterion: "api_compatibility",
        status: "failed",
        reason: "No public-root reachability policy is configured",
      };
    case "unknown":
    default:
      return {
        criterion: "api_compatibility",
        status: "unknown",
        reason: "Public-surface impact is unknown",
      };
  }
}

function evaluateRepoScope(
  repoScope: LightweightProfileEvidenceSnapshot["repoScope"],
): LightweightProfileCriterionRecord {
  if (
    typeof repoScope !== "object" ||
    repoScope === null ||
    typeof repoScope.currentProjectOnly !== "boolean" ||
    typeof repoScope.scopeRepos !== "number"
  ) {
    return {
      criterion: "repository_scope",
      status: "unknown",
      reason: "Repository-scope evidence is malformed or unavailable",
    };
  }
  if (repoScope.currentProjectOnly && repoScope.scopeRepos <= 1) {
    return {
      criterion: "repository_scope",
      status: "satisfied",
      reason: "Current project only",
    };
  }
  return {
    criterion: "repository_scope",
    status: "failed",
    reason: `Scope spans ${repoScope.scopeRepos} repo(s); cross-repo scope is not eligible`,
  };
}

function evaluateCriterion(
  id: LightweightProfileCriterionId,
  snapshot: LightweightProfileEvidenceSnapshot,
): LightweightProfileCriterionRecord {
  switch (id) {
    case "implementation_task_count":
      return evaluateTaskCount(snapshot.taskCount);
    case "changed_file_count":
      return evaluateChangedPaths(snapshot.changedPaths);
    case "spec_delta":
      return evaluateSpecDelta(snapshot.specDelta);
    case "dependency_change":
      return evaluateDependencyChange(snapshot.dependencyChange);
    case "api_compatibility":
      return evaluateApiCompatibility(snapshot.apiCompatibility);
    case "repository_scope":
      return evaluateRepoScope(snapshot.repoScope);
    default: {
      const _exhaustive: never = id;
      return {
        criterion: _exhaustive,
        status: "unknown",
        reason: "Unrecognized criterion",
      };
    }
  }
}

export interface EvaluateLightweightProfileInput {
  snapshot: LightweightProfileEvidenceSnapshot;
  requestId: string;
  phase: LightweightProfilePhase;
  evaluatedAt: string;
  previousResult?: LightweightProfileResult;
  evaluationKey?: string;
}

export function evaluateLightweightProfile(
  input: EvaluateLightweightProfileInput,
): LightweightProfileEvaluation {
  const criteria = CRITERION_ORDER.map((id) =>
    evaluateCriterion(id, input.snapshot),
  );
  const allSatisfied = criteria.every(
    (record) => record.status === "satisfied",
  );
  let result: LightweightProfileResult = allSatisfied
    ? "qualified"
    : "ineligible";
  let downgradeReason: string | undefined;

  if (input.previousResult === "qualified" && result !== "qualified") {
    result = "downgraded";
    downgradeReason = `Revalidation at ${input.phase} failed after previous qualification`;
  }

  const evaluationKey =
    input.evaluationKey ??
    buildLightweightProfileEvaluationKey(
      input.requestId,
      input.phase,
      input.snapshot.fingerprint,
    );

  return {
    evaluationKey,
    phase: input.phase,
    result,
    criteria,
    evidenceFingerprint: input.snapshot.fingerprint,
    observedRevision: input.snapshot.observedRevision,
    evaluatedAt: input.evaluatedAt,
    downgradeReason,
  };
}

export const LIGHTWEIGHT_PROFILE_OMISSION_CATEGORIES = [
  "omitDeepScans",
  "omitGenericExternalResearch",
  "omitOpportunityScouting",
  "omitDefaultSpecialistDelegation",
] as const;
