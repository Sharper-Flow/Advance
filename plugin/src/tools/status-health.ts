/**
 * Disk-backed health probes used by `adv_status`.
 *
 * Health here describes files and projections that this process can actually
 * inspect. It does not report transport, worker, queue, or server state.
 */

import { basename } from "path";
import type { Store } from "../storage/store";
import { listChangeDirs, loadChange } from "../storage/json";
import { archiveBundleExists } from "../archive/archive";
import { getWorktreeCensus } from "../utils/worktree-census";
import { createProbeCache, type ProbeCacheFreshness } from "./probe-cache";
import { scanSnapshotHealth } from "./snapshot-scan";

export const HEALTH_SNAPSHOT_TTL_MS = 30_000;
export const MISSING_PROJECT_ID_CACHE_KEY = "__current_project__";
export const STATUS_PROBE_TTL_MS = 10_000;
export const SNAPSHOT_HEALTH_TTL_MS = 60_000;
export const SNAPSHOT_HEALTH_TIMEOUT_MS = 10_000;

export interface StatusProbeFetchOptions {
  forceRefresh?: boolean;
}

export interface HealthSnapshot {
  leaked_source_dirs: number;
  leaked_archived_source_dirs: number;
  archive_dirs: number;
  closed_to_active_ratio: number;
}

export type WorktreeCensusSnapshot = Awaited<
  ReturnType<typeof getWorktreeCensus>
>;
export type SnapshotHealthSnapshot = Awaited<
  ReturnType<typeof scanSnapshotHealth>
>;

export const healthSnapshotCache = new Map<
  string,
  { snapshot: HealthSnapshot; computedAt: number }
>();

export const statusWorktreeCensusProbeCache = createProbeCache<
  WorktreeCensusSnapshot,
  string
>({
  name: "status.worktree_census",
  ttlMs: STATUS_PROBE_TTL_MS,
  fetch: async (root, { signal }) => getWorktreeCensus(root, { signal }),
});

export const snapshotHealthProbeCache = createProbeCache<
  SnapshotHealthSnapshot,
  string
>({
  name: "status.snapshot_health",
  ttlMs: SNAPSHOT_HEALTH_TTL_MS,
  fetch: async (key) =>
    scanSnapshotHealth({
      scope: "project",
      projectId: key === MISSING_PROJECT_ID_CACHE_KEY ? "unknown" : key,
    }),
});

/** Exported for test isolation only. */
export const _statusProbeCaches = {
  clear(): void {
    statusWorktreeCensusProbeCache.clear();
    snapshotHealthProbeCache.clear();
  },
};

export async function fetchStatusSnapshotHealth(
  projectId: string | undefined,
  options: StatusProbeFetchOptions = {},
): Promise<{
  value: SnapshotHealthSnapshot;
  freshness: ProbeCacheFreshness;
}> {
  return snapshotHealthProbeCache.fetch(
    projectId ?? MISSING_PROJECT_ID_CACHE_KEY,
    options,
  );
}

export async function fetchStatusWorktreeCensus(
  root: string,
  options: StatusProbeFetchOptions = {},
): Promise<{
  value: WorktreeCensusSnapshot;
  freshness: ProbeCacheFreshness;
}> {
  return statusWorktreeCensusProbeCache.fetch(root, options);
}

/** Clears cache state owned by this module; composed by the test reset owner. */
export function resetStatusHealthModuleForTest(): void {
  healthSnapshotCache.clear();
  _statusProbeCaches.clear();
}

/** Deliberate internal-but-test-accessible seam consumed by tools/status.test.ts; not a duplicate. */
export const _healthSnapshotCache = healthSnapshotCache;

export async function computeHealthSnapshot(
  store: Store,
): Promise<HealthSnapshot> {
  const cacheKey = store.paths.external
    ? basename(store.paths.external)
    : store.paths.root;

  const cached = healthSnapshotCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.computedAt < HEALTH_SNAPSHOT_TTL_MS) {
    return cached.snapshot;
  }

  const [changeIds, archiveIds] = await Promise.all([
    listChangeDirs(store.paths.changes),
    listChangeDirs(store.paths.archive),
  ]);
  let leakedSourceDirs = 0;
  let leakedArchivedSourceDirs = 0;
  let closedCount = 0;
  let activeCount = 0;

  await Promise.all(
    changeIds.map(async (id) => {
      const result = await loadChange(store.paths.changes, id);
      if (!result.success || !result.data) return;
      if (result.data.status === "closed") {
        closedCount++;
        if (!(await archiveBundleExists(store.paths.archive, id))) {
          leakedSourceDirs++;
        }
      } else if (result.data.status === "archived") {
        leakedArchivedSourceDirs++;
      } else if (result.data.status === "draft") {
        activeCount++;
      }
    }),
  );

  const snapshot: HealthSnapshot = {
    leaked_source_dirs: leakedSourceDirs,
    leaked_archived_source_dirs: leakedArchivedSourceDirs,
    archive_dirs: archiveIds.length,
    closed_to_active_ratio:
      Math.round((closedCount / Math.max(activeCount, 1)) * 100) / 100,
  };
  healthSnapshotCache.set(cacheKey, { snapshot, computedAt: now });
  return snapshot;
}
