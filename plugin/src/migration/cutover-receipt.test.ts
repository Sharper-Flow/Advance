/**
 * cutover-receipt tests — atomic build-bound activation and rollback (AC9/DDC5/DDC7, C5, DONT4).
 *
 * The receipt is the machine-wide cutover artifact: it activates only when
 * every structural proof passes (immutable identity, complete inventory,
 * replay verification, worker serviceability, strict plan validation), it is
 * bound to one build digest, and disabling it is the FIRST rollback action —
 * prior artifacts are retained for recovery.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import {
  activateCutoverReceipt,
  CutoverReceiptSchema,
  disableCutoverReceipt,
  isReceiptActiveForBuild,
  readCutoverReceipt,
  type CutoverProofs,
} from "./cutover-receipt";

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

function passingProofs(overrides: Partial<CutoverProofs> = {}): CutoverProofs {
  return {
    buildIdentityDigest: DIGEST_A,
    inventoryComplete: true,
    inventorySummary: {
      projects: 4,
      runningWorkflows: 2,
      liveSessions: 3,
      workers: 1,
    },
    replay: {
      passed: true,
      fixturesVerified: 4,
      verifiedAt: "2026-07-16T00:00:00.000Z",
    },
    workerServiceability: {
      status: "serviceable",
      detail: "queue probe fresh",
    },
    strictPlanValidation: {
      passed: true,
      checks: 8,
      detail: "7-gate matrix + malformed payloads",
    },
    ...overrides,
  };
}

function activateArgs(root: string, overrides: Record<string, unknown> = {}) {
  return {
    migrationRoot: root,
    pluginRoot: "/deploy/Advance/plugin",
    buildDigest: DIGEST_A,
    proofs: passingProofs(),
    activatedBy: "test-operator",
    now: new Date("2026-07-16T03:00:00.000Z"),
    ...overrides,
  };
}

describe("activateCutoverReceipt", () => {
  test("activates with full proofs and persists a schema-valid receipt", async () => {
    const root = await tempDir("adv-receipt-activate-");
    const result = activateCutoverReceipt(activateArgs(root));
    expect(result.activated).toBe(true);
    const receipt = result.receipt!;
    expect(receipt.status).toBe("active");
    expect(receipt.buildDigest).toBe(DIGEST_A);
    expect(receipt.history).toEqual([
      { event: "activated", at: "2026-07-16T03:00:00.000Z", detail: undefined },
    ]);
    const onDisk = readCutoverReceipt({ migrationRoot: root });
    expect(onDisk.receipt?.id).toBe(receipt.id);
    expect(() => CutoverReceiptSchema.parse(onDisk.receipt)).not.toThrow();
  });

  test.each([
    [
      "inventory incomplete",
      { proofs: { ...passingProofs(), inventoryComplete: false as never } },
    ],
    [
      "replay failed",
      {
        proofs: {
          ...passingProofs(),
          replay: {
            passed: false,
            fixturesVerified: 3,
            verifiedAt: "x",
          } as never,
        },
      },
    ],
    [
      "serviceability not serviceable",
      {
        proofs: {
          ...passingProofs(),
          workerServiceability: {
            status: "not_serviceable",
            detail: "x",
          } as never,
        },
      },
    ],
    [
      "plan validation failed",
      {
        proofs: {
          ...passingProofs(),
          strictPlanValidation: {
            passed: false,
            checks: 8,
            detail: "x",
          } as never,
        },
      },
    ],
    [
      "identity digest mismatch",
      { proofs: passingProofs({ buildIdentityDigest: DIGEST_B }) },
    ],
  ])("refuses activation when %s", async (_label, override) => {
    const root = await tempDir("adv-receipt-refuse-");
    const result = activateCutoverReceipt(activateArgs(root, override));
    expect(result.activated).toBe(false);
    expect(readCutoverReceipt({ migrationRoot: root }).receipt).toBeNull();
  });

  test("re-activation for the same build is idempotent", async () => {
    const root = await tempDir("adv-receipt-idem-");
    const first = activateCutoverReceipt(activateArgs(root));
    const second = activateCutoverReceipt(activateArgs(root));
    expect(second.activated).toBe(true);
    expect(second.receipt?.id).toBe(first.receipt?.id);
    expect(second.alreadyActive).toBe(true);
  });

  test("refuses activation for a different build while one is active", async () => {
    const root = await tempDir("adv-receipt-conflict-");
    activateCutoverReceipt(activateArgs(root));
    const result = activateCutoverReceipt(
      activateArgs(root, {
        buildDigest: DIGEST_B,
        proofs: passingProofs({ buildIdentityDigest: DIGEST_B }),
      }),
    );
    expect(result.activated).toBe(false);
    expect(result.error).toMatch(/disable/i);
    expect(
      readCutoverReceipt({ migrationRoot: root }).receipt?.buildDigest,
    ).toBe(DIGEST_A);
  });

  test("refuses to overwrite a malformed receipt", async () => {
    const root = await tempDir("adv-receipt-malformed-");
    writeFileSync(join(root, "cutover-receipt.json"), "{ corrupt");
    const result = activateCutoverReceipt(activateArgs(root));
    expect(result.activated).toBe(false);
    expect(result.error).toMatch(/malformed/i);
  });

  test("appends an audit line to receipt-history.jsonl", async () => {
    const root = await tempDir("adv-receipt-audit-");
    activateCutoverReceipt(activateArgs(root));
    const audit = readFileSync(join(root, "receipt-history.jsonl"), "utf8");
    const line = JSON.parse(audit.trim().split("\n")[0]);
    expect(line.event).toBe("activated");
    expect(line.buildDigest).toBe(DIGEST_A);
  });
});

describe("disableCutoverReceipt (first rollback action, DDC7)", () => {
  test("flips status, retains the receipt and history, and audits", async () => {
    const root = await tempDir("adv-receipt-disable-");
    const activated = activateCutoverReceipt(activateArgs(root));
    const result = disableCutoverReceipt({
      migrationRoot: root,
      reason: "degraded plan observed in gate-status",
      now: new Date("2026-07-16T04:00:00.000Z"),
    });
    expect(result.disabled).toBe(true);
    const receipt = result.receipt!;
    expect(receipt.status).toBe("disabled");
    expect(receipt.disabledReason).toBe(
      "degraded plan observed in gate-status",
    );
    expect(receipt.history.map((h) => h.event)).toEqual([
      "activated",
      "disabled",
    ]);
    // Prior proofs are retained for recovery.
    expect(receipt.proofs.replay.fixturesVerified).toBe(4);
    expect(receipt.id).toBe(activated.receipt?.id);
    const audit = readFileSync(join(root, "receipt-history.jsonl"), "utf8")
      .trim()
      .split("\n");
    expect(audit).toHaveLength(2);
    expect(JSON.parse(audit[1]).event).toBe("disabled");
  });

  test("disabling with no receipt is a no-op", async () => {
    const root = await tempDir("adv-receipt-disable-none-");
    const result = disableCutoverReceipt({ migrationRoot: root, reason: "x" });
    expect(result.disabled).toBe(false);
  });

  test("disabling a malformed receipt quarantines and retains it", async () => {
    const root = await tempDir("adv-receipt-disable-corrupt-");
    writeFileSync(join(root, "cutover-receipt.json"), "{ corrupt");
    const result = disableCutoverReceipt({
      migrationRoot: root,
      reason: "repair",
      now: new Date("2026-07-16T05:00:00.000Z"),
    });
    expect(result.disabled).toBe(true);
    expect(result.quarantinedPath).toContain("cutover-receipt.corrupt-");
    // Corrupt artifact retained, audit recorded.
    const audit = readFileSync(join(root, "receipt-history.jsonl"), "utf8")
      .trim()
      .split("\n");
    expect(JSON.parse(audit[0]).event).toBe("quarantined");
  });
});

describe("isReceiptActiveForBuild", () => {
  test("true only for an active receipt bound to the same digest", async () => {
    const root = await tempDir("adv-receipt-activefor-");
    expect(isReceiptActiveForBuild(null, DIGEST_A)).toBe(false);
    activateCutoverReceipt(activateArgs(root));
    const { receipt } = readCutoverReceipt({ migrationRoot: root });
    expect(isReceiptActiveForBuild(receipt, DIGEST_A)).toBe(true);
    expect(isReceiptActiveForBuild(receipt, DIGEST_B)).toBe(false);
    disableCutoverReceipt({ migrationRoot: root, reason: "x" });
    const after = readCutoverReceipt({ migrationRoot: root }).receipt;
    expect(isReceiptActiveForBuild(after, DIGEST_A)).toBe(false);
  });
});

describe("readCutoverReceipt", () => {
  test("malformed receipts surface as unknown state, never as active", async () => {
    const root = await tempDir("adv-receipt-read-bad-");
    writeFileSync(
      join(root, "cutover-receipt.json"),
      JSON.stringify({ status: "active" }),
    );
    const result = readCutoverReceipt({ migrationRoot: root });
    expect(result.receipt).toBeNull();
    expect(result.malformed).toBeTruthy();
  });
});
