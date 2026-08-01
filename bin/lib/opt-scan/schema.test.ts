import { describe, expect, test } from "bun:test";

import {
  OPTIMIZATION_CANDIDATE_FAMILIES,
  OPTIMIZATION_CONFIDENCES,
  OPTIMIZATION_COVERAGE_STATES,
  OPTIMIZATION_DETECTION_METHODS,
  OPTIMIZATION_EVIDENCE_ROLES,
  OPTIMIZATION_SIGNAL_CLASSES,
  validateExpectedCostShape,
  validateMeasuredEvidence,
  validateOptimizationCandidate,
  validateOptimizationCoverage,
  validateOptimizationEvidence,
  type ExpectedCostShape,
  type MeasuredEvidence,
  type OptimizationCandidate,
  type OptimizationCoverage,
  type OptimizationEvidence,
} from "./schema";

describe("opt-scan schema", () => {
  test("exports canonical literal unions", () => {
    expect(OPTIMIZATION_SIGNAL_CLASSES).toEqual(["static", "measured"]);
    expect(OPTIMIZATION_CANDIDATE_FAMILIES).toEqual([
      "repeated_boundary_work",
      "avoidable_collection_work",
      "worker_startup_pressure",
      "cache_opportunity",
    ]);
    expect(OPTIMIZATION_CONFIDENCES).toEqual(["high", "medium", "low"]);
    expect(OPTIMIZATION_EVIDENCE_ROLES).toEqual([
      "trigger",
      "scope",
      "measurement",
      "rejected_scope",
      "invalidation",
      "ownership",
    ]);
    expect(OPTIMIZATION_DETECTION_METHODS).toEqual([
      "ast",
      "regex",
      "heuristic",
      "profile",
      "benchmark",
    ]);
    expect(OPTIMIZATION_COVERAGE_STATES).toEqual([
      "run",
      "skipped",
      "degraded",
      "failed",
      "timed_out",
      "unavailable",
      "externally_covered",
    ]);
  });

  test("validateOptimizationEvidence accepts required and optional fields", () => {
    const evidence: OptimizationEvidence = {
      role: "trigger",
      file: "src/index.ts",
      line: 42,
      column: 5,
      matchedSignal: "forEach",
      snippet: "items.forEach(...)",
    };
    expect(validateOptimizationEvidence(evidence).ok).toBe(true);
  });

  test("validateOptimizationEvidence rejects invalid roles and source locations", () => {
    expect(validateOptimizationEvidence({ role: "bogus", file: "a", line: 1 }).ok).toBe(false);
    expect(validateOptimizationEvidence({ role: "trigger", file: "", line: 1 }).ok).toBe(false);
    expect(validateOptimizationEvidence({ role: "trigger", file: "a", line: "x" }).ok).toBe(false);
    expect(validateOptimizationEvidence({ role: "trigger", file: "a", line: 0 }).ok).toBe(false);
    expect(validateOptimizationEvidence({ role: "trigger", file: "a", line: 1.5 }).ok).toBe(false);
    expect(validateOptimizationEvidence({ role: "trigger", file: "a", line: 1, column: 0 }).ok).toBe(false);
  });

  test("validateExpectedCostShape enforces family and pattern", () => {
    const shape: ExpectedCostShape = {
      family: "repeated_boundary_work",
      pattern: "boundary",
      description: "Repeated async calls inside a hot loop.",
    };
    expect(validateExpectedCostShape(shape).ok).toBe(true);
    expect(validateExpectedCostShape({ ...shape, family: "unknown" }).ok).toBe(false);
    expect(validateExpectedCostShape({ ...shape, pattern: "unknown" }).ok).toBe(false);
  });

  test("validateMeasuredEvidence requires numeric baseline and observed", () => {
    const measured: MeasuredEvidence = {
      provenance: "benchmark",
      baseline: 120,
      observed: 45,
      unit: "ms",
      fixture: "large-dataset.json",
      input: "n=10000",
    };
    expect(validateMeasuredEvidence(measured).ok).toBe(true);
    expect(validateMeasuredEvidence({ ...measured, baseline: NaN }).ok).toBe(false);
    expect(validateMeasuredEvidence({ ...measured, provenance: "guess" }).ok).toBe(false);
  });

  test("validateOptimizationCandidate accepts a valid static candidate", () => {
    const candidate: OptimizationCandidate = {
      id: "OPT-001",
      detector_id: "repeated_boundary_work",
      category: "optimization-candidate",
      signal_class: "static",
      severity: "minor",
      confidence: "medium",
      detection_method: "ast",
      description: "Loop dispatches a network request on each iteration.",
      evidence: [
        { role: "trigger", file: "src/work.ts", line: 10, matchedSignal: "forEach" },
      ],
      expected_cost_shape: {
        family: "repeated_boundary_work",
        pattern: "boundary",
        description: "Repeated boundary calls.",
      },
      false_positive_caveat: "May be intentional batched processing.",
      verification_needed: "Confirm with a profile that the loop is hot.",
    };
    const result = validateOptimizationCandidate(candidate);
    expect(result.ok).toBe(true);
    expect(result.value?.signal_class).toBe("static");
  });

  test("validateOptimizationCandidate rejects a candidate without source evidence", () => {
    const candidate: OptimizationCandidate = {
      id: "OPT-NO-EVIDENCE",
      detector_id: "repeated_boundary_work",
      category: "optimization-candidate",
      signal_class: "static",
      severity: "minor",
      confidence: "medium",
      detection_method: "regex",
      description: "Potential repeated boundary work.",
      evidence: [],
      expected_cost_shape: {
        family: "repeated_boundary_work",
        pattern: "boundary",
        description: "Repeated boundary calls.",
      },
      false_positive_caveat: "May be intentional.",
      verification_needed: "Profile before changing.",
    };

    const result = validateOptimizationCandidate(candidate);
    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      "candidate.evidence must contain at least one source record",
    );
  });

  test("validateOptimizationCandidate rejects static candidate with measured evidence", () => {
    const candidate: OptimizationCandidate = {
      id: "OPT-002",
      detector_id: "avoidable_collection_work",
      category: "optimization-candidate",
      signal_class: "static",
      severity: "minor",
      confidence: "high",
      detection_method: "regex",
      description: "Array allocation inside a hot loop.",
      evidence: [
        { role: "trigger", file: "src/loop.ts", line: 3, matchedSignal: "new Array" },
      ],
      expected_cost_shape: {
        family: "avoidable_collection_work",
        pattern: "collection",
        description: "Avoidable allocations.",
      },
      false_positive_caveat: "May be bounded.",
      verification_needed: "Profile before changing.",
      measured: {
        provenance: "benchmark",
        baseline: 100,
        observed: 50,
        unit: "ms",
      },
    };
    const result = validateOptimizationCandidate(candidate);
    expect(result.ok).toBe(false);
    expect(result.issues.join("\n")).toContain("static candidate cannot include measured evidence");
  });

  test("validateOptimizationCandidate rejects static candidate with measured claim language", () => {
    const candidate: OptimizationCandidate = {
      id: "OPT-003",
      detector_id: "repeated_boundary_work",
      category: "optimization-candidate",
      signal_class: "static",
      severity: "minor",
      confidence: "low",
      detection_method: "heuristic",
      description: "This will deliver a 20% latency reduction.",
      evidence: [
        { role: "trigger", file: "src/a.ts", line: 1 },
      ],
      expected_cost_shape: {
        family: "repeated_boundary_work",
        pattern: "latency",
        description: "Latency.",
      },
      false_positive_caveat: "Caveat.",
      verification_needed: "Verify.",
    };
    const result = validateOptimizationCandidate(candidate);
    expect(result.ok).toBe(false);
    expect(result.issues.join("\n")).toContain("measured runtime impact");
  });

  test("validateOptimizationCandidate accepts a valid measured candidate", () => {
    const candidate: OptimizationCandidate = {
      id: "OPT-004",
      detector_id: "worker_startup_pressure",
      category: "optimization-candidate",
      signal_class: "measured",
      severity: "major",
      confidence: "high",
      detection_method: "profile",
      description: "Worker startup spends 80% of time parsing a large config file.",
      evidence: [
        { role: "measurement", file: "profiles/startup.json", line: null },
      ],
      expected_cost_shape: {
        family: "worker_startup_pressure",
        pattern: "startup",
        description: "Startup overhead.",
      },
      false_positive_caveat: "Profile collected under synthetic load.",
      verification_needed: "Reproduce with production-like input.",
      measured: {
        provenance: "profile",
        baseline: 1200,
        observed: 950,
        unit: "ms",
      },
    };
    const result = validateOptimizationCandidate(candidate);
    expect(result.ok).toBe(true);
  });

  test("validateOptimizationCandidate rejects measured candidate missing measured evidence", () => {
    const candidate: OptimizationCandidate = {
      id: "OPT-005",
      detector_id: "cache_opportunity",
      category: "optimization-candidate",
      signal_class: "measured",
      severity: "major",
      confidence: "high",
      detection_method: "benchmark",
      description: "Cacheable computation.",
      evidence: [
        { role: "trigger", file: "src/calc.ts", line: 5 },
      ],
      expected_cost_shape: {
        family: "cache_opportunity",
        pattern: "cache_miss",
        description: "Repeated computation.",
      },
      false_positive_caveat: "Invalidation may be complex.",
      verification_needed: "Benchmark with realistic invalidation pattern.",
    };
    const result = validateOptimizationCandidate(candidate);
    expect(result.ok).toBe(false);
    expect(result.issues.join("\n")).toContain("measured candidate must include measured evidence");
  });

  test("OptimizationCoverage type accepts the documented shape", () => {
    const coverage: OptimizationCoverage = {
      id: "repeated_boundary_work",
      label: "Repeated boundary work",
      state: "skipped",
      reason: "Detector implementation pending.",
      important: true,
    };
    expect(coverage.id).toBe("repeated_boundary_work");
  });

  test("validateOptimizationCoverage accepts documented states and rejects malformed entries", () => {
    const coverage = {
      id: "repeated_boundary_work",
      label: "Repeated boundary work",
      state: "degraded",
      reason: "scan file limit reached",
      important: true,
    };

    expect(validateOptimizationCoverage(coverage).ok).toBe(true);
    expect(validateOptimizationCoverage({ ...coverage, state: "unknown" }).ok).toBe(false);
    expect(validateOptimizationCoverage({ ...coverage, reason: "" }).ok).toBe(false);
    expect(validateOptimizationCoverage({ ...coverage, important: "true" }).ok).toBe(false);
  });
});
