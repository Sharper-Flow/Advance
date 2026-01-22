/**
 * Validation Types
 *
 * Types for "specs as laws" validation
 */

import { z } from "zod";

// =============================================================================
// Validation Error/Warning Types
// =============================================================================

export const ValidationSeveritySchema = z.enum(["error", "warning"]);
export type ValidationSeverity = z.infer<typeof ValidationSeveritySchema>;

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  path?: string;
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  passed: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  checkedAt: string;
  checksPerformed: string[];
}

// =============================================================================
// Validation Error Codes
// =============================================================================

export const ValidationCodes = {
  // Completeness checks
  NO_TASKS: "NO_TASKS",
  NO_DELTAS: "NO_DELTAS",
  MISSING_SCENARIO: "MISSING_SCENARIO",
  INCOMPLETE_SCENARIO: "INCOMPLETE_SCENARIO",
  MISSING_PRIORITY: "MISSING_PRIORITY",

  // Conflict detection
  CONTRADICTING_REQUIREMENT: "CONTRADICTING_REQUIREMENT",
  DUPLICATE_REQUIREMENT_ID: "DUPLICATE_REQUIREMENT_ID",
  MODIFYING_MUST_TO_MAY: "MODIFYING_MUST_TO_MAY",
  REMOVING_REFERENCED_REQUIREMENT: "REMOVING_REFERENCED_REQUIREMENT",
  ORPHANED_DELTA_TARGET: "ORPHANED_DELTA_TARGET",

  // Reference validation
  SPEC_NOT_FOUND: "SPEC_NOT_FOUND",
  REQUIREMENT_NOT_FOUND: "REQUIREMENT_NOT_FOUND",
  INVALID_DELTA_OPERATION: "INVALID_DELTA_OPERATION",

  // Schema validation
  INVALID_SCHEMA: "INVALID_SCHEMA",
  INVALID_ID_FORMAT: "INVALID_ID_FORMAT",

  // TDD compliance
  MISSING_TDD_EVIDENCE: "MISSING_TDD_EVIDENCE",
} as const;

export type ValidationCode =
  (typeof ValidationCodes)[keyof typeof ValidationCodes];

// =============================================================================
// Validation Context
// =============================================================================

export interface ValidationContext {
  /** All existing specs (the laws) */
  existingSpecs: Map<string, ExistingSpec>;
  /** All existing requirement IDs for quick lookup */
  existingRequirementIds: Set<string>;
  /** Requirements that reference other requirements */
  requirementReferences: Map<string, string[]>;
}

export interface ExistingSpec {
  name: string;
  requirements: Array<{
    id: string;
    title: string;
    priority: string;
  }>;
}
