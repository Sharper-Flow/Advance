/**
 * adv CLI — opt-scan detector registry
 *
 * Version-1 catalog of deterministic optimization detector families. Each
 * entry declares its family, signal class, trigger scope, and metadata the
 * evaluator uses to render a structured candidate.
 *
 * The registry is the single source of truth for which optimization families
 * the typed opt-scan pipeline knows how to evaluate. The four families map
 * directly to the agreed candidate classes in the change contract.
 *
 * Regex safety (P33 + project conventions): every pattern below is a
 * bounded alternation or a simple anchored literal. No nested quantifiers.
 */

import type {
  OptimizationCandidateFamily,
  OptimizationConfidence,
  OptimizationSeverity,
  OptimizationSignalClass,
} from "./schema";

export interface OptimizationDetector {
  readonly id: string;
  readonly title: string;
  readonly family: OptimizationCandidateFamily;
  /**
   * Detection phase routes the detector to deterministic Phase 1 (source-
   * only static evidence) or heuristic Phase 3 (intent corroboration).
   */
  readonly detection_phase: 1 | 3;
  /** Whether the detector emits static advisory candidates or measured ones. */
  readonly signal_class: OptimizationSignalClass;
  readonly trigger: {
    readonly file_globs: readonly string[];
    readonly pattern: RegExp;
    readonly description: string;
  };
  readonly severity_hint: OptimizationSeverity;
  readonly confidence: OptimizationConfidence;
  readonly false_positive_caveat: string;
  readonly verification_needed: string;
}

export const OPTIMIZATION_DETECTORS: readonly OptimizationDetector[] = [
  {
    id: "repeated_boundary_work",
    title: "Repeated boundary work",
    family: "repeated_boundary_work",
    detection_phase: 1,
    signal_class: "static",
    trigger: {
      file_globs: ["**/*.ts", "**/*.js", "**/*.tsx", "**/*.jsx"],
      // Deliberately bounded alternation of common boundary call names.
      pattern: /\b(fetch|axios|request|rpc)\b/g,
      description:
        "Source calls a boundary (network/rpc/request) repeatedly in a loop-like context.",
    },
    severity_hint: "minor",
    confidence: "medium",
    false_positive_caveat:
      "The call may be batched, debounced, or intentionally sequential; verify hotness with a profile.",
    verification_needed:
      "Profile the loop under representative load and confirm the boundary calls dominate cost.",
  },
  {
    id: "avoidable_collection_work",
    title: "Avoidable collection work",
    family: "avoidable_collection_work",
    detection_phase: 1,
    signal_class: "static",
    trigger: {
      file_globs: ["**/*.ts", "**/*.js", "**/*.tsx", "**/*.jsx"],
      // Deliberately bounded alternation of collection transformation names.
      pattern: /\b(map|filter|reduce|flatMap|sort)\b/g,
      description:
        "Source builds or transforms intermediate collections that may be avoidable or fuseable.",
    },
    severity_hint: "minor",
    confidence: "medium",
    false_positive_caveat:
      "The collection may be required for clarity, correctness, or a small, bounded input size.",
    verification_needed:
      "Confirm allocation volume with a profiler and that the input is large or frequently executed.",
  },
  {
    id: "worker_startup_pressure",
    title: "Worker/startup pressure",
    family: "worker_startup_pressure",
    detection_phase: 1,
    signal_class: "static",
    trigger: {
      file_globs: ["**/*.ts", "**/*.js", "**/*.tsx", "**/*.jsx"],
      // Bounded alternation of actual synchronous startup calls.
      pattern: /(?:readFileSync\s*\(|require\s*\(\s*[^)]+\.json\s*\))/g,
      description:
        "Source performs synchronous I/O or heavy parsing during worker startup.",
    },
    severity_hint: "major",
    confidence: "medium",
    false_positive_caveat:
      "Synchronous startup work may be small or one-time per process; measure before changing.",
    verification_needed:
      "Benchmark startup time with a cold process and the production configuration.",
  },
  {
    id: "cache_opportunity",
    title: "Cache opportunity",
    family: "cache_opportunity",
    detection_phase: 1,
    signal_class: "static",
    trigger: {
      file_globs: ["**/*.ts", "**/*.js", "**/*.tsx", "**/*.jsx"],
      // Bounded alternation of pure-computation signal prefixes.
      pattern: /\b(hash|digest|compute|derive|calculate|build|serialize)/g,
      description:
        "Source repeats a potentially pure computation that may be cacheable.",
    },
    severity_hint: "minor",
    confidence: "low",
    false_positive_caveat:
      "Caching requires clear identity, ownership, and invalidation; reject if any are unclear.",
    verification_needed:
      "Confirm repeated execution with a profile, define the cache key, owner, and invalidation policy.",
  },
] as const satisfies readonly OptimizationDetector[];

export function findOptimizationDetector(
  id: string,
): OptimizationDetector | undefined {
  return OPTIMIZATION_DETECTORS.find((entry) => entry.id === id);
}

export function detectorsByPhase(
  phase: 1 | 3,
): readonly OptimizationDetector[] {
  return OPTIMIZATION_DETECTORS.filter((entry) => entry.detection_phase === phase);
}
