/**
 * Validator Module
 *
 * "Specs as Laws" - validation system for change proposals.
 */

// Main validator
export { validateChange } from "./validator";

// Spec ambiguity detection (B/F/S/Q/E taxonomy for committed spec laws)
export {
  runSpecAmbiguityChecks,
  isAmbiguityFinding,
  SpecAmbiguityCodes,
} from "./spec-ambiguity";

// Decision-rationale source marker validation
export {
  parseDecisionRationaleBlock,
  SourceMarkerMalformedError,
} from "./source-marker";
export type {
  DecisionRationaleField,
  DecisionRationaleTriggerField,
  DecisionRationaleTriggerKind,
  ParsedDecisionRationaleBlock,
} from "./source-marker";
