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
  probeChangePhantomStatus,
  waitForGateCompletion,
  waitForAppliedReceipt,
  waitForQueryPredicate,
  MutationApplicationUnconfirmedError,
  TemporalMutationOutcomeError,
  TemporalReadOutcomeError,
  type ReachabilityDeps,
} from "./_adapters";
import { isAdvSessionNotReady } from "../temporal/readiness-types";
import {
  evaluateTargetReadiness,
  resetReadinessState,
} from "../temporal/session-readiness";
import { changeStateQuery } from "../temporal/messages";
import { TemporalMutationIneligibleError } from "../temporal/mutation-safety";
import { classifyTemporalWorkflowFailure } from "../temporal/diagnostics";
import type {
  TemporalMutationServerOutcome,
  TemporalOperations,
  TemporalReadOutcome,
  TemporalWorkflowHandle,
} from "../temporal/operations";
import { createMockOwner as createMockOwnerBase } from "../temporal/__tests__/mock-owner";

vi.mock("../temporal/session-readiness", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../temporal/session-readiness")>();
  return {
    ...original,
    evaluateTargetReadiness: vi.fn(
      (...args: Parameters<typeof original.evaluateTargetReadiness>) =>
        original.evaluateTargetReadiness(...args),
    ),
  };
});

beforeEach(() => {
  resetReadinessState();
});

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
      waitForAppliedReceipt(createMockProxy(handle), "mrec_exact", {
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
      createMockProxy(handle),
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
import { createMockOwnerFromClient } from "../temporal/__tests__/mock-owner";

function createMockHandle(): {
  query: ReturnType<typeof vi.fn>;
  signal: ReturnType<typeof vi.fn>;
  executeUpdate: ReturnType<typeof vi.fn>;
  describe: ReturnType<typeof vi.fn>;
  workflowId: string;
} {
  return {
    query: vi.fn().mockResolvedValue({}),
    signal: vi.fn(),
    executeUpdate: vi.fn(),
    describe: vi.fn().mockResolvedValue({ taskQueue: "advance-proj-mock" }),
    workflowId: `adv/change/proj-mock/${Math.random().toString(36).slice(2)}`,
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

function createMockStore(): {
  changes: { refresh: ReturnType<typeof vi.fn> };
} {
  return {
    changes: {
      refresh: vi.fn(async () => undefined),
    },
  };
}

function createMockOwner(handle: ReturnType<typeof createMockHandle>) {
  return createMockOwnerFromClient({
    workflow: { getHandle: vi.fn(() => handle) },
  });
}

function createMockProxy(
  handle: ReturnType<typeof createMockHandle>,
  projectId = "0000000000000000000000000000000000000000",
  changeId = "chg-456",
) {
  return getChangeHandle(createMockOwner(handle), projectId, changeId);
}

function createMockWorkflowHandle(): TemporalWorkflowHandle {
  return {
    workflowId: "adv/change/0000000000000000000000000000000000000000/chg-456",
  } as TemporalWorkflowHandle;
}

function createMockOwnerWithSignalOutcome(
  outcome: TemporalMutationServerOutcome<unknown>,
): TemporalOperations {
  const handle = createMockWorkflowHandle();
  return createMockOwnerBase({
    getHandle: vi.fn(() => handle),
    signal: vi.fn(async () => outcome),
  });
}

function createMockOwnerWithQueryOutcome(
  outcome: TemporalReadOutcome<unknown>,
): TemporalOperations {
  const handle = createMockWorkflowHandle();
  return createMockOwnerBase({
    getHandle: vi.fn(() => handle),
    query: vi.fn(async () => outcome),
  });
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
      const proxy = createMockProxy(handle);

      await fireSignal(proxy, signalDef, payload);

      expect(handle.signal).toHaveBeenCalledTimes(1);
      expect(handle.signal).toHaveBeenCalledWith(signalDef, payload);
    });

    test("fires signal with multiple args", async () => {
      const handle = createMockHandle();
      const signalDef = { name: "multiArgSignal" };
      const proxy = createMockProxy(handle);

      await fireSignal(proxy, signalDef, "arg1", 42, { nested: true });

      expect(handle.signal).toHaveBeenCalledWith(signalDef, "arg1", 42, {
        nested: true,
      });
    });

    test("rejects when handle.signal throws", async () => {
      const handle = createMockHandle();
      const proxy = createMockProxy(handle);
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
        fireSignal(proxy, { name: "bad" }, {}),
      ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);
    });

    test("SC4: no_poller signal error → throws TemporalMutationIneligibleError", async () => {
      const handle = createMockHandle();
      const proxy = createMockProxy(handle);
      handle.signal.mockRejectedValue(
        new Error("no poller is currently polling this task queue"),
      );
      const { TemporalMutationIneligibleError } =
        await import("../temporal/mutation-safety");
      await expect(
        fireSignal(proxy, { name: "sc4-no-poller" }, {}),
      ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);
    });

    test("SC4: deadline signal error → throws TemporalMutationIneligibleError", async () => {
      const handle = createMockHandle();
      const proxy = createMockProxy(handle);
      handle.signal.mockRejectedValue(new Error("deadline exceeded"));
      const { TemporalMutationIneligibleError } =
        await import("../temporal/mutation-safety");
      await expect(
        fireSignal(proxy, { name: "sc4-deadline" }, {}),
      ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);
    });

    test("SC4: 'Failed to query Workflow' signal error → throws TemporalMutationIneligibleError (unknown class)", async () => {
      const handle = createMockHandle();
      const proxy = createMockProxy(handle);
      handle.signal.mockRejectedValue(
        new Error("Failed to query Workflow: changeStateQuery"),
      );
      const { TemporalMutationIneligibleError } =
        await import("../temporal/mutation-safety");
      await expect(
        fireSignal(proxy, { name: "sc4-unknown-query" }, {}),
      ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);
    });

    test("SC4: 'workflow execution already completed' signal error passes through (not_found is SC4-pass)", async () => {
      const handle = createMockHandle();
      const proxy = createMockProxy(handle);
      handle.signal.mockRejectedValue(
        new Error("workflow execution already completed"),
      );
      const { TemporalMutationIneligibleError } =
        await import("../temporal/mutation-safety");
      // Must NOT be an ineligibility error: not_found is intentionally
      // not blocked by SC4 — the caller is responsible for surgical
      // recovery (e.g. internal status-repair writers).
      await expect(
        fireSignal(proxy, { name: "sc4-pass-not-found" }, {}),
      ).rejects.not.toBeInstanceOf(TemporalMutationIneligibleError);
    });
  });

  describe("fireSignal outcome discrimination", () => {
    test("timeout_unavailable outcome is converted to TemporalMutationIneligibleError", async () => {
      const error = new Error("deadline exceeded");
      const diagnostic = classifyTemporalWorkflowFailure(error);
      const owner = createMockOwnerWithSignalOutcome({
        kind: "timeout_unavailable",
        error,
        diagnostic,
      });
      const proxy = getChangeHandle(
        owner,
        "0000000000000000000000000000000000000000",
        "chg-456",
      );
      await expect(
        fireSignal(proxy, { name: "timeout" }, {}),
      ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);
    });

    test("outcome_unknown outcome is converted to TemporalMutationIneligibleError", async () => {
      const error = new Error("no poller is currently polling this task queue");
      const diagnostic = classifyTemporalWorkflowFailure(error);
      const owner = createMockOwnerWithSignalOutcome({
        kind: "outcome_unknown",
        error,
        diagnostic,
      });
      const proxy = getChangeHandle(
        owner,
        "0000000000000000000000000000000000000000",
        "chg-456",
      );
      await expect(
        fireSignal(proxy, { name: "unknown" }, {}),
      ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);
    });

    test("confirmed_failure with not_found diagnostic is preserved as TemporalMutationOutcomeError", async () => {
      const error = new Error("workflow execution already completed");
      const diagnostic = classifyTemporalWorkflowFailure(error);
      const owner = createMockOwnerWithSignalOutcome({
        kind: "confirmed_failure",
        error,
        diagnostic,
      });
      const proxy = getChangeHandle(
        owner,
        "0000000000000000000000000000000000000000",
        "chg-456",
      );
      let caught: unknown;
      try {
        await fireSignal(proxy, { name: "completed" }, {});
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(TemporalMutationOutcomeError);
      expect(caught).not.toBeInstanceOf(TemporalMutationIneligibleError);
      expect((caught as TemporalMutationOutcomeError).outcome.kind).toBe(
        "confirmed_failure",
      );
    });
  });

  describe("querySignal", () => {
    test("returns query result", async () => {
      const handle = createMockHandle();
      const proxy = createMockProxy(handle);
      const expected = { state: "active", tasks: [] };
      handle.query.mockResolvedValue(expected);

      const result = await querySignal(proxy, { name: "getState" });

      expect(handle.query).toHaveBeenCalledTimes(1);
      expect(handle.query).toHaveBeenCalledWith({ name: "getState" });
      expect(result).toEqual(expected);
    });

    test("passes query args through", async () => {
      const handle = createMockHandle();
      const proxy = createMockProxy(handle);
      handle.query.mockResolvedValue("result");

      await querySignal(proxy, { name: "getTask" }, "task-123");

      expect(handle.query).toHaveBeenCalledWith(
        { name: "getTask" },
        "task-123",
      );
    });

    test("rejects when handle.query throws", async () => {
      const handle = createMockHandle();
      const proxy = createMockProxy(handle);
      handle.query.mockRejectedValue(new Error("query failed"));

      await expect(querySignal(proxy, { name: "bad" })).rejects.toThrow(
        "query failed",
      );
    });

    test("preserves degraded read outcome as TemporalReadOutcomeError", async () => {
      const error = new Error("query failed");
      const diagnostic = classifyTemporalWorkflowFailure(error);
      const owner = createMockOwnerWithQueryOutcome({
        kind: "degraded",
        error,
        diagnostic,
      });
      const proxy = getChangeHandle(
        owner,
        "0000000000000000000000000000000000000000",
        "chg-456",
      );
      let caught: unknown;
      try {
        await querySignal(proxy, { name: "bad" });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(TemporalReadOutcomeError);
      expect((caught as TemporalReadOutcomeError).outcome.kind).toBe(
        "degraded",
      );
    });
  });

  describe("fireSignalAndQuery", () => {
    test("fires signal then queries for fresh state", async () => {
      const handle = createMockHandle();
      const proxy = createMockProxy(handle);
      const freshState = { status: "active", gates: {} };
      handle.query.mockResolvedValue(freshState);

      const result = await fireSignalAndQuery(
        proxy,
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
      const proxy = createMockProxy(handle);
      handle.query.mockResolvedValue("task-result");

      await fireSignalAndQuery(
        proxy,
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
      const proxy = createMockProxy(handle);
      // 'network reset' falls through to the SC4 `unknown` class — the
      // guard fires, so the call surfaces a typed
      // `TemporalMutationIneligibleError`.
      handle.signal.mockRejectedValue(new Error("network reset"));
      const { TemporalMutationIneligibleError } =
        await import("../temporal/mutation-safety");

      await expect(
        fireSignalAndQuery(proxy, { name: "bad" }, [{}], { name: "getState" }),
      ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);

      expect(handle.query).not.toHaveBeenCalled();
    });
  });

  describe("fireSignalAndRefresh", () => {
    test("fires signal then refreshes cache", async () => {
      const handle = createMockHandle();
      const proxy = createMockProxy(handle);
      const store = createMockStore();
      const signalDef = { name: "taskAdded" };
      const payload = { taskId: "tk-1" };

      await fireSignalAndRefresh(
        proxy,
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

    test("does NOT refresh when signal fails", async () => {
      const handle = createMockHandle();
      const proxy = createMockProxy(handle);
      const store = createMockStore();
      // 'network reset' falls through to SC4 `unknown` → guard fires.
      handle.signal.mockRejectedValue(new Error("network reset"));
      const { TemporalMutationIneligibleError } =
        await import("../temporal/mutation-safety");

      await expect(
        fireSignalAndRefresh(proxy, store as any, "chg-1", { name: "bad" }, {}),
      ).rejects.toBeInstanceOf(TemporalMutationIneligibleError);

      expect(store.changes.refresh).not.toHaveBeenCalled();
    });

    test("propagates refresh failure (contract: store.refresh should never throw)", async () => {
      // The store contract guarantees refresh is best-effort and does not
      // throw in production. If it ever does (contract violation), the
      // helper propagates so callers can see the bug rather than swallowing.
      const handle = createMockHandle();
      const proxy = createMockProxy(handle);
      const store = createMockStore();
      store.changes.refresh.mockRejectedValue(
        new Error("contract violation: refresh threw"),
      );

      await expect(
        fireSignalAndRefresh(proxy, store as any, "chg-1", { name: "ok" }, {}),
      ).rejects.toThrow("contract violation: refresh threw");

      // Signal still fired before the refresh attempt
      expect(handle.signal).toHaveBeenCalled();
      expect(store.changes.refresh).toHaveBeenCalled();
    });

    test("passes through multiple signal args", async () => {
      const handle = createMockHandle();
      const proxy = createMockProxy(handle);
      const store = createMockStore();

      await fireSignalAndRefresh(
        proxy,
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

  describe("fireSignalAndRefresh readiness gate (KD4)", () => {
    function expectAdvSessionNotReady(thrown: unknown): void {
      expect(isAdvSessionNotReady(thrown)).toBe(true);
      const envelope = thrown as {
        kind: string;
        blockers: string[];
        retryHint: string;
      };
      expect(envelope.kind).toBe("ADV_SESSION_NOT_READY");
      expect(envelope.blockers).toContain("ADV_SESSION_NOT_READY");
      expect(envelope.retryHint).toContain("heartbeat");
      expect(envelope.retryHint).toContain("10s");
    }

    test("AC1: orphaned prior-session queue returns ADV_SESSION_NOT_READY and does not fire the signal", async () => {
      const handle = createMockHandle();
      handle.describe.mockResolvedValue({
        taskQueue: "advance-proj-sess-prior",
      });
      handle.query.mockRejectedValue(
        new Error("no poller is currently polling this task queue"),
      );
      const store = createMockStore();

      let caught: unknown;
      try {
        await fireSignalAndRefresh(
          createMockProxy(
            handle,
            "0000000000000000000000000000000000000000",
            "chg-orphan",
          ),
          store as any,
          "chg-orphan",
          { name: "taskAdded" },
          { taskId: "tk-orphan" },
        );
      } catch (e) {
        caught = e;
      }

      expectAdvSessionNotReady(caught);
      expect(handle.signal).not.toHaveBeenCalled();
      expect(store.changes.refresh).not.toHaveBeenCalled();
      // The gate performed a read-only Query as the decisive proof.
      expect(handle.query).toHaveBeenCalledWith(changeStateQuery);
    });

    test("AC2: fresh own-queue mutation executes normally regardless of unrelated orphaned queue", async () => {
      const ownHandle = createMockHandle();
      ownHandle.describe.mockResolvedValue({
        taskQueue: "advance-proj-sess-new",
      });
      ownHandle.query.mockResolvedValue({ status: "active" });
      const ownStore = createMockStore();

      await fireSignalAndRefresh(
        createMockProxy(
          ownHandle,
          "0000000000000000000000000000000000000000",
          "chg-own",
        ),
        ownStore as any,
        "chg-own",
        { name: "taskAdded" },
        { taskId: "tk-own" },
      );

      expect(ownHandle.signal).toHaveBeenCalledTimes(1);
      expect(ownHandle.signal).toHaveBeenCalledWith(
        { name: "taskAdded" },
        { taskId: "tk-own" },
      );
      expect(ownStore.changes.refresh).toHaveBeenCalledWith("chg-own");

      // The unrelated orphan queue is unproven, but it MUST NOT affect the own
      // queue mutation. Each target queue is evaluated independently.
      const orphanHandle = createMockHandle();
      orphanHandle.describe.mockResolvedValue({
        taskQueue: "advance-proj-sess-prior",
      });
      orphanHandle.query.mockRejectedValue(
        new Error("no poller is currently polling this task queue"),
      );
      const orphanStore = createMockStore();

      let caught: unknown;
      try {
        await fireSignalAndRefresh(
          createMockProxy(
            orphanHandle,
            "0000000000000000000000000000000000000000",
            "chg-orphan",
          ),
          orphanStore as any,
          "chg-orphan",
          { name: "taskAdded" },
          { taskId: "tk-orphan" },
        );
      } catch (e) {
        caught = e;
      }

      expectAdvSessionNotReady(caught);
      expect(orphanHandle.signal).not.toHaveBeenCalled();
      expect(orphanStore.changes.refresh).not.toHaveBeenCalled();
    });

    test("AC5: ADV_SESSION_READINESS_BYPASS=1 skips the readiness barrier and fires the signal", async () => {
      const previousBypass = process.env.ADV_SESSION_READINESS_BYPASS;
      process.env.ADV_SESSION_READINESS_BYPASS = "1";
      vi.mocked(evaluateTargetReadiness).mockClear();

      const handle = createMockHandle();
      handle.describe.mockResolvedValue({
        taskQueue: "advance-proj-sess-prior",
      });
      // Even though the query would prove the queue is not ready, the bypass
      // must skip the readiness probe entirely and let the signal fire.
      handle.query.mockRejectedValue(
        new Error("no poller is currently polling this task queue"),
      );
      const store = createMockStore();

      try {
        await fireSignalAndRefresh(
          createMockProxy(
            handle,
            "0000000000000000000000000000000000000000",
            "chg-bypass",
          ),
          store as any,
          "chg-bypass",
          { name: "taskAdded" },
          { taskId: "tk-bypass" },
        );

        // Bypass must short-circuit the probe, not just ignore the result.
        expect(vi.mocked(evaluateTargetReadiness)).not.toHaveBeenCalled();
        expect(handle.query).not.toHaveBeenCalled();
        expect(handle.signal).toHaveBeenCalledTimes(1);
        expect(handle.signal).toHaveBeenCalledWith(
          { name: "taskAdded" },
          { taskId: "tk-bypass" },
        );
        expect(store.changes.refresh).toHaveBeenCalledWith("chg-bypass");
      } finally {
        if (previousBypass === undefined) {
          delete process.env.ADV_SESSION_READINESS_BYPASS;
        } else {
          process.env.ADV_SESSION_READINESS_BYPASS = previousBypass;
        }
      }
    });

    test("AC5.1: ADV_SESSION_READINESS_BYPASS=true is not accepted (only '1')", async () => {
      const previousBypass = process.env.ADV_SESSION_READINESS_BYPASS;
      process.env.ADV_SESSION_READINESS_BYPASS = "true";
      vi.mocked(evaluateTargetReadiness).mockClear();

      const handle = createMockHandle();
      handle.describe.mockResolvedValue({
        taskQueue: "advance-proj-sess-prior",
      });
      handle.query.mockRejectedValue(
        new Error("no poller is currently polling this task queue"),
      );
      const store = createMockStore();

      let caught: unknown;
      try {
        await fireSignalAndRefresh(
          createMockProxy(
            handle,
            "0000000000000000000000000000000000000000",
            "chg-bypass-true",
          ),
          store as any,
          "chg-bypass-true",
          { name: "taskAdded" },
          { taskId: "tk-bypass-true" },
        );
      } catch (e) {
        caught = e;
      } finally {
        if (previousBypass === undefined) {
          delete process.env.ADV_SESSION_READINESS_BYPASS;
        } else {
          process.env.ADV_SESSION_READINESS_BYPASS = previousBypass;
        }
      }

      expectAdvSessionNotReady(caught);
      expect(vi.mocked(evaluateTargetReadiness)).toHaveBeenCalled();
      expect(handle.signal).not.toHaveBeenCalled();
      expect(store.changes.refresh).not.toHaveBeenCalled();
    });
  });

  describe("getChangeHandle", () => {
    test("builds correct workflowId and returns handle", () => {
      const handle = createMockHandle();
      const client = createMockClient(handle);
      const owner = createMockOwnerFromClient(client);

      const result = getChangeHandle(
        owner,
        "0000000000000000000000000000000000000000",
        "chg-456",
      );

      expect(client.workflow.getHandle).toHaveBeenCalledTimes(1);
      expect(client.workflow.getHandle).toHaveBeenCalledWith(
        "adv/change/0000000000000000000000000000000000000000/chg-456",
        undefined,
      );
      expect(result.workflowId).toBe(
        "adv/change/0000000000000000000000000000000000000000/chg-456",
      );
    });
  });

  describe("startChangeWorkflow", () => {
    test("delegates to ensureChangeWorkflowStarted", async () => {
      const handle = {
        ...createMockHandle(),
        workflowId:
          "adv/change/0000000000000000000000000000000000000000/chg-def",
      };
      const client = createMockClient(handle);
      const owner = createMockOwnerFromClient(client);
      vi.mocked(ensureChangeWorkflowStarted).mockResolvedValue(handle);

      const input = {
        projectId: "0000000000000000000000000000000000000000",
        changeId: "chg-def",
        title: "Test Change",
        initializedAt: new Date().toISOString(),
      };

      const result = await startChangeWorkflow(owner, input);

      expect(ensureChangeWorkflowStarted).toHaveBeenCalledTimes(1);
      expect(result.workflowId).toBe(
        "adv/change/0000000000000000000000000000000000000000/chg-def",
      );
    });

    test("throws when owner does not expose workflow.start", async () => {
      const owner = createMockOwnerFromClient({
        workflow: {
          getHandle: vi.fn(),
          // start is intentionally missing
        },
      });
      vi.mocked(ensureChangeWorkflowStarted).mockRejectedValue(
        new Error("does not expose workflow.start"),
      );

      await expect(
        startChangeWorkflow(owner, {
          projectId: "0000000000000000000000000000000000000000",
          changeId: "c",
          title: "t",
          initializedAt: "now",
        }),
      ).rejects.toThrow("does not expose workflow.start");
    });

    test("AC6: startChangeWorkflow does not await the readiness probe (barrier is post-init tool exposure)", async () => {
      vi.mocked(evaluateTargetReadiness).mockClear();
      const handle = createMockHandle();
      const client = createMockClient(handle);
      const owner = createMockOwnerFromClient(client);
      vi.mocked(ensureChangeWorkflowStarted).mockResolvedValue(handle);

      await startChangeWorkflow(owner, {
        projectId: "0000000000000000000000000000000000000000",
        changeId: "chg-def",
        title: "Test Change",
        initializedAt: new Date().toISOString(),
      });

      // The session-readiness barrier is per-mutation, evaluated only inside
      // fireSignalAndRefresh. Worker/change startup must remain non-blocking.
      expect(vi.mocked(evaluateTargetReadiness)).not.toHaveBeenCalled();
      expect(handle.query).not.toHaveBeenCalled();
      expect(handle.describe).not.toHaveBeenCalled();
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
      "0000000000000000000000000000000000000000",
      "chg-456",
      deps,
      changesDir,
    );

    expect(result).toBe(true);
    expect(deps.visibilityLister).toHaveBeenCalledExactlyOnceWith(
      "0000000000000000000000000000000000000000",
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
      "0000000000000000000000000000000000000000",
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
      "0000000000000000000000000000000000000000",
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
      "0000000000000000000000000000000000000000",
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
      "0000000000000000000000000000000000000000",
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
      "0000000000000000000000000000000000000000",
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
      isChangeReachable(
        "0000000000000000000000000000000000000000",
        "chg-456",
        deps,
        changesDir,
      ),
    ).resolves.toBe(false);
  });
});

// rq-doctorConsolidation01 option B — tri-state phantom probe.
describe("probeChangePhantomStatus (tri-state)", () => {
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

  test("all tiers report absent → confirmed_absent", async () => {
    const deps = createDeps();
    const result = await probeChangePhantomStatus(
      "0000000000000000000000000000000000000000",
      "chg-1",
      deps,
      changesDir,
    );
    expect(result.status).toBe("confirmed_absent");
    expect(result.evidence).toMatch(/visibility.*disk.*workflow-state/);
  });

  test("first tier finds change → confirmed_present, short-circuits", async () => {
    const deps = createDeps({
      visibilityLister: vi.fn(async () => true),
    });
    const result = await probeChangePhantomStatus(
      "0000000000000000000000000000000000000000",
      "chg-1",
      deps,
      changesDir,
    );
    expect(result.status).toBe("confirmed_present");
    expect(deps.diskChecker).not.toHaveBeenCalled();
    expect(deps.workflowStateGetter).not.toHaveBeenCalled();
  });

  test("disk tier finds change after visibility miss → confirmed_present", async () => {
    const deps = createDeps({
      visibilityLister: vi.fn(async () => false),
      diskChecker: vi.fn(async () => true),
    });
    const result = await probeChangePhantomStatus(
      "0000000000000000000000000000000000000000",
      "chg-1",
      deps,
      changesDir,
    );
    expect(result.status).toBe("confirmed_present");
    expect(deps.workflowStateGetter).not.toHaveBeenCalled();
  });

  test("a tier THROWS → indeterminate (never confirmed_absent)", async () => {
    const deps = createDeps({
      visibilityLister: vi.fn(async () => {
        throw new Error("Visibility RPC timeout");
      }),
    });
    const result = await probeChangePhantomStatus(
      "0000000000000000000000000000000000000000",
      "chg-1",
      deps,
      changesDir,
    );
    expect(result.status).toBe("indeterminate");
    expect(result.evidence).toMatch(/visibility.*threw/);
    // Must NOT fall through to disk/workflow after an error — the change
    // may exist; we simply couldn't confirm.
    expect(deps.diskChecker).not.toHaveBeenCalled();
  });

  test("disk throws (EACCES) after visibility miss → indeterminate", async () => {
    const deps = createDeps({
      visibilityLister: vi.fn(async () => false),
      diskChecker: vi.fn(async () => {
        throw new Error("EACCES");
      }),
    });
    const result = await probeChangePhantomStatus(
      "0000000000000000000000000000000000000000",
      "chg-1",
      deps,
      changesDir,
    );
    expect(result.status).toBe("indeterminate");
    expect(result.evidence).toMatch(/disk.*threw/);
  });

  test("workflow tier throws after visibility+disk miss → indeterminate", async () => {
    const deps = createDeps({
      workflowStateGetter: vi.fn(async () => {
        throw new Error("workflow query failed");
      }),
    });
    const result = await probeChangePhantomStatus(
      "0000000000000000000000000000000000000000",
      "chg-1",
      deps,
      changesDir,
    );
    expect(result.status).toBe("indeterminate");
    expect(result.evidence).toMatch(/workflow-state.*threw/);
  });
});

describe("waitForGateCompletion (STRUCT-003 shared poll helper)", () => {
  test("polls until a terminal gate status (done) and returns it", async () => {
    const handle = createMockHandle();
    handle.query
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "done" });

    const result = await waitForGateCompletion(
      createMockProxy(handle),
      "release",
      {
        delayMs: 0,
      },
    );

    expect(result).toEqual({ status: "done" });
    expect(handle.query).toHaveBeenCalledTimes(2);
  });

  test("treats 'stuck' as terminal and stops immediately", async () => {
    const handle = createMockHandle();
    handle.query.mockResolvedValueOnce({ status: "stuck" });

    const result = await waitForGateCompletion(
      createMockProxy(handle),
      "release",
      {
        delayMs: 0,
      },
    );

    expect(result).toEqual({ status: "stuck" });
    expect(handle.query).toHaveBeenCalledTimes(1);
  });

  test("returns the last status when the attempt budget is exhausted", async () => {
    const handle = createMockHandle();
    handle.query.mockResolvedValue({ status: "pending" });

    const result = await waitForGateCompletion(
      createMockProxy(handle),
      "release",
      {
        attempts: 3,
        delayMs: 0,
      },
    );

    expect(result).toEqual({ status: "pending" });
    expect(handle.query).toHaveBeenCalledTimes(3);
  });
});
