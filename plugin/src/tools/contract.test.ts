import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { createDefaultGates, type Change } from "../types";
import type { Store } from "../storage/store-types";
import {
  contractSetSignal,
  contractReviewMatrixSetSignal,
} from "../temporal/messages";
import { CHANGE_WORKFLOW_QUERY_NAMES } from "../temporal/contracts";
import { loadChange } from "../storage/json";

const fireSignalAndRefresh = vi.hoisted(() => vi.fn());
const workflowHandle = vi.hoisted(() => ({
  signal: vi.fn(),
  query: vi.fn(),
  describe: vi.fn(),
}));

vi.mock("./_adapters", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./_adapters")>()),
  fireSignalAndRefresh,
}));

vi.mock("../temporal/service", () => ({
  getService: () => ({
    client: { workflow: { getHandle: () => workflowHandle } },
  }),
}));

vi.mock("../utils/project-id", () => ({
  getProjectId: async () => "project-1",
}));

import { contractTools } from "./contract";

const approvedAt = "2026-05-21T05:21:11.743Z";

function parse(output: string): Record<string, any> {
  return JSON.parse(output) as Record<string, any>;
}

function baseChange(overrides: Partial<Change> = {}): Change {
  return {
    id: "contractRecovery",
    title: "Contract recovery",
    status: "draft",
    created_at: "2026-05-21T00:00:00.000Z",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: {
      ...createDefaultGates(),
      discovery: {
        status: "done",
        completed_at: approvedAt,
        completed_by: "agent",
      },
    },
    ...overrides,
  } as Change;
}

function createStore(change: Change, changesDir: string): Store {
  return {
    paths: { root: "/repo", changes: changesDir } as Store["paths"],
    config: null,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    changes: {
      get: vi.fn(async () => ({ success: true, data: change })),
      save: vi.fn(),
      refresh: vi.fn(async () => undefined),
    },
  } as unknown as Store;
}

async function seedProjection(
  changesDir: string,
  change: Change,
): Promise<void> {
  const changeDir = join(changesDir, change.id);
  await mkdir(changeDir, { recursive: true });
  await writeFile(
    join(changeDir, "change.json"),
    JSON.stringify(change, null, 2),
    "utf-8",
  );
}

function matrixState(
  reviewMatrix: NonNullable<Change["contract"]>["reviewMatrix"],
): Record<string, unknown> {
  return {
    contract: { reviewMatrix },
    verification_evidence_dispositions: [],
  };
}

describe("contractTools", () => {
  let tempDir: string | undefined;

  beforeEach(() => {
    fireSignalAndRefresh.mockReset();
    workflowHandle.describe.mockReset();
    workflowHandle.signal.mockReset();
    workflowHandle.query.mockReset();
    workflowHandle.query.mockImplementation(
      (queryName: string, receiptId?: string) => {
        if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
          return Promise.resolve(receiptId ? { id: receiptId } : undefined);
        }
        return Promise.resolve({});
      },
    );
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  async function writeAgreement(changeId: string): Promise<string> {
    tempDir = await createTempDir("adv-contract-tool-");
    const changeDir = join(tempDir, changeId);
    await mkdir(changeDir, { recursive: true });
    await writeFile(
      join(changeDir, "agreement.md"),
      `# Agreement

## Acceptance Criteria
- AC1: Contract minting fires a production signal.

## Constraints
- C1: Preserve signal/query-only workflow surface.
`,
    );
    return tempDir;
  }

  test("adv_contract_mint fires contractSetSignal on the healthy path", async () => {
    const changesDir = await writeAgreement("contractRecovery");
    const store = createStore(baseChange(), changesDir);

    const output = parse(
      await contractTools.adv_contract_mint.execute(
        { changeId: "contractRecovery" },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.itemCount).toBe(2);
    expect(fireSignalAndRefresh).toHaveBeenCalledWith(
      expect.anything(),
      store,
      "contractRecovery",
      contractSetSignal,
      expect.objectContaining({
        contract: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ id: "AC1" }),
          ]),
        }),
      }),
    );
  });

  test("adv_contract_mint dryRun does not fire a signal", async () => {
    const changesDir = await writeAgreement("contractRecovery");
    const store = createStore(baseChange(), changesDir);

    const output = parse(
      await contractTools.adv_contract_mint.execute(
        { changeId: "contractRecovery", dryRun: true },
        store,
      ),
    );

    expect(output.dryRun).toBe(true);
    expect(output.contract.items).toHaveLength(2);
    expect(fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("adv_contract_mint requires force before overwriting an existing contract", async () => {
    const changesDir = await writeAgreement("contractRecovery");
    const store = createStore(
      baseChange({
        contract: {
          version: 1,
          rigor: "standard",
          source: {
            artifact: "agreement",
            contentHash: "a".repeat(64),
            approvedAt,
          },
          items: [
            {
              id: "AC1",
              kind: "acceptance_criterion",
              text: "Existing contract item.",
              sourceArtifact: "agreement",
              sourceHash: "a".repeat(64),
              verificationRequired: true,
              evidencePolicy: "test",
              status: "approved",
            },
          ],
          reviewMatrix: { reviewedAt: approvedAt, rows: [] },
          amendments: [],
        },
      }),
      changesDir,
    );

    const blocked = parse(
      await contractTools.adv_contract_mint.execute(
        { changeId: "contractRecovery" },
        store,
      ),
    );

    expect(blocked.error).toContain("already has a contract");
    expect(blocked.hasReviewMatrix).toBe(true);
    expect(fireSignalAndRefresh).not.toHaveBeenCalled();

    const forced = parse(
      await contractTools.adv_contract_mint.execute(
        { changeId: "contractRecovery", force: true },
        store,
      ),
    );
    expect(forced.success).toBe(true);
    expect(fireSignalAndRefresh).toHaveBeenCalledTimes(1);
  });

  test("adv_contract_mint works before discovery gate completion", async () => {
    const changesDir = await writeAgreement("contractRecovery");
    const store = createStore(
      baseChange({ gates: createDefaultGates() }),
      changesDir,
    );

    const output = parse(
      await contractTools.adv_contract_mint.execute(
        { changeId: "contractRecovery" },
        store,
      ),
    );

    expect(output.success).toBe(true);
    const payload = fireSignalAndRefresh.mock.calls[0][4];
    expect(payload.contract.source.approvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  /**
   * AC8 (completeStateBackedGate) — readAgreement MUST be Temporal-first
   * (state.documents.agreement) → disk → archive, matching the canonical
   * readArtifact ordering. RED today: readAgreement reads disk-first and
   * only falls back to change.documents.agreement when disk is empty/missing.
   *
   * Setup: disk agreement.md is STALE (one AC), Temporal
   * change.documents.agreement is FRESH (two ACs). A Temporal-first reader
   * mints a 2-item contract; the disk-first reader mints a stale 1-item
   * contract. Asserting itemCount === 2 fails before the fix.
   */
  test("adv_contract_mint uses Temporal-fresh agreement over stale disk (AC8)", async () => {
    tempDir = await createTempDir("adv-contract-tool-");
    const changeId = "agreementTemporalFirst";
    const changeDir = join(tempDir, changeId);
    await mkdir(changeDir, { recursive: true });
    // STALE on disk — only one acceptance criterion.
    await writeFile(
      join(changeDir, "agreement.md"),
      `# Agreement

## Acceptance Criteria
- AC1: Stale disk acceptance criterion.

## Constraints
- C1: Stale disk constraint.
`,
    );

    // FRESH in Temporal state.documents — two acceptance criteria.
    const change = baseChange({
      id: changeId,
      documents: {
        agreement: `# Agreement

## Acceptance Criteria
- AC1: Fresh Temporal acceptance criterion.
- AC2: Second fresh Temporal acceptance criterion.

## Constraints
- C1: Fresh Temporal constraint.
`,
      },
    } as Partial<Change>);
    const store = createStore(change, tempDir);

    const output = parse(
      await contractTools.adv_contract_mint.execute({ changeId }, store),
    );

    expect(output.success).toBe(true);
    // Temporal-first → 2 ACs + 1 constraint = 3 items. Disk-first → 2 items.
    expect(output.itemCount).toBe(3);
    const payload = fireSignalAndRefresh.mock.calls[0][4];
    expect(payload.contract.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "AC2" })]),
    );
  });

  test("adv_contract_mint uses explicit approvedAt when provided", async () => {
    const changesDir = await writeAgreement("contractRecovery");
    const store = createStore(
      baseChange({ gates: createDefaultGates() }),
      changesDir,
    );

    const output = parse(
      await contractTools.adv_contract_mint.execute(
        {
          changeId: "contractRecovery",
          approvedAt: "2026-05-21T06:17:00.000Z",
          dryRun: true,
        },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.contract.source.approvedAt).toBe("2026-05-21T06:17:00.000Z");
  });

  test("adv_contract_mint rejects invalid approvedAt audit timestamps", async () => {
    const changesDir = await writeAgreement("contractRecovery");
    const store = createStore(
      baseChange({ gates: createDefaultGates() }),
      changesDir,
    );

    const output = parse(
      await contractTools.adv_contract_mint.execute(
        {
          changeId: "contractRecovery",
          approvedAt: "not-a-date",
          dryRun: true,
        },
        store,
      ),
    );

    expect(output.error).toContain("approvedAt must be a valid ISO timestamp");
    expect(fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("adv_contract_mint rejects unsafe change IDs before reading agreement artifacts", async () => {
    const store = createStore(baseChange({ id: "../outside" }), "/tmp/unused");

    const output = parse(
      await contractTools.adv_contract_mint.execute(
        { changeId: "../outside", dryRun: true },
        store,
      ),
    );

    expect(output.error).toContain("Invalid changeId");
    expect(fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("adv_contract_review_matrix_set fires contractReviewMatrixSetSignal and commits projection on the healthy path", async () => {
    tempDir = await createTempDir("adv-contract-matrix-");
    const change = baseChange({ contract: reviewMatrixContract });
    await seedProjection(tempDir, change);
    const store = createStore(change, tempDir);
    const expectedMatrix = {
      reviewedAt: "2026-05-21T06:00:00.000Z",
      rows: [
        {
          contractId: "AC1",
          kind: "acceptance_criterion",
          status: "pass",
          evidencePolicy: "test",
          evidence: "passing test",
        },
      ],
    };
    workflowHandle.query.mockImplementation(
      (queryName: string, receiptId?: string) => {
        if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
          return Promise.resolve(receiptId ? { id: receiptId } : undefined);
        }
        return Promise.resolve(matrixState(expectedMatrix));
      },
    );

    const output = parse(
      await contractTools.adv_contract_review_matrix_set.execute(
        {
          changeId: "contractRecovery",
          reviewMatrix: expectedMatrix,
        },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.rowCount).toBe(1);
    expect(workflowHandle.signal).toHaveBeenCalledWith(
      contractReviewMatrixSetSignal,
      expect.objectContaining({
        reviewMatrix: expect.objectContaining({ rows: expect.any(Array) }),
        mutationReceiptId: expect.stringMatching(/^mrec_/),
      }),
    );
    expect(workflowHandle.query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: CHANGE_WORKFLOW_QUERY_NAMES.getState,
      }),
    );
    const disk = await loadChange(tempDir, "contractRecovery");
    expect(disk.success).toBe(true);
    expect(disk.data?.contract?.reviewMatrix).toEqual(expectedMatrix);
    expect(disk.data?.projection_revision).toBe(1);
  });

  test("adv_contract_review_matrix_set accepts rows and defaults reviewedAt", async () => {
    tempDir = await createTempDir("adv-contract-matrix-");
    const change = baseChange({ contract: reviewMatrixContract });
    await seedProjection(tempDir, change);
    const store = createStore(change, tempDir);
    const expectedMatrix = {
      reviewedAt: "2026-05-21T06:00:00.000Z",
      rows: [
        {
          contractId: "AC1",
          kind: "acceptance_criterion",
          status: "pass",
          evidencePolicy: "test",
          evidence: "passing test",
        },
      ],
    };
    workflowHandle.query.mockImplementation(
      (queryName: string, receiptId?: string) => {
        if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
          return Promise.resolve(receiptId ? { id: receiptId } : undefined);
        }
        return Promise.resolve(matrixState(expectedMatrix));
      },
    );

    const output = parse(
      await contractTools.adv_contract_review_matrix_set.execute(
        {
          changeId: "contractRecovery",
          rows: expectedMatrix.rows,
          reviewMatrix: {
            reviewedAt: expectedMatrix.reviewedAt,
            rows: [],
          },
        },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(workflowHandle.signal).toHaveBeenCalledWith(
      contractReviewMatrixSetSignal,
      expect.objectContaining({
        reviewMatrix: expect.objectContaining({
          reviewedAt: expectedMatrix.reviewedAt,
          rows: [expect.objectContaining({ contractId: "AC1" })],
        }),
        mutationReceiptId: expect.stringMatching(/^mrec_/),
      }),
    );
  });

  test("adv_contract_review_matrix_set ignores empty default reviewMatrix when rows are supplied", async () => {
    tempDir = await createTempDir("adv-contract-matrix-");
    const change = baseChange({ contract: reviewMatrixContract });
    await seedProjection(tempDir, change);
    const store = createStore(change, tempDir);
    const expectedMatrix = {
      reviewedAt: "2026-05-21T06:00:00.000Z",
      rows: [
        {
          contractId: "AC1",
          kind: "acceptance_criterion",
          status: "pass",
          evidencePolicy: "test",
          evidence: "passing test",
        },
      ],
    };
    workflowHandle.query.mockImplementation(
      (queryName: string, receiptId?: string) => {
        if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
          return Promise.resolve(receiptId ? { id: receiptId } : undefined);
        }
        return Promise.resolve(matrixState(expectedMatrix));
      },
    );

    const output = parse(
      await contractTools.adv_contract_review_matrix_set.execute(
        {
          changeId: "contractRecovery",
          reviewedAt: expectedMatrix.reviewedAt,
          rows: expectedMatrix.rows,
          reviewMatrix: { reviewedAt: "", rows: [] },
        },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(workflowHandle.signal.mock.calls[0][1]).toMatchObject({
      reviewMatrix: expect.objectContaining({
        reviewedAt: expectedMatrix.reviewedAt,
        rows: [expect.objectContaining({ contractId: "AC1" })],
      }),
    });
  });

  test("adv_contract_review_matrix_set rejects both rows and complete reviewMatrix", async () => {
    tempDir = await createTempDir("adv-contract-matrix-");
    const change = baseChange({ contract: reviewMatrixContract });
    await seedProjection(tempDir, change);
    const store = createStore(change, tempDir);

    const output = parse(
      await contractTools.adv_contract_review_matrix_set.execute(
        {
          changeId: "contractRecovery",
          rows: [
            {
              contractId: "AC1",
              kind: "acceptance_criterion",
              status: "pass",
              evidencePolicy: "test",
              evidence: "passing test",
            },
          ],
          reviewMatrix: {
            reviewedAt: "2026-05-21T06:00:00.000Z",
            rows: [
              {
                contractId: "AC1",
                kind: "acceptance_criterion",
                status: "pass",
                evidencePolicy: "test",
                evidence: "passing test",
              },
            ],
          },
        },
        store,
      ),
    );

    expect(output.error).toContain("either rows or reviewMatrix, not both");
    expect(workflowHandle.signal).not.toHaveBeenCalled();
  });

  test("adv_contract_review_matrix_set rejects empty complete reviewMatrix rows", async () => {
    tempDir = await createTempDir("adv-contract-matrix-");
    const change = baseChange({ contract: reviewMatrixContract });
    await seedProjection(tempDir, change);
    const store = createStore(change, tempDir);

    const output = parse(
      await contractTools.adv_contract_review_matrix_set.execute(
        {
          changeId: "contractRecovery",
          reviewMatrix: {
            reviewedAt: "2026-05-21T06:00:00.000Z",
            rows: [],
          },
        },
        store,
      ),
    );

    expect(output.error).toContain(
      "requires either rows or reviewMatrix with at least one row",
    );
    expect(workflowHandle.signal).not.toHaveBeenCalled();
  });

  test("adv_contract_review_matrix_set rejects empty evidence in complete reviewMatrix", async () => {
    tempDir = await createTempDir("adv-contract-matrix-");
    const change = baseChange({ contract: reviewMatrixContract });
    await seedProjection(tempDir, change);
    const store = createStore(change, tempDir);

    const output = parse(
      await contractTools.adv_contract_review_matrix_set.execute(
        {
          changeId: "contractRecovery",
          reviewMatrix: {
            reviewedAt: "2026-05-21T06:00:00.000Z",
            rows: [
              {
                contractId: "AC1",
                kind: "acceptance_criterion",
                status: "pass",
                evidencePolicy: "test",
                evidence: "",
              },
            ],
          },
        },
        store,
      ),
    );

    expect(output.error).toContain("evidence");
    expect(workflowHandle.signal).not.toHaveBeenCalled();
  });

  test("adv_contract_review_matrix_set rejects unknown contract ids", async () => {
    tempDir = await createTempDir("adv-contract-matrix-");
    const change = baseChange({
      contract: {
        version: 1,
        rigor: "standard",
        source: { artifact: "agreement", approvedAt },
        items: [],
        amendments: [],
      },
    });
    await seedProjection(tempDir, change);
    const store = createStore(change, tempDir);

    const output = parse(
      await contractTools.adv_contract_review_matrix_set.execute(
        {
          changeId: "contractRecovery",
          rows: [
            {
              contractId: "AC404",
              kind: "acceptance_criterion",
              status: "pass",
              evidencePolicy: "test",
              evidence: "passing test",
            },
          ],
        },
        store,
      ),
    );

    expect(output.error).toContain("unknown contract item");
    expect(workflowHandle.signal).not.toHaveBeenCalled();
  });

  function poisonedDescription() {
    return {
      searchAttributes: {
        TemporalReportedProblems: [
          "category=WorkflowTaskFailed",
          "cause=WorkflowTaskFailedCauseNonDeterministicError",
        ],
      },
    };
  }

  const reviewMatrixContract = {
    version: 1,
    rigor: "standard" as const,
    source: { artifact: "agreement", approvedAt },
    items: [
      {
        id: "AC1",
        kind: "acceptance_criterion" as const,
        text: "Contract minting fires a production signal.",
        sourceArtifact: "agreement",
        verificationRequired: true,
        evidencePolicy: "test" as const,
        status: "approved" as const,
      },
    ],
    amendments: [],
  };

  // D4/AC5: public recoveryMode/recoveryEvidence/recoveryReason removed;
  // recovery is classified internally via classifyMutationRecoveryDecision
  // (probe-first describe() and signal-error fallback).

  test("D4: adv_contract_mint recovers via disk when describe() confirms poisoned history", async () => {
    const changesDir = await writeAgreement("contractRecovery");
    const change = baseChange();
    await seedProjection(changesDir, change);
    const store = createStore(change, changesDir);
    workflowHandle.describe.mockResolvedValueOnce(poisonedDescription());
    fireSignalAndRefresh.mockResolvedValueOnce(undefined);

    const output = parse(
      await contractTools.adv_contract_mint.execute(
        { changeId: "contractRecovery" },
        store,
      ),
    );

    expect(fireSignalAndRefresh).not.toHaveBeenCalled();
    expect(output.success).toBe(true);
    expect(output._recoveryMutation).toBe(true);
    expect(output.recovered).toBe(true);
    expect(output.recoveryMode).toBe("poisoned_history");
    expect(output.reconciliationWarning).toContain("not healed");
    expect(output.note).toContain("workflow_poisoned_describe");
    expect(output.itemCount).toBe(2);
    const disk = await loadChange(changesDir, "contractRecovery");
    expect(disk.success).toBe(true);
    expect(disk.data?.contract).toBeTruthy();
    expect(disk.data?.projection_revision).toBe(1);
  });

  test("D4: adv_contract_mint recovers via disk-direct when signal error indicates completed workflow", async () => {
    const changesDir = await writeAgreement("contractRecovery");
    const change = baseChange();
    await seedProjection(changesDir, change);
    const store = createStore(change, changesDir);
    workflowHandle.describe.mockResolvedValueOnce({});
    fireSignalAndRefresh.mockRejectedValueOnce(
      new Error("workflow execution already completed"),
    );

    const output = parse(
      await contractTools.adv_contract_mint.execute(
        { changeId: "contractRecovery" },
        store,
      ),
    );

    expect(fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    expect(output.success).toBe(true);
    expect(output._recoveryMutation).toBe(true);
    expect(output.recovered).toBe(true);
    expect(output.recoveryMode).toBe("poisoned_history");
    expect(output.note).toContain("workflow_completed");
    expect(output.itemCount).toBe(2);
  });

  test("D4: adv_contract_mint surfaces operator_required when signal error is unclassified and describe is clean", async () => {
    const changesDir = await writeAgreement("contractRecovery");
    const store = createStore(baseChange(), changesDir);
    workflowHandle.describe.mockResolvedValueOnce({});
    fireSignalAndRefresh.mockRejectedValueOnce(new Error("network timeout"));

    const output = parse(
      await contractTools.adv_contract_mint.execute(
        { changeId: "contractRecovery" },
        store,
      ),
    );

    expect(output.success).not.toBe(true);
    expect(output.code).toBe("CONTRACT_MINT_OPERATOR_REQUIRED");
    expect(fireSignalAndRefresh).toHaveBeenCalledTimes(1);
  });

  test("D4: adv_contract_review_matrix_set recovers via commitChangeProjection when describe() confirms poisoned history", async () => {
    tempDir = await createTempDir("adv-contract-matrix-");
    const change = baseChange({
      contract: reviewMatrixContract,
    } as Partial<Change>);
    await seedProjection(tempDir, change);
    const store = createStore(change, tempDir);
    workflowHandle.describe.mockResolvedValueOnce(poisonedDescription());

    const output = parse(
      await contractTools.adv_contract_review_matrix_set.execute(
        {
          changeId: "contractRecovery",
          rows: [
            {
              contractId: "AC1",
              kind: "acceptance_criterion",
              status: "pass",
              evidencePolicy: "test",
              evidence: "passing test",
            },
          ],
        },
        store,
      ),
    );

    expect(workflowHandle.signal).not.toHaveBeenCalled();
    expect(output.success).toBe(true);
    expect(output._recoveryMutation).toBe(true);
    expect(output.recovered).toBe(true);
    expect(output.recoveryMode).toBe("poisoned_history");
    expect(output.rowCount).toBe(1);
    const disk = await loadChange(tempDir, "contractRecovery");
    expect(disk.success).toBe(true);
    expect(disk.data?.contract?.reviewMatrix?.rows).toHaveLength(1);
    expect(disk.data?.projection_revision).toBe(1);
    expect(disk.data?.projection_commits?.[0].authority_kind).toBe("recovery");
    expect(disk.data?.projection_commits?.[0].payload).toMatchObject({
      reviewMatrix: expect.objectContaining({ rows: expect.any(Array) }),
      updatedAt: expect.any(String),
      mutationReceiptId: expect.stringMatching(/^mrec_/),
    });
  });

  test("D4: adv_contract_review_matrix_set recovers via commitChangeProjection when signal error indicates completed workflow", async () => {
    tempDir = await createTempDir("adv-contract-matrix-");
    const change = baseChange({
      contract: reviewMatrixContract,
    } as Partial<Change>);
    await seedProjection(tempDir, change);
    const store = createStore(change, tempDir);
    workflowHandle.describe.mockResolvedValueOnce({});
    workflowHandle.signal.mockRejectedValueOnce(
      new Error("workflow execution already completed"),
    );

    const output = parse(
      await contractTools.adv_contract_review_matrix_set.execute(
        {
          changeId: "contractRecovery",
          rows: [
            {
              contractId: "AC1",
              kind: "acceptance_criterion",
              status: "pass",
              evidencePolicy: "test",
              evidence: "passing test",
            },
          ],
        },
        store,
      ),
    );

    expect(workflowHandle.signal).toHaveBeenCalledTimes(1);
    expect(output.success).toBe(true);
    expect(output._recoveryMutation).toBe(true);
    expect(output.recovered).toBe(true);
    expect(output.recoveryMode).toBe("poisoned_history");
    expect(output.rowCount).toBe(1);
    const disk = await loadChange(tempDir, "contractRecovery");
    expect(disk.success).toBe(true);
    expect(disk.data?.contract?.reviewMatrix?.rows).toHaveLength(1);
    expect(disk.data?.projection_revision).toBe(1);
    expect(disk.data?.projection_commits?.[0].authority_kind).toBe("recovery");
    expect(disk.data?.projection_commits?.[0].payload).toMatchObject({
      reviewMatrix: expect.objectContaining({ rows: expect.any(Array) }),
      updatedAt: expect.any(String),
      mutationReceiptId: expect.stringMatching(/^mrec_/),
    });
  });
});
