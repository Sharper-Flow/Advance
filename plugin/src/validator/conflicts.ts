/**
 * Conflict Detection
 *
 * Detects conflicts between deltas and existing specs (laws)
 */

import type { Change } from "../types";
import type { ValidationIssue, ValidationContext } from "./types";
import { ValidationCodes } from "./types";

/**
 * Find an existing requirement (minimal shape) by ID across all existing specs.
 * Used for the idempotency identity check; the validator's existingSpecs carry
 * only id/title/priority, so the full-content guard lives in archive/delta.ts.
 */
function findExistingRequirement(
  context: ValidationContext,
  reqId: string,
): { id: string; title: string; priority: string } | undefined {
  for (const spec of context.existingSpecs.values()) {
    const found = spec.requirements.find((r) => r.id === reqId);
    if (found) return found;
  }
  return undefined;
}

/**
 * Check for duplicate requirement IDs across all deltas and existing specs
 */
function checkDuplicateRequirementIds(
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
          // rq-releaseProjectionDurability01 idempotency: if the existing
          // requirement matches the delta's id+title+priority, a prior
          // partial-archive likely already applied it — accept rather than
          // blocking. The validator's existingSpecs carry only minimal fields;
          // the apply stage (archive/delta.ts) does the full content guard, so
          // a content-divergent duplicate still fails there.
          const existingReq = findExistingRequirement(context, reqId);
          const sameIdentity =
            existingReq !== undefined &&
            existingReq.title === delta.requirement.title &&
            existingReq.priority === delta.requirement.priority;
          if (!sameIdentity) {
            issues.push({
              code: ValidationCodes.DUPLICATE_REQUIREMENT_ID,
              severity: "error",
              message: `Requirement ID "${reqId}" already exists in specs`,
              path: `deltas.${capability}.${delta.id}`,
              details: { requirementId: reqId },
            });
          }
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
function checkDeltaTargetsExist(
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
function checkPriorityDowngrades(
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
function checkRemovalReferences(
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
function checkSpecsExist(
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
 * Check for overlapping capabilities with other active changes.
 *
 * When multiple changes touch the same capability, there's potential for
 * merge conflicts when archiving. This check warns about such overlaps.
 *
 * Uses the typed conflict inventory when present (preferred), falling back
 * to the legacy activeChanges array. The inventory carries explicit
 * completeness state (complete / degraded / blocked) and Epic context.
 */
function checkChangeConflicts(
  change: Change,
  context: ValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Prefer typed conflict inventory when available
  if (context.conflictInventory) {
    return checkChangeConflictsFromInventory(change, context.conflictInventory);
  }

  // Legacy fallback: activeChanges array
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
 * Check for overlapping capabilities using the typed conflict inventory.
 *
 * Active changes and Epic members are authoritative; archived changes are
 * related context only. The inventory's completeness state determines
 * whether a clean no-conflict result is possible.
 */
function checkChangeConflictsFromInventory(
  change: Change,
  inventory: import("./types").ConflictInventory,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Blocked inventory → no reliable conflict detection possible
  if (inventory.completeness === "blocked") {
    issues.push({
      code: ValidationCodes.CONFLICT_INVENTORY_BLOCKED,
      severity: "error",
      message:
        "Conflict inventory is blocked — no reliable conflict detection possible. " +
        (inventory.warnings.length > 0
          ? `Reasons: ${inventory.warnings.join("; ")}`
          : "Inventory source unreachable or failed."),
      path: "deltas",
      details: {
        completeness: inventory.completeness,
        source: inventory.source,
        warnings: inventory.warnings,
      },
    });
    // Still run per-entry checks with whatever entries are available
  }

  // Degraded inventory → warn but proceed
  if (inventory.completeness === "degraded") {
    issues.push({
      code: ValidationCodes.CONFLICT_INVENTORY_DEGRADED,
      severity: "warning",
      message:
        "Conflict inventory is degraded — some changes could not be fully hydrated. " +
        (inventory.warnings.length > 0
          ? `Reasons: ${inventory.warnings.join("; ")}`
          : "Partial data only."),
      path: "deltas",
      details: {
        completeness: inventory.completeness,
        source: inventory.source,
        warnings: inventory.warnings,
      },
    });
  }

  // Non-conclusive inventory → warn but never allow a clean/pass verdict
  if (inventory.completeness === "non-conclusive") {
    issues.push({
      code: ValidationCodes.CONFLICT_INVENTORY_DEGRADED,
      severity: "warning",
      message:
        "Conflict inventory is non-conclusive — peer capabilities could not be fully established (deadline or truncation). " +
        (inventory.warnings.length > 0
          ? `Reasons: ${inventory.warnings.join("; ")}`
          : "Insufficient data to conclude."),
      path: "deltas",
      details: {
        completeness: inventory.completeness,
        source: inventory.source,
        warnings: inventory.warnings,
        canConcludeClean: inventory.canConcludeClean ?? false,
      },
    });
  }

  // Emit each inventory warning as a distinct validation warning
  for (const warning of inventory.warnings) {
    issues.push({
      code: ValidationCodes.CONFLICT_INVENTORY_WARNING,
      severity: "warning",
      message: `Conflict inventory warning: ${warning}`,
      path: "deltas",
      details: {
        source: inventory.source,
        warning,
      },
    });
  }

  // Get capabilities this change touches
  const thisCapabilities = new Set(Object.keys(change.deltas));

  // Check against other changes in the inventory
  for (const entry of inventory.entries) {
    // Skip self
    if (entry.isOwnChange || entry.id === change.id) continue;

    // Archived changes are related context, not authority
    if (entry.isArchived) continue;

    // Skip entries whose capabilities were not exposed by the Store; the
    // inventory completeness/warnings already account for them.
    if (!entry.capabilities) continue;

    // Find overlapping capabilities
    const overlapping = entry.capabilities.filter((cap) =>
      thisCapabilities.has(cap),
    );

    if (overlapping.length > 0) {
      const details: Record<string, unknown> = {
        otherChangeId: entry.id,
        otherChangeTitle: entry.title,
        otherChangeStatus: entry.status,
        overlappingCapabilities: overlapping,
        source: inventory.source,
      };
      if (entry.epic) {
        details.epicId = entry.epic.id;
        details.epicTitle = entry.epic.title;
        details.epicEntryId = entry.epic.entry_id;
      }
      issues.push({
        code: ValidationCodes.OVERLAPPING_CAPABILITY,
        severity: "warning",
        message: `Change "${entry.title}" (${entry.id}) also modifies: ${overlapping.join(", ")}`,
        path: "deltas",
        details,
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
function checkIntraDeltaConflicts(change: Change): ValidationIssue[] {
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
