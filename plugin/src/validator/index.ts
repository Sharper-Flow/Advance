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
  type ActiveChange,
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
  checkChangeConflicts,
} from "./conflicts";

// Prep-readiness checks (for prep gate enforcement)
export {
  runPrepReadinessChecks,
  checkRequirementSmells,
  checkScenarioAdequacy,
  checkTaskGraphIntegrity,
  checkCrossRepoRouting,
  PrepReadinessCodes,
  type PrepReadinessResult,
  type PrepReadinessCode,
} from "./prep-readiness";

// Clarify-readiness checks (for ambiguity detection)
export {
  runClarifyReadinessChecks,
  checkSubjectiveLanguage,
  checkMissingSuccessCriteria,
  checkMissingScenarios,
  checkUnclearScope,
  checkAssumptionHeavy,
  checkMissingErrorHandling,
  ClarifyReadinessCodes,
  type ClarifyReadinessResult,
  type ClarifyReadinessCode,
} from "./clarify-readiness";
