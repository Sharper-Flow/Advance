/**
 * routing-guard — routing-only fail-closed check for plan consumers (AC9/DDC7, C5, DONT4/DONT5).
 *
 * One cheap check decides whether a degraded plan must stop plan-dependent
 * consumer routing:
 *
 *   - No receipt, a disabled receipt, or a receipt bound to a different
 *     build → legacy routing is unchanged (AC9 first sentence; C5: no
 *     fail-closed without a complete proof for THIS build).
 *   - An active receipt bound to the current build digest → fail-closed: a
 *     degraded plan returns typed diagnostics and stops routing (DONT4).
 *   - A malformed receipt → fail-closed: unknown cutover state must never
 *     silently route through legacy prose. Recovery is `disable` (DDC7).
 *
 * This check only governs consumer read paths. It never writes plan state or
 * performs external execution (DONT5).
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  CUTOVER_RECEIPT_FILENAME,
  isReceiptActiveForBuild,
  readCutoverReceipt,
} from "./cutover-receipt";
import {
  ADV_BUILD_IDENTITY_FILE_ENV,
  ADV_MIGRATION_STATE_DIR_ENV,
  resolveMigrationRoot,
  resolveOwnBuildIdentity,
} from "./paths";

export type PlanRoutingGuardBasis =
  | "env_override"
  | "no_receipt"
  | "receipt_active"
  | "receipt_stale"
  | "receipt_disabled"
  | "receipt_malformed"
  | "identity_unavailable";

export interface PlanRoutingGuard {
  failClosed: boolean;
  basis: PlanRoutingGuardBasis;
  currentDigest?: string;
  receiptDigest?: string;
}

export const ADV_PLAN_ROUTING_FAIL_CLOSED_ENV = "ADV_PLAN_ROUTING_FAIL_CLOSED";
export { ADV_BUILD_IDENTITY_FILE_ENV, ADV_MIGRATION_STATE_DIR_ENV };

function defaultCurrentDigest(): string | null {
  return resolveOwnBuildIdentity()?.digest ?? null;
}

// Small mtime-keyed memo: the guard runs on every consumer read; the receipt
// and identity files change only on operator action, so revalidation by
// mtime keeps the check cheap without staleness risk.
let cacheKey: string | null = null;
let cacheValue: PlanRoutingGuard | null = null;

function mtimeOf(path: string): number | null {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

export function checkPlanRoutingGuard(input?: {
  migrationRoot?: string;
  /** Explicit digest override; pass null to force identity_unavailable. */
  currentDigest?: string | null;
  env?: NodeJS.ProcessEnv;
}): PlanRoutingGuard {
  const env = input?.env ?? process.env;
  const override = env[ADV_PLAN_ROUTING_FAIL_CLOSED_ENV];
  if (override === "1") {
    // Test/drill forcing may make routing stricter before cutover, but an
    // environment variable must never clear a receipt-backed safety boundary.
    // Disabling the receipt is the auditable first rollback action.
    return { failClosed: true, basis: "env_override" };
  }

  const migrationRoot = input?.migrationRoot ?? resolveMigrationRoot({ env });
  const receiptFile = join(migrationRoot, CUTOVER_RECEIPT_FILENAME);

  const currentDigest =
    input && "currentDigest" in input
      ? (input.currentDigest ?? null)
      : defaultCurrentDigest();

  const key = JSON.stringify([
    receiptFile,
    mtimeOf(receiptFile),
    currentDigest,
    env[ADV_PLAN_ROUTING_FAIL_CLOSED_ENV] ?? "",
  ]);
  if (cacheKey === key && cacheValue) return cacheValue;

  const value = evaluate(migrationRoot, currentDigest);
  cacheKey = key;
  cacheValue = value;
  return value;
}

function evaluate(
  migrationRoot: string,
  currentDigest: string | null,
): PlanRoutingGuard {
  const receiptFile = join(migrationRoot, CUTOVER_RECEIPT_FILENAME);
  if (!existsSync(receiptFile)) {
    return { failClosed: false, basis: "no_receipt" };
  }
  const { receipt, malformed } = readCutoverReceipt({ migrationRoot });
  if (malformed || !receipt) {
    // Unknown cutover state: stop routing rather than silently falling back
    // to legacy prose. Operator recovery: disable (quarantine) the receipt.
    return { failClosed: true, basis: "receipt_malformed" };
  }
  if (receipt.status === "disabled") {
    return { failClosed: false, basis: "receipt_disabled" };
  }
  if (currentDigest === null) {
    return {
      // An active receipt proves this machine already completed cutover. If
      // this process can no longer identify its loaded build, resuming legacy
      // routing would silently bypass that completed cutover. Stop only
      // plan-dependent routing until the identity is restored or the receipt
      // is explicitly disabled for rollback.
      failClosed: true,
      basis: "identity_unavailable",
      receiptDigest: receipt.buildDigest,
    };
  }
  if (isReceiptActiveForBuild(receipt, currentDigest)) {
    return {
      failClosed: true,
      basis: "receipt_active",
      currentDigest,
      receiptDigest: receipt.buildDigest,
    };
  }
  return {
    failClosed: false,
    basis: "receipt_stale",
    currentDigest,
    receiptDigest: receipt.buildDigest,
  };
}

/** Test hook: reset the memoized guard (receipt changes between cases). */
export function resetPlanRoutingGuardCache(): void {
  cacheKey = null;
  cacheValue = null;
}
