import { readFile, readdir, rm } from "fs/promises";
import { join } from "path";
import { SYNTHETIC_TEST_PROJECT_ID_PREFIX } from "../utils/project-id";

export const ADV_TEST_OWNER_MARKER = ".adv-test-owner";

async function listSyntheticDirsIn(parent: string): Promise<string[]> {
  try {
    const entries = await readdir(parent, { withFileTypes: true });
    return entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name.startsWith(SYNTHETIC_TEST_PROJECT_ID_PREFIX),
      )
      .map((entry) => join(parent, entry.name));
  } catch {
    return [];
  }
}

export async function listSyntheticAdvDirs(
  dataHome: string,
): Promise<Set<string>> {
  const [projectDirs, worktreeDirs] = await Promise.all([
    listSyntheticDirsIn(join(dataHome, "opencode", "plugins", "advance")),
    listSyntheticDirsIn(join(dataHome, "opencode", "worktree")),
  ]);
  return new Set([...projectDirs, ...worktreeDirs]);
}

async function markerMatches(path: string, runId?: string): Promise<boolean> {
  if (!runId) return true;
  try {
    const marker = await readFile(join(path, ADV_TEST_OWNER_MARKER), "utf-8");
    return marker.trim() === runId;
  } catch {
    return true;
  }
}

export async function cleanupNewSyntheticAdvDirs(
  dataHome: string,
  baseline: Set<string>,
  options: { runId?: string } = {},
): Promise<string[]> {
  const current = await listSyntheticAdvDirs(dataHome);
  const candidates = [...current]
    .filter((path) => !baseline.has(path))
    .sort((a, b) => a.localeCompare(b));
  const removed: string[] = [];

  for (const path of candidates) {
    if (!(await markerMatches(path, options.runId))) continue;
    await rm(path, { recursive: true, force: true });
    removed.push(path);
  }

  return removed;
}
