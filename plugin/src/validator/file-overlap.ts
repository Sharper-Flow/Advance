/**
 * File-Overlap Validator
 *
 * Scans peer worktrees for file-path intersections with the current change's
 * planned touched_files. Surfaces potential merge-conflict warnings before
 * autonomous execution begins.
 *
 * Spec anchors:
 * - rq-worktreeRegistry01 (state authority lives in ProjectWorkflowState)
 * - rq-multiSessionCoordination01 (Temporal serializes peer-session writes)
 */

import {
  initStateDb,
  listWorktrees,
  getChangeSummaries,
  type WorktreeStateAccess,
} from "../tools/worktree/state";

export interface OverlapMatch {
  peerBranch: string;
  peerChangeId: string;
  overlappingFiles: string[];
}

export interface FileOverlapResult {
  overlaps: OverlapMatch[];
  scannedPeers: number;
  /** Set when project workflow is unreachable; consumers fall back gracefully. */
  unavailable?: true;
}

export interface FileOverlapDeps {
  registry?: Array<{ branch: string; path: string; changeId?: string }>;
  changeSummaries?: Record<string, { touched_files?: string[]; status?: string }>;
  currentBranch?: string;
}

/**
 * Scan for file-path overlaps between the current change's planned
 * touched_files and peer worktrees' active changes.
 *
 * @param projectRoot       — absolute path to the project main checkout
 * @param plannedTouchedFiles — repo-relative paths this change plans to touch
 * @param opts              — optional dependency injection (for tests) or
 *                            currentBranch override
 *
 * When `opts.registry` and `opts.changeSummaries` are both supplied, the
 * function skips Temporal I/O and uses the injected snapshots directly.
 * Otherwise it resolves workflow access via `initStateDb` and reads the
 * live `worktree_registry` + `change_summaries` from the project workflow.
 */
export async function scanFileOverlaps(
  projectRoot: string,
  plannedTouchedFiles: string[],
  opts: FileOverlapDeps = {},
): Promise<FileOverlapResult> {
  let registry: Array<{ branch: string; path: string; changeId?: string }>;
  let summaries: Record<string, { touched_files?: string[]; status?: string }>;

  if (opts.registry !== undefined && opts.changeSummaries !== undefined) {
    registry = opts.registry;
    summaries = opts.changeSummaries;
  } else {
    try {
      const access = await initStateDb(projectRoot);
      const [wt, cs] = await Promise.all([
        listWorktrees(access),
        getChangeSummaries(access),
      ]);
      registry = wt;
      summaries = cs as Record<
        string,
        { touched_files?: string[]; status?: string }
      >;
    } catch {
      return { overlaps: [], scannedPeers: 0, unavailable: true };
    }
  }

  const currentBranch = opts.currentBranch;
  const overlaps: OverlapMatch[] = [];
  let scannedPeers = 0;

  for (const wt of registry) {
    if (currentBranch && wt.branch === currentBranch) continue;
    const changeId = wt.changeId;
    if (!changeId) continue;

    const summary = summaries[changeId];
    if (!summary) continue;
    if (summary.status === "archived") continue;

    const peerFiles = summary.touched_files ?? [];
    const intersection = plannedTouchedFiles.filter((f) =>
      peerFiles.includes(f),
    );

    if (intersection.length > 0) {
      overlaps.push({
        peerBranch: wt.branch,
        peerChangeId: changeId,
        overlappingFiles: intersection,
      });
    }
    scannedPeers++;
  }

  return { overlaps, scannedPeers };
}
