/**
 * Tests for the opt-scan optimizer candidate intake consumer.
 *
 * Focused on:
 *   - valid candidates are accepted with evidence preserved
 *   - a recommendation and verification route are rendered
 *   - cache-opportunity candidates are rejected without ownership/invalidation
 *   - static candidates with measured/runtime-gain claims are rejected
 *   - malformed input is rejected with path-qualified issues
 */

import { describe, expect, test } from "bun:test";

import {
  processCandidateIntake,
  renderIntakeReport,
  type IntakeResult,
} from "./intake";
import type { OptimizationCandidate } from "./schema";

function baseCandidate(
  overrides: Partial<OptimizationCandidate> = {},
): OptimizationCandidate {
  return {
    id: "test:1",
    detector_id: "repeated_boundary_work",
    category: "optimization-candidate",
    signal_class: "static",
    severity: "minor",
    confidence: "medium",
    detection_method: "regex",
    description: "Repeated boundary calls in a loop.",
    false_positive_caveat: "May be batched or intentionally sequential.",
    verification_needed: "Profile the loop under representative load.",
    evidence: [
      {
        role: "trigger",
        file: "src/api.ts",
        line: 10,
        matchedSignal: "fetch",
        snippet: "fetch('/api')",
      },
      {
        role: "scope",
        file: "src/api.ts",
        line: 8,
        matchedSignal: "for (const id of ids)",
        snippet: "for (const id of ids) {",
      },
    ],
    expected_cost_shape: {
      family: "repeated_boundary_work",
      pattern: "boundary",
      description: "Repeated boundary calls may dominate latency.",
    },
    recommendation:
      "Review src/api.ts:10 and consider batching or parallelizing after profiling.",
    source: "opt-scan",
    ...overrides,
  };
}

describe("processCandidateIntake", () => {
  test("accepts a valid static candidate and preserves evidence", () => {
    const candidate = baseCandidate();
    const result = processCandidateIntake(candidate);

    expect(result.status).toBe("accepted");
    expect(result.candidate_id).toBe(candidate.id);
    expect(result.detector_id).toBe(candidate.detector_id);
    expect(result.evidence).toEqual(candidate.evidence);
    expect(result.evidence.map((e) => e.role)).toEqual(["trigger", "scope"]);
    const trigger = result.evidence.find((e) => e.role === "trigger");
    expect(trigger).toBeDefined();
    expect(trigger!.file).toBe("src/api.ts");
    expect(trigger!.line).toBe(10);
    expect(trigger!.matchedSignal).toBe("fetch");
    expect(result.rejection_reasons).toEqual([]);
    expect(result.recommendation).toBe(candidate.recommendation);
    expect(result.verification_route).toBe(candidate.verification_needed);
  });

  test("accepts a cache candidate with ownership and invalidation evidence", () => {
    const candidate = baseCandidate({
      id: "test:cache:1",
      detector_id: "cache_opportunity",
      description: "Repeated pure computation may be cacheable.",
      false_positive_caveat:
        "Caching requires clear identity, ownership, and invalidation.",
      verification_needed:
        "Confirm repeated execution and define cache key, owner, and invalidation policy.",
      recommendation: "Introduce a bounded cache with explicit invalidation.",
      expected_cost_shape: {
        family: "cache_opportunity",
        pattern: "cache_miss",
        description: "Repeated pure computation may benefit from caching.",
      },
      evidence: [
        {
          role: "trigger",
          file: "src/hash.ts",
          line: 12,
          matchedSignal: "hash",
          snippet: "hash(payload)",
        },
        {
          role: "scope",
          file: "src/hash.ts",
          line: 12,
          matchedSignal: "JSON.stringify(args)",
          snippet: "const key = JSON.stringify(args);",
        },
        {
          role: "ownership",
          file: "src/hash.ts",
          line: 5,
          matchedSignal: "const cache = new Map()",
          snippet: "const cache = new Map<string, string>();",
        },
        {
          role: "invalidation",
          file: "src/hash.ts",
          line: 20,
          matchedSignal: "cache.delete",
          snippet: "cache.delete(key);",
        },
      ],
    });

    const result = processCandidateIntake(candidate);

    expect(result.status).toBe("accepted");
    expect(result.evidence).toEqual(candidate.evidence);
    expect(result.evidence.map((e) => e.role)).toEqual([
      "trigger",
      "scope",
      "ownership",
      "invalidation",
    ]);
    const ownership = result.evidence.find((e) => e.role === "ownership");
    expect(ownership).toBeDefined();
    expect(ownership!.file).toBe("src/hash.ts");
    expect(ownership!.line).toBe(5);
  });

  test("rejects a cache candidate missing ownership evidence", () => {
    const candidate = baseCandidate({
      id: "test:cache:bad",
      detector_id: "cache_opportunity",
      expected_cost_shape: {
        family: "cache_opportunity",
        pattern: "cache_miss",
        description: "Repeated pure computation may benefit from caching.",
      },
      evidence: [
        {
          role: "trigger",
          file: "src/hash.ts",
          line: 12,
          matchedSignal: "hash",
        },
        {
          role: "invalidation",
          file: "src/hash.ts",
          line: 20,
          matchedSignal: "cache.delete",
        },
      ],
    });

    const result = processCandidateIntake(candidate);

    expect(result.status).toBe("rejected");
    expect(result.rejection_reasons).toContain(
      "cache opportunity rejected: missing ownership evidence",
    );
    expect(result.evidence).toEqual(candidate.evidence);
    expect(result.evidence.map((e) => e.role)).toEqual([
      "trigger",
      "invalidation",
    ]);
    const trigger = result.evidence.find((e) => e.role === "trigger");
    expect(trigger).toBeDefined();
    expect(trigger!.file).toBe("src/hash.ts");
    expect(trigger!.line).toBe(12);
  });

  test("rejects a cache candidate missing invalidation evidence", () => {
    const candidate = baseCandidate({
      id: "test:cache:bad",
      detector_id: "cache_opportunity",
      expected_cost_shape: {
        family: "cache_opportunity",
        pattern: "cache_miss",
        description: "Repeated pure computation may benefit from caching.",
      },
      evidence: [
        {
          role: "trigger",
          file: "src/hash.ts",
          line: 12,
          matchedSignal: "hash",
        },
        {
          role: "ownership",
          file: "src/hash.ts",
          line: 5,
          matchedSignal: "const cache = new Map()",
        },
      ],
    });

    const result = processCandidateIntake(candidate);

    expect(result.status).toBe("rejected");
    expect(result.rejection_reasons).toContain(
      "cache opportunity rejected: missing invalidation evidence",
    );
    expect(result.evidence).toEqual(candidate.evidence);
    expect(result.evidence.map((e) => e.role)).toEqual([
      "trigger",
      "ownership",
    ]);
    const ownership = result.evidence.find((e) => e.role === "ownership");
    expect(ownership).toBeDefined();
    expect(ownership!.file).toBe("src/hash.ts");
    expect(ownership!.line).toBe(5);
  });

  test("rejects a static candidate carrying measured evidence", () => {
    const candidate = baseCandidate({
      measured: {
        provenance: "profile",
        baseline: 100,
        observed: 50,
        unit: "ms",
      },
    });

    const result = processCandidateIntake(candidate);

    expect(result.status).toBe("rejected");
    expect(result.rejection_reasons.some((r) =>
      r.includes("static candidate cannot include measured evidence"),
    )).toBe(true);
  });

  test("rejects a static candidate asserting a runtime gain", () => {
    const candidate = baseCandidate({
      description: "Expected 2x speedup by batching boundary calls.",
    });

    const result = processCandidateIntake(candidate);

    expect(result.status).toBe("rejected");
    expect(
      result.rejection_reasons.some((r) =>
        r.includes("static candidate cannot assert measured runtime impact"),
      ),
    ).toBe(true);
  });

  test("rejects a candidate missing trigger evidence", () => {
    const candidate = baseCandidate({
      evidence: [
        {
          role: "scope",
          file: "src/api.ts",
          line: 8,
          matchedSignal: "for (const id of ids)",
        },
      ],
    });

    const result = processCandidateIntake(candidate);

    expect(result.status).toBe("rejected");
    expect(result.rejection_reasons).toContain(
      "candidate evidence must include a trigger role",
    );
    expect(result.evidence).toEqual(candidate.evidence);
    expect(result.evidence[0].role).toBe("scope");
    expect(result.evidence[0].file).toBe("src/api.ts");
    expect(result.evidence[0].line).toBe(8);
  });

  test("rejects non-object input with a validation issue", () => {
    const result = processCandidateIntake("not-a-candidate");

    expect(result.status).toBe("rejected");
    expect(result.rejection_reasons.length).toBeGreaterThan(0);
    expect(result.rejection_reasons[0]).toContain("must be an object");
  });

  test("rejects a candidate missing required fields", () => {
    const result = processCandidateIntake({ id: "incomplete" });

    expect(result.status).toBe("rejected");
    expect(result.rejection_reasons.length).toBeGreaterThan(0);
  });
});

describe("renderIntakeReport", () => {
  const accepted: IntakeResult = {
    schema_version: "opt_scan_intake.v1",
    candidate_id: "c1",
    detector_id: "repeated_boundary_work",
    status: "accepted",
    rejection_reasons: [],
    recommendation: "Batch boundary calls.",
    verification_route: "Profile under load.",
    evidence: [
      {
        role: "trigger",
        file: "src/api.ts",
        line: 10,
        matchedSignal: "fetch",
        snippet: "fetch('/api')",
      },
      {
        role: "scope",
        file: "src/api.ts",
        line: 8,
        matchedSignal: "for (const id of ids)",
        snippet: "for (const id of ids) {",
      },
    ],
    safety_note: "Read-only.",
  };

  const rejected: IntakeResult = {
    schema_version: "opt_scan_intake.v1",
    candidate_id: "c2",
    detector_id: "cache_opportunity",
    status: "rejected",
    rejection_reasons: ["cache opportunity rejected: missing ownership evidence"],
    evidence: [
      {
        role: "trigger",
        file: "src/hash.ts",
        line: 12,
        matchedSignal: "hash",
        snippet: "hash(payload)",
      },
    ],
    safety_note: "Read-only.",
  };

  test("text format renders full evidence records for accepted candidates", () => {
    const output = renderIntakeReport(accepted, "text");

    expect(output).toContain("Optimizer Intake");
    expect(output).toContain("Status:    accepted");
    expect(output).toContain("[trigger] src/api.ts:10 — fetch");
    expect(output).toContain("[scope] src/api.ts:8 — for (const id of ids)");
    expect(output).toContain("Recommendation: Batch boundary calls.");
    expect(output).toContain("Verification:   Profile under load.");
  });

  test("text format renders full evidence records for rejected candidates", () => {
    const output = renderIntakeReport(rejected, "text");

    expect(output).toContain("Status:    rejected");
    expect(output).toContain("[trigger] src/hash.ts:12 — hash");
    expect(output).toContain("Rejection reasons:");
    expect(output).toContain(
      "cache opportunity rejected: missing ownership evidence",
    );
  });

  test("json format preserves the full evidence records", () => {
    const output = renderIntakeReport(accepted, "json");
    const parsed = JSON.parse(output);

    expect(parsed.schema_version).toBe("opt_scan_intake.v1");
    expect(parsed.status).toBe("accepted");
    expect(parsed.recommendation).toBe("Batch boundary calls.");
    expect(parsed.evidence).toEqual(accepted.evidence);
  });
});
