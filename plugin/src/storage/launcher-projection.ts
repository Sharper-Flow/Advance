import { dirname, join } from "node:path";
import { z } from "zod";
import {
  listSummaryChanges,
  type ChangeSummaryShard,
  type ProjectionDocumentWarning,
} from "./change-summary-shard-reader";
import { classifySummaryCandidates } from "./change-projection-reader";
import { hasArchiveBundle } from "./json";
import { writeLauncherProjection } from "./launcher-projection-writer";
import { createLogger } from "../utils/debug-log";

const launcherLog = createLogger("launcher-projection");

export const LauncherChangeSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.literal("draft"),
  phase: z.string(),
  created_at: z.string(),
  last_activity_at: z.string(),
  task_count: z.number().int().nonnegative(),
  completed_tasks: z.number().int().nonnegative(),
  projection_revision: z.number().int().nonnegative(),
  epic_membership: z
    .object({
      epic_id: z.string(),
      entry_id: z.string(),
      order: z.number().int().min(0),
      title: z.string(),
    })
    .optional(),
});

export type LauncherChangeSummary = z.infer<typeof LauncherChangeSummarySchema>;

export const LauncherProjectionSchema = z.object({
  schema_version: z.literal(1),
  generated_at: z.string(),
  source: z.literal("disk_projection"),
  freshness: z.string().nullable(),
  degraded: z.boolean(),
  degraded_threshold_ms: z.number(),
  epics_available: z.boolean(),
  active_count: z.number().int().nonnegative(),
  changes: z.array(LauncherChangeSummarySchema).max(50),
  warnings: z
    .array(
      z.object({
        path: z.string(),
        kind: z.enum(["oversized", "corrupt", "unreadable"]),
        limit: z.number().optional(),
        actual: z.number().optional(),
        error: z.string().optional(),
      }),
    )
    .optional(),
});

export type LauncherProjection = z.infer<typeof LauncherProjectionSchema>;

export interface BuildLauncherProjectionInput {
  changesDir: string;
  summariesDir: string;
  /** Archive bundles are terminal evidence when a summary shard is stale. */
  archiveDir?: string;
  generatedAt: string;
  degradedThresholdMs: number;
  /** Injectable summary reader for deterministic projection tests. */
  readSummaries?: () => Promise<
    | {
        kind: "ok";
        summaries: ChangeSummaryShard[];
        warnings?: ProjectionDocumentWarning[];
      }
    | { kind: "error"; error: string }
  >;
}

export async function buildLauncherProjection(
  input: BuildLauncherProjectionInput,
): Promise<LauncherProjection> {
  const {
    changesDir,
    summariesDir,
    archiveDir,
    generatedAt,
    degradedThresholdMs,
    readSummaries,
  } = input;
  const summaries = await (readSummaries
    ? readSummaries()
    : listSummaryChanges({ changesDir, summariesDir }));
  if (summaries.kind !== "ok") {
    throw new Error(
      `Unable to read launcher summary pointers: ${summaries.error}`,
    );
  }
  let candidateSummaries = summaries.summaries;
  if (!readSummaries) {
    const classification = await classifySummaryCandidates(
      changesDir,
      summaries.summaries.map((summary) => summary.id),
    );
    const validIds = new Set(classification.valid);
    candidateSummaries = summaries.summaries.filter((summary) =>
      validIds.has(summary.id),
    );
  }
  const reconciledSummaries = await Promise.all(
    candidateSummaries.map(async (summary) => {
      if (
        summary.status === "draft" &&
        archiveDir &&
        (await hasArchiveBundle(archiveDir, summary.id))
      ) {
        return { ...summary, status: "archived" as const };
      }
      return summary;
    }),
  );
  const activeSummaries = reconciledSummaries
    .filter((summary) => summary.status === "draft")
    .map(
      (summary): LauncherChangeSummary => ({
        id: summary.id,
        title: summary.title,
        status: "draft",
        phase: summary.phase,
        created_at: summary.created_at,
        last_activity_at: summary.last_activity_at,
        task_count: summary.task_count,
        completed_tasks: summary.completed_tasks,
        projection_revision: summary.projection_revision,
        ...(summary.epic_membership
          ? { epic_membership: summary.epic_membership }
          : {}),
      }),
    )
    .sort(
      (left, right) =>
        right.last_activity_at.localeCompare(left.last_activity_at) ||
        left.id.localeCompare(right.id),
    );
  const freshness = activeSummaries.reduce<string | null>(
    (latest, summary) =>
      latest === null || summary.last_activity_at > latest
        ? summary.last_activity_at
        : latest,
    null,
  );
  return {
    schema_version: 1,
    generated_at: generatedAt,
    source: "disk_projection",
    freshness,
    degraded:
      freshness !== null &&
      Date.now() - new Date(freshness).getTime() > degradedThresholdMs,
    degraded_threshold_ms: degradedThresholdMs,
    epics_available: false,
    active_count: activeSummaries.length,
    changes: activeSummaries.slice(0, 50),
    ...(summaries.warnings && summaries.warnings.length > 0
      ? { warnings: summaries.warnings }
      : {}),
  };
}

/**
 * Best-effort aggregate launcher-projection refresh after a per-change
 * projection commit.
 *
 * Replaces the Temporal-activity piggyback removed with Temporal deletion
 * (ADR 0009). The old `writeChangeProjection` activity rebuilt the aggregate
 * after each per-change write; with Temporal gone, nothing rebuilt it and
 * `active-launcher-state.json` froze. This helper restores that automatic
 * refresh on the disk-only commit path.
 *
 * Derives the aggregate path, summaries dir, and archive dir from `changesDir`
 * (the per-change projection directory), rebuilds the aggregate from existing
 * summary pointers, and writes it. Summary pointers are assumed fresh —
 * callers invoke this after `commitChangeProjectionWithSummary`, which
 * publishes the mutated change's pointer immediately before this runs.
 *
 * Best-effort: any failure is logged and swallowed. The per-change projection
 * is authoritative; the aggregate is a downstream cache (ADR 0009).
 */
export async function refreshLauncherAggregateAfterCommit(
  changesDir: string,
): Promise<void> {
  try {
    const externalRoot = dirname(changesDir);
    const aggregatePath = join(externalRoot, "active-launcher-state.json");
    const projection = await buildLauncherProjection({
      changesDir,
      summariesDir: join(externalRoot, "summaries"),
      archiveDir: join(externalRoot, "archive"),
      generatedAt: new Date().toISOString(),
      degradedThresholdMs: 300_000,
    });
    await writeLauncherProjection(aggregatePath, projection);
  } catch (err) {
    launcherLog.warn("launcher-aggregate-refresh-failed", {
      changesDir,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
