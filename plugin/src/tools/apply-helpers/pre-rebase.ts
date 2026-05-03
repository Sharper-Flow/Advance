/**
 * Pre-execution rebase helper for /adv-apply.
 *
 * Runs per-worktree at the start of /adv-apply, before the task loop.
 * Per-worktree git isolation makes this safe — no cross-session lock needed.
 */

import { execGit, getDefaultBranch } from "../../utils/git";

export type PreRebaseResult =
  | {
      ok: true;
      status: "up_to_date" | "rebased";
      defaultBranch: string;
      commits?: number;
    }
  | {
      ok: false;
      reason:
        | "conflict"
        | "not_a_worktree"
        | "default_branch_unresolvable"
        | "no_remote"
        | "rebase_failed";
      detail: string;
      hint: string;
      conflictFiles?: string[];
    };

export interface PreRebaseDeps {
  resolveDefaultBranch?: (cwd: string) => Promise<string | null>;
  fetchOrigin?: (
    cwd: string,
    branch: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  rebase?: (
    cwd: string,
    ontoRef: string,
  ) => Promise<{ ok: boolean; conflictFiles?: string[]; error?: string }>;
  isAhead?: (cwd: string, branch: string, ontoRef: string) => Promise<boolean>;
  isWorktree?: (cwd: string) => Promise<boolean>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Run a pre-execution rebase to keep the change branch fresh against origin.
 *
 * × Local-only — does not push or modify origin.
 * × Requires a clean worktree (enforced by apply pre-flight elsewhere).
 */
export async function preExecutionRebase(
  worktreePath: string,
  opts: PreRebaseDeps = {},
): Promise<PreRebaseResult> {
  const resolveDefaultBranch = opts.resolveDefaultBranch ?? getDefaultBranch;
  const fetchOrigin = opts.fetchOrigin ?? defaultFetchOrigin;
  const rebase = opts.rebase ?? defaultRebase;
  const isAhead = opts.isAhead ?? defaultIsAhead;
  const isWorktree = opts.isWorktree ?? defaultIsWorktree;

  // 1. Resolve default branch
  let defaultBranch: string;
  try {
    const resolved = await resolveDefaultBranch(worktreePath);
    if (!resolved) {
      return {
        ok: false,
        reason: "default_branch_unresolvable",
        detail: "Could not determine the default branch for this repository.",
        hint: "Ensure the repository has a remote origin or set init.defaultBranch.",
      };
    }
    defaultBranch = resolved;
  } catch {
    return {
      ok: false,
      reason: "default_branch_unresolvable",
      detail: "Could not determine the default branch for this repository.",
      hint: "Ensure the repository has a remote origin or set init.defaultBranch.",
    };
  }

  // 2. Verify this is a git worktree
  const worktreeOk = await isWorktree(worktreePath);
  if (!worktreeOk) {
    return {
      ok: false,
      reason: "not_a_worktree",
      detail: `Path is not a git worktree: ${worktreePath}`,
      hint: "Ensure the path is a valid git worktree.",
    };
  }

  // 3. Fetch origin — best-effort
  const fetchResult = await fetchOrigin(worktreePath, defaultBranch);
  if (!fetchResult.ok) {
    // If fetch fails because there's no remote, surface that clearly.
    // Otherwise treat as rebase_failed (we can't verify state).
    const isNoRemote =
      fetchResult.error?.toLowerCase().includes("no remote") ?? false;
    if (isNoRemote) {
      return {
        ok: false,
        reason: "no_remote",
        detail:
          fetchResult.error ?? "No remote configured for this repository.",
        hint: "Add a remote origin or skip pre-execution rebase.",
      };
    }
    // Non-remote fetch failure — we don't know if we're behind, so halt.
    return {
      ok: false,
      reason: "rebase_failed",
      detail: fetchResult.error ?? "Fetch failed before rebase could begin.",
      hint: "Check network connectivity and remote availability, then retry.",
    };
  }

  // 4. Check if up-to-date
  const ontoRef = `origin/${defaultBranch}`;
  const ahead = await isAhead(worktreePath, defaultBranch, ontoRef);
  if (!ahead) {
    return {
      ok: true,
      status: "up_to_date",
      defaultBranch,
    };
  }

  // 5. Rebase
  const rebaseResult = await rebase(worktreePath, ontoRef);
  if (!rebaseResult.ok) {
    // Abort any partial rebase to leave the worktree clean
    try {
      await execGit(["rebase", "--abort"], worktreePath);
    } catch {
      // Best-effort abort; if it fails the worktree may need manual cleanup
    }

    if (rebaseResult.conflictFiles && rebaseResult.conflictFiles.length > 0) {
      return {
        ok: false,
        reason: "conflict",
        detail: `Rebase encountered conflicts in ${rebaseResult.conflictFiles.length} file(s).`,
        hint: "Resolve conflicts manually or rebase main into your branch outside /adv-apply.",
        conflictFiles: rebaseResult.conflictFiles,
      };
    }

    return {
      ok: false,
      reason: "rebase_failed",
      detail: rebaseResult.error ?? "Rebase failed for an unknown reason.",
      hint: "Check the worktree state and retry, or rebase manually.",
    };
  }

  // 6. Count commits that were applied (how far ahead we were)
  let commits = 0;
  try {
    const countStr = await execGit(
      ["rev-list", "--count", `HEAD..${ontoRef}`],
      worktreePath,
    );
    commits = parseInt(countStr.trim(), 10) || 0;
  } catch {
    // Non-critical; leave commits undefined
  }

  return {
    ok: true,
    status: "rebased",
    defaultBranch,
    commits: commits > 0 ? commits : undefined,
  };
}

// ---------------------------------------------------------------------------
// Default dependency implementations (can be overridden for testing)
// ---------------------------------------------------------------------------

async function defaultFetchOrigin(
  cwd: string,
  branch: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await execGit(["fetch", "origin", branch], cwd);
    return { ok: true };
  } catch (err: unknown) {
    const msg = errorMessage(err);
    return { ok: false, error: msg };
  }
}

async function defaultRebase(
  cwd: string,
  ontoRef: string,
): Promise<{ ok: boolean; conflictFiles?: string[]; error?: string }> {
  try {
    await execGit(["rebase", ontoRef], cwd);
    return { ok: true };
  } catch (err: unknown) {
    const msg = errorMessage(err);

    // Parse conflict files
    let conflictFiles: string[] | undefined;
    try {
      const diff = await execGit(
        ["diff", "--name-only", "--diff-filter=U"],
        cwd,
      );
      conflictFiles = diff
        .trim()
        .split("\n")
        .filter((f) => f.length > 0);
    } catch {
      // Ignore diff failure
    }

    return { ok: false, conflictFiles, error: msg };
  }
}

async function defaultIsAhead(
  cwd: string,
  _branch: string,
  ontoRef: string,
): Promise<boolean> {
  try {
    const countStr = await execGit(
      ["rev-list", "--count", `HEAD..${ontoRef}`],
      cwd,
    );
    const count = parseInt(countStr.trim(), 10) || 0;
    return count > 0;
  } catch {
    // If we can't tell, assume ahead to trigger rebase attempt
    return true;
  }
}

async function defaultIsWorktree(cwd: string): Promise<boolean> {
  try {
    await execGit(["rev-parse", "--git-dir"], cwd);
    return true;
  } catch {
    return false;
  }
}
