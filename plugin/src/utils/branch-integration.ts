/**
 * Branch Integration Gate (T29)
 *
 * 3-condition check before deleting an ADV-managed worktree branch:
 *   1. Archived  — corresponding ADV change has status: "archived"
 *   2. Merged    — branch appears in `git branch --merged <defaultBranch>`
 *   3. Clean     — worktree path has empty `git status --porcelain`
 *
 * All three must pass. No `opts.force` bypass — this is an integrity contract.
 */

import { execFile } from "node:child_process";
import { getDefaultBranch } from "./git";
import {
  getChangeSummaries,
  getWorktreePath,
  initStateDb,
  listWorktrees,
} from "../tools/worktree/state";

// =============================================================================
// TYPES
// =============================================================================

export type BranchIntegrationResult =
  | { ok: true; branch: string; changeId: string; defaultBranch: string }
  | {
      ok: false;
      reason:
        | "branch_not_in_registry"
        | "change_not_archived"
        | "branch_not_merged"
        | "worktree_dirty"
        | "default_branch_unresolvable"
        | "git_failed";
      detail: string;
      hint: string;
    };

export interface BranchIntegrationDeps {
  changeStatusReader?: (changeId: string) => Promise<string | undefined>;
  mergedBranches?: (
    defaultBranch: string,
    repoRoot: string,
  ) => Promise<string[]>;
  worktreeStatus?: (worktreePath: string) => Promise<string>;
  registry?: { branch: string; changeId?: string; path: string }[];
}

// =============================================================================
// PUBLIC API
// =============================================================================

export async function verifyBranchIntegration(
  branch: string,
  repoRoot: string,
  // `_opts.force` does NOT bypass this gate; param kept for API symmetry.
  _opts?: { force?: boolean },
  deps?: BranchIntegrationDeps,
): Promise<BranchIntegrationResult> {

  // --- 1. Resolve registry entry ------------------------------------------------
  let registryEntry:
    | { branch: string; changeId?: string; path: string }
    | undefined;

  if (deps?.registry) {
    registryEntry = deps.registry.find((r) => r.branch === branch);
  } else {
    try {
      const access = await initStateDb(repoRoot);
      const registry = await listWorktrees(access);
      registryEntry = registry.find((r) => r.branch === branch);
    } catch (err) {
      return fail(
        "git_failed",
        `Failed to read worktree registry: ${String(err)}`,
        "Verify Temporal project workflow is reachable and the worktree registry is populated.",
      );
    }
  }

  if (!registryEntry) {
    return fail(
      "branch_not_in_registry",
      `Branch "${branch}" not found in worktree registry.`,
      "The branch may not be ADV-managed. Only registered worktree branches can be deleted through this gate.",
    );
  }

  const changeId = registryEntry.changeId;
  if (!changeId) {
    return fail(
      "branch_not_in_registry",
      `Branch "${branch}" has no associated changeId in the registry.`,
      "The worktree was registered without a changeId. Manual cleanup may be required.",
    );
  }

  // --- 2. Default branch resolution ---------------------------------------------
  let defaultBranch: string;
  try {
    defaultBranch = await getDefaultBranch(repoRoot);
  } catch (err) {
    return fail(
      "default_branch_unresolvable",
      `Could not determine default branch: ${String(err)}`,
      "Ensure the repository has a valid remote or git config init.defaultBranch is set.",
    );
  }

  // --- 3. Condition A: Archived -------------------------------------------------
  let changeStatus: string | undefined;
  if (deps?.changeStatusReader) {
    changeStatus = await deps.changeStatusReader(changeId);
  } else {
    try {
      const access = await initStateDb(repoRoot);
      const summaries = await getChangeSummaries(access);
      changeStatus = summaries[changeId]?.status;
    } catch (err) {
      return fail(
        "git_failed",
        `Failed to query change summaries: ${String(err)}`,
        "Verify Temporal project workflow is reachable.",
      );
    }
  }

  if (changeStatus !== "archived") {
    return fail(
      "change_not_archived",
      `Change "${changeId}" has status "${changeStatus ?? "undefined"}" (expected "archived").`,
      "Archive the change via /adv-archive before deleting its worktree.",
    );
  }

  // --- 4. Condition B: Merged ---------------------------------------------------
  let merged: string[];
  try {
    merged = deps?.mergedBranches
      ? await deps.mergedBranches(defaultBranch, repoRoot)
      : await getMergedBranches(defaultBranch, repoRoot);
  } catch (err) {
    return fail(
      "git_failed",
      `Failed to list merged branches: ${String(err)}`,
      "Ensure git is installed and the repository is not in a broken state.",
    );
  }

  // Normalize branch names: git may prefix with "* " for the current branch,
  // or "+ " for branches checked out in another worktree. The latter is the
  // canonical case for ADV-managed worktrees at delete time, so both prefixes
  // must be stripped before the merged-set membership check.
  const normalizedMerged = merged.map((b) => b.replace(/^[*+]\s*/, "").trim());
  if (!normalizedMerged.includes(branch)) {
    return fail(
      "branch_not_merged",
      `Branch "${branch}" is not merged into "${defaultBranch}".`,
      `Merge the branch into ${defaultBranch} (e.g. \`git merge ${branch}\`) before deleting its worktree.`,
    );
  }

  // --- 5. Condition C: Clean ----------------------------------------------------
  let worktreePath: string;
  try {
    worktreePath =
      registryEntry.path || (await getWorktreePath(repoRoot, branch));
  } catch (err) {
    return fail(
      "git_failed",
      `Failed to resolve worktree path: ${String(err)}`,
      "Verify the worktree path is valid and the projectId can be resolved.",
    );
  }

  let porcelain: string;
  try {
    porcelain = deps?.worktreeStatus
      ? await deps.worktreeStatus(worktreePath)
      : await getWorktreeStatus(worktreePath);
  } catch (err) {
    return fail(
      "git_failed",
      `Failed to check worktree status: ${String(err)}`,
      "Ensure the worktree path exists and git is accessible.",
    );
  }

  if (porcelain.trim().length > 0) {
    return fail(
      "worktree_dirty",
      `Worktree at "${worktreePath}" has uncommitted changes.`,
      "Commit or stash changes in the worktree before deleting it.",
    );
  }

  // --- All conditions pass ------------------------------------------------------
  return {
    ok: true,
    branch,
    changeId,
    defaultBranch,
  };
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

type FailureReason = Exclude<BranchIntegrationResult, { ok: true }>["reason"];

function fail(
  reason: FailureReason,
  detail: string,
  hint: string,
): Extract<BranchIntegrationResult, { ok: false }> {
  return { ok: false, reason, detail, hint };
}

async function getMergedBranches(
  defaultBranch: string,
  repoRoot: string,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["branch", "--merged", defaultBranch],
      {
        cwd: repoRoot,
        timeout: 5000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      },
      (error, stdout) => {
        if (error) {
          reject(error);
        } else {
          resolve(
            stdout
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean),
          );
        }
      },
    );
  });
}

async function getWorktreeStatus(worktreePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["status", "--porcelain"],
      {
        cwd: worktreePath,
        timeout: 5000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      },
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
