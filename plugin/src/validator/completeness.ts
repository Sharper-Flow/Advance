/**
 * Completeness Checks
 *
 * Validates that changes have required fields and structure
 */

import type { Change } from "../types";
import type { ValidationIssue } from "./types";
import { ValidationCodes } from "./types";
import { getTaskTddCompliance } from "./task-classifier";

/**
 * Check if change has tasks defined
 */
function checkHasTasks(change: Change): ValidationIssue | null {
  if (change.tasks.length === 0) {
    return {
      code: ValidationCodes.NO_TASKS,
      severity: "warning",
      message: "Change has no tasks defined",
      path: "tasks",
    };
  }
  return null;
}

/**
 * Check if change has deltas defined
 */
function checkHasDeltas(change: Change): ValidationIssue | null {
  const deltaCount = Object.values(change.deltas).flat().length;
  if (deltaCount === 0) {
    return {
      code: ValidationCodes.NO_DELTAS,
      severity: "warning",
      message: "Change has no spec deltas defined",
      path: "deltas",
    };
  }
  return null;
}

/**
 * Check if added requirements have at least one scenario
 */
function checkRequirementScenarios(change: Change): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [capability, deltas] of Object.entries(change.deltas)) {
    for (const delta of deltas) {
      if (delta.operation === "add") {
        const req = delta.requirement;
        if (!req.scenarios || req.scenarios.length === 0) {
          issues.push({
            code: ValidationCodes.MISSING_SCENARIO,
            severity: "warning",
            message: `Requirement ${req.id} has no scenarios defined`,
            path: `deltas.${capability}.${delta.id}`,
            details: { requirementId: req.id },
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Check if scenarios have all required fields
 */
function checkScenarioCompleteness(change: Change): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [capability, deltas] of Object.entries(change.deltas)) {
    for (const delta of deltas) {
      if (delta.operation === "add") {
        const req = delta.requirement;
        for (const scenario of req.scenarios ?? []) {
          if (!scenario.given || scenario.given.length === 0) {
            issues.push({
              code: ValidationCodes.INCOMPLETE_SCENARIO,
              severity: "warning",
              message: `Scenario ${scenario.id} has no "given" conditions`,
              path: `deltas.${capability}.${delta.id}.scenarios.${scenario.id}`,
            });
          }
          if (!scenario.when) {
            issues.push({
              code: ValidationCodes.INCOMPLETE_SCENARIO,
              severity: "warning",
              message: `Scenario ${scenario.id} has no "when" clause`,
              path: `deltas.${capability}.${delta.id}.scenarios.${scenario.id}`,
            });
          }
          if (!scenario.then || scenario.then.length === 0) {
            issues.push({
              code: ValidationCodes.INCOMPLETE_SCENARIO,
              severity: "warning",
              message: `Scenario ${scenario.id} has no "then" outcomes`,
              path: `deltas.${capability}.${delta.id}.scenarios.${scenario.id}`,
            });
          }
        }
      }
    }
  }

  return issues;
}

/**
 * Check that requirement IDs follow the correct format
 */
function checkIdFormats(change: Change): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const reqIdPattern = /^rq-[a-zA-Z0-9]+$/;
  const scenarioIdPattern = /^rq-[a-zA-Z0-9]+\.\d+$/;
  const deltaIdPattern = /^dl-[a-zA-Z0-9]+$/;

  for (const [capability, deltas] of Object.entries(change.deltas)) {
    for (const delta of deltas) {
      if (!deltaIdPattern.test(delta.id)) {
        issues.push({
          code: ValidationCodes.INVALID_ID_FORMAT,
          severity: "error",
          message: `Delta ID "${delta.id}" does not match expected format "dl-{nanoid}"`,
          path: `deltas.${capability}.${delta.id}`,
        });
      }

      if (delta.operation === "add") {
        const req = delta.requirement;
        if (!reqIdPattern.test(req.id)) {
          issues.push({
            code: ValidationCodes.INVALID_ID_FORMAT,
            severity: "error",
            message: `Requirement ID "${req.id}" does not match expected format "rq-{nanoid}"`,
            path: `deltas.${capability}.${delta.id}.requirement.id`,
          });
        }

        for (const scenario of req.scenarios ?? []) {
          if (!scenarioIdPattern.test(scenario.id)) {
            issues.push({
              code: ValidationCodes.INVALID_ID_FORMAT,
              severity: "error",
              message: `Scenario ID "${scenario.id}" does not match expected format "rq-{parent}.{n}"`,
              path: `deltas.${capability}.${delta.id}.scenarios.${scenario.id}`,
            });
          }
        }
      }

      if (delta.operation === "rename" && delta.new_id) {
        if (!reqIdPattern.test(delta.new_id)) {
          issues.push({
            code: ValidationCodes.INVALID_ID_FORMAT,
            severity: "error",
            message: `Rename new_id "${delta.new_id}" does not match expected format "rq-{nanoid}"`,
            path: `deltas.${capability}.${delta.id}.new_id`,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Check if completed logic tasks have TDD evidence.
 *
 * Uses the shared task classifier helpers (rq-TDD004cls) for metadata-first
 * detection and compliance evaluation.
 */
export function checkTddCompliance(change: Change): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const task of change.tasks) {
    // Only check completed tasks
    if (task.status !== "done") continue;

    const compliance = getTaskTddCompliance(task);
    if (compliance === "not_required") continue;

    if (compliance === "missing") {
      issues.push({
        code: ValidationCodes.MISSING_TDD_EVIDENCE,
        severity: "error",
        message: `Task "${task.title}" (${task.id}) is logic-heavy but lacks TDD evidence`,
        path: `tasks.${task.id}`,
        details: {
          taskId: task.id,
          recommendation:
            "Complete the task with a verification summary or reclassify tdd_intent when TDD is not applicable.",
        },
      });
    }
  }

  return issues;
}

/**
 * Run all completeness checks
 */
export function runCompletenessChecks(change: Change): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const taskIssue = checkHasTasks(change);
  if (taskIssue) issues.push(taskIssue);

  const deltaIssue = checkHasDeltas(change);
  if (deltaIssue) issues.push(deltaIssue);

  issues.push(...checkRequirementScenarios(change));
  issues.push(...checkScenarioCompleteness(change));
  issues.push(...checkIdFormats(change));
  issues.push(...checkTddCompliance(change));

  return issues;
}
