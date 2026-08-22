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
  /** SHA of the change branch tip before archive artifacts were committed. */
  preArchiveTipSha?: string;
  /** Exact PR head SHA accepted for a direct-route merged-PR proof. */
  prHeadSha?: string;
  /** Current origin/default SHA containing the accepted PR merge commit. */
  defaultBranchSha?: string;
  pushStatus: "pushed" | "skipped" | "failed" | "not_attempted";
  pushFailureReason?: string;
  prBranch?: string;
  repo?: string;
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
  /** Persisted change tip used by origin reachability after branch cleanup. */
  changeTipSha?: string;
  requireCleanWorktree?: boolean;
  /**
   * Optional per-project worktree file-lock used by the remote-first isolated
   * archive finalization path to serialize ephemeral `git worktree add/remove`
   * operations against peer sessions. The lock callback is supplied by the caller
   * (e.g. `adv_change_archive`) so `git-finalize.ts` does not need to import
   * worker-lock internals, preserving the runtime-bundle boundary.
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
  /** Alternate source branch used only by structurally validated archive repair. */
  sourceBranch?: string;
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

export type DirectMergedPrProof =
  | { kind: "none" }
  | {
      kind: "valid";
      prNumber: number;
      prUrl?: string;
      prHeadSha: string;
      mergeCommitOid: string;
      defaultBranchSha: string;
    }
  | { kind: "invalid"; reason: string; details?: string[] };

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
  sourceBranch?: string;
  route?: FinalizationRoute;
  prNumber?: number;
  /** Optional repo override; falls back to route.repo. */
  repo?: string;
  /** Persisted exact PR head SHA for a prior direct-route finalization. */
  prHeadSha?: string;
  // rq-fixPhase9SquashMergeRedetect SC1: persisted change-tip SHA captured at
  // archive dispatch time. When provided, detection uses this content-addressed
  // tip instead of the live change/{id} git ref so reachability survives
  // branch deletion (squash-merge + branch cleanup before phase9:"run").
  changeTipSha?: string;
  /** Persisted change branch tip from before archive artifacts were committed. */
  preArchiveTipSha?: string;
}

export type ReleaseReachabilityProof =
  | {
      reachable: true;
      proof:
        | "local_merge"
        | "origin_default"
        | "pr_merged"
        | "pr_merged_by_tree_pre_archive";
      /** Route-neutral SHA from the authority that proved release (required). */
      releasedCommitSha: string;
      prNumber?: number;
      prHeadSha?: string;
      mergeCommitOid?: string;
      defaultBranchSha?: string;
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
        | "change_ref_unresolved"
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

type GhJsonParse =
  | { kind: "empty" }
  | { kind: "ok"; value: unknown }
  | { kind: "malformed"; message: string };

function parseGhJson(value: string): GhJsonParse {
  const trimmed = value.trim();
  if (!trimmed) return { kind: "empty" };
  try {
    return { kind: "ok", value: JSON.parse(trimmed) };
  } catch (error) {
    return {
      kind: "malformed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled gh JSON parse result: ${String(value)}`);
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

  const parsedRules = parseGhJson(rules.stdout);
  switch (parsedRules.kind) {
    case "empty":
      return {
        route: "blocked",
        repo: origin.repo,
        remoteUrl: origin.remoteUrl,
        reason: "POLICY_DETECTION_FAILED",
        details: splitLines(rules.stdout),
      };
    case "malformed":
      return {
        route: "blocked",
        repo: origin.repo,
        remoteUrl: origin.remoteUrl,
        reason: "POLICY_DETECTION_FAILED",
        details: [parsedRules.message],
      };
    case "ok": {
      const rulesValue = parsedRules.value;
      if (!Array.isArray(rulesValue)) {
        return {
          route: "blocked",
          repo: origin.repo,
          remoteUrl: origin.remoteUrl,
          reason: "POLICY_DETECTION_FAILED",
          parsedRules: undefined,
          details: splitLines(rules.stdout),
        };
      }

      if (rulesValue.some((r) => r?.type === "merge_queue")) {
        return {
          route: "merge_queue",
          repo: origin.repo,
          remoteUrl: origin.remoteUrl,
          protected: true,
          mergeQueueRequired: true,
          parsedRules: rulesValue,
        };
      }

      if (rulesValue.length === 0) {
        return {
          route: "direct",
          repo: origin.repo,
          remoteUrl: origin.remoteUrl,
          protected: false,
          parsedRules: rulesValue,
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
          parsedRules: rulesValue,
          details: splitLines(allowAutoMerge.stderr || allowAutoMerge.stdout),
        };
      }

      const parsedAllowAutoMerge = parseGhJson(allowAutoMerge.stdout);
      switch (parsedAllowAutoMerge.kind) {
        case "empty":
          return {
            route: "pr_manual",
            repo: origin.repo,
            remoteUrl: origin.remoteUrl,
            protected: true,
            autoMergeAllowed: false,
            parsedRules: rulesValue,
            reason: "AUTO_MERGE_DISABLED",
          };
        case "malformed":
          return {
            route: "blocked",
            repo: origin.repo,
            remoteUrl: origin.remoteUrl,
            protected: true,
            reason: "POLICY_DETECTION_FAILED",
            parsedRules: rulesValue,
            details: [parsedAllowAutoMerge.message],
          };
        case "ok":
          if (parsedAllowAutoMerge.value === true) {
            return {
              route: "pr_auto_merge",
              repo: origin.repo,
              remoteUrl: origin.remoteUrl,
              protected: true,
              autoMergeAllowed: true,
              parsedRules: rulesValue,
            };
          }

          return {
            route: "pr_manual",
            repo: origin.repo,
            remoteUrl: origin.remoteUrl,
            protected: true,
            autoMergeAllowed: false,
            parsedRules: rulesValue,
            reason: "AUTO_MERGE_DISABLED",
          };
        default:
          return assertNever(parsedAllowAutoMerge);
      }
    }
    default:
      return assertNever(parsedRules);
  }
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

/**
 * Local-only merge pre-check used by `mergeChangeBranch`.
 *
 * NOT RELEASE-CRITICAL: this is not the release reachability proof. The release
 * path uses `verifyChangeBranchReachableFromOrigin`. This helper runs while the
 * change branch still exists locally, immediately before an attempted merge.
 *
 * It shares one defect class with the release proof and is hardened for the same
 * reason (P25): a nonzero `git log` exit must never be laundered into
 * `unmergedCommits`, which callers read as real commit evidence.
 */
export function verifyChangeBranchReachable(
  repoRoot: string,
  defaultBranch: string,
  changeId: string,
  deps: GitFinalizeDeps = {},
): {
  reachable: boolean;
  unmergedCommits: string[];
  refUnresolved?: true;
} {
  const runGit = deps.runGit ?? defaultRunGit;
  const sourceBranch = deps.sourceBranch ?? `change/${changeId}`;
  const resolved = runGit(repoRoot, [
    "rev-parse",
    "--verify",
    "--quiet",
    `refs/heads/${sourceBranch}`,
  ]);
  if (resolved.status !== 0 || !resolved.stdout.trim()) {
    return { reachable: false, unmergedCommits: [], refUnresolved: true };
  }

  const result = runGit(repoRoot, [
    "log",
    "--oneline",
    `${defaultBranch}..${sourceBranch}`,
  ]);
  if (result.status !== 0) {
    // Ref resolved, so this is an operational git failure, not commit evidence.
    return { reachable: false, unmergedCommits: [], refUnresolved: true };
  }
  const unmergedCommits = splitLines(result.stdout);
  return { reachable: unmergedCommits.length === 0, unmergedCommits };
}

/**
 * Proves the change tip is an ancestor of `origin/<defaultBranch>`.
 *
 * Tip resolution is two-tier:
 *  - persisted `deps.changeTipSha` (preferred; branch-deletion-safe, no network)
 *  - otherwise a single combined fetch refreshes `refs/remotes/origin/change/<id>`
 *
 * SAFETY INVARIANT: the remote-tracking ref is never read unless that refresh
 * succeeded. A stale `refs/remotes/origin/change/<id>` can read as reachable and
 * would be a silent release fail-open (rq-releaseFinalization01).
 *
 * PRECONDITION: on the persisted-tip path this function performs no fetch, so
 * `origin/<defaultBranch>` must already be current. `resolveReleaseReachability`
 * satisfies this by calling `verifyDefaultBranchPushed` immediately beforehand.
 * A stale default branch can only under-report reachability (fail-closed), never
 * over-report it.
 *
 * NETWORK COST (constraint C3 — no new round-trip): the direct route already
 * performed two fetches before this change — one in `verifyDefaultBranchPushed`
 * and one here. The refreshed-ref path folds the change ref into this function's
 * single pre-existing fetch via a second refspec, so the total is unchanged at
 * two; the persisted-tip path performs none, reducing the total to one. The
 * default-branch refspec is retained here rather than relying on the caller's
 * fetch so the function stays self-sufficient for direct callers.
 */
export function verifyChangeBranchReachableFromOrigin(
  repoRoot: string,
  defaultBranch: string,
  changeId: string,
  deps: GitFinalizeDeps = {},
): {
  reachable: boolean;
  unmergedCommits: string[];
  refSource?: "persisted" | "refreshed_ref";
  refUnresolved?: true;
} {
  const runGit = deps.runGit ?? defaultRunGit;

  let tipRef: string;
  let refSource: "persisted" | "refreshed_ref";
  const sourceBranch = deps.sourceBranch ?? `change/${changeId}`;
  if (deps.changeTipSha?.trim()) {
    tipRef = deps.changeTipSha.trim();
    refSource = "persisted";
  } else {
    const fetch = runGit(repoRoot, [
      "fetch",
      "origin",
      `refs/heads/${defaultBranch}:refs/remotes/origin/${defaultBranch}`,
      `+refs/heads/${sourceBranch}:refs/remotes/origin/${sourceBranch}`,
    ]);
    if (fetch.status !== 0) {
      return {
        reachable: false,
        unmergedCommits: [],
        refUnresolved: true,
      };
    }

    const resolvedTip = runGit(repoRoot, [
      "rev-parse",
      "--verify",
      `refs/remotes/origin/${sourceBranch}`,
    ]);
    if (resolvedTip.status !== 0 || !resolvedTip.stdout.trim()) {
      return {
        reachable: false,
        unmergedCommits: [],
        refUnresolved: true,
      };
    }
    tipRef = resolvedTip.stdout.trim();
    refSource = "refreshed_ref";
  }

  const result = runGit(repoRoot, [
    "merge-base",
    "--is-ancestor",
    tipRef,
    `origin/${defaultBranch}`,
  ]);
  if (result.status === 0) {
    return {
      reachable: true,
      unmergedCommits: [],
      refSource,
    };
  }
  if (result.status === 1) {
    return {
      reachable: false,
      unmergedCommits: [],
      refSource,
    };
  }
  return {
    reachable: false,
    unmergedCommits: [],
    refSource,
    refUnresolved: true,
  };
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
  const sourceBranch = deps.sourceBranch ?? `change/${changeId}`;
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
  const merge = runGit(repoRoot, ["merge", "--ff-only", sourceBranch]);
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
    sourceBranch,
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
    branchName?: string;
  },
):
  | { status: "pushed"; output: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string } {
  if (options.skipPush)
    return { status: "skipped", reason: "--no-push requested" };
  if (!options.autoPush)
    return { status: "skipped", reason: "auto_push disabled" };

  const branch = options.branchName ?? `change/${changeId}`;
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
  deps: Pick<GitFinalizeDeps, "runGit" | "sourceBranch"> = {},
): { pushed: boolean; reason?: string } {
  const runGit = deps.runGit ?? defaultRunGit;
  const branch = deps.sourceBranch ?? `change/${changeId}`;
  const local = runGit(repoRoot, ["rev-parse", `refs/heads/${branch}`]);
  if (local.status !== 0 || !local.stdout.trim()) {
    return {
      pushed: false,
      reason: (
        local.stderr ||
        local.stdout ||
        `${branch} not found locally`
      ).trim(),
    };
  }

  const lsRemote = runGit(repoRoot, [
    "ls-remote",
    "origin",
    `refs/heads/${branch}`,
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
      `${branch} not found on origin`
    ).trim(),
  };
}

export function verifyDefaultBranchPushed(
  repoRoot: string,
  defaultBranch: string,
  deps: Pick<GitFinalizeDeps, "runGit"> = {},
): { pushed: true; sha: string } | { pushed: false; reason: string } {
  const runGit = deps.runGit ?? defaultRunGit;
  const fetch = runGit(repoRoot, ["fetch", "origin", defaultBranch]);
  if (fetch.status !== 0) {
    return {
      pushed: false,
      reason: (
        fetch.stderr ||
        fetch.stdout ||
        `unable to fetch origin/${defaultBranch}`
      ).trim(),
    };
  }
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
  const parsed = parseGhJson(result.stdout);
  switch (parsed.kind) {
    case "empty":
      return {
        error: "PR_STATE_UNPARSEABLE",
        details: splitLines(result.stdout),
      };
    case "malformed":
      return {
        error: "PR_STATE_UNPARSEABLE",
        details: [parsed.message],
      };
    case "ok": {
      if (!parsed.value || typeof parsed.value !== "object") {
        return {
          error: "PR_STATE_UNPARSEABLE",
          details: splitLines(result.stdout),
        };
      }
      const payload = parsed.value as {
        state?: unknown;
        mergedAt?: unknown;
        mergeCommit?: { oid?: unknown } | null;
        autoMergeRequest?: unknown;
      };
      return {
        state: typeof payload.state === "string" ? payload.state : "UNKNOWN",
        mergedAt:
          typeof payload.mergedAt === "string" ? payload.mergedAt : null,
        mergeCommitOid:
          payload.mergeCommit && typeof payload.mergeCommit.oid === "string"
            ? payload.mergeCommit.oid
            : undefined,
        autoMergeArmed:
          payload.autoMergeRequest !== null &&
          payload.autoMergeRequest !== undefined,
        raw: parsed.value,
      };
    }
    default:
      return assertNever(parsed);
  }
}

/**
 * Query and verify an already-merged PR before a direct-route merge attempt.
 *
 * A direct route can still have been merged through GitHub before Phase 9 is
 * resumed (notably after a squash merge plus later trunk commits). The proof
 * is accepted only when the API response identifies the exact repository,
 * head/base branches, local change-tip SHA, and a non-empty merge commit that
 * is reachable from the freshly fetched origin/default ref.
 *
 * An explicit empty list means no merged-PR proof exists and preserves the
 * existing direct merge path. Malformed responses and multiple exact matches
 * fail closed. Well-formed historical records with a different head OID are
 * diagnostics, not competing proof authorities.
 */
const DIRECT_MERGED_PR_QUERY_LIMIT = 20;

export function verifyDirectMergedPrProof(
  input: {
    repoRoot: string;
    repo?: string;
    defaultBranch: string;
    changeId: string;
    branchName?: string;
    changeTipSha?: string;
    preArchiveTipSha?: string;
    sourceBranch?: string;
  },
  deps: Pick<GitFinalizeDeps, "runGit" | "runGh"> = {},
): DirectMergedPrProof {
  if (!input.repo) return { kind: "none" };

  const runGh = deps.runGh ?? defaultRunGh;
  const branch = input.branchName ?? `change/${input.changeId}`;
  const result = runGh(input.repoRoot, [
    "pr",
    "list",
    "--repo",
    input.repo,
    "--state",
    "merged",
    "--head",
    branch,
    "--base",
    input.defaultBranch,
    "--json",
    "number,url,state,mergedAt,mergeCommit,headRefName,headRefOid,baseRefName,headRepositoryOwner,headRepository,isCrossRepository",
    "--limit",
    String(DIRECT_MERGED_PR_QUERY_LIMIT),
  ]);
  if (result.status !== 0) {
    return {
      kind: "invalid",
      reason: "MERGED_PR_PROOF_QUERY_FAILED",
      details: splitLines(result.stderr || result.stdout),
    };
  }

  const parsed = parseGhJson(result.stdout);
  if (parsed.kind === "empty") {
    return {
      kind: "invalid",
      reason: "MERGED_PR_PROOF_UNPARSEABLE",
      details: [],
    };
  }
  if (parsed.kind === "malformed") {
    return {
      kind: "invalid",
      reason: "MERGED_PR_PROOF_UNPARSEABLE",
      details: [parsed.message],
    };
  }
  if (!Array.isArray(parsed.value)) {
    return {
      kind: "invalid",
      reason: "MERGED_PR_PROOF_UNPARSEABLE",
      details: ["GitHub returned a non-array pull-request payload"],
    };
  }
  if (parsed.value.length === 0) return { kind: "none" };

  const repoParts = input.repo.split("/").slice(-2);
  if (repoParts.length !== 2 || repoParts.some((part) => !part)) {
    return {
      kind: "invalid",
      reason: "MERGED_PR_PROOF_REPOSITORY_UNPARSEABLE",
    };
  }
  const [expectedOwner, expectedName] = repoParts;
  const localTip = input.changeTipSha?.trim();
  const preArchiveTip = input.preArchiveTipSha?.trim();
  const candidates: DirectMergedPrProof[] = [];

  for (const value of parsed.value) {
    if (!value || typeof value !== "object") {
      candidates.push({
        kind: "invalid",
        reason: "MERGED_PR_PROOF_RECORD_UNPARSEABLE",
      });
      continue;
    }
    const payload = value as {
      number?: unknown;
      url?: unknown;
      state?: unknown;
      mergedAt?: unknown;
      mergeCommit?: { oid?: unknown } | null;
      headRefName?: unknown;
      headRefOid?: unknown;
      baseRefName?: unknown;
      headRepositoryOwner?: { login?: unknown } | string | null;
      headRepository?: {
        name?: unknown;
        nameWithOwner?: unknown;
      } | null;
      isCrossRepository?: unknown;
    };
    const owner =
      typeof payload.headRepositoryOwner === "string"
        ? payload.headRepositoryOwner
        : payload.headRepositoryOwner?.login;
    const headRepository = payload.headRepository;
    const exactHeadRepository =
      typeof headRepository?.nameWithOwner === "string"
        ? headRepository.nameWithOwner === input.repo
        : owner === expectedOwner && headRepository?.name === expectedName;
    const prNumber = payload.number;
    const prHeadSha =
      typeof payload.headRefOid === "string" ? payload.headRefOid.trim() : "";
    const mergeCommitOid =
      typeof payload.mergeCommit?.oid === "string"
        ? payload.mergeCommit.oid.trim()
        : "";
    const validPrNumber =
      typeof prNumber === "number" && Number.isInteger(prNumber) && prNumber > 0
        ? prNumber
        : undefined;
    const exactRecord =
      validPrNumber !== undefined &&
      payload.state === "MERGED" &&
      typeof payload.mergedAt === "string" &&
      payload.mergedAt.trim() !== "" &&
      payload.headRefName === branch &&
      payload.baseRefName === input.defaultBranch &&
      payload.isCrossRepository !== true &&
      exactHeadRepository &&
      prHeadSha !== "" &&
      mergeCommitOid !== "" &&
      (localTip !== undefined || preArchiveTip !== undefined) &&
      (prHeadSha === localTip || prHeadSha === preArchiveTip);

    if (!exactRecord) {
      candidates.push({
        kind: "invalid",
        reason: "MERGED_PR_PROOF_MISMATCH",
        details: [
          `PR ${String(prNumber)} did not match exact repo/head/base/state/OID proof`,
        ],
      });
      continue;
    }

    candidates.push({
      kind: "valid",
      prNumber: validPrNumber as number,
      prUrl: typeof payload.url === "string" ? payload.url : undefined,
      prHeadSha,
      mergeCommitOid,
      defaultBranchSha: "",
    });
  }

  const valid = candidates.filter(
    (candidate): candidate is Extract<DirectMergedPrProof, { kind: "valid" }> =>
      candidate.kind === "valid",
  );
  const unparseable = candidates.find(
    (candidate) =>
      candidate.kind === "invalid" &&
      candidate.reason === "MERGED_PR_PROOF_RECORD_UNPARSEABLE",
  );
  if (unparseable?.kind === "invalid") return unparseable;

  if (valid.length > 1) {
    return {
      kind: "invalid",
      reason: "MERGED_PR_PROOF_AMBIGUOUS",
      details: valid.map(
        (candidate) =>
          `PR ${String(candidate.prNumber)} exactly matched the local change tip`,
      ),
    };
  }

  if (valid.length === 0) {
    const details = candidates.flatMap((candidate) =>
      candidate.kind === "invalid" ? (candidate.details ?? []) : [],
    );
    if (parsed.value.length === DIRECT_MERGED_PR_QUERY_LIMIT) {
      details.push(
        `Merged PR proof query reached limit ${String(DIRECT_MERGED_PR_QUERY_LIMIT)} without an exact local-tip match`,
      );
    }
    return {
      kind: "invalid",
      reason: "MERGED_PR_PROOF_MISMATCH",
      details,
    };
  }

  const selected = valid[0];
  if (!selected) {
    return {
      kind: "invalid",
      reason: "MERGED_PR_PROOF_MISMATCH",
      details: ["Exact merged PR proof selection produced no candidate"],
    };
  }

  const runGit = deps.runGit ?? defaultRunGit;
  const reachable = runGit(input.repoRoot, [
    "merge-base",
    "--is-ancestor",
    selected.mergeCommitOid,
    `origin/${input.defaultBranch}`,
  ]);
  if (reachable.status !== 0) {
    return {
      kind: "invalid",
      reason:
        reachable.status === 1
          ? "MERGED_PR_COMMIT_UNREACHABLE"
          : "MERGED_PR_REACHABILITY_CHECK_FAILED",
      details: splitLines(reachable.stderr || reachable.stdout),
    };
  }

  const defaultBranch = runGit(input.repoRoot, [
    "rev-parse",
    "--verify",
    `origin/${input.defaultBranch}`,
  ]);
  if (defaultBranch.status !== 0 || !defaultBranch.stdout.trim()) {
    return {
      kind: "invalid",
      reason: "DEFAULT_BRANCH_REACHABILITY_UNRESOLVED",
      details: splitLines(defaultBranch.stderr || defaultBranch.stdout),
    };
  }

  return {
    ...selected,
    defaultBranchSha: defaultBranch.stdout.trim(),
  };
}

export function discoverMergedPr(
  repoRoot: string,
  repo: string | undefined,
  changeId: string,
  deps: Pick<GitFinalizeDeps, "runGh"> = {},
  branchName?: string,
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
    branchName ?? `change/${changeId}`,
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
  const parsed = parseGhJson(result.stdout);
  switch (parsed.kind) {
    case "empty":
      return { error: "NO_MERGED_PR_FOUND" };
    case "malformed":
      return { error: "NO_MERGED_PR_FOUND", details: [parsed.message] };
    case "ok": {
      if (!Array.isArray(parsed.value) || parsed.value.length === 0) {
        return { error: "NO_MERGED_PR_FOUND" };
      }
      const pr = parsed.value[0] as {
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
    default:
      return assertNever(parsed);
  }
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
    /** Persisted change branch tip from before archive artifacts were committed. */
    preArchiveTipSha?: string;
    sourceBranch?: string;
  } = {},
):
  | {
      reachable: false;
    }
  | {
      reachable: true;
      mergeCommitOid: string;
      proof: "pr_merged" | "pr_merged_by_tree_pre_archive";
    } {
  const runGit = deps.runGit ?? defaultRunGit;

  // Try the post-bundle tree first, then the pre-bundle tree. Each trunk walk
  // remains bounded to the most recent 50 commits and uses exact tree-SHA
  // equality. The second token preserves that the match is structural rather
  // than an API-confirmed merged-PR proof.
  const treeCandidates = [
    {
      tipRef: deps.changeTipSha ?? deps.sourceBranch ?? `change/${changeId}`,
      proof: "pr_merged" as const,
    },
    ...(deps.preArchiveTipSha?.trim()
      ? [
          {
            tipRef: deps.preArchiveTipSha,
            proof: "pr_merged_by_tree_pre_archive" as const,
          },
        ]
      : []),
  ];

  for (const candidate of treeCandidates) {
    const changeTree = runGit(repoRoot, [
      "rev-parse",
      `${candidate.tipRef}^{tree}`,
    ]);
    if (changeTree.status !== 0) continue;
    const changeTreeSha = changeTree.stdout.trim();
    if (!changeTreeSha) continue;

    // Get recent trunk commits (last 50) with tree SHAs.
    const trunkCommits = runGit(repoRoot, [
      "log",
      "--format=%H %T",
      "-50",
      defaultBranch,
    ]);
    if (trunkCommits.status !== 0) continue;

    // Parse and compare tree SHAs.
    const lines = splitLines(trunkCommits.stdout);
    for (const line of lines) {
      const [commitSha, treeSha] = line.split(/\s+/, 2);
      if (treeSha === changeTreeSha && commitSha) {
        return {
          reachable: true,
          mergeCommitOid: commitSha,
          proof: candidate.proof,
        };
      }
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
  const parsed = parseGhJson(result.stdout);
  switch (parsed.kind) {
    case "empty":
      return {
        error: "PR_SUMMARY_UNPARSEABLE",
        details: splitLines(result.stdout),
      };
    case "malformed":
      return { error: "PR_SUMMARY_UNPARSEABLE", details: [parsed.message] };
    case "ok": {
      const summary = parsePullRequestSummary(parsed.value);
      return "error" in summary
        ? { ...summary, details: splitLines(result.stdout) }
        : summary;
    }
    default:
      return assertNever(parsed);
  }
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
      const parsed = parseGhJson(titleResult.stdout);
      switch (parsed.kind) {
        case "empty":
          return {
            ok: false,
            reason: "PR_TITLE_LOOKUP_FAILED",
            details: ["gh pr view did not return a parseable title."],
          };
        case "malformed":
          return {
            ok: false,
            reason: "PR_TITLE_LOOKUP_FAILED",
            details: [parsed.message],
          };
        case "ok":
          if (
            !parsed.value ||
            typeof parsed.value !== "object" ||
            typeof (parsed.value as { title?: unknown }).title !== "string"
          ) {
            return {
              ok: false,
              reason: "PR_TITLE_LOOKUP_FAILED",
              details: ["gh pr view did not return a parseable title."],
            };
          }
          liveTitle = (parsed.value as { title: string }).title;
          break;
        default:
          return assertNever(parsed);
      }
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
    preArchiveTipSha?: string;
    sourceBranch?: string;
  },
  deps: GitFinalizeDeps = {},
): GitFinalizeOutcome {
  const branchPush = pushChangeBranch(input.workdir, input.changeId, {
    autoPush: true,
    runGit: deps.runGit,
    branchName: input.branch,
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
      sourceBranch: input.sourceBranch,
    },
    deps,
  );
  if (
    reachability.reachable &&
    (reachability.proof === "pr_merged" ||
      reachability.proof === "pr_merged_by_tree_pre_archive")
  ) {
    return {
      status: "shipped",
      repoRoot: input.repoRoot,
      defaultBranch: input.defaultBranch,
      route: input.route.route,
      releasedCommitSha: reachability.mergeCommitOid,
      // A tree match proves released content, but does not provide the API
      // confirmation required for the merged-PR commit field.
      mergeCommitSha:
        reachability.proof === "pr_merged"
          ? reachability.mergeCommitOid
          : undefined,
      changeTipSha: input.changeTipSha,
      preArchiveTipSha: input.preArchiveTipSha,
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
      preArchiveTipSha: input.preArchiveTipSha,
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
    preArchiveTipSha?: string;
    sourceBranch?: string;
  },
  deps: GitFinalizeDeps = {},
): GitFinalizeOutcome {
  const branch = input.sourceBranch ?? `change/${input.changeId}`;
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
      preArchiveTipSha: input.preArchiveTipSha,
      sourceBranch: input.sourceBranch,
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
    preArchiveTipSha?: string;
    sourceBranch?: string;
  },
  deps: GitFinalizeDeps = {},
): GitFinalizeOutcome {
  const branch = input.sourceBranch ?? `change/${input.changeId}`;
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

  // rq-fixPhase9PostMergeFinalization: when the change's PR is already merged,
  // reconciling the stale change branch against the default branch is
  // pointless — main already carries the merged artifacts (including the
  // .adv/archive/** bundle files), so a stale-branch merge inevitably
  // conflicts and RECONCILE_CONFLICT blocks forever. Detect the already-merged
  // state BEFORE reconcile and synthesize a shipped outcome so the merged-PR
  // completion path in archive-gate.ts can finalize phase9_status. The
  // verification is strict: exact repo/head/base/state/OID match against the
  // persisted changeTipSha or preArchiveTipSha. A "none" or "invalid" result
  // (e.g. ambiguous proof, missing tip SHA) falls through to reconcile so
  // genuine conflicts on unmerged branches still block as before.
  const mergedPrProof = verifyDirectMergedPrProof(
    {
      repoRoot: input.repoRoot,
      repo: input.route.repo,
      defaultBranch: input.defaultBranch,
      changeId: input.changeId,
      branchName: branch,
      changeTipSha: input.changeTipSha,
      preArchiveTipSha: input.preArchiveTipSha,
    },
    deps,
  );
  if (mergedPrProof.kind === "valid") {
    return {
      status: "shipped",
      repoRoot: input.repoRoot,
      defaultBranch: input.defaultBranch,
      route: input.route.route,
      releasedCommitSha: mergedPrProof.defaultBranchSha,
      mergeCommitSha: mergedPrProof.mergeCommitOid,
      changeTipSha: input.changeTipSha,
      preArchiveTipSha: input.preArchiveTipSha,
      pushStatus: "skipped",
      pushFailureReason: "merged_pr_detected_pre_reconcile",
      prBranch: branch,
      repo: input.route.repo,
      prNumber: mergedPrProof.prNumber,
      prUrl: mergedPrProof.prUrl,
      prHeadSha: mergedPrProof.prHeadSha,
      defaultBranchSha: mergedPrProof.defaultBranchSha,
      autoMergeArmed: false,
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
      preArchiveTipSha: input.preArchiveTipSha,
      sourceBranch: input.sourceBranch,
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
      const prefix = "change/";
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
    if (!wt.branch?.startsWith("change/")) continue;
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
  if (
    reachability.reachable &&
    (reachability.proof === "pr_merged" ||
      reachability.proof === "pr_merged_by_tree_pre_archive")
  ) {
    return {
      status: "shipped",
      repoRoot: input.repoRoot,
      defaultBranch: input.defaultBranch,
      route: route.route,
      releasedCommitSha: reachability.mergeCommitOid,
      // Keep structural pre-archive proof distinct from API-confirmed merge
      // proof; only the latter populates mergeCommitSha.
      mergeCommitSha:
        reachability.proof === "pr_merged"
          ? reachability.mergeCommitOid
          : undefined,
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
      {
        ...deps,
        changeTipSha: input.changeTipSha,
        sourceBranch: input.sourceBranch,
      },
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
        input.sourceBranch,
      );
      if (!("error" in discovered)) {
        effectivePrNumber = discovered.prNumber;
      }
    }

    // A persisted exact head SHA upgrades release-gate rechecks to the same
    // strict proof used before a direct merge. This keeps a later gate check
    // from accepting an unrelated merged PR or unreachable merge commit.
    if (directRepo && input.prHeadSha) {
      const exactProof = verifyDirectMergedPrProof(
        {
          repoRoot: input.repoRoot,
          repo: directRepo,
          defaultBranch: input.defaultBranch,
          changeId: input.changeId,
          changeTipSha: input.changeTipSha,
          preArchiveTipSha: input.preArchiveTipSha,
          branchName: input.sourceBranch,
        },
        deps,
      );
      if (exactProof.kind === "valid") {
        if (
          input.prNumber === undefined ||
          input.prNumber === exactProof.prNumber
        ) {
          return {
            reachable: true,
            proof: "pr_merged",
            releasedCommitSha: exactProof.mergeCommitOid,
            prNumber: exactProof.prNumber,
            prHeadSha: exactProof.prHeadSha,
            mergeCommitOid: exactProof.mergeCommitOid,
            defaultBranchSha: exactProof.defaultBranchSha,
          };
        }
        return {
          reachable: false,
          proof: "blocked",
          prNumber: input.prNumber,
          details: ["Merged PR number does not match persisted Phase 9 proof"],
        };
      }
      if (exactProof.kind === "invalid") {
        return {
          reachable: false,
          proof: "blocked",
          prNumber: input.prNumber,
          details: [exactProof.reason, ...(exactProof.details ?? [])],
        };
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
      {
        ...deps,
        changeTipSha: input.changeTipSha,
        preArchiveTipSha: input.preArchiveTipSha,
        sourceBranch: input.sourceBranch,
      },
    );
    if (treeMatch.reachable && treeMatch.mergeCommitOid) {
      return {
        reachable: true,
        proof: treeMatch.proof,
        releasedCommitSha: treeMatch.mergeCommitOid,
        mergeCommitOid: treeMatch.mergeCommitOid,
      };
    }

    return {
      reachable: false,
      proof: originReachability.refUnresolved
        ? "change_ref_unresolved"
        : "origin_unmerged",
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
      input.sourceBranch,
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
      {
        ...deps,
        changeTipSha: input.changeTipSha,
        preArchiveTipSha: input.preArchiveTipSha,
        sourceBranch: input.sourceBranch,
      },
    );
    if (treeMatch.reachable && treeMatch.mergeCommitOid) {
      return {
        reachable: true,
        proof: treeMatch.proof,
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
  const expectedBranch = deps.sourceBranch ?? `change/${changeId}`;
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

export interface ArchiveDeltaRepairValidation {
  valid: boolean;
  repoRoot: string;
  repairBranch?: string;
  repairHeadSha?: string;
  defaultBranch?: string;
  defaultBranchSha?: string;
  defaultTreeSha?: string;
  error?: string;
}

/**
 * Validate the only worktree allowed to repair an archived delta projection.
 * The fetch and equality checks happen before archiveChange can write any
 * tracked projection, making an old or diverged repair basis fail closed.
 */
export function validateArchiveDeltaRepairWorktree(
  workdir: string,
  changeId: string,
  expectedRepoRoot: string,
  deps: GitFinalizeDeps = {},
): ArchiveDeltaRepairValidation {
  const runGit = deps.runGit ?? defaultRunGit;
  const repairBranch = `repair/archive-${changeId}`;
  let repoRoot: string;
  try {
    repoRoot = resolveRepoRoot(workdir, deps);
    if (realpathSync(repoRoot) !== realpathSync(expectedRepoRoot)) {
      return {
        valid: false,
        repoRoot,
        error: `Repair worktree belongs to ${repoRoot}, expected ${expectedRepoRoot}`,
      };
    }
  } catch (error) {
    return {
      valid: false,
      repoRoot: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const branch = runGit(workdir, ["branch", "--show-current"]).stdout.trim();
  if (branch !== repairBranch) {
    return {
      valid: false,
      repoRoot,
      repairBranch: branch,
      error: `Repair worktree is on ${branch || "(detached)"}, expected ${repairBranch}`,
    };
  }
  const topLevel = runGit(workdir, ["rev-parse", "--show-toplevel"]);
  if (topLevel.status !== 0 || !topLevel.stdout.trim()) {
    return {
      valid: false,
      repoRoot,
      repairBranch: branch,
      error: `Unable to resolve repair worktree root for ${workdir}`,
    };
  }
  try {
    if (realpathSync(workdir) !== realpathSync(topLevel.stdout.trim())) {
      return {
        valid: false,
        repoRoot,
        repairBranch: branch,
        error: `Repair worktree path ${workdir} is not its repository root`,
      };
    }
  } catch (error) {
    return {
      valid: false,
      repoRoot,
      repairBranch: branch,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const dirty = splitLines(runGit(workdir, ["status", "--porcelain"]).stdout);
  if (dirty.length > 0) {
    return {
      valid: false,
      repoRoot,
      repairBranch: branch,
      error: `Repair worktree has uncommitted changes: ${dirty.join(", ")}`,
    };
  }

  let defaultBranch: string;
  try {
    defaultBranch = detectDefaultBranch(repoRoot, deps).branch;
  } catch (error) {
    return {
      valid: false,
      repoRoot,
      repairBranch: branch,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const fetch = runGit(repoRoot, ["fetch", "origin", defaultBranch]);
  if (fetch.status !== 0) {
    return {
      valid: false,
      repoRoot,
      repairBranch: branch,
      defaultBranch,
      error: `Unable to refresh origin/${defaultBranch}: ${fetch.stderr || fetch.stdout}`,
    };
  }

  const localDefault = runGit(repoRoot, [
    "rev-parse",
    `refs/heads/${defaultBranch}`,
  ]);
  const originDefault = runGit(repoRoot, [
    "rev-parse",
    `refs/remotes/origin/${defaultBranch}`,
  ]);
  const repairHead = runGit(workdir, ["rev-parse", "HEAD"]);
  const repairTree = runGit(workdir, ["rev-parse", "HEAD^{tree}"]);
  const defaultTree = runGit(repoRoot, [
    "rev-parse",
    `refs/heads/${defaultBranch}^{tree}`,
  ]);
  const values = [
    localDefault.stdout.trim(),
    originDefault.stdout.trim(),
    repairHead.stdout.trim(),
    repairTree.stdout.trim(),
    defaultTree.stdout.trim(),
  ];
  if (
    [localDefault, originDefault, repairHead, repairTree, defaultTree].some(
      (result) => result.status !== 0,
    ) ||
    values.some((value) => value.length === 0)
  ) {
    return {
      valid: false,
      repoRoot,
      repairBranch: branch,
      defaultBranch,
      error: `Unable to resolve repair/default branch identity before archive writes`,
    };
  }
  const [localSha, originSha, repairSha, repairTreeSha, defaultTreeSha] =
    values;
  if (localSha !== originSha) {
    return {
      valid: false,
      repoRoot,
      repairBranch: branch,
      repairHeadSha: repairSha,
      defaultBranch,
      defaultBranchSha: localSha,
      defaultTreeSha,
      error: `Local ${defaultBranch} ${localSha} differs from fetched origin/${defaultBranch} ${originSha}`,
    };
  }
  if (repairSha !== localSha || repairTreeSha !== defaultTreeSha) {
    return {
      valid: false,
      repoRoot,
      repairBranch: branch,
      repairHeadSha: repairSha,
      defaultBranch,
      defaultBranchSha: localSha,
      defaultTreeSha,
      error: `Repair branch must start exactly at current ${defaultBranch} HEAD/tree`,
    };
  }
  return {
    valid: true,
    repoRoot,
    repairBranch: branch,
    repairHeadSha: repairSha,
    defaultBranch,
    defaultBranchSha: localSha,
    defaultTreeSha,
  };
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
  /** Source branch; normal archives use change/{changeId}. */
  sourceBranch?: string;
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
  const sourceBranch = ctx.sourceBranch ?? `change/${ctx.changeId}`;
  const finalizationDeps = ctx.sourceBranch
    ? { ...deps, sourceBranch: ctx.sourceBranch }
    : deps;
  // Validate worktree before any mutation
  const worktreeValidation = validateChangeWorktree(
    ctx.workdir,
    ctx.changeId,
    finalizationDeps,
  );
  if (!worktreeValidation.valid) {
    return {
      status: "blocked",
      repoRoot: worktreeValidation.repoRoot,
      defaultBranch: "",
      pushStatus: "not_attempted",
      blocked: {
        reason: "INVALID_WORKTREE",
        remediation: `${worktreeValidation.error}. rq-releaseFinalization01 requires a validated archive worktree on branch ${sourceBranch}.`,
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

  const { branch: defaultBranch } = detectDefaultBranch(
    repoRoot,
    finalizationDeps,
  );

  // Per-invocation accumulator: caches idempotent git queries and tracks
  // fetch dedup. Mutations call invalidate(state, kind) to drop stale entries.
  const state = createState(repoRoot, defaultBranch, finalizationDeps);

  let preArchiveTipSha: string | undefined;
  try {
    preArchiveTipSha = runGitOrThrow(
      repoRoot,
      ["rev-parse", sourceBranch],
      finalizationDeps,
    );
  } catch {
    preArchiveTipSha = undefined;
  }

  // Commit in-repo archive artifacts before merge
  const commitResult = commitArchiveArtifacts(
    ctx.workdir,
    ctx.changeId,
    finalizationDeps,
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

  // Capture the change-tip SHA after committing archive artifacts but before
  // any finalization path can merge, delete, or move the branch. Tree-SHA
  // re-proof must compare the exact branch content that Phase 9 releases.
  let changeTipSha: string | undefined;
  try {
    changeTipSha = runGitOrThrow(
      repoRoot,
      ["rev-parse", sourceBranch],
      finalizationDeps,
    );
  } catch {
    changeTipSha = undefined;
  }

  if (ctx.archiveMode === "pr") {
    const route = coercePrWorkflowRoute(getRoute(state));
    if (route.route === "no_remote" || route.route === "blocked") {
      return {
        status: "blocked",
        repoRoot,
        defaultBranch,
        route: route.route,
        prBranch: sourceBranch,
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
          changeTipSha,
          preArchiveTipSha,
          sourceBranch,
        },
        finalizationDeps,
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
        preArchiveTipSha,
        sourceBranch,
      },
      finalizationDeps,
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

  // A direct route may be resumed after the change branch was already
  // squash-merged through GitHub. Prove that exact merge before creating the
  // ephemeral merge worktree; otherwise the old branch can conflict with
  // later trunk commits and the finalizer would attempt a duplicate merge.
  if (route.route === "direct") {
    const mergedPrProof = verifyDirectMergedPrProof(
      {
        repoRoot,
        repo: route.repo,
        defaultBranch,
        changeId: ctx.changeId,
        branchName: sourceBranch,
        changeTipSha,
        preArchiveTipSha,
      },
      finalizationDeps,
    );
    if (mergedPrProof.kind === "invalid") {
      return {
        status: "blocked",
        repoRoot,
        defaultBranch,
        route: route.route,
        pushStatus: "not_attempted",
        prBranch: sourceBranch,
        blocked: {
          reason: mergedPrProof.reason,
          remediation:
            "The merged PR proof is ambiguous or unreachable. Verify the exact PR head/base, local change-tip SHA, and origin/default reachability before rerunning archive finalization.",
          details: mergedPrProof.details,
        },
      };
    }
    if (mergedPrProof.kind === "valid") {
      return {
        status: "shipped",
        repoRoot,
        defaultBranch,
        route: route.route,
        releasedCommitSha: mergedPrProof.defaultBranchSha,
        mergeCommitSha: mergedPrProof.mergeCommitOid,
        changeTipSha,
        pushStatus: "pushed",
        prBranch: sourceBranch,
        repo: route.repo,
        prNumber: mergedPrProof.prNumber,
        prUrl: mergedPrProof.prUrl,
        prHeadSha: mergedPrProof.prHeadSha,
        defaultBranchSha: mergedPrProof.defaultBranchSha,
        preArchiveTipSha,
        autoMergeArmed: false,
      };
    }
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
      finalizationDeps,
      async (ephemeral) => {
        // Merge the change branch into the detached default-branch HEAD.
        const merge = mergeChangeBranch(
          ephemeral,
          defaultBranch,
          ctx.changeId,
          finalizationDeps,
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
          runGit: finalizationDeps.runGit,
        });
        invalidate(state, "push-to-origin");

        if (push.status === "pushed") {
          const remoteDefault = verifyDefaultBranchPushed(
            ephemeral,
            defaultBranch,
            finalizationDeps,
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
            preArchiveTipSha,
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
                changeTipSha,
                preArchiveTipSha,
                sourceBranch,
              },
              finalizationDeps,
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
                changeTipSha,
                preArchiveTipSha,
                sourceBranch,
              },
              finalizationDeps,
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
              prBranch: sourceBranch,
              blocked: {
                reason: route.reason ?? "PR_MANUAL_REQUIRED",
                remediation: `Default branch push failed and ADV could not arm auto-merge. Manually open or merge PR for ${sourceBranch}, then rerun archive finalization (rq-releaseFinalization01).`,
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
