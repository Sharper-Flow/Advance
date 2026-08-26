/**
 * Disk Sweep Helpers
 *
 * Generic helpers for removing per-id directories under a known parent
 * with per-id success/failure tracking. Used by change cleanup workflows.
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
import { loadChange } from "./change-projection-reader";
import { retireClosedChange } from "./closed-bundle";

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
 * Retire `{changesDir}/{changeId}/` for each id in `changeIds`. Returns
 * per-id outcomes. Missing directories are silently treated as removed
 * (idempotent), which lets bulk-close retries converge cleanly.
 *
 * A directory holding a readable record is retired through
 * `retireClosedChange`, which proves the record is readable under
 * `closedPath` before removing the source. An id whose record cannot be made
 * durable is reported in `failed` and left on disk — this sweep never trades
 * a record for a clean directory listing.
 *
 * @param changeIds Change IDs to retire
 * @param changesDir Absolute path to the parent directory containing
 *                   per-change subdirectories (e.g. `paths.changes` or
 *                   `paths.archive`).
 * @param closedPath Absolute path to the closed-bundle root (`paths.closed`).
 */
export async function sweepClosedChangesFromDisk(
  changeIds: string[],
  changesDir: string,
  closedPath: string,
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

    // A directory holding a readable record must go through the durability
    // guard, which copies the record to `closed/<id>/` and proves it reads
    // back before removing anything. A directory with no readable record
    // holds nothing to preserve, so plain removal stays safe there.
    const loaded = await loadChange(changesDir, id);
    if (loaded.success && loaded.data) {
      const retirement = await retireClosedChange({
        change: loaded.data,
        closedPath,
        changesDir,
      });
      if (!retirement.ok) {
        result.failed.push({ id, error: retirement.error });
        continue;
      }
      result.removed.push(id);
      continue;
    }

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
