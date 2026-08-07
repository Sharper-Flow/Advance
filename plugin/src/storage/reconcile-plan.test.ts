import { describe, expect, test } from "vitest";

import {
  buildReconcilePlan,
  ReconcileActionSchema,
  ReconcilePlanSchema,
  type StoreResidueScan,
} from "./reconcile-plan";

const classes = [
  "schema_drift_retired_enum",
  "summary_pointer_missing",
  "summary_pointer_stale",
  "legacy_divergent_behind",
  "legacy_newer_than_canonical",
  "unmigrated_artifact_metadata",
  "unmigrated_worktree_marker",
  "epic_owner_missing",
  "quarantined_record",
  "unknown_store_noise",
  "store_artifact_missing",
  "healthy",
] as const;

const base = (className: (typeof classes)[number], record_id: string) => ({
  record_id,
  source_path: `/fixture/${record_id}`,
  class: className,
  also_matches: [],
  evidence: [`fixture=${className}`],
});

function scan(records: StoreResidueScan["records"]): StoreResidueScan {
  return {
    schema_version: 1,
    records,
    counters: Object.fromEntries(
      classes.map((item) => [item, 0]),
    ) as StoreResidueScan["counters"],
    scanned: records.length,
    omitted: 0,
    truncated: false,
    budget_exceeded: false,
  };
}

describe("buildReconcilePlan", () => {
  test("covers the bounded action union for every residue class", () => {
    const plan = buildReconcilePlan(
      scan(classes.map((className) => base(className, className))),
    );
    expect(ReconcilePlanSchema.safeParse(plan).success).toBe(true);
    expect(
      plan.records.find((item) => item.class === "healthy")?.actions,
    ).toEqual([]);
    for (const record of plan.records) {
      for (const action of record.actions) {
        expect(ReconcileActionSchema.safeParse(action).success).toBe(true);
      }
    }
  });

  test("normalization precedes summary rebuilding", () => {
    const plan = buildReconcilePlan(
      scan([
        base("summary_pointer_missing", "summary"),
        base("schema_drift_retired_enum", "schema"),
      ]),
    );
    expect(plan.records.map((record) => record.actions[0]?.action)).toEqual([
      "normalize_enum_mapping",
      "rebuild_summary_shard",
    ]);
  });

  test("plan hash is stable when input object keys are permuted", () => {
    const left = scan([
      { record_id: "b", class: "healthy", also_matches: [], evidence: ["ok"] },
      {
        record_id: "a",
        class: "unknown_store_noise",
        also_matches: [],
        evidence: ["noise"],
      },
    ]);
    const right = {
      budget_exceeded: false,
      truncated: false,
      omitted: 0,
      scanned: 2,
      counters: { healthy: 0, unknown_store_noise: 0 },
      records: [
        {
          evidence: ["noise"],
          also_matches: [],
          class: "unknown_store_noise",
          record_id: "a",
        },
        {
          evidence: ["ok"],
          also_matches: [],
          class: "healthy",
          record_id: "b",
        },
      ],
      schema_version: 1,
    } as StoreResidueScan;
    expect(buildReconcilePlan(left).plan_hash).toBe(
      buildReconcilePlan(right).plan_hash,
    );
  });

  test("does not perform filesystem work", () => {
    const plan = buildReconcilePlan(scan([base("healthy", "healthy")]));
    expect(plan.plan_hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
