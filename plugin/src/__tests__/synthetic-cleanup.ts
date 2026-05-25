import { readFile, readdir, rm } from "fs/promises";
import { basename, dirname, join, resolve } from "path";
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

function syntheticAdvRoots(dataHome: string): string[] {
  return [
    join(dataHome, "opencode", "plugins", "advance"),
    join(dataHome, "opencode", "worktree"),
  ];
}

function isSyntheticAdvDir(path: string, roots: string[]): boolean {
  const resolvedPath = resolve(path);
  return roots.some(
    (root) =>
      dirname(resolvedPath) === resolve(root) &&
      basename(resolvedPath).startsWith(SYNTHETIC_TEST_PROJECT_ID_PREFIX),
  );
}

export async function listSyntheticAdvDirs(
  dataHome: string,
): Promise<Set<string>> {
  const dirs = await Promise.all(
    syntheticAdvRoots(dataHome).map(listSyntheticDirsIn),
  );
  return new Set(dirs.flat());
}

async function markerMatches(path: string, runId?: string): Promise<boolean> {
  if (!runId) return true;
  try {
    const marker = await readFile(join(path, ADV_TEST_OWNER_MARKER), "utf-8");
    return marker.trim() === runId;
  } catch {
    // Missing marker means legacy/orphan synthetic test residue. Keep marker
    // mismatches, but allow old unmarked synthetic dirs to be reaped.
    return true;
  }
}

export async function cleanupSyntheticAdvDirs(
  dataHome: string,
  options: { runId?: string } = {},
): Promise<string[]> {
  const current = await listSyntheticAdvDirs(dataHome);
  const roots = syntheticAdvRoots(dataHome);
  const candidates = [...current].sort((a, b) => a.localeCompare(b));
  const removed: string[] = [];

  for (const path of candidates) {
    if (!isSyntheticAdvDir(path, roots)) continue;
    if (!(await markerMatches(path, options.runId))) continue;
    await rm(path, { recursive: true, force: true });
    removed.push(path);
  }

  return removed;
}
