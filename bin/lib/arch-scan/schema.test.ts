import { describe, expect, test } from "bun:test";

import {
  CAPABILITY_CONFIDENCES,
  CAPABILITY_DETECTION_METHODS,
  CAPABILITY_EVIDENCE_ROLES,
  CAPABILITY_SEVERITIES,
  validateCapabilityEvidence,
  validateCapabilityFinding,
  type AbsenceProof,
  type CapabilityCoverage,
  type CapabilityEvidence,
  type CapabilityFinding,
} from "./schema";

describe("arch-scan capability schema", () => {
  test("exports canonical literal unions", () => {
    expect(CAPABILITY_EVIDENCE_ROLES).toEqual([
      "trigger",
      "counterpart",
      "exception",
      "searched_scope",
    ]);
    expect(CAPABILITY_SEVERITIES).toEqual(["blocker", "major", "minor", "nit"]);
    expect(CAPABILITY_CONFIDENCES).toEqual(["high", "medium", "low"]);
    expect(CAPABILITY_DETECTION_METHODS).toEqual(["ast", "tool", "regex", "heuristic"]);
  });

  test("CapabilityEvidence role type accepts each documented role", () => {
    const roles: CapabilityEvidence["role"][] = [
      "trigger",
      "counterpart",
      "exception",
      "searched_scope",
    ];
    expect(roles).toHaveLength(4);
  });

  test("validateCapabilityEvidence accepts each role with required fields", () => {
    for (const role of CAPABILITY_EVIDENCE_ROLES) {
      const evidence: CapabilityEvidence = {
        role,
        file: "src/a.ts",
        line: 12,
        column: 4,
        matchedSignal: "APPLICATIONINSIGHTS_CONNECTION_STRING",
      };
      const result = validateCapabilityEvidence(evidence);
      expect(result.ok).toBe(true);
      expect(result.value?.role).toBe(role);
    }
  });

  test("validateCapabilityEvidence accepts null line and omitted optionals", () => {
    const evidence: CapabilityEvidence = {
      role: "trigger",
      file: "infra/main.bicep",
      line: null,
    };
    const result = validateCapabilityEvidence(evidence);
    expect(result.ok).toBe(true);
    expect(result.value?.column).toBeUndefined();
    expect(result.value?.matchedSignal).toBeUndefined();
  });

  test("validateCapabilityEvidence rejects malformed input", () => {
    expect(validateCapabilityEvidence(null).ok).toBe(false);
    expect(
      validateCapabilityEvidence({ role: "unknown", file: "a", line: 1 }).ok,
    ).toBe(false);
    expect(
      validateCapabilityEvidence({ role: "trigger", file: "", line: 1 }).ok,
    ).toBe(false);
    expect(
      validateCapabilityEvidence({ role: "trigger", file: "a", line: "x" }).ok,
    ).toBe(false);
    expect(
      validateCapabilityEvidence({ role: "trigger", file: "a", line: 1, column: "x" }).ok,
    ).toBe(false);
    expect(
      validateCapabilityEvidence({ role: "trigger", file: "a", line: 1, matchedSignal: 5 })
        .ok,
    ).toBe(false);
  });

  test("validateCapabilityFinding accepts a fully-populated finding", () => {
    const absence: AbsenceProof = {
      searchedRoots: ["src", "infra"],
      includedGlobs: ["**/*.ts"],
      excludedGlobs: ["node_modules/**"],
      parseFailures: [],
    };
    const finding: CapabilityFinding = {
      id: "CAP-001",
      relationship_id: "env-var-injection-vs-sdk-import",
      category: "capability-consistency",
      severity: "major",
      confidence: "high",
      detection_method: "regex",
      description: "APPLICATIONINSIGHTS_CONNECTION_STRING set via bicep without SDK import.",
      evidence: [
        {
          role: "trigger",
          file: "infra/main.bicep",
          line: 42,
          matchedSignal: "APPLICATIONINSIGHTS_CONNECTION_STRING",
        },
        { role: "searched_scope", file: "src/", line: null },
      ],
      absence_proof: absence,
      recommendation: "Import @azure/monitor-opentelemetry in src/telemetry.ts.",
      source: "arch-scan",
    };
    const result = validateCapabilityFinding(finding);
    expect(result.ok).toBe(true);
    expect(result.value?.id).toBe("CAP-001");
    expect(result.value?.absence_proof?.searchedRoots).toEqual(["src", "infra"]);
  });

  test("validateCapabilityFinding accepts finding without optional fields", () => {
    const finding: CapabilityFinding = {
      id: "CAP-002",
      relationship_id: "config-vs-dependency-presence",
      category: "capability-consistency",
      severity: "major",
      confidence: "high",
      detection_method: "regex",
      description: "knip config block present; knip not in dependencies.",
      evidence: [{ role: "trigger", file: "package.json", line: 12 }],
      recommendation: "Add knip to devDependencies.",
    };
    const result = validateCapabilityFinding(finding);
    expect(result.ok).toBe(true);
    expect(result.value?.absence_proof).toBeUndefined();
    expect(result.value?.source).toBeUndefined();
  });

  test("validateCapabilityFinding rejects malformed input", () => {
    expect(validateCapabilityFinding(null).ok).toBe(false);

    const badCategory = {
      id: "x",
      relationship_id: "y",
      category: "different",
      severity: "major",
      confidence: "high",
      detection_method: "regex",
      description: "d",
      evidence: [],
      recommendation: "r",
    } as unknown;
    expect(validateCapabilityFinding(badCategory).ok).toBe(false);

    const badEnum = {
      id: "x",
      relationship_id: "y",
      category: "capability-consistency",
      severity: "bogus",
      confidence: "high",
      detection_method: "regex",
      description: "d",
      evidence: [],
      recommendation: "r",
    } as unknown;
    expect(validateCapabilityFinding(badEnum).ok).toBe(false);

    const badEvidence = {
      id: "x",
      relationship_id: "y",
      category: "capability-consistency",
      severity: "major",
      confidence: "high",
      detection_method: "regex",
      description: "d",
      evidence: [{ role: "bogus", file: "a", line: 1 }],
      recommendation: "r",
    } as unknown;
    const evidenceResult = validateCapabilityFinding(badEvidence);
    expect(evidenceResult.ok).toBe(false);
    expect(evidenceResult.issues.join("\n")).toContain("evidence[0].role");
  });

  test("CapabilityCoverage type accepts the documented shape", () => {
    const coverage: CapabilityCoverage = {
      appliedRelationships: ["env-var-injection-vs-sdk-import"],
      skippedRelationships: [
        {
          id: "manifest-reference-vs-runtime-registration",
          reason: "no html/tsx/svelte files in scope",
        },
      ],
      degradedRelationships: [],
    };
    expect(coverage.appliedRelationships).toHaveLength(1);
    expect(coverage.skippedRelationships[0].id).toBe(
      "manifest-reference-vs-runtime-registration",
    );
  });
});
