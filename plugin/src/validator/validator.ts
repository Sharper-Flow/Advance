/**
 * Validation Orchestrator
 *
 * Main entry point for "specs as laws" validation.
 * Combines completeness and conflict checks into a single validation result.
 */

import type { Change, Spec } from "../types";
import type {
  ValidationResult,
  ValidationContext,
  ExistingSpec,
} from "./types";
import { runCompletenessChecks } from "./completeness";
import { runConflictChecks } from "./conflicts";

// =============================================================================
// Validator Options
// =============================================================================

export interface ValidatorOptions {
  /** Existing specs to validate against */
  specs: Spec[];
  /** Skip specific check types (for testing) */
  skipChecks?: ("completeness" | "conflicts")[];
}

// =============================================================================
// Context Building
// =============================================================================

/**
 * Build validation context from existing specs.
 * Extracts requirement IDs, references, and spec metadata for validation.
 */
export function buildValidationContext(specs: Spec[]): ValidationContext {
  const existingSpecs = new Map<string, ExistingSpec>();
  const existingRequirementIds = new Set<string>();
  const requirementReferences = new Map<string, string[]>();

  for (const spec of specs) {
    // Build spec summary
    existingSpecs.set(spec.name, {
      name: spec.name,
      requirements: spec.requirements.map((r) => ({
        id: r.id,
        title: r.title,
        priority: r.priority,
      })),
    });

    // Index requirement IDs
    for (const req of spec.requirements) {
      existingRequirementIds.add(req.id);

      // Extract references from body text (simple pattern: rq-xxxx)
      const refs = extractReferences(req.body);
      if (refs.length > 0) {
        requirementReferences.set(req.id, refs);
      }
    }
  }

  return {
    existingSpecs,
    existingRequirementIds,
    requirementReferences,
  };
}

/**
 * Extract requirement ID references from text.
 * Matches patterns like "rq-abc123" in the body.
 */
function extractReferences(text: string): string[] {
  const pattern = /rq-[a-zA-Z0-9]+/g;
  const matches = text.match(pattern);
  return matches ? [...new Set(matches)] : [];
}

// =============================================================================
// Main Validation
// =============================================================================

/**
 * Validate a change against existing specs.
 *
 * @param change - The change to validate
 * @param options - Validation options including specs
 * @returns Validation result with errors, warnings, and metadata
 */
export async function validateChange(
  change: Change,
  options: ValidatorOptions,
): Promise<ValidationResult> {
  const { specs, skipChecks = [] } = options;
  const context = buildValidationContext(specs);

  const errors: ValidationResult["errors"] = [];
  const warnings: ValidationResult["warnings"] = [];
  const checksPerformed: string[] = [];

  // Run completeness checks
  if (!skipChecks.includes("completeness")) {
    checksPerformed.push("completeness");
    const completenessIssues = runCompletenessChecks(change);

    for (const issue of completenessIssues) {
      if (issue.severity === "error") {
        errors.push(issue);
      } else {
        warnings.push(issue);
      }
    }
  }

  // Run conflict checks
  if (!skipChecks.includes("conflicts")) {
    checksPerformed.push("conflicts");
    const conflictIssues = runConflictChecks(change, context);

    for (const issue of conflictIssues) {
      if (issue.severity === "error") {
        errors.push(issue);
      } else {
        warnings.push(issue);
      }
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    checkedAt: new Date().toISOString(),
    checksPerformed,
  };
}

// =============================================================================
// Re-export for convenience
// =============================================================================

export { ValidationCodes } from "./types";
export type { ValidationResult, ValidationContext } from "./types";
