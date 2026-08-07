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
  // Current projections live at <changesDir>/<changeId>/change.json. Retain
  // the former flat-file location solely for historical projections. Reading
  // only the legacy path made a just-verified checkpoint appear unreadable,
  // even though the transaction had committed the canonical projection.
  const projectionPaths = [
    join(changesDir, changeId, "change.json"),
    join(changesDir, `${changeId}.json`),
  ];
  for (const projectionPath of projectionPaths) {
    try {
      const raw = JSON.parse(readFileSync(projectionPath, "utf8")) as {
        state?: unknown;
      } | null;
      if (!raw || typeof raw !== "object") continue;
      return (raw.state ?? raw) as ChangeState;
    } catch {
      // Try the legacy projection location only when the canonical path cannot
      // be read. A caller receives null only after neither durable path yields
      // a usable object.
    }
  }
  return null;
}
