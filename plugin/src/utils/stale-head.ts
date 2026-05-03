/**
 * Stale-HEAD Detection (T14 — KD-5 #2 detection layer).
 *
 * Detects the failure mode where a worktree (or main checkout) has its
 * `HEAD` on a branch that has already been merged into the default branch
 * AND deleted from the remote. Such a branch is conceptually retired but
 * the local checkout is still pointing at it — the next `worktree_create`
 * basis-of-fork or rebase will silently use stale state.
 *
 * **Warn-only.** This module never mutates branch state; the caller emits
 * a `[ADV:WARN]` and proceeds. Recovery is the user's responsibility.
 *
 * Acceptance test #6 (partial). Detection layer here; create-time block
 * lives in T10 (`adv_worktree_create`) once it lands.
 *
 * Citations: rq-worktreeRegistry01 (state authority), rq-multiSessionFraming01.
 */

import { execGit, getDefaultBranch } from "./git";

export interface StaleHeadResult {
  /** True only when HEAD is on a merged + remote-deleted branch. */
  stale: boolean;
  /** Human-readable reason for the classification (always populated). */
  reason: string;
  /** Suggested remediation command (empty when not stale). */
  suggestion: string;
}

/**
 * Detect whether the current HEAD is on a stale branch.
 *
 * Returns `stale: false` for:
 *   - Detached HEAD (treated as informational, not stale)
 *   - On the default branch
 *   - On a non-default branch whose remote still exists
 *
 * Returns `stale: true` for:
 *   - On a non-default branch that is merged into the default branch AND
 *     whose remote-tracking ref is gone (e.g. PR was merged + remote
 *     branch deleted, leaving a stale local).
 *
 * Best-effort: any git command failure surfaces as `stale: false` with a
 * descriptive reason. Never throws.
 */
export async function detectStaleBranchHead(
  repoRoot: string,
): Promise<StaleHeadResult> {
  let head: string;
  try {
    head = (await execGit(["branch", "--show-current"], repoRoot)).trim();
  } catch (err) {
    return {
      stale: false,
      reason: `branch --show-current failed: ${(err as Error).message}`,
      suggestion: "",
    };
  }

  if (!head) {
    return {
      stale: false,
      reason: "detached HEAD",
      suggestion: "",
    };
  }

  let defaultBranch: string;
  try {
    defaultBranch = await getDefaultBranch(repoRoot);
  } catch {
    defaultBranch = "main";
  }

  if (head === defaultBranch) {
    return {
      stale: false,
      reason: "on default branch",
      suggestion: "",
    };
  }

  let mergedList: string;
  try {
    mergedList = await execGit(["branch", "--merged", defaultBranch], repoRoot);
  } catch {
    return {
      stale: false,
      reason: `on non-default branch "${head}" (merged check failed; treating as live)`,
      suggestion: "",
    };
  }

  // `git branch --merged X` lists branches reachable from X.
  // Each line may be prefixed with "* " (current) or two spaces (other).
  const mergedBranches = mergedList
    .split("\n")
    .map((line) => line.replace(/^\*?\s+/, "").trim())
    .filter((line) => line.length > 0);
  const isMerged = mergedBranches.includes(head);

  if (!isMerged) {
    return {
      stale: false,
      reason: `on non-default branch "${head}" with unmerged commits`,
      suggestion: "",
    };
  }

  let remoteOutput: string;
  try {
    remoteOutput = await execGit(
      ["ls-remote", "--heads", "origin", head],
      repoRoot,
    );
  } catch {
    // ls-remote can fail when offline / no origin / auth issues.
    // Fall through with empty result — treated as "remote unreachable",
    // which we conservatively classify as NOT stale (avoid false positives
    // when the remote is simply unavailable).
    return {
      stale: false,
      reason: `on non-default branch "${head}" (remote unreachable; cannot verify staleness)`,
      suggestion: "",
    };
  }

  const remoteExists = remoteOutput.trim().length > 0;
  if (remoteExists) {
    return {
      stale: false,
      reason: `on non-default branch "${head}" with active remote`,
      suggestion: "",
    };
  }

  return {
    stale: true,
    reason: `branch "${head}" is merged into ${defaultBranch} and remote branch is deleted`,
    suggestion: `git switch ${defaultBranch} && git branch -d ${head}`,
  };
}
