import { parseWorktreeListPorcelain } from "../tools/worktree/porcelain-parser";

/** Parse worktree paths from canonical Git worktree output. */
export function parseWorktreePaths(porcelain: string): string[] {
  return parseWorktreeListPorcelain(porcelain).map((entry) => entry.path);
}

/** One record of canonical Git worktree output. */
export interface WorktreeTopologyEntry {
  path: string;
  /** The first porcelain record is the repository's main (non-linked) checkout. */
  isMain: boolean;
  /**
   * Stale administrative data (missing directory or invalid gitdir). A
   * prunable entry names a checkout git no longer trusts; it must not confer
   * worktree eligibility on write targets.
   */
  prunable: boolean;
}

/**
 * Parse canonical Git worktree output into structured topology records.
 */
export function parseWorktreeTopology(
  porcelain: string,
): WorktreeTopologyEntry[] {
  return parseWorktreeListPorcelain(porcelain).map((entry, index) => ({
    path: entry.path,
    isMain: index === 0,
    prunable: entry.prunable ?? false,
  }));
}
