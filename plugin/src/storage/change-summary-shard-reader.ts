/**
 * Durable per-change summary shard readers.
 *
 * These helpers intentionally have no Temporal dependency and no active write
 * surface. They are the read side of the projection-first CQRS-lite summary
 * index.
 */

import { z } from "zod";
import { join } from "path";
import { readdir, readFile } from "fs/promises";
import type { Dirent } from "fs";
import type { Change } from "../types";
import { FastFollowOfSchema } from "../types";
import { loadChange } from "./change-projection-reader";

export const ChangeSummaryShardSchema = z.object({
  schema_version: z.literal(1),
  id: z.string(),
  title: z.string(),
  status: z.enum(["draft", "archived", "closed"]),
  phase: z.string(),
  created_at: z.string(),
  last_activity_at: z.string(),
  task_count: z.number().int().nonnegative(),
  completed_tasks: z.number().int().nonnegative(),
  state_revision: z.number().int().nonnegative(),
  operation_id: z.string(),
  projection_revision: z.number().int().nonnegative(),
  capabilities: z.array(z.string()).default([]),
  fast_follow_of: FastFollowOfSchema.optional(),
  epic_membership: z
    .object({
      epic_id: z.string(),
      entry_id: z.string(),
      order: z.number().int().min(0),
      title: z.string(),
      linked_at: z.string(),
      epic_project_id: z.string().optional(),
      repo_id: z.string().optional(),
      source: z
        .enum(["create", "promote_shell", "link_existing", "move"])
        .optional(),
    })
    .optional(),
});

export type ChangeSummaryShard = z.infer<typeof ChangeSummaryShardSchema>;

export const ChangeSummaryPointerSchema = z.object({
  schema_version: z.literal(1),
  change_id: z.string(),
  state_revision: z.number().int().nonnegative(),
  projection_revision: z.number().int().nonnegative(),
  operation_id: z.string(),
  shard_path: z.string(),
  snapshot_path: z.string(),
  committed_at: z.string(),
});

export type ChangeSummaryPointer = z.infer<typeof ChangeSummaryPointerSchema>;

export type SummaryReadResult =
  | {
      kind: "ok";
      shard: ChangeSummaryShard;
      pointer: ChangeSummaryPointer;
      snapshotRevision: number;
    }
  | { kind: "not_found" }
  | { kind: "degraded"; reason: string };

export interface SummaryIndexPaths {
  changesDir: string;
  summariesDir: string;
}

const GATE_ORDER: readonly string[] = [
  "proposal",
  "discovery",
  "design",
  "planning",
  "execution",
  "acceptance",
  "release",
];

export function assertSafeChangeId(changeId: string): void {
  if (
    changeId.includes("/") ||
    changeId.includes("\\") ||
    changeId === ".." ||
    changeId.includes("/../") ||
    changeId.includes("\\..")
  ) {
    throw new Error(`Unsafe changeId for summary shard paths: ${changeId}`);
  }
}

function derivePhase(gates: Record<string, { status?: string }>): string {
  for (const gateId of GATE_ORDER) {
    const gate = gates[gateId];
    if (typeof gate === "object" && gate !== null && gate.status === "done") {
      continue;
    }
    return gateId;
  }
  return "release";
}

function countDoneTasks(tasks: ReadonlyArray<{ status: string }>): number {
  return tasks.filter((t) => t.status === "done").length;
}

export function deriveSummaryShard(
  change: Change,
  operationId: string,
  projectionRevision: number,
): ChangeSummaryShard {
  const tasks = change.tasks ?? [];
  const shard: ChangeSummaryShard = {
    schema_version: 1,
    id: change.id,
    title: change.title,
    status: change.status,
    phase: derivePhase(change.gates ?? {}),
    created_at: change.created_at,
    last_activity_at: change.lastSignalAt ?? change.created_at,
    task_count: tasks.length,
    completed_tasks: countDoneTasks(tasks),
    state_revision: change.state_revision ?? 0,
    operation_id: operationId,
    projection_revision: projectionRevision,
    capabilities: Object.keys(change.deltas ?? {}),
  };
  if (change.epic_membership) {
    shard.epic_membership = change.epic_membership;
  }
  if (change.fast_follow_of) {
    shard.fast_follow_of = change.fast_follow_of;
  }
  return shard;
}

export function summaryPaths(paths: SummaryIndexPaths, changeId: string) {
  assertSafeChangeId(changeId);
  return {
    changeDir: join(paths.summariesDir, changeId),
    revDir: join(paths.summariesDir, changeId, "revisions"),
    pointerPath: join(paths.summariesDir, changeId, "current.json"),
    snapshotPath: join(paths.changesDir, changeId, "change.json"),
  };
}

function isPathUnder(base: string, target: string): boolean {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return target.startsWith(normalizedBase);
}

/**
 * Read the current summary shard for a change via its pointer, with full
 * snapshot/pointer/shard consistency checks.
 */
export async function readCurrentSummaryShard(
  paths: SummaryIndexPaths,
  changeId: string,
): Promise<SummaryReadResult> {
  assertSafeChangeId(changeId);
  const summary = summaryPaths(paths, changeId);

  let snapshot: Change | null = null;
  let snapshotError: string | null = null;
  try {
    const loaded = await loadChange(paths.changesDir, changeId);
    if (loaded.success && loaded.data) {
      snapshot = loaded.data;
    } else if (!loaded.success) {
      snapshotError = loaded.error;
    }
  } catch (error) {
    snapshotError = error instanceof Error ? error.message : String(error);
  }

  let pointerRaw: unknown;
  try {
    pointerRaw = JSON.parse(await readFile(summary.pointerPath, "utf-8"));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return snapshot
        ? { kind: "degraded", reason: "missing current summary pointer" }
        : { kind: "not_found" };
    }
    return {
      kind: "degraded",
      reason: `malformed pointer JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const pointerResult = ChangeSummaryPointerSchema.safeParse(pointerRaw);
  if (!pointerResult.success) {
    return {
      kind: "degraded",
      reason: `pointer schema invalid: ${pointerResult.error.message}`,
    };
  }
  const pointer = pointerResult.data;

  if (pointer.change_id !== changeId) {
    return {
      kind: "degraded",
      reason: "pointer change_id mismatch",
    };
  }
  if (pointer.snapshot_path !== summary.snapshotPath) {
    return {
      kind: "degraded",
      reason: "pointer snapshot_path mismatch",
    };
  }
  const expectedShardPrefix = join(paths.summariesDir, changeId, "revisions");
  if (!isPathUnder(expectedShardPrefix, pointer.shard_path)) {
    return {
      kind: "degraded",
      reason: "pointer shard_path escapes allowed directory",
    };
  }

  if (snapshot) {
    const snapshotStateRev = snapshot.state_revision ?? 0;
    const snapshotProjRev = snapshot.projection_revision ?? 0;

    if (pointer.state_revision > snapshotStateRev) {
      return {
        kind: "degraded",
        reason: "summary pointer ahead of full snapshot state_revision",
      };
    }
    if (pointer.projection_revision > snapshotProjRev) {
      return {
        kind: "degraded",
        reason: "summary pointer ahead of full snapshot projection_revision",
      };
    }
    if (
      pointer.state_revision < snapshotStateRev ||
      pointer.projection_revision < snapshotProjRev
    ) {
      return {
        kind: "degraded",
        reason: "summary pointer stale (behind full snapshot)",
      };
    }
  }

  let shardRaw: unknown;
  try {
    shardRaw = JSON.parse(await readFile(pointer.shard_path, "utf-8"));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {
        kind: "degraded",
        reason: "missing summary shard referenced by pointer",
      };
    }
    return {
      kind: "degraded",
      reason: `malformed shard JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const shardResult = ChangeSummaryShardSchema.safeParse(shardRaw);
  if (!shardResult.success) {
    return {
      kind: "degraded",
      reason: `shard schema invalid: ${shardResult.error.message}`,
    };
  }
  const shard = shardResult.data;

  if (shard.id !== changeId) {
    return { kind: "degraded", reason: "shard change id mismatch" };
  }
  if (shard.state_revision !== pointer.state_revision) {
    return {
      kind: "degraded",
      reason: "shard/pointer state_revision mismatch",
    };
  }
  if (shard.projection_revision !== pointer.projection_revision) {
    return {
      kind: "degraded",
      reason: "shard/pointer projection_revision mismatch",
    };
  }
  if (shard.operation_id !== pointer.operation_id) {
    return {
      kind: "degraded",
      reason: "shard/pointer operation_id mismatch",
    };
  }

  if (!snapshot) {
    return {
      kind: "degraded",
      reason: snapshotError
        ? `full snapshot unavailable: ${snapshotError}`
        : "missing full snapshot for summary verification",
    };
  }

  const snapshotStateRev = snapshot.state_revision ?? 0;
  const snapshotProjRev = snapshot.projection_revision ?? 0;

  if (shard.state_revision > snapshotStateRev) {
    return {
      kind: "degraded",
      reason: "summary shard ahead of full snapshot",
    };
  }

  return {
    kind: "ok",
    shard,
    pointer,
    snapshotRevision: snapshotProjRev,
  };
}

/**
 * List changes using only the durable summary pointers, without hydrating full
 * change projections.
 */
export async function listSummaryChanges(
  paths: SummaryIndexPaths,
): Promise<
  | { kind: "ok"; summaries: ChangeSummaryShard[] }
  | { kind: "error"; error: string }
> {
  let entries: Dirent[];
  try {
    entries = await readdir(paths.summariesDir, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { kind: "ok", summaries: [] };
    }
    return {
      kind: "error",
      error: `failed to read summaries directory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const summaries: ChangeSummaryShard[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const changeId = entry.name;
    if (changeId === "." || changeId === "..") continue;
    if (changeId.includes("/") || changeId.includes("\\")) continue;

    const summary = summaryPaths(paths, changeId);
    let pointerRaw: unknown;
    try {
      pointerRaw = JSON.parse(await readFile(summary.pointerPath, "utf-8"));
    } catch {
      continue;
    }
    const pointerResult = ChangeSummaryPointerSchema.safeParse(pointerRaw);
    if (!pointerResult.success) continue;
    const pointer = pointerResult.data;
    if (pointer.change_id !== changeId) continue;

    const expectedShardPrefix = join(paths.summariesDir, changeId, "revisions");
    if (!isPathUnder(expectedShardPrefix, pointer.shard_path)) continue;

    let shardRaw: unknown;
    try {
      shardRaw = JSON.parse(await readFile(pointer.shard_path, "utf-8"));
    } catch {
      continue;
    }
    const shardResult = ChangeSummaryShardSchema.safeParse(shardRaw);
    if (!shardResult.success) continue;
    if (shardResult.data.id !== changeId) continue;

    summaries.push(shardResult.data);
  }

  return { kind: "ok", summaries };
}

/**
 * Determine which revision shards for a change are safe to garbage collect.
 */
export async function collectObsoleteSummaryShards(
  paths: SummaryIndexPaths,
  changeId: string,
): Promise<{ kind: "ok"; obsolete: string[]; safe: boolean; reason?: string }> {
  assertSafeChangeId(changeId);
  const summary = summaryPaths(paths, changeId);

  let snapshot: Change;
  try {
    const loaded = await loadChange(paths.changesDir, changeId);
    if (!loaded.success || !loaded.data) {
      return {
        kind: "ok",
        obsolete: [],
        safe: false,
        reason: "snapshot missing or unreadable",
      };
    }
    snapshot = loaded.data;
  } catch (error) {
    return {
      kind: "ok",
      obsolete: [],
      safe: false,
      reason: `snapshot read error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let pointerRaw: unknown;
  try {
    pointerRaw = JSON.parse(await readFile(summary.pointerPath, "utf-8"));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {
        kind: "ok",
        obsolete: [],
        safe: false,
        reason: "pointer missing",
      };
    }
    return {
      kind: "ok",
      obsolete: [],
      safe: false,
      reason: "pointer unreadable",
    };
  }

  const pointerResult = ChangeSummaryPointerSchema.safeParse(pointerRaw);
  if (!pointerResult.success) {
    return {
      kind: "ok",
      obsolete: [],
      safe: false,
      reason: "pointer schema invalid",
    };
  }
  const pointer = pointerResult.data;

  if (pointer.snapshot_path !== summary.snapshotPath) {
    return {
      kind: "ok",
      obsolete: [],
      safe: false,
      reason: "pointer snapshot_path mismatch",
    };
  }

  const snapshotStateRev = snapshot.state_revision ?? 0;
  const snapshotProjRev = snapshot.projection_revision ?? 0;
  if (
    pointer.state_revision !== snapshotStateRev ||
    pointer.projection_revision !== snapshotProjRev
  ) {
    return {
      kind: "ok",
      obsolete: [],
      safe: false,
      reason: "pointer revision does not match snapshot",
    };
  }

  let files: string[];
  try {
    files = await readdir(summary.revDir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { kind: "ok", obsolete: [], safe: true, reason: "no revisions" };
    }
    return {
      kind: "ok",
      obsolete: [],
      safe: false,
      reason: `revisions directory unreadable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const obsolete: string[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const rev = Number.parseInt(file.slice(0, -".json".length), 10);
    if (Number.isNaN(rev)) continue;
    if (rev < pointer.state_revision && rev < snapshotStateRev) {
      obsolete.push(join(summary.revDir, file));
    }
  }

  return { kind: "ok", obsolete, safe: true };
}
