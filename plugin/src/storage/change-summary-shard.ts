/**
 * Durable per-change summary shards and rebuild.
 *
 * Implements the approved projection-first CQRS-lite architecture for
 * per-change immutable summary shards:
 *
 *   summaries/<change-id>/current.json          # atomic pointer
 *   summaries/<change-id>/revisions/<rev>.json  # immutable shard
 *
 * Full snapshots remain authoritative under summaries/. A successful command
 * commits the full snapshot first, then writes the immutable shard, then
 * atomically replaces the per-change pointer. Readers that find a malformed,
 * missing, or ahead-of-snapshot shard/pointer report a typed degraded index
 * state. Rebuild derives shards solely from full change projections, never
 * from workflow Queries.
 */

import { z } from "zod";
import { join } from "path";
import { readdir } from "fs/promises";
import type { Dirent } from "fs";
import { atomicWriteFile } from "../utils/fs";
import type { Change } from "../types";
import { FastFollowOfSchema } from "../types";
import { GATE_ORDER } from "../types/gates";
import {
  commitChangeProjection,
  type CommitChangeProjectionOptions,
  type ProjectionCommitAfterCommit,
} from "./change-projection-transaction";
import { listChangeDirs, loadChange } from "./json";
import {
  readBoundedProjectionDocument,
  outcomeToWarning,
  type ProjectionDocumentWarning,
} from "./change-projection-reader";

// =============================================================================
// Bounded projection read helpers for summary pointer/shard JSON
// =============================================================================

async function readBoundedSummaryJson<T>(
  path: string,
  schema: z.ZodType<T>,
  context: { type: string; id: string },
): Promise<
  | { kind: "ok"; data: T; warning?: ProjectionDocumentWarning }
  | { kind: "not_found" }
  | { kind: "degraded"; reason: string; warning?: ProjectionDocumentWarning }
> {
  const outcome = await readBoundedProjectionDocument(path);
  if (outcome.kind === "ok") {
    try {
      return { kind: "ok", data: schema.parse(JSON.parse(outcome.content)) };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          kind: "degraded",
          reason: `${context.type} schema invalid for ${context.id}: ${error.message}`,
        };
      }
      return {
        kind: "degraded",
        reason: `${context.type} JSON parse failed for ${context.id}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  if (outcome.kind === "not_found") {
    return { kind: "not_found" };
  }
  const warning = outcomeToWarning(path, outcome);
  return {
    kind: "degraded",
    reason: `${context.type} ${outcome.kind} for ${context.id}: ${warning.error ?? ""}`,
    warning,
  };
}

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

export interface CommitChangeSummaryOptions extends Omit<
  CommitChangeProjectionOptions,
  "changesDir"
> {
  paths: SummaryIndexPaths;
  operationId: string;
  payloadHash: string;
  stateRevision?: number;
}

export interface CommitChangeSummaryOutcome {
  kind: "committed" | "idempotent" | "conflict" | "error";
  snapshotRevision?: number;
  value?: Change;
  revision?: number;
  audit?: import("../types").ProjectionCommitAuditEntry;
  shard?: ChangeSummaryShard;
  pointer?: ChangeSummaryPointer;
  error?: string;
}

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

/**
 * Publish one summary shard and pointer from an already-written canonical
 * change projection. This is the sole summary materializer used by commits,
 * creation bootstrap, and bounded rebuild; it never reads a flat envelope.
 */
export async function publishSummaryForChange(
  paths: SummaryIndexPaths,
  change: Change,
  operationId?: string,
): Promise<{ shard: ChangeSummaryShard; pointer: ChangeSummaryPointer }> {
  const summary = summaryPaths(paths, change.id);
  const projectionRevision = change.projection_revision ?? 0;
  const resolvedOperationId =
    operationId ?? change.projection_commits?.at(-1)?.operation_id ?? "rebuild";
  const shard = deriveSummaryShard(
    change,
    resolvedOperationId,
    projectionRevision,
  );
  const shardPath = join(summary.revDir, `${projectionRevision}.json`);
  const pointer: ChangeSummaryPointer = {
    schema_version: 1,
    change_id: change.id,
    state_revision: shard.state_revision,
    projection_revision: projectionRevision,
    operation_id: resolvedOperationId,
    shard_path: shardPath,
    snapshot_path: summary.snapshotPath,
    committed_at: new Date().toISOString(),
  };

  await atomicWriteFile(shardPath, JSON.stringify(shard, null, 2));
  await atomicWriteFile(summary.pointerPath, JSON.stringify(pointer, null, 2));
  return { shard, pointer };
}

function isPathUnder(base: string, target: string): boolean {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return target.startsWith(normalizedBase);
}

/**
 * Commit a full change snapshot together with its immutable summary shard
 * and atomic per-change current pointer.
 *
 * The wrapper delegates the full-snapshot write to the existing
 * commitChangeProjection transaction, then publishes the immutable summary
 * shard and pointer while the per-change lock is still held via the
 * afterCommit hook. Command success is proven only after the readback confirms
 * snapshot, shard, and pointer share the same state revision and operation
 * identity.
 */
export async function commitChangeProjectionWithSummary(
  options: CommitChangeSummaryOptions,
): Promise<CommitChangeSummaryOutcome> {
  const { paths, changeId, operationId, payloadHash, stateRevision } = options;
  const summary = summaryPaths(paths, changeId);

  const afterCommit: ProjectionCommitAfterCommit = async ({ readback }) => {
    const projectionRevision = readback.projection_revision ?? 0;
    const { shard, pointer } = await publishSummaryForChange(
      paths,
      readback,
      operationId,
    );
    const shardPath = pointer.shard_path;

    // Readback proof: confirm shard and pointer are durable and consistent.
    const pointerReadback = await readBoundedSummaryJson(
      summary.pointerPath,
      ChangeSummaryPointerSchema,
      { type: "summary pointer readback", id: changeId },
    );
    if (pointerReadback.kind === "not_found") {
      return { ok: false, error: "pointer readback missing after commit" };
    }
    if (pointerReadback.kind === "degraded") {
      return {
        ok: false,
        error: `pointer readback failed: ${pointerReadback.reason}`,
      };
    }
    const readbackPointer = pointerReadback.data;
    if (
      readbackPointer.state_revision !== shard.state_revision ||
      readbackPointer.projection_revision !== projectionRevision ||
      readbackPointer.operation_id !== operationId ||
      readbackPointer.shard_path !== shardPath ||
      readbackPointer.snapshot_path !== summary.snapshotPath
    ) {
      return { ok: false, error: "pointer readback does not match commit" };
    }

    const shardReadback = await readBoundedSummaryJson(
      shardPath,
      ChangeSummaryShardSchema,
      { type: "summary shard readback", id: changeId },
    );
    if (shardReadback.kind === "not_found") {
      return { ok: false, error: "shard readback missing after commit" };
    }
    if (shardReadback.kind === "degraded") {
      return {
        ok: false,
        error: `shard readback failed: ${shardReadback.reason}`,
      };
    }
    const readbackShard = shardReadback.data;
    if (
      readbackShard.state_revision !== shard.state_revision ||
      readbackShard.projection_revision !== projectionRevision ||
      readbackShard.operation_id !== operationId ||
      readbackShard.id !== changeId
    ) {
      return { ok: false, error: "shard readback does not match commit" };
    }

    return { ok: true };
  };

  const baseOptions: CommitChangeProjectionOptions = {
    changesDir: paths.changesDir,
    changeId,
    expectedRevision: options.expectedRevision,
    operationId,
    payloadHash,
    stateRevision,
    authority: options.authority,
    mutationKind: options.mutationKind,
    mutateLatest: options.mutateLatest,
    normalizeLatestProjection: options.normalizeLatestProjection,
    verify: options.verify,
    afterCommit,
    lockTimeoutMs: options.lockTimeoutMs,
  };

  const outcome = await commitChangeProjection(baseOptions);

  switch (outcome.kind) {
    case "committed": {
      const pointerRead = await readBoundedSummaryJson(
        summary.pointerPath,
        ChangeSummaryPointerSchema,
        { type: "summary pointer", id: changeId },
      );
      if (pointerRead.kind === "not_found") {
        return {
          kind: "error",
          error: "Snapshot committed but summary pointer is missing",
        };
      }
      if (pointerRead.kind === "degraded") {
        return {
          kind: "error",
          error: `Snapshot committed but summary pointer unreadable: ${pointerRead.reason}`,
        };
      }
      const shardRead = await readBoundedSummaryJson(
        pointerRead.data.shard_path,
        ChangeSummaryShardSchema,
        { type: "summary shard", id: changeId },
      );
      if (shardRead.kind === "not_found") {
        return {
          kind: "error",
          error: "Snapshot committed but summary shard is missing",
        };
      }
      if (shardRead.kind === "degraded") {
        return {
          kind: "error",
          error: `Snapshot committed but summary shard unreadable: ${shardRead.reason}`,
        };
      }
      return {
        kind: outcome.idempotent ? "idempotent" : "committed",
        snapshotRevision: outcome.revision,
        value: outcome.value,
        revision: outcome.revision,
        audit: outcome.audit,
        shard: shardRead.data,
        pointer: pointerRead.data,
      };
    }
    case "committed_unverified":
      return {
        kind: "error",
        value: outcome.value,
        revision: outcome.revision,
        audit: outcome.audit,
        error: `Snapshot committed but summary shard/pointer unverified: ${outcome.postconditionError}`,
      };
    case "stale_revision":
    case "state_regression":
    case "state_revision_conflict":
    case "operation_conflict":
      return {
        kind: "conflict",
        error: `${outcome.kind}: ${JSON.stringify(outcome)}`,
      };
    case "lock_timeout":
    case "schema_error":
    case "write_error":
    case "operator_required":
      return { kind: "error", error: JSON.stringify(outcome) };
    default: {
      const _exhaustive: never = outcome;
      void _exhaustive;
      return { kind: "error", error: "unknown commit outcome" };
    }
  }
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

  // Load the authoritative full snapshot if it exists, but do not fail yet:
  // summary-only artifacts may exist for repair/diagnostic reads and should be
  // validated first.
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

  const pointerRead = await readBoundedSummaryJson(
    summary.pointerPath,
    ChangeSummaryPointerSchema,
    { type: "summary pointer", id: changeId },
  );
  if (pointerRead.kind === "not_found") {
    // No pointer. If the snapshot exists this is a crash-stale index; if
    // neither exists the change is simply not indexed.
    return snapshot
      ? { kind: "degraded", reason: "missing current summary pointer" }
      : { kind: "not_found" };
  }
  if (pointerRead.kind === "degraded") {
    return { kind: "degraded", reason: pointerRead.reason };
  }
  const pointer = pointerRead.data;

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

  // If we have an authoritative snapshot, check freshness before paying the
  // cost of loading the shard. This also lets stale/behind pointers surface
  // ahead of "missing shard" when the referenced older shard has been GC'd.
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

  const shardRead = await readBoundedSummaryJson(
    pointer.shard_path,
    ChangeSummaryShardSchema,
    { type: "summary shard", id: changeId },
  );
  if (shardRead.kind === "not_found") {
    return {
      kind: "degraded",
      reason: "missing summary shard referenced by pointer",
    };
  }
  if (shardRead.kind === "degraded") {
    return { kind: "degraded", reason: shardRead.reason };
  }
  const shard = shardRead.data;

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

  // Once pointer and shard are syntactically valid, require a matching full
  // snapshot for authority verification.
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
 * Rebuild every per-change summary shard and pointer from the authoritative
 * full change projections. No workflow Queries are issued.
 */
export async function rebuildSummaryIndex(paths: SummaryIndexPaths): Promise<
  | {
      kind: "ok";
      rebuilt: number;
      errors: Array<{ changeId: string; error: string }>;
    }
  | { kind: "error"; error: string }
> {
  let ids: string[];
  try {
    ids = await listChangeDirs(paths.changesDir);
  } catch (error) {
    return {
      kind: "error",
      error: `failed to list changes: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const errors: Array<{ changeId: string; error: string }> = [];
  let rebuilt = 0;

  for (const changeId of ids) {
    try {
      assertSafeChangeId(changeId);
    } catch (error) {
      errors.push({
        changeId,
        error: `unsafe change id: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    const loaded = await loadChange(paths.changesDir, changeId);
    if (!loaded.success) {
      errors.push({ changeId, error: loaded.error });
      continue;
    }
    if (!loaded.data) {
      continue;
    }
    const change = loaded.data;
    await publishSummaryForChange(paths, change);
    rebuilt++;
  }

  return { kind: "ok", rebuilt, errors };
}

/**
 * List changes using only the durable summary pointers, without hydrating full
 * change projections.
 */
export async function listSummaryChanges(paths: SummaryIndexPaths): Promise<
  | {
      kind: "ok";
      summaries: ChangeSummaryShard[];
      warnings?: ProjectionDocumentWarning[];
    }
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
  const warnings: ProjectionDocumentWarning[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const changeId = entry.name;
    if (changeId === "." || changeId === "..") continue;
    if (changeId.includes("/") || changeId.includes("\\")) continue;

    const summary = summaryPaths(paths, changeId);
    const pointerRead = await readBoundedSummaryJson(
      summary.pointerPath,
      ChangeSummaryPointerSchema,
      { type: "summary pointer", id: changeId },
    );
    if (pointerRead.kind === "not_found") continue;
    if (pointerRead.kind === "degraded") {
      if (pointerRead.warning) warnings.push(pointerRead.warning);
      continue;
    }
    const pointer = pointerRead.data;
    if (pointer.change_id !== changeId) {
      warnings.push({
        path: summary.pointerPath,
        kind: "corrupt",
        error: `pointer change_id mismatch: ${pointer.change_id} !== ${changeId}`,
      });
      continue;
    }

    const expectedShardPrefix = join(paths.summariesDir, changeId, "revisions");
    if (!isPathUnder(expectedShardPrefix, pointer.shard_path)) {
      warnings.push({
        path: summary.pointerPath,
        kind: "corrupt",
        error: "pointer shard_path escapes allowed directory",
      });
      continue;
    }

    const shardRead = await readBoundedSummaryJson(
      pointer.shard_path,
      ChangeSummaryShardSchema,
      { type: "summary shard", id: changeId },
    );
    if (shardRead.kind === "not_found") continue;
    if (shardRead.kind === "degraded") {
      if (shardRead.warning) warnings.push(shardRead.warning);
      continue;
    }
    if (shardRead.data.id !== changeId) {
      warnings.push({
        path: pointer.shard_path,
        kind: "corrupt",
        error: `shard id mismatch: ${shardRead.data.id} !== ${changeId}`,
      });
      continue;
    }

    summaries.push(shardRead.data);
  }

  return {
    kind: "ok",
    summaries,
    ...(warnings.length > 0 && { warnings }),
  };
}

/**
 * Determine which revision shards for a change are safe to garbage collect.
 *
 * A shard is safe only when the pointer and full snapshot both prove it is
 * strictly older than the current revision.
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

  const pointerRead = await readBoundedSummaryJson(
    summary.pointerPath,
    ChangeSummaryPointerSchema,
    { type: "summary pointer", id: changeId },
  );
  if (pointerRead.kind !== "ok") {
    if (pointerRead.kind === "not_found") {
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
      reason: pointerRead.reason,
    };
  }
  const pointer = pointerRead.data;

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
