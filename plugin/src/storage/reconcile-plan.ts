/** Pure planning substrate for the store residue reconcile pass. */

import { createHash } from "node:crypto";
import { z } from "zod";

import {
  ResidueClassSchema,
  type ResidueClass,
  type StoreResidueScan,
} from "./store-residue-scan";

const actionForClass = {
  schema_drift_retired_enum: ["normalize_enum_mapping", "quarantine_record"],
  summary_pointer_missing: ["rebuild_summary_shard"],
  summary_pointer_stale: ["rebuild_summary_shard"],
  legacy_divergent_behind: ["advance_legacy_to_canonical"],
  legacy_newer_than_canonical: ["report_only"],
  unmigrated_artifact_metadata: [
    "migrate_record",
    "classify_terminal_noop",
    "quarantine_record",
  ],
  unmigrated_worktree_marker: ["set_marker_auto", "set_marker_legacy"],
  epic_owner_missing: [
    "reconstruct_from_child_fragments",
    "formally_lost_report",
    "clear_dangling_membership",
  ],
  epic_owner_foreign: ["report_only"],
  epic_entry_missing: ["backfill_epic_entry_from_fragment"],
  quarantined_record: ["normalize_and_restore", "remain_quarantined_reported"],
  unknown_store_noise: ["quarantine_to_trash"],
  store_artifact_missing: ["rebuild_from_changes"],
} as const;

export const ReconcileActionSchema = z.discriminatedUnion("class", [
  z.object({
    class: z.literal("schema_drift_retired_enum"),
    action: z.enum(actionForClass.schema_drift_retired_enum),
  }),
  z.object({
    class: z.literal("summary_pointer_missing"),
    action: z.enum(actionForClass.summary_pointer_missing),
  }),
  z.object({
    class: z.literal("summary_pointer_stale"),
    action: z.enum(actionForClass.summary_pointer_stale),
  }),
  z.object({
    class: z.literal("legacy_divergent_behind"),
    action: z.enum(actionForClass.legacy_divergent_behind),
  }),
  z.object({
    class: z.literal("legacy_newer_than_canonical"),
    action: z.enum(actionForClass.legacy_newer_than_canonical),
  }),
  z.object({
    class: z.literal("unmigrated_artifact_metadata"),
    action: z.enum(actionForClass.unmigrated_artifact_metadata),
  }),
  z.object({
    class: z.literal("unmigrated_worktree_marker"),
    action: z.enum(actionForClass.unmigrated_worktree_marker),
  }),
  z.object({
    class: z.literal("epic_owner_missing"),
    action: z.enum(actionForClass.epic_owner_missing),
  }),
  z.object({
    class: z.literal("epic_owner_foreign"),
    action: z.enum(actionForClass.epic_owner_foreign),
  }),
  z.object({
    class: z.literal("epic_entry_missing"),
    action: z.enum(actionForClass.epic_entry_missing),
  }),
  z.object({
    class: z.literal("quarantined_record"),
    action: z.enum(actionForClass.quarantined_record),
  }),
  z.object({
    class: z.literal("unknown_store_noise"),
    action: z.enum(actionForClass.unknown_store_noise),
  }),
  z.object({
    class: z.literal("store_artifact_missing"),
    action: z.enum(actionForClass.store_artifact_missing),
  }),
]);

export type ReconcileAction = z.infer<typeof ReconcileActionSchema>;

export const ReconcilePlanRecordSchema = z.object({
  record_id: z.string(),
  source_path: z.string(),
  class: ResidueClassSchema,
  evidence: z.array(z.string()),
  actions: z.array(ReconcileActionSchema),
});

export type ReconcilePlanRecord = z.infer<typeof ReconcilePlanRecordSchema>;

export const ReconcilePlanSchema = z.object({
  schema_version: z.literal(1),
  records: z.array(ReconcilePlanRecordSchema),
  plan_hash: z.string().regex(/^[a-f0-9]{64}$/),
});

export type ReconcilePlan = z.infer<typeof ReconcilePlanSchema>;

export const ReconcileReceiptSchema = z.object({
  record_id: z.string(),
  class: ResidueClassSchema,
  action: z.string(),
  status: z.enum(["mutated", "skipped", "failed"]),
  error_class: z.string().optional(),
  before_hash: z.string().optional(),
  after_hash: z.string().optional(),
  ts: z.string(),
});

export type ReconcileReceipt = z.infer<typeof ReconcileReceiptSchema>;

/**
 * Announcement that the store cannot converge in a single run.
 *
 * `PRIMARY_PRECEDENCE` assigns exactly one repair class per record, and
 * `schema_drift_retired_enum` outranks `unmigrated_artifact_metadata`. A record
 * carrying both therefore gets only its retired-enum repair in this run; its
 * artifact metadata can only be migrated once the projection validates as a
 * whole document, which happens after that repair lands. Without this
 * announcement an operator seeing leftover artifact-metadata residue would
 * reasonably conclude the run failed.
 */
export const ReconcileFollowUpRunsSchema = z.object({
  reason: z.literal("dual_residue_requires_second_run"),
  message: z.string().min(1),
  record_ids: z.array(z.string()).min(1),
});

export type ReconcileFollowUpRuns = z.infer<typeof ReconcileFollowUpRunsSchema>;

export const ReconcileRunReportSchema = z.object({
  schema_version: z.literal(1),
  run_id: z.string(),
  mode: z.enum(["dry_run", "execute"]),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  interrupted: z.boolean(),
  records: z.array(ReconcileReceiptSchema),
  counters: z.object({
    mutated: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  residuals: z.array(z.string()),
  proof: z.record(z.string(), z.unknown()).optional(),
  continuation_cursor: z.string().min(1).optional(),
  follow_up_runs_required: ReconcileFollowUpRunsSchema.optional(),
});

export type ReconcileRunReport = z.infer<typeof ReconcileRunReportSchema>;

export type { StoreResidueScan } from "./store-residue-scan";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function canonicalizeReconcilePlan(value: unknown): unknown {
  return canonicalize(value);
}

const classOrder: Record<ResidueClass, number> = Object.fromEntries(
  ResidueClassSchema.options.map((className, index) => [className, index]),
) as Record<ResidueClass, number>;

function actionsFor(className: ResidueClass): ReconcileAction[] {
  if (className === "healthy") return [];
  return actionForClass[className].map((action) => ({
    class: className,
    action,
  })) as ReconcileAction[];
}

function hashPlan(value: Omit<ReconcilePlan, "plan_hash">): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

/**
 * Detects records whose residue spans both the retired-enum repair and the
 * artifact-metadata migration, which cannot converge in one run.
 *
 * Pure: derived from the scan alone, so plan, dry-run, and apply all report the
 * same answer. Returns `undefined` when a single run suffices.
 */
export function detectFollowUpRuns(
  scan: StoreResidueScan,
): ReconcileFollowUpRuns | undefined {
  const affected = scan.records
    .filter((record) => {
      const classes = new Set<ResidueClass>([
        record.class,
        ...record.also_matches,
      ]);
      return (
        classes.has("schema_drift_retired_enum") &&
        classes.has("unmigrated_artifact_metadata")
      );
    })
    .map((record) => record.record_id);

  if (affected.length === 0) return undefined;
  return {
    reason: "dual_residue_requires_second_run",
    message: `${affected.length} record(s) carry both retired-evidence and artifact-metadata residue. This run repairs the retired evidence only; run plan and apply a second time to migrate their artifact metadata.`,
    record_ids: affected,
  };
}

export function buildReconcilePlan(scan: StoreResidueScan): ReconcilePlan {
  const records = [...scan.records]
    .sort(
      (left, right) =>
        classOrder[left.class] - classOrder[right.class] ||
        left.record_id.localeCompare(right.record_id),
    )
    .map((record) => {
      // Marker and derived-summary repairs are independent of the primary
      // residue repair. Other secondary classifications are diagnostic
      // overlaps whose actions would target a different storage layout or
      // repeat a primary fallback. Schema-invalid and quarantined records must
      // normalize first; all other records can safely establish secondary
      // projections before their primary action so the secondary write does
      // not invalidate a copied envelope.
      const secondaryActions = [
        ...(record.also_matches.includes("unmigrated_worktree_marker")
          ? actionsFor("unmigrated_worktree_marker")
          : []),
        ...(record.also_matches.includes("summary_pointer_missing")
          ? actionsFor("summary_pointer_missing")
          : []),
        ...(record.also_matches.includes("summary_pointer_stale")
          ? actionsFor("summary_pointer_stale")
          : []),
      ];
      const primaryActions = actionsFor(record.class);
      const actions =
        record.class === "schema_drift_retired_enum" ||
        record.class === "quarantined_record" ||
        record.class === "unmigrated_artifact_metadata"
          ? [...primaryActions, ...secondaryActions]
          : [...secondaryActions, ...primaryActions];
      return {
        record_id: record.record_id,
        source_path: record.source_path,
        class: record.class,
        evidence: [...record.evidence],
        actions,
      };
    });
  const withoutHash = { schema_version: 1 as const, records };
  return { ...withoutHash, plan_hash: hashPlan(withoutHash) };
}
