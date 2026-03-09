/**
 * Prep-Readiness Validator
 *
 * Machine-enforced checks that answer: "Do we have everything we need
 * ready to make the full change?" Runs as part of `adv_gate_complete prep`.
 *
 * Architecture:
 * - Pure functions — no I/O, no filesystem access beyond the Change object
 * - Reuses existing ValidationIssue type (severity: "error" = must-failure, "warning" = advisory)
 * - All check IDs defined in PrepReadinessCodes for human/tool contract alignment
 */

import type { Change } from "../types";
import type { ValidationIssue } from "./types";
import {
  isTestTask as classifierIsTestTask,
  isImplTask as classifierIsImplTask,
} from "./task-classifier";

// =============================================================================
// Check Codes
// =============================================================================

export const PrepReadinessCodes = {
  // Smell checks (advisory warnings only)
  SMELL_SUBJECTIVE: "SMELL_SUBJECTIVE",
  SMELL_AMBIGUOUS: "SMELL_AMBIGUOUS",
  SMELL_SUPERLATIVE: "SMELL_SUPERLATIVE",
  SMELL_NEGATIVE: "SMELL_NEGATIVE",
  SMELL_TOTALITY: "SMELL_TOTALITY",

  // Scenario adequacy
  SCENARIO_MISSING: "SCENARIO_MISSING", // must (error)
  SCENARIO_INADEQUATE: "SCENARIO_INADEQUATE", // warning

  // Task graph integrity
  TASK_TDD_INVERSION: "TASK_TDD_INVERSION", // must (error)
  TASK_ORPHAN: "TASK_ORPHAN", // warning

  // Cross-repo routing
  CROSS_REPO_MISSING_METADATA: "CROSS_REPO_MISSING_METADATA", // must (error)
  CROSS_REPO_HINT_UNROUTED: "CROSS_REPO_HINT_UNROUTED", // warning
} as const;

export type PrepReadinessCode =
  (typeof PrepReadinessCodes)[keyof typeof PrepReadinessCodes];

// =============================================================================
// Result Type
// =============================================================================

export interface PrepReadinessResult {
  passed: boolean;
  mustFailures: ValidationIssue[];
  warnings: ValidationIssue[];
  checksPerformed: string[];
  checkedAt: string;
}

// =============================================================================
// Smell Patterns
// =============================================================================

const SMELL_PATTERNS = {
  SMELL_SUBJECTIVE:
    /\b(easy|simple|nice|intuitive|user[- ]friendly|natural|obvious|trivial)\b/i,
  SMELL_AMBIGUOUS:
    /\b(etc\.?|and\/or|various|several|some|appropriate|relevant|suitable)\b/i,
  SMELL_SUPERLATIVE:
    /\b(best|fastest|slowest|most|least|optimal|perfect|always|never|maximum|minimum)\b/i,
  SMELL_NEGATIVE:
    /\b(not|never|without|no\s+\w+|avoid|prevent|disallow|block)\b/i,
  SMELL_TOTALITY:
    /\b(all|every|any|none|everything|everyone|nobody|everywhere)\b/i,
} as const;

// =============================================================================
// Check: Requirement Smells
// =============================================================================

/**
 * Scan requirement titles in spec deltas for language smell patterns.
 * All smell issues are advisory warnings — never errors.
 */
export function checkRequirementSmells(change: Change): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [capability, deltas] of Object.entries(change.deltas)) {
    for (const delta of deltas) {
      if (delta.operation !== "add") continue;

      const req = delta.requirement;
      const title = req.title ?? "";

      for (const [code, pattern] of Object.entries(SMELL_PATTERNS)) {
        if (pattern.test(title)) {
          issues.push({
            code,
            severity: "warning",
            message: `Requirement "${req.id}" title may have a smell (${code}): "${title}"`,
            path: `deltas.${capability}.${delta.id}.requirement.title`,
            details: {
              requirementId: req.id,
              pattern: pattern.source,
              remediation: `Rewrite to be specific and measurable. Replace vague language with concrete criteria.`,
            },
          });
        }
      }
    }
  }

  return issues;
}

// =============================================================================
// Check: Scenario Adequacy
// =============================================================================

/**
 * Ensure every added requirement has at least one scenario.
 * Requirements with no scenarios cannot be tested or validated → must-failure.
 */
export function checkScenarioAdequacy(change: Change): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [capability, deltas] of Object.entries(change.deltas)) {
    for (const delta of deltas) {
      if (delta.operation !== "add") continue;

      const req = delta.requirement;
      if (!req.scenarios || req.scenarios.length === 0) {
        issues.push({
          code: PrepReadinessCodes.SCENARIO_MISSING,
          severity: "error",
          message: `Requirement "${req.id}" has no scenarios defined`,
          path: `deltas.${capability}.${delta.id}.requirement.scenarios`,
          details: {
            requirementId: req.id,
            remediation:
              "Add at least one scenario with given/when/then clauses to make the requirement testable.",
          },
        });
      }
    }
  }

  return issues;
}

// =============================================================================
// Check: Task Graph Integrity
// =============================================================================

/**
 * Check task graph for TDD inversions and orphan tasks.
 *
 * TDD inversion detection uses the shared task classifier (rq-TDD004cls):
 *   1. metadata.tdd_intent takes precedence (authoritative)
 *   2. Title heuristics as fallback for legacy tasks without metadata
 *
 * Per rq-TDD005inv:
 *   - separate_verification tasks are exempt from inversion detection
 *   - inline/not_applicable metadata prevents false positives on test-like titles
 *
 * Per rq-TDD006rem:
 *   - Remediation suggests merge (not dependency reversal)
 *
 * Orphan: a task with no deps that is not a dep of any other task → warning.
 */
export function checkTaskGraphIntegrity(change: Change): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const allTasks = change.tasks ?? [];

  if (allTasks.length === 0) return issues;

  // Exclude cancelled tasks — they are no longer active and should not
  // trigger TDD inversion or orphan warnings.
  const tasks = allTasks.filter((t) => t.status !== "cancelled");

  if (tasks.length === 0) return issues;

  // Build a set of task IDs that are dependencies of other tasks
  const isDependedOn = new Set<string>();
  for (const task of tasks) {
    for (const dep of task.deps ?? []) {
      if (dep.type === "blocked_by") {
        isDependedOn.add(dep.target);
      }
    }
  }

  // Index tasks by ID for lookup
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  for (const task of tasks) {
    const blockedByDeps = (task.deps ?? []).filter(
      (d) => d.type === "blocked_by",
    );

    // TDD inversion check — uses classifier for metadata-first detection
    // When metadata.tdd_intent is explicitly set, it is authoritative.
    // Only use title heuristics when no valid metadata is present.
    const hasExplicitMetadata =
      task.metadata?.tdd_intent !== undefined &&
      ["inline", "separate_verification", "not_applicable"].includes(
        task.metadata.tdd_intent,
      );

    // Skip inversion check for:
    // - Tasks with explicit metadata (metadata is authoritative — prevents false positives)
    // - Tasks with TDD explicitly skipped
    const skipInversion =
      hasExplicitMetadata || task.tdd_evidence?.skipped;

    if (!skipInversion && classifierIsTestTask(task.title)) {
      for (const dep of blockedByDeps) {
        const depTask = taskById.get(dep.target);
        if (depTask && classifierIsImplTask(depTask.title)) {
          issues.push({
            code: PrepReadinessCodes.TASK_TDD_INVERSION,
            severity: "error",
            message: `TDD inversion: test task "${task.id}" is blocked_by impl task "${depTask.id}". Tests must come before implementation (red-before-green).`,
            path: `tasks.${task.id}`,
            details: {
              testTaskId: task.id,
              testTaskTitle: task.title,
              implTaskId: depTask.id,
              implTaskTitle: depTask.title,
              remediation:
                "Merge the test task into the implementation task as inline TDD (red/green phases within the same task). If this is a legitimate cross-cutting test, set metadata.tdd_intent='separate_verification' instead.",
            },
          });
        }
      }
    }

    // Orphan check: no deps AND not a dep of anything
    const hasDeps = blockedByDeps.length > 0;
    const isDepOfSomething = isDependedOn.has(task.id);
    if (!hasDeps && !isDepOfSomething && tasks.length > 1) {
      issues.push({
        code: PrepReadinessCodes.TASK_ORPHAN,
        severity: "warning",
        message: `Task "${task.id}" ("${task.title}") has no dependencies and is not a dependency of any other task`,
        path: `tasks.${task.id}`,
        details: {
          taskId: task.id,
          remediation:
            "Consider whether this task should depend on or be depended on by other tasks to clarify execution order.",
        },
      });
    }
  }

  return issues;
}

// =============================================================================
// Check: Cross-Repo Routing
// =============================================================================

/** Patterns suggesting a task targets a different repo (title hint) */
const CROSS_REPO_TITLE_HINTS =
  /(\[[\w-]+\]|~\/dev\/|~\/repos\/|\/home\/\w+\/dev\/)/i;

/**
 * Validate cross-repo routing metadata consistency.
 *
 * - target_repo XOR target_path (one set, other missing) → must-failure
 * - Title has repo hint but no metadata → advisory warning
 */
export function checkCrossRepoRouting(change: Change): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const task of change.tasks ?? []) {
    const hasRepo = task.target_repo != null && task.target_repo !== "";
    const hasPath = task.target_path != null && task.target_path !== "";

    if (hasRepo && !hasPath) {
      issues.push({
        code: PrepReadinessCodes.CROSS_REPO_MISSING_METADATA,
        severity: "error",
        message: `Task "${task.id}" has target_repo "${task.target_repo}" but is missing target_path`,
        path: `tasks.${task.id}.target_path`,
        details: {
          taskId: task.id,
          target_repo: task.target_repo,
          remediation:
            "Add target_path with the absolute path to the target repository directory.",
        },
      });
    } else if (!hasRepo && hasPath) {
      issues.push({
        code: PrepReadinessCodes.CROSS_REPO_MISSING_METADATA,
        severity: "error",
        message: `Task "${task.id}" has target_path "${task.target_path}" but is missing target_repo`,
        path: `tasks.${task.id}.target_repo`,
        details: {
          taskId: task.id,
          target_path: task.target_path,
          remediation:
            "Add target_repo with the repository ID (matching related_repos[].id in project config).",
        },
      });
    } else if (!hasRepo && !hasPath) {
      // Check for title hint suggesting this might be a cross-repo task
      if (CROSS_REPO_TITLE_HINTS.test(task.title) && !hasRepo && !hasPath) {
        issues.push({
          code: PrepReadinessCodes.CROSS_REPO_HINT_UNROUTED,
          severity: "warning",
          message: `Task "${task.id}" title suggests a cross-repo target but has no routing metadata: "${task.title}"`,
          path: `tasks.${task.id}`,
          details: {
            taskId: task.id,
            remediation:
              "If this task targets a different repository, add both target_repo and target_path. Otherwise, remove the repo hint from the title.",
          },
        });
      }
    }
  }

  return issues;
}

// =============================================================================
// runPrepReadinessChecks
// =============================================================================

/**
 * Run all prep-readiness checks against a change.
 *
 * Returns a PrepReadinessResult with:
 * - mustFailures: issues with severity "error" that block the prep gate
 * - warnings: advisory issues that do not block
 * - passed: true only when mustFailures is empty
 */
export function runPrepReadinessChecks(change: Change): PrepReadinessResult {
  const allIssues: ValidationIssue[] = [
    ...checkRequirementSmells(change),
    ...checkScenarioAdequacy(change),
    ...checkTaskGraphIntegrity(change),
    ...checkCrossRepoRouting(change),
  ];

  const mustFailures = allIssues.filter((i) => i.severity === "error");
  const warnings = allIssues.filter((i) => i.severity === "warning");

  return {
    passed: mustFailures.length === 0,
    mustFailures,
    warnings,
    checksPerformed: [
      "checkRequirementSmells",
      "checkScenarioAdequacy",
      "checkTaskGraphIntegrity",
      "checkCrossRepoRouting",
    ],
    checkedAt: new Date().toISOString(),
  };
}
