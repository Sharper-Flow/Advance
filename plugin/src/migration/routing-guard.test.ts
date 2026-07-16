/**
 * routing-guard tests — routing-only fail-closed check (AC9/DDC7, C5, DONT4/DONT5).
 *
 * Before an active build-bound receipt exists, consumer routing is unchanged
 * (legacy fallback). After activation for the CURRENT build digest, a
 * degraded plan stops plan-dependent consumer routing. A stale receipt
 * (different build) never triggers fail-closed — the new build must
 * re-prove. A malformed receipt fails closed: unknown cutover state must
 * not silently route through legacy prose.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import { activateCutoverReceipt, type CutoverProofs } from "./cutover-receipt";
import { checkPlanRoutingGuard } from "./routing-guard";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => cleanupTempDir(dir)));
  tempDirs = [];
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await createTempDir(prefix);
  tempDirs.push(dir);
  return dir;
}

const DIGEST_A = "sha256:" + "a".repeat(64);
const DIGEST_B = "sha256:" + "b".repeat(64);

function activate(root: string, digest = DIGEST_A): void {
  const proofs: CutoverProofs = {
    buildIdentityDigest: digest,
    inventoryComplete: true,
    inventorySummary: {
      projects: 1,
      runningWorkflows: 0,
      liveSessions: 1,
      workers: 0,
    },
    replay: {
      passed: true,
      fixturesVerified: 4,
      verifiedAt: "2026-07-16T00:00:00.000Z",
    },
    workerServiceability: { status: "serviceable", detail: "ok" },
    strictPlanValidation: { passed: true, checks: 8, detail: "ok" },
  };
  const result = activateCutoverReceipt({
    migrationRoot: root,
    pluginRoot: "/x",
    buildDigest: digest,
    proofs,
  });
  if (!result.activated)
    throw new Error(`fixture activation failed: ${result.error}`);
}

describe("checkPlanRoutingGuard", () => {
  test("no receipt → not fail-closed (legacy routing unchanged)", async () => {
    const root = await tempDir("adv-guard-none-");
    const guard = checkPlanRoutingGuard({
      migrationRoot: root,
      currentDigest: DIGEST_A,
      env: {},
    });
    expect(guard.failClosed).toBe(false);
    expect(guard.basis).toBe("no_receipt");
  });

  test("env override can force fail-closed for drills/tests", async () => {
    const root = await tempDir("adv-guard-env-");
    expect(
      checkPlanRoutingGuard({
        migrationRoot: root,
        currentDigest: DIGEST_A,
        env: { ADV_PLAN_ROUTING_FAIL_CLOSED: "1" },
      }).failClosed,
    ).toBe(true);
  });

  test("env override cannot clear a receipt-backed fail-closed boundary", async () => {
    const root = await tempDir("adv-guard-env-clear-");
    activate(root);
    const guard = checkPlanRoutingGuard({
      migrationRoot: root,
      currentDigest: DIGEST_A,
      env: { ADV_PLAN_ROUTING_FAIL_CLOSED: "0" },
    });
    expect(guard.failClosed).toBe(true);
    expect(guard.basis).toBe("receipt_active");
  });

  test("active receipt bound to the current digest → fail-closed", async () => {
    const root = await tempDir("adv-guard-active-");
    activate(root);
    const guard = checkPlanRoutingGuard({
      migrationRoot: root,
      currentDigest: DIGEST_A,
      env: {},
    });
    expect(guard.failClosed).toBe(true);
    expect(guard.basis).toBe("receipt_active");
  });

  test("active receipt for a DIFFERENT digest → not fail-closed (stale receipt must re-prove)", async () => {
    const root = await tempDir("adv-guard-stale-");
    activate(root, DIGEST_A);
    const guard = checkPlanRoutingGuard({
      migrationRoot: root,
      currentDigest: DIGEST_B,
      env: {},
    });
    expect(guard.failClosed).toBe(false);
    expect(guard.basis).toBe("receipt_stale");
    expect(guard.receiptDigest).toBe(DIGEST_A);
  });

  test("active receipt with unknown current identity → fail-closed (do not bypass completed cutover)", async () => {
    const root = await tempDir("adv-guard-noident-");
    activate(root);
    const guard = checkPlanRoutingGuard({
      migrationRoot: root,
      currentDigest: null,
      env: {},
    });
    expect(guard.failClosed).toBe(true);
    expect(guard.basis).toBe("identity_unavailable");
  });

  test("disabled receipt → not fail-closed (rollback restores legacy routing)", async () => {
    const root = await tempDir("adv-guard-disabled-");
    activate(root);
    const { disableCutoverReceipt } = await import("./cutover-receipt");
    disableCutoverReceipt({ migrationRoot: root, reason: "rollback" });
    const guard = checkPlanRoutingGuard({
      migrationRoot: root,
      currentDigest: DIGEST_A,
      env: {},
    });
    expect(guard.failClosed).toBe(false);
    expect(guard.basis).toBe("receipt_disabled");
  });

  test("malformed receipt → fail-closed (unknown cutover state never routes legacy prose)", async () => {
    const root = await tempDir("adv-guard-malformed-");
    writeFileSync(join(root, "cutover-receipt.json"), "{ corrupt");
    const guard = checkPlanRoutingGuard({
      migrationRoot: root,
      currentDigest: DIGEST_A,
      env: {},
    });
    expect(guard.failClosed).toBe(true);
    expect(guard.basis).toBe("receipt_malformed");
  });

  test("result is memoized until the receipt file changes", async () => {
    const root = await tempDir("adv-guard-cache-");
    const first = checkPlanRoutingGuard({
      migrationRoot: root,
      currentDigest: DIGEST_A,
      env: {},
    });
    activate(root);
    const second = checkPlanRoutingGuard({
      migrationRoot: root,
      currentDigest: DIGEST_A,
      env: {},
    });
    expect(first.failClosed).toBe(false);
    expect(second.failClosed).toBe(true);
  });
});
