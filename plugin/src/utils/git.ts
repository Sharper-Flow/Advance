import { execFile } from "node:child_process";

/**
 * Execute a git command and return stdout.
 * Shared utility — extracted from project-id.ts for reuse.
 */
export function execGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, timeout: 5000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
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
 * Fallback chain:
 * 1. `git symbolic-ref refs/remotes/origin/HEAD` — extract branch from origin HEAD
 * 2. `git config init.defaultBranch` — user config
 * 3. Hardcoded "main"
 */
export async function getDefaultBranch(cwd: string): Promise<string> {
  // Strategy 1: remote HEAD
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

  // Strategy 2: user config
  try {
    const config = await execGit(["config", "init.defaultBranch"], cwd);
    const trimmed = config.trim();
    if (trimmed) return trimmed;
  } catch {
    // No config — continue to fallback
  }

  // Strategy 3: hardcoded default
  return "main";
}
