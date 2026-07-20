import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Change } from "../types";
import type { Store } from "../storage/store-types";

const mocks = vi.hoisted(() => {
  const fireSignalAndRefresh = vi.fn(async () => undefined);
  const saveRecoveredVerificationEvidenceDisposition = vi.fn(
    async () => undefined,
  );
  const workflowHandle = { signal: vi.fn(), query: vi.fn() };
  return {
    fireSignalAndRefresh,
    saveRecoveredVerificationEvidenceDisposition,
    workflowHandle,
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

  test("recovers through disk projection when completed workflow evidence is explicit", async () => {
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
          recoveryMode: "poisoned_history",
          recoveryEvidence:
            "WorkflowNotFoundError: workflow execution already completed",
          recoveryReason:
            "Completed workflow cannot accept verificationEvidenceDispositionedSignal; durable evidence proves the gap is resolved.",
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
        reason:
          "Completed workflow cannot accept verificationEvidenceDispositionedSignal; durable evidence proves the gap is resolved.",
        evidence: "WorkflowNotFoundError: workflow execution already completed",
      },
      disposition: expect.objectContaining({
        taskId: "tk-1",
        concernKey: "verification",
        disposition: "fixed",
        evidence: "verification re-run and captured in commit abc123",
      }),
    });
  });

  test("AC5: takes probe-first recovery path when fireSignalAndRefresh would silently resolve", async () => {
    // Setup: default mock for fireSignalAndRefresh RESOLVES (set in beforeEach).
    // This simulates a fire-and-forget signal on a poisoned workflow: the
    // server accepts the signal, but the workflow silently drops it during
    // replay. The catch-branch is unreachable; only the probe-first path
    // can save the disposition via the disk-direct writer.
    const store = storeFor(change());

    const output = parse(
      await verificationEvidenceTools.adv_verification_evidence_disposition.execute(
        {
          ...validArgs,
          disposition: "fixed",
          evidence: "verification re-run and captured in commit abc123",
          recoveryMode: "poisoned_history",
          recoveryEvidence:
            "WorkflowNotFoundError: workflow execution already completed",
          recoveryReason: "poisoned workflow",
        },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.recoveryMode).toBe("poisoned_history");
    // CRITICAL: probe-first path was taken; fireSignalAndRefresh was NOT called.
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    // Disk-direct writer WAS called with the operator-supplied evidence.
    expect(
      mocks.saveRecoveredVerificationEvidenceDisposition,
    ).toHaveBeenCalledTimes(1);
    expect(
      mocks.saveRecoveredVerificationEvidenceDisposition.mock.calls[0][0]
        .authorization.evidence,
    ).toContain("WorkflowNotFoundError");
  });

  test("does not recover generic signal failures when recovery is not requested", async () => {
    const store = storeFor(change());
    mocks.fireSignalAndRefresh.mockRejectedValueOnce(
      new Error("task queue unavailable"),
    );

    const output = parse(
      await verificationEvidenceTools.adv_verification_evidence_disposition.execute(
        {
          ...validArgs,
          // recoveryMode omitted: probe-first does not fire, and the
          // catch-branch's recovery gate (recoveryMode === "poisoned_history")
          // is false, so the generic signal error must propagate.
        },
        store,
      ),
    );

    expect(output.error).toContain("task queue unavailable");
    expect(
      mocks.saveRecoveredVerificationEvidenceDisposition,
    ).not.toHaveBeenCalled();
  });

  test("requires precise recovery evidence and reason before recovery", async () => {
    const store = storeFor(change());
    const output = parse(
      await verificationEvidenceTools.adv_verification_evidence_disposition.execute(
        {
          ...validArgs,
          recoveryMode: "poisoned_history",
          recoveryEvidence: "it failed",
          recoveryReason: "completed workflow recovery",
        },
        store,
      ),
    );

    expect(output.error).toContain("precise poisoned-history");
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("requires recovery reason before recovery", async () => {
    const store = storeFor(change());
    const output = parse(
      await verificationEvidenceTools.adv_verification_evidence_disposition.execute(
        {
          ...validArgs,
          recoveryMode: "poisoned_history",
          recoveryEvidence:
            "WorkflowNotFoundError: workflow execution already completed",
          recoveryReason: "   ",
        },
        store,
      ),
    );

    expect(output.error).toContain("requires recoveryReason");
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });
});
