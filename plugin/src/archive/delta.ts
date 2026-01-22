/**
 * Delta Application
 *
 * Applies deltas (add/modify/remove) to specs.
 */

import type { Spec, Delta } from "../types";
import type { DeltaApplicationResult, SpecUpdateResult } from "./types";

/**
 * Apply a single delta to a spec.
 * Mutates the spec in place.
 */
export function applyDelta(spec: Spec, delta: Delta): DeltaApplicationResult {
  switch (delta.operation) {
    case "add":
      return applyAddDelta(spec, delta);
    case "modify":
      return applyModifyDelta(spec, delta);
    case "remove":
      return applyRemoveDelta(spec, delta);
    default:
      return {
        success: false,
        deltaId: (delta as Delta).id,
        operation: (delta as Delta).operation,
        error: `Unknown operation: ${(delta as Delta).operation}`,
      };
  }
}

/**
 * Apply an "add" delta - adds a new requirement to the spec.
 */
function applyAddDelta(
  spec: Spec,
  delta: Extract<Delta, { operation: "add" }>,
): DeltaApplicationResult {
  const { requirement } = delta;

  // Check for duplicate ID
  const existing = spec.requirements.find((r) => r.id === requirement.id);
  if (existing) {
    return {
      success: false,
      deltaId: delta.id,
      operation: "add",
      error: `Requirement "${requirement.id}" already exists in spec`,
    };
  }

  // Add the requirement
  spec.requirements.push({ ...requirement });

  return {
    success: true,
    deltaId: delta.id,
    operation: "add",
    newId: requirement.id,
  };
}

/**
 * Apply a "modify" delta - updates an existing requirement.
 */
function applyModifyDelta(
  spec: Spec,
  delta: Extract<Delta, { operation: "modify" }>,
): DeltaApplicationResult {
  const { target_id, changes } = delta;

  // Find the requirement
  const reqIndex = spec.requirements.findIndex((r) => r.id === target_id);
  if (reqIndex === -1) {
    return {
      success: false,
      deltaId: delta.id,
      operation: "modify",
      targetId: target_id,
      error: `Requirement "${target_id}" not found in spec`,
    };
  }

  // Apply changes (shallow merge)
  spec.requirements[reqIndex] = {
    ...spec.requirements[reqIndex],
    ...changes,
  };

  return {
    success: true,
    deltaId: delta.id,
    operation: "modify",
    targetId: target_id,
  };
}

/**
 * Apply a "remove" delta - removes a requirement from the spec.
 */
function applyRemoveDelta(
  spec: Spec,
  delta: Extract<Delta, { operation: "remove" }>,
): DeltaApplicationResult {
  const { target_id } = delta;

  // Find the requirement
  const reqIndex = spec.requirements.findIndex((r) => r.id === target_id);
  if (reqIndex === -1) {
    return {
      success: false,
      deltaId: delta.id,
      operation: "remove",
      targetId: target_id,
      error: `Requirement "${target_id}" not found in spec`,
    };
  }

  // Remove the requirement
  spec.requirements.splice(reqIndex, 1);

  return {
    success: true,
    deltaId: delta.id,
    operation: "remove",
    targetId: target_id,
  };
}

/**
 * Apply multiple deltas to a spec.
 * Stops on first error. Mutates the spec in place.
 */
export function applyDeltasToSpec(
  spec: Spec,
  deltas: Delta[],
  currentVersion: string,
): SpecUpdateResult {
  const deltaResults: DeltaApplicationResult[] = [];
  let hasAdd = false;
  let hasModify = false;

  for (const delta of deltas) {
    const result = applyDelta(spec, delta);
    deltaResults.push(result);

    if (!result.success) {
      // Stop on first error
      break;
    }

    if (delta.operation === "add") hasAdd = true;
    if (delta.operation === "modify") hasModify = true;
  }

  // Calculate new version
  const newVersion = bumpVersion(currentVersion, hasAdd, hasModify);

  // Update spec metadata
  spec.version = newVersion;
  spec.updated_at = new Date().toISOString();

  return {
    capability: spec.name,
    originalVersion: currentVersion,
    newVersion,
    deltaResults,
    updatedSpec: deltaResults.every((r) => r.success) ? spec : undefined,
  };
}

/**
 * Bump semantic version based on changes.
 * - Add operations bump minor (feature)
 * - Modify/Remove operations bump patch (fix)
 */
function bumpVersion(
  version: string,
  hasAdd: boolean,
  hasModify: boolean,
): string {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3) {
    // Invalid version, return as-is with suffix
    return `${version}-updated`;
  }

  const [major, minor, patch] = parts;

  if (hasAdd) {
    // Minor bump for new features
    return `${major}.${minor + 1}.0`;
  } else if (hasModify) {
    // Patch bump for modifications
    return `${major}.${minor}.${patch + 1}`;
  }

  // No changes? Just bump patch
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * Create a new spec from deltas (for new capabilities).
 */
export function createSpecFromDeltas(
  capability: string,
  deltas: Delta[],
): { spec: Spec; result: SpecUpdateResult } {
  // Create empty spec
  const spec: Spec = {
    name: capability,
    title: formatTitle(capability),
    purpose: `Capability: ${formatTitle(capability)}`,
    version: "0.0.0",
    updated_at: new Date().toISOString(),
    requirements: [],
  };

  // Apply deltas
  const result = applyDeltasToSpec(spec, deltas, "0.0.0");

  // Set initial version
  spec.version = "1.0.0";
  result.newVersion = "1.0.0";

  return { spec, result };
}

/**
 * Format a kebab-case capability name as a title.
 */
function formatTitle(capability: string): string {
  return capability
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
