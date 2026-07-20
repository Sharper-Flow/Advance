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

  // rq-extend-poisoned-recovery AC5 (probe-first migration): the prior
  // catch-path positive recovery tests ("poisoned-history mint recovery
  // writes disk projection with warning" and the review-matrix parallel)
  // are unreachable under probe-first semantics. Precise recoveryEvidence
  // now triggers probe-first BEFORE the signal fires, so the catch-branch
  // is end-to-end unreachable when evidence is precise (matching the
  // migration in design-concern.test.ts). The probe-first positive tests
  // below ("AC5: ... takes probe-first recovery path ...") cover the same
  // observable contract; the catch-branch code remains as defense-in-depth.

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

  // The prior negative tests "missing-workflow errors do not authorize
  // poisoned-history recovery" and "stale poisoned-history markers do not
  // bypass healthy Temporal signaling" asserted that precise evidence does
  // NOT trigger recovery when the signal error or describe() output
  // disagrees. Under probe-first semantics (rq-extend-poisoned-recovery
  // AC5), precise operator-supplied recoveryEvidence IS the authority —
  // probe-first fires before the signal is sent, so the signal error /
  // describe output is never observed for the recovery decision. The
  // catch-branch + describe-probe remain in contract.ts as defense-in-depth
  // but are end-to-end unreachable when evidence is precise.

  // rq-fix-gate-tools-recovery AC3/AC4 describe-path tests removed under
  // probe-first migration (rq-extend-poisoned-recovery AC5). The three
  // deleted tests asserted that describe()-reported nondeterminism
  // triggers disk-direct recovery when the signal succeeds or throws a
  // generic error. Under probe-first semantics, precise operator-supplied
  // recoveryEvidence fires the recovery branch BEFORE the signal — the
  // describe() probe is never consulted for the recovery decision. The
  // describe-path code remains in contract.ts as defense-in-depth but is
  // end-to-end unreachable when evidence is precise. The probe-first AC5
  // tests below cover the new authority model.

  // rq-extend-poisoned-recovery AC5 (probe-first): when the operator supplies
  // precise poisoned-history evidence, the recovery branch fires BEFORE the
  // signal. Temporal signals are fire-and-forget server-acceptance; they
  // silently resolve on poisoned replay, so the catch-branch is unreachable
  // for the common poison case (issue #198, #253). Only probe-first can
  // recover this case. RED today: contract.ts has no probe-first gate, so
  // fireSignalAndRefresh IS called and recovery never triggers when the
  // signal "succeeds" silently.
  test("AC5: adv_contract_mint takes probe-first recovery path when operator supplies precise evidence", async () => {
    const changesDir = await writeAgreement("contractRecovery");
    const store = createStore(baseChange(), changesDir);
    // Default mock resolves — simulating a fire-and-forget signal that the
    // poisoned workflow silently drops during replay.
    fireSignalAndRefresh.mockResolvedValueOnce(undefined);

    const output = parse(
      await contractTools.adv_contract_mint.execute(
        {
          changeId: "contractRecovery",
          recoveryMode: "poisoned_history",
          recoveryEvidence:
            "WorkflowNotFoundError: workflow execution already completed",
        },
        store,
      ),
    );

    // CRITICAL: probe-first path taken; fireSignalAndRefresh NOT called.
    expect(fireSignalAndRefresh).not.toHaveBeenCalled();
    expect(output.success).toBe(true);
    expect(output._recoveryMutation).toBe(true);
    expect(output.recoveryMode).toBe("poisoned_history");
    expect(output.recovered).toBe(true);
    expect(output.reconciliationWarning).toContain("not healed");
    expect(output.note).toContain("Disk-direct recovery");
    expect(output.itemCount).toBe(2);
  });

  test("AC5: adv_contract_review_matrix_set takes probe-first recovery path when operator supplies precise evidence", async () => {
    // Review-matrix recovery requires a change with an existing contract.
    // Use a real temp dir because diskDirect: true writes through saveChange.
    tempDir = await createTempDir("adv-contract-tool-");
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
    const store = createStore(change, tempDir);
    // Default mock resolves — simulating silent fire-and-forget on poison.
    fireSignalAndRefresh.mockResolvedValueOnce(undefined);

    const output = parse(
      await contractTools.adv_contract_review_matrix_set.execute(
        {
          changeId: "contractRecovery",
          recoveryMode: "poisoned_history",
          recoveryEvidence:
            "WorkflowNotFoundError: workflow execution already completed",
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

    // CRITICAL: probe-first path taken; fireSignalAndRefresh NOT called.
    expect(fireSignalAndRefresh).not.toHaveBeenCalled();
    expect(output.success).toBe(true);
    expect(output._recoveryMutation).toBe(true);
    expect(output.recoveryMode).toBe("poisoned_history");
    expect(output.recovered).toBe(true);
    expect(output.reconciliationWarning).toContain("not healed");
    expect(output.note).toContain("Disk-direct recovery");
    expect(output.rowCount).toBe(1);
  });

  // Probe-first requires PRECISE evidence — vague evidence must NOT trigger
  // the disk-direct branch and must fall through to the signal path.
  test("AC5: adv_contract_mint does not take probe-first path on vague recoveryEvidence", async () => {
    const changesDir = await writeAgreement("contractRecovery");
    const store = createStore(baseChange(), changesDir);
    fireSignalAndRefresh.mockResolvedValueOnce(undefined);

    const output = parse(
      await contractTools.adv_contract_mint.execute(
        {
          changeId: "contractRecovery",
          recoveryMode: "poisoned_history",
          // Vague evidence — recoveryEvidenceError rejects this BEFORE the
          // probe-first gate. The output is an error, not a recovery.
          recoveryEvidence: "it failed somehow",
        },
        store,
      ),
    );

    expect(output.error).toContain("precise poisoned-history");
    expect(fireSignalAndRefresh).not.toHaveBeenCalled();
  });
});
