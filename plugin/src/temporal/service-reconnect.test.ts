import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Hoist mocks identically to service.test.ts so we can swap connection on
// reinit and observe call counts.
const mocks = vi.hoisted(() => {
  // Current ADV search-attribute set (must match plugin/src/temporal/search-attributes.ts).
  // Type codes: 2=Keyword, 6=Datetime, 7=KeywordList.
  const ADV_SA_FULL_PRESENT = {
    AdvChangeId: { indexedValueType: 2 },
    AdvChangeStatus: { indexedValueType: 2 },
    AdvChangeTitle: { indexedValueType: 2 },
    AdvAffectedProjects: { indexedValueType: 7 },
    AdvCurrentGate: { indexedValueType: 2 },
    AdvCurrentBucket: { indexedValueType: 2 },
    AdvLastSignalAt: { indexedValueType: 6 },
    AdvCreatedAt: { indexedValueType: 6 },
    AdvWorktreeBranches: { indexedValueType: 7 },
    AdvWorktreePaths: { indexedValueType: 7 },
  };
  const connectionClose = vi.fn().mockResolvedValue(undefined);
  const addSearchAttributes = vi.fn().mockResolvedValue({});
  const listSearchAttributes = vi.fn().mockResolvedValue({
    customAttributes: { ...ADV_SA_FULL_PRESENT },
  });
  const connection = {
    close: connectionClose,
    operatorService: { addSearchAttributes, listSearchAttributes },
  };
  const client = {};
  const connect = vi.fn().mockResolvedValue(connection);
  const ClientCtor = vi.fn(function (this: unknown) {
    return client;
  });
  return {
    connectionClose,
    addSearchAttributes,
    listSearchAttributes,
    connection,
    client,
    connect,
    ClientCtor,
    ADV_SA_FULL_PRESENT,
  };
});

vi.mock("@temporalio/client", () => ({
  Connection: { connect: mocks.connect },
  Client: mocks.ClientCtor,
}));

import {
  initStsl,
  closeStsl,
  resetStsl,
  reinitStsl,
  getStslStats,
  getService,
} from "./service";
import { withTemporalRetry } from "./retry-wrapper";

/**
 * The closure pattern wired into runTemporal / runTemporalQuery
 * (Task 3 — KD-2, KD-4). Built per-op so `reconnected` is local and
 * idempotency is per-tool-call, not global.
 */
function makeReconnectingHook(): () => Promise<void> {
  let reconnected = false;
  return async () => {
    if (reconnected) return;
    reconnected = true;
    try {
      await reinitStsl();
    } catch {
      // Reconnect failure is recorded by reinitStsl's counter; original
      // op error propagates after the retry budget exhausts.
    }
  };
}

describe("STSL reconnect via withTemporalRetry (Task 3 integration)", () => {
  beforeEach(async () => {
    resetStsl();
    vi.clearAllMocks();
    // Restore success defaults after clearAllMocks.
    mocks.connectionClose.mockResolvedValue(undefined);
    mocks.addSearchAttributes.mockResolvedValue({});
    mocks.connect.mockResolvedValue(mocks.connection);
    await initStsl({
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
    });
  });

  afterEach(async () => {
    await closeStsl().catch(() => {});
  });

  it("op fails transient once → reinit fires → retry succeeds against new connection", async () => {
    // Stub a different connection for the reinit.
    const newConnection = {
      close: vi.fn().mockResolvedValue(undefined),
      operatorService: {
        addSearchAttributes: vi.fn().mockResolvedValue({}),
        listSearchAttributes: vi.fn().mockResolvedValue({
          customAttributes: { ...mocks.ADV_SA_FULL_PRESENT },
        }),
      },
    };
    mocks.connect.mockResolvedValueOnce(newConnection);

    const op = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:7233"))
      .mockResolvedValueOnce("ok");

    const result = await withTemporalRetry(op, {
      onTransientFailure: makeReconnectingHook(),
      initialDelayMs: 0, // no real delay in tests
    });

    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(2);
    expect(getStslStats().reconnectCount).toBe(1);
    expect(getService()!.connection).toBe(newConnection);
  });

  // fixbrokentaskrunledger — full retry+reconnect chain on stale gRPC channel.
  //
  // Reproduces the exact SDK wrapping pattern that surfaces when the
  // gRPC channel between the Temporal SDK client and the worker becomes
  // invalid (worker restart, idle timeout, server-side close):
  //
  //   new ServiceError(
  //     'Unexpected error while making gRPC request',
  //     { cause: new Error('Channel has been shut down') },
  //   )
  //
  // This pattern is thrown by `workflow-client.ts:932`, `schedule-client.ts:528`,
  // and `task-queue-client.ts:177` in the Temporal Node SDK. Before the
  // classifier was extended (see retry-wrapper.ts and the channel-staleness
  // regression suite in retry-wrapper.test.ts), this error was misclassified
  // as `fatal` and surfaced as `Workflow Update failed` to the user without
  // any recovery — observed across every checkpoint of the
  // `fixTemporalContextMismatch` change.
  //
  // This test asserts the END-TO-END recovery path: classifier → retry →
  // onTransientFailure → reinitStsl → fresh connection → op succeeds.
  it("op fails with SDK-wrapped channel-shutdown → reinit fires → retry succeeds (AC4)", async () => {
    const newConnection = {
      close: vi.fn().mockResolvedValue(undefined),
      operatorService: {
        addSearchAttributes: vi.fn().mockResolvedValue({}),
        listSearchAttributes: vi.fn().mockResolvedValue({
          customAttributes: { ...mocks.ADV_SA_FULL_PRESENT },
        }),
      },
    };
    mocks.connect.mockResolvedValueOnce(newConnection);

    const sdkWrappedError = new Error(
      "Unexpected error while making gRPC request",
      { cause: new Error("Channel has been shut down") },
    );

    const op = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(sdkWrappedError)
      .mockResolvedValueOnce("ok");

    const result = await withTemporalRetry(op, {
      onTransientFailure: makeReconnectingHook(),
      initialDelayMs: 1, // jitter negligible
    });

    // Full chain recovered: op succeeded after exactly one retry,
    // reconnect fired exactly once, and the new connection replaced the old.
    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(2);
    expect(getStslStats().reconnectCount).toBe(1);
    expect(getService()!.connection).toBe(newConnection);
  });

  it("op fails 3 transient times → reinit called only once (per-op idempotent)", async () => {
    // First reinit returns a fresh connection; subsequent reinits would
    // also return fresh ones, but the per-op hook must suppress them.
    const newConnection = {
      close: vi.fn().mockResolvedValue(undefined),
      operatorService: {
        addSearchAttributes: vi.fn().mockResolvedValue({}),
        listSearchAttributes: vi.fn().mockResolvedValue({
          customAttributes: { ...mocks.ADV_SA_FULL_PRESENT },
        }),
      },
    };
    mocks.connect.mockResolvedValue(newConnection);

    const op = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:7233"));

    await expect(
      withTemporalRetry(op, {
        onTransientFailure: makeReconnectingHook(),
        maxAttempts: 3,
        initialDelayMs: 0,
      }),
    ).rejects.toThrow(/ECONNREFUSED/);

    expect(op).toHaveBeenCalledTimes(3);
    // Despite hook firing 2x (between attempts 1→2 and 2→3), reconnectCount
    // increments only ONCE because the closure suppresses the second call.
    expect(getStslStats().reconnectCount).toBe(1);
  });

  it("reinit failure inside hook does not break the retry loop", async () => {
    // Make the FIRST Connection.connect call (the reinit one) reject.
    mocks.connect.mockRejectedValueOnce(new Error("network down"));

    const op = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:7233"));

    // Original op error should propagate (not "network down").
    await expect(
      withTemporalRetry(op, {
        onTransientFailure: makeReconnectingHook(),
        maxAttempts: 2,
        initialDelayMs: 0,
      }),
    ).rejects.toThrow(/ECONNREFUSED/);

    expect(getStslStats().reconnectCount).toBe(0);
    expect(getStslStats().reconnectFailureCount).toBe(1);
  });

  it("fresh-handle pattern: handle obtained from getService() inside op closure picks up the new client after reconnect", async () => {
    // KD-7 contract test. Simulates the store-temporal callsite pattern
    // where a handle is created from `bundle.client.workflow.getHandle`
    // INSIDE the op closure. The first attempt's handle is bound to the
    // OLD client; reinit swaps the bundle's .client in place; the
    // second-attempt closure constructs a NEW handle from the NEW
    // client and the op succeeds.
    //
    // Without the fresh-handle pattern (handle constructed once
    // outside the closure), attempt 2 would reuse the OLD handle and
    // fail again — the test would fail.

    // Track which client was used for each handle.getHandle call.
    let getHandleCallCount = 0;
    let lastObservedClient: unknown = null;

    const originalConn = mocks.connection;
    const originalClient = mocks.client as { workflow?: object };
    originalClient.workflow = {
      getHandle: vi.fn((_id: string) => {
        getHandleCallCount++;
        lastObservedClient = originalClient;
        return {
          query: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
        };
      }),
    };

    const newClient = { workflow: {} as { getHandle?: unknown } };
    const newHandleQuery = vi.fn().mockResolvedValue("ok-from-new-client");
    newClient.workflow.getHandle = vi.fn((_id: string) => {
      getHandleCallCount++;
      lastObservedClient = newClient;
      return { query: newHandleQuery };
    });

    const newConnection = {
      close: vi.fn().mockResolvedValue(undefined),
      operatorService: {
        addSearchAttributes: vi.fn().mockResolvedValue({}),
        listSearchAttributes: vi.fn().mockResolvedValue({
          customAttributes: { ...mocks.ADV_SA_FULL_PRESENT },
        }),
      },
    };
    mocks.connect.mockResolvedValueOnce(newConnection);
    mocks.ClientCtor.mockImplementationOnce(function (this: unknown) {
      return newClient;
    });

    // Simulate the refactored store-temporal pattern: handle inside closure.
    const op = async (): Promise<string> => {
      const bundle = getService()!;
      const handle = (
        bundle.client as unknown as {
          workflow: {
            getHandle: (id: string) => { query: () => Promise<string> };
          };
        }
      ).workflow.getHandle("ch-1");
      return handle.query();
    };

    const result = await withTemporalRetry(op, {
      onTransientFailure: makeReconnectingHook(),
      initialDelayMs: 0,
    });

    expect(result).toBe("ok-from-new-client");
    expect(getHandleCallCount).toBe(2); // attempt 1 (old client) + attempt 2 (new client)
    expect(lastObservedClient).toBe(newClient);
    expect(getStslStats().reconnectCount).toBe(1);
    // Cleanup so we don't pollute other tests in this file.
    delete originalClient.workflow;
    void originalConn;
  });

  it("two parallel ops each get their own per-op idempotent hook", async () => {
    // First reinit only — single-flight at the STSL level.
    const newConnection = {
      close: vi.fn().mockResolvedValue(undefined),
      operatorService: {
        addSearchAttributes: vi.fn().mockResolvedValue({}),
        listSearchAttributes: vi.fn().mockResolvedValue({
          customAttributes: { ...mocks.ADV_SA_FULL_PRESENT },
        }),
      },
    };
    mocks.connect.mockResolvedValueOnce(newConnection);

    const op1 = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
      .mockResolvedValueOnce("op1-ok");
    const op2 = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
      .mockResolvedValueOnce("op2-ok");

    const [r1, r2] = await Promise.all([
      withTemporalRetry(op1, {
        onTransientFailure: makeReconnectingHook(),
        initialDelayMs: 0,
      }),
      withTemporalRetry(op2, {
        onTransientFailure: makeReconnectingHook(),
        initialDelayMs: 0,
      }),
    ]);

    expect(r1).toBe("op1-ok");
    expect(r2).toBe("op2-ok");
    // STSL single-flight collapses both reinit triggers into one
    // Connection.connect call.
    expect(getStslStats().reconnectCount).toBe(1);
  });
});
