/**
 * Tool Adapter Tests
 *
 * TDD tests for _adapters.ts helpers against mocked Temporal client.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  fireSignal,
  querySignal,
  fireSignalAndQuery,
  fireSignalAndRefresh,
  getChangeHandle,
  startChangeWorkflow,
  isChangeReachable,
  waitForGateCompletion,
  waitForAppliedReceipt,
  waitForQueryPredicate,
  MutationApplicationUnconfirmedError,
  type ReachabilityDeps,
} from "./_adapters";

describe("readiness mutation receipts", () => {
  test("waitForQueryPredicate returns first value satisfying predicate", async () => {
    const query = vi
      .fn<() => Promise<number>>()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    await expect(
      waitForQueryPredicate(query, (value) => value === 2, {
        attempts: 2,
        delayMs: 0,
      }),
    ).resolves.toBe(2);
    expect(query).toHaveBeenCalledTimes(2);
  });

  test("waitForAppliedReceipt confirms exact receipt identity", async () => {
    const handle = createMockHandle();
    handle.query.mockResolvedValue({
      id: "mrec_exact",
      signalName: "contractReviewMatrixSet",
      recordedAt: "2026-07-19T20:00:00.000Z",
    });
    await expect(
      waitForAppliedReceipt(handle as never, "mrec_exact", {
        attempts: 1,
        delayMs: 0,
      }),
    ).resolves.toMatchObject({ id: "mrec_exact" });
  });

  test("fireSignalAndRefresh refuses success when receipt is unconfirmed", async () => {
    vi.useFakeTimers();
    const handle = createMockHandle();
    handle.query.mockResolvedValue(undefined);
    const refresh = vi.fn();
    const store = { changes: { refresh } } as never;
    const pending = fireSignalAndRefresh(
      handle as never,
      store,
      "chg",
      {},
      {
        mutationReceiptId: "mrec_missing",
      },
    );
    const assertion = expect(pending).rejects.toBeInstanceOf(
      MutationApplicationUnconfirmedError,
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(refresh).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// Mock the workflow-start module so startChangeWorkflow is testable
vi.mock("../temporal/workflow-start", () => ({
  ensureChangeWorkflowStarted: vi.fn(),
}));

import { ensureChangeWorkflowStarted } from "../temporal/workflow-start";

function createMockHandle(): {
  query: ReturnType<typeof vi.fn>;
  signal: ReturnType<typeof vi.fn>;
  executeUpdate: ReturnType<typeof vi.fn>;
} {
  return {
    query: vi.fn(),
    signal: vi.fn(),
    executeUpdate: vi.fn(),
  };
}

function createMockClient(handle: ReturnType<typeof createMockHandle>): {
  workflow: {
    getHandle: ReturnType<typeof vi.fn>;
    start?: ReturnType<typeof vi.fn>;
  };
} {
  return {
    workflow: {
      getHandle: vi.fn(() => handle),
      start: vi.fn(),
    },
  };
}

function createMockStoreInput(handle: ReturnType<typeof createMockHandle>) {
  return {
    projectId: "proj-123",
    legacy: {
      changes: {
        get: vi.fn(async () => ({
          success: true,
          data: { adv_project_id: "proj-123" },
        })),
      },
    },
    temporal: {
      client: {
        workflow: {
          getHandle: vi.fn(() => handle),
        },
      },
    },
  };
}

function createMockStore(): {
  changes: { refresh: ReturnType<typeof vi.fn> };
} {
  return {
    changes: {
      refresh: vi.fn(async () => undefined),
    },
  };
}

describe("_adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fireSignal", () => {
    test("fires signal with payload", async () => {
      const handle = createMockHandle();
      const signalDef = { name: "testSignal" };
      const payload = { foo: "bar" };

      await fireSignal(handle, signalDef, payload);

      expect(handle.signal).toHaveBeenCalledTimes(1);
      expect(handle.signal).toHaveBeenCalledWith(signalDef, payload);
    });

    test("fires signal with multiple args", async () => {
      const handle = createMockHandle();
      const signalDef = { name: "multiArgSignal" };

      await fireSignal(handle, signalDef, "arg1", 42, { nested: true });

      expect(handle.signal).toHaveBeenCalledWith(signalDef, "arg1", 42, {
        nested: true,
      });
    });

    test("rejects when handle.signal throws", async () => {
      const handle = createMockHandle();
      // 'signal failed' does not match any SC4 mutation-ineligible regex
      // (no poller/unregistered-query/deadline/query-rejected/permission/
      // resource-exhaustion/TMPRL1100), so it falls through to the
      // `unknown` class and the SC4 guard surfaces a typed
      // `TemporalMutationIneligibleError`. This proves every signal
      // dispatch is funneled through the guard, even for unrecognized
      // error shapes.
      handle.signal.mockRejectedValue(new Error("signal failed"));
      const { TemporalMutationIneligibleError } =
        await import("../temporal/mutation-safety");
      await expect(
        fireSignal(handle, { name: "bad" }, {}),
      ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);
    });

    test("resolves a guarded workflow handle from store input", async () => {
      const handle = createMockHandle();
      const input = createMockStoreInput(handle);
      const signalDef = { name: "taskAdded" };
      const payload = { taskId: "tk-1" };

      await fireSignal(input, "chg-456", signalDef, payload);

      expect(input.legacy.changes.get).toHaveBeenCalledWith("chg-456");
      expect(input.temporal.client.workflow.getHandle).toHaveBeenCalledWith(
        "adv/change/proj-123/chg-456",
      );
      expect(handle.signal).toHaveBeenCalledWith(signalDef, payload);
    });

    test("SC4: no_poller signal error → throws TemporalMutationIneligibleError", async () => {
      const handle = createMockHandle();
      handle.signal.mockRejectedValue(
        new Error("no poller is currently polling this task queue"),
      );
      const { TemporalMutationIneligibleError } =
        await import("../temporal/mutation-safety");
      await expect(
        fireSignal(handle, { name: "sc4-no-poller" }, {}),
      ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);
    });

    test("SC4: deadline signal error → throws TemporalMutationIneligibleError", async () => {
      const handle = createMockHandle();
      handle.signal.mockRejectedValue(new Error("deadline exceeded"));
      const { TemporalMutationIneligibleError } =
        await import("../temporal/mutation-safety");
      await expect(
        fireSignal(handle, { name: "sc4-deadline" }, {}),
      ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);
    });

    test("SC4: 'Failed to query Workflow' signal error → throws TemporalMutationIneligibleError (unknown class)", async () => {
      const handle = createMockHandle();
      handle.signal.mockRejectedValue(
        new Error("Failed to query Workflow: changeStateQuery"),
      );
      const { TemporalMutationIneligibleError } =
        await import("../temporal/mutation-safety");
      await expect(
        fireSignal(handle, { name: "sc4-unknown-query" }, {}),
      ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);
    });

    test("SC4: 'workflow execution already completed' signal error passes through (not_found is SC4-pass)", async () => {
      const handle = createMockHandle();
      handle.signal.mockRejectedValue(
        new Error("workflow execution already completed"),
      );
      const { TemporalMutationIneligibleError } =
        await import("../temporal/mutation-safety");
      // Must NOT be an ineligibility error: not_found is intentionally
      // not blocked by SC4 — the caller is responsible for surgical
      // recovery (e.g. adv_change_status_repair / adv_archive_repair).
      await expect(
        fireSignal(handle, { name: "sc4-pass-not-found" }, {}),
      ).rejects.not.toBeInstanceOf(TemporalMutationIneligibleError);
    });
  });

  describe("querySignal", () => {
    test("returns query result", async () => {
      const handle = createMockHandle();
      const expected = { state: "active", tasks: [] };
      handle.query.mockResolvedValue(expected);

      const result = await querySignal(handle, { name: "getState" });

      expect(handle.query).toHaveBeenCalledTimes(1);
      expect(handle.query).toHaveBeenCalledWith({ name: "getState" });
      expect(result).toEqual(expected);
    });

    test("passes query args through", async () => {
      const handle = createMockHandle();
      handle.query.mockResolvedValue("result");

      await querySignal(handle, { name: "getTask" }, "task-123");

      expect(handle.query).toHaveBeenCalledWith(
        { name: "getTask" },
        "task-123",
      );
    });

    test("rejects when handle.query throws", async () => {
      const handle = createMockHandle();
      handle.query.mockRejectedValue(new Error("query failed"));

      await expect(querySignal(handle, { name: "bad" })).rejects.toThrow(
        "query failed",
      );
    });

    test("queries via a guarded workflow handle from store input", async () => {
      const handle = createMockHandle();
      const input = createMockStoreInput(handle);
      handle.query.mockResolvedValue({ tasks: [] });

      await expect(
        querySignal(input, "chg-456", { name: "getTasks" }, "done"),
      ).resolves.toEqual({ tasks: [] });

      expect(input.temporal.client.workflow.getHandle).toHaveBeenCalledWith(
        "adv/change/proj-123/chg-456",
      );
      expect(handle.query).toHaveBeenCalledWith({ name: "getTasks" }, "done");
    });
  });

  describe("fireSignalAndQuery", () => {
    test("fires signal then queries for fresh state", async () => {
      const handle = createMockHandle();
      const freshState = { status: "active", gates: {} };
      handle.query.mockResolvedValue(freshState);

      const result = await fireSignalAndQuery(
        handle,
        { name: "gateCompleted" },
        [{ gateId: "proposal" }],
        { name: "getState" },
      );

      // Signal must be called before query
      expect(handle.signal).toHaveBeenCalledTimes(1);
      expect(handle.signal).toHaveBeenCalledWith(
        { name: "gateCompleted" },
        { gateId: "proposal" },
      );
      expect(handle.query).toHaveBeenCalledTimes(1);
      expect(handle.query).toHaveBeenCalledWith({ name: "getState" });
      expect(result).toEqual(freshState);
    });

    test("passes query args after signal args", async () => {
      const handle = createMockHandle();
      handle.query.mockResolvedValue("task-result");

      await fireSignalAndQuery(
        handle,
        { name: "taskAdded" },
        [{ taskId: "tk-1" }],
        { name: "getTask" },
        "tk-1",
      );

      expect(handle.signal).toHaveBeenCalledWith(
        { name: "taskAdded" },
        { taskId: "tk-1" },
      );
      expect(handle.query).toHaveBeenCalledWith({ name: "getTask" }, "tk-1");
    });

    test("rejects if signal fails without querying", async () => {
      const handle = createMockHandle();
      // 'network reset' falls through to the SC4 `unknown` class — the
      // guard fires, so the call surfaces a typed
      // `TemporalMutationIneligibleError`.
      handle.signal.mockRejectedValue(new Error("network reset"));
      const { TemporalMutationIneligibleError } =
        await import("../temporal/mutation-safety");

      await expect(
        fireSignalAndQuery(handle, { name: "bad" }, [{}], { name: "getState" }),
      ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);

      expect(handle.query).not.toHaveBeenCalled();
    });

    test("fires then queries through store input", async () => {
      const handle = createMockHandle();
      const input = createMockStoreInput(handle);
      handle.query.mockResolvedValue({ fresh: true });

      const result = await fireSignalAndQuery(
        input,
        "chg-456",
        { name: "taskCompleted" },
        [{ taskId: "tk-1" }],
        { name: "getState" },
      );

      expect(handle.signal).toHaveBeenCalledWith(
        { name: "taskCompleted" },
        { taskId: "tk-1" },
      );
      expect(handle.query).toHaveBeenCalledWith({ name: "getState" });
      expect(result).toEqual({ fresh: true });
    });
  });

  describe("fireSignalAndRefresh", () => {
    test("fires signal then refreshes cache (handle form)", async () => {
      const handle = createMockHandle();
      const store = createMockStore();
      const signalDef = { name: "taskAdded" };
      const payload = { taskId: "tk-1" };

      await fireSignalAndRefresh(
        handle,

        store as any,
        "chg-456",
        signalDef,
        payload,
      );

      expect(handle.signal).toHaveBeenCalledTimes(1);
      expect(handle.signal).toHaveBeenCalledWith(signalDef, payload);
      expect(store.changes.refresh).toHaveBeenCalledTimes(1);
      expect(store.changes.refresh).toHaveBeenCalledWith("chg-456");

      // Order: signal MUST be called before refresh
      const signalOrder = handle.signal.mock.invocationCallOrder[0];
      const refreshOrder = store.changes.refresh.mock.invocationCallOrder[0];
      expect(signalOrder).toBeLessThan(refreshOrder);
    });

    test("fires signal then refreshes cache (input form)", async () => {
      const handle = createMockHandle();
      const input = createMockStoreInput(handle);
      const store = createMockStore();
      const signalDef = { name: "wisdomAdded" };
      const payload = { content: "lesson" };

      await fireSignalAndRefresh(
        input,

        store as any,
        "chg-789",
        signalDef,
        payload,
      );

      expect(input.legacy.changes.get).toHaveBeenCalledWith("chg-789");
      expect(handle.signal).toHaveBeenCalledWith(signalDef, payload);
      expect(store.changes.refresh).toHaveBeenCalledWith("chg-789");
    });

    test("does NOT refresh when signal fails", async () => {
      const handle = createMockHandle();
      const store = createMockStore();
      // 'network reset' falls through to SC4 `unknown` → guard fires.
      handle.signal.mockRejectedValue(new Error("network reset"));
      const { TemporalMutationIneligibleError } =
        await import("../temporal/mutation-safety");

      await expect(
        fireSignalAndRefresh(
          handle,

          store as any,
          "chg-1",
          { name: "bad" },
          {},
        ),
      ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);

      expect(store.changes.refresh).not.toHaveBeenCalled();
    });

    test("propagates refresh failure (contract: store.refresh should never throw)", async () => {
      // The store contract guarantees refresh is best-effort and does not
      // throw in production. If it ever does (contract violation), the
      // helper propagates so callers can see the bug rather than swallowing.
      const handle = createMockHandle();
      const store = createMockStore();
      store.changes.refresh.mockRejectedValue(
        new Error("contract violation: refresh threw"),
      );

      await expect(
        fireSignalAndRefresh(
          handle,

          store as any,
          "chg-1",
          { name: "ok" },
          {},
        ),
      ).rejects.toThrow("contract violation: refresh threw");

      // Signal still fired before the refresh attempt
      expect(handle.signal).toHaveBeenCalled();
      expect(store.changes.refresh).toHaveBeenCalled();
    });

    test("passes through multiple signal args", async () => {
      const handle = createMockHandle();
      const store = createMockStore();

      await fireSignalAndRefresh(
        handle,

        store as any,
        "chg-2",
        { name: "multiArg" },
        "arg1",
        42,
        { nested: true },
      );

      expect(handle.signal).toHaveBeenCalledWith(
        { name: "multiArg" },
        "arg1",
        42,
        { nested: true },
      );
      expect(store.changes.refresh).toHaveBeenCalledWith("chg-2");
    });
  });

  describe("getChangeHandle", () => {
    test("builds correct workflowId and returns handle", () => {
      const handle = createMockHandle();
      const client = createMockClient(handle);

      const result = getChangeHandle(client, "proj-123", "chg-456");

      expect(client.workflow.getHandle).toHaveBeenCalledTimes(1);
      expect(client.workflow.getHandle).toHaveBeenCalledWith(
        "adv/change/proj-123/chg-456",
      );
      expect(result).toBe(handle);
    });
  });

  describe("startChangeWorkflow", () => {
    test("delegates to ensureChangeWorkflowStarted", async () => {
      const handle = createMockHandle();
      const client = createMockClient(handle);
      vi.mocked(ensureChangeWorkflowStarted).mockResolvedValue(handle);

      const input = {
        projectId: "proj-abc",
        changeId: "chg-def",
        title: "Test Change",
        initializedAt: new Date().toISOString(),
      };

      const result = await startChangeWorkflow(client, input);

      expect(ensureChangeWorkflowStarted).toHaveBeenCalledTimes(1);
      expect(result).toBe(handle);
    });

    test("throws when client lacks workflow.start", async () => {
      const client = {
        workflow: {
          getHandle: vi.fn(),
          // start is intentionally missing
        },
      } as unknown as Parameters<typeof startChangeWorkflow>[0];

      await expect(
        startChangeWorkflow(client, {
          projectId: "p",
          changeId: "c",
          title: "t",
          initializedAt: "now",
        }),
      ).rejects.toThrow("does not expose workflow.start");
    });
  });
});

describe("isChangeReachable", () => {
  const changesDir = "/data/changes";

  function createDeps(
    overrides: Partial<ReachabilityDeps> = {},
  ): ReachabilityDeps {
    return {
      visibilityLister: vi.fn(async () => false),
      diskChecker: vi.fn(async () => false),
      workflowStateGetter: vi.fn(async () => false),
      ...overrides,
    };
  }

  test("visibility hit returns true without touching disk or workflow", async () => {
    const deps = createDeps({
      visibilityLister: vi.fn(async () => true),
    });

    const result = await isChangeReachable(
      "proj-123",
      "chg-456",
      deps,
      changesDir,
    );

    expect(result).toBe(true);
    expect(deps.visibilityLister).toHaveBeenCalledExactlyOnceWith(
      "proj-123",
      "chg-456",
    );
    expect(deps.diskChecker).not.toHaveBeenCalled();
    expect(deps.workflowStateGetter).not.toHaveBeenCalled();
  });

  test("visibility miss + disk hit returns true without workflow", async () => {
    const deps = createDeps({
      visibilityLister: vi.fn(async () => false),
      diskChecker: vi.fn(async () => true),
    });

    const result = await isChangeReachable(
      "proj-123",
      "chg-456",
      deps,
      changesDir,
    );

    expect(result).toBe(true);
    expect(deps.visibilityLister).toHaveBeenCalledTimes(1);
    expect(deps.diskChecker).toHaveBeenCalledExactlyOnceWith(
      changesDir,
      "chg-456",
    );
    expect(deps.workflowStateGetter).not.toHaveBeenCalled();
  });

  test("visibility miss + disk miss + workflow hit returns true", async () => {
    const deps = createDeps({
      visibilityLister: vi.fn(async () => false),
      diskChecker: vi.fn(async () => false),
      workflowStateGetter: vi.fn(async () => true),
    });

    const result = await isChangeReachable(
      "proj-123",
      "chg-456",
      deps,
      changesDir,
    );

    expect(result).toBe(true);
    expect(deps.visibilityLister).toHaveBeenCalledTimes(1);
    expect(deps.diskChecker).toHaveBeenCalledTimes(1);
    expect(deps.workflowStateGetter).toHaveBeenCalledExactlyOnceWith("chg-456");
  });

  test("all miss returns false", async () => {
    const deps = createDeps();

    const result = await isChangeReachable(
      "proj-123",
      "chg-456",
      deps,
      changesDir,
    );

    expect(result).toBe(false);
    expect(deps.visibilityLister).toHaveBeenCalledTimes(1);
    expect(deps.diskChecker).toHaveBeenCalledTimes(1);
    expect(deps.workflowStateGetter).toHaveBeenCalledTimes(1);
  });

  test("freshly-created change reachable via disk fallback", async () => {
    const deps = createDeps({
      visibilityLister: vi.fn(async () => false),
      diskChecker: vi.fn(async () => true),
    });

    const result = await isChangeReachable(
      "proj-123",
      "chg-new",
      deps,
      changesDir,
    );

    expect(result).toBe(true);
    expect(deps.diskChecker).toHaveBeenCalledExactlyOnceWith(
      changesDir,
      "chg-new",
    );
    expect(deps.workflowStateGetter).not.toHaveBeenCalled();
  });

  test("rejected visibility falls through to disk and workflow", async () => {
    const deps = createDeps({
      visibilityLister: vi.fn(async () => {
        throw new Error("visibility unavailable");
      }),
      diskChecker: vi.fn(async () => false),
      workflowStateGetter: vi.fn(async () => true),
    });

    const result = await isChangeReachable(
      "proj-123",
      "chg-456",
      deps,
      changesDir,
    );

    expect(result).toBe(true);
    expect(deps.diskChecker).toHaveBeenCalledTimes(1);
    expect(deps.workflowStateGetter).toHaveBeenCalledTimes(1);
  });

  test("all rejected tiers return false without throwing", async () => {
    const deps = createDeps({
      visibilityLister: vi.fn(async () => {
        throw new Error("visibility unavailable");
      }),
      diskChecker: vi.fn(async () => {
        throw new Error("disk unavailable");
      }),
      workflowStateGetter: vi.fn(async () => {
        throw new Error("workflow unavailable");
      }),
    });

    await expect(
      isChangeReachable("proj-123", "chg-456", deps, changesDir),
    ).resolves.toBe(false);
  });
});

describe("waitForGateCompletion (STRUCT-003 shared poll helper)", () => {
  test("polls until a terminal gate status (done) and returns it", async () => {
    const handle = createMockHandle();
    handle.query
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "done" });

    const result = await waitForGateCompletion(handle as never, "release", {
      delayMs: 0,
    });

    expect(result).toEqual({ status: "done" });
    expect(handle.query).toHaveBeenCalledTimes(2);
  });

  test("treats 'stuck' as terminal and stops immediately", async () => {
    const handle = createMockHandle();
    handle.query.mockResolvedValueOnce({ status: "stuck" });

    const result = await waitForGateCompletion(handle as never, "release", {
      delayMs: 0,
    });

    expect(result).toEqual({ status: "stuck" });
    expect(handle.query).toHaveBeenCalledTimes(1);
  });

  test("returns the last status when the attempt budget is exhausted", async () => {
    const handle = createMockHandle();
    handle.query.mockResolvedValue({ status: "pending" });

    const result = await waitForGateCompletion(handle as never, "release", {
      attempts: 3,
      delayMs: 0,
    });

    expect(result).toEqual({ status: "pending" });
    expect(handle.query).toHaveBeenCalledTimes(3);
  });
});
