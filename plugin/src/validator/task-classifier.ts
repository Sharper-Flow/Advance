/**
 * Task Classifier — shared TDD intent detection for all validators.
 *
 * Spec: .adv/specs/tdd-contract/spec.json
 * Requirement: rq-TDD004cls (Task Classifier with Metadata-First Detection)
 *
 * Detection order:
 *   1. metadata.tdd_intent (if valid) — authoritative
 *   2. Title heuristics — legacy fallback
 *
 * This module is the single source of truth for TDD intent classification.
 * All validators (prep-readiness, completeness, gate checks) MUST use this
 * instead of implementing their own detection logic.
 */

import {
  isLogicTask,
  TDD_TRIVIAL_PATTERNS,
  TDD_REQUIRED_PATTERNS,
} from "../types";
import type { Task } from "../types";

// =============================================================================
// Types
// =============================================================================

/** Valid values for metadata.tdd_intent */
type TddIntent = "inline" | "separate_verification" | "not_applicable";

const VALID_TDD_INTENTS = new Set<string>([
  "inline",
  "separate_verification",
  "not_applicable",
]);

// =============================================================================
// Title Heuristics (extracted from prep-readiness.ts)
// =============================================================================

/** Returns true if a task title indicates it is a test/spec task */
export function isTestTask(title: string): boolean {
  return /\b(test|tests|spec|specs|failing test|red phase)\b/i.test(title);
}

/** Returns true if a task title indicates it is an implementation task */
export function isImplTask(title: string): boolean {
  return /\b(implement|impl|create|build|add|develop|code|write\s+(?!test|spec))\b/i.test(
    title,
  );
}

// =============================================================================
// Classifier
// =============================================================================

/**
 * Classify a task's TDD intent using metadata-first detection with title fallback.
 *
 * Per rq-TDD004cls:
 *   - metadata.tdd_intent takes precedence when valid
 *   - Invalid metadata values are ignored (fall back to title heuristics)
 *   - Tasks without metadata use title-based heuristics for backward compatibility
 *
 * @returns The resolved TDD intent for the task
 */
export function classifyTddIntent(
  task: Pick<Task, "title" | "metadata">,
): TddIntent {
  // 1. Check metadata.tdd_intent first (authoritative when valid)
  const metadataIntent = task.metadata?.tdd_intent;
  if (metadataIntent !== undefined && VALID_TDD_INTENTS.has(metadataIntent)) {
    return metadataIntent as TddIntent;
  }

  // 2. Fall back to title heuristics
  const title = task.title;

  // Trivial tasks (docs, config, chores) → not_applicable
  if (TDD_TRIVIAL_PATTERNS.some((p) => p.test(title))) {
    return "not_applicable";
  }

  // Logic-heavy tasks (implement, create, fix, etc.) → inline
  if (TDD_REQUIRED_PATTERNS.some((p) => p.test(title))) {
    return "inline";
  }

  // Test-like tasks without metadata → inline (they're part of impl work)
  if (isTestTask(title)) {
    return "inline";
  }

  // Default: inline (conservative — require TDD evidence)
  return "inline";
}

/**
 * Returns whether a task should produce TDD evidence under the metadata-first
 * contract.
 */
export function requiresTddEvidence(
  task: Pick<Task, "title" | "metadata">,
): boolean {
  const intent = classifyTddIntent(task);

  if (intent === "not_applicable" || intent === "separate_verification") {
    return false;
  }

  return task.metadata?.tdd_intent === "inline" || isLogicTask(task.title);
}

/**
 * Metadata-aware TDD compliance used by validators and task tools.
 */
export function getTaskTddCompliance(
  task: Pick<Task, "title" | "metadata">,
): "compliant" | "missing" | "not_required" {
  if (!requiresTddEvidence(task)) {
    return "not_required";
  }

  return "missing";
}
