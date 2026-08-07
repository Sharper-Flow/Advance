import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChangeState } from "../types/change-state";

/**
 * Read the disk projection for one change.
 *
 * Current projections are wrapped in a schemaVersion envelope, while older
 * projections stored the workflow state at the top level. Both shapes remain
 * readable so callers can safely degrade when a projection is missing or
 * malformed.
 */
export function readChangeProjectionState(
  changesDir: string,
  changeId: string,
): ChangeState | null {
  const canonicalPath = join(changesDir, changeId, "change.json");

  // Canonical state is authoritative. A present-but-invalid canonical file is
  // a degraded read, not permission to resurrect a stale flat envelope.
  try {
    const raw = JSON.parse(readFileSync(canonicalPath, "utf8")) as {
      state?: unknown;
    } | null;
    if (!raw || typeof raw !== "object") return null;
    return (raw.state ?? raw) as ChangeState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return null;
  }

  // Flat envelopes are historical read compatibility only and are consulted
  // when the canonical projection does not exist.
  try {
    const raw = JSON.parse(
      readFileSync(join(changesDir, `${changeId}.json`), "utf8"),
    ) as { state?: unknown } | null;
    if (!raw || typeof raw !== "object") return null;
    return (raw.state ?? raw) as ChangeState;
  } catch {
    return null;
  }
}
