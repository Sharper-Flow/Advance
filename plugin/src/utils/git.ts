import { execFile } from "node:child_process";

/**
 * Execute a git command and return stdout.
 * Shared git command utility with non-interactive execution defaults.
 */
export function execGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.GIT_ASKPASS;
    execFile(
      "git",
      args,
      {
        cwd,
        timeout: 5000,
        env: { ...env, GIT_TERMINAL_PROMPT: "0" },
      },
      (error, stdout) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

/**
 * Detect the default branch for a repository.
 *
 * Fallback chain (in priority order):
 * 1. `git symbolic-ref refs/remotes/origin/HEAD` — canonical when origin is set
 * 2. Local branch detection — prefer conventional names (main, master, trunk,
 *    develop), else return the sole branch if there's exactly one. Only
 *    considers refs that actually exist (a branch ref requires at least one
 *    commit).
 * 3. `git config init.defaultBranch` — legitimate signal ONLY for uninitialized
 *    repos (HEAD points to a future branch with no ref yet). NEVER reached for
 *    repos with any committed branches, because strategy 2 covers them.
 * 4. Hardcoded "main"
 *
 * rq-defaultBranchLocalDetection01: The `init.defaultBranch` check was
 * previously strategy 2, which caused cross-repo leakage when a user's global
 * config (e.g. `init.defaultBranch=trunk`) was unrelated to the actual default
 * branch of an existing repo lacking `origin/HEAD`. The leak surfaced as
 * `git branch --merged trunk` failing with "fatal: malformed object name
 * trunk" in `adv_worktree_delete` (#113). The fix: local-branch detection
 * comes first; `init.defaultBranch` is only consulted when no branches exist.
 */
export async function getDefaultBranch(cwd: string): Promise<string> {
  // Strategy 1: remote HEAD (canonical)
  try {
    const raw = await execGit(
      ["symbolic-ref", "refs/remotes/origin/HEAD"],
      cwd,
    );
    const match = raw.trim().match(/^refs\/remotes\/origin\/(.+)$/);
    if (match) return match[1];
  } catch {
    // No remote HEAD — continue to fallback
  }

  // Strategy 2: local-branch detection. Only considers branches that have a
  // ref (= at least one commit). Conventional names take precedence over
  // alphabetical order to match operator intuition; if exactly one branch
  // exists and it isn't a conventional name, return it (e.g. a repo using
  // `production` as its sole branch).
  try {
    const raw = await execGit(["branch", "--format=%(refname:short)"], cwd);
    const branches = raw
      .trim()
      .split("\n")
      .map((b) => b.trim())
      .filter((b) => b.length > 0);

    if (branches.length > 0) {
      for (const candidate of ["main", "master", "trunk", "develop"]) {
        if (branches.includes(candidate)) return candidate;
      }
      if (branches.length === 1) return branches[0];
      // Multiple non-conventional branches — give up on this strategy and
      // continue to fallback. Caller will get init.defaultBranch or "main".
    }
  } catch {
    // `git branch` failed (not a repo / corrupt) — continue to fallback
  }

  // Strategy 3: init.defaultBranch — legitimate signal for uninitialized
  // repos (HEAD points to a branch that has no ref yet because no commits
  // exist). Reached only when strategies 1 and 2 produce nothing.
  try {
    const config = await execGit(["config", "init.defaultBranch"], cwd);
    const trimmed = config.trim();
    if (trimmed) return trimmed;
  } catch {
    // No config — continue to fallback
  }

  // Strategy 4: hardcoded default
  return "main";
}
