/**
 * Acceptance remediation reconciliation tests.
 *
 * Covers the pre-acceptance re-delivery of recovered design-concern and
 * verification-evidence dispositions into a reachable workflow, marker clearing,
 * and typed failure blocks.
 */

import { describe, expect, test, vi, beforeEach } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { createTempDir } from "../__tests__/setup";
import { reconcileRecoveredAcceptanceRemediation } from "./acceptance-reconciliation";
import { loadChange } from "../storage/json";
import { commitChangeProjection } from "../storage/change-projection-transaction";
import { CHANGE_WORKFLOW_QUERY_NAMES } from "../temporal/contracts";
import type { Store } from "../storage/store-types";
import type {
  Change,
  ContractReviewMatrix,
  DesignConcernDisposition,
  VerificationEvidenceDisposition,
} from "../types";

const mocks = vi.hoisted(() => {
  const signal = vi.fn();
  const query = vi.fn();
  const describe = vi.fn(async () => ({ searchAttributes: {} }));
  const handle = { signal, query, describe };
  return { handle, signal, query, describe };
});

vi.mock("../storage/change-projection-transaction", async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import("../storage/change-projection-transaction")
    >();
  return {
    ...mod,
    commitChangeProjection: vi.fn(mod.commitChangeProjection),
  };
});

vi.mock("../temporal/service", () => ({
  getService: () => ({ client: { workflow: { getHandle: vi.fn() } } }),
}));

vi.mock("../utils/project-id", () => ({
  getProjectId: async () => "project-1",
}));

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
  return {
    paths: { root: "/repo", changes: changesDir } as Store["paths"],
    config: null,
    changes: {
      get: vi.fn(async () => ({ success: true, data: null })),
      refresh: vi.fn(async () => undefined),
      invalidate: vi.fn(async () => undefined),
    },
  } as unknown as Store;
}

async function seedProjection(
  changesDir: string,
  change: Change,
): Promise<void> {
  const changeDir = `${changesDir}/${change.id}`;
  await mkdir(changeDir, { recursive: true });
  await writeFile(
    `${changeDir}/change.json`,
    JSON.stringify(change, null, 2),
    "utf-8",
  );
}

function designConcernDisposition(
  overrides: Partial<DesignConcernDisposition> = {},
): DesignConcernDisposition {
  return {
    taskId: "tk-design",
    concernKey: "component_correctness",
    disposition: "fixed",
    evidence: "Re-implemented with a semantic button.",
    dispositionedAt: "2026-05-23T00:00:01.000Z",
    ...overrides,
  } as DesignConcernDisposition;
}

function verificationEvidenceDisposition(
  overrides: Partial<VerificationEvidenceDisposition> = {},
): VerificationEvidenceDisposition {
  return {
    taskId: "tk-verify",
    concernKey: "verification_mismatch",
    disposition: "fixed",
    evidence: "Re-ran targeted suite; binding now matches.",
    dispositionedAt: "2026-05-23T00:00:02.000Z",
    ...overrides,
  } as VerificationEvidenceDisposition;
}

function recoveryAudit() {
  return {
    reason: "poisoned_history",
    evidence: "workflow completed before signal landed",
    recovered_at: "2026-05-23T00:00:00.000Z",
  };
}

function baseContract(
  overrides: Partial<NonNullable<Change["contract"]>> = {},
): NonNullable<Change["contract"]> {
  return {
    version: 1,
    rigor: "standard",
    source: { artifact: "agreement", approvedAt: "2026-05-23T00:00:00.000Z" },
    items: [
      {
        id: "AC1",
        kind: "acceptance_criterion",
        text: "Matrix row exists.",
        sourceArtifact: "agreement",
        verificationRequired: true,
        evidencePolicy: "test",
        status: "approved",
      },
    ],
    amendments: [],
    ...overrides,
  } as NonNullable<Change["contract"]>;
}

function contractReviewMatrix(
  overrides: Partial<ContractReviewMatrix> = {},
): ContractReviewMatrix {
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
    ...overrides,
  };
}

function workflowState(dispositions: {
  design?: DesignConcernDisposition[];
  verification?: VerificationEvidenceDisposition[];
  matrix?: ContractReviewMatrix;
}) {
  return {
    design_concern_dispositions: dispositions.design ?? [],
    verification_evidence_dispositions: dispositions.verification ?? [],
    contract: dispositions.matrix
      ? { reviewMatrix: dispositions.matrix }
      : undefined,
  };
}

describe("reconcileRecoveredAcceptanceRemediation", () => {
  beforeEach(() => {
    mocks.signal.mockReset();
    mocks.signal.mockResolvedValue(undefined);
    mocks.query.mockReset();
    mocks.query.mockImplementation((queryName: string, receiptId?: string) => {
      if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
        return Promise.resolve(receiptId ? { id: receiptId } : undefined);
      }
      return Promise.resolve({});
    });
    mocks.describe.mockReset();
    mocks.describe.mockResolvedValue({ searchAttributes: {} });
  });

  test("returns reconciled with zero cleared when no pending markers exist", async () => {
    const changesDir = await createTempDir("adv-acceptance-reconciliation-");
    const change = baseChange();
    await seedProjection(changesDir, change);

    const result = await reconcileRecoveredAcceptanceRemediation({
      store: storeFor(changesDir),
      changeId: "change-1",
      handle: mocks.handle,
    });

    expect(result.kind).toBe("reconciled");
    if (result.kind === "reconciled") {
      expect(result.clearedCount).toBe(0);
    }
    expect(mocks.signal).not.toHaveBeenCalled();
  });

  test("re-delivers a design-concern marker and clears it from disk", async () => {
    const changesDir = await createTempDir("adv-acceptance-reconciliation-");
    const change = baseChange({
      design_concern_dispositions: [
        { ...designConcernDisposition(), recovery_audit: recoveryAudit() },
      ],
    });
    await seedProjection(changesDir, change);
    mocks.query.mockImplementation((queryName: string, receiptId?: string) => {
      if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
        return Promise.resolve(receiptId ? { id: receiptId } : undefined);
      }
      return Promise.resolve(
        workflowState({
          design: [designConcernDisposition()],
        }),
      );
    });

    const result = await reconcileRecoveredAcceptanceRemediation({
      store: storeFor(changesDir),
      changeId: "change-1",
      handle: mocks.handle,
    });

    expect(result.kind).toBe("reconciled");
    if (result.kind === "reconciled") {
      expect(result.clearedCount).toBe(1);
      expect(
        result.change.design_concern_dispositions?.[0].recovery_audit,
      ).toBeUndefined();
    }
    expect(mocks.signal).toHaveBeenCalledTimes(1);
    const disk = await loadChange(changesDir, "change-1");
    expect(disk.success).toBe(true);
    expect(
      disk.data?.design_concern_dispositions?.[0].recovery_audit,
    ).toBeUndefined();
    expect(disk.data?.projection_revision).toBe(1);
  });

  test("re-delivers a verification-evidence marker and clears it from disk", async () => {
    const changesDir = await createTempDir("adv-acceptance-reconciliation-");
    const change = baseChange({
      verification_evidence_dispositions: [
        {
          ...verificationEvidenceDisposition(),
          recovery_audit: recoveryAudit(),
        },
      ],
    });
    await seedProjection(changesDir, change);
    mocks.query.mockImplementation((queryName: string, receiptId?: string) => {
      if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
        return Promise.resolve(receiptId ? { id: receiptId } : undefined);
      }
      return Promise.resolve(
        workflowState({
          verification: [verificationEvidenceDisposition()],
        }),
      );
    });

    const result = await reconcileRecoveredAcceptanceRemediation({
      store: storeFor(changesDir),
      changeId: "change-1",
      handle: mocks.handle,
    });

    expect(result.kind).toBe("reconciled");
    if (result.kind === "reconciled") {
      expect(result.clearedCount).toBe(1);
    }
    const disk = await loadChange(changesDir, "change-1");
    expect(disk.success).toBe(true);
    expect(
      disk.data?.verification_evidence_dispositions?.[0].recovery_audit,
    ).toBeUndefined();
  });

  test("re-delivers both families and clears all markers", async () => {
    const changesDir = await createTempDir("adv-acceptance-reconciliation-");
    const change = baseChange({
      design_concern_dispositions: [
        { ...designConcernDisposition(), recovery_audit: recoveryAudit() },
      ],
      verification_evidence_dispositions: [
        {
          ...verificationEvidenceDisposition(),
          recovery_audit: recoveryAudit(),
        },
      ],
    });
    await seedProjection(changesDir, change);
    mocks.query.mockImplementation((queryName: string, receiptId?: string) => {
      if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
        return Promise.resolve(receiptId ? { id: receiptId } : undefined);
      }
      return Promise.resolve(
        workflowState({
          design: [designConcernDisposition()],
          verification: [verificationEvidenceDisposition()],
        }),
      );
    });

    const result = await reconcileRecoveredAcceptanceRemediation({
      store: storeFor(changesDir),
      changeId: "change-1",
      handle: mocks.handle,
    });

    expect(result.kind).toBe("reconciled");
    if (result.kind === "reconciled") {
      expect(result.clearedCount).toBe(2);
    }
    expect(mocks.signal).toHaveBeenCalledTimes(2);
    const disk = await loadChange(changesDir, "change-1");
    expect(disk.success).toBe(true);
    expect(
      disk.data?.design_concern_dispositions?.[0].recovery_audit,
    ).toBeUndefined();
    expect(
      disk.data?.verification_evidence_dispositions?.[0].recovery_audit,
    ).toBeUndefined();
  });

  test("retains a newer recovered marker that arrives while clearing an older reconciliation", async () => {
    const changesDir = await createTempDir("adv-acceptance-reconciliation-");
    const older = {
      ...designConcernDisposition(),
      recovery_audit: recoveryAudit(),
    };
    await seedProjection(
      changesDir,
      baseChange({ design_concern_dispositions: [older] }),
    );
    mocks.query.mockImplementation((queryName: string, receiptId?: string) => {
      if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
        return Promise.resolve(receiptId ? { id: receiptId } : undefined);
      }
      return Promise.resolve(
        workflowState({ design: [designConcernDisposition()] }),
      );
    });

    const newer = {
      ...designConcernDisposition({
        disposition: "fast_follow",
        evidence: "Captured a newer remediation decision.",
        dispositionedAt: "2026-05-23T00:00:03.000Z",
      }),
      recovery_audit: {
        ...recoveryAudit(),
        recovered_at: "2026-05-23T00:00:03.000Z",
      },
    };
    mocks.signal.mockImplementationOnce(async () => {
      await seedProjection(
        changesDir,
        baseChange({ design_concern_dispositions: [newer] }),
      );
    });

    const result = await reconcileRecoveredAcceptanceRemediation({
      store: storeFor(changesDir),
      changeId: "change-1",
      handle: mocks.handle,
    });

    expect(result).toMatchObject({
      kind: "blocked",
      code: "ACCEPTANCE_RECONCILIATION_CLEAR_FAILED",
    });
    const disk = await loadChange(changesDir, "change-1");
    expect(disk.data?.design_concern_dispositions).toEqual([newer]);
  });

  test("returns a blocked result when a disposition receipt is not confirmed", async () => {
    const changesDir = await createTempDir("adv-acceptance-reconciliation-");
    const change = baseChange({
      design_concern_dispositions: [
        { ...designConcernDisposition(), recovery_audit: recoveryAudit() },
      ],
    });
    await seedProjection(changesDir, change);
    // Receipt query never returns the receipt, so redelivery fails.
    mocks.query.mockImplementation((queryName: string, _receiptId?: string) => {
      if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(
        workflowState({ design: [designConcernDisposition()] }),
      );
    });

    const result = await reconcileRecoveredAcceptanceRemediation({
      store: storeFor(changesDir),
      changeId: "change-1",
      handle: mocks.handle,
    });

    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      expect(result.code).toBe("ACCEPTANCE_RECONCILIATION_SIGNAL_FAILED");
      expect(result.failedItems).toHaveLength(1);
      expect(result.failedItems[0].family).toBe("design_concern");
    }
    const disk = await loadChange(changesDir, "change-1");
    expect(disk.success).toBe(true);
    // Markers must be retained when reconciliation fails.
    expect(
      disk.data?.design_concern_dispositions?.[0].recovery_audit,
    ).toBeDefined();
  });

  test("returns a blocked result when the disk marker clear cannot be committed", async () => {
    const changesDir = await createTempDir("adv-acceptance-reconciliation-");
    const change = baseChange({
      design_concern_dispositions: [
        { ...designConcernDisposition(), recovery_audit: recoveryAudit() },
      ],
    });
    await seedProjection(changesDir, change);
    mocks.query.mockImplementation((queryName: string, receiptId?: string) => {
      if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
        return Promise.resolve(receiptId ? { id: receiptId } : undefined);
      }
      return Promise.resolve(
        workflowState({ design: [designConcernDisposition()] }),
      );
    });
    vi.mocked(commitChangeProjection).mockResolvedValueOnce({
      kind: "operator_required",
      reason: "projection lock held by another process",
    });

    const result = await reconcileRecoveredAcceptanceRemediation({
      store: storeFor(changesDir),
      changeId: "change-1",
      handle: mocks.handle,
    });

    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      expect(result.code).toBe("ACCEPTANCE_RECONCILIATION_CLEAR_FAILED");
    }
  });

  test("re-delivers a recovered contract review matrix and clears the marker", async () => {
    const changesDir = await createTempDir("adv-acceptance-reconciliation-");
    const matrix = contractReviewMatrix({
      recovery_audit: recoveryAudit(),
    });
    const change = baseChange({
      contract: baseContract({ reviewMatrix: matrix }),
    });
    await seedProjection(changesDir, change);
    mocks.query.mockImplementation((queryName: string, receiptId?: string) => {
      if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
        return Promise.resolve(receiptId ? { id: receiptId } : undefined);
      }
      return Promise.resolve(workflowState({ matrix: contractReviewMatrix() }));
    });

    const result = await reconcileRecoveredAcceptanceRemediation({
      store: storeFor(changesDir),
      changeId: "change-1",
      handle: mocks.handle,
    });

    expect(result.kind).toBe("reconciled");
    if (result.kind === "reconciled") {
      expect(result.clearedCount).toBe(1);
      expect(
        result.change.contract?.reviewMatrix?.recovery_audit,
      ).toBeUndefined();
    }
    expect(mocks.signal).toHaveBeenCalledTimes(1);
    const signalArgs = mocks.signal.mock.calls[0];
    expect(
      (signalArgs[1] as { reviewMatrix: ContractReviewMatrix }).reviewMatrix
        .recovery_audit,
    ).toBeUndefined();
    const disk = await loadChange(changesDir, "change-1");
    expect(disk.success).toBe(true);
    expect(disk.data?.contract?.reviewMatrix?.recovery_audit).toBeUndefined();
    expect(disk.data?.projection_revision).toBe(1);
  });

  test("retains a newer recovered matrix that arrives while clearing an older reconciliation", async () => {
    const changesDir = await createTempDir("adv-acceptance-reconciliation-");
    const older = contractReviewMatrix({ recovery_audit: recoveryAudit() });
    await seedProjection(
      changesDir,
      baseChange({ contract: baseContract({ reviewMatrix: older }) }),
    );
    mocks.query.mockImplementation((queryName: string, receiptId?: string) => {
      if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
        return Promise.resolve(receiptId ? { id: receiptId } : undefined);
      }
      return Promise.resolve(workflowState({ matrix: contractReviewMatrix() }));
    });

    const newer = contractReviewMatrix({
      reviewedAt: "2026-05-23T00:00:03.000Z",
      rows: [
        {
          contractId: "AC1",
          kind: "acceptance_criterion",
          status: "fail",
          evidencePolicy: "test",
          evidence: "A newer review found a regression.",
        },
      ],
      recovery_audit: {
        ...recoveryAudit(),
        recovered_at: "2026-05-23T00:00:03.000Z",
      },
    });
    mocks.signal.mockImplementationOnce(async () => {
      await seedProjection(
        changesDir,
        baseChange({ contract: baseContract({ reviewMatrix: newer }) }),
      );
    });

    const result = await reconcileRecoveredAcceptanceRemediation({
      store: storeFor(changesDir),
      changeId: "change-1",
      handle: mocks.handle,
    });

    expect(result).toMatchObject({
      kind: "blocked",
      code: "ACCEPTANCE_RECONCILIATION_CLEAR_FAILED",
    });
    const disk = await loadChange(changesDir, "change-1");
    expect(disk.data?.contract?.reviewMatrix).toEqual(newer);
  });

  test("re-delivers dispositions and a contract review matrix together", async () => {
    const changesDir = await createTempDir("adv-acceptance-reconciliation-");
    const matrix = contractReviewMatrix({
      recovery_audit: recoveryAudit(),
    });
    const change = baseChange({
      design_concern_dispositions: [
        { ...designConcernDisposition(), recovery_audit: recoveryAudit() },
      ],
      contract: baseContract({ reviewMatrix: matrix }),
    });
    await seedProjection(changesDir, change);
    mocks.query.mockImplementation((queryName: string, receiptId?: string) => {
      if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
        return Promise.resolve(receiptId ? { id: receiptId } : undefined);
      }
      return Promise.resolve(
        workflowState({
          design: [designConcernDisposition()],
          matrix: contractReviewMatrix(),
        }),
      );
    });

    const result = await reconcileRecoveredAcceptanceRemediation({
      store: storeFor(changesDir),
      changeId: "change-1",
      handle: mocks.handle,
    });

    expect(result.kind).toBe("reconciled");
    if (result.kind === "reconciled") {
      expect(result.clearedCount).toBe(2);
    }
    expect(mocks.signal).toHaveBeenCalledTimes(2);
    const disk = await loadChange(changesDir, "change-1");
    expect(disk.success).toBe(true);
    expect(
      disk.data?.design_concern_dispositions?.[0].recovery_audit,
    ).toBeUndefined();
    expect(disk.data?.contract?.reviewMatrix?.recovery_audit).toBeUndefined();
  });

  test("strips recovery_audit from the matrix signal payload", async () => {
    const changesDir = await createTempDir("adv-acceptance-reconciliation-");
    const matrix = contractReviewMatrix({
      recovery_audit: recoveryAudit(),
    });
    const change = baseChange({
      contract: baseContract({ reviewMatrix: matrix }),
    });
    await seedProjection(changesDir, change);
    mocks.query.mockImplementation((queryName: string, receiptId?: string) => {
      if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
        return Promise.resolve(receiptId ? { id: receiptId } : undefined);
      }
      return Promise.resolve(workflowState({ matrix: contractReviewMatrix() }));
    });

    await reconcileRecoveredAcceptanceRemediation({
      store: storeFor(changesDir),
      changeId: "change-1",
      handle: mocks.handle,
    });

    const payload = mocks.signal.mock.calls[0][1] as {
      reviewMatrix: ContractReviewMatrix;
      updatedAt: string;
      mutationReceiptId: string;
    };
    expect(payload.reviewMatrix).toEqual(contractReviewMatrix());
    expect(payload.reviewMatrix.recovery_audit).toBeUndefined();
    expect(payload.mutationReceiptId).toMatch(/^mrec_/);
  });

  test("returns a blocked result when matrix redelivery is not confirmed", async () => {
    const changesDir = await createTempDir("adv-acceptance-reconciliation-");
    const matrix = contractReviewMatrix({
      recovery_audit: recoveryAudit(),
    });
    const change = baseChange({
      contract: baseContract({ reviewMatrix: matrix }),
    });
    await seedProjection(changesDir, change);
    mocks.query.mockImplementation((queryName: string, _receiptId?: string) => {
      if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(workflowState({ matrix: contractReviewMatrix() }));
    });

    const result = await reconcileRecoveredAcceptanceRemediation({
      store: storeFor(changesDir),
      changeId: "change-1",
      handle: mocks.handle,
    });

    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      expect(result.code).toBe("ACCEPTANCE_RECONCILIATION_SIGNAL_FAILED");
      expect(result.failedItems).toHaveLength(1);
      expect(result.failedItems[0].family).toBe("contract_review_matrix");
    }
    const disk = await loadChange(changesDir, "change-1");
    expect(disk.data?.contract?.reviewMatrix?.recovery_audit).toBeDefined();
  });
});
