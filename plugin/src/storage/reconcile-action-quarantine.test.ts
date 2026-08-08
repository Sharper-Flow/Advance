import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  cleanupTempDir,
  createTempDir,
  SAMPLE_CHANGE,
} from "../__tests__/setup";
import { ChangeSchema } from "../types";
import { getProjectPaths, type ProjectPaths } from "./json";
import type { ActionContext } from "./reconcile-action-types";
import type { ReconcileAction, ReconcilePlanRecord } from "./reconcile-plan";
import {
  normalizeAndRestoreExecutor,
  quarantineToTrashExecutor,
  remainQuarantinedReportedExecutor,
} from "./reconcile-action-quarantine";

const tempDirs: string[] = [];
const CHANGE_ID = "optimizeArchitectureTestSuite";

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
});

function record(
  sourcePath: string,
  action: ReconcileAction["action"],
  className: ReconcilePlanRecord["class"] = "quarantined_record",
): ReconcilePlanRecord {
  return {
    record_id:
      className === "quarantined_record"
        ? `quarantine:${CHANGE_ID}`
        : "noise:worker.lock",
    source_path: sourcePath,
    class: className,
    evidence: ["fixture"],
    actions: [{ class: className, action } as ReconcileAction],
  } as ReconcilePlanRecord;
}

function context(paths: ProjectPaths) {
  const before: Array<{ id: string; bytes: Uint8Array | string }> = [];
  const ctx: ActionContext = {
    storePaths: paths,
    locksHeld: [],
    runId: "reconcile-quarantine-test",
    writeBeforeState: async (id, bytes) => {
      before.push({ id, bytes });
      return join(paths.reconcileDir, "before", `${id}.bin`);
    },
    auditWriter: async () => undefined,
    coordinateChangeMutation: async () => ({
      kind: "operator_required" as const,
      reason: "quarantined records must use the restore path",
    }),
    saveEpicOptimistic: async () => ({ status: "skipped" as const }),
  };
  return { ctx, before };
}

async function fixture(raw: Record<string, unknown>) {
  const root = await createTempDir("reconcile-action-quarantine-");
  tempDirs.push(root);
  const paths = getProjectPaths(
    root,
    {},
    { externalRoot: join(root, "state") },
  );
  const quarantineDir = join(
    paths.quarantineChanges,
    CHANGE_ID,
    "2026-08-07T00-00-00-000Z",
  );
  const sourcePath = join(quarantineDir, "change.json");
  await mkdir(quarantineDir, { recursive: true });
  const before = JSON.stringify(raw, null, 2);
  await writeFile(sourcePath, before, "utf8");
  return { paths, sourcePath, originalBytes: before, ...context(paths) };
}

describe("quarantine reconcile action executors", () => {
  test.each(["build_worker", "replay_determinism"] as const)(
    "normalizes %s and restores the quarantined record",
    async (retiredValue) => {
      const change = {
        ...ChangeSchema.parse({
          ...SAMPLE_CHANGE,
          id: CHANGE_ID,
          status: "draft",
        }),
        test_runs: {
          "tk-test0001": [
            {
              runId: "run-1",
              exitCode: 0,
              classification: "pass",
              command: "test",
              durationMs: 1,
              evidence_kind: retiredValue,
              recordedAt: "2026-08-07T00:00:00Z",
            },
          ],
        },
      };
      const data = await fixture(change);

      const outcome = await normalizeAndRestoreExecutor(
        record(data.sourcePath, "normalize_and_restore"),
        { class: "quarantined_record", action: "normalize_and_restore" },
        data.ctx,
      );

      expect(outcome.status).toBe("mutated");
      expect(data.originalBytes).toHaveLength(
        JSON.stringify(change, null, 2).length,
      );
      expect(data.before[0]).toMatchObject({ id: `quarantine:${CHANGE_ID}` });
      const activePath = join(data.paths.changes, CHANGE_ID, "change.json");
      const restored = JSON.parse(await readFile(activePath, "utf8")) as Record<
        string,
        any
      >;
      expect(restored.test_runs["tk-test0001"][0].evidence_kind).toBe("other");
      expect(restored.worktree_auto_managed).toBe(false);
      expect(ChangeSchema.safeParse(restored).success).toBe(true);
      await expect(
        access(join(data.paths.summariesDir, CHANGE_ID, "current.json")),
      ).resolves.toBeUndefined();
      await expect(access(data.sourcePath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
  );

  test("keeps an unrecoverable record quarantined and reports a residual", async () => {
    const data = await fixture({
      ...SAMPLE_CHANGE,
      id: CHANGE_ID,
      status: "not-a-current-status",
      unexpected_payload: { untouched: true },
    });

    const normalize = await normalizeAndRestoreExecutor(
      record(data.sourcePath, "normalize_and_restore"),
      { class: "quarantined_record", action: "normalize_and_restore" },
      data.ctx,
    );
    const reported = await remainQuarantinedReportedExecutor(
      record(
        join(data.paths.quarantineChanges, CHANGE_ID),
        "remain_quarantined_reported",
      ),
      { class: "quarantined_record", action: "remain_quarantined_reported" },
      data.ctx,
    );

    expect(normalize.status).toBe("skipped");
    expect(reported).toMatchObject({
      status: "skipped",
      documented_residual: true,
    });
    expect(reported.residual).toContain("no valid normalization mapping");
    expect(await readFile(data.sourcePath, "utf8")).toBe(data.originalBytes);
    await expect(
      access(join(data.paths.changes, CHANGE_ID, "change.json")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("matches the worker lock noise allowlist without moving it", async () => {
    const data = await fixture({ ...SAMPLE_CHANGE, id: CHANGE_ID });
    const noisePath = join(
      data.paths.external ?? data.paths.root,
      "worker.lock",
    );
    const noiseBytes = JSON.stringify({ pid: 123 });
    await writeFile(noisePath, noiseBytes, "utf8");

    const outcome = await quarantineToTrashExecutor(
      record(noisePath, "quarantine_to_trash", "unknown_store_noise"),
      { class: "unknown_store_noise", action: "quarantine_to_trash" },
      data.ctx,
    );

    expect(outcome).toMatchObject({ status: "skipped", allowlisted: true });
    expect(outcome.residual).toContain("allowlisted noise");
    expect(await readFile(noisePath, "utf8")).toBe(noiseBytes);
  });

  test("refuses to overwrite an existing quarantine noise entry", async () => {
    const data = await fixture({ ...SAMPLE_CHANGE, id: CHANGE_ID });
    const noisePath = join(
      data.paths.external ?? data.paths.root,
      "orphan.json",
    );
    const existingTarget = join(
      data.paths.quarantineChanges,
      "noise",
      "orphan.json",
    );
    await writeFile(noisePath, "source bytes", "utf8");
    await mkdir(join(data.paths.quarantineChanges, "noise"), {
      recursive: true,
    });
    await writeFile(existingTarget, "existing bytes", "utf8");

    const outcome = await quarantineToTrashExecutor(
      record(noisePath, "quarantine_to_trash", "unknown_store_noise"),
      { class: "unknown_store_noise", action: "quarantine_to_trash" },
      data.ctx,
    );

    expect(outcome).toMatchObject({
      status: "failed",
      error_class: "noise_quarantine_target_exists",
    });
    expect(await readFile(noisePath, "utf8")).toBe("source bytes");
    expect(await readFile(existingTarget, "utf8")).toBe("existing bytes");
  });

  test("refuses a mismatched action context and an existing readable target", async () => {
    const data = await fixture({
      ...SAMPLE_CHANGE,
      id: CHANGE_ID,
      status: "draft",
      test_runs: {
        "tk-test0001": [
          {
            runId: "run-1",
            exitCode: 0,
            classification: "pass",
            command: "test",
            durationMs: 1,
            evidence_kind: "build_worker",
            recordedAt: "2026-08-07T00:00:00Z",
          },
        ],
      },
    });
    const invalidContext = await normalizeAndRestoreExecutor(
      record(data.sourcePath, "normalize_and_restore"),
      {
        class: "unknown_store_noise",
        action: "quarantine_to_trash",
      } as ReconcileAction,
      data.ctx,
    );
    expect(invalidContext).toMatchObject({
      status: "failed",
      error_class: "invalid_executor_context",
    });

    const activePath = join(data.paths.changes, CHANGE_ID, "change.json");
    await mkdir(join(data.paths.changes, CHANGE_ID), { recursive: true });
    await writeFile(
      activePath,
      JSON.stringify(
        ChangeSchema.parse({
          ...SAMPLE_CHANGE,
          id: CHANGE_ID,
          status: "draft",
        }),
      ),
      "utf8",
    );
    const targetExists = await normalizeAndRestoreExecutor(
      record(data.sourcePath, "normalize_and_restore"),
      { class: "quarantined_record", action: "normalize_and_restore" },
      data.ctx,
    );
    expect(targetExists).toMatchObject({
      status: "failed",
      error_class: "active_projection_exists",
    });
  });
});
