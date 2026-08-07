/** Shared bounded counter extraction for canonical and legacy projections. */

import { join } from "node:path";

import { readBoundedProjectionDocument } from "./change-projection-reader";

export interface ProjectionCounters {
  projection_revision: number;
  state_revision: number;
  task_count: number;
}

export function extractProjectionCounters(
  value: unknown,
): ProjectionCounters | null {
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

export function compareProjectionCounters(
  left: ProjectionCounters,
  right: ProjectionCounters,
): number {
  for (const key of [
    "projection_revision",
    "state_revision",
    "task_count",
  ] as const) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }
  return 0;
}

export async function readLegacyCounters(
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
  if (result.kind !== "ok")
    return { kind: "degraded", reason: `legacy envelope ${result.kind}` };
  try {
    const parsed = JSON.parse(result.content) as { state?: unknown };
    const value = extractProjectionCounters(parsed?.state ?? parsed);
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
