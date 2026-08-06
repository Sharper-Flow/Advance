/**
 * adv CLI — disk status reader.
 *
 * Disk projections are the sole source for active rows and terminal counts.
 */

import {
  buildGateProgress,
  classifyRecency,
  computeLastActivity,
  countTasks,
  firstIncompleteGate,
} from "./changes";
import type {
  ChangeRecord,
  ChangeSummary,
  LiveStatusPayload,
} from "./types";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAdvStateSubdir } from "./adv-state-paths";

export function summarizeLiveChanges(
  changes: ChangeRecord[],
  now: Date,
): ChangeSummary[] {
  const summaries = changes.map((change) => {
    const lastActivityAt = computeLastActivity(change);
    const activityDate = new Date(lastActivityAt);
    const minutesSinceActivity = Math.max(
      0,
      Math.floor((now.getTime() - activityDate.getTime()) / 60000),
    );
    const { done, total } = countTasks(change.tasks);

    return {
      id: change.id,
      title: change.title,
      status: change.status,
      lifecycleState: change.lifecycleState ?? "open",
      recency: classifyRecency(minutesSinceActivity),
      lastActivityAt,
      minutesSinceActivity,
      tasksDone: done,
      tasksTotal: total,
      firstIncompleteGate: firstIncompleteGate(change.gates),
      gateProgressStr: buildGateProgress(change.gates),
      parentChangeId: change.fast_follow_of?.parent_change_id,
      epicId: change.epic_membership?.epic_id,
    };
  });

  summaries.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  return summaries;
}

export function buildLiveStatusPayload(
  changes: ChangeRecord[],
  options: {
    projectId: string;
    archivedCount: number;
    closedCount: number;
    now: Date;
  },
): LiveStatusPayload {
  const summaries = summarizeLiveChanges(changes, options.now);
  return {
    source: "disk",
    live: true,
    stale: false,
    generated_at: options.now.toISOString(),
    project_id: options.projectId,
    counts: {
      active: summaries.length,
      archived: options.archivedCount,
      closed: options.closedCount,
    },
    changes: summaries,
  };
}

export function buildLiveStatusFailure(
  projectId: string,
  error: unknown,
  now: Date,
): LiveStatusPayload {
  const message = error instanceof Error ? error.message : String(error);
  return {
    source: "disk",
    live: false,
    stale: false,
    generated_at: now.toISOString(),
    project_id: projectId,
    counts: { active: 0, archived: 0, closed: 0 },
    changes: [],
    error: message,
    remediation:
      "ADV status unavailable. Could not read change projections from the project state directory — verify the directory exists and contains readable change JSON.",
  };
}

export function buildLiveStatusPayloadFromSummaries(
  summaries: ChangeSummary[],
  options: {
    projectId: string;
    archivedCount: number;
    closedCount: number;
    now: Date;
  },
): LiveStatusPayload {
  return {
    source: "disk",
    live: true,
    stale: false,
    generated_at: options.now.toISOString(),
    project_id: options.projectId,
    counts: {
      active: summaries.length,
      archived: options.archivedCount,
      closed: options.closedCount,
    },
    changes: summaries,
  };
}

export function filterTerminalSummaries(
  summaries: ChangeSummary[],
  terminalChangeIds: ReadonlySet<string>,
): ChangeSummary[] {
  if (terminalChangeIds.size === 0) return summaries;
  return summaries.filter((summary) => !terminalChangeIds.has(summary.id));
}

export async function loadLiveSummaries(
  projectId: string,
  now: Date,
): Promise<ChangeSummary[]> {
  return loadSummariesFromDisk(projectId, now);
}

/**
 * Read active change summaries from disk projections.
 * Reads schemaVersion: 2 projection envelopes from the changes directory.
 */
function loadSummariesFromDisk(projectId: string, now: Date): ChangeSummary[] {
  try {
    const dir = resolveAdvStateSubdir(projectId, "changes");
    const files = readdirSync(dir).filter((f: string) => f.endsWith(".json"));
    const summaries: ChangeSummary[] = [];
    for (const f of files) {
      try {
        const raw = JSON.parse(readFileSync(join(dir, f), "utf8"));
        const state = raw.state ?? raw;
        if (state.status === "archived" || state.status === "closed") continue;
        const id = String(state.id ?? f.replace(/\.json$/, ""));
        const change = {
          id,
          title: String(state.title ?? id),
          status: String(state.status ?? "draft"),
          lifecycleState: state.lifecycleState,
          created_at: String(
            state.created_at ??
              state.createdAt ??
              state.updatedAt ??
              raw.projectedAt ??
              now.toISOString(),
          ),
          tasks: Array.isArray(state.tasks) ? state.tasks : [],
          gates: state.gates && typeof state.gates === "object" ? state.gates : {},
          wisdom: Array.isArray(state.wisdom) ? state.wisdom : [],
          fast_follow_of: state.fast_follow_of,
          epic_membership: state.epic_membership,
          lastSignalAt: state.lastSignalAt,
        } as ChangeRecord;
        const summary = summarizeLiveChanges([change], now)[0];
        if (summary) summaries.push(summary);
      } catch (_e) {
        // skip malformed projections
      }
    }
    return summaries;
  } catch {
    return [];
  }
}
