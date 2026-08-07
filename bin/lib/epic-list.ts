/** Disk-owned Epic list reader for the adv CLI. */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAdvStateSubdir } from "./adv-state-paths";

export interface EpicListEntry {
  id: string;
  startTime: string | null;
}

export interface EpicListPayload {
  source: "disk";
  live: boolean;
  stale: false;
  generated_at: string;
  project_id: string | null;
  epics: EpicListEntry[];
  resume_projection?: unknown;
  /**
   * Always present. Explains whether `resume_projection` can be trusted as a
   * full answer, so an absent projection is never silently ambiguous.
   */
  resume_projection_state?: unknown;
  error?: string;
  remediation?: string;
}

export function buildLiveEpicListPayload(
  epics: EpicListEntry[],
  options: {
    projectId: string;
    now: Date;
  },
): EpicListPayload {
  return {
    source: "disk",
    live: true,
    stale: false,
    generated_at: options.now.toISOString(),
    project_id: options.projectId,
    epics,
  };
}

export function buildLiveEpicListFailure(
  projectId: string | null,
  error: unknown,
  now: Date,
): EpicListPayload {
  const message = error instanceof Error ? error.message : String(error);
  return {
    source: "disk",
    live: false,
    stale: false,
    generated_at: now.toISOString(),
    project_id: projectId,
    epics: [],
    error: message,
    remediation:
      "ADV Epic list unavailable. Verify this command is running inside a git repository and the project state directory is readable.",
  };
}

export async function loadLiveEpics(
  projectId: string,
): Promise<EpicListEntry[]> {
  return loadEpicsFromDisk(projectId);
}

/**
 * Read active Epic projections from disk.
 * Layout: {externalRoot}/active-epics/{epicId}/active-projection.json
 */
function loadEpicsFromDisk(projectId: string): EpicListEntry[] {
  try {
    const root = resolveAdvStateSubdir(projectId, "active-epics");
    const entries: EpicListEntry[] = [];
    for (const epicId of readdirSync(root)) {
      try {
        const raw = JSON.parse(
          readFileSync(join(root, epicId, "active-projection.json"), "utf8"),
        );
        const state = raw.state ?? raw;
        entries.push({
          id: state.id ?? epicId,
          startTime: typeof state.created_at === "string" ? state.created_at : null,
        });
      } catch {
        // skip unreadable epic projections
      }
    }
    return entries;
  } catch {
    return [];
  }
}
