/** Parse worktree paths from `git worktree list --porcelain` output. */
export function parseWorktreePaths(porcelain: string): string[] {
  const paths: string[] = [];
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) {
      paths.push(line.substring("worktree ".length));
    }
  }
  return paths;
}

/** One record of `git worktree list --porcelain` output. */
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
 * Parse `git worktree list --porcelain` output into structured topology
 * records, preserving main-vs-linked position and the `prunable` attribute
 * that `parseWorktreePaths` discards.
 */
export function parseWorktreeTopology(
  porcelain: string,
): WorktreeTopologyEntry[] {
  const entries: WorktreeTopologyEntry[] = [];
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) {
      entries.push({
        path: line.substring("worktree ".length),
        isMain: entries.length === 0,
        prunable: false,
      });
    } else if (line.startsWith("prunable") && entries.length > 0) {
      entries[entries.length - 1].prunable = true;
    }
  }
  return entries;
}
