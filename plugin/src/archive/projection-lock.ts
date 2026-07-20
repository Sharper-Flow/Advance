import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { acquireFileLock } from "../utils/fs";
import { spawnSyncGit } from "../utils/git-binary";

export async function withArchiveProjectionLock<T>(
  worktree: string,
  operation: () => Promise<T>,
): Promise<T> {
  const result = spawnSyncGit(["rev-parse", "--git-common-dir"], {
    cwd: worktree,
    encoding: "utf8",
  });
  // Production archive writes are validated Git worktrees and therefore share
  // the Git-common lock. Pure archive-library callers (notably isolated unit
  // fixtures) still receive a worktree-local cooperative lock.
  const commonDir =
    result.status === 0
      ? resolve(worktree, String(result.stdout).trim())
      : join(worktree, ".adv");
  await mkdir(commonDir, { recursive: true });
  const release = await acquireFileLock(
    join(commonDir, "adv-archive-projection"),
    10_000,
  );
  try {
    return await operation();
  } finally {
    await release();
  }
}
