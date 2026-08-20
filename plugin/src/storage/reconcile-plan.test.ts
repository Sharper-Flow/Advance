import { describe, expect, test } from "vitest";

import {
  buildReconcilePlan,
  detectFollowUpRuns,
  ReconcileActionSchema,
  ReconcileFollowUpRunsSchema,
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
  "epic_owner_foreign",
  "epic_entry_missing",
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

  test("reports foreign owners and defers entry backfill", () => {
    const plan = buildReconcilePlan(
      scan([
        base("epic_owner_foreign", "foreign"),
        base("epic_entry_missing", "entryless"),
      ]),
    );
    expect(plan.records[0]?.actions).toEqual([
      { class: "epic_owner_foreign", action: "report_only" },
    ]);
    expect(plan.records[1]?.actions).toEqual([
      {
        class: "epic_entry_missing",
        action: "backfill_epic_entry_from_fragment",
      },
    ]);
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

  test("includes ordered actions for secondary residue matches", () => {
    const plan = buildReconcilePlan(
      scan([
        {
          ...base("legacy_newer_than_canonical", "legacy"),
          also_matches: ["unmigrated_worktree_marker"],
        },
      ]),
    );
    expect(plan.records[0].actions).toEqual([
      {
        class: "unmigrated_worktree_marker",
        action: "set_marker_auto",
      },
      {
        class: "unmigrated_worktree_marker",
        action: "set_marker_legacy",
      },
      {
        class: "legacy_newer_than_canonical",
        action: "report_only",
      },
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

describe("detectFollowUpRuns", () => {
  const dualResidue = (record_id: string) => ({
    ...base("schema_drift_retired_enum", record_id),
    also_matches: ["unmigrated_artifact_metadata" as const],
  });

  test("announces a second run for records carrying both residue classes", () => {
    const result = detectFollowUpRuns(
      scan([
        base("summary_pointer_missing", "unrelated"),
        dualResidue("dual-one"),
        dualResidue("dual-two"),
      ]),
    );

    expect(result).toBeDefined();
    expect(ReconcileFollowUpRunsSchema.safeParse(result).success).toBe(true);
    expect(result?.reason).toBe("dual_residue_requires_second_run");
    expect(result?.record_ids).toEqual(["dual-one", "dual-two"]);
    expect(result?.message).toMatch(/second/i);
  });

  test("detects the overlap regardless of which class is primary", () => {
    const result = detectFollowUpRuns(
      scan([
        {
          ...base("unmigrated_artifact_metadata", "artifact-primary"),
          also_matches: ["schema_drift_retired_enum" as const],
        },
      ]),
    );

    expect(result?.record_ids).toEqual(["artifact-primary"]);
  });

  test("stays silent when no record carries both residue classes", () => {
    expect(
      detectFollowUpRuns(
        scan([
          base("schema_drift_retired_enum", "schema-only"),
          base("unmigrated_artifact_metadata", "artifact-only"),
          base("healthy", "healthy"),
        ]),
      ),
    ).toBeUndefined();
  });
});
