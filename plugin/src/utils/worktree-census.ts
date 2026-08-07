/**
 * Worktree Census
 *
 * Enumerate git worktrees and detect stale ones.
 * Uses `git worktree list --porcelain` + stat mtime.
 * No `du` calls — stale detection via mtime only.
 */

import { statSync } from "node:fs";

import { execFileGitCb } from "./git-binary";
import { parseWorktreeListPorcelain } from "../tools/worktree/porcelain-parser";

export interface WorktreeCensus {
  total: number;
  worktrees: Array<{
    path: string;
    branch: string;
    mtime: Date;
    headSha?: string;
    detached: boolean;
    bare: boolean;
    locked: boolean;
    prunable: boolean;
  }>;
  stale: Array<{
    path: string;
    branch: string;
    lastActivity: string;
    detached: boolean;
    bare: boolean;
    locked: boolean;
    prunable: boolean;
  }>;
}

export interface WorktreeCensusOptions {
  signal?: AbortSignal;
}

const SEVEN_DAYS_MS = 7 * 86400_000;
const MAX_WORKTREE_LIST_BUFFER = 10 * 1024 * 1024;

const GIT_EXTRA_ENV = {
  // git-binary helper handles GIT_TERMINAL_PROMPT/GIT_ASKPASS hygiene
  // already; we override GIT_ASKPASS to /bin/false for parity with the
  // legacy "force fail any credential prompt" behavior used here.
  GIT_ASKPASS: "/bin/false",
  GIT_EDITOR: "true",
};

/**
 * Enumerate git worktrees and detect stale ones (>7d inactive).
 * Returns null on error (not a git repo, git unavailable, etc.).
 */
export async function getWorktreeCensus(
  repoRoot: string,
  options: WorktreeCensusOptions = {},
): Promise<WorktreeCensus | null> {
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      execFileGitCb(
        ["worktree", "list", "--porcelain", "-z"],
        {
          cwd: repoRoot,
          timeout: 5000,
          maxBuffer: MAX_WORKTREE_LIST_BUFFER,
          env: { ...process.env, ...GIT_EXTRA_ENV },
          signal: options.signal,
        },
        (err, out) => {
          if (err) reject(err);
          else resolve(out ?? "");
        },
      );
    });

    const worktrees: WorktreeCensus["worktrees"] = [];
    const stale: WorktreeCensus["stale"] = [];

    for (const parsed of parseWorktreeListPorcelain(stdout)) {
      const wtPath = parsed.path;
      const branch = parsed.branch ?? "(detached)";

      let mtime: Date;
      try {
        mtime = statSync(wtPath).mtime;
      } catch {
        // Worktree path doesn't exist (pruned) — skip
        continue;
      }

      worktrees.push({
        path: wtPath,
        branch,
        mtime,
        headSha: parsed.headSha,
        detached: parsed.detached ?? false,
        bare: parsed.bare ?? false,
        locked: parsed.locked ?? false,
        prunable: parsed.prunable ?? false,
      });

      const ageMs = Date.now() - mtime.getTime();
      if (ageMs > SEVEN_DAYS_MS) {
        const days = Math.floor(ageMs / 86400_000);
        stale.push({
          path: wtPath,
          branch,
          lastActivity: `${days}d ago`,
          detached: parsed.detached ?? false,
          bare: parsed.bare ?? false,
          locked: parsed.locked ?? false,
          prunable: parsed.prunable ?? false,
        });
      }
    }

    return { total: worktrees.length, worktrees, stale };
  } catch {
    return null;
  }
}
