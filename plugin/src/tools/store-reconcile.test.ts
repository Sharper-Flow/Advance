import { describe, expect, test, vi } from "vitest";

const reconcileApplyMock = vi.hoisted(() => ({
  runReconcileApply: vi.fn(),
}));
const residueScanMock = vi.hoisted(() => ({
  runStoreResidueScan: vi.fn(),
}));

vi.mock("../storage/reconcile-apply", async () => {
  const actual = await vi.importActual<
    typeof import("../storage/reconcile-apply")
  >("../storage/reconcile-apply");
  return { ...actual, runReconcileApply: reconcileApplyMock.runReconcileApply };
});

vi.mock("../storage/store-residue-scan", async () => {
  const actual = await vi.importActual<
    typeof import("../storage/store-residue-scan")
  >("../storage/store-residue-scan");
  return {
    ...actual,
    runStoreResidueScan: residueScanMock.runStoreResidueScan,
  };
});

import { ReconcileRefusalError } from "../storage/reconcile-apply";
import { buildReconcilePlan } from "../storage/reconcile-plan";
import { storeReconcileTools } from "./store-reconcile";

const scan = {
  schema_version: 1 as const,
  records: [],
  counters: {
    schema_drift_retired_enum: 0,
    summary_pointer_missing: 0,
    summary_pointer_stale: 0,
    legacy_divergent_behind: 0,
    legacy_newer_than_canonical: 0,
    unmigrated_artifact_metadata: 0,
    unmigrated_worktree_marker: 0,
    epic_owner_missing: 0,
    quarantined_record: 0,
    unknown_store_noise: 0,
    store_artifact_missing: 0,
    healthy: 0,
  },
  scanned: 0,
  omitted: 0,
  truncated: false,
  budget_exceeded: false,
};

const store = {
  paths: {
    root: "/repo",
    changes: "/state/changes",
    reconcileDir: "/state/.reconcile",
    artifactMetadataMigrationMarker: "/state/migration.json",
    quarantineChanges: "/state/.adv/quarantine/changes",
    activeEpics: "/state/active-epics",
  },
} as never;

function parseOutput(output: string): Record<string, unknown> {
  return JSON.parse(output) as Record<string, unknown>;
}

describe("adv_store_reconcile", () => {
  residueScanMock.runStoreResidueScan.mockResolvedValue(scan);

  test("plan mode scans and returns the complete dry-run plan with plan_hash", async () => {
    const result = await storeReconcileTools.adv_store_reconcile.execute(
      { mode: "plan" },
      store,
    );
    const output = parseOutput(result);

    expect(output).toMatchObject({
      ok: true,
      mode: "plan",
      plan: buildReconcilePlan(scan),
      zero_mutations: true,
    });
  });

  test("apply mode requires a matching plan hash and delegates to the engine", async () => {
    const plan = buildReconcilePlan(scan);
    const report = {
      schema_version: 1,
      run_id: "reconcile-test",
      mode: "execute",
      started_at: "2026-08-07T00:00:00.000Z",
      finished_at: "2026-08-07T00:00:01.000Z",
      interrupted: false,
      records: [],
      counters: { mutated: 0, skipped: 0, failed: 0 },
      residuals: [],
      proof: { complete: true },
    };

    reconcileApplyMock.runReconcileApply.mockResolvedValueOnce(report);

    const result = await storeReconcileTools.adv_store_reconcile.execute(
      {
        mode: "apply",
        confirm_plan_hash: plan.plan_hash,
      },
      store,
    );
    const output = parseOutput(result);

    expect(output).toMatchObject({ ok: true, mode: "apply", report });
  });

  test("apply surfaces a budget continuation after the page has mutated", async () => {
    const plan = buildReconcilePlan(scan);
    const report = {
      schema_version: 1,
      run_id: "reconcile-budget",
      mode: "execute",
      started_at: "2026-08-07T00:00:00.000Z",
      finished_at: "2026-08-07T00:00:01.000Z",
      interrupted: true,
      records: [],
      counters: { mutated: 2, skipped: 0, failed: 0 },
      residuals: ["page complete"],
      continuation_cursor: "record-2",
    };
    reconcileApplyMock.runReconcileApply.mockRejectedValueOnce(
      new ReconcileRefusalError("budget_exceeded", "resume required", {
        resume_from: report.run_id,
        continuation_cursor: report.continuation_cursor,
        report,
      }),
    );

    const result = await storeReconcileTools.adv_store_reconcile.execute(
      {
        mode: "apply",
        confirm_plan_hash: plan.plan_hash,
      },
      store,
    );
    const output = parseOutput(result);

    expect(output).toMatchObject({
      ok: false,
      error_class: "budget_exceeded",
      continuation_cursor: "record-2",
      resume_from: "reconcile-budget",
      report,
      zero_mutations: false,
    });
  });
});
