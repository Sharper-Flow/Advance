import { mkdir, writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Change } from "../types";
import type { Store } from "../storage/store-types";
import { createTempDir } from "../__tests__/setup";
import { loadChange } from "../storage/json";
import { CHANGE_WORKFLOW_QUERY_NAMES } from "../temporal/contracts";
import { designConcernDispositionedSignal } from "../temporal/messages";

const mocks = vi.hoisted(() => {
  const describe = vi.fn(async () => ({ searchAttributes: {} }));
  const workflowHandle = { signal: vi.fn(), query: vi.fn(), describe };
  const withTargetPathStore = vi.fn(async (_input: unknown, _fn: unknown) => {
    throw new Error("withTargetPathStore not configured for this test");
  });
  return {
    workflowHandle,
    withTargetPathStore,
  };
});

vi.mock("./_adapters", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./_adapters")>()),
  getChangeHandle: () => mocks.workflowHandle,
}));

vi.mock("../temporal/service", () => ({
  getService: () => ({ client: { workflow: { getHandle: vi.fn() } } }),
}));

vi.mock("../utils/project-id", () => ({
  getProjectId: async () => "project-1",
}));

vi.mock("./target-project", async (importOriginal) => {
  const original = await importOriginal<typeof import("./target-project")>();
  return {
    ...original,
    withTargetPathStore: mocks.withTargetPathStore,
  };
});

import { designConcernTools } from "./design-concern";

function parse(output: string): Record<string, any> {
  return JSON.parse(output) as Record<string, any>;
}

function change(overrides: Partial<Change> = {}): Change {
  return {
    id: "change-1",
    title: "Change one",
    status: "active",
    created_at: "2026-05-23T00:00:00.000Z",
    tasks: [
      {
        id: "tk-1",
        title: "Task one",
        status: "done",
        priority: 1,
        created_at: "2026-05-23T00:00:00.000Z",
      },
    ],
    deltas: {},
    wisdom: [],
    gates: {} as Change["gates"],
    ...overrides,
  } as Change;
}

async function seedProjection(
  changesDir: string,
  baseChange: Change,
): Promise<void> {
  const changeDir = `${changesDir}/${baseChange.id}`;
  await mkdir(changeDir, { recursive: true });
  await writeFile(
    `${changeDir}/change.json`,
    JSON.stringify(baseChange, null, 2),
    "utf-8",
  );
}

function storeFor(
  baseChange: Change,
  changesDir = "/tmp/unused-design-concern",
): Store {
  return {
    paths: { root: "/repo", changes: changesDir } as Store["paths"],
    config: null,
    changes: {
      get: vi.fn(async () => ({ success: true, data: baseChange })),
      refresh: vi.fn(async () => undefined),
    },
  } as unknown as Store;
}

function dispositionState(disposition: Record<string, unknown>) {
  return {
    design_concern_dispositions: [disposition],
  };
}

const validArgs = {
  changeId: "change-1",
  taskId: "tk-1",
  concernKey: "dimension:site_design_consistency",
  disposition: "rejected_with_evidence" as const,
  evidence: "Legacy page, out of scope; fast-follow #123.",
};

const poisonedDescription = () => ({
  searchAttributes: {
    TemporalReportedProblems: [
      "category=WorkflowTaskFailed",
      "cause=WorkflowTaskFailedCauseNonDeterministicError",
    ],
  },
});

describe("adv_design_concern_disposition", () => {
  let tempDir: string | undefined;

  beforeEach(() => {
    mocks.workflowHandle.signal.mockReset();
    mocks.workflowHandle.signal.mockResolvedValue(undefined);
    mocks.workflowHandle.query.mockReset();
    mocks.workflowHandle.query.mockImplementation(
      (queryName: string, receiptId?: string) => {
        if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
          return Promise.resolve(receiptId ? { id: receiptId } : undefined);
        }
        return Promise.resolve({});
      },
    );
    mocks.workflowHandle.describe.mockReset();
    mocks.workflowHandle.describe.mockResolvedValue({ searchAttributes: {} });
    mocks.withTargetPathStore.mockReset();
    mocks.withTargetPathStore.mockImplementation(
      async (_input: unknown, _fn: unknown) => {
        throw new Error("withTargetPathStore not configured for this test");
      },
    );
  });

  test("fires designConcernDispositionedSignal with the typed disposition and commits projection", async () => {
    tempDir = await createTempDir("adv-design-concern-");
    const baseChange = change();
    await seedProjection(tempDir, baseChange);
    const store = storeFor(baseChange, tempDir);
    const expectedDisposition = {
      taskId: "tk-1",
      concernKey: "dimension:site_design_consistency",
      disposition: "rejected_with_evidence",
      evidence: "Legacy page, out of scope; fast-follow #123.",
      dispositionedAt: expect.any(String),
    };
    mocks.workflowHandle.query.mockImplementation(
      (queryName: string, receiptId?: string) => {
        if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
          return Promise.resolve(receiptId ? { id: receiptId } : undefined);
        }
        return Promise.resolve(dispositionState(expectedDisposition));
      },
    );

    const output = parse(
      await designConcernTools.adv_design_concern_disposition.execute(
        validArgs,
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.workflowHandle.signal).toHaveBeenCalledTimes(1);
    const signalArgs = mocks.workflowHandle.signal.mock.calls[0];
    expect(signalArgs[0]).toBe(designConcernDispositionedSignal);
    expect(signalArgs[1]).toMatchObject({
      taskId: "tk-1",
      concernKey: "dimension:site_design_consistency",
      disposition: "rejected_with_evidence",
      evidence: "Legacy page, out of scope; fast-follow #123.",
      mutationReceiptId: expect.stringMatching(/^mrec_/),
    });
    expect(mocks.workflowHandle.query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: CHANGE_WORKFLOW_QUERY_NAMES.getState,
      }),
    );
    const disk = await loadChange(tempDir, "change-1");
    expect(disk.success).toBe(true);
    expect(disk.data?.design_concern_dispositions).toHaveLength(1);
    expect(disk.data?.projection_revision).toBe(1);
  });

  test("rejects blank evidence", async () => {
    const store = storeFor(change());
    const output = parse(
      await designConcernTools.adv_design_concern_disposition.execute(
        { ...validArgs, evidence: "   " },
        store,
      ),
    );

    expect(output.error).toBeTruthy();
    expect(mocks.workflowHandle.signal).not.toHaveBeenCalled();
  });

  test("rejects an unknown disposition verb (no accepted_debt)", async () => {
    const store = storeFor(change());
    const output = parse(
      await designConcernTools.adv_design_concern_disposition.execute(
        { ...validArgs, disposition: "accepted_debt" as never },
        store,
      ),
    );

    expect(output.error).toBeTruthy();
    expect(mocks.workflowHandle.signal).not.toHaveBeenCalled();
  });

  test("rejects an unknown taskId", async () => {
    const store = storeFor(change());
    const output = parse(
      await designConcernTools.adv_design_concern_disposition.execute(
        { ...validArgs, taskId: "tk-missing" },
        store,
      ),
    );

    expect(output.error).toBeTruthy();
    expect(mocks.workflowHandle.signal).not.toHaveBeenCalled();
  });

  test("dryRun previews without firing the signal", async () => {
    const store = storeFor(change());
    const output = parse(
      await designConcernTools.adv_design_concern_disposition.execute(
        { ...validArgs, dryRun: true },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.dryRun).toBe(true);
    expect(mocks.workflowHandle.signal).not.toHaveBeenCalled();
  });

  test("recovers via disk projection when signal fails with completed workflow and stores re-deliverable payload", async () => {
    tempDir = await createTempDir("adv-design-concern-recovery-");
    const baseChange = change();
    await seedProjection(tempDir, baseChange);
    const store = storeFor(baseChange, tempDir);
    const completedError = new Error("workflow execution already completed");
    completedError.name = "WorkflowNotFoundError";
    mocks.workflowHandle.signal.mockRejectedValueOnce(completedError);

    const output = parse(
      await designConcernTools.adv_design_concern_disposition.execute(
        {
          ...validArgs,
          disposition: "fixed",
          evidence: "fixed in frontend commit abc123",
        },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output._recoveryMutation).toBe(true);
    expect(output.recovered).toBe(true);
    expect(output.recoveryMode).toBe("poisoned_history");
    expect(output.reconciliationWarning).toContain(
      "Poisoned-history recovery wrote the disk projection only",
    );
    const disk = await loadChange(tempDir, "change-1");
    expect(disk.success).toBe(true);
    expect(disk.data?.design_concern_dispositions).toHaveLength(1);
    expect(disk.data?.projection_revision).toBe(1);
    const audit = disk.data?.projection_commits?.[0];
    expect(audit?.authority_kind).toBe("recovery");
    expect(audit?.payload).toMatchObject({
      taskId: "tk-1",
      concernKey: "dimension:site_design_consistency",
      disposition: "fixed",
      evidence: "fixed in frontend commit abc123",
      mutationReceiptId: expect.stringMatching(/^mrec_/),
    });
  });

  test("recovers via D4 internal classification when describe shows poisoned", async () => {
    // Probe-first path: no signal is fired; the coordinator commits the
    // disposition to the disk projection based on machine-confirmed
    // poisoned-history evidence.
    tempDir = await createTempDir("adv-design-concern-recovery-");
    const baseChange = change();
    await seedProjection(tempDir, baseChange);
    const store = storeFor(baseChange, tempDir);
    mocks.workflowHandle.describe.mockResolvedValue(poisonedDescription());

    const output = parse(
      await designConcernTools.adv_design_concern_disposition.execute(
        {
          ...validArgs,
          disposition: "fixed",
          evidence: "fixed in frontend commit abc123",
        },
        store,
      ),
    );

    expect(mocks.workflowHandle.signal).not.toHaveBeenCalled();
    expect(output.success).toBe(true);
    expect(output.recoveryMode).toBe("poisoned_history");
    const disk = await loadChange(tempDir, "change-1");
    expect(disk.success).toBe(true);
    expect(disk.data?.design_concern_dispositions).toHaveLength(1);
    expect(disk.data?.projection_commits?.[0].authority_kind).toBe("recovery");
  });

  test("does not recover generic signal failures", async () => {
    const store = storeFor(change());
    mocks.workflowHandle.signal.mockRejectedValueOnce(
      new Error("task queue unavailable"),
    );

    const output = parse(
      await designConcernTools.adv_design_concern_disposition.execute(
        validArgs,
        store,
      ),
    );

    expect(output.code).toBe("DESIGN_CONSENT_MUTATION_OPERATOR_REQUIRED");
  });

  test("recovers when signal error indicates poisoned history even if describe is clean", async () => {
    tempDir = await createTempDir("adv-design-concern-recovery-");
    const baseChange = change();
    await seedProjection(tempDir, baseChange);
    const store = storeFor(baseChange, tempDir);
    mocks.workflowHandle.describe.mockResolvedValue({
      searchAttributes: { TemporalReportedProblems: [] },
    });
    mocks.workflowHandle.signal.mockRejectedValueOnce(
      new Error("Nondeterminism error detected"),
    );

    const output = parse(
      await designConcernTools.adv_design_concern_disposition.execute(
        validArgs,
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output._recoveryMutation).toBe(true);
    expect(output.recoveryMode).toBe("poisoned_history");
    const disk = await loadChange(tempDir, "change-1");
    expect(disk.data?.design_concern_dispositions).toHaveLength(1);
    expect(disk.data?.projection_commits?.[0].authority_kind).toBe("recovery");
  });
});
