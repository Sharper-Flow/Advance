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
