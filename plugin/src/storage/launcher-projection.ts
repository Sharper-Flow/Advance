import { z } from "zod";
import {
  listSummaryChanges,
  type ChangeSummaryShard,
} from "./change-summary-shard-reader";

export const LauncherChangeSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.literal("draft"),
  phase: z.string(),
  created_at: z.string(),
  last_activity_at: z.string(),
  task_count: z.number().int().nonnegative(),
  completed_tasks: z.number().int().nonnegative(),
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
});

export type LauncherProjection = z.infer<typeof LauncherProjectionSchema>;

export interface BuildLauncherProjectionInput {
  changesDir: string;
  summariesDir: string;
  generatedAt: string;
  degradedThresholdMs: number;
  /** Injectable summary reader for deterministic projection tests. */
  readSummaries?: () => Promise<
    | { kind: "ok"; summaries: ChangeSummaryShard[] }
    | { kind: "error"; error: string }
  >;
}

export async function buildLauncherProjection(
  input: BuildLauncherProjectionInput,
): Promise<LauncherProjection> {
  const {
    changesDir,
    summariesDir,
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
  const activeSummaries = summaries.summaries
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
  };
}
