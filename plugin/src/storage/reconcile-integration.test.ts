import { readFile, rm, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  cleanupTempDir,
  createTempDir,
  parseToolOutput,
} from "../__tests__/setup";
import { ChangeSchema, type Change } from "../types";
import { storeReconcileTools } from "../tools/store-reconcile";
import { commitChangeProjection } from "./change-projection-transaction";
import { createStore } from "./store";
import { getProjectPaths, type ProjectPaths } from "./json";
import { publishSummaryForChange, summaryPaths } from "./change-summary-shard";
import { loadChange } from "./json";
import { buildReconcilePlan, type ReconcilePlan } from "./reconcile-plan";
import { runReconcileApply } from "./reconcile-apply";
import {
  computeReconcileCompletionProof,
  runUnboundedProjectionDivergenceScan,
} from "./reconcile-proof";
import { runStoreResidueScan } from "./store-residue-scan";
import { deriveRunStatus, readReconcileReceipts } from "./reconcile-report";
import { getReconcileAuditPath } from "./reconcile-audit";

const AUTHORITY = {
  kind: "recovery" as const,
  reason: "integration fixture seeding",
  evidence: "reconcile-integration.test.ts",
};

type Fixture = {
  root: string;
  state: string;
  paths: ProjectPaths;
  store: Awaited<ReturnType<typeof createStore>>;
  changes: Record<string, string>;
  baselineEpicIds: string[];
  cleanup: () => Promise<void>;
};

async function mutateChange(
  paths: ProjectPaths,
  changeId: string,
  mutate: (change: Change) => Change,
): Promise<void> {
  const result = await commitChangeProjection({
    changesDir: paths.changes,
    changeId,
    authority: AUTHORITY,
    mutationKind: `integration:seed:${changeId}`,
    mutateLatest: mutate,
    verify: () => true,
  });
  expect(result.kind).toBe("committed");
}

async function readProjection(paths: ProjectPaths, changeId: string) {
  return JSON.parse(
    await readFile(join(paths.changes, changeId, "change.json"), "utf8"),
  ) as Record<string, unknown>;
}

function summaryIndexPaths(paths: ProjectPaths) {
  return { changesDir: paths.changes, summariesDir: paths.summariesDir };
}

async function makeFixture(): Promise<Fixture> {
  const root = await createTempDir("adv-reconcile-integration-");
  const state = join(root, "state");
  const store = await createStore(root, { externalRoot: state });
  const paths = getProjectPaths(root, {}, { externalRoot: state });

  // Pokeedge-shaped baseline: several readable disk Epics survive the pass.
  const baselineEpicIds: string[] = [];
  for (let index = 1; index <= 8; index += 1) {
    const epicId = `fixture-epic-${index}`;
    await store.epics.create(
      epicId,
      `Fixture Epic ${index}`,
      "fixture narrative",
    );
    baselineEpicIds.push(epicId);
  }

  const changes: Record<string, string> = {};
  const createChange = async (
    label: string,
    epicId?: string,
  ): Promise<string> => {
    const result = await store.changes.create(label, {
      initialMetadata: epicId
        ? {
            epic_membership: {
              epic_id: epicId,
              entry_id: `${epicId}-entry-${Object.keys(changes).length}`,
              order: Object.keys(changes).length,
              title: label,
              linked_at: "2026-08-07T00:00:00.000Z",
              epic_project_id: "fixture-project",
              source: "create",
            },
          }
        : undefined,
    });
    changes[label] = result.changeId;
    return result.changeId;
  };

  const enumId = await createChange("Retired Enum Drift");
  const summaryId = await createChange("Missing Summary Pointer");
  const legacyBehindId = await createChange("Legacy Envelope Behind");
  const legacyNewerId = await createChange("Legacy Envelope Newer");
  const artifactId = await createChange("Temporal Artifact Metadata");
  const reconstructedId = await createChange(
    "Missing Epic Owner Child",
    "missing-owner-epic",
  );
  const healthyId = await createChange("Previously Readable Change");
  await mutateChange(paths, reconstructedId, (change) => ({
    ...change,
    worktree_auto_managed: false,
  }));
  const reconstructedLoaded = await loadChange(paths.changes, reconstructedId);
  if (!reconstructedLoaded.success || !reconstructedLoaded.data) {
    throw new Error(`fixture load failed for ${reconstructedId}`);
  }
  await publishSummaryForChange(
    summaryIndexPaths(paths),
    reconstructedLoaded.data,
  );

  // The raw retired-enum bytes are deliberate residue evidence. The fixture is
  // seeded after the disk-store scaffold; it never calls the forbidden saveChange.
  const enumProjection = await readProjection(paths, enumId);
  enumProjection.test_runs = {
    "fixture-task": [
      {
        runId: "fixture-run",
        exitCode: 0,
        classification: "pass",
        command: "fixture",
        durationMs: 1,
        evidence_kind: "build_worker",
        recordedAt: "2026-08-07T00:00:00.000Z",
      },
    ],
  };
  await writeFile(
    join(paths.changes, enumId, "change.json"),
    JSON.stringify(enumProjection, null, 2),
  );

  // A valid temporal metadata record also points at an absent artifact. This
  // exercises both migration residue and missing-artifact classification.
  const artifactProjection = await readProjection(paths, artifactId);
  artifactProjection.artifacts = {
    build: { source: "temporal", path: "artifacts/missing-build.json" },
  };
  await writeFile(
    join(paths.changes, artifactId, "change.json"),
    JSON.stringify(artifactProjection, null, 2),
  );

  const summaryPointer = summaryPaths(
    summaryIndexPaths(paths),
    summaryId,
  ).pointerPath;
  await rm(summaryPointer, { force: true });

  // Force the canonical projection ahead of each legacy envelope, then seed
  // both directions of the legacy/canonical divergence.
  await mutateChange(paths, legacyBehindId, (change) => ({
    ...change,
    title: "Legacy Envelope Behind (canonical)",
  }));
  await mutateChange(paths, legacyNewerId, (change) => ({
    ...change,
    title: "Legacy Envelope Newer (canonical)",
  }));
  for (const changeId of [legacyBehindId, legacyNewerId]) {
    const canonical = await readProjection(paths, changeId);
    const loaded = await loadChange(paths.changes, changeId);
    if (!loaded.success || !loaded.data)
      throw new Error(`fixture load failed for ${changeId}`);
    await publishSummaryForChange(summaryIndexPaths(paths), loaded.data);
    await writeFile(
      join(paths.changes, `${changeId}.json`),
      JSON.stringify(
        { state: { ...canonical, projection_revision: 0 } },
        null,
        2,
      ),
    );
  }
  const newerCanonical = await readProjection(paths, legacyNewerId);
  await writeFile(
    join(paths.changes, `${legacyNewerId}.json`),
    JSON.stringify(
      { state: { ...newerCanonical, projection_revision: 99 } },
      null,
      2,
    ),
  );

  // One quarantined, cleanly mappable record and one formally residual record.
  const quarantinedId = "optimizeArchitectureTestSuite";
  const quarantinedSource = await readProjection(paths, healthyId);
  quarantinedSource.id = quarantinedId;
  quarantinedSource.test_runs = {
    "fixture-task": [
      {
        runId: "quarantined-run",
        exitCode: 0,
        classification: "pass",
        command: "fixture",
        durationMs: 1,
        evidence_kind: "replay_determinism",
        recordedAt: "2026-08-07T00:00:00.000Z",
      },
    ],
  };
  const quarantinedDir = join(paths.quarantineChanges, quarantinedId, "run-1");
  await mkdir(quarantinedDir, { recursive: true });
  await writeFile(
    join(quarantinedDir, "change.json"),
    JSON.stringify(quarantinedSource, null, 2),
  );
  const residualDir = join(
    paths.quarantineChanges,
    "unmappableFixture",
    "run-1",
  );
  await mkdir(residualDir, { recursive: true });
  await writeFile(
    join(residualDir, "change.json"),
    JSON.stringify(
      { ...quarantinedSource, id: "unmappableFixture", status: "not-a-status" },
      null,
      2,
    ),
  );

  await writeFile(join(state, "unknown-store-noise.tmp"), "noise\n");

  return {
    root,
    state,
    paths,
    store,
    changes,
    baselineEpicIds,
    cleanup: () => cleanupTempDir(root),
  };
}

async function scanAndPlan(paths: ProjectPaths): Promise<{
  scan: Awaited<ReturnType<typeof runStoreResidueScan>>;
  plan: ReconcilePlan;
}> {
  const scan = await runStoreResidueScan({ paths });
  return { scan, plan: buildReconcilePlan(scan) };
}

describe("store reconciliation integration", () => {
  test("backfills entry membership with dry-run and apply plan-hash parity", async () => {
    const root = await createTempDir("adv-reconcile-backfill-");
    const state = join(root, "state");
    try {
      const store = await createStore(root, { externalRoot: state });
      const paths = getProjectPaths(root, {}, { externalRoot: state });
      await store.epics.create("backfill-epic", "Backfill Epic", "fixture");
      const created = await store.changes.create("Backfill child");
      await mutateChange(paths, created.changeId, (change) => ({
        ...change,
        worktree_auto_managed: false,
        epic_membership: {
          epic_id: "backfill-epic",
          entry_id: "backfill-entry",
          order: 3,
          title: "Backfill child",
          linked_at: "2026-08-07T00:00:00.000Z",
          source: "create",
        },
      }));
      const loaded = await loadChange(paths.changes, created.changeId);
      if (!loaded.success || !loaded.data) throw new Error("child missing");
      await publishSummaryForChange(summaryIndexPaths(paths), loaded.data);

      const scan = await runStoreResidueScan({
        paths,
        localProjectId: "fixture-project",
      });
      const plan = buildReconcilePlan(scan);
      expect(
        plan.records.some(
          (record) =>
            record.record_id === created.changeId &&
            record.class === "epic_entry_missing",
        ),
      ).toBe(true);
      const dryRun = parseToolOutput<Record<string, unknown>>(
        await storeReconcileTools.adv_store_reconcile.execute(
          { mode: "dry_run" },
          store,
        ),
      );
      expect(dryRun.plan_hash).toBe(plan.plan_hash);

      const report = await runReconcileApply({
        storePaths: paths,
        plan,
        planHash: plan.plan_hash,
        confirmPlanHash: plan.plan_hash,
        mode: "apply",
        deps: {
          localProjectId: "fixture-project",
          runId: () => "backfill-run",
        },
      });
      expect(
        report.records.find((record) => record.record_id === created.changeId),
      ).toMatchObject({
        action: "backfill_epic_entry_from_fragment",
        status: "mutated",
      });
      const epic = await store.epics.get("backfill-epic");
      expect(epic).toMatchObject({
        success: true,
        data: {
          entries: [
            expect.objectContaining({
              entry_id: "backfill-entry",
              change_id: created.changeId,
              linked_at: "2026-08-07T00:00:00.000Z",
            }),
          ],
        },
      });
    } finally {
      await cleanupTempDir(root);
    }
  }, 55_000);

  test("runs a pokeedge-shaped scan, approval, apply, receipts, audit, and proof", async () => {
    const fixture = await makeFixture();
    try {
      const beforeCanonical = await readFile(
        join(
          fixture.paths.changes,
          fixture.changes["Previously Readable Change"],
          "change.json",
        ),
      );
      const beforeNewerCanonical = await readFile(
        join(
          fixture.paths.changes,
          `${fixture.changes["Legacy Envelope Newer"]}.json`,
        ),
      );
      const { scan, plan } = await scanAndPlan(fixture.paths);

      expect(scan.counters.schema_drift_retired_enum).toBeGreaterThan(0);
      expect(scan.counters.summary_pointer_missing).toBeGreaterThan(0);
      expect(scan.counters.legacy_divergent_behind).toBeGreaterThan(0);
      expect(scan.counters.legacy_newer_than_canonical).toBeGreaterThan(0);
      expect(scan.counters.unmigrated_artifact_metadata).toBeGreaterThan(0);
      expect(scan.counters.unmigrated_worktree_marker).toBeGreaterThan(0);
      expect(scan.counters.epic_owner_missing).toBeGreaterThan(0);
      expect(scan.counters.quarantined_record).toBeGreaterThan(0);
      expect(scan.counters.unknown_store_noise).toBeGreaterThan(0);
      expect(
        scan.records.some((record) =>
          record.evidence.some((evidence) =>
            evidence.includes("artifact build missing"),
          ),
        ),
      ).toBe(true);
      expect(plan.plan_hash).toBe(buildReconcilePlan(scan).plan_hash);

      // Host-tool plan/dry_run parity is exercised against the same real store.
      const dryRun = parseToolOutput<Record<string, unknown>>(
        await storeReconcileTools.adv_store_reconcile.execute(
          { mode: "dry_run" },
          fixture.store,
        ),
      );
      expect(dryRun).toMatchObject({
        ok: true,
        mode: "dry_run",
        zero_mutations: true,
      });
      expect(dryRun.plan_hash).toBe(plan.plan_hash);
      expect(
        await readFile(
          join(
            fixture.paths.changes,
            fixture.changes["Previously Readable Change"],
            "change.json",
          ),
        ),
      ).toEqual(beforeCanonical);

      const beforeDivergences = await runUnboundedProjectionDivergenceScan(
        summaryIndexPaths(fixture.paths),
      );
      const report = await runReconcileApply({
        storePaths: fixture.paths,
        plan,
        planHash: plan.plan_hash,
        confirmPlanHash: plan.plan_hash,
        mode: "apply",
        deps: { runId: () => "integration-run-1" },
      });

      expect(report.mode).toBe("execute");
      expect(report.interrupted).toBe(false);
      expect(report.records.length).toBe(plan.records.length);
      expect(report.proof).toMatchObject({
        before_divergence_count: expect.any(Number),
        after_divergence_count: expect.any(Number),
        before: { budget_exceeded: false },
        after: { budget_exceeded: false, omitted: 0, truncated: false },
      });
      const applyFailures = report.records.filter(
        (record) => record.status === "failed",
      );

      const runDir = join(fixture.paths.reconcileDir, "runs", report.run_id);
      const receipts = await readReconcileReceipts(runDir);
      expect(receipts).toHaveLength(report.records.length);
      expect((await deriveRunStatus(runDir)).interrupted).toBe(false);
      const progress = JSON.parse(
        await readFile(join(runDir, "progress.json"), "utf8"),
      ) as { run_id: string; applied: string[] };
      expect(progress).toMatchObject({ run_id: report.run_id });
      expect(progress.applied).toHaveLength(receipts.length);
      expect(
        (
          await stat(
            getReconcileAuditPath(join(fixture.paths.reconcileDir, "audit")),
          )
        ).isFile(),
      ).toBe(true);

      const proof = await computeReconcileCompletionProof({
        paths: summaryIndexPaths(fixture.paths),
        before: beforeDivergences,
      });
      expect(proof.after.truncated).toBe(false);
      expect(proof.after.omitted).toBe(0);
      expect(proof.after.budget_exceeded).toBe(false);

      const restoredEpic = await fixture.store.epics.get("missing-owner-epic");
      expect(restoredEpic.success).toBe(true);
      const reconstruction = restoredEpic.data?.reconstruction;
      if (reconstruction) {
        expect(reconstruction).toMatchObject({
          reconstructed: true,
          source: "child_epic_membership_fragments",
        });
        expect(reconstruction.gap_flags).toEqual(
          expect.arrayContaining(["narrative", "metadata"]),
        );
      }
      expect(
        ChangeSchema.safeParse(
          await readProjection(
            fixture.paths,
            fixture.changes["Missing Epic Owner Child"],
          ),
        ),
      ).toMatchObject({ success: true });
      expect(
        await readFile(
          join(
            fixture.paths.changes,
            `${fixture.changes["Legacy Envelope Newer"]}.json`,
          ),
        ),
      ).toEqual(beforeNewerCanonical);
      const advancedLegacy = JSON.parse(
        await readFile(
          join(
            fixture.paths.changes,
            `${fixture.changes["Legacy Envelope Behind"]}.json`,
          ),
          "utf8",
        ),
      ) as { state?: { projection_revision?: number } };
      expect(advancedLegacy.state?.projection_revision).toBeGreaterThan(0);
      expect(fixture.baselineEpicIds).toHaveLength(8);
      for (const epicId of fixture.baselineEpicIds) {
        expect((await fixture.store.epics.get(epicId)).success).toBe(true);
      }
      const afterScan = await runStoreResidueScan({ paths: fixture.paths });
      let migrationMarker: Record<string, unknown> | null = null;
      try {
        migrationMarker = JSON.parse(
          await readFile(fixture.paths.artifactMetadataMigrationMarker, "utf8"),
        ) as Record<string, unknown>;
      } catch {
        migrationMarker = null;
      }
      // The final assertions intentionally remain contract assertions: a
      // failure here is an engine finding, not a test-side fallback.
      const enumReadable = ChangeSchema.safeParse(
        await readProjection(
          fixture.paths,
          fixture.changes["Retired Enum Drift"],
        ),
      ).success;
      expect({
        reconstructed: Boolean(reconstruction),
        enumReadable,
        proofClean: proof.after_divergence_count === 0 && proof.complete,
        migrationClean:
          afterScan.counters.unmigrated_worktree_marker === 0 &&
          migrationMarker?.version === 1,
        applyFailures,
      }).toEqual({
        reconstructed: true,
        enumReadable: true,
        proofClean: true,
        migrationClean: true,
        applyFailures: [],
      });
    } finally {
      await fixture.cleanup();
    }
  }, 55_000);

  test("refuses stale plans and live worker locks without mutation", async () => {
    const fixture = await makeFixture();
    try {
      const initial = await scanAndPlan(fixture.paths);
      await mutateChange(
        fixture.paths,
        fixture.changes["Previously Readable Change"],
        (change) => ({ ...change, title: "Changed after plan" }),
      );
      await expect(
        runReconcileApply({
          storePaths: fixture.paths,
          plan: initial.plan,
          planHash: initial.plan.plan_hash,
          confirmPlanHash: initial.plan.plan_hash,
          mode: "apply",
        }),
      ).rejects.toMatchObject({ error_class: "stale_plan", exit_code: 6 });

      await writeFile(
        join(fixture.state, "worker.lock"),
        JSON.stringify({ pid: process.pid }),
      );
      const fresh = await scanAndPlan(fixture.paths);
      const before = await readFile(
        join(
          fixture.paths.changes,
          fixture.changes["Previously Readable Change"],
          "change.json",
        ),
      );
      await expect(
        runReconcileApply({
          storePaths: fixture.paths,
          plan: fresh.plan,
          planHash: fresh.plan.plan_hash,
          confirmPlanHash: fresh.plan.plan_hash,
          mode: "apply",
        }),
      ).rejects.toMatchObject({
        error_class: "worker_lock_live",
        exit_code: 4,
      });
      expect(
        await readFile(
          join(
            fixture.paths.changes,
            fixture.changes["Previously Readable Change"],
            "change.json",
          ),
        ),
      ).toEqual(before);
      expect(await stat(join(fixture.state, "worker.lock"))).toBeDefined();

      const dryRun = parseToolOutput<Record<string, unknown>>(
        await storeReconcileTools.adv_store_reconcile.execute(
          { mode: "dry_run" },
          fixture.store,
        ),
      );
      expect(dryRun).toMatchObject({
        ok: true,
        mode: "dry_run",
        zero_mutations: true,
      });
    } finally {
      await fixture.cleanup();
    }
  }, 55_000);

  test("host handler applies exactly the approved plan and a replay is non-mutating", async () => {
    const fixture = await makeFixture();
    try {
      // Use a compact fixture slice for the host-level parity assertion; the
      // handler still performs a fresh scan and dispatches real executors.
      for (const changeId of [
        fixture.changes["Retired Enum Drift"],
        fixture.changes["Temporal Artifact Metadata"],
        fixture.changes["Missing Epic Owner Child"],
      ]) {
        await rm(join(fixture.paths.changes, changeId), {
          recursive: true,
          force: true,
        });
      }
      await mutateChange(
        fixture.paths,
        fixture.changes["Missing Summary Pointer"],
        (change) => ({ ...change, worktree_auto_managed: false }),
      );
      await rm(
        summaryPaths(
          summaryIndexPaths(fixture.paths),
          fixture.changes["Missing Summary Pointer"],
        ).pointerPath,
        { force: true },
      );
      await rm(fixture.paths.quarantineChanges, {
        recursive: true,
        force: true,
      });
      await rm(join(fixture.state, "unknown-store-noise.tmp"), { force: true });
      for (const changeId of [
        fixture.changes["Legacy Envelope Behind"],
        fixture.changes["Legacy Envelope Newer"],
      ]) {
        await rm(join(fixture.paths.changes, `${changeId}.json`), {
          force: true,
        });
      }
      const planOutput = parseToolOutput<Record<string, unknown>>(
        await storeReconcileTools.adv_store_reconcile.execute(
          { mode: "plan" },
          fixture.store,
        ),
      );
      expect(planOutput).toMatchObject({ ok: true, mode: "plan" });
      const planHash = planOutput.plan_hash;
      expect(typeof planHash).toBe("string");

      const applied = parseToolOutput<Record<string, unknown>>(
        await storeReconcileTools.adv_store_reconcile.execute(
          { mode: "apply", confirm_plan_hash: planHash as string },
          fixture.store,
        ),
      );
      expect(applied).toMatchObject({
        ok: true,
        mode: "apply",
        plan_hash: planHash,
      });
      const report = applied.report as {
        counters: { mutated: number; failed: number };
      };
      expect(report.counters.failed).toBe(0);
      expect(report.counters.mutated).toBeGreaterThan(0);
      const failedRecords = (
        applied.report as { records: Array<Record<string, unknown>> }
      ).records.filter((record) => record.status === "failed");

      const replayPlan = await scanAndPlan(fixture.paths);
      const residualRecords = replayPlan.plan.records.filter(
        (record) => record.class !== "healthy",
      );
      const replay = parseToolOutput<Record<string, unknown>>(
        await storeReconcileTools.adv_store_reconcile.execute(
          { mode: "apply", confirm_plan_hash: replayPlan.plan.plan_hash },
          fixture.store,
        ),
      );
      expect(replay).toMatchObject({ ok: true, mode: "apply" });
      const replayMutated = (replay.report as { counters: { mutated: number } })
        .counters.mutated;
      if (residualRecords.length > 0) {
        throw new Error(
          `host replay residuals: ${JSON.stringify(residualRecords)}`,
        );
      }
      expect(residualRecords).toHaveLength(0);
      expect(failedRecords).toHaveLength(0);
      expect(replayMutated).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  }, 55_000);
});
