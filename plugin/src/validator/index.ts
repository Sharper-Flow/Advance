/**
 * Validator Module
 *
 * "Specs as Laws" - validation system for change proposals.
 */

// Main validator
export {
  validateChange,
  buildValidationContext,
  type ValidatorOptions,
} from "./validator";

// Types
export {
  ValidationCodes,
  ValidationSeveritySchema,
  type ValidationSeverity,
  type ValidationIssue,
  type ValidationResult,
  type ValidationContext,
  type ExistingSpec,
} from "./types";

// Individual check modules (for fine-grained use)
export {
  runCompletenessChecks,
  checkHasTasks,
  checkHasDeltas,
  checkRequirementScenarios,
  checkScenarioCompleteness,
  checkIdFormats,
} from "./completeness";

export {
  runConflictChecks,
  checkDuplicateRequirementIds,
  checkDeltaTargetsExist,
  checkPriorityDowngrades,
  checkRemovalReferences,
  checkSpecsExist,
} from "./conflicts";
