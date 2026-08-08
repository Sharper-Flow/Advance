/**
 * Completion proof for the store-reconciliation pass.
 *
 * The bounded residue scan is planning input, not completion evidence. This
 * module deliberately calls the existing projection-divergence diagnostic
 * without an options object, so neither `maxChanges` nor `budgetMs` can cap
 * the proof scan. A scan failure or truncated result is retained as a
 * non-complete proof rather than being converted into success.
 */

import { z } from "zod";

import {
  findProjectionDivergences,
  type ProjectionDivergence,
  type ProjectionDivergenceScan,
  type ProjectionDivergenceScanOptions,
} from "./projection-health";
import type { SummaryIndexPaths } from "./change-summary-shard";

const ProjectionCountersSchema = z.object({
  projection_revision: z.number().int().nonnegative(),
  state_revision: z.number().int().nonnegative(),
  task_count: z.number().int().nonnegative(),
});

const ProjectionDivergenceSchema = z.object({
  change_id: z.string(),
  canonical: ProjectionCountersSchema.optional(),
  canonical_error: z
    .object({
      type: z.enum([
        "not_found",
        "schema_error",
        "read_error",
        "oversized",
        "corrupt",
        "unreadable",
        "counter_extraction",
      ]),
      reason: z.string(),
    })
    .optional(),
  legacy: ProjectionCountersSchema.optional(),
  summary: ProjectionCountersSchema.optional(),
  reasons: z.array(z.string()),
});

export const ReconcileProofWhitelistEntrySchema = z.object({
  change_id: z.string().min(1),
  reason: z.string().min(1),
});

export type ReconcileProofWhitelistEntry = z.infer<
  typeof ReconcileProofWhitelistEntrySchema
>;

const ProofScanSummarySchema = z.object({
  divergences: z.array(ProjectionDivergenceSchema),
  divergence_count: z.number().int().nonnegative(),
  scanned: z.number().int().nonnegative(),
  omitted: z.number().int().nonnegative(),
  truncated: z.boolean(),
  budget_exceeded: z.boolean(),
  scan_error: z.string().optional(),
});

export const ReconcileCompletionProofSchema = z.object({
  schema_version: z.literal(1),
  status: z.enum(["complete", "incomplete", "error"]),
  complete: z.boolean(),
  before: ProofScanSummarySchema,
  after: ProofScanSummarySchema,
  before_divergence_count: z.number().int().nonnegative(),
  after_divergence_count: z.number().int().nonnegative(),
  whitelisted_divergence_count: z.number().int().nonnegative(),
  residual_divergences: z.array(ProjectionDivergenceSchema),
  documented_whitelist: z.array(ReconcileProofWhitelistEntrySchema),
  error: z.string().optional(),
});

export type ReconcileCompletionProof = z.infer<
  typeof ReconcileCompletionProofSchema
>;

export interface ReconcileProofDeps {
  /** Test seam; production uses the projection-health diagnostic unchanged. */
  scan?: (
    paths: SummaryIndexPaths,
    options?: ProjectionDivergenceScanOptions,
  ) => Promise<ProjectionDivergenceScan>;
}

export interface ReconcileCompletionProofOptions {
  paths: SummaryIndexPaths;
  /** A pre-apply scan captured by the orchestrator, when available. */
  before?: ProjectionDivergenceScan;
  whitelist?: readonly ReconcileProofWhitelistEntry[];
  deps?: ReconcileProofDeps;
}

/**
 * Run the completion scan with no budget or record-count options.
 *
 * Keeping this call as `scan(paths)` is intentional: passing a nominally
 * "unbounded" options object would make it too easy for a future caller to
 * accidentally reintroduce a cap.
 */
export async function runUnboundedProjectionDivergenceScan(
  paths: SummaryIndexPaths,
  scan: ReconcileProofDeps["scan"] = findProjectionDivergences,
): Promise<ProjectionDivergenceScan> {
  return scan(paths);
}

function emptySummary(): ReconcileCompletionProof["before"] {
  return {
    divergences: [],
    divergence_count: 0,
    scanned: 0,
    omitted: 0,
    truncated: false,
    budget_exceeded: false,
  };
}

function toSummary(
  scan: ProjectionDivergenceScan,
): ReconcileCompletionProof["before"] {
  return {
    divergences: scan.divergences,
    divergence_count: scan.divergences.length,
    scanned: scan.scanned,
    omitted: scan.omitted,
    truncated: scan.truncated,
    budget_exceeded: scan.budgetExceeded,
  };
}

function isWhitelisted(
  divergence: ProjectionDivergence,
  whitelist: readonly ReconcileProofWhitelistEntry[],
): boolean {
  return whitelist.some(
    (entry) =>
      entry.change_id === divergence.change_id &&
      divergence.reasons.includes(entry.reason),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failedProof(
  before: ReconcileCompletionProof["before"],
  after: ReconcileCompletionProof["after"],
  whitelist: readonly ReconcileProofWhitelistEntry[],
  status: "incomplete" | "error",
  error: string,
): ReconcileCompletionProof {
  const residual = after.divergences.filter(
    (divergence) => !isWhitelisted(divergence, whitelist),
  );
  return {
    schema_version: 1,
    status,
    complete: false,
    before,
    after,
    before_divergence_count: before.divergence_count,
    after_divergence_count: after.divergence_count,
    whitelisted_divergence_count: after.divergence_count - residual.length,
    residual_divergences: residual,
    documented_whitelist: [...whitelist],
    error,
  };
}

/**
 * Compare the pre-apply and post-apply projection-divergence populations.
 * Completion is true only when the post-apply scan is exhaustive and every
 * remaining divergence is covered by an explicit reasoned whitelist.
 */
export async function computeReconcileCompletionProof({
  paths,
  before: suppliedBefore,
  whitelist = [],
  deps = {},
}: ReconcileCompletionProofOptions): Promise<ReconcileCompletionProof> {
  const scan = deps.scan ?? findProjectionDivergences;
  let before = suppliedBefore;

  if (!before) {
    try {
      before = await runUnboundedProjectionDivergenceScan(paths, scan);
    } catch (error) {
      return failedProof(
        emptySummary(),
        { ...emptySummary(), scan_error: errorMessage(error) },
        whitelist,
        "error",
        `before proof scan failed: ${errorMessage(error)}`,
      );
    }
  }

  let after: ReconcileCompletionProof["after"];
  try {
    after = toSummary(await runUnboundedProjectionDivergenceScan(paths, scan));
  } catch (error) {
    return failedProof(
      toSummary(before),
      { ...emptySummary(), scan_error: errorMessage(error) },
      whitelist,
      "error",
      `after proof scan failed: ${errorMessage(error)}`,
    );
  }

  const residual = after.divergences.filter(
    (divergence) => !isWhitelisted(divergence, whitelist),
  );
  const exhaustive =
    !after.truncated && after.omitted === 0 && !after.budget_exceeded;
  if (!exhaustive) {
    return failedProof(
      toSummary(before),
      after,
      whitelist,
      "incomplete",
      "unbounded proof scan did not return an exhaustive result",
    );
  }

  return {
    schema_version: 1,
    status: residual.length === 0 ? "complete" : "incomplete",
    complete: residual.length === 0,
    before: toSummary(before),
    after,
    before_divergence_count: before.divergences.length,
    after_divergence_count: after.divergence_count,
    whitelisted_divergence_count: after.divergence_count - residual.length,
    residual_divergences: residual,
    documented_whitelist: [...whitelist],
  };
}
