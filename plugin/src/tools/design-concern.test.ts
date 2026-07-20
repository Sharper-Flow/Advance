import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Change } from "../types";
import type { Store } from "../storage/store-types";

const mocks = vi.hoisted(() => {
  const fireSignalAndRefresh = vi.fn(async () => undefined);
  const saveRecoveredDesignConcernDisposition = vi.fn(async () => undefined);
  const workflowHandle = { signal: vi.fn(), query: vi.fn() };
  return {
    fireSignalAndRefresh,
    saveRecoveredDesignConcernDisposition,
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
  saveRecoveredDesignConcernDisposition:
    mocks.saveRecoveredDesignConcernDisposition,
}));

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
        status: "in_progress",
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
  concernKey: "dimension:site_design_consistency",
  disposition: "rejected_with_evidence" as const,
  evidence: "Legacy page, out of scope; fast-follow #123.",
};

describe("adv_design_concern_disposition", () => {
  beforeEach(() => {
    mocks.fireSignalAndRefresh.mockClear();
    mocks.fireSignalAndRefresh.mockImplementation(async () => undefined);
    mocks.saveRecoveredDesignConcernDisposition.mockClear();
  });

  test("fires designConcernDispositionedSignal with the typed disposition", async () => {
    const store = storeFor(change());
    const output = parse(
      await designConcernTools.adv_design_concern_disposition.execute(
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
      concernKey: "dimension:site_design_consistency",
      disposition: "rejected_with_evidence",
      evidence: "Legacy page, out of scope; fast-follow #123.",
    });
    expect(typeof signalArgs[4].dispositionedAt).toBe("string");
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
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
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
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
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
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
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
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("recovers through disk projection when completed workflow evidence is explicit", async () => {
    // Probe-first (rq-extend-poisoned-recovery AC5): precise recoveryEvidence
    // triggers the disk-direct recovery path BEFORE the signal fires. The
    // observable contract — disk-direct writer called with the typed
    // disposition + operator authorization, output reports recovery — is the
    // same as the prior catch-branch path; only the trigger changed.
    const store = storeFor(change());

    const output = parse(
      await designConcernTools.adv_design_concern_disposition.execute(
        {
          ...validArgs,
          disposition: "fixed",
          evidence: "fixed in frontend commit abc123",
          recoveryMode: "poisoned_history",
          recoveryEvidence:
            "WorkflowNotFoundError: workflow execution already completed",
          recoveryReason:
            "Completed workflow cannot accept designConcernDispositionedSignal; acceptance evidence proves fix.",
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
    expect(mocks.saveRecoveredDesignConcernDisposition).toHaveBeenCalledWith({
      store,
      change: expect.objectContaining({ id: "change-1" }),
      authorization: {
        reason:
          "Completed workflow cannot accept designConcernDispositionedSignal; acceptance evidence proves fix.",
        evidence: "WorkflowNotFoundError: workflow execution already completed",
      },
      disposition: expect.objectContaining({
        taskId: "tk-1",
        concernKey: "dimension:site_design_consistency",
        disposition: "fixed",
        evidence: "fixed in frontend commit abc123",
      }),
    });
  });

  test("does not recover generic signal failures in normal mode", async () => {
    // Under probe-first semantics (rq-extend-poisoned-recovery AC5), precise
    // recoveryEvidence always wins and the catch-branch becomes unreachable
    // end-to-end. This test guards the still-valid normal-mode contract: with
    // recoveryMode="normal", generic signal errors propagate as errors and no
    // recovery writer fires. The catch-branch remains as defense-in-depth for
    // a future where probe-first might be removed.
    const store = storeFor(change());
    mocks.fireSignalAndRefresh.mockRejectedValueOnce(
      new Error("task queue unavailable"),
    );

    const output = parse(
      await designConcernTools.adv_design_concern_disposition.execute(
        {
          ...validArgs,
          recoveryMode: "normal",
        },
        store,
      ),
    );

    expect(output.error).toContain("task queue unavailable");
    expect(mocks.saveRecoveredDesignConcernDisposition).not.toHaveBeenCalled();
  });

  test("requires precise recovery evidence and reason before recovery", async () => {
    const store = storeFor(change());
    const output = parse(
      await designConcernTools.adv_design_concern_disposition.execute(
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
      await designConcernTools.adv_design_concern_disposition.execute(
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

  test("AC5: takes probe-first recovery path when fireSignalAndRefresh would silently resolve", async () => {
    // Poisoned replay case (issue #198, #253): fireSignalAndRefresh resolves
    // silently because Temporal signals are fire-and-forget server-acceptance.
    // The catch-branch never fires for this case, so the probe-first gate
    // must short-circuit BEFORE the signal call.
    const store = storeFor(change());

    const output = parse(
      await designConcernTools.adv_design_concern_disposition.execute(
        {
          ...validArgs,
          disposition: "fixed",
          evidence: "test evidence",
          recoveryMode: "poisoned_history",
          recoveryEvidence:
            "WorkflowNotFoundError: workflow execution already completed",
          recoveryReason: "poisoned workflow",
        },
        store,
      ),
    );

    // CRITICAL: probe-first path taken; fireSignalAndRefresh NOT called.
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    // Disk-direct writer WAS called.
    expect(mocks.saveRecoveredDesignConcernDisposition).toHaveBeenCalledTimes(
      1,
    );
    // Output still reports a successful recovery.
    expect(output.success).toBe(true);
    expect(output.recoveryMode).toBe("poisoned_history");
  });
});
