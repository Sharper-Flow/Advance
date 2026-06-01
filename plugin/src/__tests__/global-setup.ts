import { getDataHome } from "../utils/project-id";
import { cleanupSyntheticAdvDirs } from "./synthetic-cleanup";

export default async function setup() {
  const originalAdvWorktreeHome = process.env.ADV_WORKTREE_HOME;
  delete process.env.ADV_WORKTREE_HOME;

  const dataHome = getDataHome();
  const runId = `vitest-${process.pid}-${Date.now()}`;
  process.env.ADV_TEST_RUN_ID = runId;

  return async () => {
    await cleanupSyntheticAdvDirs(dataHome, { runId });
    if (originalAdvWorktreeHome === undefined) {
      delete process.env.ADV_WORKTREE_HOME;
    } else {
      process.env.ADV_WORKTREE_HOME = originalAdvWorktreeHome;
    }
  };
}
