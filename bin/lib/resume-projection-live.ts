/**
 * Disk resume projection loader for bin/adv.
 *
 * Reads active change and Epic projections directly, then adapts them through
 * buildBinResumeProjection.
 */

import { buildBinResumeProjection } from "./resume-projection";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAdvStateSubdir } from "./adv-state-paths";
import type { ResumeProjection } from "../../plugin/src/cli/projection-boundary";

interface ChangeRecord {
  id: string;
  title: string;
  status: string;
  lifecycleState?: string;
  same_project_dependencies?: Array<{
    kind: "change" | "epic";
    change_id?: string;
    epic_id?: string;
    entry_id?: string;
  }>;
  tasks?: Array<{ status: string }>;
  epic_membership?: { epic_id: string; entry_id: string; order: number };
}

interface EpicRecord {
  id: string;
  title: string;
  entries: ReadonlyArray<{
    kind: string;
    entry_id: string;
    order: number;
    title?: string;
    change_id?: string;
    success_hint?: string;
    blocked_by?: Array<{
      kind: "change" | "epic";
      change_id?: string;
      epic_id?: string;
      entry_id?: string;
    }>;
  }>;
}

export interface LiveResumeProjectionResult {
  live: boolean;
  resume_projection?: ResumeProjection;
  error?: string;
  remediation?: string;
  /** Source timestamp of the underlying data, when known. */
  freshness?: string;
  /**
   * Explicit truncation signal. Set when a capped source dropped records, so
   * the omission is reported rather than silently absorbed (DONT5).
   */
  truncated?: boolean;
  truncated_count?: number;
}

export async function loadLiveResumeProjection(
  projectId: string,
  epicIds?: string[],
): Promise<LiveResumeProjectionResult> {
  return loadResumeProjectionFromDisk(projectId, epicIds);
}

/**
 * Disk-projection resume reader. Reads every change projection and every
 * active Epic projection, then builds the resume projection.
 */
function loadResumeProjectionFromDisk(
  projectId: string,
  epicIds?: string[],
): LiveResumeProjectionResult {
  try {
    const changeRecords: ChangeRecord[] = [];
    const changesDir = resolveAdvStateSubdir(projectId, "changes");
    let changeFiles: string[] = [];
    try {
      changeFiles = readdirSync(changesDir).filter((f) => f.endsWith(".json"));
    } catch {
      changeFiles = [];
    }
    for (const file of changeFiles) {
      try {
        const raw = JSON.parse(readFileSync(join(changesDir, file), "utf8"));
        changeRecords.push(normalizeChangeRecord(raw.state ?? raw));
      } catch {
        // Skip unreadable change projections; projection is advisory.
      }
    }

    const epicRecords: EpicRecord[] = [];
    const epicsDir = resolveAdvStateSubdir(projectId, "active-epics");
    let epicDirs: string[] = [];
    try {
      epicDirs = readdirSync(epicsDir);
    } catch {
      epicDirs = [];
    }
    const wanted = epicIds?.length ? new Set(epicIds) : null;
    for (const epicId of epicDirs) {
      if (wanted && !wanted.has(epicId)) continue;
      try {
        const raw = JSON.parse(
          readFileSync(join(epicsDir, epicId, "active-projection.json"), "utf8"),
        );
        const epic = normalizeEpicRecord(raw.state ?? raw);
        if (epic) epicRecords.push(epic);
      } catch {
        // Skip unreadable epic projections; projection is advisory.
      }
    }

    return {
      live: true,
      resume_projection: buildBinResumeProjection(
        changeRecords,
        epicRecords,
        projectId,
        epicIds,
      ),
    };
  } catch (err) {
    return {
      live: false,
      error: err instanceof Error ? err.message : String(err),
      remediation:
        "ADV resume projection unavailable. Could not read change/epic projections from the project state directory.",
    };
  }
}

function normalizeChangeRecord(raw: unknown): ChangeRecord {
  const anyRaw = raw as Record<string, unknown>;
  return {
    id: String(anyRaw.id ?? anyRaw.changeId ?? ""),
    title: String(anyRaw.title ?? anyRaw.id ?? anyRaw.changeId ?? "(untitled)"),
    status: String(anyRaw.status ?? "draft"),
    lifecycleState: String(anyRaw.lifecycleState ?? "open"),
    same_project_dependencies: Array.isArray(anyRaw.same_project_dependencies)
      ? anyRaw.same_project_dependencies
      : [],
    tasks: Array.isArray(anyRaw.tasks) ? anyRaw.tasks : [],
    epic_membership: anyRaw.epic_membership as
      | { epic_id: string; entry_id: string; order: number }
      | undefined,
  };
}

function normalizeEpicRecord(raw: unknown): EpicRecord | null {
  const anyRaw = raw as Record<string, unknown>;
  const epic = (anyRaw.epic as Record<string, unknown> | undefined) ?? anyRaw;
  if (typeof epic.id !== "string" && typeof anyRaw.id !== "string") return null;

  const id = String(epic.id ?? anyRaw.id ?? "");
  const title = String(epic.title ?? id);
  const entries = Array.isArray(epic.entries) ? epic.entries : [];

  return {
    id,
    title,
    entries: entries.map((entry: Record<string, unknown>) => {
      const kind = String(entry.kind ?? "shell");
      return {
        kind,
        entry_id: String(entry.entry_id ?? ""),
        order: Number(entry.order ?? 0),
        title: entry.title ? String(entry.title) : undefined,
        change_id: entry.change_id ? String(entry.change_id) : undefined,
        success_hint: entry.success_hint ? String(entry.success_hint) : undefined,
        blocked_by: Array.isArray(entry.blocked_by) ? entry.blocked_by : undefined,
      };
    }),
  };
}
