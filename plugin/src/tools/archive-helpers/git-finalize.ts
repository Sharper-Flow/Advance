import { spawnSync } from "child_process";
import { dirname } from "path";

export type ArchiveMode = "direct" | "pr";

export interface GitFinalizeOutcome {
  status: "shipped" | "merged_locally" | "blocked" | "pr_pushed";
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
  runGit?: (cwd: string, args: string[]) => RunGitResult;
  commandExists?: (command: string) => boolean;
}

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

function defaultRunGit(cwd: string, args: string[]): RunGitResult {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return {
    status: result.status,
    stdout: redactGitOutput(result.stdout ?? ""),
    stderr: redactGitOutput(result.stderr ?? ""),
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

function commandExists(command: string): boolean {
  const result = spawnSync("which", [command], { encoding: "utf8" });
  return result.status === 0;
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

export type MergeChangeBranchResult =
  | { status: "merged"; mergeCommitSha: string }
  | {
      status: "blocked";
      code: "MERGE_CONFLICT" | "MERGE_FAILED";
      conflictFiles?: string[];
      message: string;
    };

export function mergeChangeBranch(
  mainCheckout: string,
  _defaultBranch: string,
  changeId: string,
  deps: GitFinalizeDeps = {},
): MergeChangeBranchResult {
  const runGit = deps.runGit ?? defaultRunGit;
  const merge = runGit(mainCheckout, [
    "merge",
    "--ff-only",
    `change/${changeId}`,
  ]);
  if (merge.status === 0) {
    return {
      status: "merged",
      mergeCommitSha: runGitOrThrow(mainCheckout, ["rev-parse", "HEAD"], deps),
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

  return { status: "blocked", code: "MERGE_FAILED", message };
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

  const push = (options.runGit ?? defaultRunGit)(mainCheckout, [
    "push",
    "origin",
    defaultBranch,
  ]);
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
  const push = (options.runGit ?? defaultRunGit)(workdir, [
    "push",
    "origin",
    branch,
  ]);
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
  const lsRemote = (deps.runGit ?? defaultRunGit)(mainCheckout, [
    "ls-remote",
    "origin",
    `refs/heads/change/${changeId}`,
  ]);
  if (lsRemote.status === 0 && lsRemote.stdout.trim()) {
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

export function detectArchiveMode(
  config: Record<string, unknown> | undefined,
  deps: Pick<GitFinalizeDeps, "commandExists"> = {},
): { archiveMode: ArchiveMode; autoPush: boolean } {
  const archiveMode = (config?.archive_mode ?? "direct") as unknown;
  if (archiveMode !== "direct" && archiveMode !== "pr") {
    throw new Error(`Invalid archive_mode: ${String(archiveMode)}`);
  }

  if (archiveMode === "pr" && !(deps.commandExists ?? commandExists)("gh")) {
    throw new Error("gh CLI is required when archive_mode is 'pr'");
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

  return { valid: true, mainCheckout, currentBranch };
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
    status: "merged_locally",
    mainCheckout,
    defaultBranch,
    mergeCommitSha,
    pushStatus: push.status,
    pushFailureReason: push.reason,
  };
}
