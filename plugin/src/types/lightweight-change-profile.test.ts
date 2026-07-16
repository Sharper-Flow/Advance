/**
 * Lightweight Change Profile — pure evaluator tests.
 *
 * Covers qualification, every failure class, unknown/stale/malformed evidence,
 * downgrade semantics, and stable evaluation keys.
 */
import { describe, expect, it } from "vitest";
import {
  buildLightweightProfileEvaluationKey,
  evaluateLightweightProfile,
  LightweightProfileEvaluationSchema,
  LightweightProfileEvidenceSnapshotSchema,
  type LightweightProfileEvidenceSnapshot,
} from "./lightweight-change-profile";

const timestamp = "2026-07-16T18:00:00.000Z";

function makeValidSnapshot(): LightweightProfileEvidenceSnapshot {
  return {
    projectId: "bdf259aa162ae192af5b18899ccdc653b085528d",
    baselineRevision: "base-abc",
    observedRevision: "head-abc",
    fingerprint: "fp-1",
    taskCount: { total: 1, implementation: 1 },
    changedPaths: {
      count: 1,
      paths: ["plugin/src/types/lightweight-change-profile.ts"],
      renames: 0,
      deletions: 0,
      untrackedCount: 0,
      rangeStatus: "complete",
    },
    specDelta: { hasDelta: false, capabilities: [] },
    dependencyChange: { hasDependencyChange: false, manifests: [] },
    apiCompatibility: { publicSurface: "proven_private", publicRoots: [] },
    repoScope: { currentProjectOnly: true, scopeRepos: 1 },
  };
}

describe("evaluateLightweightProfile", () => {
  it("qualifies when all six criteria are satisfied", () => {
    const result = evaluateLightweightProfile({
      snapshot: makeValidSnapshot(),
      requestId: "req-1",
      phase: "initial",
      evaluatedAt: timestamp,
    });

    expect(result.result).toBe("qualified");
    expect(result.criteria).toHaveLength(6);
    expect(result.criteria.every((c) => c.status === "satisfied")).toBe(true);
    expect(result.evaluationKey).toBe(
      buildLightweightProfileEvaluationKey("req-1", "initial", "fp-1"),
    );
  });

  it("is ineligible when implementation task count is not exactly one", () => {
    const snapshot = makeValidSnapshot();
    snapshot.taskCount = { total: 2, implementation: 2 };

    const result = evaluateLightweightProfile({
      snapshot,
      requestId: "req-1",
      phase: "initial",
      evaluatedAt: timestamp,
    });

    expect(result.result).toBe("ineligible");
    const taskCriterion = result.criteria.find(
      (c) => c.criterion === "implementation_task_count",
    );
    expect(taskCriterion?.status).toBe("failed");
  });

  it("is ineligible when changed-file count exceeds two", () => {
    const snapshot = makeValidSnapshot();
    snapshot.changedPaths = {
      count: 3,
      paths: ["a.ts", "b.ts", "c.ts"],
      renames: 0,
      deletions: 0,
      untrackedCount: 0,
      rangeStatus: "complete",
    };

    const result = evaluateLightweightProfile({
      snapshot,
      requestId: "req-1",
      phase: "initial",
      evaluatedAt: timestamp,
    });

    expect(result.result).toBe("ineligible");
    const fileCriterion = result.criteria.find(
      (c) => c.criterion === "changed_file_count",
    );
    expect(fileCriterion?.status).toBe("failed");
  });

  it("counts renames and deletions toward the changed-file threshold", () => {
    const snapshot = makeValidSnapshot();
    snapshot.changedPaths = {
      count: 1,
      paths: ["a.ts"],
      renames: 1,
      deletions: 1,
      untrackedCount: 0,
      rangeStatus: "complete",
    };

    const result = evaluateLightweightProfile({
      snapshot,
      requestId: "req-1",
      phase: "initial",
      evaluatedAt: timestamp,
    });

    expect(result.result).toBe("ineligible");
    const fileCriterion = result.criteria.find(
      (c) => c.criterion === "changed_file_count",
    );
    expect(fileCriterion?.status).toBe("failed");
    expect(fileCriterion?.reason).toContain("3");
  });

  it("is ineligible when untracked paths are present", () => {
    const snapshot = makeValidSnapshot();
    snapshot.changedPaths.untrackedCount = 1;

    const result = evaluateLightweightProfile({
      snapshot,
      requestId: "req-1",
      phase: "initial",
      evaluatedAt: timestamp,
    });

    expect(result.result).toBe("ineligible");
    const fileCriterion = result.criteria.find(
      (c) => c.criterion === "changed_file_count",
    );
    expect(fileCriterion?.status).toBe("failed");
    expect(fileCriterion?.reason).toContain("Untracked");
  });

  it("is ineligible when changed-path evidence range is incomplete", () => {
    const snapshot = makeValidSnapshot();
    snapshot.changedPaths.rangeStatus = "incomplete_diff";

    const result = evaluateLightweightProfile({
      snapshot,
      requestId: "req-1",
      phase: "initial",
      evaluatedAt: timestamp,
    });

    expect(result.result).toBe("ineligible");
    const fileCriterion = result.criteria.find(
      (c) => c.criterion === "changed_file_count",
    );
    expect(fileCriterion?.status).toBe("failed");
    expect(fileCriterion?.reason).toContain("incomplete_diff");
  });

  it("is ineligible when a spec delta is present", () => {
    const snapshot = makeValidSnapshot();
    snapshot.specDelta = { hasDelta: true, capabilities: ["advance-workflow"] };

    const result = evaluateLightweightProfile({
      snapshot,
      requestId: "req-1",
      phase: "initial",
      evaluatedAt: timestamp,
    });

    expect(result.result).toBe("ineligible");
    const specCriterion = result.criteria.find(
      (c) => c.criterion === "spec_delta",
    );
    expect(specCriterion?.status).toBe("failed");
  });

  it("is ineligible when a dependency manifest/lockfile changed", () => {
    const snapshot = makeValidSnapshot();
    snapshot.dependencyChange = {
      hasDependencyChange: true,
      manifests: ["plugin/pnpm-lock.yaml"],
    };

    const result = evaluateLightweightProfile({
      snapshot,
      requestId: "req-1",
      phase: "initial",
      evaluatedAt: timestamp,
    });

    expect(result.result).toBe("ineligible");
    const depCriterion = result.criteria.find(
      (c) => c.criterion === "dependency_change",
    );
    expect(depCriterion?.status).toBe("failed");
  });

  it.each([
    ["unknown"],
    ["public_impact"],
    ["graph_failure"],
    ["policy_absent"],
  ] as const)(
    "is ineligible when API compatibility public surface is %s",
    (publicSurface) => {
      const snapshot = makeValidSnapshot();
      snapshot.apiCompatibility = { publicSurface };

      const result = evaluateLightweightProfile({
        snapshot,
        requestId: "req-1",
        phase: "initial",
        evaluatedAt: timestamp,
      });

      expect(result.result).toBe("ineligible");
      const apiCriterion = result.criteria.find(
        (c) => c.criterion === "api_compatibility",
      );
      expect(apiCriterion?.status).toBe(
        publicSurface === "unknown" ? "unknown" : "failed",
      );
    },
  );

  it("is ineligible when scope spans more than one repo", () => {
    const snapshot = makeValidSnapshot();
    snapshot.repoScope = { currentProjectOnly: false, scopeRepos: 2 };

    const result = evaluateLightweightProfile({
      snapshot,
      requestId: "req-1",
      phase: "initial",
      evaluatedAt: timestamp,
    });

    expect(result.result).toBe("ineligible");
    const scopeCriterion = result.criteria.find(
      (c) => c.criterion === "repository_scope",
    );
    expect(scopeCriterion?.status).toBe("failed");
  });

  it("downgrades when a previously qualified profile fails revalidation", () => {
    const snapshot = makeValidSnapshot();
    snapshot.taskCount = { total: 2, implementation: 2 };

    const result = evaluateLightweightProfile({
      snapshot,
      requestId: "req-1",
      phase: "execution_boundary",
      evaluatedAt: timestamp,
      previousResult: "qualified",
    });

    expect(result.result).toBe("downgraded");
    expect(result.downgradeReason).toContain("execution_boundary");
  });

  it("does not downgrade when there is no prior qualification", () => {
    const snapshot = makeValidSnapshot();
    snapshot.taskCount = { total: 2, implementation: 2 };

    const result = evaluateLightweightProfile({
      snapshot,
      requestId: "req-1",
      phase: "initial",
      evaluatedAt: timestamp,
    });

    expect(result.result).toBe("ineligible");
    expect(result.downgradeReason).toBeUndefined();
  });

  it("treats malformed evidence as unknown and never qualifies", () => {
    const malformed = {
      ...makeValidSnapshot(),
      taskCount: undefined,
    } as unknown as LightweightProfileEvidenceSnapshot;

    const result = evaluateLightweightProfile({
      snapshot: malformed,
      requestId: "req-1",
      phase: "initial",
      evaluatedAt: timestamp,
    });

    expect(result.result).toBe("ineligible");
    const taskCriterion = result.criteria.find(
      (c) => c.criterion === "implementation_task_count",
    );
    expect(taskCriterion?.status).toBe("unknown");
  });

  it("produces a schema-valid evaluation", () => {
    const result = evaluateLightweightProfile({
      snapshot: makeValidSnapshot(),
      requestId: "req-1",
      phase: "acceptance_boundary",
      evaluatedAt: timestamp,
    });

    expect(() =>
      LightweightProfileEvaluationSchema.parse(result),
    ).not.toThrow();
  });

  it("produces a schema-valid evidence snapshot helper", () => {
    expect(() =>
      LightweightProfileEvidenceSnapshotSchema.parse(makeValidSnapshot()),
    ).not.toThrow();
  });
});
