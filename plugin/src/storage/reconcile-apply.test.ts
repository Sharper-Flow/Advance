import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, test, vi } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import { getProjectPaths } from "./json";
import { buildReconcilePlan, type StoreResidueScan } from "./reconcile-plan";
import { reconcileExitCode, runReconcileApply } from "./reconcile-apply";
import type { ActionOutcome } from "./reconcile-action-types";

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

function scanFor(records: StoreResidueScan["records"]): StoreResidueScan {
  return {
    schema_version: 1,
    records,
    counters: Object.fromEntries(
      classes.map((name) => [name, 0]),
    ) as StoreResidueScan["counters"],
    scanned: records.length,
    omitted: 0,
    truncated: false,
    budget_exceeded: false,
  };
}

function residue(
  record_id: string,
  className:
    | "unknown_store_noise"
    | "epic_owner_missing" = "unknown_store_noise",
) {
  return {
    record_id,
    source_path: `/fixture/${record_id}`,
    class: className,
    also_matches: [],
    evidence: ["fixture"],
  };
}

async function fixture() {
  const root = await createTempDir("adv-reconcile-apply-");
  const paths = getProjectPaths(root);
  return { root, paths, cleanup: () => cleanupTempDir(root) };
}

describe("reconcile apply", () => {
  test("refuses live worker.lock before mutation", async () => {
    const data = await fixture();
    try {
      const scan = scanFor([residue("noise")]);
      const plan = buildReconcilePlan(scan);
      await mkdir(dirname(data.paths.changes), { recursive: true });
      await writeFile(
        join(dirname(data.paths.changes), "worker.lock"),
        JSON.stringify({ pid: process.pid }),
      );
      await expect(
        runReconcileApply({
          storePaths: data.paths,
          plan,
          planHash: plan.plan_hash,
          confirmPlanHash: plan.plan_hash,
          mode: "apply",
          deps: { scan: async () => scan },
        }),
      ).rejects.toMatchObject({
        error_class: "worker_lock_live",
        exit_code: 4,
      });
      await expect(
        stat(join(dirname(data.paths.changes), "worker.lock")),
      ).resolves.toBeDefined();
    } finally {
      await data.cleanup();
    }
  });

  test("refuses stale plan hash before mutation", async () => {
    const data = await fixture();
    try {
      const scan = scanFor([residue("noise")]);
      const plan = buildReconcilePlan(scan);
      await expect(
        runReconcileApply({
          storePaths: data.paths,
          plan,
          planHash: "0".repeat(64),
          confirmPlanHash: "0".repeat(64),
          mode: "apply",
          deps: { scan: async () => scan },
        }),
      ).rejects.toMatchObject({ error_class: "stale_plan", exit_code: 6 });
    } finally {
      await data.cleanup();
    }
  });

  test("refuses reconcile lock contention with a typed error", async () => {
    const data = await fixture();
    try {
      const scan = scanFor([residue("noise")]);
      const plan = buildReconcilePlan(scan);
      await mkdir(data.paths.changes, { recursive: true });
      await writeFile(
        join(data.paths.changes, ".reconcile.lock"),
        `${process.pid}\n${Date.now()}`,
      );
      await expect(
        runReconcileApply({
          storePaths: data.paths,
          plan,
          planHash: plan.plan_hash,
          confirmPlanHash: plan.plan_hash,
          mode: "apply",
          deps: { scan: async () => scan },
        }),
      ).rejects.toMatchObject({
        error_class: "reconcile_lock_contention",
        exit_code: 4,
      });
    } finally {
      await data.cleanup();
    }
  });

  test("per-record executor failure writes a failed receipt and continues", async () => {
    const data = await fixture();
    try {
      const scan = scanFor([residue("first"), residue("second")]);
      const plan = buildReconcilePlan(scan);
      const calls: string[] = [];
      const executor = vi.fn(async (record): Promise<ActionOutcome> => {
        calls.push(record.record_id);
        return record.record_id === "first"
          ? { status: "failed", error_class: "fixture_failure" }
          : { status: "skipped" };
      });
      const report = await runReconcileApply({
        storePaths: data.paths,
        plan,
        planHash: plan.plan_hash,
        confirmPlanHash: plan.plan_hash,
        mode: "apply",
        deps: {
          scan: async () => scan,
          actionExecutors: { quarantine_to_trash: executor },
        },
      });
      expect(calls).toEqual(["first", "second"]);
      expect(report.counters.failed).toBe(1);
      expect(report.counters.skipped).toBe(1);
    } finally {
      await data.cleanup();
    }
  });

  test("resume skips completed receipts without repeating executor calls", async () => {
    const data = await fixture();
    try {
      const scan = scanFor([residue("first"), residue("second")]);
      const plan = buildReconcilePlan(scan);
      const calls: string[] = [];
      const executor = vi.fn(async (record): Promise<ActionOutcome> => {
        calls.push(record.record_id);
        return { status: "skipped" };
      });
      const first = await runReconcileApply({
        storePaths: data.paths,
        plan,
        planHash: plan.plan_hash,
        confirmPlanHash: plan.plan_hash,
        mode: "apply",
        deps: {
          scan: async () => scan,
          actionExecutors: { quarantine_to_trash: executor },
        },
      });
      calls.length = 0;
      await runReconcileApply({
        storePaths: data.paths,
        plan,
        planHash: plan.plan_hash,
        confirmPlanHash: plan.plan_hash,
        mode: "apply",
        resumeFromRunId: first.run_id,
        deps: {
          scan: async () => scan,
          actionExecutors: { quarantine_to_trash: executor },
        },
      });
      expect(calls).toEqual([]);
    } finally {
      await data.cleanup();
    }
  });

  test("resume retries failed receipts instead of skipping them", async () => {
    const data = await fixture();
    try {
      const scan = scanFor([residue("failed-first")]);
      const plan = buildReconcilePlan(scan);
      const calls: string[] = [];
      let attempt = 0;
      const executor = vi.fn(async (record): Promise<ActionOutcome> => {
        calls.push(record.record_id);
        attempt += 1;
        return attempt === 1
          ? { status: "failed", error_class: "fixture_failure" }
          : { status: "skipped" };
      });
      const first = await runReconcileApply({
        storePaths: data.paths,
        plan,
        planHash: plan.plan_hash,
        confirmPlanHash: plan.plan_hash,
        mode: "apply",
        deps: {
          scan: async () => scan,
          actionExecutors: { quarantine_to_trash: executor },
        },
      });
      expect(first.counters.failed).toBe(1);

      calls.length = 0;
      const resumed = await runReconcileApply({
        storePaths: data.paths,
        plan,
        planHash: plan.plan_hash,
        confirmPlanHash: plan.plan_hash,
        mode: "apply",
        resumeFromRunId: first.run_id,
        deps: {
          scan: async () => scan,
          actionExecutors: { quarantine_to_trash: executor },
        },
      });
      expect(calls).toEqual(["failed-first"]);
      expect(resumed.counters.failed).toBe(0);
    } finally {
      await data.cleanup();
    }
  });

  test("budget-limited apply executes the bounded page before continuation", async () => {
    const data = await fixture();
    try {
      const scan = {
        ...scanFor([residue("budget-first"), residue("budget-second")]),
        omitted: 1,
        truncated: true,
        budget_exceeded: true,
        continuation_cursor: "budget-second",
      };
      const plan = buildReconcilePlan(scan);
      const calls: string[] = [];
      const executor = vi.fn(async (record): Promise<ActionOutcome> => {
        calls.push(record.record_id);
        return { status: "mutated" };
      });
      const firstOutcome = await runReconcileApply({
        storePaths: data.paths,
        plan,
        planHash: plan.plan_hash,
        confirmPlanHash: plan.plan_hash,
        mode: "apply",
        deps: {
          scan: async () => scan,
          runId: () => "budget-run",
          actionExecutors: { quarantine_to_trash: executor },
        },
      }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(firstOutcome).toMatchObject({
        error_class: "budget_exceeded",
        continuation_cursor: "budget-second",
        resume_from: "budget-run",
        report: {
          interrupted: true,
          continuation_cursor: "budget-second",
          counters: { mutated: 2 },
        },
      });
      expect(calls).toEqual(["budget-first", "budget-second"]);

      const remainingScan = scanFor([residue("budget-third")]);
      const remainingPlan = buildReconcilePlan(remainingScan);
      calls.length = 0;
      const resumed = await runReconcileApply({
        storePaths: data.paths,
        plan: remainingPlan,
        planHash: remainingPlan.plan_hash,
        confirmPlanHash: remainingPlan.plan_hash,
        mode: "apply",
        resumeFromRunId: "budget-run",
        deps: {
          scan: async (_paths, options) => {
            expect(options?.resumeAfter).toBe("budget-second");
            return remainingScan;
          },
          actionExecutors: { quarantine_to_trash: executor },
        },
      });
      expect(calls).toEqual(["budget-third"]);
      expect(resumed.interrupted).toBe(false);
      expect(resumed.records.map((record) => record.record_id)).toEqual([
        "budget-third",
      ]);
    } finally {
      await data.cleanup();
    }
  });

  test("runs completion proof at apply end and preserves proof failure", async () => {
    const data = await fixture();
    try {
      const scan = scanFor([residue("proof-record")]);
      const plan = buildReconcilePlan(scan);
      const proof = {
        schema_version: 1,
        status: "error",
        complete: false,
        before: {
          divergences: [],
          divergence_count: 0,
          scanned: 0,
          omitted: 0,
          truncated: false,
          budget_exceeded: false,
        },
        after: {
          divergences: [],
          divergence_count: 0,
          scanned: 0,
          omitted: 0,
          truncated: false,
          budget_exceeded: false,
          scan_error: "disk read failed",
        },
        before_divergence_count: 0,
        after_divergence_count: 0,
        whitelisted_divergence_count: 0,
        residual_divergences: [],
        documented_whitelist: [],
        error: "after proof scan failed: disk read failed",
      } as never;
      let proofBefore: unknown;
      const report = await runReconcileApply({
        storePaths: data.paths,
        plan,
        planHash: plan.plan_hash,
        confirmPlanHash: plan.plan_hash,
        mode: "apply",
        deps: {
          scan: async () => scan,
          actionExecutors: {
            quarantine_to_trash: async (): Promise<ActionOutcome> => ({
              status: "skipped",
            }),
          },
          completionProof: async (_paths, before) => {
            proofBefore = before;
            return proof;
          },
        },
      });
      expect(report.proof).toBe(proof);
      expect(report.proof?.complete).toBe(false);
      expect(reconcileExitCode(report)).toBe(5);
      expect(proofBefore).toMatchObject({
        truncated: false,
        budgetExceeded: false,
      });
    } finally {
      await data.cleanup();
    }
  });

  test("AC4: the run report announces that a second run is required", async () => {
    const data = await fixture();
    try {
      const scan = scanFor([
        {
          record_id: "dual-residue",
          source_path: "/fixture/dual-residue",
          class: "schema_drift_retired_enum" as const,
          also_matches: ["unmigrated_artifact_metadata" as const],
          evidence: ["fixture"],
        },
      ]);
      const plan = buildReconcilePlan(scan);
      const report = await runReconcileApply({
        storePaths: data.paths,
        plan,
        planHash: plan.plan_hash,
        confirmPlanHash: plan.plan_hash,
        mode: "apply",
        deps: {
          scan: async () => scan,
          actionExecutors: {
            normalize_enum_mapping: async (): Promise<ActionOutcome> => ({
              status: "skipped",
            }),
            quarantine_record: async (): Promise<ActionOutcome> => ({
              status: "skipped",
            }),
          },
        },
      });

      expect(report.follow_up_runs_required).toBeDefined();
      expect(report.follow_up_runs_required?.reason).toBe(
        "dual_residue_requires_second_run",
      );
      expect(report.follow_up_runs_required?.record_ids).toEqual([
        "dual-residue",
      ]);
    } finally {
      await data.cleanup();
    }
  });

  test("corrupt migration input aborts before mutation", async () => {
    const data = await fixture();
    try {
      const scan = scanFor([residue("noise")]);
      const plan = buildReconcilePlan(scan);
      await mkdir(dirname(data.paths.artifactMetadataMigrationMarker), {
        recursive: true,
      });
      await writeFile(data.paths.artifactMetadataMigrationMarker, "corrupt");
      await expect(
        runReconcileApply({
          storePaths: data.paths,
          plan,
          planHash: plan.plan_hash,
          confirmPlanHash: plan.plan_hash,
          mode: "apply",
          deps: { scan: async () => scan },
        }),
      ).rejects.toMatchObject({ error_class: "corrupt_input", exit_code: 3 });
    } finally {
      await data.cleanup();
    }
  });
});
