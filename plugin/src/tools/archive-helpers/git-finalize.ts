import { spawnSync } from "child_process";
import { dirname } from "path";

export type ArchiveMode = "direct" | "pr";

export interface GitFinalizeContext {
  changeId: string;
  workdir: string;
  archiveMode: ArchiveMode;
  autoPush: boolean;
  skipPush?: boolean;
}

export interface GitFinalizeOutcome {
  status: "shipped" | "merged_locally" | "blocked";
  mainCheckout: string;
  defaultBranch: string;
  mergeCommitSha?: string;
  pushStatus: "pushed" | "skipped" | "failed" | "not_attempted";
  pushFailureReason?: string;
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

function defaultRunGit(cwd: string, args: string[]): RunGitResult {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
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
  for (const branch of ["main", "trunk"]) {
    const result = runGit(mainCheckout, [
      "rev-parse",
      "--verify",
      `refs/heads/${branch}`,
    ]);
    if (result.status === 0) return { branch, source: `local-${branch}` };
  }

  const originHead = runGit(mainCheckout, [
    "symbolic-ref",
    "--short",
    "refs/remotes/origin/HEAD",
  ]);
  if (
    originHead.status === 0 &&
    originHead.stdout.trim().startsWith("origin/")
  ) {
    return {
      branch: originHead.stdout.trim().replace(/^origin\//, ""),
      source: "origin-head",
    };
  }

  const configured = runGit(mainCheckout, [
    "config",
    "--get",
    "init.defaultBranch",
  ]);
  if (configured.status === 0 && configured.stdout.trim()) {
    return { branch: configured.stdout.trim(), source: "init-defaultBranch" };
  }

  throw new Error(
    "Unable to resolve default branch (tried main, trunk, origin/HEAD, init.defaultBranch)",
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

export async function finalizeRelease(
  ctx: GitFinalizeContext,
  deps: GitFinalizeDeps = {},
): Promise<GitFinalizeOutcome> {
  const mainCheckout = resolveMainCheckout(ctx.workdir, deps);
  const { branch: defaultBranch } = detectDefaultBranch(mainCheckout, deps);

  if (ctx.archiveMode === "pr") {
    return {
      status: "merged_locally",
      mainCheckout,
      defaultBranch,
      pushStatus: "skipped",
      pushFailureReason: "archive_mode=pr skips local default-branch merge",
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
