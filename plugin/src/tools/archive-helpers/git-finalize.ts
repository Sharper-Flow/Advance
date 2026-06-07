import { realpathSync } from "fs";
import { spawnSync } from "child_process";
import { dirname } from "path";
import { spawnSyncGit } from "../../utils/git-binary";

export type ArchiveMode = "direct" | "pr";

export interface GitFinalizeOutcome {
  status: "shipped" | "blocked" | "pr_pushed" | "pending_merge";
  mainCheckout: string;
  defaultBranch: string;
  route?: ReleaseFinalizationRouteName;
  mergeCommitSha?: string;
  /** SHA of the dirty-main checkpoint commit, set when ADV committed pre-existing
   *  main checkout changes before merge (rq-releaseFinalization01.7). */
  mainCheckpointCommitSha?: string;
  pushStatus: "pushed" | "skipped" | "failed" | "not_attempted";
  pushFailureReason?: string;
  prBranch?: string;
  prNumber?: number;
  prUrl?: string;
  autoMergeArmed?: boolean;
  blocked?: { reason: string; remediation: string; details?: string[] };
}

export interface RunGitResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface GitFinalizeDeps {
  runGit?: (cwd: string, args: string[], timeoutMs?: number) => RunGitResult;
  runGh?: (cwd: string, args: string[], timeoutMs?: number) => RunGitResult;
  requireCleanWorktree?: boolean;
}

export type ReleaseFinalizationRouteName =
  | "no_remote"
  | "direct"
  | "pr_auto_merge"
  | "pr_manual"
  | "blocked";

export interface FinalizationRoute {
  route: ReleaseFinalizationRouteName;
  repo?: string;
  remoteUrl?: string;
  protected?: boolean;
  autoMergeAllowed?: boolean;
  reason?: string;
  details?: string[];
}

export interface PullRequestMergeState {
  state: string;
  mergedAt?: string | null;
  mergeCommitOid?: string;
  autoMergeArmed: boolean;
  raw?: unknown;
}

interface PullRequestSummary {
  number: number;
  url: string;
  state: string;
  autoMergeArmed: boolean;
}

export interface ReleaseReachabilityInput {
  mainCheckout: string;
  defaultBranch: string;
  changeId: string;
  route?: FinalizationRoute;
  prNumber?: number;
}

export type ReleaseReachabilityProof =
  | {
      reachable: true;
      proof: "local_merge" | "origin_default" | "pr_merged";
      prNumber?: number;
      mergeCommitOid?: string;
      details?: string[];
    }
  | {
      reachable: false;
      proof:
        | "local_unmerged"
        | "origin_unmerged"
        | "origin_push_unverified"
        | "pr_unmerged"
        | "blocked";
      prNumber?: number;
      autoMergeArmed?: boolean;
      details?: string[];
    };

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

function defaultRunGh(
  cwd: string,
  args: string[],
  timeoutMs: number = DEFAULT_GIT_TIMEOUT_MS,
): RunGitResult {
  const result = spawnSync("gh", args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GH_PROMPT_DISABLED: "1",
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
      ? `gh ${args.join(" ")} timed out after ${timeoutMs}ms`
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

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value.trim() || "null");
  } catch {
    return undefined;
  }
}

export function parseGitHubRepoFromRemote(url: string): string | undefined {
  const trimmed = url.trim().replace(/\.git$/, "");
  const match = trimmed.match(
    /github\.com[:/]([^/\s:]+)\/([^/\s]+(?:\/[^/\s]+)*)$/i,
  );
  if (!match) return undefined;
  const owner = match[1];
  const repo = match[2]?.split("/").pop();
  return owner && repo ? `${owner}/${repo}` : undefined;
}

function getOriginRemote(
  mainCheckout: string,
  deps: Pick<GitFinalizeDeps, "runGit"> = {},
):
  | { configured: true; remoteUrl: string; repo?: string }
  | { configured: false; reason: string } {
  const runGit = deps.runGit ?? defaultRunGit;
  const remote = runGit(mainCheckout, ["remote", "get-url", "origin"]);
  if (remote.status !== 0 || !remote.stdout.trim()) {
    return {
      configured: false,
      reason: (
        remote.stderr ||
        remote.stdout ||
        "origin remote not configured"
      ).trim(),
    };
  }
  const remoteUrl = remote.stdout.trim();
  return {
    configured: true,
    remoteUrl,
    repo: parseGitHubRepoFromRemote(remoteUrl),
  };
}

function ghFailureReason(result: RunGitResult): string {
  if (result.status === 127) return "GITHUB_CLI_UNAVAILABLE";
  if (/not found|command not found/i.test(result.stderr || result.stdout)) {
    return "GITHUB_CLI_UNAVAILABLE";
  }
  if (
    /not authenticated|authentication|authorization|Bad credentials/i.test(
      result.stderr || result.stdout,
    )
  ) {
    return "GITHUB_CLI_UNAUTHENTICATED";
  }
  return "GITHUB_API_UNAVAILABLE";
}

export function classifyFinalizationRoute(
  mainCheckout: string,
  defaultBranch: string,
  deps: Pick<GitFinalizeDeps, "runGit" | "runGh"> = {},
): FinalizationRoute {
  const origin = getOriginRemote(mainCheckout, deps);
  if (!origin.configured) {
    return {
      route: "no_remote",
      reason: origin.reason,
    };
  }

  if (!origin.repo) {
    return {
      route: "pr_manual",
      remoteUrl: origin.remoteUrl,
      reason: "GITHUB_REPO_UNRESOLVABLE",
      details: [
        `Unable to derive owner/repo from origin URL ${origin.remoteUrl}`,
      ],
    };
  }

  const runGh = deps.runGh ?? defaultRunGh;
  const rules = runGh(mainCheckout, [
    "api",
    `repos/${origin.repo}/rules/branches/${encodeURIComponent(defaultBranch)}`,
  ]);
  if (rules.status !== 0) {
    return {
      route: "pr_manual",
      repo: origin.repo,
      remoteUrl: origin.remoteUrl,
      reason: ghFailureReason(rules),
      details: splitLines(rules.stderr || rules.stdout),
    };
  }

  const parsedRules = parseJson(rules.stdout);
  if (!Array.isArray(parsedRules)) {
    return {
      route: "pr_manual",
      repo: origin.repo,
      remoteUrl: origin.remoteUrl,
      reason: "BRANCH_RULES_UNPARSEABLE",
      details: splitLines(rules.stdout),
    };
  }

  if (parsedRules.length === 0) {
    return {
      route: "direct",
      repo: origin.repo,
      remoteUrl: origin.remoteUrl,
      protected: false,
    };
  }

  const allowAutoMerge = runGh(mainCheckout, [
    "api",
    `repos/${origin.repo}`,
    "--jq",
    ".allow_auto_merge",
  ]);
  if (allowAutoMerge.status !== 0) {
    return {
      route: "pr_manual",
      repo: origin.repo,
      remoteUrl: origin.remoteUrl,
      protected: true,
      reason: "AUTO_MERGE_STATUS_UNAVAILABLE",
      details: splitLines(allowAutoMerge.stderr || allowAutoMerge.stdout),
    };
  }

  const parsedAllowAutoMerge = parseJson(allowAutoMerge.stdout);
  if (parsedAllowAutoMerge === true) {
    return {
      route: "pr_auto_merge",
      repo: origin.repo,
      remoteUrl: origin.remoteUrl,
      protected: true,
      autoMergeAllowed: true,
    };
  }

  return {
    route: "pr_manual",
    repo: origin.repo,
    remoteUrl: origin.remoteUrl,
    protected: true,
    autoMergeAllowed: false,
    reason: "AUTO_MERGE_DISABLED",
  };
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

// --- Dirty-main checkpoint helpers (rq-releaseFinalization01.7/.8) ---

export function verifyGitIdentity(
  mainCheckout: string,
  deps: GitFinalizeDeps = {},
): { ok: true; ident: string } | { ok: false; message: string } {
  const runGit = deps.runGit ?? defaultRunGit;
  const result = runGit(mainCheckout, ["var", "GIT_COMMITTER_IDENT"]);
  if (result.status !== 0 || !result.stdout.trim()) {
    return {
      ok: false,
      message:
        "Git committer identity is not configured. Set user.name and user.email in the main checkout and retry.",
    };
  }
  return { ok: true, ident: result.stdout.trim() };
}

export type InProgressState =
  | "merging"
  | "rebasing"
  | "cherry-picking"
  | "reverting";

export function detectMainInProgressState(
  mainCheckout: string,
  deps: GitFinalizeDeps = {},
): { inProgress: false } | { inProgress: true; state: InProgressState } {
  const runGit = deps.runGit ?? defaultRunGit;

  // MERGE_HEAD
  const mergeHead = runGit(mainCheckout, [
    "rev-parse",
    "--verify",
    "MERGE_HEAD",
  ]);
  if (mergeHead.status === 0) {
    return { inProgress: true, state: "merging" };
  }

  // REBASE_HEAD or .git/rebase-merge
  const rebaseHead = runGit(mainCheckout, [
    "rev-parse",
    "--verify",
    "REBASE_HEAD",
  ]);
  if (rebaseHead.status === 0) {
    return { inProgress: true, state: "rebasing" };
  }

  // CHERRY_PICK_HEAD
  const cherryPick = runGit(mainCheckout, [
    "rev-parse",
    "--verify",
    "CHERRY_PICK_HEAD",
  ]);
  if (cherryPick.status === 0) {
    return { inProgress: true, state: "cherry-picking" };
  }

  // REVERT_HEAD
  const revertHead = runGit(mainCheckout, [
    "rev-parse",
    "--verify",
    "REVERT_HEAD",
  ]);
  if (revertHead.status === 0) {
    return { inProgress: true, state: "reverting" };
  }

  return { inProgress: false };
}

export function commitDirtyMainCheckpoint(
  mainCheckout: string,
  changeId: string,
  deps: GitFinalizeDeps = {},
): { committed: boolean; commitSha?: string; error?: string } {
  const runGit = deps.runGit ?? defaultRunGit;

  const status = runGit(mainCheckout, ["status", "--porcelain"]);
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

  // Stage all non-ignored changes (tracked + untracked)
  const add = runGit(mainCheckout, ["add", "-A"]);
  if (add.status !== 0) {
    return {
      committed: false,
      error: `git add -A failed: ${add.stderr}`,
    };
  }

  const commit = runGit(mainCheckout, [
    "commit",
    "-m",
    `chore(adv-archive): checkpoint main before archiving ${changeId}`,
  ]);
  if (commit.status !== 0) {
    return {
      committed: false,
      error: `git commit failed: ${commit.stderr}`,
    };
  }

  const sha = runGitOrThrow(mainCheckout, ["rev-parse", "HEAD"], deps);
  return { committed: true, commitSha: sha };
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

export function verifyChangeBranchReachableFromOrigin(
  mainCheckout: string,
  defaultBranch: string,
  changeId: string,
  deps: GitFinalizeDeps = {},
): { reachable: boolean; unmergedCommits: string[] } {
  const runGit = deps.runGit ?? defaultRunGit;
  const fetch = runGit(mainCheckout, ["fetch", "origin", defaultBranch]);
  if (fetch.status !== 0) {
    return {
      reachable: false,
      unmergedCommits: splitLines(fetch.stderr || fetch.stdout),
    };
  }
  const result = runGit(mainCheckout, [
    "log",
    "--oneline",
    `origin/${defaultBranch}..change/${changeId}`,
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

export function readPrMergeState(
  mainCheckout: string,
  repo: string,
  prNumber: number,
  deps: Pick<GitFinalizeDeps, "runGh"> = {},
): PullRequestMergeState | { error: string; details?: string[] } {
  const runGh = deps.runGh ?? defaultRunGh;
  const result = runGh(mainCheckout, [
    "pr",
    "view",
    String(prNumber),
    "--repo",
    repo,
    "--json",
    "state,mergedAt,mergeCommit,autoMergeRequest",
  ]);
  if (result.status !== 0) {
    return {
      error: ghFailureReason(result),
      details: splitLines(result.stderr || result.stdout),
    };
  }
  const parsed = parseJson(result.stdout);
  if (!parsed || typeof parsed !== "object") {
    return {
      error: "PR_STATE_UNPARSEABLE",
      details: splitLines(result.stdout),
    };
  }
  const payload = parsed as {
    state?: unknown;
    mergedAt?: unknown;
    mergeCommit?: { oid?: unknown } | null;
    autoMergeRequest?: unknown;
  };
  return {
    state: typeof payload.state === "string" ? payload.state : "UNKNOWN",
    mergedAt: typeof payload.mergedAt === "string" ? payload.mergedAt : null,
    mergeCommitOid:
      payload.mergeCommit && typeof payload.mergeCommit.oid === "string"
        ? payload.mergeCommit.oid
        : undefined,
    autoMergeArmed:
      payload.autoMergeRequest !== null &&
      payload.autoMergeRequest !== undefined,
    raw: parsed,
  };
}

function parsePullRequestSummary(
  value: unknown,
): PullRequestSummary | { error: string; details?: string[] } {
  if (!value || typeof value !== "object") {
    return { error: "PR_SUMMARY_UNPARSEABLE" };
  }
  const payload = value as {
    number?: unknown;
    url?: unknown;
    state?: unknown;
    autoMergeRequest?: unknown;
  };
  if (typeof payload.number !== "number" || !Number.isInteger(payload.number)) {
    return { error: "PR_NUMBER_MISSING" };
  }
  if (typeof payload.url !== "string" || !payload.url.trim()) {
    return { error: "PR_URL_MISSING" };
  }
  return {
    number: payload.number,
    url: payload.url,
    state: typeof payload.state === "string" ? payload.state : "UNKNOWN",
    autoMergeArmed:
      payload.autoMergeRequest !== null &&
      payload.autoMergeRequest !== undefined,
  };
}

function readPullRequestByBranch(
  mainCheckout: string,
  repo: string,
  branch: string,
  deps: Pick<GitFinalizeDeps, "runGh"> = {},
): PullRequestSummary | { error: string; details?: string[] } {
  const runGh = deps.runGh ?? defaultRunGh;
  const result = runGh(mainCheckout, [
    "pr",
    "view",
    branch,
    "--repo",
    repo,
    "--json",
    "number,url,state,autoMergeRequest",
  ]);
  if (result.status !== 0) {
    return {
      error: ghFailureReason(result),
      details: splitLines(result.stderr || result.stdout),
    };
  }
  const parsed = parseJson(result.stdout);
  const summary = parsePullRequestSummary(parsed);
  return "error" in summary
    ? { ...summary, details: splitLines(result.stdout) }
    : summary;
}

function createArchivePullRequest(
  input: {
    mainCheckout: string;
    repo: string;
    branch: string;
    defaultBranch: string;
    changeId: string;
  },
  deps: Pick<GitFinalizeDeps, "runGh"> = {},
):
  | { ok: true; url?: string }
  | { ok: false; reason: string; details?: string[] } {
  const runGh = deps.runGh ?? defaultRunGh;
  const result = runGh(input.mainCheckout, [
    "pr",
    "create",
    "--repo",
    input.repo,
    "--head",
    input.branch,
    "--base",
    input.defaultBranch,
    "--title",
    `Archive ${input.changeId}`,
    "--body",
    `ADV Phase 9 archive finalization for ${input.branch}.`,
  ]);
  if (result.status !== 0) {
    return {
      ok: false,
      reason: ghFailureReason(result),
      details: splitLines(result.stderr || result.stdout),
    };
  }
  return { ok: true, url: splitLines(result.stdout)[0] };
}

function ensureArchivePullRequest(
  input: {
    mainCheckout: string;
    repo: string;
    branch: string;
    defaultBranch: string;
    changeId: string;
  },
  deps: Pick<GitFinalizeDeps, "runGh"> = {},
): PullRequestSummary | { error: string; details?: string[] } {
  const existing = readPullRequestByBranch(
    input.mainCheckout,
    input.repo,
    input.branch,
    deps,
  );
  if (!("error" in existing)) {
    if (existing.state === "CLOSED") {
      return {
        error: "PR_CLOSED",
        details: [`Existing PR ${existing.url} is closed`],
      };
    }
    return existing;
  }

  const created = createArchivePullRequest(input, deps);
  if (!created.ok) {
    return { error: created.reason, details: created.details };
  }

  const afterCreate = readPullRequestByBranch(
    input.mainCheckout,
    input.repo,
    input.branch,
    deps,
  );
  if ("error" in afterCreate) {
    return {
      error: afterCreate.error,
      details: [
        ...(created.url ? [`created=${created.url}`] : []),
        ...(afterCreate.details ?? []),
      ],
    };
  }
  return afterCreate;
}

function armPullRequestAutoMerge(
  mainCheckout: string,
  repo: string,
  prNumber: number,
  deps: Pick<GitFinalizeDeps, "runGh"> = {},
): { ok: true } | { ok: false; reason: string; details?: string[] } {
  const runGh = deps.runGh ?? defaultRunGh;
  const result = runGh(mainCheckout, [
    "pr",
    "merge",
    String(prNumber),
    "--repo",
    repo,
    "--squash",
    "--auto",
  ]);
  if (result.status !== 0) {
    return {
      ok: false,
      reason: ghFailureReason(result),
      details: splitLines(result.stderr || result.stdout),
    };
  }
  return { ok: true };
}

function resetMainToOriginDefault(
  mainCheckout: string,
  defaultBranch: string,
  deps: Pick<GitFinalizeDeps, "runGit"> = {},
): { ok: true } | { ok: false; reason: string; details?: string[] } {
  const runGit = deps.runGit ?? defaultRunGit;
  const fetch = runGit(mainCheckout, ["fetch", "origin", defaultBranch]);
  if (fetch.status !== 0) {
    return {
      ok: false,
      reason: "DEFAULT_BRANCH_FETCH_FAILED",
      details: splitLines(fetch.stderr || fetch.stdout),
    };
  }
  const reset = runGit(mainCheckout, [
    "reset",
    "--hard",
    `origin/${defaultBranch}`,
  ]);
  if (reset.status !== 0) {
    return {
      ok: false,
      reason: "DEFAULT_BRANCH_RESET_FAILED",
      details: splitLines(reset.stderr || reset.stdout),
    };
  }
  return { ok: true };
}

function completeProtectedBranchViaPullRequest(
  input: {
    mainCheckout: string;
    workdir: string;
    changeId: string;
    defaultBranch: string;
    route: FinalizationRoute;
    pushFailureReason: string;
  },
  deps: GitFinalizeDeps = {},
): GitFinalizeOutcome {
  const branch = `change/${input.changeId}`;
  if (!input.route.repo) {
    return {
      status: "blocked",
      mainCheckout: input.mainCheckout,
      defaultBranch: input.defaultBranch,
      route: input.route.route,
      pushStatus: "failed",
      pushFailureReason: input.pushFailureReason,
      prBranch: branch,
      blocked: {
        reason: "GITHUB_REPO_UNRESOLVABLE",
        remediation: `Unable to derive GitHub repo for ${branch}; create or merge a PR manually before release completion (rq-releaseFinalization01).`,
        details: input.route.details,
      },
    };
  }

  const reset = resetMainToOriginDefault(
    input.mainCheckout,
    input.defaultBranch,
    deps,
  );
  if (!reset.ok) {
    return {
      status: "blocked",
      mainCheckout: input.mainCheckout,
      defaultBranch: input.defaultBranch,
      route: input.route.route,
      pushStatus: "failed",
      pushFailureReason: input.pushFailureReason,
      prBranch: branch,
      blocked: {
        reason: reset.reason,
        remediation: `Default branch ${input.defaultBranch} must be reconciled to origin/${input.defaultBranch} before PR auto-merge handoff (rq-releaseFinalization01).`,
        details: reset.details,
      },
    };
  }

  const branchPush = pushChangeBranch(input.workdir, input.changeId, {
    autoPush: true,
    runGit: deps.runGit,
  });
  if (branchPush.status !== "pushed") {
    return {
      status: "blocked",
      mainCheckout: input.mainCheckout,
      defaultBranch: input.defaultBranch,
      route: input.route.route,
      pushStatus: branchPush.status,
      pushFailureReason: branchPush.reason,
      prBranch: branch,
      blocked: {
        reason:
          branchPush.status === "failed"
            ? "PR_BRANCH_PUSH_FAILED"
            : "PR_BRANCH_PUSH_SKIPPED",
        remediation: `Change branch ${branch} must be pushed before PR auto-merge handoff (rq-releaseFinalization01).`,
        details: [branchPush.reason],
      },
    };
  }

  const pr = ensureArchivePullRequest(
    {
      mainCheckout: input.mainCheckout,
      repo: input.route.repo,
      branch,
      defaultBranch: input.defaultBranch,
      changeId: input.changeId,
    },
    deps,
  );
  if ("error" in pr) {
    return {
      status: "blocked",
      mainCheckout: input.mainCheckout,
      defaultBranch: input.defaultBranch,
      route: input.route.route,
      pushStatus: "pushed",
      pushFailureReason: input.pushFailureReason,
      prBranch: branch,
      blocked: {
        reason: pr.error,
        remediation: `Open or reuse a PR for ${branch}, then rerun archive finalization (rq-releaseFinalization01).`,
        details: pr.details,
      },
    };
  }

  const armed = armPullRequestAutoMerge(
    input.mainCheckout,
    input.route.repo,
    pr.number,
    deps,
  );
  if (!armed.ok) {
    return {
      status: "blocked",
      mainCheckout: input.mainCheckout,
      defaultBranch: input.defaultBranch,
      route: input.route.route,
      pushStatus: "pushed",
      pushFailureReason: input.pushFailureReason,
      prBranch: branch,
      prNumber: pr.number,
      prUrl: pr.url,
      blocked: {
        reason: "AUTO_MERGE_ARM_FAILED",
        remediation: `Enable auto-merge or manually merge PR ${pr.url}, then rerun archive finalization (rq-releaseFinalization01).`,
        details: [armed.reason, ...(armed.details ?? [])],
      },
    };
  }

  const reachability = resolveReleaseReachability(
    {
      mainCheckout: input.mainCheckout,
      defaultBranch: input.defaultBranch,
      changeId: input.changeId,
      route: input.route,
      prNumber: pr.number,
    },
    deps,
  );
  if (reachability.reachable && reachability.proof === "pr_merged") {
    return {
      status: "shipped",
      mainCheckout: input.mainCheckout,
      defaultBranch: input.defaultBranch,
      route: input.route.route,
      mergeCommitSha: reachability.mergeCommitOid,
      pushStatus: "pushed",
      pushFailureReason: input.pushFailureReason,
      prBranch: branch,
      prNumber: pr.number,
      prUrl: pr.url,
      autoMergeArmed: false,
    };
  }
  if (!reachability.reachable && reachability.autoMergeArmed) {
    return {
      status: "pending_merge",
      mainCheckout: input.mainCheckout,
      defaultBranch: input.defaultBranch,
      route: input.route.route,
      pushStatus: "pushed",
      pushFailureReason: input.pushFailureReason,
      prBranch: branch,
      prNumber: pr.number,
      prUrl: pr.url,
      autoMergeArmed: true,
    };
  }

  return {
    status: "blocked",
    mainCheckout: input.mainCheckout,
    defaultBranch: input.defaultBranch,
    route: input.route.route,
    pushStatus: "pushed",
    pushFailureReason: input.pushFailureReason,
    prBranch: branch,
    prNumber: pr.number,
    prUrl: pr.url,
    autoMergeArmed: false,
    blocked: {
      reason: "PR_AUTO_MERGE_NOT_ARMED",
      remediation: `PR ${pr.url} must be merged or have auto-merge armed before release completion (rq-releaseFinalization01).`,
      details: reachability.details,
    },
  };
}

export interface ArchivedUnmergedBranch {
  changeId: string;
  branch: string;
  remoteRef: string;
  sha: string;
  unmergedCommits: string[];
}

export type ArchivedUnmergedBranchesResult =
  | { status: "ok"; branches: ArchivedUnmergedBranch[] }
  | { status: "blocked"; reason: string; details?: string[] };

function parseRemoteChangeBranchRefs(output: string): Array<{
  changeId: string;
  branch: string;
  remoteRef: string;
  sha: string;
}> {
  return splitLines(output)
    .map((line) => {
      const [sha, remoteRef] = line.split(/\s+/, 2);
      const prefix = "refs/heads/change/";
      if (!sha || !remoteRef?.startsWith(prefix)) return null;
      const changeId = remoteRef.slice(prefix.length);
      if (!changeId) return null;
      return {
        changeId,
        branch: `change/${changeId}`,
        remoteRef,
        sha,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

export function detectArchivedUnmergedBranches(
  input: {
    mainCheckout: string;
    defaultBranch: string;
    archivedChangeIds?: string[];
  },
  deps: Pick<GitFinalizeDeps, "runGit"> = {},
): ArchivedUnmergedBranchesResult {
  const runGit = deps.runGit ?? defaultRunGit;
  const archivedSet = input.archivedChangeIds
    ? new Set(input.archivedChangeIds)
    : null;
  const remoteBranches = runGit(input.mainCheckout, [
    "ls-remote",
    "--heads",
    "origin",
    "refs/heads/change/*",
  ]);
  if (remoteBranches.status !== 0) {
    return {
      status: "blocked",
      reason: "CHANGE_BRANCH_LIST_FAILED",
      details: splitLines(remoteBranches.stderr || remoteBranches.stdout),
    };
  }

  const defaultFetch = runGit(input.mainCheckout, [
    "fetch",
    "origin",
    input.defaultBranch,
  ]);
  if (defaultFetch.status !== 0) {
    return {
      status: "blocked",
      reason: "DEFAULT_BRANCH_FETCH_FAILED",
      details: splitLines(defaultFetch.stderr || defaultFetch.stdout),
    };
  }

  const candidates = parseRemoteChangeBranchRefs(remoteBranches.stdout).filter(
    (entry) => !archivedSet || archivedSet.has(entry.changeId),
  );
  const branches: ArchivedUnmergedBranch[] = [];
  for (const candidate of candidates) {
    const branchFetch = runGit(input.mainCheckout, [
      "fetch",
      "origin",
      `+refs/heads/${candidate.branch}:refs/remotes/origin/${candidate.branch}`,
    ]);
    if (branchFetch.status !== 0) {
      branches.push({
        ...candidate,
        unmergedCommits: splitLines(branchFetch.stderr || branchFetch.stdout),
      });
      continue;
    }
    const unmerged = runGit(input.mainCheckout, [
      "log",
      "--oneline",
      `origin/${input.defaultBranch}..origin/${candidate.branch}`,
    ]);
    if (unmerged.status !== 0) {
      branches.push({
        ...candidate,
        unmergedCommits: splitLines(unmerged.stderr || unmerged.stdout),
      });
      continue;
    }
    const unmergedCommits = splitLines(unmerged.stdout);
    if (unmergedCommits.length > 0) {
      branches.push({ ...candidate, unmergedCommits });
    }
  }

  return { status: "ok", branches };
}

export function redriveArchivedUnmergedBranch(
  input: {
    mainCheckout: string;
    defaultBranch: string;
    changeId: string;
  },
  deps: GitFinalizeDeps = {},
): GitFinalizeOutcome {
  const branch = `change/${input.changeId}`;
  const runGit = deps.runGit ?? defaultRunGit;
  const remoteBranch = runGit(input.mainCheckout, [
    "ls-remote",
    "--heads",
    "origin",
    `refs/heads/${branch}`,
  ]);
  if (remoteBranch.status !== 0 || !remoteBranch.stdout.trim()) {
    return {
      status: "blocked",
      mainCheckout: input.mainCheckout,
      defaultBranch: input.defaultBranch,
      pushStatus: "not_attempted",
      prBranch: branch,
      blocked: {
        reason: "REMOTE_CHANGE_BRANCH_NOT_FOUND",
        remediation: `Remote branch ${branch} must exist before archive re-drive can open or arm a PR (rq-releaseFinalization01).`,
        details: splitLines(remoteBranch.stderr || remoteBranch.stdout),
      },
    };
  }

  const route = classifyFinalizationRoute(
    input.mainCheckout,
    input.defaultBranch,
    deps,
  );
  if (route.route !== "pr_auto_merge" || !route.repo) {
    return {
      status: "blocked",
      mainCheckout: input.mainCheckout,
      defaultBranch: input.defaultBranch,
      route: route.route,
      pushStatus: "not_attempted",
      prBranch: branch,
      blocked: {
        reason: route.reason ?? "PR_AUTO_MERGE_UNAVAILABLE",
        remediation: `Auto-merge PR route is required to re-drive archived branch ${branch}; inspect branch protection and GitHub CLI access (rq-releaseFinalization01).`,
        details: route.details,
      },
    };
  }

  const pr = ensureArchivePullRequest(
    {
      mainCheckout: input.mainCheckout,
      repo: route.repo,
      branch,
      defaultBranch: input.defaultBranch,
      changeId: input.changeId,
    },
    deps,
  );
  if ("error" in pr) {
    return {
      status: "blocked",
      mainCheckout: input.mainCheckout,
      defaultBranch: input.defaultBranch,
      route: route.route,
      pushStatus: "not_attempted",
      prBranch: branch,
      blocked: {
        reason: pr.error,
        remediation: `Open or reuse a PR for ${branch}, then rerun archive re-drive (rq-releaseFinalization01).`,
        details: pr.details,
      },
    };
  }

  const armed = armPullRequestAutoMerge(
    input.mainCheckout,
    route.repo,
    pr.number,
    deps,
  );
  if (!armed.ok) {
    return {
      status: "blocked",
      mainCheckout: input.mainCheckout,
      defaultBranch: input.defaultBranch,
      route: route.route,
      pushStatus: "not_attempted",
      prBranch: branch,
      prNumber: pr.number,
      prUrl: pr.url,
      blocked: {
        reason: "AUTO_MERGE_ARM_FAILED",
        remediation: `Enable auto-merge or manually merge PR ${pr.url}, then rerun archive re-drive (rq-releaseFinalization01).`,
        details: [armed.reason, ...(armed.details ?? [])],
      },
    };
  }

  const reachability = resolveReleaseReachability(
    {
      mainCheckout: input.mainCheckout,
      defaultBranch: input.defaultBranch,
      changeId: input.changeId,
      route,
      prNumber: pr.number,
    },
    deps,
  );
  if (reachability.reachable && reachability.proof === "pr_merged") {
    return {
      status: "shipped",
      mainCheckout: input.mainCheckout,
      defaultBranch: input.defaultBranch,
      route: route.route,
      mergeCommitSha: reachability.mergeCommitOid,
      pushStatus: "pushed",
      prBranch: branch,
      prNumber: pr.number,
      prUrl: pr.url,
      autoMergeArmed: false,
    };
  }
  if (!reachability.reachable && reachability.autoMergeArmed) {
    return {
      status: "pending_merge",
      mainCheckout: input.mainCheckout,
      defaultBranch: input.defaultBranch,
      route: route.route,
      pushStatus: "pushed",
      prBranch: branch,
      prNumber: pr.number,
      prUrl: pr.url,
      autoMergeArmed: true,
    };
  }

  return {
    status: "blocked",
    mainCheckout: input.mainCheckout,
    defaultBranch: input.defaultBranch,
    route: route.route,
    pushStatus: "not_attempted",
    prBranch: branch,
    prNumber: pr.number,
    prUrl: pr.url,
    autoMergeArmed: false,
    blocked: {
      reason: "PR_AUTO_MERGE_NOT_ARMED",
      remediation: `PR ${pr.url} must be merged or have auto-merge armed before re-drive can complete (rq-releaseFinalization01).`,
      details: reachability.details,
    },
  };
}

export function resolveReleaseReachability(
  input: ReleaseReachabilityInput,
  deps: Pick<GitFinalizeDeps, "runGit" | "runGh"> = {},
): ReleaseReachabilityProof {
  const route =
    input.route ??
    classifyFinalizationRoute(input.mainCheckout, input.defaultBranch, deps);

  if (route.route === "blocked") {
    return {
      reachable: false,
      proof: "blocked",
      details: route.details ?? (route.reason ? [route.reason] : undefined),
    };
  }

  if (route.route === "no_remote") {
    const local = verifyChangeBranchReachable(
      input.mainCheckout,
      input.defaultBranch,
      input.changeId,
      deps,
    );
    return local.reachable
      ? { reachable: true, proof: "local_merge" }
      : {
          reachable: false,
          proof: "local_unmerged",
          details: local.unmergedCommits,
        };
  }

  if (route.route === "direct") {
    const pushed = verifyDefaultBranchPushed(
      input.mainCheckout,
      input.defaultBranch,
      deps,
    );
    if (!pushed.pushed) {
      return {
        reachable: false,
        proof: "origin_push_unverified",
        details: pushed.reason ? [pushed.reason] : undefined,
      };
    }
    const originReachability = verifyChangeBranchReachableFromOrigin(
      input.mainCheckout,
      input.defaultBranch,
      input.changeId,
      deps,
    );
    return originReachability.reachable
      ? { reachable: true, proof: "origin_default" }
      : {
          reachable: false,
          proof: "origin_unmerged",
          details: originReachability.unmergedCommits,
        };
  }

  if (!route.repo || !input.prNumber) {
    return {
      reachable: false,
      proof: "pr_unmerged",
      prNumber: input.prNumber,
      details: ["PR merge state requires repo and prNumber"],
    };
  }

  const prState = readPrMergeState(
    input.mainCheckout,
    route.repo,
    input.prNumber,
    deps,
  );
  if ("error" in prState) {
    return {
      reachable: false,
      proof: "pr_unmerged",
      prNumber: input.prNumber,
      details: [prState.error, ...(prState.details ?? [])],
    };
  }
  if (prState.state === "MERGED" && prState.mergedAt) {
    return {
      reachable: true,
      proof: "pr_merged",
      prNumber: input.prNumber,
      mergeCommitOid: prState.mergeCommitOid,
    };
  }

  return {
    reachable: false,
    proof: "pr_unmerged",
    prNumber: input.prNumber,
    autoMergeArmed: prState.autoMergeArmed,
    details: [`PR state is ${prState.state}`],
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

  // rq-releaseFinalization01.7/.8: Readiness check replaces old invariant gate.
  // Wrong branch still blocks; dirty default-branch main is checkpointed and
  // continues; unsafe states block with diagnostics.
  const branch = runGitOrThrow(
    mainCheckout,
    ["branch", "--show-current"],
    deps,
  );
  if (branch !== defaultBranch) {
    return {
      status: "blocked",
      mainCheckout,
      defaultBranch,
      pushStatus: "not_attempted",
      blocked: {
        reason: "MAIN_BRANCH_MISMATCH",
        remediation: `Main checkout is on ${branch}, expected ${defaultBranch}. ADV will not switch branches. Restore main to ${defaultBranch} and retry. rq-releaseFinalization01 requires the correct branch.`,
      },
    };
  }

  // Verify git identity before any checkpoint commit attempt
  const identity = verifyGitIdentity(mainCheckout, deps);
  if (!identity.ok) {
    return {
      status: "blocked",
      mainCheckout,
      defaultBranch,
      pushStatus: "not_attempted",
      blocked: {
        reason: "MISSING_GIT_IDENTITY",
        remediation: `${identity.message} rq-releaseFinalization01.8 requires a configured git identity for checkpoint.`,
      },
    };
  }

  // Detect in-progress git operations (rq-releaseFinalization01.8)
  const inProgress = detectMainInProgressState(mainCheckout, deps);
  if (inProgress.inProgress) {
    return {
      status: "blocked",
      mainCheckout,
      defaultBranch,
      pushStatus: "not_attempted",
      blocked: {
        reason: "MAIN_IN_PROGRESS_STATE",
        remediation: `Main checkout is in an active ${inProgress.state} state. ADV will not commit over in-progress git operations. Resolve the ${inProgress.state} state and retry. rq-releaseFinalization01.8.`,
      },
    };
  }

  // Dirty-main checkpoint (rq-releaseFinalization01.7)
  let mainCheckpointCommitSha: string | undefined;
  const checkpoint = commitDirtyMainCheckpoint(
    mainCheckout,
    ctx.changeId,
    deps,
  );
  if (checkpoint.error) {
    return {
      status: "blocked",
      mainCheckout,
      defaultBranch,
      pushStatus: "not_attempted",
      blocked: {
        reason: "MAIN_CHECKPOINT_FAILED",
        remediation: `Dirty-main checkpoint failed: ${checkpoint.error}. rq-releaseFinalization01.8 blocks on checkpoint failure.`,
      },
    };
  }
  if (checkpoint.committed) {
    mainCheckpointCommitSha = checkpoint.commitSha;
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
      route: "direct",
      mergeCommitSha,
      mainCheckpointCommitSha,
      pushStatus: "pushed",
    };
  }

  if (push.status === "failed") {
    const route = classifyFinalizationRoute(mainCheckout, defaultBranch, deps);
    if (route.route === "pr_auto_merge") {
      if (mainCheckpointCommitSha) {
        return {
          status: "blocked",
          mainCheckout,
          defaultBranch,
          route: route.route,
          mergeCommitSha,
          mainCheckpointCommitSha,
          pushStatus: push.status,
          pushFailureReason: push.reason,
          prBranch: `change/${ctx.changeId}`,
          blocked: {
            reason: "MAIN_CHECKPOINT_PR_HANDOFF_UNSAFE",
            remediation: `Default branch ${defaultBranch} has an ADV checkpoint commit ${mainCheckpointCommitSha}; manually reconcile it before PR auto-merge handoff (rq-releaseFinalization01).`,
            details: [push.reason],
          },
        };
      }
      return completeProtectedBranchViaPullRequest(
        {
          mainCheckout,
          workdir: ctx.workdir,
          changeId: ctx.changeId,
          defaultBranch,
          route,
          pushFailureReason: push.reason,
        },
        deps,
      );
    }
    if (route.route === "pr_manual") {
      return {
        status: "blocked",
        mainCheckout,
        defaultBranch,
        route: route.route,
        mergeCommitSha,
        mainCheckpointCommitSha,
        pushStatus: push.status,
        pushFailureReason: push.reason,
        prBranch: `change/${ctx.changeId}`,
        blocked: {
          reason: route.reason ?? "PR_MANUAL_REQUIRED",
          remediation: `Default branch push failed and ADV could not arm auto-merge. Manually open or merge PR for change/${ctx.changeId}, then rerun archive finalization (rq-releaseFinalization01).`,
          details: [push.reason, ...(route.details ?? [])],
        },
      };
    }
  }

  return {
    status: "blocked",
    mainCheckout,
    defaultBranch,
    route: "direct",
    mergeCommitSha,
    mainCheckpointCommitSha,
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
