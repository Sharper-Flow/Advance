import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Change } from "../types";
import type { Store } from "../storage/store-types";

const mocks = vi.hoisted(() => {
  const fireSignalAndRefresh = vi.fn(async () => undefined);
  const saveRecoveredVerificationEvidenceDisposition = vi.fn(
    async () => undefined,
  );
  const describe = vi.fn(async () => ({ searchAttributes: {} }));
  const workflowHandle = { signal: vi.fn(), query: vi.fn(), describe };
  const withTargetPathStore = vi.fn(async (_input: unknown, _fn: unknown) => {
    throw new Error("withTargetPathStore not configured for this test");
  });
  return {
    fireSignalAndRefresh,
    saveRecoveredVerificationEvidenceDisposition,
    workflowHandle,
    withTargetPathStore,
  };
});

vi.mock("./_adapters", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./_adapters")>()),
  fireSignalAndRefresh: mocks.fireSignalAndRefresh,
  getChangeHandle: () => mocks.workflowHandle,
}));

vi.mock("../temporal/service", () => ({
  getService: () => ({ client: { workflow: { getHandle: vi.fn() } } }),
}));

vi.mock("../utils/project-id", () => ({
  getProjectId: async () => "project-1",
}));

vi.mock("./_recovery-writers", () => ({
  saveRecoveredVerificationEvidenceDisposition:
    mocks.saveRecoveredVerificationEvidenceDisposition,
}));

vi.mock("./target-project", async (importOriginal) => {
  const original = await importOriginal<typeof import("./target-project")>();
  return {
    ...original,
    withTargetPathStore: mocks.withTargetPathStore,
  };
});

import { verificationEvidenceTools } from "./verification-evidence";

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
        evidence_policy: "test",
      },
    ],
    deltas: {},
    wisdom: [],
    gates: {} as Change["gates"],
    ...overrides,
  } as Change;
}

function storeFor(baseChange: Change): Store {
  return {
    paths: { root: "/repo", agenda: "/state/agenda.jsonl" } as Store["paths"],
    config: null,
    changes: {
      get: vi.fn(async () => ({ success: true, data: baseChange })),
      refresh: vi.fn(async () => undefined),
    },
  } as unknown as Store;
}

const validArgs = {
  changeId: "change-1",
  taskId: "tk-1",
  concernKey: "verification",
  disposition: "rejected_with_evidence" as const,
  evidence: "adv_run_test evidence captured under run id tr_abc123.",
};

const poisonedDescription = () => ({
  searchAttributes: {
    TemporalReportedProblems: [
      "category=WorkflowTaskFailed",
      "cause=WorkflowTaskFailedCauseNonDeterministicError",
    ],
  },
});

describe("adv_verification_evidence_disposition", () => {
  beforeEach(() => {
    // mockReset (not mockClear) clears one-time implementations set via
    // mockRejectedValueOnce/mockResolvedValueOnce from prior tests; under the
    // probe-first pattern some tests no longer consume their once-queue entries.
    mocks.fireSignalAndRefresh.mockReset();
    mocks.fireSignalAndRefresh.mockImplementation(async () => undefined);
    mocks.saveRecoveredVerificationEvidenceDisposition.mockReset();
    mocks.saveRecoveredVerificationEvidenceDisposition.mockImplementation(
      async () => undefined,
    );
    mocks.withTargetPathStore.mockReset();
    mocks.withTargetPathStore.mockImplementation(
      async (_input: unknown, _fn: unknown) => {
        throw new Error("withTargetPathStore not configured for this test");
      },
    );
    mocks.workflowHandle.describe.mockReset();
    mocks.workflowHandle.describe.mockResolvedValue({ searchAttributes: {} });
  });

  test("fires verificationEvidenceDispositionedSignal with the typed disposition", async () => {
    const store = storeFor(change());
    const output = parse(
      await verificationEvidenceTools.adv_verification_evidence_disposition.execute(
        validArgs,
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    const signalArgs = mocks.fireSignalAndRefresh.mock.calls[0];
    // (handle, store, changeId, signal, payload)
    expect(signalArgs[2]).toBe("change-1");
    expect(signalArgs[4]).toMatchObject({
      taskId: "tk-1",
      concernKey: "verification",
      disposition: "rejected_with_evidence",
      evidence: "adv_run_test evidence captured under run id tr_abc123.",
    });
    expect(typeof signalArgs[4].dispositionedAt).toBe("string");
  });

  test("rejects blank evidence", async () => {
    const store = storeFor(change());
    const output = parse(
      await verificationEvidenceTools.adv_verification_evidence_disposition.execute(
        { ...validArgs, evidence: "   " },
        store,
      ),
    );

    expect(output.error).toBeTruthy();
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("rejects an unknown disposition verb (no accepted_debt)", async () => {
    const store = storeFor(change());
    const output = parse(
      await verificationEvidenceTools.adv_verification_evidence_disposition.execute(
        { ...validArgs, disposition: "accepted_debt" as never },
        store,
      ),
    );

    expect(output.error).toBeTruthy();
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("rejects an unknown taskId", async () => {
    const store = storeFor(change());
    const output = parse(
      await verificationEvidenceTools.adv_verification_evidence_disposition.execute(
        { ...validArgs, taskId: "tk-missing" },
        store,
      ),
    );

    expect(output.error).toBeTruthy();
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("dryRun previews without firing the signal", async () => {
    const store = storeFor(change());
    const output = parse(
      await verificationEvidenceTools.adv_verification_evidence_disposition.execute(
        { ...validArgs, dryRun: true },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.dryRun).toBe(true);
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("recovers via disk projection when signal fails with completed workflow", async () => {
    const store = storeFor(change());
    const completedError = new Error("workflow execution already completed");
    completedError.name = "WorkflowNotFoundError";
    mocks.fireSignalAndRefresh.mockRejectedValueOnce(completedError);

    const output = parse(
      await verificationEvidenceTools.adv_verification_evidence_disposition.execute(
        {
          ...validArgs,
          disposition: "fixed",
          evidence: "verification re-run and captured in commit abc123",
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
    expect(
      mocks.saveRecoveredVerificationEvidenceDisposition,
    ).toHaveBeenCalledWith({
      store,
      change: expect.objectContaining({ id: "change-1" }),
      authorization: {
        reason: "missing_workflow",
        evidence: expect.stringContaining(
          "workflow execution already completed",
        ),
      },
      disposition: expect.objectContaining({
        taskId: "tk-1",
        concernKey: "verification",
        disposition: "fixed",
        evidence: "verification re-run and captured in commit abc123",
      }),
    });
  });

  test("recovers via D4 internal classification when describe shows poisoned", async () => {
    // Probe-first path: no signal is fired; the disk-direct writer saves the
    // disposition based on machine-confirmed poisoned-history evidence.
    mocks.workflowHandle.describe.mockResolvedValue(poisonedDescription());

    const store = storeFor(change());
    const output = parse(
      await verificationEvidenceTools.adv_verification_evidence_disposition.execute(
        {
          ...validArgs,
          disposition: "fixed",
          evidence: "verification re-run and captured in commit abc123",
        },
        store,
      ),
    );

    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    expect(
      mocks.saveRecoveredVerificationEvidenceDisposition,
    ).toHaveBeenCalledTimes(1);
    expect(output.success).toBe(true);
    expect(output.recoveryMode).toBe("poisoned_history");
    expect(
      mocks.saveRecoveredVerificationEvidenceDisposition,
    ).toHaveBeenCalledWith({
      store,
      change: expect.objectContaining({ id: "change-1" }),
      authorization: {
        reason: "poisoned_history",
        evidence: expect.stringContaining(
          "WorkflowTaskFailedCauseNonDeterministicError",
        ),
      },
      disposition: expect.objectContaining({
        taskId: "tk-1",
        concernKey: "verification",
        disposition: "fixed",
        evidence: "verification re-run and captured in commit abc123",
      }),
    });
  });

  test("proceeds with signal when describe is healthy", async () => {
    const store = storeFor(change());
    mocks.workflowHandle.describe.mockResolvedValue({
      searchAttributes: { TemporalReportedProblems: [] },
    });

    const output = parse(
      await verificationEvidenceTools.adv_verification_evidence_disposition.execute(
        validArgs,
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    expect(
      mocks.saveRecoveredVerificationEvidenceDisposition,
    ).not.toHaveBeenCalled();
  });

  test("does not recover generic signal failures", async () => {
    const store = storeFor(change());
    mocks.fireSignalAndRefresh.mockRejectedValueOnce(
      new Error("task queue unavailable"),
    );

    const output = parse(
      await verificationEvidenceTools.adv_verification_evidence_disposition.execute(
        validArgs,
        store,
      ),
    );

    expect(output.code).toBe(
      "VERIFICATION_EVIDENCE_MUTATION_OPERATOR_REQUIRED",
    );
    expect(output.cause).toBe("query_failed");
    expect(
      mocks.saveRecoveredVerificationEvidenceDisposition,
    ).not.toHaveBeenCalled();
  });

  test("requires operator review when poisoned signal error is not confirmed by describe", async () => {
    const store = storeFor(change());
    const poisonedError = new Error("Nondeterminism error detected");
    mocks.fireSignalAndRefresh.mockRejectedValueOnce(poisonedError);
    // describe() returns a healthy workflow — two authorities disagree.
    mocks.workflowHandle.describe.mockResolvedValue({
      searchAttributes: { TemporalReportedProblems: [] },
    });

    const output = parse(
      await verificationEvidenceTools.adv_verification_evidence_disposition.execute(
        validArgs,
        store,
      ),
    );

    expect(output.error).toContain("operator review");
    expect(output.code).toBe(
      "VERIFICATION_EVIDENCE_MUTATION_OPERATOR_REQUIRED",
    );
    expect(output.cause).toBe("reachable_authority_disagrees");
    expect(
      mocks.saveRecoveredVerificationEvidenceDisposition,
    ).not.toHaveBeenCalled();
  });

  test("AC3: target_path routes D4 recovery write to the target disk projection", async () => {
    mocks.workflowHandle.describe.mockResolvedValue(poisonedDescription());

    const drivingStore = storeFor(change());
    const targetChange = change();
    const targetStore = storeFor(targetChange);
    targetStore.paths = {
      ...targetStore.paths,
      root: "/target-project",
      changes: "/target-project/.adv/changes",
    } as Store["paths"];

    mocks.withTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/target-project",
          projectId: "target-project-id",
          trusted: true,
          trustSource: "explicit",
          stateMode: "temporal",
        },
        store: targetStore,
      }),
    );

    let capturedStore: Store | undefined;
    mocks.saveRecoveredVerificationEvidenceDisposition.mockImplementationOnce(
      async (input: { store: Store }) => {
        capturedStore = input.store;
        return undefined;
      },
    );

    const output = parse(
      await verificationEvidenceTools.adv_verification_evidence_disposition.execute(
        {
          ...validArgs,
          target_path: "/target-project",
          target_confirmed: true,
          confirmationEvidence:
            "User approved target mutation via question tool",
        },
        drivingStore,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        target_path: "/target-project",
        target_confirmed: true,
        confirmationEvidence: "User approved target mutation via question tool",
        stateRequirement: "temporal-required",
      }),
      expect.any(Function),
    );
    expect(capturedStore).toBe(targetStore);
    expect(capturedStore).not.toBe(drivingStore);
    expect(capturedStore?.paths.root).toBe("/target-project");
    expect(capturedStore?.paths.changes).toBe("/target-project/.adv/changes");
  });
});
