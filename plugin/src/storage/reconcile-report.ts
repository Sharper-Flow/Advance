/** Crash-safe receipts, progress checkpoints, and final run reports. */

import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { atomicWriteFile } from "../utils/fs";
import {
  ReconcileReceiptSchema,
  ReconcileRunReportSchema,
  type ReconcileReceipt,
  type ReconcileRunReport,
} from "./reconcile-plan";

export interface ReconcileProgress {
  run_id: string;
  last_completed_key: string | null;
  applied: string[];
  ts: string;
}

export interface DerivedRunStatus {
  run_id: string;
  interrupted: boolean;
  receipt_count: number;
  report: ReconcileRunReport | null;
}

function receiptFileName(recordId: string): string {
  return `${recordId.replace(/[^A-Za-z0-9._:-]/g, "_")}.json`;
}

function runIdFromDir(runDir: string): string {
  return basename(runDir);
}

function receiptPath(runDir: string, recordId: string): string {
  return join(runDir, "receipts", receiptFileName(recordId));
}

async function loadReceipts(runDir: string): Promise<ReconcileReceipt[]> {
  let entries: string[];
  try {
    entries = await readdir(join(runDir, "receipts"));
  } catch {
    return [];
  }
  const receipts: ReconcileReceipt[] = [];
  for (const entry of entries.filter((name) => name.endsWith(".json")).sort()) {
    try {
      const parsed = ReconcileReceiptSchema.safeParse(
        JSON.parse(await readFile(join(runDir, "receipts", entry), "utf8")),
      );
      if (parsed.success) receipts.push(parsed.data);
    } catch {
      // A torn/corrupt receipt is not evidence of completion.
    }
  }
  return receipts.sort(
    (left, right) =>
      left.ts.localeCompare(right.ts) ||
      left.record_id.localeCompare(right.record_id),
  );
}

export async function writeReconcileReceipt(
  runDir: string,
  receipt: ReconcileReceipt,
): Promise<string> {
  const parsed = ReconcileReceiptSchema.parse(receipt);
  const path = receiptPath(runDir, parsed.record_id);
  await atomicWriteFile(path, JSON.stringify(parsed));
  return path;
}

export async function rebuildProgressFromReceipts(
  runDir: string,
): Promise<ReconcileProgress> {
  const receipts = await loadReceipts(runDir);
  const applied = receipts.map((receipt) => receipt.record_id);
  return {
    run_id: runIdFromDir(runDir),
    last_completed_key: applied.at(-1) ?? null,
    applied,
    ts: new Date().toISOString(),
  };
}

export async function writeReconcileProgress(
  runDir: string,
  progress: ReconcileProgress,
): Promise<string> {
  const path = join(runDir, "progress.json");
  await atomicWriteFile(path, JSON.stringify(progress));
  return path;
}

export async function writeReconcileRunReport(
  runDir: string,
  report: ReconcileRunReport,
): Promise<string> {
  const parsed = ReconcileRunReportSchema.parse(report);
  const path = join(runDir, "report.json");
  await atomicWriteFile(path, JSON.stringify(parsed));
  return path;
}

export async function deriveRunStatus(
  runDir: string,
): Promise<DerivedRunStatus> {
  const receipts = await loadReceipts(runDir);
  let report: ReconcileRunReport | null = null;
  try {
    const parsed = ReconcileRunReportSchema.safeParse(
      JSON.parse(await readFile(join(runDir, "report.json"), "utf8")),
    );
    if (parsed.success) report = parsed.data;
  } catch {
    report = null;
  }
  const interrupted =
    report === null ||
    report.interrupted ||
    report.records.length !== receipts.length;
  return {
    run_id: runIdFromDir(runDir),
    interrupted,
    receipt_count: receipts.length,
    report,
  };
}

export async function readReconcileReceipts(
  runDir: string,
): Promise<ReconcileReceipt[]> {
  return loadReceipts(runDir);
}
