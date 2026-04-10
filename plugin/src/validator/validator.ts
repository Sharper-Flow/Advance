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
  ActiveChange,
} from "./types";
import { runCompletenessChecks } from "./completeness";
import { runConflictChecks } from "./conflicts";

// =============================================================================
// Validator Options
// =============================================================================

export interface ValidatorOptions {
  /** Existing specs to validate against */
  specs: Spec[];
  /** Other active changes (for conflict detection) */
  activeChanges?: ActiveChange[];
  /** Skip specific check types (for testing) */
  skipChecks?: ("completeness" | "conflicts" | "proposal-drift")[];
  /** Whether running inside a git worktree (triggers spec-sync warning, Leak #7) */
  isWorktree?: boolean;
  /** Proposal markdown text for drift detection */
  proposalText?: string;
}

// =============================================================================
// Context Building
// =============================================================================

/**
 * Build validation context from existing specs.
 * Extracts requirement IDs, references, and spec metadata for validation.
 */
export function buildValidationContext(
  specs: Spec[],
  activeChanges?: ActiveChange[],
): ValidationContext {
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
    activeChanges,
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
  const {
    specs,
    activeChanges,
    skipChecks = [],
    isWorktree,
    proposalText,
  } = options;
  const context = buildValidationContext(specs, activeChanges);

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

  // Worktree spec-sync divergence warning
  // Specs are branch-local while changes are external shared state.
  // When running in a worktree, the active specs may differ from the default branch.
  if (isWorktree) {
    checksPerformed.push("worktree-spec-sync");
    warnings.push({
      code: "WORKTREE_SPEC_DIVERGENCE",
      severity: "warning",
      message:
        "Running in a git worktree. Specs (.adv/specs/) are branch-local and may diverge from the default branch. " +
        "Changes and wisdom are shared via external storage. Validate against the default branch before archiving.",
      path: "worktree",
    });
  }

  // Proposal-task drift detection
  // Extract keywords from proposal section headers and compare against task titles.
  // No embeddings — simple keyword matching.
  if (proposalText && !skipChecks.includes("proposal-drift")) {
    checksPerformed.push("proposal-drift");
    const driftWarnings = runProposalDriftCheck(change, proposalText);
    warnings.push(...driftWarnings);
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    checkedAt: new Date().toISOString(),
    checksPerformed,
  };
}

/**
 * Detect drift between proposal section headers and task titles.
 * Extracts keywords from proposal "## Section Name" headers and checks if any
 * task title contains at least one keyword. Sections with no task matches are flagged.
 */
function runProposalDriftCheck(
  change: Change,
  proposalText: string,
): Array<{
  code: string;
  severity: "warning";
  message: string;
  path?: string;
}> {
  const warnings: Array<{
    code: string;
    severity: "warning";
    message: string;
    path?: string;
  }> = [];

  // Extract section headers (## Title) from proposal
  const sectionMatches = proposalText.match(/^#{2,3}\s+(.+)$/gm) ?? [];
  const taskTitles = change.tasks
    .filter((t) => t.status !== "cancelled")
    .map((t) => t.title.toLowerCase());

  // Skip generic headers that are boilerplate
  const skipHeaders = new Set([
    "summary",
    "motivation",
    "objective",
    "overview",
    "background",
    "acceptance criteria",
    "success criteria",
    "constraints",
    "risks",
    "implementation",
    "next steps",
    "references",
    "why",
    "what",
    "how",
    "prior decisions",
    "rejected approaches",
    "open questions",
  ]);

  for (const match of sectionMatches) {
    const headerText = match.replace(/^#{2,3}\s+/, "").trim();
    const headerLower = headerText.toLowerCase();

    // Skip boilerplate section names
    if (skipHeaders.has(headerLower)) continue;

    // Extract keywords: split on spaces/punctuation, filter short words
    const keywords = headerLower
      .split(/[\s\-_/,]+/)
      .filter((w) => w.length >= 4)
      .filter(
        (w) =>
          ![
            "with",
            "from",
            "into",
            "that",
            "this",
            "when",
            "then",
            "also",
          ].includes(w),
      );

    if (keywords.length === 0) continue;

    // Check if any task title mentions any keyword from this section header
    const hasMatch = taskTitles.some((title) =>
      keywords.some((kw) => title.includes(kw)),
    );

    if (!hasMatch) {
      warnings.push({
        code: "PROPOSAL_TASK_DRIFT",
        severity: "warning",
        message: `Proposal section "${headerText}" has no matching task. Consider adding a task or verifying coverage.`,
        path: `proposal.sections.${headerText}`,
      });
    }
  }

  return warnings;
}

// =============================================================================
// Re-export for convenience
// =============================================================================

export { ValidationCodes } from "./types";
export type { ValidationResult, ValidationContext } from "./types";
