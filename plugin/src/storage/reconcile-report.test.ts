import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import {
  deriveRunStatus,
  readReconcileProgress,
  rebuildProgressFromReceipts,
  writeReconcileReceipt,
  writeReconcileRunReport,
} from "./reconcile-report";

const receipt = {
  record_id: "change-a",
  class: "unknown_store_noise" as const,
  action: "quarantine_to_trash",
  status: "mutated" as const,
  ts: "2026-08-07T00:00:00.000Z",
};

describe("reconcile reports", () => {
  test("receipts are atomic and progress is rebuilt from them", async () => {
    const root = await createTempDir("adv-reconcile-report-");
    try {
      const runDir = join(root, "runs", "run-1");
      await writeReconcileReceipt(runDir, receipt);
      const progress = await rebuildProgressFromReceipts(runDir);
      expect(progress.applied).toEqual(["change-a"]);
      expect(progress.last_completed_key).toBe("change-a");
      expect(
        JSON.parse(await readFile(join(runDir, "receipts", "change-a.json"))),
      ).toEqual(receipt);
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("corrupt progress does not block receipt-derived resume", async () => {
    const root = await createTempDir("adv-reconcile-report-progress-");
    try {
      const runDir = join(root, "runs", "run-1");
      await writeReconcileReceipt(runDir, receipt);
      await writeFile(join(runDir, "progress.json"), "not-json");
      const progress = await rebuildProgressFromReceipts(runDir);
      expect(progress.applied).toEqual(["change-a"]);
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("corrupt progress can recover a persisted budget cursor from its report", async () => {
    const root = await createTempDir("adv-reconcile-report-cursor-");
    try {
      const runDir = join(root, "runs", "run-1");
      await mkdir(runDir, { recursive: true });
      await writeFile(join(runDir, "progress.json"), "not-json");
      await writeReconcileRunReport(runDir, {
        schema_version: 1,
        run_id: "run-1",
        mode: "execute",
        started_at: receipt.ts,
        finished_at: receipt.ts,
        interrupted: true,
        records: [],
        counters: { mutated: 0, skipped: 0, failed: 0 },
        residuals: ["budget"],
        continuation_cursor: "cursor-1",
      });
      await expect(readReconcileProgress(runDir)).resolves.toMatchObject({
        continuation_cursor: "cursor-1",
      });
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("failed receipts are not treated as completed resume progress", async () => {
    const root = await createTempDir("adv-reconcile-report-failed-");
    try {
      const runDir = join(root, "runs", "run-1");
      await writeReconcileReceipt(runDir, {
        ...receipt,
        status: "failed",
        error_class: "fixture_failure",
      });
      const progress = await rebuildProgressFromReceipts(runDir);
      expect(progress.applied).toEqual([]);
      expect(progress.last_completed_key).toBeNull();
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("missing final report is derivably interrupted", async () => {
    const root = await createTempDir("adv-reconcile-report-status-");
    try {
      const runDir = join(root, "runs", "run-1");
      await writeReconcileReceipt(runDir, receipt);
      await expect(deriveRunStatus(runDir)).resolves.toMatchObject({
        interrupted: true,
      });
      await writeReconcileRunReport(runDir, {
        schema_version: 1,
        run_id: "run-1",
        mode: "execute",
        started_at: receipt.ts,
        finished_at: receipt.ts,
        interrupted: false,
        records: [receipt],
        counters: { mutated: 1, skipped: 0, failed: 0 },
        residuals: [],
      });
      await expect(deriveRunStatus(runDir)).resolves.toMatchObject({
        interrupted: false,
      });
    } finally {
      await cleanupTempDir(root);
    }
  });
});
