import { realpathSync } from "fs";
import { dirname } from "path";
import { spawnSyncGit } from "../../utils/git-binary";

export type ArchiveMode = "direct" | "pr";

export interface GitFinalizeOutcome {
  status: "shipped" | "blocked" | "pr_pushed";
  mainCheckout: string;
  defaultBranch: string;
  mergeCommitSha?: string;
  pushStatus: "pushed" | "skipped" | "failed" | "not_attempted";
  pushFailureReason?: string;
  prBranch?: string;
  blocked?: { reason: string; remediation: string; details?: string[] };
}

export interface RunGitResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface GitFinalizeDeps {
  runGit?: (cwd: string, args: string[], timeoutMs?: number) => RunGitResult;
  requireCleanWorktree?: boolean;
}

export interface DeleteChangeBranchResult {
  localDeleted: boolean;
  remoteDeleted: boolean;
  error?: string;
}

/**
 * Delete the local and remote change/{changeId} branches after a successful
 * archive finalization. Must be called from the main checkout AFTER the
 * worktree has been removed (git refuses to delete a checked-out branch).
 *
 * Local deletion uses `git branch -d` (safe — refuses if not fully merged).
 * Remote deletion is best-effort; failure is recorded but does not block.
 */
export function deleteChangeBranch(
  mainCheckout: string,
  changeId: string,
  deps: GitFinalizeDeps = {},
): DeleteChangeBranchResult {
  const runGit = deps.runGit ?? defaultRunGit;
  const branchName = `change/${changeId}`;

  // Delete local branch (safe — only works if fully merged)
  const localResult = runGit(mainCheckout, ["branch", "-d", branchName]);
  if (localResult.status !== 0) {
    return {
      localDeleted: false,
      remoteDeleted: false,
      error: `Local branch deletion failed: ${redactGitOutput(localResult.stderr).trim()}`,
    };
  }

  // Delete remote branch (best-effort)
  const remoteResult = runGit(mainCheckout, [
    "push",
    "origin",
    "--delete",
    branchName,
  ]);
  if (remoteResult.status !== 0) {
    return {
      localDeleted: true,
      remoteDeleted: false,
      error: `Remote branch deletion failed: ${redactGitOutput(remoteResult.stderr).trim()}`,
    };
  }

  return { localDeleted: true, remoteDeleted: true };
}

const DEFAULT_GIT_TIMEOUT_MS = 30000;

// Push can trigger arbitrarily heavy client-side pre-push hooks in consumer
// repos (e.g. a full pre-push CI: lint + typecheck + test + production build
// can run several minutes). Give push a separate, generous, env-overridable
// budget so archive finalization does not spuriously report
// DEFAULT_BRANCH_PUSH_FAILED on a push that would otherwise succeed.
const DEFAULT_GIT_PUSH_TIMEOUT_MS = (() => {
  const env = Number(process.env.ADV_GIT_PUSH_TIMEOUT_MS);
  return Number.isFinite(env) && env > 0 ? env : 300000;
})();

const CREDENTIAL_PATTERNS = [
  /https?:\/\/[^:]+:[^@]+@/gi,
  /token\s*[=:]\s*\S+/gi,
  /password\s*[=:]\s*\S+/gi,
  /api[_-]?key\s*[=:]\s*\S+/gi,
  /gh[pousr]_[A-Za-z0-9_]+/g,
  /Bearer\s+\S+/gi,
];

export function redactGitOutput(output: string): string {
  let result = output;
  for (const pattern of CREDENTIAL_PATTERNS) {
    result = result.replace(
      pattern,
      (match) => match.slice(0, Math.min(4, match.length)) + "***REDACTED***",
    );
  }
  return result;
}

function defaultRunGit(
  cwd: string,
  args: string[],
  timeoutMs: number = DEFAULT_GIT_TIMEOUT_MS,
): RunGitResult {
  const result = spawnSyncGit(args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    env: {
      ...process.env,
      // git-binary helper already sets GIT_TERMINAL_PROMPT=0 and scrubs
      // GIT_ASKPASS; we additionally null out SSH_ASKPASS here for parity
      // with the previous implementation.
      SSH_ASKPASS: "",
    },
  });
  const timedOut = result.error?.message.includes("ETIMEDOUT") ?? false;
  const stdout =
    typeof result.stdout === "string" ? result.stdout : String(result.stdout);
  const stderr =
    typeof result.stderr === "string" ? result.stderr : String(result.stderr);
  return {
    status: timedOut ? 124 : result.status,
    stdout: redactGitOutput(stdout ?? ""),
    stderr: timedOut
      ? `git ${args.join(" ")} timed out after ${timeoutMs}ms`
      : redactGitOutput(stderr ?? ""),
  };
}

function runGitOrThrow(
  cwd: string,
  args: string[],
  deps: GitFinalizeDeps = {},
): string {
  const result = (deps.runGit ?? defaultRunGit)(cwd, args);
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function resolveMainCheckout(
  workdir: string,
  deps: GitFinalizeDeps = {},
): string {
  const gitCommonDir = runGitOrThrow(
    workdir,
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    deps,
  );
  return dirname(gitCommonDir);
}

export function detectDefaultBranch(
  mainCheckout: string,
  deps: GitFinalizeDeps = {},
): { branch: string; source: string } {
  const runGit = deps.runGit ?? defaultRunGit;

  // Prefer origin/HEAD first (avoids stale local main winning in trunk repos)
  const originHead = runGit(mainCheckout, [
    "symbolic-ref",
    "--short",
    "refs/remotes/origin/HEAD",
  ]);
  if (originHead.status === 0 && originHead.stdout.trim()) {
    const branch = originHead.stdout.trim().replace(/^origin\//, "");
    if (branch) {
      return {
        branch,
        source: "origin-head",
      };
    }
  }

  // Then init.defaultBranch config
  const configured = runGit(mainCheckout, [
    "config",
    "--get",
    "init.defaultBranch",
  ]);
  if (configured.status === 0 && configured.stdout.trim()) {
    return { branch: configured.stdout.trim(), source: "init-defaultBranch" };
  }

  // Then local branches
  for (const branch of ["main", "trunk"]) {
    const result = runGit(mainCheckout, [
      "rev-parse",
      "--verify",
      `refs/heads/${branch}`,
    ]);
    if (result.status === 0) return { branch, source: `local-${branch}` };
  }

  throw new Error(
    "Unable to resolve default branch (tried origin/HEAD, init.defaultBranch, main, trunk)",
  );
}

export type MainInvariantResult =
  | { ok: true; branch: string; dirtyFiles: [] }
  | {
      ok: false;
      code: "MAIN_BRANCH_MISMATCH" | "DIRTY_MAIN_CHECKOUT";
      branch: string;
      dirtyFiles?: string[];
      message: string;
    };

export function verifyMainInvariants(
  mainCheckout: string,
  defaultBranch: string,
  deps: GitFinalizeDeps = {},
): MainInvariantResult {
  const branch = runGitOrThrow(
    mainCheckout,
    ["branch", "--show-current"],
    deps,
  );
  if (branch !== defaultBranch) {
    return {
      ok: false,
      code: "MAIN_BRANCH_MISMATCH",
      branch,
      message: `Main checkout is on ${branch}, expected ${defaultBranch}`,
    };
  }

  const porcelain = runGitOrThrow(
    mainCheckout,
    ["status", "--porcelain"],
    deps,
  );
  const dirtyFiles = splitLines(porcelain);
  if (dirtyFiles.length > 0) {
    return {
      ok: false,
      code: "DIRTY_MAIN_CHECKOUT",
      branch,
      dirtyFiles,
      message: "Main checkout has uncommitted changes",
    };
  }

  return { ok: true, branch, dirtyFiles: [] };
}

export function verifyChangeBranchReachable(
  mainCheckout: string,
  defaultBranch: string,
  changeId: string,
  deps: GitFinalizeDeps = {},
): { reachable: boolean; unmergedCommits: string[] } {
  const result = (deps.runGit ?? defaultRunGit)(mainCheckout, [
    "log",
    "--oneline",
    `${defaultBranch}..change/${changeId}`,
  ]);
  if (result.status !== 0) {
    return {
      reachable: false,
      unmergedCommits: splitLines(result.stderr || result.stdout),
    };
  }
  const unmergedCommits = splitLines(result.stdout);
  return { reachable: unmergedCommits.length === 0, unmergedCommits };
}

export type MergeMethod = "already-reachable" | "ff-only" | "no-ff";

export type MergeChangeBranchResult =
  | {
      status: "merged";
      mergeCommitSha: string;
      mergeMethod?: MergeMethod;
    }
  | {
      status: "blocked";
      code: "MERGE_CONFLICT" | "MERGE_FAILED";
      conflictFiles?: string[];
      message: string;
    };

export function mergeChangeBranch(
  mainCheckout: string,
  defaultBranch: string,
  changeId: string,
  deps: GitFinalizeDeps = {},
): MergeChangeBranchResult {
  const runGit = deps.runGit ?? defaultRunGit;
  // rq-harden-archive-flow AC3: already-reachable branch is a no-op merge.
  // Detect before invoking `git merge` so a previously-merged (FF or no-FF
  // squash) change branch doesn't surface as MERGE_FAILED.
  const reachability = verifyChangeBranchReachable(
    mainCheckout,
    defaultBranch,
    changeId,
    deps,
  );
  if (reachability.reachable) {
    return {
      status: "merged",
      mergeCommitSha: runGitOrThrow(mainCheckout, ["rev-parse", "HEAD"], deps),
      mergeMethod: "already-reachable",
    };
  }
  const merge = runGit(mainCheckout, [
    "merge",
    "--ff-only",
    `change/${changeId}`,
  ]);
  if (merge.status === 0) {
    return {
      status: "merged",
      mergeCommitSha: runGitOrThrow(mainCheckout, ["rev-parse", "HEAD"], deps),
      mergeMethod: "ff-only",
    };
  }

  const message = merge.stderr || merge.stdout || "merge failed";
  const conflictFiles = splitLines(
    runGit(mainCheckout, ["diff", "--name-only", "--diff-filter=U"]).stdout,
  );
  runGit(mainCheckout, ["merge", "--abort"]);

  if (
    merge.status === 1 ||
    conflictFiles.length > 0 ||
    /CONFLICT/i.test(message)
  ) {
    return {
      status: "blocked",
      code: "MERGE_CONFLICT",
      conflictFiles,
      message,
    };
  }

  // rq-fix-phase9-commit-diverge AC1: ff-only failed but not a conflict
  // (e.g. trunk advanced concurrently with a release-please CHANGELOG
  // commit while the archive bundle commit was being written on the
  // change branch). Try --no-ff, which preserves both histories.
  // Conflict detection above already short-circuited; this path only
  // runs when histories are genuinely mergeable but not fast-forwardable.
  const noff = runGit(mainCheckout, [
    "merge",
    "--no-ff",
    "--no-edit",
    "-m",
    `merge: archive bundle for ${changeId}`,
    `change/${changeId}`,
  ]);
  if (noff.status === 0) {
    return {
      status: "merged",
      mergeCommitSha: runGitOrThrow(mainCheckout, ["rev-parse", "HEAD"], deps),
      mergeMethod: "no-ff",
    };
  }

  // no-ff also failed — abort any partial state and report the original
  // failure cause.
  const noffConflictFiles = splitLines(
    runGit(mainCheckout, ["diff", "--name-only", "--diff-filter=U"]).stdout,
  );
  runGit(mainCheckout, ["merge", "--abort"]);
  const noffMessage = noff.stderr || noff.stdout || message;
  if (noffConflictFiles.length > 0 || /CONFLICT/i.test(noffMessage)) {
    return {
      status: "blocked",
      code: "MERGE_CONFLICT",
      conflictFiles: noffConflictFiles,
      message: noffMessage,
    };
  }

  return { status: "blocked", code: "MERGE_FAILED", message: noffMessage };
}

export const mergeToTrunk = mergeChangeBranch;

export function pushToOrigin(
  mainCheckout: string,
  defaultBranch: string,
  options: {
    autoPush: boolean;
    skipPush?: boolean;
    runGit?: GitFinalizeDeps["runGit"];
  },
):
  | { status: "pushed"; output: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string } {
  if (options.skipPush)
    return { status: "skipped", reason: "--no-push requested" };
  if (!options.autoPush)
    return { status: "skipped", reason: "auto_push disabled" };

  const push = (options.runGit ?? defaultRunGit)(
    mainCheckout,
    ["push", "origin", defaultBranch],
    DEFAULT_GIT_PUSH_TIMEOUT_MS,
  );
  if (push.status === 0) {
    return { status: "pushed", output: push.stdout || push.stderr };
  }
  return {
    status: "failed",
    reason: (push.stderr || push.stdout || "push failed").trim(),
  };
}

export function pushChangeBranch(
  workdir: string,
  changeId: string,
  options: {
    autoPush: boolean;
    skipPush?: boolean;
    runGit?: GitFinalizeDeps["runGit"];
  },
):
  | { status: "pushed"; output: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string } {
  if (options.skipPush)
    return { status: "skipped", reason: "--no-push requested" };
  if (!options.autoPush)
    return { status: "skipped", reason: "auto_push disabled" };

  const branch = `change/${changeId}`;
  const push = (options.runGit ?? defaultRunGit)(
    workdir,
    ["push", "origin", branch],
    DEFAULT_GIT_PUSH_TIMEOUT_MS,
  );
  if (push.status === 0) {
    return { status: "pushed", output: push.stdout || push.stderr };
  }
  return {
    status: "failed",
    reason: (push.stderr || push.stdout || "push failed").trim(),
  };
}

export function verifyChangeBranchPushed(
  mainCheckout: string,
  changeId: string,
  deps: Pick<GitFinalizeDeps, "runGit"> = {},
): { pushed: boolean; reason?: string } {
  const runGit = deps.runGit ?? defaultRunGit;
  const local = runGit(mainCheckout, [
    "rev-parse",
    `refs/heads/change/${changeId}`,
  ]);
  if (local.status !== 0 || !local.stdout.trim()) {
    return {
      pushed: false,
      reason: (
        local.stderr ||
        local.stdout ||
        `change/${changeId} not found locally`
      ).trim(),
    };
  }

  const lsRemote = runGit(mainCheckout, [
    "ls-remote",
    "origin",
    `refs/heads/change/${changeId}`,
  ]);
  if (
    lsRemote.status === 0 &&
    lsRemote.stdout.trim().split(/\s+/)[0] === local.stdout.trim()
  ) {
    return { pushed: true };
  }
  return {
    pushed: false,
    reason: (
      lsRemote.stderr ||
      lsRemote.stdout ||
      `change/${changeId} not found on origin`
    ).trim(),
  };
}

export function verifyDefaultBranchPushed(
  mainCheckout: string,
  defaultBranch: string,
  deps: Pick<GitFinalizeDeps, "runGit"> = {},
): { pushed: boolean; reason?: string } {
  const runGit = deps.runGit ?? defaultRunGit;
  runGit(mainCheckout, ["fetch", "origin", defaultBranch]);
  const localHead = runGit(mainCheckout, ["rev-parse", "HEAD"]);
  if (localHead.status !== 0 || !localHead.stdout.trim()) {
    return {
      pushed: false,
      reason: (
        localHead.stderr ||
        localHead.stdout ||
        "unable to resolve local HEAD"
      ).trim(),
    };
  }
  const remoteHead = runGit(mainCheckout, [
    "ls-remote",
    "origin",
    `refs/heads/${defaultBranch}`,
  ]);
  if (remoteHead.status !== 0 || !remoteHead.stdout.trim()) {
    return {
      pushed: false,
      reason: (
        remoteHead.stderr ||
        remoteHead.stdout ||
        `origin/${defaultBranch} not found`
      ).trim(),
    };
  }
  const remoteSha = remoteHead.stdout.trim().split(/\s+/)[0];
  const localSha = localHead.stdout.trim();
  return remoteSha === localSha
    ? { pushed: true }
    : {
        pushed: false,
        reason: `origin/${defaultBranch} is at ${remoteSha}, local ${defaultBranch} is at ${localSha}`,
      };
}

export function detectArchiveMode(
  config: Record<string, unknown> | undefined,
): { archiveMode: ArchiveMode; autoPush: boolean } {
  const archiveMode = (config?.archive_mode ?? "direct") as unknown;
  if (archiveMode !== "direct" && archiveMode !== "pr") {
    throw new Error(`Invalid archive_mode: ${String(archiveMode)}`);
  }

  return {
    archiveMode,
    autoPush: typeof config?.auto_push === "boolean" ? config.auto_push : true,
  };
}

export interface ValidateWorktreeResult {
  valid: boolean;
  mainCheckout: string;
  currentBranch?: string;
  error?: string;
}

export function validateChangeWorktree(
  workdir: string,
  changeId: string,
  deps: GitFinalizeDeps = {},
): ValidateWorktreeResult {
  const runGit = deps.runGit ?? defaultRunGit;

  // 1. Must share git-common-dir with the project root
  let mainCheckout: string;
  try {
    mainCheckout = resolveMainCheckout(workdir, deps);
  } catch {
    return {
      valid: false,
      mainCheckout: "",
      error: `Worktree ${workdir} is not inside a git repository`,
    };
  }

  // 2. Must be on change/{changeId} branch
  const branchResult = runGit(workdir, ["branch", "--show-current"]);
  const currentBranch = branchResult.stdout.trim();
  const expectedBranch = `change/${changeId}`;
  if (currentBranch !== expectedBranch) {
    return {
      valid: false,
      mainCheckout,
      currentBranch,
      error: `Worktree is on ${currentBranch || "(detached)"}, expected ${expectedBranch}`,
    };
  }

  const topLevel = runGit(workdir, ["rev-parse", "--show-toplevel"]);
  if (topLevel.status !== 0 || !topLevel.stdout.trim()) {
    return {
      valid: false,
      mainCheckout,
      currentBranch,
      error: `Unable to resolve worktree root for ${workdir}`,
    };
  }

  try {
    if (realpathSync(workdir) !== realpathSync(topLevel.stdout.trim())) {
      return {
        valid: false,
        mainCheckout,
        currentBranch,
        error: `Worktree path ${workdir} is not the repository root ${topLevel.stdout.trim()}`,
      };
    }
  } catch (error) {
    return {
      valid: false,
      mainCheckout,
      currentBranch,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (deps.requireCleanWorktree) {
    const dirty = splitLines(runGit(workdir, ["status", "--porcelain"]).stdout);
    if (dirty.length > 0) {
      return {
        valid: false,
        mainCheckout,
        currentBranch,
        error: `Worktree has uncommitted changes before archive writes: ${dirty.join(", ")}`,
      };
    }
  }

  return { valid: true, mainCheckout, currentBranch };
}

function verifyRemoteNotAhead(
  mainCheckout: string,
  defaultBranch: string,
  deps: GitFinalizeDeps = {},
): { ok: true } | { ok: false; reason: string } {
  const runGit = deps.runGit ?? defaultRunGit;
  const fetch = runGit(mainCheckout, ["fetch", "origin", defaultBranch]);
  if (fetch.status !== 0) return { ok: true };

  const divergence = runGit(mainCheckout, [
    "rev-list",
    "--left-right",
    "--count",
    `${defaultBranch}...origin/${defaultBranch}`,
  ]);
  if (divergence.status !== 0 || !divergence.stdout.trim()) {
    return { ok: true };
  }

  const [_localAhead, remoteAhead] = divergence.stdout
    .trim()
    .split(/\s+/)
    .map((value) => Number.parseInt(value, 10));
  if (remoteAhead > 0) {
    return {
      ok: false,
      reason: `origin/${defaultBranch} has ${remoteAhead} commit(s) not present locally`,
    };
  }
  return { ok: true };
}

export function commitArchiveArtifacts(
  workdir: string,
  changeId: string,
  deps: GitFinalizeDeps = {},
): { committed: boolean; commitSha?: string; error?: string } {
  const runGit = deps.runGit ?? defaultRunGit;

  // Check if there are any changes to commit
  const status = runGit(workdir, ["status", "--porcelain", ".adv/"]);
  if (status.status !== 0) {
    return {
      committed: false,
      error: `git status failed: ${status.stderr}`,
    };
  }
  const changes = splitLines(status.stdout);
  if (changes.length === 0) {
    return { committed: false };
  }

  // Stage and commit
  const add = runGit(workdir, ["add", ".adv/"]);
  if (add.status !== 0) {
    return {
      committed: false,
      error: `git add failed: ${add.stderr}`,
    };
  }

  const commit = runGit(workdir, [
    "commit",
    "-m",
    `Archive ${changeId}: apply spec deltas and bundle`,
  ]);
  if (commit.status !== 0) {
    return {
      committed: false,
      error: `git commit failed: ${commit.stderr}`,
    };
  }

  const sha = runGitOrThrow(workdir, ["rev-parse", "HEAD"], deps);
  return { committed: true, commitSha: sha };
}

export interface GitFinalizeContext {
  changeId: string;
  workdir: string;
  expectedMainCheckout?: string;
  archiveMode: ArchiveMode;
  autoPush: boolean;
  skipPush?: boolean;
}

export async function finalizeRelease(
  ctx: GitFinalizeContext,
  deps: GitFinalizeDeps = {},
): Promise<GitFinalizeOutcome> {
  // Validate worktree before any mutation
  const worktreeValidation = validateChangeWorktree(
    ctx.workdir,
    ctx.changeId,
    deps,
  );
  if (!worktreeValidation.valid) {
    return {
      status: "blocked",
      mainCheckout: worktreeValidation.mainCheckout,
      defaultBranch: "",
      pushStatus: "not_attempted",
      blocked: {
        reason: "INVALID_WORKTREE",
        remediation: `${worktreeValidation.error}. rq-releaseFinalization01 requires a validated change worktree on branch change/${ctx.changeId}.`,
      },
    };
  }

  const mainCheckout = worktreeValidation.mainCheckout;
  if (ctx.expectedMainCheckout && mainCheckout !== ctx.expectedMainCheckout) {
    return {
      status: "blocked",
      mainCheckout,
      defaultBranch: "",
      pushStatus: "not_attempted",
      blocked: {
        reason: "WORKTREE_PROJECT_MISMATCH",
        remediation: `Worktree ${ctx.workdir} belongs to ${mainCheckout}, expected ${ctx.expectedMainCheckout}. rq-releaseFinalization01 requires finalization inside this ADV project.`,
      },
    };
  }
  const { branch: defaultBranch } = detectDefaultBranch(mainCheckout, deps);

  // Commit in-repo archive artifacts before merge
  const commitResult = commitArchiveArtifacts(ctx.workdir, ctx.changeId, deps);
  if (commitResult.error) {
    return {
      status: "blocked",
      mainCheckout,
      defaultBranch,
      pushStatus: "not_attempted",
      blocked: {
        reason: "ARCHIVE_COMMIT_FAILED",
        remediation: `${commitResult.error}. rq-releaseFinalization01 requires archive artifacts to be committed before merge.`,
      },
    };
  }

  if (ctx.archiveMode === "pr") {
    const branchPush = pushChangeBranch(ctx.workdir, ctx.changeId, {
      autoPush: ctx.autoPush,
      skipPush: ctx.skipPush,
      runGit: deps.runGit,
    });

    if (branchPush.status === "pushed") {
      return {
        status: "pr_pushed",
        mainCheckout,
        defaultBranch,
        prBranch: `change/${ctx.changeId}`,
        pushStatus: "pushed",
      };
    }

    return {
      status: "blocked",
      mainCheckout,
      defaultBranch,
      prBranch: `change/${ctx.changeId}`,
      pushStatus: branchPush.status,
      pushFailureReason: branchPush.reason,
      blocked: {
        reason:
          branchPush.status === "failed"
            ? "PR_BRANCH_PUSH_FAILED"
            : "PR_BRANCH_PUSH_SKIPPED",
        remediation: `Change branch change/${ctx.changeId} must be pushed for PR-mode handoff before release completion (rq-releaseFinalization01).`,
        details: [branchPush.reason],
      },
    };
  }

  const invariants = verifyMainInvariants(mainCheckout, defaultBranch, deps);
  if (!invariants.ok) {
    return {
      status: "blocked",
      mainCheckout,
      defaultBranch,
      pushStatus: "not_attempted",
      blocked: {
        reason: invariants.code,
        remediation: `${invariants.message}. rq-releaseFinalization01 requires a clean ${defaultBranch} checkout before archive finalization.`,
        details: invariants.dirtyFiles,
      },
    };
  }

  const beforeMergeReachability = verifyChangeBranchReachable(
    mainCheckout,
    defaultBranch,
    ctx.changeId,
    deps,
  );

  const remotePreflight = verifyRemoteNotAhead(
    mainCheckout,
    defaultBranch,
    deps,
  );
  if (!remotePreflight.ok) {
    return {
      status: "blocked",
      mainCheckout,
      defaultBranch,
      pushStatus: "not_attempted",
      blocked: {
        reason: "DEFAULT_BRANCH_REMOTE_DIVERGED",
        remediation: `${remotePreflight.reason}. Update ${defaultBranch} before archive finalization; no local default-branch mutation was performed (rq-releaseFinalization01).`,
      },
    };
  }

  let mergeCommitSha: string | undefined;
  if (!beforeMergeReachability.reachable) {
    const merge = mergeToTrunk(mainCheckout, defaultBranch, ctx.changeId, deps);
    if (merge.status === "blocked") {
      return {
        status: "blocked",
        mainCheckout,
        defaultBranch,
        pushStatus: "not_attempted",
        blocked: {
          reason: merge.code,
          remediation: `Resolve Phase 9 merge blockers for change/${ctx.changeId}, then rerun archive finalization (rq-releaseFinalization01).`,
          details: merge.conflictFiles,
        },
      };
    }
    mergeCommitSha = merge.mergeCommitSha;
  } else {
    mergeCommitSha = runGitOrThrow(mainCheckout, ["rev-parse", "HEAD"], deps);
  }

  const push = pushToOrigin(mainCheckout, defaultBranch, {
    autoPush: ctx.autoPush,
    skipPush: ctx.skipPush,
    runGit: deps.runGit,
  });

  if (push.status === "pushed") {
    return {
      status: "shipped",
      mainCheckout,
      defaultBranch,
      mergeCommitSha,
      pushStatus: "pushed",
    };
  }

  return {
    status: "blocked",
    mainCheckout,
    defaultBranch,
    mergeCommitSha,
    pushStatus: push.status,
    pushFailureReason: push.reason,
    blocked: {
      reason:
        push.status === "failed"
          ? "DEFAULT_BRANCH_PUSH_FAILED"
          : "DEFAULT_BRANCH_PUSH_SKIPPED",
      remediation: `Default branch ${defaultBranch} must be pushed before archive finalization can complete (rq-releaseFinalization01).`,
      details: [push.reason],
    },
  };
}
