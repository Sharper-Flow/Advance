import { dirname, resolve } from "node:path";

import { spawnSyncGit } from "./git-binary";

export interface GitSessionContext {
  isWorktree: boolean;
  isMainCheckout: boolean;
  mainCheckoutPath?: string;
  currentCheckoutPath?: string;
}

function runGitSync(args: string[], cwd: string): string {
  const result = spawnSyncGit(args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args[0]} failed: status=${result.status} signal=${result.signal}`,
    );
  }
  const stdout =
    typeof result.stdout === "string" ? result.stdout : String(result.stdout);
  return stdout.trim();
}

export function resolveGitSessionContext(
  directory: string,
  worktree: string | undefined,
): GitSessionContext {
  const cwd = worktree || directory;
  try {
    const topLevel = runGitSync(
      ["rev-parse", "--path-format=absolute", "--show-toplevel"],
      cwd,
    );
    const commonDir = runGitSync(
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      cwd,
    );
    const mainCheckoutPath = dirname(commonDir);
    const isMainCheckout = resolve(topLevel) === resolve(mainCheckoutPath);
    return {
      isWorktree: !isMainCheckout,
      isMainCheckout,
      mainCheckoutPath,
      currentCheckoutPath: topLevel,
    };
  } catch {
    const isWorktree = !!worktree && worktree !== directory;
    return { isWorktree, isMainCheckout: !isWorktree };
  }
}
