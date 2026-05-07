/**
 * Disk Sweep Helpers
 *
 * Generic helpers for removing per-id directories under a known parent
 * with per-id success/failure tracking. Used by `adv_change_bulk_close`
 * (composes disk sweep with workflow-state close).
 *
 * Idempotent: removing an already-missing directory is reported as
 * success. Defensive against path traversal: change IDs containing
 * path separators or `..` are rejected.
 *
 * See spec `rq-bulkCloseDiskSweep01` in `.adv/specs/advance-meta`.
 */

import { rm } from "fs/promises";
import { join } from "path";

export interface DiskSweepResult {
  /** Change IDs whose directories were removed (or were already absent). */
  removed: string[];
  /** Change IDs whose removal failed, with error message. */
  failed: Array<{ id: string; error: string }>;
}

/**
 * Validate a changeId for safe filesystem use under `parentDir`. Rejects
 * path separators (`/`, `\`), `..` traversal, and absolute paths. The
 * helper is defensive — callers are expected to pass IDs already
 * validated by `generateChangeId`, but this guard keeps the helper safe
 * to call with arbitrary input.
 */
function isUnsafeChangeId(id: string): boolean {
  if (!id || id.length === 0) return true;
  if (id.includes("/") || id.includes("\\")) return true;
  if (id === "." || id === "..") return true;
  if (id.includes("..")) return true;
  // Absolute path defense (Unix-style)
  if (id.startsWith("/")) return true;
  return false;
}

/**
 * Remove `{changesDir}/{changeId}/` for each id in `changeIds`. Returns
 * per-id outcomes. Missing directories are silently treated as removed
 * (idempotent), which lets bulk-close retries converge cleanly.
 *
 * @param changeIds Change IDs to remove
 * @param changesDir Absolute path to the parent directory containing
 *                   per-change subdirectories (e.g. `paths.changes` or
 *                   `paths.archive`).
 */
export async function sweepClosedChangesFromDisk(
  changeIds: string[],
  changesDir: string,
): Promise<DiskSweepResult> {
  const result: DiskSweepResult = { removed: [], failed: [] };

  for (const id of changeIds) {
    if (isUnsafeChangeId(id)) {
      result.failed.push({
        id,
        error: `Invalid change id: contains path separator or traversal character`,
      });
      continue;
    }
    const target = join(changesDir, id);
    try {
      // `force: true` makes ENOENT a no-op (idempotent); `recursive: true`
      // removes the dir contents.
      await rm(target, { recursive: true, force: true });
      result.removed.push(id);
    } catch (err) {
      result.failed.push({
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
