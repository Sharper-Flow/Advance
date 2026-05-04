import { execFile } from "child_process";
import { promisify } from "util";

import type { SessionRecord, WorktreeRecord } from "../../temporal/contracts";
import { inferChangeIdFromBranch } from "./state";

const execFileAsync = promisify(execFile);

export interface GitBranchFact {
  branch: string;
  headSha: string;
  merged: boolean;
}

export interface GitWorktreeFact {
  branch: string;
  path: string;
  headSha: string;
  dirty: boolean;
}

export interface GitWorkspaceFacts {
  branches: GitBranchFact[];
  worktrees: GitWorktreeFact[];
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    timeout: 10_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout.trim();
}

function parseMergedBranches(stdout: string): Set<string> {
  return new Set(
    stdout
      .split("\n")
      .map((line) => line.replace(/^\*?\s*/, "").trim())
      .filter(Boolean),
  );
}

function parseWorktreePorcelain(stdout: string): Array<{
  path: string;
  branch?: string;
  headSha?: string;
}> {
  const out: Array<{ path: string; branch?: string; headSha?: string }> = [];
  let current: { path: string; branch?: string; headSha?: string } | null =
    null;
  for (const line of stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) out.push(current);
      current = { path: line.slice("worktree ".length).trim() };
    } else if (line.startsWith("HEAD ") && current) {
      current.headSha = line.slice("HEAD ".length).trim();
    } else if (line.startsWith("branch refs/heads/") && current) {
      current.branch = line.slice("branch refs/heads/".length).trim();
    } else if (line.trim() === "" && current) {
      out.push(current);
      current = null;
    }
  }
  if (current) out.push(current);
  return out;
}

export async function scanGitWorkspaceFacts(
  repoRoot: string,
  defaultBranch: string,
): Promise<GitWorkspaceFacts> {
  const [branchLines, mergedText, worktreeText] = await Promise.all([
    git(repoRoot, [
      "for-each-ref",
      "--format=%(refname:short) %(objectname)",
      "refs/heads/change",
    ]).catch(() => ""),
    git(repoRoot, ["branch", "--merged", defaultBranch]).catch(() => ""),
    git(repoRoot, ["worktree", "list", "--porcelain"]).catch(() => ""),
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
  for (const wt of parseWorktreePorcelain(worktreeText)) {
    if (!wt.branch?.startsWith("change/")) continue;
    const status = await git(wt.path, ["status", "--porcelain"]).catch(
      () => "",
    );
    worktrees.push({
      branch: wt.branch,
      path: wt.path,
      headSha: wt.headSha ?? "",
      dirty: status.length > 0,
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

  for (const branch of Array.from(branches).sort()) {
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
      changeId: existing?.changeId ?? inferChangeIdFromBranch(branch),
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
