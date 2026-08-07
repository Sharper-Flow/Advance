/**
 * Validation Types
 *
 * Types for "specs as laws" validation
 */

import { z } from "zod";

import type { AuthorityDiagnostics } from "../storage/store-types";

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
  /** Stable diagnostics from the active project authority used during validation. */
  authorityDiagnostics?: AuthorityDiagnostics;
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

  // Intra-delta conflicts
  INTRA_DELTA_CONFLICT: "INTRA_DELTA_CONFLICT",
  RENAME_TARGET_NOT_FOUND: "RENAME_TARGET_NOT_FOUND",

  // Change-to-change conflicts
  OVERLAPPING_CAPABILITY: "OVERLAPPING_CAPABILITY",
  CONFLICT_INVENTORY_BLOCKED: "CONFLICT_INVENTORY_BLOCKED",
  CONFLICT_INVENTORY_DEGRADED: "CONFLICT_INVENTORY_DEGRADED",
  CONFLICT_INVENTORY_WARNING: "CONFLICT_INVENTORY_WARNING",

  // Spec divergence (merge-base-aware)
  SPEC_DIVERGED: "SPEC_DIVERGED",
  SPEC_RESOLUTION_DEGRADED: "SPEC_RESOLUTION_DEGRADED",

  // Contract traceability
  CONTRACT_DUPLICATE_ID: "CONTRACT_DUPLICATE_ID",
  CONTRACT_UNKNOWN_REF: "CONTRACT_UNKNOWN_REF",
  CONTRACT_TASK_REFS_MISSING: "CONTRACT_TASK_REFS_MISSING",
  CONTRACT_AC_UNCOVERED: "CONTRACT_AC_UNCOVERED",
  CONTRACT_UNKNOWN_REVIEW_REF: "CONTRACT_UNKNOWN_REVIEW_REF",
  CONTRACT_PROOF_MISSING: "CONTRACT_PROOF_MISSING",
  CONTRACT_PROOF_FAILED: "CONTRACT_PROOF_FAILED",
  CONTRACT_ACCEPTANCE_CRITERIA_DRIFT: "CONTRACT_ACCEPTANCE_CRITERIA_DRIFT",
} as const;

type _ValidationCode = (typeof ValidationCodes)[keyof typeof ValidationCodes];

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
  /** Other active changes (for conflict detection) — legacy path */
  activeChanges?: ActiveChange[];
  /** Typed conflict inventory (preferred over activeChanges when present) */
  conflictInventory?: ConflictInventory;
}

export interface ActiveChange {
  id: string;
  title: string;
  /** Capabilities this change touches (has deltas for) */
  capabilities: string[];
}

// =============================================================================
// Conflict Inventory (Typed Change Inventory for Conflict Detection)
// =============================================================================

/**
 * Typed entry in the conflict inventory representing a single change.
 * Active changes and Epic members are authoritative; archived changes are
 * related context only.
 */
export interface ConflictInventoryEntry {
  id: string;
  title: string;
  status: string;
  /**
   * Capabilities this change touches (has deltas for). Present when the Store
   * exposed capability data in one pass; absent when the data was not available
   * without a second read.
   */
  capabilities?: string[];
  /** Epic membership context when the change belongs to an Epic */
  epic?: {
    id: string;
    title: string;
    entry_id: string;
  };
  /** Whether this entry is archived (related context, not authority) */
  isArchived: boolean;
  /** Whether this entry is the change currently being validated */
  isOwnChange: boolean;
}

/**
 * Explicit completeness state for the conflict inventory.
 *
 * - complete: All changes were enumerated and hydrated successfully.
 * - degraded: Some changes could not be fully hydrated (e.g. projection
 *   evicted); conflict detection proceeds but with reduced confidence.
 * - blocked: The inventory source failed or was unreachable; no reliable
 *   conflict detection is possible.
 * - non-conclusive: The inventory was truncated or deadline-expired before all
 *   peer capabilities could be established; no clean/pass verdict may be drawn.
 */
export type ConflictInventoryCompleteness =
  | "complete"
  | "degraded"
  | "blocked"
  | "non-conclusive";

/**
 * Complete paginated typed change inventory used for conflict detection.
 */
export interface ConflictInventory {
  /** All enumerated changes (active + archived) */
  entries: ConflictInventoryEntry[];
  /** Explicit completeness state */
  completeness: ConflictInventoryCompleteness;
  /** Non-fatal warnings encountered during inventory construction */
  warnings: string[];
  /** Source identifier for auditability */
  source: string;
  /** Stable diagnostics from the active project authority, when one was used. */
  authorityDiagnostics?: AuthorityDiagnostics;
  /** The change ID being validated (own-change) */
  ownChangeId: string;
  /**
   * When false, the inventory is incomplete and validation must not produce a
   * clean/pass verdict. Structural fail-closed guard against false-clean output.
   */
  canConcludeClean?: boolean;
}

export interface ExistingSpec {
  name: string;
  requirements: Array<{
    id: string;
    title: string;
    priority: string;
  }>;
}
