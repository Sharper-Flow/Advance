/**
 * cutover-receipt — atomic build-bound cutover activation + rollback (AC9/DDC5/DDC7, C5, DONT4).
 *
 * The receipt is the machine-wide migration artifact. It activates only when
 * EVERY structural proof passes and binds to exactly one immutable build
 * digest:
 *
 *   - immutable deployed-build identity verified (unknown/stale blocks);
 *   - complete local project/workflow/process/session inventory;
 *   - committed-history replay verification passed (DDC6);
 *   - worker serviceability proven;
 *   - strict plan surface validation passed.
 *
 * Writes are atomic (tmp + rename). An active receipt for a DIFFERENT build
 * must be disabled before a new activation — never overwritten. Disabling is
 * the FIRST rollback action (DDC7): it flips status, retains the receipt and
 * its proofs for recovery, and appends to the audit log. A malformed receipt
 * is quarantined (retained) rather than deleted.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const CUTOVER_RECEIPT_FILENAME = "cutover-receipt.json";
export const CUTOVER_RECEIPT_AUDIT_FILENAME = "receipt-history.jsonl";

export const CutoverProofsSchema = z
  .object({
    buildIdentityDigest: z.string().min(1),
    inventoryComplete: z.literal(true),
    inventorySummary: z
      .object({
        projects: z.number().int().nonnegative(),
        runningWorkflows: z.number().int().nonnegative(),
        liveSessions: z.number().int().nonnegative(),
        workers: z.number().int().nonnegative(),
      })
      .strict(),
    replay: z
      .object({
        passed: z.literal(true),
        fixturesVerified: z.number().int().positive(),
        verifiedAt: z.string().min(1),
      })
      .strict(),
    workerServiceability: z
      .object({
        status: z.literal("serviceable"),
        detail: z.string(),
      })
      .strict(),
    strictPlanValidation: z
      .object({
        passed: z.literal(true),
        checks: z.number().int().positive(),
        detail: z.string(),
      })
      .strict(),
  })
  .strict();
export type CutoverProofs = z.infer<typeof CutoverProofsSchema>;

export const CutoverReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    status: z.enum(["active", "disabled"]),
    buildDigest: z.string().min(1),
    pluginRoot: z.string().min(1),
    activatedAt: z.string().min(1),
    activatedBy: z.string().min(1),
    proofs: CutoverProofsSchema,
    disabledAt: z.string().optional(),
    disabledReason: z.string().optional(),
    history: z
      .array(
        z
          .object({
            event: z.enum(["activated", "disabled"]),
            at: z.string().min(1),
            detail: z.string().optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type CutoverReceipt = z.infer<typeof CutoverReceiptSchema>;

function receiptPath(migrationRoot: string): string {
  return join(migrationRoot, CUTOVER_RECEIPT_FILENAME);
}

function auditPath(migrationRoot: string): string {
  return join(migrationRoot, CUTOVER_RECEIPT_AUDIT_FILENAME);
}

function appendAudit(
  migrationRoot: string,
  entry: Record<string, unknown>,
): void {
  try {
    mkdirSync(migrationRoot, { recursive: true });
    appendFileSync(
      auditPath(migrationRoot),
      JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n",
    );
  } catch {
    // Audit failure must not block activation state; the receipt file is
    // authoritative.
  }
}

export interface ReceiptReadResult {
  receipt: CutoverReceipt | null;
  malformed?: string;
}

/** Read the current receipt. Malformed content is unknown state, never active. */
export function readCutoverReceipt(input: {
  migrationRoot: string;
}): ReceiptReadResult {
  const path = receiptPath(input.migrationRoot);
  if (!existsSync(path)) return { receipt: null };
  try {
    const receipt = CutoverReceiptSchema.parse(
      JSON.parse(readFileSync(path, "utf8")),
    );
    return { receipt };
  } catch (error) {
    return {
      receipt: null,
      malformed: error instanceof Error ? error.message : String(error),
    };
  }
}

/** True only for an active receipt bound to the given build digest. */
export function isReceiptActiveForBuild(
  receipt: CutoverReceipt | null,
  currentDigest: string,
): boolean {
  return (
    receipt !== null &&
    receipt.status === "active" &&
    receipt.buildDigest === currentDigest
  );
}

export interface ActivateCutoverReceiptResult {
  activated: boolean;
  alreadyActive?: boolean;
  receipt?: CutoverReceipt;
  error?: string;
}

/**
 * Atomically activate the build-bound receipt after all proofs pass.
 * Idempotent for an already-active receipt bound to the same build.
 */
export function activateCutoverReceipt(input: {
  migrationRoot: string;
  pluginRoot: string;
  buildDigest: string;
  proofs: CutoverProofs;
  activatedBy?: string;
  now?: Date;
}): ActivateCutoverReceiptResult {
  // Structural proof validation: incomplete inventory, failed replay,
  // unserviceable workers, or failed plan validation can never activate —
  // the schema's literal(true) fields make the requirement machine-checked.
  const proofs = CutoverProofsSchema.safeParse(input.proofs);
  if (!proofs.success) {
    return {
      activated: false,
      error: `cutover proofs incomplete or invalid: ${proofs.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    };
  }
  if (input.proofs.buildIdentityDigest !== input.buildDigest) {
    return {
      activated: false,
      error: `identity proof digest ${input.proofs.buildIdentityDigest} does not match build ${input.buildDigest}`,
    };
  }
  const existing = readCutoverReceipt({ migrationRoot: input.migrationRoot });
  if (existing.malformed) {
    return {
      activated: false,
      error: `existing receipt is malformed and must be disabled/quarantined first: ${existing.malformed}`,
    };
  }
  if (existing.receipt?.status === "active") {
    if (existing.receipt.buildDigest === input.buildDigest) {
      return {
        activated: true,
        alreadyActive: true,
        receipt: existing.receipt,
      };
    }
    return {
      activated: false,
      error: `an active receipt for build ${existing.receipt.buildDigest} exists; disable it before activating a different build`,
    };
  }

  const now = (input.now ?? new Date()).toISOString();
  const receipt: CutoverReceipt = {
    schemaVersion: 1,
    id: `receipt-${input.buildDigest.replace(/^sha256:/, "").slice(0, 12)}-${Date.parse(now)}`,
    status: "active",
    buildDigest: input.buildDigest,
    pluginRoot: input.pluginRoot,
    activatedAt: now,
    activatedBy: input.activatedBy ?? "unknown",
    proofs: input.proofs,
    history: [{ event: "activated", at: now }],
  };
  mkdirSync(input.migrationRoot, { recursive: true });
  const path = receiptPath(input.migrationRoot);
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(receipt, null, 2) + "\n");
  renameSync(tmp, path);
  appendAudit(input.migrationRoot, {
    event: "activated",
    receiptId: receipt.id,
    buildDigest: receipt.buildDigest,
  });
  return { activated: true, receipt };
}

export interface DisableCutoverReceiptResult {
  disabled: boolean;
  receipt?: CutoverReceipt;
  quarantinedPath?: string;
  error?: string;
}

/**
 * First rollback action (DDC7). Flips an active receipt to disabled while
 * retaining it and its proofs for recovery. A malformed receipt is
 * quarantined (renamed, retained) so a fresh activation can proceed.
 */
export function disableCutoverReceipt(input: {
  migrationRoot: string;
  reason: string;
  now?: Date;
}): DisableCutoverReceiptResult {
  const path = receiptPath(input.migrationRoot);
  if (!existsSync(path)) return { disabled: false };

  const now = (input.now ?? new Date()).toISOString();
  const existing = readCutoverReceipt({ migrationRoot: input.migrationRoot });
  if (existing.malformed) {
    const quarantinedPath = join(
      input.migrationRoot,
      `cutover-receipt.corrupt-${Date.parse(now)}.json`,
    );
    renameSync(path, quarantinedPath);
    appendAudit(input.migrationRoot, {
      event: "quarantined",
      reason: input.reason,
      quarantinedPath,
    });
    return { disabled: true, quarantinedPath };
  }
  if (!existing.receipt) return { disabled: false };
  if (existing.receipt.status === "disabled") {
    return { disabled: true, receipt: existing.receipt };
  }

  const receipt: CutoverReceipt = {
    ...existing.receipt,
    status: "disabled",
    disabledAt: now,
    disabledReason: input.reason,
    history: [
      ...existing.receipt.history,
      { event: "disabled", at: now, detail: input.reason },
    ],
  };
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(receipt, null, 2) + "\n");
  renameSync(tmp, path);
  appendAudit(input.migrationRoot, {
    event: "disabled",
    receiptId: receipt.id,
    reason: input.reason,
  });
  return { disabled: true, receipt };
}
