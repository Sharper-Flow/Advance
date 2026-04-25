import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Hoist mocks identically to service.test.ts so we can swap connection on
// reinit and observe call counts.
const mocks = vi.hoisted(() => {
  const connectionClose = vi.fn().mockResolvedValue(undefined);
  const addSearchAttributes = vi.fn().mockResolvedValue({});
  const connection = {
    close: connectionClose,
    operatorService: { addSearchAttributes },
  };
  const client = {};
  const connect = vi.fn().mockResolvedValue(connection);
  const ClientCtor = vi.fn(function (this: unknown) {
    return client;
  });
  return {
    connectionClose,
    addSearchAttributes,
    connection,
    client,
    connect,
    ClientCtor,
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
      },
    };
    mocks.connect.mockResolvedValueOnce(newConnection);

    const op = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:7233"))
      .mockResolvedValueOnce("ok");

    const result = await withTemporalRetry(op, {
      onTransientFailure: makeReconnectingHook(),
      backoffMs: [0, 0, 0], // no real delay in tests
    });

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
        backoffMs: [0, 0, 0],
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
        backoffMs: [0, 0, 0],
      }),
    ).rejects.toThrow(/ECONNREFUSED/);

    expect(getStslStats().reconnectCount).toBe(0);
    expect(getStslStats().reconnectFailureCount).toBe(1);
  });

  it("two parallel ops each get their own per-op idempotent hook", async () => {
    // First reinit only — single-flight at the STSL level.
    const newConnection = {
      close: vi.fn().mockResolvedValue(undefined),
      operatorService: {
        addSearchAttributes: vi.fn().mockResolvedValue({}),
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
        backoffMs: [0, 0, 0],
      }),
      withTemporalRetry(op2, {
        onTransientFailure: makeReconnectingHook(),
        backoffMs: [0, 0, 0],
      }),
    ]);

    expect(r1).toBe("op1-ok");
    expect(r2).toBe("op2-ok");
    // STSL single-flight collapses both reinit triggers into one
    // Connection.connect call.
    expect(getStslStats().reconnectCount).toBe(1);
  });
});
