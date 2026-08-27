import type { SessionRecord, WorktreeRecord } from "../../types";
import { execFileGitAsync } from "../../utils/git-binary";
import { inferChangeIdFromBranch } from "./branch-parser";
import {
  parseGitStatusPorcelainV1Z,
  parseWorktreeListPorcelain,
} from "./porcelain-parser";

export interface GitBranchFact {
  branch: string;
  headSha: string;
  merged: boolean;
}

export interface GitWorktreeFact {
  branch?: string;
  path: string;
  headSha: string;
  dirty: boolean;
  detached: boolean;
  bare: boolean;
  locked: boolean;
  prunable: boolean;
  /** Set by stricter census adapters when Git reports invalid worktree data. */
  corrupt?: boolean;
}

export interface GitWorkspaceFacts {
  branches: GitBranchFact[];
  worktrees: GitWorktreeFact[];
}

/** Default git subprocess bound for non-cleanup callers of the census scan. */
const DEFAULT_CENSUS_GIT_TIMEOUT_MS = 10_000;

async function git(
  cwd: string,
  args: string[],
  timeoutMs: number = DEFAULT_CENSUS_GIT_TIMEOUT_MS,
): Promise<string> {
  const { stdout } = await execFileGitAsync(args, {
    cwd,
    timeout: timeoutMs,
  });
  return stdout.trim();
}

function parseMergedBranches(stdout: string): Set<string> {
  return new Set(
    stdout
      .split("\n")
      // `+` marks a branch checked out in another linked worktree.
      .map((line) => line.replace(/^[*+]\s*/, "").trim())
      .filter(Boolean),
  );
}

/**
 * @param gitTimeoutMs Optional per-subprocess bound. Cleanup callers pass a
 *   value strictly below the worktree tool budget so no single hung git
 *   invocation can consume the whole budget (rq-worktreeBoundedCleanup02).
 *   Omitting it preserves the {@link DEFAULT_CENSUS_GIT_TIMEOUT_MS} default for
 *   non-cleanup callers.
 */
export async function scanGitWorkspaceFacts(
  repoRoot: string,
  defaultBranch: string,
  gitTimeoutMs?: number,
): Promise<GitWorkspaceFacts> {
  // Git-first workspace reconciliation scan: rq-wl-gitFirstReconcile01.
  const [branchLines, mergedText, worktreeText] = await Promise.all([
    git(
      repoRoot,
      ["for-each-ref", "--format=%(refname:short) %(objectname)", "refs/heads"],
      gitTimeoutMs,
    ).catch(() => ""),
    git(repoRoot, ["branch", "--merged", defaultBranch], gitTimeoutMs).catch(
      () => "",
    ),
    git(
      repoRoot,
      ["worktree", "list", "--porcelain", "-z"],
      gitTimeoutMs,
    ).catch(() => ""),
  ]);

  const mergedBranches = parseMergedBranches(mergedText);
  const branches: GitBranchFact[] = branchLines
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [branch, headSha = ""] = line.split(/\s+/, 2);
      return { branch, headSha, merged: mergedBranches.has(branch) };
    });

  const worktrees: GitWorktreeFact[] = [];
  for (const wt of parseWorktreeListPorcelain(worktreeText)) {
    const status = await git(
      wt.path,
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      gitTimeoutMs,
    ).catch(() => undefined);
    const dirty = (() => {
      if (status === undefined) return true;
      try {
        return parseGitStatusPorcelainV1Z(status).length > 0;
      } catch {
        return true;
      }
    })();
    worktrees.push({
      branch: wt.branch,
      path: wt.path,
      headSha: wt.headSha ?? "",
      dirty,
      detached: wt.detached ?? false,
      bare: wt.bare ?? false,
      locked: wt.locked ?? false,
      prunable: wt.prunable ?? false,
    });
  }

  return { branches, worktrees };
}

export interface ReconcileWorktreeRegistryInput {
  existing: WorktreeRecord[];
  git: GitWorkspaceFacts;
  sessions: SessionRecord[];
  defaultBranch: string;
  now: string;
  sourceVersion: number;
}

function byBranch<T extends { branch?: string }>(items: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const item of items) {
    if (item.branch) out.set(item.branch, item);
  }
  return out;
}

function liveSessionBranches(sessions: SessionRecord[]): Set<string> {
  const out = new Set<string>();
  for (const session of sessions) {
    if (session.worktreeBranch) out.add(session.worktreeBranch);
  }
  return out;
}

function cleanupBlockers(input: {
  dirty: boolean;
  merged: boolean;
  live: boolean;
}): string[] {
  const blockers: string[] = [];
  if (input.dirty) blockers.push("dirty");
  if (!input.merged) blockers.push("unmerged");
  if (input.live) blockers.push("live_session");
  return blockers;
}

export function reconcileWorktreeRegistry(
  input: ReconcileWorktreeRegistryInput,
): WorktreeRecord[] {
  // Cleanup eligibility tracking is derived during reconciliation:
  // rq-wl-cleanupEligibility01.
  const existingByBranch = byBranch(input.existing);
  const branchByBranch = byBranch(input.git.branches);
  const worktreeByBranch = byBranch(input.git.worktrees);
  const liveBranches = liveSessionBranches(input.sessions);
  const branches = new Set<string>([
    ...existingByBranch.keys(),
    ...branchByBranch.keys(),
    ...worktreeByBranch.keys(),
  ]);
  const records: WorktreeRecord[] = [];

  for (const branch of Array.from(branches).sort((a, b) =>
    a.localeCompare(b),
  )) {
    const existing = existingByBranch.get(branch);
    const gitBranch = branchByBranch.get(branch);
    const gitWorktree = worktreeByBranch.get(branch);
    const live = liveBranches.has(branch);

    if (!gitBranch && !gitWorktree) {
      if (!existing) continue;
      records.push({
        ...existing,
        status: "stale",
        materialized: false,
        lastSeenAt: input.now,
        source: "git_census",
        sourceVersion: input.sourceVersion,
        cleanupEligible: false,
        cleanupBlockedBy: ["git_missing"],
      });
      continue;
    }

    const materialized = Boolean(gitWorktree?.path);
    const dirty = gitWorktree?.dirty ?? false;
    const merged = gitBranch?.merged ?? false;
    const blockers = cleanupBlockers({ dirty, merged, live });
    const status: WorktreeRecord["status"] = !materialized
      ? "unmaterialized"
      : dirty || live
        ? "active"
        : merged
          ? "merged"
          : "idle";

    records.push({
      branch,
      path: gitWorktree?.path,
      materialized,
      changeId:
        existing?.changeId ?? inferChangeIdFromBranch(branch) ?? undefined,
      status,
      createdAt: existing?.createdAt ?? input.now,
      lastSeenAt: input.now,
      baseRef: existing?.baseRef || input.defaultBranch,
      headSha:
        gitWorktree?.headSha ?? gitBranch?.headSha ?? existing?.headSha ?? "",
      source: "git_census",
      sourceVersion: input.sourceVersion,
      setupReady: existing?.setupReady ?? materialized,
      setupFailureReason: existing?.setupFailureReason,
      dirty,
      merged,
      cleanupEligible: blockers.length === 0,
      cleanupBlockedBy: blockers,
      pendingDelete: existing?.pendingDelete,
    });
  }

  return records;
}
