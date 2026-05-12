import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";

export interface GitSessionContext {
  isWorktree: boolean;
  isMainCheckout: boolean;
  mainCheckoutPath?: string;
}

export function resolveGitSessionContext(
  directory: string,
  worktree: string | undefined,
): GitSessionContext {
  const cwd = worktree || directory;
  try {
    const topLevel = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--show-toplevel"],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    const commonDir = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    const mainCheckoutPath = dirname(commonDir);
    const isMainCheckout = resolve(topLevel) === resolve(mainCheckoutPath);
    return {
      isWorktree: !isMainCheckout,
      isMainCheckout,
      mainCheckoutPath,
    };
  } catch {
    const isWorktree = !!worktree && worktree !== directory;
    return { isWorktree, isMainCheckout: !isWorktree };
  }
}
