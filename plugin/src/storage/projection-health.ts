import { join } from "node:path";
import {
  listChangeDirs,
  loadChange,
  readBoundedProjectionDocument,
} from "./change-projection-reader";
import {
  readCurrentSummaryShard,
  type SummaryIndexPaths,
} from "./change-summary-shard";

interface ProjectionCounters {
  projection_revision: number;
  state_revision: number;
  task_count: number;
}

export interface ProjectionDivergence {
  change_id: string;
  canonical: ProjectionCounters;
  legacy?: ProjectionCounters;
  summary?: ProjectionCounters;
  reasons: string[];
}

function counters(value: unknown): ProjectionCounters | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    projection_revision:
      typeof record.projection_revision === "number"
        ? record.projection_revision
        : 0,
    state_revision:
      typeof record.state_revision === "number" ? record.state_revision : 0,
    task_count: Array.isArray(record.tasks) ? record.tasks.length : 0,
  };
}

function sameCounters(left: ProjectionCounters, right: ProjectionCounters) {
  return (
    left.projection_revision === right.projection_revision &&
    left.state_revision === right.state_revision &&
    left.task_count === right.task_count
  );
}

async function readLegacyCounters(
  changesDir: string,
  changeId: string,
): Promise<
  | { kind: "missing" }
  | { kind: "ok"; counters: ProjectionCounters }
  | { kind: "degraded"; reason: string }
> {
  const path = join(changesDir, `${changeId}.json`);
  const result = await readBoundedProjectionDocument(path);
  if (result.kind === "not_found") return { kind: "missing" };
  if (result.kind !== "ok") {
    return { kind: "degraded", reason: `legacy envelope ${result.kind}` };
  }

  try {
    const parsed = JSON.parse(result.content) as {
      state?: unknown;
    };
    const state = parsed?.state ?? parsed;
    const value = counters(state);
    return value
      ? { kind: "ok", counters: value }
      : { kind: "degraded", reason: "legacy envelope has no state object" };
  } catch (error) {
    return {
      kind: "degraded",
      reason: `legacy envelope parse failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Compare canonical change.json with retired flat envelopes and summary
 * pointers. This is diagnostic-only; repairs belong to the storage-owned
 * summary rebuild path and no JSON is synthesized here.
 */
export async function findProjectionDivergences(
  paths: SummaryIndexPaths,
): Promise<ProjectionDivergence[]> {
  const divergences: ProjectionDivergence[] = [];
  for (const changeId of await listChangeDirs(paths.changesDir)) {
    const loaded = await loadChange(paths.changesDir, changeId);
    if (!loaded.success || !loaded.data) continue;
    const canonical = counters(loaded.data);
    if (!canonical) continue;

    const reasons: string[] = [];
    const legacy = await readLegacyCounters(paths.changesDir, changeId);
    let legacyCounters: ProjectionCounters | undefined;
    if (legacy.kind === "ok") {
      legacyCounters = legacy.counters;
      if (!sameCounters(canonical, legacy.counters)) {
        reasons.push(
          `legacy envelope is behind or differs (canonical revision ${canonical.projection_revision}, ${canonical.task_count} tasks; legacy revision ${legacy.counters.projection_revision}, ${legacy.counters.task_count} tasks)`,
        );
      }
    } else if (legacy.kind === "degraded") {
      reasons.push(legacy.reason);
    }

    let summaryCounters: ProjectionCounters | undefined;
    const summary = await readCurrentSummaryShard(paths, changeId);
    if (summary.kind === "ok") {
      summaryCounters = {
        projection_revision: summary.shard.projection_revision,
        state_revision: summary.shard.state_revision,
        task_count: summary.shard.task_count,
      };
      if (!sameCounters(canonical, summaryCounters)) {
        reasons.push(
          `summary pointer/shard is behind or differs (canonical revision ${canonical.projection_revision}, ${canonical.task_count} tasks; summary revision ${summaryCounters.projection_revision}, ${summaryCounters.task_count} tasks)`,
        );
      }
    } else {
      reasons.push(
        summary.kind === "not_found"
          ? "summary pointer is missing"
          : `summary index degraded: ${summary.reason}`,
      );
    }

    if (reasons.length > 0) {
      divergences.push({
        change_id: changeId,
        canonical,
        ...(legacyCounters ? { legacy: legacyCounters } : {}),
        ...(summaryCounters ? { summary: summaryCounters } : {}),
        reasons,
      });
    }
  }
  return divergences;
}
