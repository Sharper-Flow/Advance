/**
 * Summary-artifact actions for the store reconcile dispatcher.
 *
 * The normal dispatcher path is per-change: it loads one authoritative
 * canonical projection and delegates materialization to
 * `publishSummaryForChange`. A caller that has a large batch of summary
 * records may explicitly use `rebuildSummaryBatchExecutor` instead; that path
 * delegates once to `rebuildSummaryIndex` and is not registered as the
 * per-record default because doing so would repeat a whole-store rebuild.
 */

import { readFile } from "node:fs/promises";

import type { Change } from "../types";
import {
  publishSummaryForChange,
  readCurrentSummaryShard,
  rebuildSummaryIndex,
  summaryPaths,
  type SummaryIndexPaths,
} from "./change-summary-shard";
import type {
  ActionContext,
  ActionExecutor,
  ActionOutcome,
} from "./reconcile-action-types";
import type { ReconcileAction, ReconcilePlanRecord } from "./reconcile-plan";
import { loadChange } from "./json";

export type SummaryRebuildEvidence = {
  record_id?: string;
  pointer_resolves: true;
  pointer_path?: string;
  shard_path?: string;
  snapshot_path?: string;
  state_revision?: number;
  projection_revision?: number;
  operation_id?: string;
  batch?: true;
  rebuilt?: number;
};

/** ActionOutcome plus proof retained for direct executor callers and tests. */
export type SummaryActionOutcome = ActionOutcome & {
  evidence?: SummaryRebuildEvidence;
};

function indexPaths(ctx: ActionContext): SummaryIndexPaths {
  return {
    changesDir: ctx.storePaths.changes,
    summariesDir: ctx.storePaths.summariesDir,
  };
}

async function loadCanonical(
  paths: SummaryIndexPaths,
  recordId: string,
): Promise<
  | { kind: "ok"; change: Change }
  | { kind: "failed"; error_class: string; residual: string }
> {
  const loaded = await loadChange(paths.changesDir, recordId);
  if (!loaded.success) {
    return {
      kind: "failed",
      error_class: "canonical_projection_unparseable",
      residual: loaded.error,
    };
  }
  if (!loaded.data) {
    return {
      kind: "failed",
      error_class: "canonical_projection_missing",
      residual: `canonical projection missing for ${recordId}`,
    };
  }
  return { kind: "ok", change: loaded.data };
}

async function rebuildOne(
  record: ReconcilePlanRecord,
  ctx: ActionContext,
): Promise<SummaryActionOutcome> {
  const paths = indexPaths(ctx);
  const canonical = await loadCanonical(paths, record.record_id);
  if (canonical.kind === "failed") {
    return {
      status: "failed",
      error_class: canonical.error_class,
      residual: canonical.residual,
    };
  }

  const change = canonical.change;
  const published = await publishSummaryForChange(paths, change);
  const resolved = await readCurrentSummaryShard(paths, change.id);
  if (resolved.kind !== "ok") {
    return {
      status: "failed",
      error_class: "summary_pointer_unverified",
      residual: `${change.id}: ${resolved.kind === "degraded" ? resolved.reason : "summary pointer not found after rebuild"}`,
    };
  }
  if (published.pointer.shard_path !== resolved.pointer.shard_path) {
    return {
      status: "failed",
      error_class: "summary_pointer_unverified",
      residual: `${change.id}: published shard differs from resolved pointer`,
    };
  }

  const summary = summaryPaths(paths, change.id);
  const pointerBytes = await readFile(summary.pointerPath);
  return {
    status: "mutated",
    after_bytes: pointerBytes,
    evidence: {
      record_id: change.id,
      pointer_resolves: true,
      pointer_path: summary.pointerPath,
      shard_path: resolved.pointer.shard_path,
      snapshot_path: resolved.pointer.snapshot_path,
      state_revision: resolved.pointer.state_revision,
      projection_revision: resolved.pointer.projection_revision,
      operation_id: resolved.pointer.operation_id,
    },
  };
}

/**
 * Default AC3 action: repair one missing or stale pointer from its canonical
 * change projection. Canonical parse failures are reported, never normalized
 * here; the planner's normalization action owns that earlier repair step.
 */
export const rebuildSummaryShardExecutor: ActionExecutor = async (
  record,
  _action,
  ctx,
) => rebuildOne(record, ctx);

/**
 * Restore a missing derived store artifact from the canonical projection.
 * Summary artifacts use the same materializer as pointer repair.
 */
export const rebuildFromChangesExecutor: ActionExecutor = async (
  record,
  _action,
  ctx,
) => rebuildOne(record, ctx);

/**
 * Optional whole-store tail for callers processing many summary records.
 * Prefer the per-change executors for the dispatcher default; choose this
 * helper only when the caller can amortize one whole-store scan/rebuild.
 */
export async function rebuildSummaryBatchExecutor(
  ctx: ActionContext,
): Promise<SummaryActionOutcome> {
  const result = await rebuildSummaryIndex(indexPaths(ctx));
  if (result.kind === "error") {
    return {
      status: "failed",
      error_class: "summary_index_rebuild_failed",
      residual: result.error,
    };
  }
  if (result.errors.length > 0) {
    return {
      status: "failed",
      error_class: "summary_index_partial_failure",
      residual: result.errors
        .map(({ changeId, error }) => `${changeId}: ${error}`)
        .join("; "),
    };
  }
  return {
    status: "mutated",
    evidence: {
      pointer_resolves: true,
      batch: true,
      rebuilt: result.rebuilt,
    },
  };
}

export type SummaryActionName = Extract<
  ReconcileAction["action"],
  "rebuild_summary_shard" | "rebuild_from_changes"
>;
