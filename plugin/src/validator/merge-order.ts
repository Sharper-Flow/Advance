/**
 * Merge-Order Validator
 *
 * Computes an advisory merge-order queue for archived-but-not-yet-merged
 * changes from persisted state. Output is informational —
 * /adv-archive Phase 9 still drives the actual merging; this module just
 * suggests the order.
 *
 * Spec anchors:
 * - rq-worktreeRegistry01 (per-change worktree state via the project registry)
 * - rq-multiSessionCoordination01 (peer-session writes use storage locking)
 */

import {
  initStateDb,
  getWorktreeRegistrySnapshot,
} from "../tools/worktree/state";
import { detectCycles } from "./cycle-detect";

export interface MergeOrderEntry {
  changeId: string;
  branch: string;
  touchedFiles: string[];
  /** changeIds this entry depends on (must merge AFTER these). */
  dependsOn: string[];
}

export interface MergeOrderResult {
  /** Topologically ordered list — earlier entries should merge first. */
  queue: MergeOrderEntry[];
  /** Detected cycles (rare; surfaces unresolvable orderings). */
  cycles?: string[][];
  unavailable?: true;
}

export interface MergeOrderDeps {
  changeSummaries?: Record<
    string,
    {
      branch?: string;
      status?: string;
      touched_files?: string[];
      archived_at?: string;
    }
  >;
}

/**
 * Compute an advisory merge-order queue for archived changes.
 *
 * @param projectRoot — absolute path to the project main checkout
 * @param opts        — optional dependency injection (for tests)
 *
 * When `opts.changeSummaries` is supplied, the function skips storage I/O
 * and uses the injected snapshot directly. Otherwise it resolves workflow
 * access via `initStateDb` and reads `change_summaries` from the project
 * workflow.
 *
 * The returned queue is topologically sorted: changes archived earlier
 * that touch overlapping files should merge first. Cycles are detected
 * and reported (rare — only if archive timestamps are identical AND files
 * cross-overlap).
 */
export async function computeMergeOrder(
  projectRoot: string,
  opts: MergeOrderDeps = {},
): Promise<MergeOrderResult> {
  let summaries: Record<
    string,
    {
      branch?: string;
      status?: string;
      touched_files?: string[];
      archived_at?: string;
    }
  >;

  if (opts.changeSummaries !== undefined) {
    summaries = opts.changeSummaries;
  } else {
    try {
      const access = await initStateDb(projectRoot);
      const snapshot = await getWorktreeRegistrySnapshot(access);
      if (snapshot.unavailable) return { queue: [], unavailable: true };
      summaries = snapshot.changeSummaries as Record<
        string,
        {
          branch?: string;
          status?: string;
          touched_files?: string[];
          archived_at?: string;
        }
      >;
    } catch {
      return { queue: [], unavailable: true };
    }
  }

  // Filter to archived entries with archive-time info.
  const archivedEntries = Object.entries(summaries)
    .filter(([, v]) => v.status === "archived")
    .map(([changeId, v]) => ({
      changeId,
      branch: v.branch ?? `change/${changeId}`,
      touchedFiles: v.touched_files ?? [],
      archivedAt: v.archived_at ?? "",
    }));

  if (archivedEntries.length === 0) {
    return { queue: [] };
  }

  // Sort by archived_at ascending (earliest archived first).
  // Entries without archived_at sort to the end (best-effort).
  archivedEntries.sort((a, b) => {
    if (!a.archivedAt && !b.archivedAt) return 0;
    if (!a.archivedAt) return 1;
    if (!b.archivedAt) return -1;
    return a.archivedAt.localeCompare(b.archivedAt);
  });

  // Build dependency graph: later-archived entries depend on earlier-archived
  // entries that touch overlapping files.
  const graph = new Map<string, Set<string>>();
  for (let i = 0; i < archivedEntries.length; i++) {
    const later = archivedEntries[i];
    const deps = new Set<string>();
    for (let j = 0; j < i; j++) {
      const earlier = archivedEntries[j];
      const overlap = later.touchedFiles.some((f) =>
        earlier.touchedFiles.includes(f),
      );
      if (overlap) {
        deps.add(earlier.changeId);
      }
    }
    graph.set(later.changeId, deps);
  }

  // Topological sort + cycle detection via shared helper (rq-workGraphTypes01).
  // The helper combines Kahn's algorithm with iterative DFS three-color,
  // returning closed cycle paths [A,B,A].
  const { sorted, cycles: detectedCycles } = detectCycles(
    archivedEntries.map((e) => e.changeId),
    (id) => Array.from(graph.get(id) ?? []),
  );

  // Build result queue in topological order.
  const resultQueue: MergeOrderEntry[] = sorted.map((changeId) => {
    const entry = archivedEntries.find((e) => e.changeId === changeId)!;
    return {
      changeId: entry.changeId,
      branch: entry.branch,
      touchedFiles: entry.touchedFiles,
      dependsOn: Array.from(graph.get(changeId) ?? []),
    };
  });

  return {
    queue: resultQueue,
    cycles: detectedCycles.length > 0 ? detectedCycles : undefined,
  };
}
