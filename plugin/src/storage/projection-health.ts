import { listChangeDirs, loadChange } from "./change-projection-reader";
import {
  readCurrentSummaryShard,
  type SummaryIndexPaths,
} from "./change-summary-shard";
import {
  compareProjectionCounters,
  extractProjectionCounters,
  readLegacyCounters,
  type ProjectionCounters,
} from "./projection-counters";

export type CanonicalProjectionFailureType =
  | "not_found"
  | "schema_error"
  | "read_error"
  | "oversized"
  | "corrupt"
  | "unreadable"
  | "counter_extraction";

export interface CanonicalProjectionError {
  type: CanonicalProjectionFailureType;
  reason: string;
}

export interface ProjectionDivergence {
  change_id: string;
  /** Omitted only when the canonical projection could not be read/extracted. */
  canonical?: ProjectionCounters;
  canonical_error?: CanonicalProjectionError;
  legacy?: ProjectionCounters;
  summary?: ProjectionCounters;
  reasons: string[];
}

export interface ProjectionDivergenceScan {
  divergences: ProjectionDivergence[];
  scanned: number;
  omitted: number;
  truncated: boolean;
  budgetExceeded: boolean;
}

export interface ProjectionDivergenceScanOptions {
  maxChanges?: number;
  budgetMs?: number;
}

function sameCounters(left: ProjectionCounters, right: ProjectionCounters) {
  return compareProjectionCounters(left, right) === 0;
}
function canonicalFailure(
  changeId: string,
  error: CanonicalProjectionError,
): ProjectionDivergence {
  return {
    change_id: changeId,
    canonical_error: error,
    reasons: [`canonical projection ${error.type}: ${error.reason}`],
  };
}

/**
 * Compare canonical change.json with retired flat envelopes and summary
 * pointers. This is diagnostic-only; repairs belong to the storage-owned
 * summary rebuild path and no JSON is synthesized here.
 */
export async function findProjectionDivergences(
  paths: SummaryIndexPaths,
  options: ProjectionDivergenceScanOptions = {},
): Promise<ProjectionDivergenceScan> {
  const divergences: ProjectionDivergence[] = [];
  const changeIds = await listChangeDirs(paths.changesDir);
  const maxChanges = Math.max(1, options.maxChanges ?? changeIds.length);
  const deadline =
    options.budgetMs === undefined
      ? Number.POSITIVE_INFINITY
      : Date.now() + Math.max(1, options.budgetMs);
  const candidates = changeIds.slice(0, maxChanges);
  let budgetExceeded = false;
  let scanned = 0;
  for (const changeId of candidates) {
    if (Date.now() >= deadline) {
      budgetExceeded = true;
      break;
    }
    scanned += 1;
    const loaded = await loadChange(paths.changesDir, changeId);
    if (!loaded.success) {
      divergences.push(
        canonicalFailure(changeId, {
          type: loaded.type,
          reason: loaded.error,
        }),
      );
      continue;
    }
    if (!loaded.data) {
      divergences.push(
        canonicalFailure(changeId, {
          type: "not_found",
          reason: "canonical change projection is missing",
        }),
      );
      continue;
    }
    const canonical = extractProjectionCounters(loaded.data);
    if (!canonical) {
      divergences.push(
        canonicalFailure(changeId, {
          type: "counter_extraction",
          reason: "canonical projection counters are unavailable",
        }),
      );
      continue;
    }

    const reasons: string[] = [];
    const legacy = await readLegacyCounters(paths.changesDir, changeId);
    let legacyCounters: ProjectionCounters | undefined;
    if (legacy.kind === "ok") {
      legacyCounters = legacy.counters;
      if (compareProjectionCounters(legacy.counters, canonical) < 0) {
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
  return {
    divergences,
    scanned,
    omitted: Math.max(0, changeIds.length - scanned),
    truncated: scanned < changeIds.length,
    budgetExceeded,
  };
}
