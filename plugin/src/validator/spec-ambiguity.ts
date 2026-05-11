/**
 * Spec Ambiguity Validator
 *
 * Pure-function ambiguity detection for committed spec laws (`.adv/specs/*.md`).
 * Runs the canonical B/F/S/Q/E taxonomy against raw spec markdown strings.
 *
 * Implements: rq-ambiguityScan01, rq-ambiguityScan02, rq-ambiguityScan03
 *
 * Architecture:
 * - Pure functions — no I/O, no filesystem access
 * - Reuses existing ValidationIssue type with 4-level severity in details.ambiguity_severity
 * - All check IDs defined in SpecAmbiguityCodes for human/tool contract alignment
 * - Each finding includes taxonomy_category mapping to the ambiguity taxonomy
 *
 * Used by `/adv-audit` Phase 3 synthesis (inline, not sub-agent).
 * Sibling to clarify-readiness.ts (which targets Change objects, not spec files).
 */

import type { ValidationIssue } from "./types";

// =============================================================================
// Check Codes
// =============================================================================

export const SpecAmbiguityCodes = {
  SPEC_BOUNDARY_AMBIGUITY: "SPEC_BOUNDARY_AMBIGUITY",
  SPEC_FUNCTIONAL_AMBIGUITY: "SPEC_FUNCTIONAL_AMBIGUITY",
  SPEC_COMPLETION_SIGNAL: "SPEC_COMPLETION_SIGNAL",
  SPEC_QUALITY_ATTRIBUTE: "SPEC_QUALITY_ATTRIBUTE",
  SPEC_ERROR_HANDLING: "SPEC_ERROR_HANDLING",
} as const;

type SpecAmbiguityCode =
  (typeof SpecAmbiguityCodes)[keyof typeof SpecAmbiguityCodes];

// =============================================================================
// Severity for spec-law ambiguity (4-level, stored in details)
// =============================================================================

export type AmbiguitySeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

// =============================================================================
// Result Type
// =============================================================================

export interface SpecAmbiguityResult {
  passed: boolean;
  findings: ValidationIssue[];
  coverage: Record<string, "C" | "P" | "M" | "N/A">;
  checksPerformed: string[];
  checkedAt: string;
}

export interface SpecAmbiguityFinding extends ValidationIssue {
  id: string;
  details: {
    id: string;
    ambiguity_severity: AmbiguitySeverity;
    taxonomy_category: string;
    spec: string;
    specText: string;
    issue: string;
    fix: string;
  };
}

// =============================================================================
// Patterns — reuse from clarify-readiness where applicable
// =============================================================================

/**
 * Subjective/vague terms indicating unmeasurable requirements.
 * Operational quality terms live in UNQUANTIFIED_QUALITY_PATTERN so the same
 * requirement is not double-reported as both S and Q for one word.
 */
const SUBJECTIVE_PATTERN =
  /\b(slow|simple|easy|nice|intuitive|user[- ]friendly|obvious|trivial|elegant|clean|powerful|flexible|seamless|smooth|appropriate|correct|properly|safely|reasonable)\b/i;

/**
 * Terms that indicate a quality attribute claim without quantification.
 */
const UNQUANTIFIED_QUALITY_PATTERN =
  /\b(fast|robust|scalable|reliable|secure|performant|efficient|responsive|available|durable|consistent|bounded|idempotent|deterministic|atomic|isolated|thread[- ]?safe)\b/i;

/**
 * Numeric or comparative terms that indicate quantification IS present.
 */
const QUANTIFIED_PATTERN =
  /\b\d+[\s]*(?:ms|s|sec|seconds?|milliseconds?|req|requests?|ops?|connections?|users?|entries?|bytes?|kb|mb|gb|tb|%|percent|per\s+second|per\s+minute|concurrent|parallel)\b|≤|>=|≥|⩽|at\s+least|at\s+most|no\s+(?:more|less)\s+than|up\s+to\b/i;

/**
 * Terms indicating behavior with failure potential.
 */
const FAILURE_POTENTIAL_PATTERN =
  /\b(fail|error|crash|timeout|retry|abort|reject|invalid|missing|null|undefined|empty|exceed|overflow|deadlock|race\s+condition|starvation|corrupt|loss|unavailable|degraded|fallback)\b/i;

/**
 * Terms indicating failure handling IS addressed.
 */
const FAILURE_HANDLED_PATTERN =
  /\b(error\s+handl|on\s+fail|fallback|retry|circuit[- ]?breaker|graceful\s+degrad|compensat|rollback|recover|catch|exception|resilien)\b/i;

/**
 * Vague scope/boundary language.
 */
const VAGUE_BOUNDARY_PATTERN =
  /\b(handle|manage|deal\s+with|support|accommodate|cover|address)\s+(all|any|every|various|multiple|different|edge\s+cases?)\b/i;

/**
 * Given/When/Then scenario structure indicators.
 * Requires the keywords to appear at the start of a line with specific
 * formatting (capital letter, colon or markdown list prefix) to distinguish
 * regular prose usage of "when"/"then" from scenarios.
 */
const SCENARIO_PATTERN = /^[ \t]*(?:[-*]|\d+\.)?[ \t]*(?:Given|When|Then)[ :]/m;

/**
 * Requirement ID pattern — matches rq-xxx format.
 */
const REQUIREMENT_ID_PATTERN = /^(\s*-\s*)?(id|rq-\w+):/m;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract requirement blocks from spec markdown.
 * Returns array of { id, title, body } objects parsed from spec structure.
 */
function extractRequirements(markdown: string): Array<{
  id: string;
  title: string;
  body: string;
}> {
  const requirements: Array<{ id: string; title: string; body: string }> = [];

  // Match requirement blocks: lines starting with ### or containing rq- IDs
  // Typical spec format: "### rq-xxxTitle" or "- id: rq-xxx"
  const reqPattern =
    /(?:^###\s*(rq-\w+)\s*[:\-]\s*(.+)$)|(?:^\*?\*?id\*?\*?:\s*(rq-\w+)\s*$)/gm;

  let match;
  while ((match = reqPattern.exec(markdown)) !== null) {
    const id = match[1] || match[3];
    const title = match[2] || "";
    // Extract body: everything until next ### or --- separator or next requirement
    const bodyStart = match.index + match[0].length;
    const nextReq =
      markdown.slice(bodyStart).search(/(?:^###\s*(?:rq-))|(?:^---)/m) + bodyStart;
    const body =
      nextReq > bodyStart
        ? markdown.slice(bodyStart, nextReq).trim()
        : markdown.slice(bodyStart).trim();
    requirements.push({ id, title, body });
  }

  return requirements;
}

/**
 * Create a spec ambiguity finding.
 */
function makeFinding(params: {
  code: SpecAmbiguityCode;
  severity: AmbiguitySeverity;
  category: string;
  capability: string;
  requirementId: string;
  specText: string;
  issue: string;
  fix: string;
}): SpecAmbiguityFinding {
  const id = `${params.category}-${params.capability}-${params.requirementId}-${params.code}`;

  return {
    id,
    code: params.code,
    severity: "warning", // stays "warning" per KD2 — actual severity in details
    message: `Spec ambiguity [${params.category}] in ${params.capability}/${params.requirementId}: ${params.issue}`,
    path: `specs.${params.capability}.${params.requirementId}`,
    details: {
      id,
      ambiguity_severity: params.severity,
      taxonomy_category: params.category,
      spec: `${params.capability}/${params.requirementId}`,
      specText: params.specText,
      issue: params.issue,
      fix: params.fix,
    },
  };
}

// =============================================================================
// Check: Boundary Ambiguity (B)
// =============================================================================

/**
 * Detect requirements with vague scope boundaries.
 * Catches: "handle all X", "manage various Y", "support any Z" without explicit in/out.
 */
export function checkBoundaryAmbiguity(
  specMarkdown: string,
  capabilityName: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const requirements = extractRequirements(specMarkdown);

  for (const req of requirements) {
    const match = VAGUE_BOUNDARY_PATTERN.exec(req.body);
    if (!match) continue;

    // Check if explicit scope boundary follows
    const hasExplicitScope =
      /\b(only|exclusively|specifically|limited\s+to|in\s+scope|out\s+of\s+scope|excluding|not\s+including|does\s+not)\b/i.test(
        req.body,
      );

    if (!hasExplicitScope) {
      // Extract verbatim line for evidence
      const lineMatch = req.body
        .split("\n")
        .find((l) => VAGUE_BOUNDARY_PATTERN.test(l));
      const specText =
        lineMatch?.trim() || match[0];

      issues.push(
        makeFinding({
          code: SpecAmbiguityCodes.SPEC_BOUNDARY_AMBIGUITY,
          severity: "HIGH",
          category: "B",
          capability: capabilityName,
          requirementId: req.id,
          specText,
          issue: `Requirement uses vague boundary language "${match[0]}" without explicit scope exclusions.`,
          fix: `Add explicit in-scope and out-of-scope boundaries for what "${match[0]}" covers and excludes.`,
        }),
      );
    }
  }

  return issues;
}

// =============================================================================
// Check: Functional Ambiguity (F)
// =============================================================================

/**
 * Detect requirements with vague behavioral language or missing scenario structure.
 */
export function checkFunctionalAmbiguity(
  specMarkdown: string,
  capabilityName: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const requirements = extractRequirements(specMarkdown);

  for (const req of requirements) {
    // Check for vague behavioral terms
    const vagueBehavior =
      /\b(appropriate|correct|proper(ly)?|reasonable|expected|suitable|adequate|acceptable)\b/i.exec(
        req.body,
      );

    if (vagueBehavior) {
      const lineMatch = req.body
        .split("\n")
        .find((l) => /\b(appropriate|correct|proper(ly)?|reasonable|expected|suitable|adequate|acceptable)\b/i.test(l));
      issues.push(
        makeFinding({
          code: SpecAmbiguityCodes.SPEC_FUNCTIONAL_AMBIGUITY,
          severity: "HIGH",
          category: "F",
          capability: capabilityName,
          requirementId: req.id,
          specText: lineMatch?.trim() || vagueBehavior[0],
          issue: `Requirement uses vague behavioral term "${vagueBehavior[0]}" without defining what constitutes appropriate behavior.`,
          fix: `Replace "${vagueBehavior[0]}" with specific, testable behavioral criteria or Given/When/Then scenarios.`,
        }),
      );
    }

    // Check for missing scenario structure in requirements with behavioral content
    const hasBehavioralContent =
      /\b(must|shall|should|may|when|if|after|before|on\s+|trigger|perform|execute|run|send|receive|return|emit)\b/i.test(
        req.body,
      );
    const hasScenarios = SCENARIO_PATTERN.test(req.body);

    if (hasBehavioralContent && !hasScenarios) {
      // Only flag as MEDIUM — not all requirements need scenarios
      const firstBehavioralLine = req.body
        .split("\n")
        .find((l) =>
          /\b(must|shall|should)\b/i.test(l),
        );

      if (firstBehavioralLine) {
        issues.push(
          makeFinding({
            code: SpecAmbiguityCodes.SPEC_FUNCTIONAL_AMBIGUITY,
            severity: "MEDIUM",
            category: "F",
            capability: capabilityName,
            requirementId: req.id,
            specText: firstBehavioralLine.trim(),
            issue: "Requirement has normative language (MUST/SHALL/SHOULD) but no Given/When/Then scenarios.",
            fix: "Add at least one scenario with Given/When/Then clauses to make the requirement testable.",
          }),
        );
      }
    }
  }

  return issues;
}

// =============================================================================
// Check: Completion Signals (S)
// =============================================================================

/**
 * Detect subjective or unmeasurable success criteria in requirements.
 */
export function checkCompletionSignals(
  specMarkdown: string,
  capabilityName: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const requirements = extractRequirements(specMarkdown);

  for (const req of requirements) {
    const match = SUBJECTIVE_PATTERN.exec(req.body);
    if (!match) continue;

    const lineMatch = req.body
      .split("\n")
      .find((l) => l.toLowerCase().includes(match[0].toLowerCase()));

    // Check whether the line containing the subjective term has quantification.
    // Quantification can appear before or after the term on the same line.
    const hasQuantification = QUANTIFIED_PATTERN.test(lineMatch ?? req.body);

    if (!hasQuantification) {
      issues.push(
        makeFinding({
          code: SpecAmbiguityCodes.SPEC_COMPLETION_SIGNAL,
          severity: "HIGH",
          category: "S",
          capability: capabilityName,
          requirementId: req.id,
          specText: lineMatch?.trim() || match[0],
          issue: `Requirement uses subjective term "${match[0]}" without measurable criteria for completion.`,
          fix: `Replace "${match[0]}" with a specific, measurable target (e.g., latency threshold, success rate, count).`,
        }),
      );
    }
  }

  return issues;
}

// =============================================================================
// Check: Quality Attributes (Q)
// =============================================================================

/**
 * Detect unquantified quality attribute claims.
 */
export function checkQualityAttributes(
  specMarkdown: string,
  capabilityName: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const requirements = extractRequirements(specMarkdown);

  for (const req of requirements) {
    const match = UNQUANTIFIED_QUALITY_PATTERN.exec(req.body);
    if (!match) continue;

    // Check if quantification is present anywhere in the requirement body
    const hasQuantification = QUANTIFIED_PATTERN.test(req.body);

    if (!hasQuantification) {
      const lineMatch = req.body
        .split("\n")
        .find((l) => l.toLowerCase().includes(match[0].toLowerCase()));

      issues.push(
        makeFinding({
          code: SpecAmbiguityCodes.SPEC_QUALITY_ATTRIBUTE,
          severity: "MEDIUM",
          category: "Q",
          capability: capabilityName,
          requirementId: req.id,
          specText: lineMatch?.trim() || match[0],
          issue: `Requirement claims quality attribute "${match[0]}" without quantitative threshold.`,
          fix: `Add a measurable threshold for "${match[0]}" (e.g., "≤ 200ms latency", "supports 10k concurrent connections").`,
        }),
      );
    }
  }

  return issues;
}

// =============================================================================
// Check: Error Handling (E)
// =============================================================================

/**
 * Detect requirements describing behavior with failure potential but no failure handling.
 */
export function checkErrorHandling(
  specMarkdown: string,
  capabilityName: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const requirements = extractRequirements(specMarkdown);

  for (const req of requirements) {
    // Does the requirement describe behavior that could fail?
    if (!FAILURE_POTENTIAL_PATTERN.test(req.body)) continue;

    // Is failure handling addressed?
    if (FAILURE_HANDLED_PATTERN.test(req.body)) continue;

    // Does the requirement already have failure scenarios?
    const hasFailureScenario = /\b(fail|error|timeout|invalid|reject)\b/i.test(
      req.body,
    ) && SCENARIO_PATTERN.test(req.body);

    if (hasFailureScenario) continue;

    const lineMatch = req.body
      .split("\n")
      .find((l) => FAILURE_POTENTIAL_PATTERN.test(l));

    issues.push(
      makeFinding({
        code: SpecAmbiguityCodes.SPEC_ERROR_HANDLING,
        severity: "HIGH",
        category: "E",
        capability: capabilityName,
        requirementId: req.id,
        specText: lineMatch?.trim() || req.body.split("\n")[0]?.trim() || "",
        issue: "Requirement describes behavior with failure potential but no error handling or failure scenarios.",
        fix: "Add failure scenarios (Given/When/Then) describing what happens when the described behavior fails.",
      }),
    );
  }

  return issues;
}

// =============================================================================
// Type Guard
// =============================================================================

/**
 * Type guard for ambiguity findings.
 * Returns true when the ValidationIssue has a spec-ambiguity severity in details.
 *
 * The dual-severity contract: `issue.severity` is always "warning" (the shared
 * ValidationSeverity enum only allows "error" | "warning"). The actual 4-level
 * ambiguity severity (CRITICAL/HIGH/MEDIUM/LOW) lives in `details.ambiguity_severity`.
 * Consumers needing the real severity should read `details.ambiguity_severity` when
 * this guard returns true.
 */
export function isAmbiguityFinding(issue: ValidationIssue): boolean {
  return (
    issue.details != null &&
    typeof issue.details === "object" &&
    "ambiguity_severity" in issue.details
  );
}

// =============================================================================
// Orchestrator
// =============================================================================

/**
 * Run all spec-ambiguity checks against a spec file's markdown content.
 *
 * @param specMarkdown - Raw markdown content of the spec file
 * @param capabilityName - Capability name (e.g., "advance-workflow")
 * @returns SpecAmbiguityResult with findings and coverage map
 */
export function runSpecAmbiguityChecks(
  specMarkdown: string,
  capabilityName: string,
): SpecAmbiguityResult {
  const findings: ValidationIssue[] = [
    ...checkBoundaryAmbiguity(specMarkdown, capabilityName),
    ...checkFunctionalAmbiguity(specMarkdown, capabilityName),
    ...checkCompletionSignals(specMarkdown, capabilityName),
    ...checkQualityAttributes(specMarkdown, capabilityName),
    ...checkErrorHandling(specMarkdown, capabilityName),
  ];

  // Build coverage map
  const categories = ["B", "F", "S", "Q", "E"] as const;
  const coverage: Record<string, "C" | "P" | "M" | "N/A"> = {};
  for (const cat of categories) {
    const catFindings = findings.filter(
      (f) => f.details?.taxonomy_category === cat,
    );
    if (catFindings.length === 0) {
      coverage[cat] = "C"; // Clear — no ambiguity detected
    } else if (
      catFindings.some(
        (f) =>
          (f.details?.ambiguity_severity as string) === "CRITICAL" ||
          (f.details?.ambiguity_severity as string) === "HIGH",
      )
    ) {
      coverage[cat] = "M"; // Missing — significant ambiguity
    } else {
      coverage[cat] = "P"; // Partial — minor ambiguity
    }
  }

  return {
    passed: findings.length === 0,
    findings,
    coverage,
    checksPerformed: [
      "checkBoundaryAmbiguity",
      "checkFunctionalAmbiguity",
      "checkCompletionSignals",
      "checkQualityAttributes",
      "checkErrorHandling",
    ],
    checkedAt: new Date().toISOString(),
  };
}
