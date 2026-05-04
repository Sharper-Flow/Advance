/**
 * TDD Helpers Domain Module
 *
 * Patterns + classification helpers for TDD enforcement.
 * Imports Task and TddEvidence types from ./tasks.
 */

import type { Task } from "./tasks";
import type { TddEvidence } from "./tasks";

// =============================================================================
// TDD Detection Patterns
// =============================================================================

/**
 * Keywords that indicate a task requires TDD (logic-heavy).
 * Tasks matching these patterns should have TDD evidence.
 */
export const TDD_REQUIRED_PATTERNS = [
  /\bimplement\b/i,
  /\bcreate\b/i,
  /\badd\b/i,
  /\bfix\b/i,
  /\brefactor\b/i,
  /\bhandle\b/i,
  /\bvalidate\b/i,
  /\bparse\b/i,
  /\bcalculate\b/i,
  /\bprocess\b/i,
  /\bgenerate\b/i,
  /\btransform\b/i,
  /\bconvert\b/i,
  /\bfilter\b/i,
  /\bsort\b/i,
  /\bmerge\b/i,
  /\bauth/i,
  /\bapi\b/i,
  /\bendpoint\b/i,
  /\bfunction\b/i,
  /\bmethod\b/i,
  /\bclass\b/i,
  /\bmodule\b/i,
  /\bservice\b/i,
  /\bhandler\b/i,
  /\bcontroller\b/i,
  /\brepository\b/i,
  /\bstore\b/i,
];

/**
 * Keywords that indicate a task is trivial (no TDD required).
 * Tasks matching these patterns can skip TDD.
 */
export const TDD_TRIVIAL_PATTERNS = [
  /\bdoc(s|umentation)?\b/i,
  /\breadme\b/i,
  /\bchangelog\b/i,
  /\bconfig(uration)?\b/i,
  /\bformat(ting)?\b/i,
  /\blint(ing)?\b/i,
  /\btypo\b/i,
  /\bcomment\b/i,
  /\brename\b/i,
  /\bmove\b/i,
  /\bcleanup\b/i,
  /\bclean up\b/i,
  /\bremove unused\b/i,
  /\bupdate version\b/i,
  /\bbump version\b/i,
];

/**
 * Check if a task title indicates logic-heavy work requiring TDD.
 */
export const isLogicTask = (title: string): boolean => {
  // First check if explicitly trivial
  if (TDD_TRIVIAL_PATTERNS.some((p) => p.test(title))) {
    return false;
  }
  // Then check if matches logic patterns
  return TDD_REQUIRED_PATTERNS.some((p) => p.test(title));
};

/**
 * Check if a task title indicates trivial work (TDD optional).
 */
export const isTrivialTask = (title: string): boolean => {
  return TDD_TRIVIAL_PATTERNS.some((p) => p.test(title));
};

/**
 * Check if a task has complete TDD evidence (both red and green phases).
 */
export const hasCompleteTddEvidence = (task: Task): boolean => {
  if (!task.tdd_evidence) return false;

  // If explicitly skipped with reason, that counts as complete
  if (task.tdd_evidence.skipped && task.tdd_evidence.skip_reason) {
    return true;
  }

  // Otherwise need both red and green phases
  const hasRed = !!task.tdd_evidence.red?.recorded_at;
  const hasGreen = !!task.tdd_evidence.green?.recorded_at;

  return hasRed && hasGreen;
};

/**
 * Get TDD compliance status for a task.
 */
export const getTddComplianceStatus = (
  task: Task,
): "compliant" | "missing" | "not_required" => {
  // Trivial tasks don't require TDD
  if (isTrivialTask(task.title)) {
    return "not_required";
  }

  // Explicitly skipped with reason
  if (task.tdd_evidence?.skipped && task.tdd_evidence.skip_reason) {
    return "compliant";
  }

  // Logic tasks require evidence
  if (isLogicTask(task.title)) {
    return hasCompleteTddEvidence(task) ? "compliant" : "missing";
  }

  // Default: not required for non-matching tasks
  return "not_required";
};

/**
 * Strip TDD evidence to minimal proof for archive storage.
 * Keeps exit_code, recorded_at, and test_file (audit value).
 * Removes command and output_snippet (bulk of the bloat).
 * Preserves skipped/skip_reason unchanged.
 */
export const stripTddEvidence = (evidence: TddEvidence): TddEvidence => {
  const result: TddEvidence = {};

  if (evidence.red) {
    result.red = {
      exit_code: evidence.red.exit_code,
      recorded_at: evidence.red.recorded_at,
      ...(evidence.red.test_file ? { test_file: evidence.red.test_file } : {}),
    };
  }

  if (evidence.green) {
    result.green = {
      exit_code: evidence.green.exit_code,
      recorded_at: evidence.green.recorded_at,
      ...(evidence.green.test_file
        ? { test_file: evidence.green.test_file }
        : {}),
    };
  }

  if (evidence.skipped !== undefined) {
    result.skipped = evidence.skipped;
  }
  if (evidence.skip_reason !== undefined) {
    result.skip_reason = evidence.skip_reason;
  }

  return result;
};

/**
 * Truncate output to max length for storage.
 */
export const truncateOutput = (output: string, maxLength = 80): string => {
  if (output.length <= maxLength) return output;
  return output.slice(0, maxLength) + "\n... [truncated]";
};
