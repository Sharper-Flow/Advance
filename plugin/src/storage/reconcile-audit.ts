/**
 * Append-only audit for store reconciliation.
 *
 * Exit-code contract owned by the reconcile surfaces:
 * 0 = completed, 2 = target/usage error, 3 = corrupt input, 4 = worker or
 * reconcile lock refusal, 5 = partial record failure, 6 = stale plan.
 * Audit I/O is deliberately non-fatal: a failed append becomes a bounded
 * warning on the record result and never turns a safe record mutation into an
 * unhandled process failure.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

import { acquireFileLock } from "../utils/fs";
import { ResidueClassSchema, type ResidueClass } from "./store-residue-scan";

export const RECONCILE_AUDIT_FILENAME = "reconcile-audit.jsonl";
export const MAX_RECONCILE_AUDIT_EVENT_BYTES = 64 * 1024;

export const ReconcileAuditEventSchema = z.object({
  event: z.literal("store_reconcile"),
  run_id: z.string().min(1),
  record_id: z.string().min(1),
  class: ResidueClassSchema,
  action: z.string().min(1),
  before_hash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  after_hash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  ts: z.string().datetime({ offset: true }),
});

export type ReconcileAuditEvent = z.infer<typeof ReconcileAuditEventSchema>;
export type ReconcileAuditInput = Omit<ReconcileAuditEvent, "event"> & {
  event: "store_reconcile";
  class: ResidueClass;
};

export type ReconcileAuditResult =
  | { ok: true; event: ReconcileAuditEvent; path: string }
  | { ok: false; warning: string; path: string };

function auditPath(directoryOrPath: string): string {
  return directoryOrPath.endsWith(".jsonl")
    ? directoryOrPath
    : join(directoryOrPath, RECONCILE_AUDIT_FILENAME);
}

export function getReconcileAuditPath(directoryOrPath: string): string {
  return auditPath(directoryOrPath);
}

/** Append one bounded JSONL event while holding the repository file lock. */
export async function appendReconcileAudit(
  directoryOrPath: string,
  input: ReconcileAuditInput,
): Promise<ReconcileAuditResult> {
  const path = auditPath(directoryOrPath);
  try {
    const event = ReconcileAuditEventSchema.parse(input);
    const line = `${JSON.stringify(event)}\n`;
    if (Buffer.byteLength(line, "utf8") > MAX_RECONCILE_AUDIT_EVENT_BYTES) {
      return {
        ok: false,
        path,
        warning: "reconcile audit event exceeds bounded size",
      };
    }
    await mkdir(dirname(path), { recursive: true });
    const release = await acquireFileLock(path);
    try {
      await appendFile(path, line, "utf8");
    } finally {
      await release();
    }
    return { ok: true, event, path };
  } catch (error) {
    return {
      ok: false,
      path,
      warning: `reconcile audit append failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function reconcileAuditExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
