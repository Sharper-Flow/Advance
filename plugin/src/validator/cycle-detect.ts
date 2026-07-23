/**
 * Cycle detection + topological sort helper.
 *
 * Extracted from `merge-order.ts` (Kahn's algorithm + DFS three-color),
 * converted from recursive DFS to ITERATIVE DFS with explicit stack frames
 * (DDC2 — 10k-node scale without stack overflow). Returns CLOSED cycle paths
 * `[A,B,A]` (cycle-start node repeated at the end) for unambiguous diagnostics.
 *
 * Shared by:
 * - `merge-order.ts` — archive merge-order topological sort + cycle surfacing
 * - `work-graph-validation.ts` (Phase C) — edge-addition cycle rejection
 *
 * rq-workGraphTypes01 (addDependencyAwareResume) — Phase B
 */

/**
 * Result of cycle detection + topological sort.
 *
 * @typeParam T - Node type
 */
export interface CycleDetectionResult<T> {
  /** Topologically sorted nodes (all nodes if acyclic; acyclic subset if cycle). */
  sorted: T[];
  /** Detected cycles as CLOSED paths `[A,B,A]`. Empty if acyclic. */
  cycles: T[][];
}

/**
 * Kahn's algorithm for topological sort + iterative DFS three-color for
 * explicit cycle-path extraction.
 *
 * @param nodes - All nodes in the graph (determines iteration order)
 * @param getDeps - Returns the nodes that `node` depends on (edges point
 *   dependent → dependency)
 * @param getKey - Optional key function for non-primitive nodes. Defaults to
 *   `String(node)`. Must produce a unique string per distinct node.
 * @returns `{ sorted, cycles }` — `sorted` is topological order (dependencies
 *   first); `cycles` are closed-path arrays `[A,B,A]`
 *
 * @example
 * ```ts
 * // String nodes: A depends on B, B depends on C.
 * const { sorted, cycles } = detectCycles(["A", "B", "C"], (n) =>
 *   n === "A" ? ["B"] : n === "B" ? ["C"] : []
 * );
 * // sorted: ["C", "B", "A"], cycles: []
 * ```
 */
export function detectCycles<T>(
  nodes: T[],
  getDeps: (node: T) => Iterable<T>,
  getKey: (node: T) => string = (n) => String(n),
): CycleDetectionResult<T> {
  if (nodes.length === 0) {
    return { sorted: [], cycles: [] };
  }

  // -------------------------------------------------------------------------
  // Phase 1: Kahn's algorithm for topological sort.
  // -------------------------------------------------------------------------
  const nodeKeys = new Set(nodes.map(getKey));
  const keyToNode = new Map<string, T>();
  for (const node of nodes) {
    keyToNode.set(getKey(node), node);
  }

  // Build in-degree map and forward adjacency (dependency → dependents).
  const inDegree = new Map<string, number>();
  const forwardAdjacency = new Map<string, Set<string>>();
  for (const node of nodes) {
    const key = getKey(node);
    inDegree.set(key, 0);
    forwardAdjacency.set(key, new Set());
  }

  for (const node of nodes) {
    const key = getKey(node);
    for (const dep of getDeps(node)) {
      const depKey = getKey(dep);
      // Only count edges to nodes within the graph. Self-edges ARE counted
      // (they make the node unsortable → flagged as a cycle by DFS).
      if (!nodeKeys.has(depKey)) continue;
      forwardAdjacency.get(depKey)!.add(key);
      inDegree.set(key, (inDegree.get(key) ?? 0) + 1);
    }
  }

  // Initialize queue with in-degree-0 nodes (preserving input order).
  const kahnQueue: string[] = [];
  for (const node of nodes) {
    const key = getKey(node);
    if ((inDegree.get(key) ?? 0) === 0) {
      kahnQueue.push(key);
    }
  }

  const sortedKeys: string[] = [];
  while (kahnQueue.length > 0) {
    const current = kahnQueue.shift()!;
    sortedKeys.push(current);
    for (const dependent of forwardAdjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) kahnQueue.push(dependent);
    }
  }

  // If all nodes are sorted, the graph is acyclic.
  if (sortedKeys.length === nodes.length) {
    return {
      sorted: sortedKeys.map((k) => keyToNode.get(k)!),
      cycles: [],
    };
  }

  // -------------------------------------------------------------------------
  // Phase 2: Iterative DFS three-color for explicit cycle-path extraction.
  //
  // Converted from the recursive `dfs()` in the original merge-order.ts to an
  // iterative form with explicit stack frames. Each frame tracks the current
  // neighbor index, enabling the same enter/exit semantics as recursion without
  // consuming call-stack depth (DDC2 — safe at 10k+ nodes).
  // -------------------------------------------------------------------------

  const visited = new Set<string>();
  const cycles: T[][] = [];

  for (const startNode of nodes) {
    const startKey = getKey(startNode);
    if (visited.has(startKey)) continue;

    const recStack = new Set<string>();
    const path: T[] = [];

    // Each stack frame: { key, deps (resolved keys), depIndex }
    interface StackFrame {
      node: T;
      key: string;
      depKeys: string[];
      depIndex: number;
    }
    const stack: StackFrame[] = [];

    // Enter start node.
    visited.add(startKey);
    recStack.add(startKey);
    path.push(startNode);
    stack.push({
      node: startNode,
      key: startKey,
      depKeys: resolveDepKeys(startNode, getDeps, getKey, nodeKeys),
      depIndex: 0,
    });

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];

      if (frame.depIndex < frame.depKeys.length) {
        const depKey = frame.depKeys[frame.depIndex];
        frame.depIndex++;

        if (!visited.has(depKey)) {
          // Enter unvisited neighbor.
          const depNode = keyToNode.get(depKey)!;
          visited.add(depKey);
          recStack.add(depKey);
          path.push(depNode);
          stack.push({
            node: depNode,
            key: depKey,
            depKeys: resolveDepKeys(depNode, getDeps, getKey, nodeKeys),
            depIndex: 0,
          });
        } else if (recStack.has(depKey)) {
          // Back-edge found — cycle detected. Extract CLOSED path.
          const cycleStartIdx = path.findIndex((n) => getKey(n) === depKey);
          const cyclePath = path.slice(cycleStartIdx);
          // Close the cycle: repeat the cycle-start node at the end [A,B,A].
          cyclePath.push(keyToNode.get(depKey)!);
          cycles.push(cyclePath);
        }
        // else: cross/forward edge to a visited node not in recStack — no cycle.
      } else {
        // All neighbors processed — exit node.
        stack.pop();
        recStack.delete(frame.key);
        path.pop();
      }
    }
  }

  return {
    sorted: sortedKeys.map((k) => keyToNode.get(k)!),
    cycles,
  };
}

/**
 * Resolve a node's dependencies to in-graph key strings, filtering out
 * self-references and out-of-graph targets.
 */
function resolveDepKeys<T>(
  node: T,
  getDeps: (node: T) => Iterable<T>,
  getKey: (node: T) => string,
  nodeKeys: Set<string>,
): string[] {
  const result: string[] = [];
  for (const dep of getDeps(node)) {
    const depKey = getKey(dep);
    // Keep self-edges — DFS detects them as back-edges (cycle [A,A]).
    if (!nodeKeys.has(depKey)) continue;
    result.push(depKey);
  }
  return result;
}
