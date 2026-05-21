import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { createDefaultGates, type Change } from "../types";
import type { Store } from "../storage/store-types";
import { contractSetSignal, contractReviewMatrixSetSignal } from "../temporal/messages";

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
      _recovery: { mode: "temporal_query_fallback", reason: "poisoned_history" },
    } as Partial<Change>);
    const store = createStore(change, changesDir);

    const output = parse(
      await contractTools.adv_contract_mint.execute(
        {
          changeId: "contractRecovery",
          recoveryMode: "poisoned_history",
          recoveryEvidence: "operator confirmed poisoned history",
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
    expect(fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("poisoned-history recovery requires explicit recoveryEvidence", async () => {
    const changesDir = await writeAgreement("contractRecovery");
    const change = baseChange({
      _source: "disk",
      _recovery: { mode: "temporal_query_fallback", reason: "poisoned_history" },
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
          recoveryEvidence: "operator confirmed recovery",
        },
        store,
      ),
    );

    expect(output.error).toContain("Workflow execution not found");
    expect(output._recoveryMutation).toBeUndefined();
    expect(store.changes.save).not.toHaveBeenCalled();
  });
});
