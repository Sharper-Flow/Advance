/**
 * Delta Application
 *
 * Applies deltas (add/modify/remove/rename) to specs.
 */

import type { Spec, Delta } from "../types";
import { appendDebugLog, createLogger } from "../utils/debug-log";

const logger = createLogger("delta");
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
    case "rename":
      return applyRenameDelta(spec, delta);
    default: {
      const _exhaustive: never = delta;
      return {
        success: false,
        deltaId: (_exhaustive as Delta).id,
        operation: (_exhaustive as Delta).operation,
        error: `Unknown operation: ${(_exhaustive as Delta).operation}`,
      };
    }
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
 * Apply a "rename" delta - renames a requirement's title and optionally its ID.
 * Preserves all other fields on the requirement.
 */
function applyRenameDelta(
  spec: Spec,
  delta: Extract<Delta, { operation: "rename" }>,
): DeltaApplicationResult {
  const { target_id, new_title, new_id } = delta;

  // Find the requirement
  const reqIndex = spec.requirements.findIndex((r) => r.id === target_id);
  if (reqIndex === -1) {
    return {
      success: false,
      deltaId: delta.id,
      operation: "rename",
      targetId: target_id,
      error: `Requirement "${target_id}" not found in spec`,
    };
  }

  // If new_id is provided, check it doesn't already exist
  if (new_id && new_id !== target_id) {
    const existing = spec.requirements.find((r) => r.id === new_id);
    if (existing) {
      return {
        success: false,
        deltaId: delta.id,
        operation: "rename",
        targetId: target_id,
        error: `Requirement ID "${new_id}" already exists in spec`,
      };
    }
  }

  // Apply rename: update title, optionally update ID
  spec.requirements[reqIndex] = {
    ...spec.requirements[reqIndex],
    title: new_title,
    ...(new_id ? { id: new_id } : {}),
  };

  return {
    success: true,
    deltaId: delta.id,
    operation: "rename",
    targetId: target_id,
    ...(new_id ? { newId: new_id } : {}),
  };
}

/**
 * Log the result of applying a single delta.
 * Emits structured info for observability/debugging.
 */
function logDeltaResult(
  specName: string,
  delta: Delta,
  result: DeltaApplicationResult,
): void {
  const base = {
    spec: specName,
    deltaId: delta.id,
    operation: delta.operation,
    success: result.success,
  };

  if (!result.success) {
    logger.warn(`delta failed: ${JSON.stringify({ ...base, error: result.error })}`);
    return;
  }

  // Build operation-specific details
  const details: Record<string, unknown> = {};
  if (delta.operation === "rename") {
    const r = delta as Extract<Delta, { operation: "rename" }>;
    details.targetId = r.target_id;
    details.newTitle = r.new_title;
    if (r.new_id) details.newId = r.new_id;
  } else if (delta.operation === "modify") {
    const m = delta as Extract<Delta, { operation: "modify" }>;
    details.targetId = m.target_id;
    details.changedKeys = Object.keys(m.changes);
  } else if (delta.operation === "remove") {
    details.targetId = (
      delta as Extract<Delta, { operation: "remove" }>
    ).target_id;
  } else if (delta.operation === "add") {
    details.newId = (
      delta as Extract<Delta, { operation: "add" }>
    ).requirement.id;
  }

  appendDebugLog("delta", JSON.stringify({ ...base, ...details }));
}

/**
 * Canonical delta application order.
 * Renames first (so subsequent ops can reference new IDs),
 * then removes, then modifies, then adds last.
 */
const DELTA_ORDER: Record<string, number> = {
  rename: 0,
  remove: 1,
  modify: 2,
  add: 3,
};

/**
 * Sort deltas into canonical application order.
 * Returns a new array; does not mutate the input.
 */
function sortDeltas(deltas: Delta[]): Delta[] {
  return [...deltas].sort(
    (a, b) =>
      (DELTA_ORDER[a.operation] ?? 99) - (DELTA_ORDER[b.operation] ?? 99),
  );
}

/**
 * Apply multiple deltas to a spec.
 * Deltas are sorted into canonical order (rename → remove → modify → add)
 * before application. Stops on first error. Mutates the spec in place.
 */
export function applyDeltasToSpec(
  spec: Spec,
  deltas: Delta[],
  currentVersion: string,
): SpecUpdateResult {
  const sorted = sortDeltas(deltas);
  const deltaResults: DeltaApplicationResult[] = [];
  let hasAdd = false;
  let hasModify = false;
  let hasRenameOrRemove = false;

  for (const delta of sorted) {
    const result = applyDelta(spec, delta);
    deltaResults.push(result);

    // Structured log for delta application
    logDeltaResult(spec.name, delta, result);

    if (!result.success) {
      // Stop on first error
      break;
    }

    if (delta.operation === "add") hasAdd = true;
    if (delta.operation === "modify") hasModify = true;
    if (delta.operation === "rename" || delta.operation === "remove")
      hasRenameOrRemove = true;
  }

  const allSucceeded = deltaResults.every((r) => r.success);

  // Only update metadata when the batch fully succeeds.
  // Failed batches may have partially mutated requirement content before the
  // first error, but version metadata should not imply a successful update.
  const newVersion = allSucceeded
    ? bumpVersion(currentVersion, hasAdd, hasModify || hasRenameOrRemove)
    : currentVersion;

  if (allSucceeded) {
    spec.version = newVersion;
    spec.updated_at = new Date().toISOString();
  }

  return {
    capability: spec.name,
    originalVersion: currentVersion,
    newVersion,
    deltaResults,
    updatedSpec: allSucceeded ? spec : undefined,
  };
}

/**
 * Bump semantic version based on changes.
 * - Add operations bump minor (feature)
 * - Modify/Remove/Rename operations bump patch (fix/identity change)
 */
function bumpVersion(
  version: string,
  hasAdd: boolean,
  hasPatchChange: boolean,
): string {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) {
    // Invalid version (wrong part count or non-numeric segment), return as-is
    return `${version}-updated`;
  }

  const [major, minor, patch] = parts;

  if (hasAdd) {
    // Minor bump for new features
    return `${major}.${minor + 1}.0`;
  } else if (hasPatchChange) {
    // Patch bump for modifications, removals, renames
    return `${major}.${minor}.${patch + 1}`;
  }

  // Fallback: all deltas failed (stopped on first error) but version
  // metadata still updates. Bump patch as a conservative default.
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
    $schema:
      "https://raw.githubusercontent.com/anomalyco/oc-plugins/main/advance/plugin/schemas/spec.schema.json",
    name: capability,
    title: formatTitle(capability),
    purpose: `Capability: ${formatTitle(capability)}`,
    version: "0.0.0",
    updated_at: new Date().toISOString(),
    requirements: [],
  };

  // Apply deltas
  const result = applyDeltasToSpec(spec, deltas, "0.0.0");

  // Only set initial version if at least one delta succeeded.
  // If all deltas fail (e.g. modify targeting non-existent req),
  // reset to 0.0.0 — persisting a bumped-but-empty spec would be misleading.
  const anyApplied = result.deltaResults.some((r) => r.success);
  if (anyApplied) {
    spec.version = "1.0.0";
    result.newVersion = "1.0.0";
  } else {
    spec.version = "0.0.0";
    result.newVersion = "0.0.0";
  }

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
