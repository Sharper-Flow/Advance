/**
 * Branch Integration Gate (T29)
 *
 * 3-condition check before deleting an ADV-managed worktree branch:
 *   1. Terminal — corresponding ADV change has status: "archived" or "closed"
 *   2. Merged   — branch appears in `git branch --merged <defaultBranch>`
 *   3. Clean    — worktree path has empty `git status --porcelain`
 *
 * All three must pass. No `opts.force` bypass — this is an integrity contract.
 *
 * "Terminal" widens the historical archived-only check so that changes ended
 * via /adv-cancel (status="closed" with cancelled/superseded/not_planned
 * reasons) also free their worktree. Merged-into-default and clean-tree
 * requirements stay intact: closed ≠ unmerged-OK.
 */

import { execFileGitAsync, execFileGitCb } from "./git-binary";
import { isValidGitBranchRef } from "./git-ref";
import { getDefaultBranch } from "./git";
import type { WorktreeOperationContext } from "./worktree-operation";
import {
  getWorktreeRegistrySnapshot,
  getWorktreePath,
  initStateDb,
} from "../tools/worktree/state";

/**
 * Trunk-history window (commits) scanned by the squash-merge tree-equivalence
 * strategy. Deliberately wider than git-finalize's detectSquashMergeByTree
 * (-50): deletion planning may run long after the merge, when the squash
 * commit has receded deeper into trunk history than archive-time detection.
 */
const TRUNK_TREE_WALK_LIMIT = 500;

// =============================================================================
// TYPES
// =============================================================================

export type BranchIntegrationResult =
  | { ok: true; branch: string; changeId: string; defaultBranch: string }
  | {
      ok: false;
      reason:
        | "branch_not_in_registry"
        | "change_not_terminal"
        | "branch_not_merged"
        | "worktree_dirty"
        | "default_branch_unresolvable"
        | "git_failed";
      detail: string;
      hint: string;
    };

export interface BranchIntegrationDeps {
  changeStatusReader?: (changeId: string) => Promise<string | undefined>;
  /**
   * Durable terminal-status readback used when the ordinary projection/memo
   * is stale or unavailable. Returns "archived" | "closed" | undefined.
   */
  terminalStatusReader?: (changeId: string) => Promise<string | undefined>;
  mergedBranches?: (
    defaultBranch: string,
    repoRoot: string,
  ) => Promise<string[]>;
  worktreeStatus?: (worktreePath: string) => Promise<string>;
  registry?: { branch: string; changeId?: string; path: string }[];
}

export type LocalBranchIntegrationProof =
  | {
      kind: "merged_to_default";
      branch: string;
      defaultBranch: string;
      head: string;
      evidence: string;
    }
  | {
      kind: "patch_equivalent";
      branch: string;
      defaultBranch: string;
      head: string;
      evidence: string;
    };

export class LocalBranchIntegrationDeadline extends Error {
  constructor(stage: "merge-base" | "cherry" | "tree") {
    super(`Local branch integration ${stage} exceeded the operation budget.`);
    this.name = "LocalBranchIntegrationDeadline";
  }
}

export interface LocalBranchIntegrationGitOptions {
  cwd: string;
  timeout: number;
  remainingMs: number;
  signal: AbortSignal;
}

export interface LocalBranchIntegrationOptions {
  /** Test seam; production always uses the bounded git helper below. */
  runGit?: (
    args: readonly string[],
    options: LocalBranchIntegrationGitOptions,
  ) => Promise<{ stdout: string; stderr: string }>;
}

function errorExitCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : undefined;
}

function isProcessDeadline(
  error: unknown,
  operation: WorktreeOperationContext,
) {
  if (operation.signal.aborted) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: unknown;
    killed?: unknown;
    signal?: unknown;
    message?: unknown;
  };
  return (
    candidate.name === "AbortError" ||
    candidate.killed === true ||
    typeof candidate.signal === "string" ||
    (typeof candidate.message === "string" &&
      /timeout|timed out|deadline|abort/i.test(candidate.message))
  );
}

function validPatchEquivalentCherryLine(line: string): boolean {
  return /^-[ \t]+[0-9a-f]{4,64}(?:[ \t]+.*)?$/i.test(line);
}

/**
 * Prove a local branch is integrated without relying on remote PR state.
 *
 * The ancestry check is authoritative when it succeeds. A non-ancestor may
 * still be safely deletable after a squash merge, but only when `git cherry`
 * exits successfully and every emitted patch is a well-formed `-` line. When
 * cherry cannot prove equivalence, a bounded tree walk checks whether the
 * branch tip's complete snapshot matches a trunk commit.
 * Every child receives the remaining operation budget and cancellation signal.
 */
export async function proveLocalBranchIntegration(
  branch: string,
  head: string,
  defaultBranch: string,
  repoRoot: string,
  operation: WorktreeOperationContext,
  options: LocalBranchIntegrationOptions = {},
): Promise<LocalBranchIntegrationProof | undefined> {
  if (
    !isValidGitBranchRef(branch) ||
    !isValidGitBranchRef(defaultBranch) ||
    branch === defaultBranch ||
    branch.startsWith("-") ||
    defaultBranch.startsWith("-")
  )
    return undefined;

  const runGit =
    options.runGit ??
    ((args: readonly string[], gitOptions: LocalBranchIntegrationGitOptions) =>
      execFileGitAsync(args, gitOptions));
  const runBoundedGit = async (
    stage: "merge-base" | "cherry" | "tree",
    args: readonly string[],
  ): Promise<{ stdout: string; stderr: string } | undefined> => {
    const remainingMs = operation.remainingMs();
    if (remainingMs <= 0 || operation.signal.aborted)
      throw new LocalBranchIntegrationDeadline(stage);
    try {
      return await runGit(args, {
        cwd: repoRoot,
        timeout: Math.max(1, remainingMs),
        remainingMs: Math.max(1, remainingMs),
        signal: operation.signal,
      });
    } catch (error) {
      if (isProcessDeadline(error, operation))
        throw new LocalBranchIntegrationDeadline(stage);
      throw error;
    }
  };
  // Shared envelope for best-effort strategies: deadline/abort failures
  // propagate (typed); git errors or empty results demote to undefined so the
  // next strategy (or the caller's gh fallback) can take over.
  const runBoundedGitOrUndefined = async (
    stage: "merge-base" | "cherry" | "tree",
    args: readonly string[],
  ): Promise<{ stdout: string; stderr: string } | undefined> => {
    try {
      return await runBoundedGit(stage, args);
    } catch (error) {
      if (error instanceof LocalBranchIntegrationDeadline) throw error;
      return undefined;
    }
  };

  let ancestry: { stdout: string; stderr: string } | undefined;
  try {
    ancestry = await runBoundedGit("merge-base", [
      "merge-base",
      "--is-ancestor",
      branch,
      defaultBranch,
    ]);
  } catch (error) {
    // Exit 1 is Git's explicit "not an ancestor" result. Any other exit
    // code means the refs/repository were not safely interpretable.
    if (error instanceof LocalBranchIntegrationDeadline) throw error;
    if (errorExitCode(error) !== 1) return undefined;
  }
  if (ancestry) {
    return {
      kind: "merged_to_default",
      branch,
      defaultBranch,
      head,
      evidence: `git merge-base --is-ancestor ${branch} ${defaultBranch}`,
    };
  }

  const cherry = await runBoundedGitOrUndefined("cherry", [
    "cherry",
    "-v",
    defaultBranch,
    branch,
  ]);
  if (!cherry) return undefined;
  const lines = cherry.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.every(validPatchEquivalentCherryLine)) {
    return {
      kind: "patch_equivalent",
      branch,
      defaultBranch,
      head,
      evidence: `git cherry -v ${defaultBranch} ${branch} (all patches equivalent)`,
    };
  }

  // Strategy 3: squash-merge tree equivalence. A squash merge lands the branch
  // tip's exact tree as one trunk commit, so content-addressed tree equality
  // over trunk history proves the work landed. The window is deliberately
  // wider than git-finalize's detectSquashMergeByTree (-50) because deletion
  // planning can run long after the merge, when the squash commit has receded
  // deeper into trunk history than archive-time detection ever sees.
  const tipTree = await runBoundedGitOrUndefined("tree", [
    "rev-parse",
    `${head}^{tree}`,
  ]);
  if (!tipTree) return undefined;
  const treeSha = tipTree.stdout.trim();
  if (!/^[0-9a-f]{4,64}$/i.test(treeSha)) return undefined;

  const trunkTrees = await runBoundedGitOrUndefined("tree", [
    "log",
    defaultBranch,
    "--format=%H %T",
    "-n",
    String(TRUNK_TREE_WALK_LIMIT),
  ]);
  if (!trunkTrees) return undefined;
  for (const line of trunkTrees.stdout.split(/\r?\n/)) {
    const match = line.trim().match(/^([0-9a-f]{4,64})\s+([0-9a-f]{4,64})$/i);
    if (match?.[2].toLowerCase() === treeSha.toLowerCase()) {
      return {
        kind: "patch_equivalent",
        branch,
        defaultBranch,
        head,
        evidence: `tree-identical to trunk commit ${match[1]}`,
      };
    }
  }
  return undefined;
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
  let registrySnapshot:
    | Awaited<ReturnType<typeof getWorktreeRegistrySnapshot>>
    | undefined;

  if (deps?.registry) {
    registryEntry = deps.registry.find((r) => r.branch === branch);
  } else {
    try {
      const access = await initStateDb(repoRoot);
      registrySnapshot = await getWorktreeRegistrySnapshot(access);
      if (registrySnapshot.unavailable) {
        return fail(
          "git_failed",
          "Failed to read worktree registry: project registry snapshot unavailable.",
          "Verify the project registry is readable and populated.",
        );
      }
      registryEntry = registrySnapshot.records.find((r) => r.branch === branch);
    } catch (err) {
      return fail(
        "git_failed",
        `Failed to read worktree registry: ${String(err)}`,
        "Verify the project registry is readable and populated.",
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

  // --- 3. Condition A: Terminal -----------------------------------------------
  const isTerminalStatus = (status: string | undefined): boolean =>
    status === "archived" || status === "closed";

  let changeStatus: string | undefined;
  if (deps?.changeStatusReader) {
    changeStatus = await deps.changeStatusReader(changeId);
  } else {
    try {
      if (!registrySnapshot) {
        const access = await initStateDb(repoRoot);
        registrySnapshot = await getWorktreeRegistrySnapshot(access);
      }
      if (!registrySnapshot.unavailable) {
        changeStatus = registrySnapshot.changeSummaries[changeId]?.status;
      }
      // If the snapshot is unavailable or the status is nonterminal, fall
      // through to the durable readback below (when provided).
    } catch (err) {
      if (!deps?.terminalStatusReader) {
        return fail(
          "git_failed",
          `Failed to query change summaries: ${String(err)}`,
          "Verify the project registry is readable.",
        );
      }
    }
  }

  if (!isTerminalStatus(changeStatus) && deps?.terminalStatusReader) {
    const durableStatus = await deps.terminalStatusReader(changeId);
    if (isTerminalStatus(durableStatus)) {
      changeStatus = durableStatus;
    }
  }

  if (!isTerminalStatus(changeStatus)) {
    return fail(
      "change_not_terminal",
      `Change "${changeId}" has status "${changeStatus ?? "undefined"}" (expected "archived" or "closed").`,
      "Archive or close the change via /adv-archive or /adv-cancel before deleting its worktree.",
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
    execFileGitCb(
      ["branch", "--merged", defaultBranch],
      { cwd: repoRoot, timeout: 5000 },
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
    execFileGitCb(
      ["status", "--porcelain"],
      { cwd: worktreePath, timeout: 5000 },
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
