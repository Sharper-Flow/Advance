/**
 * Work-graph edge validation — pre-flight check for edge-adding mutations.
 *
 * Validates that adding edges from `sourceRef` to `newEdges` is safe:
 * no self-edges, no duplicates, no unresolved same-project targets, no cycles.
 *
 * Used by Phase D mutation-time enforcement at every edge-writing ingress:
 * adv_epic_add_shell, adv_epic_promote_shell, adv_change_create.
 *
 * rq-workGraphTypes01 (addDependencyAwareResume) — Phase C
 */

import type { WorkNodeRef } from "../types/work-graph";
import { detectCycles } from "./cycle-detect";

// =============================================================================
// Typed error results (mirror Phase A schemas)
// =============================================================================

export type EdgeValidationError =
  | {
      code: "INVALID_WORK_NODE_REF";
      reason: "self_edge" | "duplicate_ref" | "malformed";
      ref?: WorkNodeRef;
    }
  | { code: "UNRESOLVED_DEPENDENCY"; ref: WorkNodeRef }
  | { code: "DEPENDENCY_CYCLE"; cycle_path: WorkNodeRef[] };

// =============================================================================
// Helpers
// =============================================================================

/**
 * Stable string key for a WorkNodeRef. Exported for reuse by Phase D
 * and consumers that need to build resolvableNodeKeys sets.
 */
export function nodeRefKey(ref: WorkNodeRef): string {
  return ref.kind === "epic_entry"
    ? `epic_entry:${ref.epic_id}/${ref.entry_id}`
    : `change:${ref.project_id}/${ref.change_id}`;
}

/**
 * Structural equality check for two WorkNodeRef values.
 */
function refEquals(a: WorkNodeRef, b: WorkNodeRef): boolean {
  return nodeRefKey(a) === nodeRefKey(b);
}

// =============================================================================
// Core validator
// =============================================================================

/**
 * Validate adding edges from `sourceRef` to each ref in `newEdges`.
 *
 * Checks are performed in order; the first failure short-circuits:
 * 1. Self-edge: any newEdge === sourceRef
 * 2. Duplicate ref: any newEdge appears twice in the batch, or already exists
 *    in the source's existing deps
 * 3. Unresolved target: any newEdge key is not in `resolvableNodeKeys`
 * 4. Cycle: adding the edges creates a cycle (via iterative DFS)
 *
 * @param sourceRef - The node adding the edges (dependent)
 * @param newEdges - The edges being added (dependencies)
 * @param resolvableNodeKeys - Set of nodeRefKey strings for all nodes in scope
 * @param getDeps - Returns existing deps for a given node key
 * @returns `null` if valid, or the first `EdgeValidationError`
 */
export function validateEdgeAdd(
  sourceRef: WorkNodeRef,
  newEdges: WorkNodeRef[],
  resolvableNodeKeys: Set<string>,
  getDeps: (key: string) => WorkNodeRef[],
): EdgeValidationError | null {
  if (newEdges.length === 0) return null;

  const sourceKey = nodeRefKey(sourceRef);

  // -------------------------------------------------------------------------
  // Check 1: Self-edge.
  // -------------------------------------------------------------------------
  for (const edge of newEdges) {
    if (refEquals(edge, sourceRef)) {
      return { code: "INVALID_WORK_NODE_REF", reason: "self_edge", ref: edge };
    }
  }

  // -------------------------------------------------------------------------
  // Check 2: Duplicate ref (within batch or against existing deps).
  // -------------------------------------------------------------------------
  const seenInBatch = new Set<string>();
  for (const edge of newEdges) {
    const key = nodeRefKey(edge);
    if (seenInBatch.has(key)) {
      return {
        code: "INVALID_WORK_NODE_REF",
        reason: "duplicate_ref",
        ref: edge,
      };
    }
    seenInBatch.add(key);
  }

  const existingDeps = getDeps(sourceKey);
  for (const edge of newEdges) {
    const edgeKey = nodeRefKey(edge);
    if (existingDeps.some((d) => nodeRefKey(d) === edgeKey)) {
      return {
        code: "INVALID_WORK_NODE_REF",
        reason: "duplicate_ref",
        ref: edge,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Check 3: Unresolved same-project target.
  // -------------------------------------------------------------------------
  for (const edge of newEdges) {
    const key = nodeRefKey(edge);
    if (!resolvableNodeKeys.has(key)) {
      return { code: "UNRESOLVED_DEPENDENCY", ref: edge };
    }
  }

  // -------------------------------------------------------------------------
  // Check 4: Cycle detection.
  //
  // Build a temporary adjacency map that includes the new edges, then run
  // detectCycles. The source node and ALL reachable nodes must be in the
  // node set for the cycle check to traverse transitive dependencies
  // correctly.
  // -------------------------------------------------------------------------

  // Collect all nodes reachable from the source (including through the new
  // edges and any transitive dependencies). Iterative traversal avoids
  // recursion depth limits and ensures we discover cycles through chained
  // prerequisites.
  const allNodes: WorkNodeRef[] = [sourceRef];
  const allNodeKeys = new Set<string>([sourceKey]);

  const addIfNew = (ref: WorkNodeRef) => {
    const key = nodeRefKey(ref);
    if (!allNodeKeys.has(key)) {
      allNodeKeys.add(key);
      allNodes.push(ref);
    }
  };

  for (const edge of newEdges) addIfNew(edge);
  for (const dep of existingDeps) addIfNew(dep);

  // Follow dependencies transitively from every node we've collected.
  const queue: WorkNodeRef[] = [...allNodes];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    const currentKey = nodeRefKey(current);
    const deps =
      currentKey === sourceKey
        ? [...existingDeps, ...newEdges]
        : getDeps(currentKey);
    for (const dep of deps) {
      if (!allNodeKeys.has(nodeRefKey(dep))) {
        addIfNew(dep);
        queue.push(dep);
      }
    }
  }

  // Build adjacency: for each node, its deps (with the new edges added to source).
  const tempDeps = new Map<string, WorkNodeRef[]>();
  for (const node of allNodes) {
    const key = nodeRefKey(node);
    if (key === sourceKey) {
      // Source node: existing deps + new edges.
      tempDeps.set(key, [...existingDeps, ...newEdges]);
    } else {
      tempDeps.set(key, getDeps(key));
    }
  }

  const { cycles } = detectCycles<WorkNodeRef>(
    allNodes,
    (ref) => tempDeps.get(nodeRefKey(ref)) ?? [],
    nodeRefKey,
  );

  if (cycles.length > 0) {
    return { code: "DEPENDENCY_CYCLE", cycle_path: cycles[0] };
  }

  return null;
}
