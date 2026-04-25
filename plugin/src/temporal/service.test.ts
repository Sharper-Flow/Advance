import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Hoist all mock creation so they're available in both vi.mock factories and tests
const mocks = vi.hoisted(() => {
  const connectionClose = vi.fn().mockResolvedValue(undefined);
  const addSearchAttributes = vi.fn().mockResolvedValue({});
  const connection = {
    close: connectionClose,
    operatorService: { addSearchAttributes },
  };
  const client = {};
  const connect = vi.fn().mockResolvedValue(connection);
  // Must use function (not arrow) so `new ClientCtor()` works
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
  getService,
  closeStsl,
  isStslInitialized,
  resetStsl,
  reinitStsl,
  getStslStats,
} from "./service";

describe("STSL (Shared Temporal Service Layer)", () => {
  beforeEach(() => {
    resetStsl();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await closeStsl().catch(() => {});
  });

  it("initStsl creates a connection and client bundle", async () => {
    const env = {
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "test-ns",
    };

    const bundle = await initStsl(env);

    expect(bundle).toBeDefined();
    expect(bundle.address).toBe("127.0.0.1:7233");
    expect(bundle.namespace).toBe("test-ns");
    expect(bundle.connection).toBe(mocks.connection);
    expect(bundle.client).toBe(mocks.client);
    expect(mocks.connect).toHaveBeenCalledWith({ address: "127.0.0.1:7233" });
    expect(mocks.ClientCtor).toHaveBeenCalledWith({
      connection: mocks.connection,
      namespace: "test-ns",
    });
  });

  it("initStsl registers ADV search attributes with the server", async () => {
    await initStsl({
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
    });

    expect(mocks.addSearchAttributes).toHaveBeenCalledTimes(1);
    const [call] = mocks.addSearchAttributes.mock.calls;
    expect(call[0]).toEqual({
      namespace: "default",
      searchAttributes: {
        AdvProjectId: 1, // KEYWORD
        AdvChangeId: 1, // KEYWORD
        AdvChangeStatus: 1, // KEYWORD
        AdvActiveGate: 1, // KEYWORD
        AdvDoomLoopActive: 4, // BOOL
      },
    });
  });

  it("initStsl treats AlreadyExists as success (idempotent)", async () => {
    mocks.addSearchAttributes.mockRejectedValueOnce(
      new Error("search attribute already exists"),
    );

    // Must not throw
    await expect(
      initStsl({
        ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
        ADV_TEMPORAL_NAMESPACE: "default",
      }),
    ).resolves.toBeDefined();
  });

  it("initStsl swallows other registration failures (non-fatal)", async () => {
    mocks.addSearchAttributes.mockRejectedValueOnce(
      new Error("unexpected registration failure"),
    );

    // Must not throw even on non-AlreadyExists failure
    await expect(
      initStsl({
        ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
        ADV_TEMPORAL_NAMESPACE: "default",
      }),
    ).resolves.toBeDefined();
  });

  it("getService returns the initialized bundle", async () => {
    await initStsl({
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
    });

    const service = getService();
    expect(service).toBeDefined();
    expect(service!.address).toBe("127.0.0.1:7233");
    expect(service!.namespace).toBe("default");
  });

  it("getService returns null before initialization", () => {
    expect(getService()).toBeNull();
  });

  it("isStslInitialized reports state correctly", async () => {
    expect(isStslInitialized()).toBe(false);

    await initStsl({
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
    });

    expect(isStslInitialized()).toBe(true);
  });

  it("double-init with same env returns existing bundle (idempotent)", async () => {
    const env = {
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
    };

    const first = await initStsl(env);
    const second = await initStsl(env);

    expect(first).toBe(second);
    expect(mocks.connect).toHaveBeenCalledTimes(1);
  });

  it("double-init with different env throws (prevent accidental re-init)", async () => {
    await initStsl({
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "ns-a",
    });

    await expect(
      initStsl({
        ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
        ADV_TEMPORAL_NAMESPACE: "ns-b",
      }),
    ).rejects.toThrow(/already initialized with different/);
  });

  it("closeStsl closes the connection and clears the service", async () => {
    await initStsl({
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
    });

    expect(isStslInitialized()).toBe(true);

    await closeStsl();

    expect(isStslInitialized()).toBe(false);
    expect(getService()).toBeNull();
    expect(mocks.connectionClose).toHaveBeenCalled();
  });

  it("closeStsl is idempotent (no error on double close)", async () => {
    await initStsl({
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
    });

    await closeStsl();
    await closeStsl();

    expect(isStslInitialized()).toBe(false);
  });

  it("closeStsl on uninitiated service is a no-op", async () => {
    await closeStsl();
    expect(isStslInitialized()).toBe(false);
  });
});

describe("reinitStsl (Task 2 — comprehensive coverage)", () => {
  beforeEach(() => {
    resetStsl();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await closeStsl().catch(() => {});
  });

  // Helper: initialize STSL and stub the next Connection.connect/new Client
  // pair to return distinct objects so we can assert in-place swap.
  const initAndStubNextReconnect = async (): Promise<{
    bundleBefore: Awaited<ReturnType<typeof initStsl>>;
    clientBefore: unknown;
    connectionBefore: unknown;
    newConnection: {
      close: ReturnType<typeof vi.fn>;
      operatorService: { addSearchAttributes: ReturnType<typeof vi.fn> };
    };
    newClient: object;
  }> => {
    const bundleBefore = await initStsl({
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
    });
    const clientBefore = bundleBefore.client;
    const connectionBefore = bundleBefore.connection;
    const newConnection = {
      close: vi.fn().mockResolvedValue(undefined),
      operatorService: {
        addSearchAttributes: vi.fn().mockResolvedValue({}),
      },
    };
    const newClient = {};
    mocks.connect.mockResolvedValueOnce(newConnection);
    mocks.ClientCtor.mockImplementationOnce(function (this: unknown) {
      return newClient;
    });
    return {
      bundleBefore,
      clientBefore,
      connectionBefore,
      newConnection,
      newClient,
    };
  };

  it("mutates client and connection in place; bundle reference unchanged", async () => {
    const {
      bundleBefore,
      clientBefore,
      connectionBefore,
      newConnection,
      newClient,
    } = await initAndStubNextReconnect();

    await reinitStsl();

    const bundleAfter = getService();
    expect(bundleAfter).toBe(bundleBefore);
    expect(bundleAfter!.client).not.toBe(clientBefore);
    expect(bundleAfter!.connection).not.toBe(connectionBefore);
    expect(bundleAfter!.client).toBe(newClient);
    expect(bundleAfter!.connection).toBe(newConnection);
    expect(getStslStats().reconnectCount).toBe(1);
    expect(getStslStats().reconnectFailureCount).toBe(0);
  });

  it("is single-flight under concurrent callers", async () => {
    await initAndStubNextReconnect();

    // Two concurrent reinitStsl calls — only one Connection.connect should
    // happen for the reinit (initStsl itself already counted once before).
    const connectCallsBefore = mocks.connect.mock.calls.length;
    const [r1, r2] = await Promise.all([reinitStsl(), reinitStsl()]);
    expect(r1).toBeUndefined();
    expect(r2).toBeUndefined();
    expect(mocks.connect.mock.calls.length).toBe(connectCallsBefore + 1);
    expect(getStslStats().reconnectCount).toBe(1);
  });

  it("swallows close failure and proceeds with connect", async () => {
    await initAndStubNextReconnect();

    // Make the OLD connection's close reject — reinit should still succeed.
    mocks.connectionClose.mockRejectedValueOnce(new Error("close exploded"));

    await expect(reinitStsl()).resolves.toBeUndefined();
    expect(getStslStats().reconnectCount).toBe(1);
    expect(getStslStats().reconnectFailureCount).toBe(0);
  });

  it("propagates Connection.connect failure to caller; increments reconnectFailureCount", async () => {
    await initStsl({
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
    });
    // Force the next Connection.connect to fail (the reinit one).
    mocks.connect.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(reinitStsl()).rejects.toThrow(/ECONNREFUSED/);
    expect(getStslStats().reconnectCount).toBe(0);
    expect(getStslStats().reconnectFailureCount).toBe(1);
  });

  it("re-registers ADV search attributes after reconnect", async () => {
    const { newConnection } = await initAndStubNextReconnect();

    // initStsl already called addSearchAttributes once on the original conn.
    // After reinit, the NEW connection's addSearchAttributes should be hit.
    expect(
      newConnection.operatorService.addSearchAttributes,
    ).not.toHaveBeenCalled();
    await reinitStsl();
    expect(
      newConnection.operatorService.addSearchAttributes,
    ).toHaveBeenCalledTimes(1);
  });

  it("treats AlreadyExists from search-attribute re-registration as success", async () => {
    const { newConnection } = await initAndStubNextReconnect();
    newConnection.operatorService.addSearchAttributes.mockRejectedValueOnce(
      new Error("search attribute already exists"),
    );

    await expect(reinitStsl()).resolves.toBeUndefined();
    expect(getStslStats().reconnectCount).toBe(1);
  });

  it("getStslStats includes reconnectCount and reconnectFailureCount", () => {
    const stats = getStslStats();
    expect(stats).toHaveProperty("reconnectCount", 0);
    expect(stats).toHaveProperty("reconnectFailureCount", 0);
  });

  it("resetStsl clears reconnect counters and inflight state", async () => {
    await initStsl({
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
    });
    mocks.connect.mockRejectedValueOnce(new Error("force-fail"));
    await expect(reinitStsl()).rejects.toThrow(/force-fail/);
    expect(getStslStats().reconnectFailureCount).toBe(1);

    resetStsl();

    expect(getStslStats().reconnectCount).toBe(0);
    expect(getStslStats().reconnectFailureCount).toBe(0);
    // After reset, a fresh init must work again (proves inFlightReconnect cleared).
    await expect(
      initStsl({
        ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
        ADV_TEMPORAL_NAMESPACE: "default",
      }),
    ).resolves.toBeDefined();
  });

  it("reinitStsl on uninitiated service throws with diagnostic message", async () => {
    expect(isStslInitialized()).toBe(false);
    await expect(reinitStsl()).rejects.toThrow(/STSL not initialized/);
  });

  it("concurrent reinitStsl calls — both observers see the rejection from the first", async () => {
    await initStsl({
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
    });
    mocks.connect.mockRejectedValueOnce(new Error("shared-failure"));

    const p1 = reinitStsl();
    const p2 = reinitStsl();

    await expect(p1).rejects.toThrow(/shared-failure/);
    await expect(p2).rejects.toThrow(/shared-failure/);
    // Single-flight: only one failure counts toward reconnectFailureCount.
    expect(getStslStats().reconnectFailureCount).toBe(1);
  });
});
