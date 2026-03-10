/**
 * Clarify-Readiness Validator
 *
 * Programmatic ambiguity detection that triggers /adv-clarify recommendations
 * without consuming agent context window. Runs against persisted change data
 * (title, proposal text, deltas) and surfaces structured findings.
 *
 * Architecture:
 * - Pure functions — no I/O, no filesystem access beyond Change object + proposal text
 * - Reuses existing ValidationIssue type (severity: "warning" for all clarify findings)
 * - All check IDs defined in ClarifyReadinessCodes for human/tool contract alignment
 * - Each finding includes a questionCategory mapping to adv-clarify Socratic question types
 */

import type { Change } from "../types";
import type { ValidationIssue } from "./types";

// =============================================================================
// Check Codes
// =============================================================================

export const ClarifyReadinessCodes = {
  CLARIFY_SUBJECTIVE_LANGUAGE: "CLARIFY_SUBJECTIVE_LANGUAGE",
  CLARIFY_MISSING_SUCCESS_CRITERIA: "CLARIFY_MISSING_SUCCESS_CRITERIA",
  CLARIFY_MISSING_SCENARIOS: "CLARIFY_MISSING_SCENARIOS",
  CLARIFY_UNCLEAR_SCOPE: "CLARIFY_UNCLEAR_SCOPE",
  CLARIFY_ASSUMPTION_HEAVY: "CLARIFY_ASSUMPTION_HEAVY",
  CLARIFY_MISSING_ERROR_HANDLING: "CLARIFY_MISSING_ERROR_HANDLING",
} as const;

export type ClarifyReadinessCode =
  (typeof ClarifyReadinessCodes)[keyof typeof ClarifyReadinessCodes];

// =============================================================================
// Result Type
// =============================================================================

export interface ClarifyReadinessResult {
  passed: boolean;
  findings: ValidationIssue[];
  checksPerformed: string[];
  checkedAt: string;
}

// =============================================================================
// Patterns
// =============================================================================

/** Subjective/vague terms that indicate unmeasurable requirements */
const SUBJECTIVE_PATTERN =
  /\b(fast|slow|simple|easy|nice|intuitive|user[- ]friendly|natural|obvious|trivial|robust|scalable|elegant|clean|modern|powerful|flexible|seamless|smooth)\b/i;

/** Auth/access/permission terms that need a specified model */
const AUTH_TERMS_PATTERN =
  /\b(auth(?:entication|orization)?|permissions?|access\s+control|rbac|acl|roles?|privileges?|credentials?)\b/i;

/** Specific auth model indicators — if present, the assumption is resolved */
const AUTH_MODEL_SPECIFIED_PATTERN =
  /\b(jwt|oauth|saml|api[- ]?key|bearer|session[- ]?cookie|rs256|hs256|openid|oidc|ldap|sso|mfa|2fa|totp|passkey|webauthn)\b/i;

/** Terms indicating error/failure handling is addressed */
const ERROR_HANDLING_PATTERN =
  /\b(error\s+handl|failure|rollback|retry|fallback|circuit[- ]?breaker|timeout|catch|exception|recover|graceful|degrad|compensat)\b/i;

/** Terms indicating the proposal describes behavior that could fail */
const BEHAVIOR_PATTERN =
  /\b(endpoint|api|process|send|receive|charge|payment|upload|download|connect|request|query|mutation|transaction|migrate|deploy|sync)\b/i;

/** Higher-signal behaviors that imply operational failure modes */
const RISKY_BEHAVIOR_PATTERN =
  /\b(endpoint|process|send|receive|charge|payment|upload|download|connect|request|query|mutation|transaction|migrate|deploy|sync)\b/i;

/** Trivial change indicators that should not trigger failure-mode questions on their own */
const TRIVIAL_CHANGE_PATTERN =
  /\b(readme|docs?|documentation|changelog|comment|typo|config|lint|format|style)\b/i;

/** Placeholder success criteria patterns */
const PLACEHOLDER_CRITERIA_PATTERN =
  /^-\s*\[[\sx]\]\s*(criterion\s+\d+|todo|tbd|placeholder|fill\s+in)/im;

// =============================================================================
// Check: Subjective Language
// =============================================================================

/**
 * Scan change title for subjective/vague terms that indicate unmeasurable requirements.
 * Maps to adv-clarify question type: "clarification" (explore origin of thinking).
 */
export function checkSubjectiveLanguage(change: Change): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const title = change.title ?? "";

  const match = SUBJECTIVE_PATTERN.exec(title);
  if (match) {
    issues.push({
      code: ClarifyReadinessCodes.CLARIFY_SUBJECTIVE_LANGUAGE,
      severity: "warning",
      message: `Change title contains subjective term "${match[0]}": "${title}". What specific, measurable criteria define "${match[0]}"?`,
      path: "title",
      details: {
        matchedTerm: match[0],
        questionCategory: "clarification",
        remediation: `Replace "${match[0]}" with a concrete, measurable target. Run /adv-clarify to define specific acceptance criteria.`,
      },
    });
  }

  return issues;
}

// =============================================================================
// Check: Missing Success Criteria
// =============================================================================

/**
 * Check if proposal has concrete success criteria (not just placeholders).
 * Maps to adv-clarify question type: "evidence" (demand proof of done).
 */
export function checkMissingSuccessCriteria(
  _change: Change,
  proposalText: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Look for a "Success Criteria" section (case-insensitive)
  // Extract content between this header and the next ## header (or end of text)
  const criteriaMatch =
    proposalText.match(
      /##\s*success\s+criteria\s*\n([\s\S]*?)(?=\n##\s|\n---)/i,
    ) ?? proposalText.match(/##\s*success\s+criteria\s*\n([\s\S]*)/i);

  if (!criteriaMatch) {
    issues.push({
      code: ClarifyReadinessCodes.CLARIFY_MISSING_SUCCESS_CRITERIA,
      severity: "warning",
      message:
        "Proposal has no Success Criteria section. How will we know this change is done?",
      path: "proposal.success_criteria",
      details: {
        questionCategory: "evidence",
        remediation:
          "Add a ## Success Criteria section with measurable outcomes. Run /adv-clarify to define concrete done criteria.",
      },
    });
    return issues;
  }

  // Check if criteria are all placeholder
  const criteriaBody = criteriaMatch[1].trim();
  const lines = criteriaBody
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "));

  const allPlaceholder =
    lines.length > 0 &&
    lines.every((line) => PLACEHOLDER_CRITERIA_PATTERN.test(line));

  if (lines.length === 0 || allPlaceholder) {
    issues.push({
      code: ClarifyReadinessCodes.CLARIFY_MISSING_SUCCESS_CRITERIA,
      severity: "warning",
      message:
        "Success criteria are placeholder or empty. What measurable outcomes define done?",
      path: "proposal.success_criteria",
      details: {
        questionCategory: "evidence",
        remediation:
          "Replace placeholder criteria with specific, testable outcomes. Run /adv-clarify to define concrete done criteria.",
      },
    });
  }

  return issues;
}

// =============================================================================
// Check: Missing Scenarios
// =============================================================================

/**
 * Check if deltas add requirements without scenarios (untestable requirements).
 * Maps to adv-clarify question type: "implications" (examine downstream effects).
 */
export function checkMissingScenarios(change: Change): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [capability, deltas] of Object.entries(change.deltas)) {
    for (const delta of deltas) {
      if (delta.operation !== "add") continue;

      const req = delta.requirement;
      if (!req.scenarios || req.scenarios.length === 0) {
        issues.push({
          code: ClarifyReadinessCodes.CLARIFY_MISSING_SCENARIOS,
          severity: "warning",
          message: `Requirement "${req.id}" has no scenarios. What are the Given/When/Then behaviors?`,
          path: `deltas.${capability}.${delta.id}.requirement.scenarios`,
          details: {
            requirementId: req.id,
            requirementTitle: req.title,
            questionCategory: "implications",
            remediation:
              "Add at least one scenario with given/when/then clauses. Run /adv-clarify to discover edge cases and expected behaviors.",
          },
        });
      }
    }
  }

  return issues;
}

// =============================================================================
// Check: Unclear Scope
// =============================================================================

/**
 * Check if proposal has a concrete scope section (not placeholder or missing).
 * Maps to adv-clarify question type: "clarification" (what's in/out of scope).
 */
export function checkUnclearScope(
  _change: Change,
  proposalText: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Look for a "Scope" section
  // Extract content between this header and the next ## header (or end of text)
  const scopeMatch =
    proposalText.match(
      /##\s*(?:scope|what\s+changes)\s*\n([\s\S]*?)(?=\n##\s|\n---)/i,
    ) ?? proposalText.match(/##\s*(?:scope|what\s+changes)\s*\n([\s\S]*)/i);

  if (!scopeMatch) {
    issues.push({
      code: ClarifyReadinessCodes.CLARIFY_UNCLEAR_SCOPE,
      severity: "warning",
      message:
        "Proposal has no Scope section. What files and modules will be affected?",
      path: "proposal.scope",
      details: {
        questionCategory: "clarification",
        remediation:
          "Add a ## Scope section listing affected files/modules. Run /adv-clarify to define boundaries.",
      },
    });
    return issues;
  }

  // Check if scope is empty or placeholder
  const scopeBody = scopeMatch[1].trim();
  const isPlaceholder =
    scopeBody.length === 0 ||
    /^\s*-?\s*\(unknown/i.test(scopeBody);

  if (isPlaceholder) {
    issues.push({
      code: ClarifyReadinessCodes.CLARIFY_UNCLEAR_SCOPE,
      severity: "warning",
      message:
        "Scope section is empty or placeholder. What specific files/modules will change?",
      path: "proposal.scope",
      details: {
        questionCategory: "clarification",
        remediation:
          "Replace placeholder scope with specific file paths or module names. Run /adv-clarify to define boundaries.",
      },
    });
  }

  return issues;
}

// =============================================================================
// Check: Assumption-Heavy (Auth/Access)
// =============================================================================

/**
 * Check if proposal references auth/access/permissions without specifying the model.
 * Maps to adv-clarify question type: "assumptions" (probe underlying beliefs).
 */
export function checkAssumptionHeavy(
  _change: Change,
  proposalText: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Does the proposal mention auth/permissions?
  if (!AUTH_TERMS_PATTERN.test(proposalText)) {
    return issues;
  }

  // Is a specific auth model mentioned?
  if (AUTH_MODEL_SPECIFIED_PATTERN.test(proposalText)) {
    return issues;
  }

  issues.push({
    code: ClarifyReadinessCodes.CLARIFY_ASSUMPTION_HEAVY,
    severity: "warning",
    message:
      "Proposal references authentication/authorization without specifying the model. What auth mechanism will be used?",
    path: "proposal.assumptions",
    details: {
      questionCategory: "assumptions",
      remediation:
        "Specify the auth model (JWT, OAuth, API keys, session cookies, etc.). Run /adv-clarify to resolve auth assumptions.",
    },
  });

  return issues;
}

// =============================================================================
// Check: Missing Error Handling
// =============================================================================

/**
 * Check if proposal describes behavior that could fail but doesn't mention error handling.
 * Maps to adv-clarify question type: "implications" (what happens when things go wrong).
 */
export function checkMissingErrorHandling(
  _change: Change,
  proposalText: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Does the proposal describe behavior that could fail?
  if (!BEHAVIOR_PATTERN.test(proposalText)) {
    return issues;
  }

  // Skip docs/config-only proposals unless they also introduce behavior with
  // operational failure modes.
  if (
    TRIVIAL_CHANGE_PATTERN.test(proposalText) &&
    !RISKY_BEHAVIOR_PATTERN.test(proposalText)
  ) {
    return issues;
  }

  // Is error handling mentioned?
  if (ERROR_HANDLING_PATTERN.test(proposalText)) {
    return issues;
  }

  issues.push({
    code: ClarifyReadinessCodes.CLARIFY_MISSING_ERROR_HANDLING,
    severity: "warning",
    message:
      "Proposal describes behavior that could fail but doesn't mention error handling or rollback. What happens when things go wrong?",
    path: "proposal.error_handling",
    details: {
      questionCategory: "implications",
      remediation:
        "Add error handling expectations: retry strategy, fallback behavior, rollback plan. Run /adv-clarify to define failure modes.",
    },
  });

  return issues;
}

// =============================================================================
// runClarifyReadinessChecks
// =============================================================================

/**
 * Run all clarify-readiness checks against a change and its proposal text.
 *
 * Returns a ClarifyReadinessResult with:
 * - findings: all ambiguity issues found (all are warnings, never errors)
 * - passed: true only when no findings exist
 *
 * @param change - The Change object from ADV state
 * @param proposalText - The raw proposal.md content
 */
export function runClarifyReadinessChecks(
  change: Change,
  proposalText: string,
): ClarifyReadinessResult {
  const findings: ValidationIssue[] = [
    ...checkSubjectiveLanguage(change),
    ...checkMissingSuccessCriteria(change, proposalText),
    ...checkMissingScenarios(change),
    ...checkUnclearScope(change, proposalText),
    ...checkAssumptionHeavy(change, proposalText),
    ...checkMissingErrorHandling(change, proposalText),
  ];

  return {
    passed: findings.length === 0,
    findings,
    checksPerformed: [
      "checkSubjectiveLanguage",
      "checkMissingSuccessCriteria",
      "checkMissingScenarios",
      "checkUnclearScope",
      "checkAssumptionHeavy",
      "checkMissingErrorHandling",
    ],
    checkedAt: new Date().toISOString(),
  };
}
