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
import { pathToFileURL } from "node:url";
import { resolveAdvStateSubdir } from "./adv-state-paths";

type SummaryResidue = NonNullable<LiveStatusPayload["summary_residue"]>;

type SummaryCandidateClassification = {
  valid: string[];
  excluded: SummaryResidue["excluded"];
};

type SummaryCandidateClassifier = (
  changesDir: string,
  candidateIds: string[],
) => Promise<SummaryCandidateClassification>;

type LoadedSummaries = {
  summaries: ChangeSummary[];
  summaryResidue?: SummaryResidue;
};

type SummaryShard = {
  id?: unknown;
  title?: unknown;
  status?: unknown;
  phase?: unknown;
  created_at?: unknown;
  last_activity_at?: unknown;
  completed_tasks?: unknown;
  task_count?: unknown;
  epic_membership?: { epic_id?: unknown };
};

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
    summaryResidue?: SummaryResidue;
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
    ...(options.summaryResidue
      ? { summary_residue: options.summaryResidue }
      : {}),
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
  const result = await loadSummariesFromDisk(projectId, now);
  return result.summaries;
}

export async function loadLiveSummariesWithResidue(
  projectId: string,
  now: Date,
): Promise<LoadedSummaries> {
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
async function loadSummaryClassifier(): Promise<SummaryCandidateClassifier | null> {
  const bundlePath =
    process.env.ADV_SUMMARY_CANDIDATES_CLI_BUNDLE ??
    join(import.meta.dir, "../../plugin/dist/summary-candidates-cli.js");
  try {
    const bundle = (await import(pathToFileURL(bundlePath).href)) as {
      classifySummaryCandidates?: SummaryCandidateClassifier;
    };
    if (typeof bundle.classifySummaryCandidates !== "function") {
      throw new Error("bundle does not export classifySummaryCandidates");
    }
    return bundle.classifySummaryCandidates;
  } catch {
    return null;
  }
}

async function loadSummariesFromDisk(
  projectId: string,
  now: Date,
): Promise<LoadedSummaries> {
  const summariesDir = resolveAdvStateSubdir(projectId, "summaries");
  const changesDir = resolveAdvStateSubdir(projectId, "changes");
  const classifySummaryCandidates = await loadSummaryClassifier();
  let entries: string[];
  try {
    entries = readdirSync(summariesDir);
  } catch {
    return { summaries: [] };
  }
  const summaries: ChangeSummary[] = [];
  const excluded: SummaryResidue["excluded"] = [];
  const validationUnavailable = classifySummaryCandidates === null;
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    let shard: SummaryShard;
    try {
      const pointer = JSON.parse(
        readFileSync(join(summariesDir, entry, "current.json"), "utf8"),
      );
      if (!pointer.shard_path) continue;
      shard = JSON.parse(readFileSync(pointer.shard_path, "utf8"));
    } catch {
      // skip malformed summary pointer or shard
      continue;
    }
    if (shard.status === "archived" || shard.status === "closed") continue;

    const summaryId = String(shard.id ?? entry);
    if (classifySummaryCandidates) {
      const classification = await classifySummaryCandidates(changesDir, [
        summaryId,
      ]);
      if (!classification.valid.includes(summaryId)) {
        const exclusion = classification.excluded.find(
          (candidate) => candidate.id === summaryId,
        );
        if (!exclusion) {
          throw new Error(
            `summary classifier did not classify candidate ${summaryId}`,
          );
        }
        excluded.push(exclusion);
        continue;
      }
    }

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
      id: summaryId,
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
  }
  summaries.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  excluded.sort((a, b) => a.id.localeCompare(b.id));
  const summaryResidue =
    validationUnavailable || excluded.length > 0
      ? {
          excluded,
          ...(validationUnavailable
            ? { validation_unavailable: true as const }
            : {}),
        }
      : undefined;
  return { summaries, summaryResidue };
}
