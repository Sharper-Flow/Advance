/**
 * Conflict Detection
 *
 * Detects conflicts between deltas and existing specs (laws)
 */

import type { Change } from "../types";
import type { ValidationIssue, ValidationContext } from "./types";
import { ValidationCodes } from "./types";

/**
 * Check for duplicate requirement IDs across all deltas and existing specs
 */
export function checkDuplicateRequirementIds(
  change: Change,
  context: ValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();

  for (const [capability, deltas] of Object.entries(change.deltas)) {
    for (const delta of deltas) {
      if (delta.operation === "add") {
        const reqId = delta.requirement.id;

        // Check against existing specs
        if (context.existingRequirementIds.has(reqId)) {
          issues.push({
            code: ValidationCodes.DUPLICATE_REQUIREMENT_ID,
            severity: "error",
            message: `Requirement ID "${reqId}" already exists in specs`,
            path: `deltas.${capability}.${delta.id}`,
            details: { requirementId: reqId },
          });
        }

        // Check against other deltas in this change
        if (seenIds.has(reqId)) {
          issues.push({
            code: ValidationCodes.DUPLICATE_REQUIREMENT_ID,
            severity: "error",
            message: `Requirement ID "${reqId}" is used multiple times in this change`,
            path: `deltas.${capability}.${delta.id}`,
            details: { requirementId: reqId },
          });
        }

        seenIds.add(reqId);
      }
    }
  }

  return issues;
}

/**
 * Check that modify/remove deltas target existing requirements
 */
export function checkDeltaTargetsExist(
  change: Change,
  context: ValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [capability, deltas] of Object.entries(change.deltas)) {
    for (const delta of deltas) {
      if (delta.operation === "modify" || delta.operation === "remove") {
        const targetId = delta.target_id;

        if (!context.existingRequirementIds.has(targetId)) {
          issues.push({
            code: ValidationCodes.ORPHANED_DELTA_TARGET,
            severity: "error",
            message: `Delta targets non-existent requirement "${targetId}"`,
            path: `deltas.${capability}.${delta.id}`,
            details: { targetId, operation: delta.operation },
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Check for priority downgrades (MUST -> SHOULD -> MAY)
 */
export function checkPriorityDowngrades(
  change: Change,
  context: ValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const priorityRank = { must: 3, should: 2, may: 1 };

  for (const [capability, deltas] of Object.entries(change.deltas)) {
    for (const delta of deltas) {
      if (
        delta.operation === "modify" &&
        delta.changes &&
        "priority" in delta.changes
      ) {
        const newPriority = delta.changes.priority as string;

        // Find the existing requirement
        const spec = context.existingSpecs.get(capability);
        if (spec) {
          const existingReq = spec.requirements.find(
            (r) => r.id === delta.target_id,
          );
          if (existingReq) {
            const oldRank =
              priorityRank[existingReq.priority as keyof typeof priorityRank] ??
              0;
            const newRank =
              priorityRank[newPriority as keyof typeof priorityRank] ?? 0;

            if (newRank < oldRank) {
              issues.push({
                code: ValidationCodes.MODIFYING_MUST_TO_MAY,
                severity: "warning",
                message: `Downgrading priority of "${delta.target_id}" from "${existingReq.priority}" to "${newPriority}"`,
                path: `deltas.${capability}.${delta.id}`,
                details: {
                  targetId: delta.target_id,
                  oldPriority: existingReq.priority,
                  newPriority,
                },
              });
            }
          }
        }
      }
    }
  }

  return issues;
}

/**
 * Check for removal of requirements that are referenced by others
 */
export function checkRemovalReferences(
  change: Change,
  context: ValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [capability, deltas] of Object.entries(change.deltas)) {
    for (const delta of deltas) {
      if (delta.operation === "remove") {
        const targetId = delta.target_id;

        // Check if any other requirements reference this one
        for (const [reqId, refs] of context.requirementReferences) {
          if (refs.includes(targetId)) {
            issues.push({
              code: ValidationCodes.REMOVING_REFERENCED_REQUIREMENT,
              severity: "warning",
              message: `Removing requirement "${targetId}" which is referenced by "${reqId}"`,
              path: `deltas.${capability}.${delta.id}`,
              details: {
                targetId,
                referencedBy: reqId,
              },
            });
          }
        }
      }
    }
  }

  return issues;
}

/**
 * Check that referenced capabilities exist
 */
export function checkSpecsExist(
  change: Change,
  context: ValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const capability of Object.keys(change.deltas)) {
    // For new specs being created, we don't require they exist
    const allAddDeltas = change.deltas[capability].every(
      (d) => d.operation === "add",
    );

    if (!allAddDeltas && !context.existingSpecs.has(capability)) {
      issues.push({
        code: ValidationCodes.SPEC_NOT_FOUND,
        severity: "error",
        message: `Spec "${capability}" not found - cannot modify or remove requirements`,
        path: `deltas.${capability}`,
        details: { capability },
      });
    }
  }

  return issues;
}

/**
 * Run all conflict detection checks
 */
export function runConflictChecks(
  change: Change,
  context: ValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  issues.push(...checkDuplicateRequirementIds(change, context));
  issues.push(...checkDeltaTargetsExist(change, context));
  issues.push(...checkPriorityDowngrades(change, context));
  issues.push(...checkRemovalReferences(change, context));
  issues.push(...checkSpecsExist(change, context));

  return issues;
}
