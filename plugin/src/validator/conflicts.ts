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

      // Check rename new_id against existing specs and other new IDs in this change
      if (delta.operation === "rename" && delta.new_id) {
        const newId = delta.new_id;

        // Check against existing spec requirements (excluding the target being renamed)
        if (
          newId !== delta.target_id &&
          context.existingRequirementIds.has(newId)
        ) {
          issues.push({
            code: ValidationCodes.DUPLICATE_REQUIREMENT_ID,
            severity: "error",
            message: `Rename new_id "${newId}" already exists in specs`,
            path: `deltas.${capability}.${delta.id}`,
            details: { requirementId: newId, operation: "rename" },
          });
        }

        // Check against other new IDs in this change (add IDs + other rename new_ids)
        if (seenIds.has(newId)) {
          issues.push({
            code: ValidationCodes.DUPLICATE_REQUIREMENT_ID,
            severity: "error",
            message: `Rename new_id "${newId}" is used multiple times in this change`,
            path: `deltas.${capability}.${delta.id}`,
            details: { requirementId: newId, operation: "rename" },
          });
        }

        seenIds.add(newId);
      }
    }
  }

  return issues;
}

/**
 * Check that modify/remove/rename deltas target existing requirements
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

      if (delta.operation === "rename") {
        const targetId = delta.target_id;

        if (!context.existingRequirementIds.has(targetId)) {
          issues.push({
            code: ValidationCodes.RENAME_TARGET_NOT_FOUND,
            severity: "error",
            message: `Rename delta targets non-existent requirement "${targetId}"`,
            path: `deltas.${capability}.${delta.id}`,
            details: { targetId, operation: "rename" },
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
 * Check for overlapping capabilities with other active changes
 *
 * When multiple changes touch the same capability, there's potential for
 * merge conflicts when archiving. This check warns about such overlaps.
 */
export function checkChangeConflicts(
  change: Change,
  context: ValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!context.activeChanges || context.activeChanges.length === 0) {
    return issues;
  }

  // Get capabilities this change touches
  const thisCapabilities = new Set(Object.keys(change.deltas));

  // Check against other active changes
  for (const otherChange of context.activeChanges) {
    // Skip self
    if (otherChange.id === change.id) continue;

    // Find overlapping capabilities
    const overlapping = otherChange.capabilities.filter((cap) =>
      thisCapabilities.has(cap),
    );

    if (overlapping.length > 0) {
      issues.push({
        code: ValidationCodes.OVERLAPPING_CAPABILITY,
        severity: "warning",
        message: `Change "${otherChange.title}" (${otherChange.id}) also modifies: ${overlapping.join(", ")}`,
        path: "deltas",
        details: {
          otherChangeId: otherChange.id,
          otherChangeTitle: otherChange.title,
          overlappingCapabilities: overlapping,
        },
      });
    }
  }

  return issues;
}

/**
 * Check for conflicts between deltas within the same change.
 *
 * Detects:
 * - Multiple operations targeting the same requirement (rename+remove, double rename)
 * - Rename new_id colliding with an add delta's requirement ID
 */
export function checkIntraDeltaConflicts(change: Change): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [capability, deltas] of Object.entries(change.deltas)) {
    // Track target_ids used by rename/remove/modify operations
    const targetOps = new Map<
      string,
      { deltaId: string; operation: string }[]
    >();
    // Track IDs being added (from add deltas)
    const addedIds = new Set<string>();
    // Track new_ids from renames
    const renameNewIds = new Map<string, string>(); // new_id -> deltaId

    for (const delta of deltas) {
      if (
        delta.operation === "rename" ||
        delta.operation === "remove" ||
        delta.operation === "modify"
      ) {
        const targetId = delta.target_id;
        if (!targetOps.has(targetId)) {
          targetOps.set(targetId, []);
        }
        targetOps
          .get(targetId)!
          .push({ deltaId: delta.id, operation: delta.operation });
      }

      if (delta.operation === "add") {
        addedIds.add(delta.requirement.id);
      }

      if (delta.operation === "rename" && delta.new_id) {
        renameNewIds.set(delta.new_id, delta.id);
      }
    }

    // Check for multiple operations on the same target
    for (const [targetId, ops] of targetOps) {
      // Rename + any other operation on same target is a conflict
      const hasRename = ops.some((o) => o.operation === "rename");
      const hasOther = ops.some((o) => o.operation !== "rename");
      const multipleRenames =
        ops.filter((o) => o.operation === "rename").length > 1;

      if (hasRename && hasOther) {
        issues.push({
          code: ValidationCodes.INTRA_DELTA_CONFLICT,
          severity: "error",
          message: `Conflicting operations on "${targetId}": ${ops.map((o) => `${o.operation} (${o.deltaId})`).join(", ")}`,
          path: `deltas.${capability}`,
          details: {
            targetId,
            operations: ops.map((o) => ({
              deltaId: o.deltaId,
              operation: o.operation,
            })),
          },
        });
      }

      if (multipleRenames) {
        issues.push({
          code: ValidationCodes.INTRA_DELTA_CONFLICT,
          severity: "error",
          message: `Multiple renames targeting "${targetId}": ${ops
            .filter((o) => o.operation === "rename")
            .map((o) => o.deltaId)
            .join(", ")}`,
          path: `deltas.${capability}`,
          details: {
            targetId,
            operations: ops
              .filter((o) => o.operation === "rename")
              .map((o) => ({ deltaId: o.deltaId, operation: o.operation })),
          },
        });
      }
    }

    // Check rename new_id collisions with add IDs
    for (const [newId, renameDeltaId] of renameNewIds) {
      if (addedIds.has(newId)) {
        issues.push({
          code: ValidationCodes.INTRA_DELTA_CONFLICT,
          severity: "error",
          message: `Rename delta "${renameDeltaId}" new_id "${newId}" collides with an add delta in the same change`,
          path: `deltas.${capability}`,
          details: {
            renameDeltaId,
            collidingId: newId,
          },
        });
      }
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
  issues.push(...checkIntraDeltaConflicts(change));
  issues.push(...checkPriorityDowngrades(change, context));
  issues.push(...checkRemovalReferences(change, context));
  issues.push(...checkSpecsExist(change, context));
  issues.push(...checkChangeConflicts(change, context));

  return issues;
}
