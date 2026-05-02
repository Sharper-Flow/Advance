/**
 * Project Identity Utilities
 *
 * Derives a stable project identifier from the git root commit hash.
 * Used to key external mutable state per-project so that all worktrees
 * of the same repo share the same state directory.
 *
 * Convention: $XDG_DATA_HOME/opencode/plugins/advance/{project-id}/
 * Matches kdcokenny's worktree plugin pattern.
 *
 * Test-mode override:
 *   When `process.env.VITEST === "true"` or `process.env.ADV_TEST_MODE === "1"`,
 *   `getProjectId` returns a path-derived synthetic ID via
 *   `synthesizeTestProjectId(directory)` so that vitest runs cannot leak
 *   fixture state into a real ADV project's external state directory AND
 *   so that fixtures using distinct target paths get isolated state dirs.
 *   Tests that need to verify the actual git resolution path call
 *   `getProjectIdFromGit` directly.
 *
 *   See `rq-testFixtureProjectId01` in `.adv/specs/advance-meta`.
 */

import { execFile } from "child_process";
import { join } from "path";
import { homedir } from "os";
import { createHash } from "crypto";

// =============================================================================
// SYNTHETIC_TEST_PROJECT_ID
// =============================================================================

/**
 * Stable 16-char zero prefix marking a synthetic test project_id. Real git
 * SHAs cannot start with 16 zeros in practice, so any value matching this
 * prefix is unambiguously test-mode state.
 */
export const SYNTHETIC_TEST_PROJECT_ID_PREFIX =
  "0000000000000000"; // 16 zeros

/**
 * Synthetic project identifier returned by `getProjectId` during vitest
 * runs when no directory context is available (e.g. directory is empty
 * or unresolvable). The all-zero sentinel is a valid degenerate case of
 * `synthesizeTestProjectId` and remains distinguishable from any real SHA.
 *
 * Routes test external state into
 * `~/.local/share/opencode/plugins/advance/0000…000/` which is clearly
 * identifiable as test-only and easy to bulk-clean.
 */
export const SYNTHETIC_TEST_PROJECT_ID =
  "0000000000000000000000000000000000000000";

/**
 * Build a deterministic synthetic project_id for a given directory in
 * test mode. The result is 40 hex chars: 16 leading zeros + 24-char
 * SHA-1 prefix of `"adv-test::" + directory`. Two distinct directories
 * map to distinct synthetic IDs so cross-project tests stay isolated.
 *
 * Empty / falsy directory collapses to `SYNTHETIC_TEST_PROJECT_ID`.
 */
export function synthesizeTestProjectId(directory: string): string {
  if (!directory) return SYNTHETIC_TEST_PROJECT_ID;
  const hash = createHash("sha1")
    .update("adv-test::" + directory)
    .digest("hex")
    .slice(0, 24);
  return SYNTHETIC_TEST_PROJECT_ID_PREFIX + hash;
}

// =============================================================================
// getProjectId
// =============================================================================

/**
 * Get a stable project identifier.
 *
 * In test mode (VITEST=true or ADV_TEST_MODE=1):
 *   - If `directory` is a real git repo with a root commit, return a
 *     path-derived synthetic ID via `synthesizeTestProjectId(directory)`.
 *     This prevents test runs from a real repo (e.g. the plugin's own
 *     dev checkout) leaking fixture state into that repo's real ADV
 *     external state directory.
 *   - If `directory` is not a real git repo (e.g. a `createTestProject`
 *     fixture with a stub `.git` directory and no commits), return null.
 *     Callers fall back to legacy in-repo paths via their existing
 *     `targetProjectId ? getExternalRoot(...) : undefined` patterns,
 *     keeping per-fixture stores isolated under their temp dir.
 *
 * In production (no test-mode env vars), reads the repo's root commit
 * hash via `getProjectIdFromGit`. Returns null if the directory is not
 * a git repo or git is unavailable.
 *
 * This ID is identical across all worktrees of the same repo because
 * they share the same commit history.
 */
export async function getProjectId(directory: string): Promise<string | null> {
  if (process.env.VITEST === "true" || process.env.ADV_TEST_MODE === "1") {
    const realSha = await getProjectIdFromGit(directory);
    if (!realSha) return null;
    return synthesizeTestProjectId(directory);
  }
  return getProjectIdFromGit(directory);
}

/**
 * Raw git-resolution path that always reads the actual root commit hash,
 * bypassing the test-mode synthetic override. Exported so tests that
 * need to verify the real-SHA resolution logic can call it directly.
 *
 * × Do NOT use this from production call sites — use `getProjectId`
 * instead so the synthetic test override applies during vitest runs.
 */
export async function getProjectIdFromGit(
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
  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local/share");
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
