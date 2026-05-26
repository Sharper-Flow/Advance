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

const fireSignalAndRefresh = vi.hoisted(() => vi.fn());
const workflowHandle = vi.hoisted(() => ({ signal: vi.fn(), query: vi.fn() }));

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

describe("contractTools", () => {
  let tempDir: string | undefined;

  beforeEach(() => {
    fireSignalAndRefresh.mockReset();
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

  test("adv_contract_review_matrix_set fires contractReviewMatrixSetSignal", async () => {
    const store = createStore(
      baseChange({
        contract: {
          version: 1,
          rigor: "standard",
          source: { artifact: "agreement", approvedAt },
          items: [
            {
              id: "AC1",
              kind: "acceptance_criterion",
              text: "Contract minting fires a production signal.",
              sourceArtifact: "agreement",
              verificationRequired: true,
              evidencePolicy: "test",
              status: "approved",
            },
          ],
          amendments: [],
        },
      }),
      "/tmp/unused",
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

    expect(output.success).toBe(true);
    expect(fireSignalAndRefresh).toHaveBeenCalledWith(
      expect.anything(),
      store,
      "contractRecovery",
      contractReviewMatrixSetSignal,
      expect.objectContaining({
        reviewMatrix: expect.objectContaining({ rows: expect.any(Array) }),
      }),
    );
  });

  test("adv_contract_review_matrix_set accepts a complete reviewMatrix", async () => {
    const store = createStore(
      baseChange({
        contract: {
          version: 1,
          rigor: "standard",
          source: { artifact: "agreement", approvedAt },
          items: [
            {
              id: "AC1",
              kind: "acceptance_criterion",
              text: "Contract minting fires a production signal.",
              sourceArtifact: "agreement",
              verificationRequired: true,
              evidencePolicy: "test",
              status: "approved",
            },
          ],
          amendments: [],
        },
      }),
      "/tmp/unused",
    );

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
                evidence: "passing test",
              },
            ],
          },
        },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.rowCount).toBe(1);
    expect(fireSignalAndRefresh).toHaveBeenCalledWith(
      expect.anything(),
      store,
      "contractRecovery",
      contractReviewMatrixSetSignal,
      expect.objectContaining({
        reviewMatrix: expect.objectContaining({
          reviewedAt: "2026-05-21T06:00:00.000Z",
        }),
      }),
    );
  });

  test("adv_contract_review_matrix_set ignores empty default reviewMatrix when rows are supplied", async () => {
    const store = createStore(
      baseChange({
        contract: {
          version: 1,
          rigor: "standard",
          source: { artifact: "agreement", approvedAt },
          items: [
            {
              id: "AC1",
              kind: "acceptance_criterion",
              text: "Contract minting fires a production signal.",
              sourceArtifact: "agreement",
              verificationRequired: true,
              evidencePolicy: "test",
              status: "approved",
            },
          ],
          amendments: [],
        },
      }),
      "/tmp/unused",
    );

    const output = parse(
      await contractTools.adv_contract_review_matrix_set.execute(
        {
          changeId: "contractRecovery",
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
          reviewMatrix: { reviewedAt: "", rows: [] },
        },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(fireSignalAndRefresh.mock.calls[0][4]).toMatchObject({
      reviewMatrix: expect.objectContaining({
        reviewedAt: "2026-05-21T06:00:00.000Z",
        rows: [expect.objectContaining({ contractId: "AC1" })],
      }),
    });
  });

  test("adv_contract_review_matrix_set rejects both rows and complete reviewMatrix", async () => {
    const store = createStore(
      baseChange({
        contract: {
          version: 1,
          rigor: "standard",
          source: { artifact: "agreement", approvedAt },
          items: [
            {
              id: "AC1",
              kind: "acceptance_criterion",
              text: "Contract minting fires a production signal.",
              sourceArtifact: "agreement",
              verificationRequired: true,
              evidencePolicy: "test",
              status: "approved",
            },
          ],
          amendments: [],
        },
      }),
      "/tmp/unused",
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
    expect(fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("adv_contract_review_matrix_set rejects empty complete reviewMatrix rows", async () => {
    const store = createStore(
      baseChange({
        contract: {
          version: 1,
          rigor: "standard",
          source: { artifact: "agreement", approvedAt },
          items: [
            {
              id: "AC1",
              kind: "acceptance_criterion",
              text: "Contract minting fires a production signal.",
              sourceArtifact: "agreement",
              verificationRequired: true,
              evidencePolicy: "test",
              status: "approved",
            },
          ],
          amendments: [],
        },
      }),
      "/tmp/unused",
    );

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
    expect(fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("adv_contract_review_matrix_set rejects empty evidence in complete reviewMatrix", async () => {
    const store = createStore(
      baseChange({
        contract: {
          version: 1,
          rigor: "standard",
          source: { artifact: "agreement", approvedAt },
          items: [
            {
              id: "AC1",
              kind: "acceptance_criterion",
              text: "Contract minting fires a production signal.",
              sourceArtifact: "agreement",
              verificationRequired: true,
              evidencePolicy: "test",
              status: "approved",
            },
          ],
          amendments: [],
        },
      }),
      "/tmp/unused",
    );

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
    expect(fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("adv_contract_review_matrix_set rejects unknown contract ids", async () => {
    const store = createStore(
      baseChange({
        contract: {
          version: 1,
          rigor: "standard",
          source: { artifact: "agreement", approvedAt },
          items: [],
          amendments: [],
        },
      }),
      "/tmp/unused",
    );

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
    expect(fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("poisoned-history mint recovery writes disk projection with warning", async () => {
    const changesDir = await writeAgreement("contractRecovery");
    const change = baseChange({
      _source: "disk",
      _recovery: {
        mode: "temporal_query_fallback",
        reason: "poisoned_history",
      },
    } as Partial<Change>);
    const store = createStore(change, changesDir);
    fireSignalAndRefresh.mockRejectedValueOnce(
      new Error("TMPRL1100: Nondeterminism error"),
    );

    const output = parse(
      await contractTools.adv_contract_mint.execute(
        {
          changeId: "contractRecovery",
          recoveryMode: "poisoned_history",
          recoveryEvidence:
            "TMPRL1100: Nondeterminism error in workflow history",
        },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output._recoveryMutation).toBe(true);
    expect(output.reconciliationWarning).toContain("not healed");
    expect(store.changes.save).toHaveBeenCalledWith(
      expect.objectContaining({
        contract: expect.objectContaining({ items: expect.any(Array) }),
        acceptanceCriteria: ["Contract minting fires a production signal."],
      }),
    );
    expect(fireSignalAndRefresh).toHaveBeenCalled();
  });

  test("poisoned-history review matrix recovery writes disk projection with warning", async () => {
    const change = baseChange({
      _source: "disk",
      _recovery: {
        mode: "temporal_query_fallback",
        reason: "poisoned_history",
      },
      contract: {
        version: 1,
        rigor: "standard",
        source: { artifact: "agreement", approvedAt },
        items: [
          {
            id: "AC1",
            kind: "acceptance_criterion",
            text: "Contract minting fires a production signal.",
            sourceArtifact: "agreement",
            verificationRequired: true,
            evidencePolicy: "test",
            status: "approved",
          },
        ],
        amendments: [],
      },
    } as Partial<Change>);
    const store = createStore(change, "/tmp/unused");
    fireSignalAndRefresh.mockRejectedValueOnce(
      new Error("TMPRL1100: Nondeterminism error"),
    );

    const output = parse(
      await contractTools.adv_contract_review_matrix_set.execute(
        {
          changeId: "contractRecovery",
          recoveryMode: "poisoned_history",
          recoveryEvidence:
            "TMPRL1100: Nondeterminism error in workflow history",
          recoveryReason: "review matrix recovery after poisoned history",
          priorApprovalEvidence: "User approved acceptance: approve",
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

    expect(output.success).toBe(true);
    expect(output._recoveryMutation).toBe(true);
    expect(output.reconciliationWarning).toContain("not healed");
    expect(store.changes.save).toHaveBeenCalledWith(
      expect.objectContaining({
        contract: expect.objectContaining({
          reviewMatrix: expect.objectContaining({
            rows: [expect.objectContaining({ contractId: "AC1" })],
          }),
        }),
      }),
    );
    expect(fireSignalAndRefresh).toHaveBeenCalled();
  });

  test("poisoned-history recovery requires explicit recoveryEvidence", async () => {
    const changesDir = await writeAgreement("contractRecovery");
    const change = baseChange({
      _source: "disk",
      _recovery: {
        mode: "temporal_query_fallback",
        reason: "poisoned_history",
      },
    } as Partial<Change>);
    const store = createStore(change, changesDir);

    const output = parse(
      await contractTools.adv_contract_mint.execute(
        { changeId: "contractRecovery", recoveryMode: "poisoned_history" },
        store,
      ),
    );

    expect(output.error).toContain("recoveryEvidence");
    expect(store.changes.save).not.toHaveBeenCalled();
  });

  test("review matrix recovery requires rationale and prior approval evidence", async () => {
    const change = baseChange({
      contract: {
        version: 1,
        rigor: "standard",
        source: { artifact: "agreement", approvedAt },
        items: [
          {
            id: "AC1",
            kind: "acceptance_criterion",
            text: "Contract minting fires a production signal.",
            sourceArtifact: "agreement",
            verificationRequired: true,
            evidencePolicy: "test",
            status: "approved",
          },
        ],
        amendments: [],
      },
    } as Partial<Change>);
    const store = createStore(change, "/tmp/unused");

    const output = parse(
      await contractTools.adv_contract_review_matrix_set.execute(
        {
          changeId: "contractRecovery",
          recoveryMode: "poisoned_history",
          recoveryEvidence:
            "TMPRL1100: Nondeterminism error in workflow history",
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

    expect(output.error).toContain("recoveryReason and priorApprovalEvidence");
    expect(fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("missing-workflow errors do not authorize poisoned-history recovery", async () => {
    const changesDir = await writeAgreement("contractRecovery");
    const store = createStore(baseChange(), changesDir);
    fireSignalAndRefresh.mockRejectedValueOnce(
      new Error("Workflow execution not found"),
    );

    const output = parse(
      await contractTools.adv_contract_mint.execute(
        {
          changeId: "contractRecovery",
          recoveryMode: "poisoned_history",
          recoveryEvidence:
            "TMPRL1100: Nondeterminism error in workflow history",
        },
        store,
      ),
    );

    expect(output.error).toContain("Workflow execution not found");
    expect(output._recoveryMutation).toBeUndefined();
    expect(store.changes.save).not.toHaveBeenCalled();
  });

  test("stale poisoned-history markers do not bypass healthy Temporal signaling", async () => {
    const changesDir = await writeAgreement("contractRecovery");
    const change = baseChange({
      _source: "disk",
      _recovery: {
        mode: "temporal_query_fallback",
        reason: "poisoned_history",
      },
    } as Partial<Change>);
    const store = createStore(change, changesDir);

    const output = parse(
      await contractTools.adv_contract_mint.execute(
        {
          changeId: "contractRecovery",
          recoveryMode: "poisoned_history",
          recoveryEvidence:
            "TMPRL1100: Nondeterminism error in workflow history",
        },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output._recoveryMutation).toBeUndefined();
    expect(store.changes.save).not.toHaveBeenCalled();
    expect(fireSignalAndRefresh).toHaveBeenCalledWith(
      expect.anything(),
      store,
      "contractRecovery",
      contractSetSignal,
      expect.anything(),
    );
  });

  // rq-fix-gate-tools-recovery AC3: signal succeeds (no isPoisonedHistoryError)
  // but workflow describe reports nondeterminism — recover via disk.
  test("adv_contract_mint persists to disk when describe shows poisoned despite signal success", async () => {
    const changesDir = await writeAgreement("contractRecovery");
    const store = createStore(baseChange(), changesDir);
    fireSignalAndRefresh.mockResolvedValueOnce(undefined);
    const describeMock = vi.fn(async () => ({
      searchAttributes: {
        TemporalReportedProblems: [
          "cause=WorkflowTaskFailedCauseNonDeterministicError",
        ],
      },
    }));
    (workflowHandle as { describe?: unknown }).describe = describeMock;

    const output = parse(
      await contractTools.adv_contract_mint.execute(
        {
          changeId: "contractRecovery",
          recoveryMode: "poisoned_history",
          recoveryEvidence:
            "Temporal reports WorkflowTaskFailedCauseNonDeterministicError",
        },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output._recoveryMutation).toBe(true);
    expect(output.reconciliationWarning).toContain("not healed");
    expect(fireSignalAndRefresh).toHaveBeenCalled();
    expect(store.changes.save).toHaveBeenCalledWith(
      expect.objectContaining({
        contract: expect.objectContaining({ items: expect.any(Array) }),
      }),
    );
    expect(describeMock).toHaveBeenCalled();

    delete (workflowHandle as { describe?: unknown }).describe;
  });

  // rq-fix-gate-tools-recovery AC3: signal throws generic error AND describe
  // shows poisoned evidence — recover.
  test("adv_contract_mint recovers when signal throws generic error and describe shows poisoned", async () => {
    const changesDir = await writeAgreement("contractRecovery");
    const store = createStore(baseChange(), changesDir);
    fireSignalAndRefresh.mockRejectedValueOnce(
      new Error("Failed to send signal"),
    );
    const describeMock = vi.fn(async () => ({
      searchAttributes: {
        TemporalReportedProblems: [
          "cause=WorkflowTaskFailedCauseNonDeterministicError",
        ],
      },
    }));
    (workflowHandle as { describe?: unknown }).describe = describeMock;

    const output = parse(
      await contractTools.adv_contract_mint.execute(
        {
          changeId: "contractRecovery",
          recoveryMode: "poisoned_history",
          recoveryEvidence:
            "Temporal reports WorkflowTaskFailedCauseNonDeterministicError",
        },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output._recoveryMutation).toBe(true);
    expect(store.changes.save).toHaveBeenCalled();
    expect(describeMock).toHaveBeenCalled();

    delete (workflowHandle as { describe?: unknown }).describe;
  });

  // rq-fix-gate-tools-recovery AC4: review matrix path with signal success +
  // poisoned describe.
  test("adv_contract_review_matrix_set persists to disk when describe shows poisoned despite signal success", async () => {
    const change = baseChange({
      _source: "disk",
      _recovery: {
        mode: "temporal_query_fallback",
        reason: "poisoned_history",
      },
      contract: {
        version: 1,
        rigor: "standard",
        source: { artifact: "agreement", approvedAt },
        items: [
          {
            id: "AC1",
            kind: "acceptance_criterion",
            text: "Contract minting fires a production signal.",
            sourceArtifact: "agreement",
            verificationRequired: true,
            evidencePolicy: "test",
            status: "approved",
          },
        ],
        amendments: [],
      },
    } as Partial<Change>);
    const store = createStore(change, "/tmp/unused");
    fireSignalAndRefresh.mockResolvedValueOnce(undefined);
    const describeMock = vi.fn(async () => ({
      searchAttributes: {
        TemporalReportedProblems: [
          "cause=WorkflowTaskFailedCauseNonDeterministicError",
        ],
      },
    }));
    (workflowHandle as { describe?: unknown }).describe = describeMock;

    const output = parse(
      await contractTools.adv_contract_review_matrix_set.execute(
        {
          changeId: "contractRecovery",
          recoveryMode: "poisoned_history",
          recoveryEvidence:
            "Temporal reports WorkflowTaskFailedCauseNonDeterministicError",
          recoveryReason: "review matrix recovery after poisoned history",
          priorApprovalEvidence: "User approved acceptance: approve",
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

    expect(output.success).toBe(true);
    expect(output._recoveryMutation).toBe(true);
    expect(store.changes.save).toHaveBeenCalledWith(
      expect.objectContaining({
        contract: expect.objectContaining({
          reviewMatrix: expect.objectContaining({
            rows: [expect.objectContaining({ contractId: "AC1" })],
          }),
        }),
      }),
    );
    expect(describeMock).toHaveBeenCalled();

    delete (workflowHandle as { describe?: unknown }).describe;
  });
});
