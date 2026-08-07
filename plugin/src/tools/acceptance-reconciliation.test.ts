/** Disk-authoritative acceptance remediation reconciliation tests. */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { loadChange } from "../storage/json";
import { reconcileRecoveredAcceptanceRemediation } from "./acceptance-reconciliation";
import type {
  Change,
  ContractReviewMatrix,
  DesignConcernDisposition,
  VerificationEvidenceDisposition,
} from "../types";
import type { Store } from "../storage/store-types";

function baseChange(overrides: Partial<Change> = {}): Change {
  return {
    id: "change-1",
    title: "Change one",
    status: "active",
    created_at: "2026-05-23T00:00:00.000Z",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
      planning: { status: "done" },
      execution: { status: "done" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    },
    ...overrides,
  } as Change;
}

function storeFor(changesDir: string): Store {
  return { paths: { root: "/repo", changes: changesDir } } as unknown as Store;
}

async function seed(changesDir: string, change: Change): Promise<void> {
  const changeDir = join(changesDir, change.id);
  await mkdir(changeDir, { recursive: true });
  await writeFile(join(changeDir, "change.json"), JSON.stringify(change));
}

function recoveryAudit() {
  return {
    reason: "poisoned_history",
    evidence: "workflow completed before signal landed",
    recovered_at: "2026-05-23T00:00:00.000Z",
  };
}

function designDisposition(): DesignConcernDisposition {
  return {
    taskId: "tk-design",
    concernKey: "component_correctness",
    disposition: "fixed",
    evidence: "Re-implemented with a semantic button.",
    dispositionedAt: "2026-05-23T00:00:01.000Z",
    recovery_audit: recoveryAudit(),
  } as DesignConcernDisposition;
}

function verificationDisposition(): VerificationEvidenceDisposition {
  return {
    taskId: "tk-verify",
    concernKey: "verification_mismatch",
    disposition: "fixed",
    evidence: "Re-ran targeted suite; binding now matches.",
    dispositionedAt: "2026-05-23T00:00:02.000Z",
    recovery_audit: recoveryAudit(),
  } as VerificationEvidenceDisposition;
}

function reviewMatrix(): ContractReviewMatrix {
  return {
    reviewedAt: "2026-05-23T00:00:00.000Z",
    rows: [
      {
        contractId: "AC1",
        kind: "acceptance_criterion",
        status: "pass",
        evidencePolicy: "test",
        evidence: "Targeted suite passes.",
      },
    ],
    recovery_audit: recoveryAudit(),
  } as ContractReviewMatrix;
}

describe("reconcileRecoveredAcceptanceRemediation", () => {
  test("returns reconciled with zero cleared when no pending markers exist", async () => {
    const dir = await createTempDir("adv-acceptance-reconciliation-");
    try {
      const change = baseChange();
      await seed(dir, change);
      const result = await reconcileRecoveredAcceptanceRemediation({
        store: storeFor(dir),
        changeId: change.id,
      });
      expect(result).toMatchObject({ kind: "reconciled", clearedCount: 0 });
    } finally {
      await cleanupTempDir(dir);
    }
  });

  test("clears recovered disposition and review-matrix markers in one verified disk mutation", async () => {
    const dir = await createTempDir("adv-acceptance-reconciliation-");
    try {
      const change = baseChange({
        design_concern_dispositions: [designDisposition()],
        verification_evidence_dispositions: [verificationDisposition()],
        contract: {
          version: 1,
          rigor: "standard",
          source: {
            artifact: "agreement",
            approvedAt: "2026-05-23T00:00:00.000Z",
          },
          items: [],
          amendments: [],
          reviewMatrix: reviewMatrix(),
        } as Change["contract"],
      });
      await seed(dir, change);
      const result = await reconcileRecoveredAcceptanceRemediation({
        store: storeFor(dir),
        changeId: change.id,
      });
      expect(result).toMatchObject({ kind: "reconciled", clearedCount: 3 });
      const disk = await loadChange(dir, change.id);
      expect(disk.success).toBe(true);
      expect(
        disk.data?.design_concern_dispositions?.[0].recovery_audit,
      ).toBeUndefined();
      expect(
        disk.data?.verification_evidence_dispositions?.[0].recovery_audit,
      ).toBeUndefined();
      expect(disk.data?.contract?.reviewMatrix?.recovery_audit).toBeUndefined();
      expect(disk.data?.projection_revision).toBe(1);
      expect(disk.data?.projection_commits?.[0].authority_kind).toBe(
        "recovery",
      );
    } finally {
      await cleanupTempDir(dir);
    }
  });

  test("preserves marker payload while clearing only recovery audit metadata", async () => {
    const dir = await createTempDir("adv-acceptance-reconciliation-");
    try {
      const change = baseChange({
        design_concern_dispositions: [designDisposition()],
      });
      await seed(dir, change);
      const result = await reconcileRecoveredAcceptanceRemediation({
        store: storeFor(dir),
        changeId: change.id,
      });
      expect(result.kind).toBe("reconciled");
      if (result.kind === "reconciled") {
        expect(result.change.design_concern_dispositions?.[0]).toMatchObject({
          taskId: "tk-design",
          concernKey: "component_correctness",
          disposition: "fixed",
          evidence: "Re-implemented with a semantic button.",
        });
      }
    } finally {
      await cleanupTempDir(dir);
    }
  });

  test("fails closed when the authoritative projection is missing", async () => {
    const dir = await createTempDir("adv-acceptance-reconciliation-");
    try {
      const result = await reconcileRecoveredAcceptanceRemediation({
        store: storeFor(dir),
        changeId: "missing-change",
      });
      expect(result).toMatchObject({
        kind: "blocked",
        code: "ACCEPTANCE_RECONCILIATION_READ_FAILED",
      });
    } finally {
      await cleanupTempDir(dir);
    }
  });
});
