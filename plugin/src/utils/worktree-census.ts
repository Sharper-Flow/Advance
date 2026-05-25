/**
 * Worktree Census
 *
 * Enumerate git worktrees and detect stale ones.
 * Uses `git worktree list --porcelain` + stat mtime.
 * No `du` calls — stale detection via mtime only.
 */

import { statSync } from "node:fs";

import { execFileGitCb } from "./git-binary";

export interface WorktreeCensus {
  total: number;
  worktrees: Array<{ path: string; branch: string; mtime: Date }>;
  stale: Array<{ path: string; branch: string; lastActivity: string }>;
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
): Promise<WorktreeCensus | null> {
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      execFileGitCb(
        ["worktree", "list", "--porcelain"],
        {
          cwd: repoRoot,
          timeout: 5000,
          maxBuffer: MAX_WORKTREE_LIST_BUFFER,
          env: { ...process.env, ...GIT_EXTRA_ENV },
        },
        (err, out) => {
          if (err) reject(err);
          else resolve(out ?? "");
        },
      );
    });

    // Parse porcelain: blocks separated by blank lines
    // Each block: worktree <path>, HEAD <sha>, [branch refs/heads/<name>]
    const blocks = stdout.split("\n\n").filter((b) => b.trim().length > 0);
    const worktrees: WorktreeCensus["worktrees"] = [];
    const stale: WorktreeCensus["stale"] = [];

    for (const block of blocks) {
      const lines = block.split("\n");
      const wtLine = lines.find((l) => l.startsWith("worktree "));
      const brLine = lines.find((l) => l.startsWith("branch "));
      if (!wtLine) continue;

      const wtPath = wtLine.slice("worktree ".length);
      const branch = brLine
        ? brLine.slice("branch ".length).replace("refs/heads/", "")
        : "(detached)";

      let mtime: Date;
      try {
        mtime = statSync(wtPath).mtime;
      } catch {
        // Worktree path doesn't exist (pruned) — skip
        continue;
      }

      worktrees.push({ path: wtPath, branch, mtime });

      const ageMs = Date.now() - mtime.getTime();
      if (ageMs > SEVEN_DAYS_MS) {
        const days = Math.floor(ageMs / 86400_000);
        stale.push({
          path: wtPath,
          branch,
          lastActivity: `${days}d ago`,
        });
      }
    }

    return { total: worktrees.length, worktrees, stale };
  } catch {
    return null;
  }
}
