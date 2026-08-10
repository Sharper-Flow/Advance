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
  GATE_ORDER,
} from "./changes";
import type { ChangeRecord, ChangeSummary, LiveStatusPayload } from "./types";
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
 * Derive a gate-progress string from the summary shard's phase field.
 * The phase is the first incomplete gate; all gates before it are done.
 */
function gateProgressFromPhase(phase: string): string {
  const idx = GATE_ORDER.indexOf(phase as (typeof GATE_ORDER)[number]);
  if (idx === -1) return GATE_ORDER.map(() => "✓").join(" ");
  return GATE_ORDER.map((_, i) => (i < idx ? "✓" : "○")).join(" ");
}

/**
 * Read active change summaries from summary pointers.
 *
 * Summary pointers (summaries/{id}/current.json → immutable shard) are the
 * current, mutation-backed projection. They replaced frozen flat files
 * (changes/{id}.json) which were written by the removed Temporal signal
 * path and are no longer updated. Reading summary pointers keeps the CLI
 * in sync with the aggregate launcher projection.
 */
function loadSummariesFromDisk(projectId: string, now: Date): ChangeSummary[] {
  try {
    const summariesDir = resolveAdvStateSubdir(projectId, "summaries");
    const entries = readdirSync(summariesDir);
    const summaries: ChangeSummary[] = [];
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      try {
        const pointer = JSON.parse(
          readFileSync(join(summariesDir, entry, "current.json"), "utf8"),
        );
        if (!pointer.shard_path) continue;
        const shard = JSON.parse(readFileSync(pointer.shard_path, "utf8"));
        if (shard.status === "archived" || shard.status === "closed") continue;

        const lastActivityAt = String(
          shard.last_activity_at ?? shard.created_at ?? now.toISOString(),
        );
        const minutesSinceActivity = Math.max(
          0,
          Math.floor(
            (now.getTime() - new Date(lastActivityAt).getTime()) / 60000,
          ),
        );
        const phase = String(shard.phase ?? "proposal");

        summaries.push({
          id: String(shard.id ?? entry),
          title: String(shard.title ?? shard.id ?? entry),
          status: String(shard.status ?? "draft"),
          lifecycleState: "open",
          recency: classifyRecency(minutesSinceActivity),
          lastActivityAt,
          minutesSinceActivity,
          tasksDone: Number(shard.completed_tasks ?? 0),
          tasksTotal: Number(shard.task_count ?? 0),
          firstIncompleteGate: phase,
          gateProgressStr: gateProgressFromPhase(phase),
          ...(shard.epic_membership?.epic_id
            ? { epicId: String(shard.epic_membership.epic_id) }
            : {}),
        });
      } catch {
        // skip malformed summary pointer or shard
      }
    }
    summaries.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
    return summaries;
  } catch {
    return [];
  }
}
