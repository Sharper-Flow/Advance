/**
 * Shared porcelain parser for `git worktree list --porcelain`.
 *
 * Extracted from triage.ts so archive-helpers can reuse the same parser
 * without importing triage-specific state logic.
 */

export interface DiskWorktree {
  path: string;
  branch?: string;
}

/**
 * Parse `git worktree list --porcelain` output. Each worktree block is
 * separated by a blank line; the first line of each block is `worktree
 * <path>`, followed by `HEAD <sha>` and either `branch refs/heads/<name>`
 * or `detached`.
 */
export function parseWorktreeListPorcelain(stdout: string): DiskWorktree[] {
  const worktrees: DiskWorktree[] = [];
  const blocks = stdout.split(/\n\n/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    let path: string | undefined;
    let branch: string | undefined;
    for (const line of block.split("\n")) {
      if (line.startsWith("worktree ")) {
        path = line.slice("worktree ".length).trim();
      } else if (line.startsWith("branch refs/heads/")) {
        branch = line.slice("branch refs/heads/".length).trim();
      }
    }
    if (path) worktrees.push({ path, branch });
  }
  return worktrees;
}
