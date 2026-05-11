/**
 * Spec Ambiguity Validator Tests
 *
 * Tests for programmatic ambiguity detection in committed spec laws.
 * Validates the B/F/S/Q/E taxonomy checks against representative spec markdown.
 */

import { describe, it, expect } from "vitest";
import {
  checkBoundaryAmbiguity,
  checkFunctionalAmbiguity,
  checkCompletionSignals,
  checkQualityAttributes,
  checkErrorHandling,
  runSpecAmbiguityChecks,
  isAmbiguityFinding,
  SpecAmbiguityCodes,
  type AmbiguitySeverity,
} from "./spec-ambiguity";
import type { ValidationIssue } from "./types";

// =============================================================================
// Test Fixtures
// =============================================================================

const SPEC_WITH_BOUNDARY_AMBIGUITY = `
### rq-testBoundary1: Handle All Request Types

The system must handle all incoming request types and manage various
response formats without restriction.

priority: must

### rq-testBoundary2: Explicit Scope Handler

The system must process standard HTTP requests only, excluding WebSocket
upgrades and gRPC calls.

priority: must
`;

const SPEC_WITH_FUNCTIONAL_AMBIGUITY = `
### rq-testFunc1: Appropriate Response

The system must return an appropriate response for each valid request.

priority: must

### rq-testFunc2: Specific Response Code

The system must return HTTP 200 with a JSON body for valid requests.

priority: must

Given: A valid request is received
When: The system processes the request
Then: HTTP 200 is returned with content-type application/json
`;

const SPEC_WITH_SUBJECTIVE_TERMS = `
### rq-testSubj1: Fast Response

The system must provide fast response times for all API calls.

priority: must

### rq-testSubj2: Quantified Response

The system must respond within 200ms for 99th percentile API calls.

priority: must
`;

const SPEC_WITH_QUALITY_ATTRIBUTES = `
### rq-testQual1: Scalable System

The system must be scalable and handle concurrent connections efficiently.

priority: must

### rq-testQual2: Quantified Scale

The system must support 10,000 concurrent connections with ≤ 200ms latency.

priority: must
`;

const SPEC_WITH_FAILURE_POTENTIAL = `
### rq-testErr1: Process Requests

The system must process incoming requests and handle timeout scenarios
when upstream services are unavailable.

priority: must

### rq-testErr2: Process With Retry

The system must process incoming requests with retry on failure up to 3 times
before returning an error response.

priority: must

Given: A request fails
When: Retry count is below 3
Then: The system retries the request
`;

const CLEAN_SPEC = `
### rq-clean1: Specific Behavior

The system must return HTTP 201 within 500ms for valid POST requests to /api/items.

priority: must

Given: A valid POST request to /api/items
When: The system creates the item
Then: HTTP 201 is returned within 500ms with the created item

### rq-clean2: Error Handling

The system must return HTTP 400 for invalid POST requests with error details.

priority: must

Given: An invalid POST request to /api/items
When: Validation fails
Then: HTTP 400 is returned with error message
`;

// =============================================================================
// Tests: Boundary Ambiguity (B)
// =============================================================================

describe("checkBoundaryAmbiguity", () => {
  it("detects vague boundary language without scope exclusions", () => {
    const findings = checkBoundaryAmbiguity(
      SPEC_WITH_BOUNDARY_AMBIGUITY,
      "test-capability",
    );

    expect(findings.length).toBeGreaterThanOrEqual(1);
    const boundaryFinding = findings.find(
      (f) => f.code === SpecAmbiguityCodes.SPEC_BOUNDARY_AMBIGUITY,
    );
    expect(boundaryFinding).toBeDefined();
    expect(boundaryFinding!.details?.ambiguity_severity).toBe("HIGH");
    expect(boundaryFinding!.details?.taxonomy_category).toBe("B");
    expect(boundaryFinding!.details?.spec).toBe(
      "test-capability/rq-testBoundary1",
    );
    expect(boundaryFinding!.severity).toBe("warning");
  });

  it("does not flag requirements with explicit scope boundaries", () => {
    const findings = checkBoundaryAmbiguity(
      SPEC_WITH_BOUNDARY_AMBIGUITY,
      "test-capability",
    );

    // rq-testBoundary2 has "only, excluding" — should not be flagged
    const explicitScopeFinding = findings.find(
      (f) =>
        (f.details?.spec as string)?.includes("rq-testBoundary2"),
    );
    expect(explicitScopeFinding).toBeUndefined();
  });

  it("returns empty for clean specs", () => {
    const findings = checkBoundaryAmbiguity(CLEAN_SPEC, "test-capability");
    expect(findings).toEqual([]);
  });
});

// =============================================================================
// Tests: Functional Ambiguity (F)
// =============================================================================

describe("checkFunctionalAmbiguity", () => {
  it("detects vague behavioral terms", () => {
    const findings = checkFunctionalAmbiguity(
      SPEC_WITH_FUNCTIONAL_AMBIGUITY,
      "test-capability",
    );

    const funcFinding = findings.find(
      (f) =>
        f.code === SpecAmbiguityCodes.SPEC_FUNCTIONAL_AMBIGUITY &&
        (f.details?.specText as string)?.includes("appropriate"),
    );
    expect(funcFinding).toBeDefined();
    expect(funcFinding!.details?.ambiguity_severity).toBe("HIGH");
    expect(funcFinding!.details?.taxonomy_category).toBe("F");
  });

  it("detects missing scenario structure", () => {
    const findings = checkFunctionalAmbiguity(
      SPEC_WITH_FUNCTIONAL_AMBIGUITY,
      "test-capability",
    );

    // rq-testFunc1 has MUST but no scenarios
    const scenarioFinding = findings.find(
      (f) =>
        f.code === SpecAmbiguityCodes.SPEC_FUNCTIONAL_AMBIGUITY &&
        (f.details?.spec as string)?.includes("rq-testFunc1") &&
        (f.details?.ambiguity_severity as AmbiguitySeverity) === "MEDIUM",
    );
    expect(scenarioFinding).toBeDefined();
  });

  it("does not flag requirements with Given/When/Then scenarios", () => {
    const findings = checkFunctionalAmbiguity(
      SPEC_WITH_FUNCTIONAL_AMBIGUITY,
      "test-capability",
    );

    // rq-testFunc2 has Given/When/Then — no functional ambiguity
    const scenarioOkFinding = findings.find(
      (f) =>
        (f.details?.spec as string)?.includes("rq-testFunc2") &&
        f.code === SpecAmbiguityCodes.SPEC_FUNCTIONAL_AMBIGUITY,
    );
    expect(scenarioOkFinding).toBeUndefined();
  });

  it("returns empty for clean specs", () => {
    const findings = checkFunctionalAmbiguity(CLEAN_SPEC, "test-capability");
    expect(findings).toEqual([]);
  });
});

// =============================================================================
// Tests: Completion Signals (S)
// =============================================================================

describe("checkCompletionSignals", () => {
  it("detects subjective terms without measurable criteria", () => {
    const findings = checkCompletionSignals(
      SPEC_WITH_SUBJECTIVE_TERMS,
      "test-capability",
    );

    const subjFinding = findings.find(
      (f) =>
        f.code === SpecAmbiguityCodes.SPEC_COMPLETION_SIGNAL &&
        (f.details?.specText as string)?.includes("fast"),
    );
    expect(subjFinding).toBeDefined();
    expect(subjFinding!.details?.ambiguity_severity).toBe("HIGH");
    expect(subjFinding!.details?.taxonomy_category).toBe("S");
  });

  it("does not flag subjective terms with quantification", () => {
    const findings = checkCompletionSignals(
      SPEC_WITH_SUBJECTIVE_TERMS,
      "test-capability",
    );

    // rq-testSubj2 has "200ms" quantification
    const quantifiedFinding = findings.find(
      (f) =>
        (f.details?.spec as string)?.includes("rq-testSubj2"),
    );
    expect(quantifiedFinding).toBeUndefined();
  });

  it("returns empty for clean specs", () => {
    const findings = checkCompletionSignals(CLEAN_SPEC, "test-capability");
    expect(findings).toEqual([]);
  });
});

// =============================================================================
// Tests: Quality Attributes (Q)
// =============================================================================

describe("checkQualityAttributes", () => {
  it("detects unquantified quality claims", () => {
    const findings = checkQualityAttributes(
      SPEC_WITH_QUALITY_ATTRIBUTES,
      "test-capability",
    );

    const qualFinding = findings.find(
      (f) =>
        f.code === SpecAmbiguityCodes.SPEC_QUALITY_ATTRIBUTE &&
        ((f.details?.specText as string)?.includes("scalable") ||
          (f.details?.specText as string)?.includes("efficiently")),
    );
    expect(qualFinding).toBeDefined();
    expect(qualFinding!.details?.ambiguity_severity).toBe("MEDIUM");
    expect(qualFinding!.details?.taxonomy_category).toBe("Q");
  });

  it("does not flag quantified quality claims", () => {
    const findings = checkQualityAttributes(
      SPEC_WITH_QUALITY_ATTRIBUTES,
      "test-capability",
    );

    // rq-testQual2 has "10,000 concurrent" and "≤ 200ms"
    const quantifiedFinding = findings.find(
      (f) =>
        (f.details?.spec as string)?.includes("rq-testQual2"),
    );
    expect(quantifiedFinding).toBeUndefined();
  });

  it("returns empty for clean specs", () => {
    const findings = checkQualityAttributes(CLEAN_SPEC, "test-capability");
    expect(findings).toEqual([]);
  });
});

// =============================================================================
// Tests: Error Handling (E)
// =============================================================================

describe("checkErrorHandling", () => {
  it("detects behavior with failure potential but no handling", () => {
    const findings = checkErrorHandling(
      SPEC_WITH_FAILURE_POTENTIAL,
      "test-capability",
    );

    const errFinding = findings.find(
      (f) =>
        f.code === SpecAmbiguityCodes.SPEC_ERROR_HANDLING &&
        (f.details?.spec as string)?.includes("rq-testErr1"),
    );
    expect(errFinding).toBeDefined();
    expect(errFinding!.details?.ambiguity_severity).toBe("HIGH");
    expect(errFinding!.details?.taxonomy_category).toBe("E");
  });

  it("does not flag requirements with error handling", () => {
    const findings = checkErrorHandling(
      SPEC_WITH_FAILURE_POTENTIAL,
      "test-capability",
    );

    // rq-testErr2 mentions "retry on failure" and "error response"
    const handledFinding = findings.find(
      (f) =>
        (f.details?.spec as string)?.includes("rq-testErr2"),
    );
    expect(handledFinding).toBeUndefined();
  });

  it("returns empty for clean specs", () => {
    const findings = checkErrorHandling(CLEAN_SPEC, "test-capability");
    expect(findings).toEqual([]);
  });
});

// =============================================================================
// Tests: Type Guard
// =============================================================================

describe("isAmbiguityFinding", () => {
  it("returns true for ambiguity findings with ambiguity_severity in details", () => {
    const finding: ValidationIssue = {
      code: "SPEC_COMPLETION_SIGNAL",
      severity: "warning",
      message: "test",
      details: {
        ambiguity_severity: "HIGH",
        taxonomy_category: "S",
      },
    };
    expect(isAmbiguityFinding(finding)).toBe(true);
  });

  it("returns false for regular validation issues", () => {
    const issue: ValidationIssue = {
      code: "NO_TASKS",
      severity: "error",
      message: "test",
    };
    expect(isAmbiguityFinding(issue)).toBe(false);
  });

  it("returns false for issues with details but no ambiguity_severity", () => {
    const issue: ValidationIssue = {
      code: "MISSING_SCENARIO",
      severity: "warning",
      message: "test",
      details: {
        questionCategory: "evidence",
      },
    };
    expect(isAmbiguityFinding(issue)).toBe(false);
  });

  it("returns false for null details", () => {
    const issue: ValidationIssue = {
      code: "NO_TASKS",
      severity: "warning",
      message: "test",
      details: undefined,
    };
    expect(isAmbiguityFinding(issue)).toBe(false);
  });
});

// =============================================================================
// Tests: Orchestrator
// =============================================================================

describe("runSpecAmbiguityChecks", () => {
  it("runs all 5 checks and returns aggregated result", () => {
    const result = runSpecAmbiguityChecks(
      SPEC_WITH_BOUNDARY_AMBIGUITY,
      "test-capability",
    );

    expect(result.checksPerformed).toEqual([
      "checkBoundaryAmbiguity",
      "checkFunctionalAmbiguity",
      "checkCompletionSignals",
      "checkQualityAttributes",
      "checkErrorHandling",
    ]);
    expect(result.passed).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.coverage).toHaveProperty("B");
    expect(result.coverage).toHaveProperty("F");
    expect(result.coverage).toHaveProperty("S");
    expect(result.coverage).toHaveProperty("Q");
    expect(result.coverage).toHaveProperty("E");
  });

  it("returns all-clear coverage for clean specs", () => {
    const result = runSpecAmbiguityChecks(CLEAN_SPEC, "test-capability");

    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.coverage.B).toBe("C");
    expect(result.coverage.F).toBe("C");
    expect(result.coverage.S).toBe("C");
    expect(result.coverage.Q).toBe("C");
    expect(result.coverage.E).toBe("C");
  });

  it("marks category M when HIGH/CRITICAL findings exist", () => {
    const result = runSpecAmbiguityChecks(
      SPEC_WITH_SUBJECTIVE_TERMS,
      "test-capability",
    );

    // S category should be M (has HIGH finding for "fast")
    expect(result.coverage.S).toBe("M");
  });

  it("marks category P when only MEDIUM/LOW findings exist", () => {
    const result = runSpecAmbiguityChecks(
      SPEC_WITH_QUALITY_ATTRIBUTES,
      "test-capability",
    );

    // Q category should be P (has MEDIUM finding for "scalable")
    expect(result.coverage.Q).toBe("P");
  });
});
