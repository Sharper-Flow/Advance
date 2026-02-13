/**
 * Project Identity Utilities
 *
 * Derives a stable project identifier from the git root commit hash.
 * Used to key external mutable state per-project so that all worktrees
 * of the same repo share the same state directory.
 *
 * Convention: $XDG_DATA_HOME/opencode/plugins/advance/{project-id}/
 * Matches kdcokenny's worktree plugin pattern.
 */

import { execFile } from "child_process";
import { join } from "path";
import { homedir } from "os";

// =============================================================================
// getProjectId
// =============================================================================

/**
 * Get a stable project identifier by reading the repo's root commit hash.
 *
 * Returns the full 40-char SHA of the first commit in the repo.
 * Returns null if the directory is not a git repo or git is unavailable.
 *
 * This ID is identical across all worktrees of the same repo because
 * they share the same commit history.
 */
export async function getProjectId(
  directory: string,
): Promise<string | null> {
  try {
    const sha = await execGit(
      ["rev-list", "--max-parents=0", "HEAD"],
      directory,
    );
    const roots = sha.trim().split("\n").filter(Boolean).sort();
    const trimmed = roots[0]; // Sort for determinism when multiple roots exist
    if (/^[0-9a-f]{40}$/.test(trimmed)) {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

// =============================================================================
// getExternalRoot
// =============================================================================

/**
 * Resolve the external state directory for a given project ID.
 *
 * Path: $XDG_DATA_HOME/opencode/plugins/advance/{projectId}/
 *
 * If XDG_DATA_HOME is not set, defaults to ~/.local/share.
 */
export function getExternalRoot(projectId: string): string {
  const dataHome =
    process.env.XDG_DATA_HOME || join(homedir(), ".local/share");
  return join(dataHome, "opencode/plugins/advance", projectId);
}

// =============================================================================
// Internal helpers
// =============================================================================

function execGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, timeout: 5000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
      (error, stdout) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      },
    );
  });
}
