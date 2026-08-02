import { realpathSync, mkdtempSync, rmSync, statSync } from "fs";
import { spawnSync } from "child_process";
import {
  dirname,
  isAbsolute,
  join,
  normalize,
  sep as pathSeparator,
} from "path";
import { tmpdir } from "os";
import { spawnSyncGit } from "../../utils/git-binary";
import { parseWorktreeListPorcelain } from "../worktree/porcelain-parser";
import { CHANGE_BRANCH_PREFIX } from "../../temporal/contracts";
import type { PrTitlePolicy } from "../../types/project";

export type ArchiveMode = "direct" | "pr";

export interface GitFinalizeOutcome {
  status: "shipped" | "blocked" | "pending_merge";
  /** Project git root (main checkout or bare repository) used for remote-first isolated finalization. */
  repoRoot: string;
  defaultBranch: string;
  route?: ReleaseFinalizationRouteName;
  mergeCommitSha?: string;
  /** Route-neutral SHA that projection proof uses to read released specs/docs.
   *  For direct/no_remote routes this is the verified default-branch HEAD;
   *  for PR routes it is the merged PR commit OID. */
  releasedCommitSha?: string;
  /** SHA of the change branch tip captured before merge/cleanup so tree-SHA
   *  re-proof can survive branch deletion (rq-fixArchivedBranchFinalization SC1). */
  changeTipSha?: string;
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
  /**
   * Optional per-project worktree file-lock used by the remote-first isolated
   * archive finalization path to serialize ephemeral `git worktree add/remove`
   * operations against peer sessions. The lock callback is supplied by the caller
   * (e.g. `adv_change_archive`) so `git-finalize.ts` does not need to import
   * worker-lock / temporal internals, preserving the workflow-bundle boundary.
   */
  ephemeralWorktreeLock?: {
    acquire: (
      projectStateDir: string,
    ) =>
      | Promise<{ owned: boolean; release: () => Promise<void> }>
      | { owned: boolean; release: () => Promise<void> };
  };
  /** Project state directory required when `ephemeralWorktreeLock` is provided. */
  projectStateDir?: string;
}

export type ReleaseFinalizationRouteName =
  | "no_remote"
  | "direct"
  | "pr_auto_merge"
  | "pr_manual"
  | "merge_queue"
  | "blocked";

export interface FinalizationRoute {
  route: ReleaseFinalizationRouteName;
  repo?: string;
  remoteUrl?: string;
  protected?: boolean;
  autoMergeAllowed?: boolean;
  mergeQueueRequired?: boolean;
  parsedRules?: unknown[];
  reason?: string;
  details?: string[];
}

export interface ReconcileResult {
  status: "ok" | "blocked";
  reason?: string;
  remediation?: string;
  conflictFiles?: string[];
}

const EPHEMERAL_WORKTREE_PREFIX = "adv-archive-wt-";
const EPHEMERAL_WORKTREE_REMOVE_TIMEOUT_MS = 30_000;

/**
 * Create a short-lived detached worktree from the default-branch basis,
 * run `fn`, then remove it. The worktree is created under the OS temp directory
 * and is never reused across invocations.
 *
 * rq-releaseFinalization03: archive finalization must not inspect or mutate the
 * shared main checkout; all git mutations happen inside this ephemeral worktree.
 *
 *
 * If `deps.ephemeralWorktreeLock` + `deps.projectStateDir` are provided, the
 * add/remove operations are serialized with the per-project git worktree flock.
 * Lock acquisition failures throw so the caller can report a bounded retry.
 *
 * The caller receives the ephemeral worktree path. All git mutations inside the
 * worktree are isolated from the shared main checkout and any peer worktrees.
 */
async function withEphemeralDefaultBranchWorktree<T>(
  repoRoot: string,
  baseRef: string,
  deps: GitFinalizeDeps,
  fn: (ephemeralPath: string) => Promise<T>,
): Promise<T> {
  const runGit = deps.runGit ?? defaultRunGit;
  const ephemeralPath = mkdtempSync(join(tmpdir(), EPHEMERAL_WORKTREE_PREFIX));
  let lockRelease: (() => Promise<void>) | undefined;

  if (deps.ephemeralWorktreeLock && deps.projectStateDir) {
    const acquired = await deps.ephemeralWorktreeLock.acquire(
      deps.projectStateDir,
    );
    if (!acquired.owned) {
      rmSync(ephemeralPath, { recursive: true, force: true });
      throw new Error(
        "WORKTREE_FLOCK_CONTENTION: another session holds the git worktree lock; retry archive finalization",
      );
    }
    lockRelease = acquired.release;
  }

  try {
    const add = runGit(repoRoot, [
      "worktree",
      "add",
      "--detach",
      ephemeralPath,
      baseRef,
    ]);
    if (add.status !== 0) {
      throw new Error(
        `git worktree add failed: ${add.stderr || add.stdout || "unknown error"}`,
      );
    }
    try {
      return await fn(ephemeralPath);
    } finally {
      runGit(
        repoRoot,
        ["worktree", "remove", "--force", ephemeralPath],
        EPHEMERAL_WORKTREE_REMOVE_TIMEOUT_MS,
      );
    }
  } finally {
    if (lockRelease) {
      await lockRelease().catch(() => {
        /* best-effort release */
      });
    }
    rmSync(ephemeralPath, { recursive: true, force: true });
  }
}

export function reconcileChangeBranchWithDefault(
  input: {
    workdir: string;
    defaultBranch: string;
    parsedRules: unknown[];
  },
  deps: Pick<GitFinalizeDeps, "runGit"> = {},
): ReconcileResult {
  const runGit = deps.runGit ?? defaultRunGit;

  const hasLinearHistoryRule =
    Array.isArray(input.parsedRules) &&
    input.parsedRules.some(
      (r) =>
        typeof r === "object" &&
        r !== null &&
        (r as { type?: unknown }).type === "required_linear_history",
    );
  if (hasLinearHistoryRule) {
    return {
      status: "blocked",
      reason: "LINEAR_HISTORY_REQUIRED",
      remediation:
        "Repository requires linear history; reconcile change branch manually via rebase before archive.",
    };
  }

  const fetchResult = runGit(input.workdir, [
    "fetch",
    "origin",
    input.defaultBranch,
  ]);
  if (fetchResult.status !== 0) {
    return {
      status: "blocked",
      reason: "DEFAULT_BRANCH_FETCH_FAILED",
      remediation: `Failed to fetch origin/${input.defaultBranch} for freshness reconciliation.`,
      conflictFiles: [],
    };
  }

  const mergeResult = runGit(input.workdir, [
    "merge",
    "--no-edit",
    `origin/${input.defaultBranch}`,
  ]);
  if (mergeResult.status === 0) {
    return { status: "ok" };
  }

  const diffResult = runGit(input.workdir, [
    "diff",
    "--name-only",
    "--diff-filter=U",
  ]);
  const conflictFiles = splitLines(diffResult.stdout).filter(Boolean);
  runGit(input.workdir, ["merge", "--abort"]);

  return {
    status: "blocked",
    reason: "RECONCILE_CONFLICT",
    remediation: `Change branch conflicts with ${input.defaultBranch}. Resolve conflicts manually and retry archive.`,
    conflictFiles,
  };
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
  title?: string;
}

export interface ReleaseReachabilityInput {
  repoRoot: string;
  defaultBranch: string;
  changeId: string;
  route?: FinalizationRoute;
  prNumber?: number;
  /** Optional repo override; falls back to route.repo. */
  repo?: string;
  // rq-fixPhase9SquashMergeRedetect SC1: persisted change-tip SHA captured at
  // archive dispatch time. When provided, detection uses this content-addressed
  // tip instead of the live change/{id} git ref so reachability survives
  // branch deletion (squash-merge + branch cleanup before phase9:"run").
  changeTipSha?: string;
}

export type ReleaseReachabilityProof =
  | {
      reachable: true;
      proof: "local_merge" | "origin_default" | "pr_merged";
      /** Route-neutral SHA from the authority that proved release (required). */
      releasedCommitSha: string;
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
        | "pr_missing_merge_proof"
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
 *
 * rq-archiveBranchCleanup01: post-merge local branch cleanup for archived
 * ADV changes must be squash-merge-safe and not rely on `git branch --merged`.
 */
export function deleteChangeBranch(
  repoRoot: string,
  changeId: string,
  deps: GitFinalizeDeps = {},
): DeleteChangeBranchResult {
  const runGit = deps.runGit ?? defaultRunGit;
  const branchName = `change/${changeId}`;

  // Delete local branch (safe — only works if fully merged)
  const localResult = runGit(repoRoot, ["branch", "-d", branchName]);
  if (localResult.status !== 0) {
    return {
      localDeleted: false,
      remoteDeleted: false,
      error: `Local branch deletion failed: ${redactGitOutput(localResult.stderr).trim()}`,
    };
  }

  // Delete remote branch (best-effort)
  const remoteResult = runGit(repoRoot, [
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

/**
 * Build a `runGit` bound to a per-call timeout, suitable for injection as
 * `deps.runGit` into detection helpers whose synchronous `spawnSync` git
 * calls must be budget-bounded (a stuck call would otherwise block for the
 * full DEFAULT_GIT_TIMEOUT_MS and escape a tool budget). Each call kills the
 * git process on overrun and surfaces status 124 (rq-archivedBranchCleanupInversion01).
 */
export function makeBoundedRunGit(
  timeoutMs: number,
): NonNullable<GitFinalizeDeps["runGit"]> {
  return (cwd, args) => defaultRunGit(cwd, args, timeoutMs);
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

/**
 * Detect whether the origin remote is a canonical local bare repository that can
 * act as a valid remote authority. This keeps a local bare origin on the direct
 * push path instead of forcing a no_remote block.
 */
function isCanonicalLocalRemoteOrigin(
  repoRoot: string,
  remoteUrl: string,
  deps: Pick<GitFinalizeDeps, "runGit"> = {},
): boolean {
  if (!remoteUrl) return false;
  const localPath = isAbsolute(remoteUrl)
    ? remoteUrl
    : join(repoRoot, remoteUrl);
  try {
    const resolved = realpathSync(localPath);
    if (!statSync(resolved).isDirectory()) return false;
  } catch {
    return false;
  }
  const runGit = deps.runGit ?? defaultRunGit;
  const result = runGit(localPath, ["rev-parse", "--is-bare-repository"]);
  return result.status === 0 && result.stdout.trim() === "true";
}

function getOriginRemote(
  repoRoot: string,
  deps: Pick<GitFinalizeDeps, "runGit"> = {},
):
  | { configured: true; remoteUrl: string; repo?: string }
  | { configured: false; reason: string } {
  const runGit = deps.runGit ?? defaultRunGit;
  const remote = runGit(repoRoot, ["remote", "get-url", "origin"]);
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
  repoRoot: string,
  defaultBranch: string,
  deps: Pick<GitFinalizeDeps, "runGit" | "runGh"> = {},
): FinalizationRoute {
  const origin = getOriginRemote(repoRoot, deps);
  if (!origin.configured) {
    return {
      route: "no_remote",
      reason: origin.reason,
    };
  }

  if (!origin.repo) {
    if (isCanonicalLocalRemoteOrigin(repoRoot, origin.remoteUrl, deps)) {
      return {
        route: "direct",
        remoteUrl: origin.remoteUrl,
        protected: false,
        parsedRules: [],
        details: ["Local bare origin is a valid remote route"],
      };
    }

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
  const rules = runGh(repoRoot, [
    "api",
    `repos/${origin.repo}/rules/branches/${encodeURIComponent(defaultBranch)}`,
  ]);
  if (rules.status !== 0) {
    const rulesErrText = (rules.stderr || rules.stdout || "").toLowerCase();
    // Private repos without GitHub Pro return 403 on the branch-rules API.
    // The rules API is unavailable on this plan — not a policy detection
    // failure. Treat as "no rules detectable → direct route" so the release
    // gate can proceed with git-based reachability verification.
    const isPlanRestriction =
      rulesErrText.includes("upgrade to github pro") ||
      rulesErrText.includes("make this repository public");
    if (isPlanRestriction) {
      return {
        route: "direct",
        repo: origin.repo,
        remoteUrl: origin.remoteUrl,
        protected: false,
        parsedRules: [],
        details: [
          "branch-rules API unavailable on private repo (GitHub Pro required); treating as unprotected",
        ],
      };
    }
    return {
      route: "blocked",
      repo: origin.repo,
      remoteUrl: origin.remoteUrl,
      reason: "POLICY_DETECTION_FAILED",
      details: splitLines(rules.stderr || rules.stdout),
    };
  }

  const parsedRules = parseJson(rules.stdout);
  if (!Array.isArray(parsedRules)) {
    return {
      route: "blocked",
      repo: origin.repo,
      remoteUrl: origin.remoteUrl,
      reason: "POLICY_DETECTION_FAILED",
      parsedRules: Array.isArray(parsedRules) ? parsedRules : undefined,
      details: splitLines(rules.stdout),
    };
  }

  if (parsedRules.some((r) => r?.type === "merge_queue")) {
    return {
      route: "merge_queue",
      repo: origin.repo,
      remoteUrl: origin.remoteUrl,
      protected: true,
      mergeQueueRequired: true,
      parsedRules,
    };
  }

  if (parsedRules.length === 0) {
    return {
      route: "direct",
      repo: origin.repo,
      remoteUrl: origin.remoteUrl,
      protected: false,
      parsedRules,
    };
  }

  const allowAutoMerge = runGh(repoRoot, [
    "api",
    `repos/${origin.repo}`,
    "--jq",
    ".allow_auto_merge",
  ]);
  if (allowAutoMerge.status !== 0) {
    return {
      route: "blocked",
      repo: origin.repo,
      remoteUrl: origin.remoteUrl,
      protected: true,
      reason: "POLICY_DETECTION_FAILED",
      parsedRules,
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
      parsedRules,
    };
  }

  return {
    route: "pr_manual",
    repo: origin.repo,
    remoteUrl: origin.remoteUrl,
    protected: true,
    autoMergeAllowed: false,
    parsedRules,
    reason: "AUTO_MERGE_DISABLED",
  };
}

export function coercePrWorkflowRoute(
  route: FinalizationRoute,
): FinalizationRoute {
  if (
    route.route === "blocked" ||
    route.route === "no_remote" ||
    route.route === "merge_queue"
  )
    return route;
  if (!route.repo) return route;
  if (route.route === "pr_manual") return route;
  return {
    ...route,
    route: "pr_auto_merge",
    protected: route.protected ?? true,
  };
}

/**
 * Resolve the project git root from any worktree or main checkout workdir.
 * Returns the directory containing the shared `.git` directory. This is the
 * remote-first isolated archive path: no shared trunk is mutated; ephemeral
 * worktrees are forked from this root.
 */
export function resolveRepoRoot(
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
  repoRoot: string,
  deps: GitFinalizeDeps = {},
): { branch: string; source: string } {
  const runGit = deps.runGit ?? defaultRunGit;

  // Prefer origin/HEAD first (avoids stale local main winning in trunk repos)
  const originHead = runGit(repoRoot, [
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

  // Then repository-local init.defaultBranch config. Do not let a user's global
  // init.defaultBranch override an already-initialized repository's local
  // branch set during archive finalization.
  const configured = runGit(repoRoot, [
    "config",
    "--local",
    "--get",
    "init.defaultBranch",
  ]);
  if (configured.status === 0 && configured.stdout.trim()) {
    return { branch: configured.stdout.trim(), source: "init-defaultBranch" };
  }

  // Then local branches
  for (const branch of ["main", "trunk"]) {
    const result = runGit(repoRoot, [
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

export function verifyChangeBranchReachable(
  repoRoot: string,
  defaultBranch: string,
  changeId: string,
  deps: GitFinalizeDeps = {},
): { reachable: boolean; unmergedCommits: string[] } {
  const result = (deps.runGit ?? defaultRunGit)(repoRoot, [
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
  repoRoot: string,
  defaultBranch: string,
  changeId: string,
  deps: GitFinalizeDeps = {},
): { reachable: boolean; unmergedCommits: string[] } {
  const runGit = deps.runGit ?? defaultRunGit;
  const fetch = runGit(repoRoot, ["fetch", "origin", defaultBranch]);
  if (fetch.status !== 0) {
    return {
      reachable: false,
      unmergedCommits: splitLines(fetch.stderr || fetch.stdout),
    };
  }
  const result = runGit(repoRoot, [
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
  repoRoot: string,
  defaultBranch: string,
  changeId: string,
  deps: GitFinalizeDeps = {},
): MergeChangeBranchResult {
  const runGit = deps.runGit ?? defaultRunGit;
  // rq-harden-archive-flow AC3: already-reachable branch is a no-op merge.
  // Detect before invoking `git merge` so a previously-merged (FF or no-FF
  // squash) change branch doesn't surface as MERGE_FAILED.
  const reachability = verifyChangeBranchReachable(
    repoRoot,
    defaultBranch,
    changeId,
    deps,
  );
  if (reachability.reachable) {
    return {
      status: "merged",
      mergeCommitSha: runGitOrThrow(repoRoot, ["rev-parse", "HEAD"], deps),
      mergeMethod: "already-reachable",
    };
  }
  const merge = runGit(repoRoot, ["merge", "--ff-only", `change/${changeId}`]);
  if (merge.status === 0) {
    return {
      status: "merged",
      mergeCommitSha: runGitOrThrow(repoRoot, ["rev-parse", "HEAD"], deps),
      mergeMethod: "ff-only",
    };
  }

  const message = merge.stderr || merge.stdout || "merge failed";
  const conflictFiles = splitLines(
    runGit(repoRoot, ["diff", "--name-only", "--diff-filter=U"]).stdout,
  );
  runGit(repoRoot, ["merge", "--abort"]);

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
  const noff = runGit(repoRoot, [
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
      mergeCommitSha: runGitOrThrow(repoRoot, ["rev-parse", "HEAD"], deps),
      mergeMethod: "no-ff",
    };
  }

  // no-ff also failed — abort any partial state and report the original
  // failure cause.
  const noffConflictFiles = splitLines(
    runGit(repoRoot, ["diff", "--name-only", "--diff-filter=U"]).stdout,
  );
  runGit(repoRoot, ["merge", "--abort"]);
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
  repoRoot: string,
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
    repoRoot,
    ["push", "origin", `HEAD:${defaultBranch}`],
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
  repoRoot: string,
  changeId: string,
  deps: Pick<GitFinalizeDeps, "runGit"> = {},
): { pushed: boolean; reason?: string } {
  const runGit = deps.runGit ?? defaultRunGit;
  const local = runGit(repoRoot, [
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

  const lsRemote = runGit(repoRoot, [
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
  repoRoot: string,
  defaultBranch: string,
  deps: Pick<GitFinalizeDeps, "runGit"> = {},
): { pushed: true; sha: string } | { pushed: false; reason: string } {
  const runGit = deps.runGit ?? defaultRunGit;
  runGit(repoRoot, ["fetch", "origin", defaultBranch]);
  const localHead = runGit(repoRoot, ["rev-parse", "HEAD"]);
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
  const remoteHead = runGit(repoRoot, [
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
    ? { pushed: true, sha: remoteSha }
    : {
        pushed: false,
        reason: `origin/${defaultBranch} is at ${remoteSha}, local ${defaultBranch} is at ${localSha}`,
      };
}

export function readPrMergeState(
  repoRoot: string,
  repo: string | undefined,
  prNumber: number,
  deps: Pick<GitFinalizeDeps, "runGh"> = {},
): PullRequestMergeState | { error: string; details?: string[] } {
  const runGh = deps.runGh ?? defaultRunGh;
  const args = ["pr", "view", String(prNumber)];
  if (repo) args.push("--repo", repo);
  args.push("--json", "state,mergedAt,mergeCommit,autoMergeRequest");
  const result = runGh(repoRoot, args);
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

export function discoverMergedPr(
  repoRoot: string,
  repo: string | undefined,
  changeId: string,
  deps: Pick<GitFinalizeDeps, "runGh"> = {},
):
  | { prNumber: number; mergeCommitOid?: string }
  | { error: string; details?: string[] } {
  const runGh = deps.runGh ?? defaultRunGh;
  const args = ["pr", "list"];
  if (repo) args.push("--repo", repo);
  args.push(
    "--state",
    "merged",
    "--head",
    `change/${changeId}`,
    "--json",
    "number,mergeCommit",
    "--limit",
    "1",
  );
  const result = runGh(repoRoot, args);
  if (result.status !== 0) {
    return {
      error: ghFailureReason(result),
      details: splitLines(result.stderr || result.stdout),
    };
  }
  const parsed = parseJson(result.stdout);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: "NO_MERGED_PR_FOUND" };
  }
  const pr = parsed[0] as {
    number?: unknown;
    mergeCommit?: { oid?: unknown } | null;
  };
  if (typeof pr.number !== "number" || !Number.isInteger(pr.number)) {
    return { error: "PR_NUMBER_UNPARSEABLE" };
  }
  return {
    prNumber: pr.number,
    mergeCommitOid:
      pr.mergeCommit && typeof pr.mergeCommit.oid === "string"
        ? pr.mergeCommit.oid
        : undefined,
  };
}

export function detectSquashMergeByTree(
  repoRoot: string,
  defaultBranch: string,
  changeId: string,
  deps: Pick<GitFinalizeDeps, "runGit"> & {
    // rq-fixPhase9SquashMergeRedetect SC1: when provided, use this
    // content-addressed tip instead of the live change/{id} ref so
    // detection survives branch deletion.
    changeTipSha?: string;
  } = {},
): { reachable: boolean; mergeCommitOid?: string } {
  const runGit = deps.runGit ?? defaultRunGit;

  // Get tree SHA of change branch HEAD. Prefer the persisted tip SHA when
  // available (survives branch deletion); fall back to the live branch ref.
  const tipRef = deps.changeTipSha ?? `change/${changeId}`;
  const changeTree = runGit(repoRoot, ["rev-parse", `${tipRef}^{tree}`]);
  if (changeTree.status !== 0) {
    return { reachable: false };
  }
  const changeTreeSha = changeTree.stdout.trim();
  if (!changeTreeSha) {
    return { reachable: false };
  }

  // Get recent trunk commits (last 50) with tree SHAs
  const trunkCommits = runGit(repoRoot, [
    "log",
    "--format=%H %T",
    "-50",
    defaultBranch,
  ]);
  if (trunkCommits.status !== 0) {
    return { reachable: false };
  }

  // Parse and compare tree SHAs
  const lines = splitLines(trunkCommits.stdout);
  for (const line of lines) {
    const [commitSha, treeSha] = line.split(/\s+/, 2);
    if (treeSha === changeTreeSha && commitSha) {
      return { reachable: true, mergeCommitOid: commitSha };
    }
  }

  return { reachable: false };
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
    title?: unknown;
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
    title: typeof payload.title === "string" ? payload.title : undefined,
    autoMergeArmed:
      payload.autoMergeRequest !== null &&
      payload.autoMergeRequest !== undefined,
  };
}

function readPullRequestByBranch(
  repoRoot: string,
  repo: string,
  branch: string,
  deps: Pick<GitFinalizeDeps, "runGh"> = {},
): PullRequestSummary | { error: string; details?: string[] } {
  const runGh = deps.runGh ?? defaultRunGh;
  const result = runGh(repoRoot, [
    "pr",
    "view",
    branch,
    "--repo",
    repo,
    "--json",
    "number,url,state,title,autoMergeRequest",
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

export function createArchivePullRequest(
  input: {
    repoRoot: string;
    repo: string;
    branch: string;
    defaultBranch: string;
    changeId: string;
    changeTitle?: string;
    prTitleType?: string;
    prTitlePolicy?: PrTitlePolicy;
  },
  deps: Pick<GitFinalizeDeps, "runGh"> = {},
):
  | { ok: true; url?: string }
  | { ok: false; reason: string; details?: string[] } {
  const runGh = deps.runGh ?? defaultRunGh;

  const policy = input.prTitlePolicy;
  const useConventional = policy?.format === "conventional";
  let title: string;
  if (useConventional) {
    if (input.prTitleType === undefined) {
      return {
        ok: false,
        reason: "UNRESOLVED_PR_TITLE",
        details: [
          "Conventional PR title policy requires a prTitleType, but none was provided.",
        ],
      };
    }
    title = `${input.prTitleType}: ${input.changeTitle}`;
  } else {
    title = `Archive ${input.changeId}`;
  }

  const result = runGh(input.repoRoot, [
    "pr",
    "create",
    "--repo",
    input.repo,
    "--head",
    input.branch,
    "--base",
    input.defaultBranch,
    "--title",
    title,
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
    repoRoot: string;
    repo: string;
    branch: string;
    defaultBranch: string;
    changeId: string;
    changeTitle?: string;
    prTitleType?: string;
    prTitlePolicy?: PrTitlePolicy;
  },
  deps: Pick<GitFinalizeDeps, "runGh"> = {},
): PullRequestSummary | { error: string; details?: string[] } {
  const existing = readPullRequestByBranch(
    input.repoRoot,
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
    input.repoRoot,
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

export function armPullRequestAutoMerge(
  repoRoot: string,
  repo: string,
  prNumber: number,
  changeTitle: string,
  prTitle?: string,
  prTitleType?: string,
  prTitlePolicy?: PrTitlePolicy,
  deps: Pick<GitFinalizeDeps, "runGh"> = {},
): { ok: true } | { ok: false; reason: string; details?: string[] } {
  const runGh = deps.runGh ?? defaultRunGh;

  const policy = prTitlePolicy;
  if (policy?.format === "conventional") {
    if (prTitleType === undefined) {
      return {
        ok: false,
        reason: "PR_TITLE_TYPE_UNRESOLVED",
        details: [
          "Conventional PR title policy requires a prTitleType, but none was provided.",
        ],
      };
    }

    let liveTitle = prTitle;
    if (liveTitle === undefined) {
      const titleResult = runGh(repoRoot, [
        "pr",
        "view",
        String(prNumber),
        "--repo",
        repo,
        "--json",
        "title",
      ]);
      if (titleResult.status !== 0) {
        return {
          ok: false,
          reason: "PR_TITLE_LOOKUP_FAILED",
          details: splitLines(titleResult.stderr || titleResult.stdout),
        };
      }
      const parsed = parseJson(titleResult.stdout);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof (parsed as { title?: unknown }).title !== "string"
      ) {
        return {
          ok: false,
          reason: "PR_TITLE_LOOKUP_FAILED",
          details: ["gh pr view did not return a parseable title."],
        };
      }
      liveTitle = (parsed as { title: string }).title;
    }

    const expectedPrefix = `${prTitleType}:`;
    if (!liveTitle.startsWith(expectedPrefix)) {
      return {
        ok: false,
        reason: "PR_TITLE_POLICY_VIOLATION",
        details: [
          `Live PR title '${liveTitle}' does not conform to policy: must start with '${expectedPrefix}'.`,
        ],
      };
    }

    if (
      policy.allowed_types !== undefined &&
      !policy.allowed_types.includes(prTitleType)
    ) {
      return {
        ok: false,
        reason: "PR_TITLE_POLICY_VIOLATION",
        details: [
          `Live PR title '${liveTitle}' does not conform to policy: type '${prTitleType}' is not in allowed_types.`,
        ],
      };
    }

    if (
      policy.release_types !== undefined &&
      !policy.release_types.includes(prTitleType)
    ) {
      return {
        ok: false,
        reason: "PR_TITLE_POLICY_VIOLATION",
        details: [
          `type '${prTitleType}' is not in release_types [${policy.release_types
            .map((t) => `'${t}'`)
            .join(",")}]; archive would merge without producing a release tag`,
        ],
      };
    }
  }

  // Intentionally omits -d/--delete-branch. Merge-queue merges complete at PR
  // state MERGED and cli/cli rejects --auto combined with --delete-branch.
  const result = runGh(repoRoot, [
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

export function executePullRequestHandoff(
  input: {
    repoRoot: string;
    workdir: string;
    repo: string;
    branch: string;
    defaultBranch: string;
    changeId: string;
    route: FinalizationRoute;
    pushFailureReason: string;
    changeTitle: string;
    prTitleType?: string;
    prTitlePolicy?: PrTitlePolicy;
    changeTipSha?: string;
  },
  deps: GitFinalizeDeps = {},
): GitFinalizeOutcome {
  const branchPush = pushChangeBranch(input.workdir, input.changeId, {
    autoPush: true,
    runGit: deps.runGit,
  });
  if (branchPush.status !== "pushed") {
    return {
      status: "blocked",
      repoRoot: input.repoRoot,
      defaultBranch: input.defaultBranch,
      route: input.route.route,
      pushStatus: branchPush.status,
      pushFailureReason: branchPush.reason,
      prBranch: input.branch,
      blocked: {
        reason:
          branchPush.status === "failed"
            ? "PR_BRANCH_PUSH_FAILED"
            : "PR_BRANCH_PUSH_SKIPPED",
        remediation: `Change branch ${input.branch} must be pushed before PR auto-merge handoff (rq-releaseFinalization01).`,
        details: [branchPush.reason],
      },
    };
  }

  const pr = ensureArchivePullRequest(
    {
      repoRoot: input.repoRoot,
      repo: input.repo,
      branch: input.branch,
      defaultBranch: input.defaultBranch,
      changeId: input.changeId,
      changeTitle: input.changeTitle,
      prTitleType: input.prTitleType,
      prTitlePolicy: input.prTitlePolicy,
    },
    deps,
  );
  if ("error" in pr) {
    return {
      status: "blocked",
      repoRoot: input.repoRoot,
      defaultBranch: input.defaultBranch,
      route: input.route.route,
      pushStatus: "pushed",
      pushFailureReason: input.pushFailureReason,
      prBranch: input.branch,
      blocked: {
        reason: pr.error,
        remediation: `Open or reuse a PR for ${input.branch}, then rerun archive finalization (rq-releaseFinalization01).`,
        details: pr.details,
      },
    };
  }

  const armed = armPullRequestAutoMerge(
    input.repoRoot,
    input.repo,
    pr.number,
    input.changeTitle,
    pr.title,
    input.prTitleType,
    input.prTitlePolicy,
    deps,
  );
  if (!armed.ok) {
    return {
      status: "blocked",
      repoRoot: input.repoRoot,
      defaultBranch: input.defaultBranch,
      route: input.route.route,
      pushStatus: "pushed",
      pushFailureReason: input.pushFailureReason,
      prBranch: input.branch,
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
      repoRoot: input.repoRoot,
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
      repoRoot: input.repoRoot,
      defaultBranch: input.defaultBranch,
      route: input.route.route,
      releasedCommitSha: reachability.mergeCommitOid,
      mergeCommitSha: reachability.mergeCommitOid,
      changeTipSha: input.changeTipSha,
      pushStatus: "pushed",
      pushFailureReason: input.pushFailureReason,
      prBranch: input.branch,
      prNumber: pr.number,
      prUrl: pr.url,
      autoMergeArmed: false,
    };
  }
  if (!reachability.reachable && reachability.autoMergeArmed) {
    return {
      status: "pending_merge",
      repoRoot: input.repoRoot,
      defaultBranch: input.defaultBranch,
      route: input.route.route,
      pushStatus: "pushed",
      pushFailureReason: input.pushFailureReason,
      prBranch: input.branch,
      prNumber: pr.number,
      prUrl: pr.url,
      autoMergeArmed: true,
      changeTipSha: input.changeTipSha,
    };
  }

  return {
    status: "blocked",
    repoRoot: input.repoRoot,
    defaultBranch: input.defaultBranch,
    route: input.route.route,
    pushStatus: "pushed",
    pushFailureReason: input.pushFailureReason,
    prBranch: input.branch,
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

export function completeMergeQueueHandoff(
  input: {
    repoRoot: string;
    workdir: string;
    defaultBranch: string;
    changeId: string;
    route: FinalizationRoute;
    changeTitle: string;
    prTitleType?: string;
    prTitlePolicy?: PrTitlePolicy;
    changeTipSha?: string;
  },
  deps: GitFinalizeDeps = {},
): GitFinalizeOutcome {
  const branch = `change/${input.changeId}`;
  if (!input.route.repo) {
    return {
      status: "blocked",
      repoRoot: input.repoRoot,
      defaultBranch: input.defaultBranch,
      route: input.route.route,
      pushStatus: "failed",
      pushFailureReason: "merge_queue_required",
      prBranch: branch,
      blocked: {
        reason: "GITHUB_REPO_UNRESOLVABLE",
        remediation: `Unable to derive GitHub repo for ${branch}; create or merge a PR manually before release completion (rq-releaseFinalization01).`,
        details: input.route.details,
      },
    };
  }

  return executePullRequestHandoff(
    {
      repoRoot: input.repoRoot,
      workdir: input.workdir,
      repo: input.route.repo,
      branch,
      defaultBranch: input.defaultBranch,
      changeId: input.changeId,
      route: input.route,
      pushFailureReason: "merge_queue_required",
      changeTitle: input.changeTitle,
      prTitleType: input.prTitleType,
      prTitlePolicy: input.prTitlePolicy,
      changeTipSha: input.changeTipSha,
    },
    deps,
  );
}

function completeProtectedBranchViaPullRequest(
  input: {
    repoRoot: string;
    workdir: string;
    changeId: string;
    defaultBranch: string;
    route: FinalizationRoute;
    pushFailureReason: string;
    changeTitle: string;
    prTitleType?: string;
    prTitlePolicy?: PrTitlePolicy;
    changeTipSha?: string;
  },
  deps: GitFinalizeDeps = {},
): GitFinalizeOutcome {
  const branch = `change/${input.changeId}`;
  if (!input.route.repo) {
    return {
      status: "blocked",
      repoRoot: input.repoRoot,
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

  const reconcileResult = reconcileChangeBranchWithDefault(
    {
      workdir: input.workdir,
      defaultBranch: input.defaultBranch,
      parsedRules: input.route.parsedRules ?? [],
    },
    deps,
  );
  if (reconcileResult.status !== "ok") {
    return {
      status: "blocked",
      repoRoot: input.repoRoot,
      defaultBranch: input.defaultBranch,
      route: input.route.route,
      pushStatus: "not_attempted",
      prBranch: branch,
      blocked: {
        reason: reconcileResult.reason ?? "RECONCILE_BLOCKED",
        remediation: reconcileResult.remediation ?? "",
        details: reconcileResult.conflictFiles,
      },
    };
  }

  return executePullRequestHandoff(
    {
      repoRoot: input.repoRoot,
      workdir: input.workdir,
      repo: input.route.repo,
      branch,
      defaultBranch: input.defaultBranch,
      changeId: input.changeId,
      route: input.route,
      pushFailureReason: input.pushFailureReason,
      changeTitle: input.changeTitle,
      prTitleType: input.prTitleType,
      prTitlePolicy: input.prTitlePolicy,
      changeTipSha: input.changeTipSha,
    },
    deps,
  );
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

export interface ArchivedMergedBranch {
  changeId: string;
  branch: string;
  localSha: string;
  mergeProof:
    | { kind: "tree-identical"; trunkCommitSha: string }
    | { kind: "patch-equivalent" };
}

export type ArchivedMergedBranchesResult =
  | {
      status: "ok";
      branches: ArchivedMergedBranch[];
    }
  | {
      status: "blocked";
      reason: "LOCAL_BRANCH_LIST_FAILED";
      details?: string[];
    };

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
    repoRoot: string;
    defaultBranch: string;
    archivedChangeIds?: string[];
  },
  deps: Pick<GitFinalizeDeps, "runGit"> = {},
): ArchivedUnmergedBranchesResult {
  const runGit = deps.runGit ?? defaultRunGit;
  const archivedSet = input.archivedChangeIds
    ? new Set(input.archivedChangeIds)
    : null;
  const remoteBranches = runGit(input.repoRoot, [
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

  const defaultFetch = runGit(input.repoRoot, [
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
    const branchFetch = runGit(input.repoRoot, [
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
    const unmerged = runGit(input.repoRoot, [
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

function parseLocalChangeBranchRefs(output: string): Array<{
  changeId: string;
  branch: string;
  localSha: string;
}> {
  return splitLines(output)
    .map((line) => {
      const [branch, localSha] = line.split(/\s+/, 2);
      const prefix = CHANGE_BRANCH_PREFIX;
      if (!localSha || !branch?.startsWith(prefix)) return null;
      const changeId = branch.slice(prefix.length);
      if (!changeId) return null;
      return { changeId, branch, localSha };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

export interface LocalChangeBranchEntry {
  changeId: string;
  branch: string;
  localSha: string;
}

export type ListLocalChangeBranchesResult =
  | { status: "ok"; entries: LocalChangeBranchEntry[] }
  | {
      status: "blocked";
      reason: "LOCAL_BRANCH_LIST_FAILED";
      details: string[];
    };

/**
 * Enumerate the local `change/*` branches with their object names.
 *
 * Extracted from `detectArchivedMergedBranches` so the archived-branch
 * cleanup helper can build its archived-id set per local branch (via
 * `store.changes.get`) instead of enumerating the whole archive. Behavior
 * is identical to the previous inline logic: same `git branch --list`
 * invocation, same parse, same fail-closed blocked result
 * (rq-archivedBranchCleanupInversion01).
 */
export function listLocalChangeBranchEntries(
  repoRoot: string,
  deps: Pick<GitFinalizeDeps, "runGit"> = {},
): ListLocalChangeBranchesResult {
  const runGit = deps.runGit ?? defaultRunGit;
  const localBranches = runGit(repoRoot, [
    "branch",
    "--list",
    "--format=%(refname:short) %(objectname)",
    "change/*",
  ]);
  if (localBranches.status !== 0) {
    return {
      status: "blocked",
      reason: "LOCAL_BRANCH_LIST_FAILED",
      details: splitLines(localBranches.stderr || localBranches.stdout),
    };
  }
  return {
    status: "ok",
    entries: parseLocalChangeBranchRefs(localBranches.stdout),
  };
}

export function detectArchivedMergedBranches(
  input: {
    repoRoot: string;
    defaultBranch: string;
    archivedChangeIds?: string[];
  },
  deps: Pick<GitFinalizeDeps, "runGit"> = {},
): ArchivedMergedBranchesResult {
  const runGit = deps.runGit ?? defaultRunGit;
  const archivedSet = input.archivedChangeIds
    ? new Set(input.archivedChangeIds)
    : null;

  const local = listLocalChangeBranchEntries(input.repoRoot, deps);
  if (local.status === "blocked") {
    return {
      status: "blocked",
      reason: local.reason,
      details: local.details,
    };
  }

  const candidates = local.entries.filter(
    (entry) => !archivedSet || archivedSet.has(entry.changeId),
  );

  const branches: ArchivedMergedBranch[] = [];

  for (const candidate of candidates) {
    const treeCheck = detectSquashMergeByTree(
      input.repoRoot,
      input.defaultBranch,
      candidate.changeId,
      deps,
    );
    if (treeCheck.reachable) {
      branches.push({
        changeId: candidate.changeId,
        branch: candidate.branch,
        localSha: candidate.localSha,
        mergeProof: {
          kind: "tree-identical",
          trunkCommitSha: treeCheck.mergeCommitOid ?? "",
        },
      });
      continue;
    }

    const cherry = runGit(input.repoRoot, [
      "cherry",
      "-v",
      input.defaultBranch,
      candidate.branch,
    ]);
    if (cherry.status !== 0) {
      continue;
    }
    const cherryLines = splitLines(cherry.stdout);
    if (
      cherryLines.length === 0 ||
      cherryLines.every((line) => line.startsWith("-"))
    ) {
      branches.push({
        changeId: candidate.changeId,
        branch: candidate.branch,
        localSha: candidate.localSha,
        mergeProof: { kind: "patch-equivalent" },
      });
    }
  }

  return { status: "ok", branches };
}

export interface CheckedOutChangeBranchesResult {
  status: "ok" | "blocked";
  branches: Set<string>;
  worktreePaths: Record<string, string>;
  reason?: "WORKTREE_LIST_FAILED";
  details?: string[];
}

export function getCheckedOutChangeBranches(
  repoRoot: string,
  deps: Pick<GitFinalizeDeps, "runGit"> = {},
): CheckedOutChangeBranchesResult {
  const runGit = deps.runGit ?? defaultRunGit;

  const output = runGit(repoRoot, ["worktree", "list", "--porcelain"]);
  if (output.status !== 0) {
    return {
      status: "blocked",
      branches: new Set(),
      worktreePaths: {},
      reason: "WORKTREE_LIST_FAILED",
      details: splitLines(output.stderr || output.stdout),
    };
  }

  const worktrees = parseWorktreeListPorcelain(output.stdout);
  const branches = new Set<string>();
  const worktreePaths: Record<string, string> = {};
  for (const wt of worktrees) {
    if (!wt.branch?.startsWith(CHANGE_BRANCH_PREFIX)) continue;
    branches.add(wt.branch);
    worktreePaths[wt.branch] = wt.path;
  }

  return { status: "ok", branches, worktreePaths };
}

export function redriveArchivedUnmergedBranch(
  input: {
    repoRoot: string;
    defaultBranch: string;
    changeId: string;
    changeTitle: string;
    prTitleType?: string;
    prTitlePolicy?: PrTitlePolicy;
  },
  deps: GitFinalizeDeps = {},
): GitFinalizeOutcome {
  const branch = `change/${input.changeId}`;
  const runGit = deps.runGit ?? defaultRunGit;
  const remoteBranch = runGit(input.repoRoot, [
    "ls-remote",
    "--heads",
    "origin",
    `refs/heads/${branch}`,
  ]);
  if (remoteBranch.status !== 0 || !remoteBranch.stdout.trim()) {
    return {
      status: "blocked",
      repoRoot: input.repoRoot,
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
    input.repoRoot,
    input.defaultBranch,
    deps,
  );
  if (route.route !== "pr_auto_merge" || !route.repo) {
    return {
      status: "blocked",
      repoRoot: input.repoRoot,
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
      repoRoot: input.repoRoot,
      repo: route.repo,
      branch,
      defaultBranch: input.defaultBranch,
      changeId: input.changeId,
      changeTitle: input.changeTitle,
      prTitleType: input.prTitleType,
      prTitlePolicy: input.prTitlePolicy,
    },
    deps,
  );
  if ("error" in pr) {
    return {
      status: "blocked",
      repoRoot: input.repoRoot,
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
    input.repoRoot,
    route.repo,
    pr.number,
    input.changeTitle,
    pr.title,
    input.prTitleType,
    input.prTitlePolicy,
    deps,
  );
  if (!armed.ok) {
    return {
      status: "blocked",
      repoRoot: input.repoRoot,
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
      repoRoot: input.repoRoot,
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
      repoRoot: input.repoRoot,
      defaultBranch: input.defaultBranch,
      route: route.route,
      releasedCommitSha: reachability.mergeCommitOid,
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
      repoRoot: input.repoRoot,
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
    repoRoot: input.repoRoot,
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
    classifyFinalizationRoute(input.repoRoot, input.defaultBranch, deps);

  if (route.route === "blocked") {
    return {
      reachable: false,
      proof: "blocked",
      details: route.details ?? (route.reason ? [route.reason] : undefined),
    };
  }

  if (route.route === "no_remote") {
    return {
      reachable: false,
      proof: "blocked",
      details: ["NO_REMOTE_RELEASE_AUTHORITY"],
    };
  }

  if (route.route === "direct") {
    const pushed = verifyDefaultBranchPushed(
      input.repoRoot,
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
      input.repoRoot,
      input.defaultBranch,
      input.changeId,
      deps,
    );
    if (originReachability.reachable) {
      return {
        reachable: true,
        proof: "origin_default",
        releasedCommitSha: pushed.sha,
      };
    }

    // NEW: Auto-discover PR if prNumber missing
    let effectivePrNumber = input.prNumber;
    const directRepo = input.repo ?? route.repo;
    if (!effectivePrNumber && directRepo) {
      const discovered = discoverMergedPr(
        input.repoRoot,
        directRepo,
        input.changeId,
        deps,
      );
      if (!("error" in discovered)) {
        effectivePrNumber = discovered.prNumber;
      }
    }

    // Existing PR merge state check (now with auto-discovered PR)
    if (effectivePrNumber && directRepo) {
      const prState = readPrMergeState(
        input.repoRoot,
        directRepo,
        effectivePrNumber,
        deps,
      );
      if (
        !("error" in prState) &&
        prState.state === "MERGED" &&
        prState.mergedAt &&
        prState.mergeCommitOid
      ) {
        return {
          reachable: true,
          proof: "pr_merged",
          releasedCommitSha: prState.mergeCommitOid,
          prNumber: effectivePrNumber,
          mergeCommitOid: prState.mergeCommitOid,
        };
      }
    }

    // NEW: Tree-based fallback (rq-fixPhase9SquashMergeRedetect: thread
    // changeTipSha so detection survives branch deletion)
    const treeMatch = detectSquashMergeByTree(
      input.repoRoot,
      `origin/${input.defaultBranch}`,
      input.changeId,
      { ...deps, changeTipSha: input.changeTipSha },
    );
    if (treeMatch.reachable && treeMatch.mergeCommitOid) {
      return {
        reachable: true,
        proof: "pr_merged",
        releasedCommitSha: treeMatch.mergeCommitOid,
        mergeCommitOid: treeMatch.mergeCommitOid,
      };
    }

    return {
      reachable: false,
      proof: "origin_unmerged",
      details: originReachability.unmergedCommits,
    };
  }

  // PR workflow routes: pr_auto_merge, pr_manual, merge_queue.
  const repo = input.repo ?? route.repo;

  let effectivePrNumber = input.prNumber;
  let discoveryError: string | undefined;
  if (!effectivePrNumber) {
    const discovered = discoverMergedPr(
      input.repoRoot,
      repo,
      input.changeId,
      deps,
    );
    if ("error" in discovered) {
      discoveryError = discovered.error;
    } else {
      effectivePrNumber = discovered.prNumber;
    }
  }

  if (effectivePrNumber) {
    const prState = readPrMergeState(
      input.repoRoot,
      repo,
      effectivePrNumber,
      deps,
    );
    if ("error" in prState) {
      return {
        reachable: false,
        proof: "pr_unmerged",
        prNumber: effectivePrNumber,
        details: [prState.error, ...(prState.details ?? [])],
      };
    }
    if (
      prState.state === "MERGED" &&
      prState.mergedAt &&
      prState.mergeCommitOid
    ) {
      return {
        reachable: true,
        proof: "pr_merged",
        releasedCommitSha: prState.mergeCommitOid,
        prNumber: effectivePrNumber,
        mergeCommitOid: prState.mergeCommitOid,
      };
    }
    return {
      reachable: false,
      proof: "pr_unmerged",
      prNumber: effectivePrNumber,
      autoMergeArmed: prState.autoMergeArmed,
      details: [`PR state is ${prState.state}`],
    };
  }

  // No PR number and no discoverable merged PR; try structural fallback if a
  // persisted tip SHA is available (rq-fixPhase9SquashMergeRedetect).
  if (input.changeTipSha) {
    const treeMatch = detectSquashMergeByTree(
      input.repoRoot,
      `origin/${input.defaultBranch}`,
      input.changeId,
      { ...deps, changeTipSha: input.changeTipSha },
    );
    if (treeMatch.reachable && treeMatch.mergeCommitOid) {
      return {
        reachable: true,
        proof: "pr_merged",
        releasedCommitSha: treeMatch.mergeCommitOid,
        mergeCommitOid: treeMatch.mergeCommitOid,
      };
    }
  }

  const details = ["prNumber is missing and no merged PR was discoverable"];
  if (discoveryError) details.push(discoveryError);
  return {
    reachable: false,
    proof: "pr_missing_merge_proof",
    details,
  };
}

export function detectArchiveMode(
  config: Record<string, unknown> | undefined,
): { archiveMode: ArchiveMode; autoPush: boolean } {
  const archiveMode = config?.archive_mode ?? "direct";
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
  repoRoot: string;
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
  let repoRoot: string;
  try {
    repoRoot = resolveRepoRoot(workdir, deps);
  } catch {
    return {
      valid: false,
      repoRoot: "",
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
      repoRoot,
      currentBranch,
      error: `Worktree is on ${currentBranch || "(detached)"}, expected ${expectedBranch}`,
    };
  }

  const topLevel = runGit(workdir, ["rev-parse", "--show-toplevel"]);
  if (topLevel.status !== 0 || !topLevel.stdout.trim()) {
    return {
      valid: false,
      repoRoot,
      currentBranch,
      error: `Unable to resolve worktree root for ${workdir}`,
    };
  }

  try {
    if (realpathSync(workdir) !== realpathSync(topLevel.stdout.trim())) {
      return {
        valid: false,
        repoRoot,
        currentBranch,
        error: `Worktree path ${workdir} is not the repository root ${topLevel.stdout.trim()}`,
      };
    }
  } catch (error) {
    return {
      valid: false,
      repoRoot,
      currentBranch,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (deps.requireCleanWorktree) {
    const dirty = splitLines(runGit(workdir, ["status", "--porcelain"]).stdout);
    if (dirty.length > 0) {
      return {
        valid: false,
        repoRoot,
        currentBranch,
        error: `Worktree has uncommitted changes before archive writes: ${dirty.join(", ")}`,
      };
    }
  }

  return { valid: true, repoRoot, currentBranch };
}

export function commitArchiveArtifacts(
  workdir: string,
  changeId: string,
  deps: GitFinalizeDeps = {},
  artifactPaths?: string[],
): { committed: boolean; commitSha?: string; error?: string } {
  const runGit = deps.runGit ?? defaultRunGit;
  const paths = artifactPaths?.length ? [...new Set(artifactPaths)] : [".adv/"];
  const invalidPath = paths.find((path) => {
    const normalized = normalize(path);
    return (
      isAbsolute(path) ||
      normalized === ".." ||
      normalized.startsWith(`..${pathSeparator}`)
    );
  });
  if (invalidPath) {
    return {
      committed: false,
      error: `Archive artifact path must stay within the worktree: ${invalidPath}`,
    };
  }

  // Check if there are any changes to commit
  const status = runGit(workdir, ["status", "--porcelain", "--", ...paths]);
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
  const add = runGit(workdir, ["add", "--", ...paths]);
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
  expectedRepoRoot?: string;
  archiveMode: ArchiveMode;
  autoPush: boolean;
  skipPush?: boolean;
  /** Exact worktree-relative bundle/spec/doc paths owned by archive. */
  artifactPaths?: string[];
  /** Human-readable change title, used when constructing archive PR titles. */
  changeTitle: string;
  /** Optional explicit conventional-commit type override (added by tk-1c560667391b). */
  prTitleType?: string;
  /** Archive PR title policy; absent or plain format falls back to legacy title. */
  prTitlePolicy?: PrTitlePolicy;
}

/**
 * Internal per-invocation accumulator for finalizeRelease (rq-optimizePhase9GitCalls).
 *
 * Caches idempotent git queries within a single finalizeRelease invocation so
 * that repeated calls (e.g. classifyFinalizationRoute at lines ~2862, ~3029,
 * ~3067) only hit git once. State mutations (commit / merge / push / reset)
 * call `invalidate(state, kind)` to drop entries they could stale.
 *
 * Backward-compat: subfunctions accept `state?: FinalizeInvocationState` as a
 * trailing optional parameter. When undefined, no caching occurs (current
 * behavior). External callers (none in production; existing tests) are
 * unaffected.
 *
 * Exported for direct unit testing of the invalidation matrix (rq-optimizePhase9GitCalls AC7).
 * Not part of the stable public API; consumers outside this module should not
 * import these symbols.
 */
export interface FinalizeInvocationState {
  // Static (set at construction)
  readonly repoRoot: string;
  readonly defaultBranch: string;
  readonly deps: GitFinalizeDeps;

  // Cached idempotent queries (lazy)
  remoteUrl?: string;
  route?: FinalizationRoute;
  originHeadSha?: string;
  localHeadSha?: string;
  committerIdent?: { ok: boolean; message?: string };
  mainInProgress?: { inProgress: boolean; state?: string };

  // Fetch dedup flag: true once `fetch origin <default>` succeeds in this invocation
  originDefaultFetched: boolean;
}

export type MutationKind =
  | "commit-archive-artifacts"
  | "commit-dirty-main-checkpoint"
  | "merge-change-branch"
  | "push-to-origin"
  | "push-change-branch"
  | "reset-main-to-origin-default"
  | "execute-pull-request-handoff";

export function createState(
  repoRoot: string,
  defaultBranch: string,
  deps: GitFinalizeDeps,
): FinalizeInvocationState {
  return {
    repoRoot,
    defaultBranch,
    deps,
    originDefaultFetched: false,
  };
}

/**
 * Drop cache entries that the given mutation kind could stale. Per the
 * invalidation matrix in design.md:
 *
 *   mutation                         | entries invalidated
 *   ---------------------------------+----------------------------------------
 *   commit-archive-artifacts         | (none — workdir commit, not main)
 *   commit-dirty-main-checkpoint     | localHeadSha, mainInProgress
 *   merge-change-branch              | originHeadSha, localHeadSha, mainInProgress
 *   push-to-origin                   | originHeadSha
 *   push-change-branch               | (none — main unaffected)
 *   reset-main-to-origin-default     | originHeadSha, localHeadSha, mainInProgress, fetched flag
 *   execute-pull-request-handoff     | originHeadSha, localHeadSha, fetched flag
 *
 * MUST be called on BOTH success and throw paths (rq-optimizePhase9GitCalls AC4).
 */
export function invalidate(
  state: FinalizeInvocationState | undefined,
  kind: MutationKind,
): void {
  if (!state) return;
  switch (kind) {
    case "commit-archive-artifacts":
    case "push-change-branch":
      return;
    case "commit-dirty-main-checkpoint":
      delete state.localHeadSha;
      delete state.mainInProgress;
      return;
    case "merge-change-branch":
      delete state.originHeadSha;
      delete state.localHeadSha;
      delete state.mainInProgress;
      return;
    case "push-to-origin":
      delete state.originHeadSha;
      return;
    case "reset-main-to-origin-default":
      delete state.originHeadSha;
      delete state.localHeadSha;
      delete state.mainInProgress;
      state.originDefaultFetched = false;
      return;
    case "execute-pull-request-handoff":
      delete state.originHeadSha;
      delete state.localHeadSha;
      state.originDefaultFetched = false;
      return;
  }
}

/** Cached accessor for the finalization route. Stable across mutations
 *  (route depends on remote URL + branch protection rules, neither of which
 *  changes during one invocation). */
export function getRoute(state: FinalizeInvocationState): FinalizationRoute {
  if (state.route) return state.route;
  state.route = classifyFinalizationRoute(
    state.repoRoot,
    state.defaultBranch,
    state.deps,
  );
  return state.route;
}

/** Runs `fetch origin <default>` at most once per invocation. Subsequent calls
 *  no-op (returns synthetic success). Failed fetches do NOT set the flag,
 *  allowing callers to retry. */
export function ensureOriginDefaultFetched(
  state: FinalizeInvocationState,
): RunGitResult {
  if (state.originDefaultFetched) {
    return { status: 0, stdout: "", stderr: "" };
  }
  const runGit = state.deps.runGit ?? defaultRunGit;
  const result = runGit(state.repoRoot, [
    "fetch",
    "origin",
    state.defaultBranch,
  ]);
  if (result.status === 0) {
    state.originDefaultFetched = true;
  }
  return result;
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
      repoRoot: worktreeValidation.repoRoot,
      defaultBranch: "",
      pushStatus: "not_attempted",
      blocked: {
        reason: "INVALID_WORKTREE",
        remediation: `${worktreeValidation.error}. rq-releaseFinalization01 requires a validated change worktree on branch change/${ctx.changeId}.`,
      },
    };
  }

  const repoRoot = worktreeValidation.repoRoot;
  if (ctx.expectedRepoRoot && repoRoot !== ctx.expectedRepoRoot) {
    return {
      status: "blocked",
      repoRoot,
      defaultBranch: "",
      pushStatus: "not_attempted",
      blocked: {
        reason: "WORKTREE_PROJECT_MISMATCH",
        remediation: `Worktree ${ctx.workdir} belongs to ${repoRoot}, expected ${ctx.expectedRepoRoot}. rq-releaseFinalization01 requires finalization inside this ADV project.`,
      },
    };
  }

  const { branch: defaultBranch } = detectDefaultBranch(repoRoot, deps);

  // Capture change-tip SHA before any mutation can delete or move the branch.
  // Used by structural squash-merge redetection and recorded in the outcome.
  let changeTipSha: string | undefined;
  try {
    changeTipSha = runGitOrThrow(
      repoRoot,
      ["rev-parse", `change/${ctx.changeId}`],
      deps,
    );
  } catch {
    changeTipSha = undefined;
  }

  // Per-invocation accumulator: caches idempotent git queries and tracks
  // fetch dedup. Mutations call invalidate(state, kind) to drop stale entries.
  const state = createState(repoRoot, defaultBranch, deps);

  // Commit in-repo archive artifacts before merge
  const commitResult = commitArchiveArtifacts(
    ctx.workdir,
    ctx.changeId,
    deps,
    ctx.artifactPaths,
  );
  invalidate(state, "commit-archive-artifacts");
  if (commitResult.error) {
    return {
      status: "blocked",
      repoRoot,
      defaultBranch,
      pushStatus: "not_attempted",
      blocked: {
        reason: "ARCHIVE_COMMIT_FAILED",
        remediation: `${commitResult.error}. rq-releaseFinalization01 requires archive artifacts to be committed before merge.`,
      },
    };
  }

  if (ctx.archiveMode === "pr") {
    const route = coercePrWorkflowRoute(getRoute(state));
    if (route.route === "no_remote" || route.route === "blocked") {
      return {
        status: "blocked",
        repoRoot,
        defaultBranch,
        route: route.route,
        prBranch: `change/${ctx.changeId}`,
        pushStatus: "not_attempted",
        blocked: {
          reason:
            route.route === "no_remote"
              ? "PR_WORKFLOW_REQUIRES_ORIGIN"
              : (route.reason ?? "PR_WORKFLOW_ROUTE_BLOCKED"),
          remediation: `PR archive mode requires an origin-backed GitHub repository and merged PR proof before release completion (rq-releaseFinalization01).`,
          details: route.details ?? (route.reason ? [route.reason] : undefined),
        },
      };
    }

    if (route.route === "merge_queue") {
      return completeMergeQueueHandoff(
        {
          repoRoot,
          workdir: ctx.workdir,
          defaultBranch,
          changeId: ctx.changeId,
          route,
          changeTitle: ctx.changeTitle,
          prTitleType: ctx.prTitleType,
          prTitlePolicy: ctx.prTitlePolicy,
        },
        deps,
      );
    }

    return completeProtectedBranchViaPullRequest(
      {
        repoRoot,
        defaultBranch,
        workdir: ctx.workdir,
        changeId: ctx.changeId,
        route,
        pushFailureReason: "archive_mode_pr",
        changeTitle: ctx.changeTitle,
        prTitleType: ctx.prTitleType,
        prTitlePolicy: ctx.prTitlePolicy,
        changeTipSha,
      },
      deps,
    );
  }
  // Direct / no_remote path: perform merge+push inside an ephemeral detached
  // worktree forked from the canonical remote (or local) default branch. No
  // shared main checkout is inspected or mutated.
  const route = getRoute(state);
  if (route.route === "blocked") {
    return {
      status: "blocked",
      repoRoot,
      defaultBranch,
      route: route.route,
      pushStatus: "not_attempted",
      blocked: {
        reason: route.reason ?? "ROUTE_CLASSIFICATION_BLOCKED",
        remediation: "Unable to classify archive finalization route.",
        details: route.details,
      },
    };
  }

  const runGit = deps.runGit ?? defaultRunGit;

  if (route.route === "no_remote") {
    return {
      status: "blocked",
      repoRoot,
      defaultBranch,
      route: "no_remote",
      pushStatus: "not_attempted",
      blocked: {
        reason: "NO_REMOTE_RELEASE_AUTHORITY",
        remediation: `No origin remote is configured for ${repoRoot}. Configure a canonical origin (a bare repository or a remote-backed repository) before release completion.`,
        details: route.details ?? (route.reason ? [route.reason] : undefined),
      },
    };
  }

  const fetchOrigin = ensureOriginDefaultFetched(state);
  if (fetchOrigin.status !== 0) {
    return {
      status: "blocked",
      repoRoot,
      defaultBranch,
      route: route.route,
      pushStatus: "not_attempted",
      blocked: {
        reason: "DEFAULT_BRANCH_FETCH_FAILED",
        remediation: `Failed to fetch origin/${defaultBranch} before selecting the canonical base for archive finalization (rq-releaseFinalization01).`,
        details: splitLines(fetchOrigin.stderr || fetchOrigin.stdout),
      },
    };
  }

  const originDefaultRef = runGit(repoRoot, [
    "rev-parse",
    "--verify",
    `origin/${defaultBranch}`,
  ]);
  const baseRef =
    originDefaultRef.status === 0 ? `origin/${defaultBranch}` : defaultBranch;

  try {
    return await withEphemeralDefaultBranchWorktree(
      repoRoot,
      baseRef,
      deps,
      async (ephemeral) => {
        // Merge the change branch into the detached default-branch HEAD.
        const merge = mergeToTrunk(
          ephemeral,
          defaultBranch,
          ctx.changeId,
          deps,
        );
        invalidate(state, "merge-change-branch");
        if (merge.status === "blocked") {
          return {
            status: "blocked",
            repoRoot,
            defaultBranch,
            route: route.route,
            pushStatus: "not_attempted",
            blocked: {
              reason: merge.code,
              remediation: `Resolve Phase 9 merge blockers for change/${ctx.changeId}, then rerun archive finalization (rq-releaseFinalization01).`,
              details: merge.conflictFiles,
            },
          };
        }

        // Remote direct path: push from the ephemeral worktree and verify.
        const push = pushToOrigin(ephemeral, defaultBranch, {
          autoPush: ctx.autoPush,
          skipPush: ctx.skipPush,
          runGit: deps.runGit,
        });
        invalidate(state, "push-to-origin");

        if (push.status === "pushed") {
          const remoteDefault = verifyDefaultBranchPushed(
            ephemeral,
            defaultBranch,
            deps,
          );
          if (!remoteDefault.pushed) {
            return {
              status: "blocked",
              repoRoot,
              defaultBranch,
              route: "direct",
              mergeCommitSha: merge.mergeCommitSha,
              pushStatus: "failed",
              pushFailureReason: remoteDefault.reason,
              blocked: {
                reason: "DEFAULT_BRANCH_PUSH_NOT_VERIFIED",
                remediation: `Default branch ${defaultBranch} must be fetched and match origin/${defaultBranch} before release completion (rq-releaseFinalization01).`,
                details: remoteDefault.reason
                  ? [remoteDefault.reason]
                  : undefined,
              },
            };
          }
          return {
            status: "shipped",
            repoRoot,
            defaultBranch,
            route: "direct",
            releasedCommitSha: remoteDefault.sha,
            mergeCommitSha: merge.mergeCommitSha,
            changeTipSha,
            pushStatus: "pushed",
          };
        }

        if (push.status === "failed") {
          if (route.route === "merge_queue") {
            return completeMergeQueueHandoff(
              {
                repoRoot,
                workdir: ctx.workdir,
                changeId: ctx.changeId,
                defaultBranch,
                route,
                changeTitle: ctx.changeTitle,
                prTitleType: ctx.prTitleType,
                prTitlePolicy: ctx.prTitlePolicy,
              },
              deps,
            );
          }
          if (route.route === "pr_auto_merge") {
            return completeProtectedBranchViaPullRequest(
              {
                repoRoot,
                workdir: ctx.workdir,
                changeId: ctx.changeId,
                defaultBranch,
                route,
                pushFailureReason: push.reason,
                changeTitle: ctx.changeTitle,
                prTitleType: ctx.prTitleType,
                prTitlePolicy: ctx.prTitlePolicy,
              },
              deps,
            );
          }
          if (route.route === "pr_manual") {
            return {
              status: "blocked",
              repoRoot,
              defaultBranch,
              route: route.route,
              mergeCommitSha: merge.mergeCommitSha,
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
          repoRoot,
          defaultBranch,
          route: "direct",
          mergeCommitSha: merge.mergeCommitSha,
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
      },
    );
  } catch (error) {
    return {
      status: "blocked",
      repoRoot,
      defaultBranch,
      route: route.route,
      pushStatus: "not_attempted",
      blocked: {
        reason: "EPHEMERAL_WORKTREE_FAILED",
        remediation: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
