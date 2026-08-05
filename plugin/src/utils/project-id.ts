/**
 * Project Identity Utilities
 *
 * Derives a stable project identifier from the git root commit hash.
 * Used to key external mutable state per-project so that all worktrees
 * of the same repo share the same state directory.
 *
 * Convention: $XDG_DATA_HOME/opencode/plugins/advance/{project-id}/
 * Worktrees default to $XDG_DATA_HOME/opencode/worktree/{project-id}/, with
 * ADV_WORKTREE_HOME as an absolute-path override for developer-visible
 * worktree roots.
 * Matches kdcokenny's worktree plugin pattern.
 *
 * Test-mode override:
 *   When `process.env.VITEST === "true"` or `process.env.ADV_TEST_MODE === "1"`,
 *   `getProjectId` returns a path-derived synthetic ID via
 *   `synthesizeTestProjectId(directory)` so that vitest runs cannot leak
 *   fixture state into a real ADV project's external state directory AND
 *   so that fixtures using distinct target paths get isolated state dirs.
 *   `getDataHome` also redirects test-mode state under `os.tmpdir()` unless
 *   `ADV_TEST_DATA_HOME=0` explicitly opts out for XDG path assertions.
 *   Tests that need to verify the actual git resolution path call
 *   `getProjectIdFromGit` directly.
 *
 *   See `rq-testFixtureProjectId01` in `.adv/specs/advance-meta`.
 */

import { execFileGitCb } from "./git-binary";
import { existsSync } from "fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "path";
import { homedir, tmpdir } from "os";
import { createHash } from "crypto";

// =============================================================================
// SYNTHETIC_TEST_PROJECT_ID
// =============================================================================

/**
 * Stable 16-char zero prefix marking a synthetic test project_id. Real git
 * SHAs cannot start with 16 zeros in practice, so any value matching this
 * prefix is unambiguously test-mode state.
 */
export const SYNTHETIC_TEST_PROJECT_ID_PREFIX = "0000000000000000"; // 16 zeros

const SHA40 = /^[0-9a-f]{40}$/;
const TEST_DATA_HOME_ENV = "ADV_TEST_DATA_HOME";

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

// =============================================================================
// Typed identity resolution (rq-projectIdentityStability01)
// =============================================================================

/**
 * Typed project-identity resolution result.
 *
 * `unstable` means the repository cannot produce a stable root-commit
 * identity: shallow clones expose the moving graft boundary as a fake
 * root (`rev-list --max-parents=0 HEAD` returns the `.git/shallow`
 * boundary, which rewrites on `fetch --depth/--deepen/--unshallow`),
 * and grafted repos rewrite parentage the same way. Minting ADV state
 * under such a SHA orphans the store when the boundary moves.
 */
export type IdentityResolution =
  | { kind: "ok"; projectId: string }
  | { kind: "not_git" }
  | { kind: "unstable"; reason: "shallow" | "graft"; guidance: string };

/**
 * Typed refusal raised when ADV state would be minted under an unstable
 * pseudo-root identity. Carries repo path, detected reason, and the exact
 * remediation command (DDC1).
 */
export class UnstableIdentityError extends Error {
  constructor(
    public readonly repoPath: string,
    public readonly reason: "shallow" | "graft",
  ) {
    super(unstableIdentityGuidance(repoPath, reason));
    this.name = "UnstableIdentityError";
  }
}

/** Typed refusal raised when git returns an invalid project identity. */
export class InvalidProjectIdentityError extends Error {
  constructor(
    public readonly repoPath: string,
    public readonly projectId: string,
  ) {
    super(invalidIdentityGuidance(repoPath, projectId));
    this.name = "InvalidProjectIdentityError";
  }
}

function unstableIdentityGuidance(
  repoPath: string,
  reason: "shallow" | "graft",
): string {
  const cause =
    reason === "shallow"
      ? "is a shallow clone (its root commit is a moving shallow-fetch boundary)"
      : "has commit grafts (its root commit is rewritten parentage)";
  const fix =
    reason === "shallow"
      ? `Run \`git fetch --unshallow\` in ${repoPath} and retry.`
      : `Remove \`.git/info/grafts\` (or migrate to \`git replace\` and un-graft) in ${repoPath}, then run \`git fetch --unshallow\` if the repo is also shallow, and retry.`;
  return (
    `ADV cannot derive a stable project identity for ${repoPath}: the repository ${cause}. ` +
    `${fix} No ADV state was created under the unstable identity.`
  );
}

function invalidIdentityGuidance(repoPath: string, projectId: string): string {
  return (
    `ADV cannot derive a valid project identity for ${repoPath}: git returned ` +
    `the invalid candidate "${projectId}". Project identities must be exactly ` +
    `40 lowercase hexadecimal characters. No ADV state was created under the invalid identity.`
  );
}

/**
 * Resolve a stable project identity with structural instability detection.
 *
 * Order: git-dir check (not_git) → `rev-parse --is-shallow-repository`
 * (structural: git reads `.git/shallow`) → `info/grafts` presence → true
 * root via `rev-list --max-parents=0 HEAD` (first sorted root for
 * multi-root determinism). Partial clones (`--filter=...`) write no
 * `.git/shallow` and resolve normally.
 */
export async function resolveProjectIdentity(
  directory: string,
): Promise<IdentityResolution> {
  let gitDir: string;
  try {
    gitDir = (
      await execGit(["rev-parse", "--absolute-git-dir"], directory)
    ).trim();
  } catch {
    return { kind: "not_git" };
  }

  try {
    const shallow = (
      await execGit(["rev-parse", "--is-shallow-repository"], directory)
    ).trim();
    if (shallow === "true") {
      return {
        kind: "unstable",
        reason: "shallow",
        guidance: unstableIdentityGuidance(directory, "shallow"),
      };
    }
  } catch {
    return { kind: "not_git" };
  }

  if (existsSync(join(gitDir, "info", "grafts"))) {
    return {
      kind: "unstable",
      reason: "graft",
      guidance: unstableIdentityGuidance(directory, "graft"),
    };
  }

  const projectId = await resolveRootCommit(directory);
  if (!projectId) return { kind: "not_git" };
  if (!SHA40.test(projectId)) {
    throw new InvalidProjectIdentityError(directory, projectId);
  }
  return { kind: "ok", projectId };
}

/**
 * Raw git-resolution path that reads the actual root commit hash,
 * bypassing the test-mode synthetic override. Guarded: shallow/grafted
 * repositories throw `UnstableIdentityError` instead of returning the
 * moving pseudo-root (rq-projectIdentityStability01).
 *
 * × Do NOT use this from production call sites — use `getProjectId`
 * instead so the synthetic test override applies during vitest runs.
 */
export async function getProjectIdFromGit(
  directory: string,
): Promise<string | null> {
  const resolution = await resolveProjectIdentity(directory);
  if (resolution.kind === "ok") return resolution.projectId;
  if (resolution.kind === "unstable") {
    throw new UnstableIdentityError(directory, resolution.reason);
  }
  return null;
}

/** Unguarded root-commit read shared by the typed resolver. */
async function resolveRootCommit(directory: string): Promise<string | null> {
  try {
    const sha = await execGit(
      ["rev-list", "--max-parents=0", "HEAD"],
      directory,
    );
    const roots = sha
      .trim()
      .split("\n")
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    const trimmed = roots[0]; // Sort for determinism when multiple roots exist
    return trimmed ?? null;
  } catch {
    return null;
  }
}

// =============================================================================
// External path helpers
// =============================================================================

/**
 * Resolve the XDG data-home root used by ADV's external mutable state.
 *
 * Empty / unset XDG_DATA_HOME falls back to `~/.local/share`. Relative values
 * are rejected because external state and worktree guards rely on absolute
 * namespace boundaries.
 */
export function getDataHome(): string {
  const testMode =
    process.env.VITEST === "true" || process.env.ADV_TEST_MODE === "1";
  if (testMode && process.env[TEST_DATA_HOME_ENV] !== "0") {
    return join(tmpdir(), "advance-test", String(process.pid));
  }

  const configured = process.env.XDG_DATA_HOME;
  if (configured === undefined || configured === "") {
    return join(homedir(), ".local/share");
  }
  if (!isAbsolute(configured)) {
    throw new Error(`XDG_DATA_HOME must be absolute: ${configured}`);
  }
  return resolve(configured);
}

/**
 * Resolve the optional user-facing worktree home.
 *
 * Empty / unset ADV_WORKTREE_HOME preserves the historical XDG worktree
 * location. Relative values are rejected because worktree creation/deletion
 * guards rely on absolute namespace boundaries.
 */
export function getWorktreeHomeOverride(): string | null {
  const configured = process.env.ADV_WORKTREE_HOME;
  if (configured === undefined || configured === "") return null;
  if (!isAbsolute(configured)) {
    throw new Error(`ADV_WORKTREE_HOME must be absolute: ${configured}`);
  }
  return resolve(configured);
}

/**
 * Resolve the external state directory for a given project ID.
 *
 * Path: $XDG_DATA_HOME/opencode/plugins/advance/{projectId}/
 *
 * If XDG_DATA_HOME is not set, defaults to ~/.local/share.
 */
export function getExternalRoot(projectId: string): string {
  return join(getDataHome(), "opencode/plugins/advance", projectId);
}

/**
 * Resolve the canonical external state directory for a project id.
 *
 * rq-targetPathCanonicalShard01: `target_path` tools may run inside a source
 * project's per-project OpenCode shard. When the current process is using the
 * canonical shard layout (`.../opencode-projects/{40hex}`), target project
 * state belongs under the target project's sibling shard, not the caller's
 * shard. Non-canonical or non-sharded data homes preserve legacy behavior.
 */
export function getExternalRootForProject(projectId: string): string {
  const dataHome = getDataHome();
  const currentShard = basename(dataHome);
  const shardParent = dirname(dataHome);

  if (
    basename(shardParent) === "opencode-projects" &&
    /^[0-9a-f]{40}$/.test(currentShard)
  ) {
    return join(shardParent, projectId, "opencode/plugins/advance", projectId);
  }

  return getExternalRoot(projectId);
}

/**
 * Resolve the per-project worktree base directory.
 *
 * Default path: $XDG_DATA_HOME/opencode/worktree/{projectId}/
 * Override path: $ADV_WORKTREE_HOME/{projectId}/
 */
export function getWorktreeBase(projectId: string): string {
  const override = getWorktreeHomeOverride();
  if (override) return join(override, projectId);
  return join(getDataHome(), "opencode/worktree", projectId);
}

/** Return true when `candidatePath` is inside `directory` or equal to it. */
export function isPathInsideDirectory(
  candidatePath: string,
  directory: string,
): boolean {
  const candidate = resolve(candidatePath);
  const root = resolve(directory);
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Throw when `candidatePath` escapes `directory`.
 *
 * Useful before cleanup operations that must stay within an ADV namespace.
 */
export function assertPathInsideDirectory(
  candidatePath: string,
  directory: string,
): void {
  if (!isPathInsideDirectory(candidatePath, directory)) {
    throw new Error(
      `Path ${candidatePath} is outside allowed namespace ${directory}`,
    );
  }
}

// =============================================================================
// Internal helpers
// =============================================================================

function execGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFileGitCb(args, { cwd, timeout: 5000 }, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}
