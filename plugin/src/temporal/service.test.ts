import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Hoist all mock creation so they're available in both vi.mock factories and tests
const mocks = vi.hoisted(() => {
  // Current ADV search-attribute set (must match plugin/src/temporal/search-attributes.ts).
  // Type codes: 2=Keyword, 5=Bool, 6=Datetime, 7=KeywordList.
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
    AdvBacklogIssueNumber: { indexedValueType: 2 },
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
  // Must use function (not arrow) so `new ClientCtor()` works
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
  getService,
  closeStsl,
  isStslInitialized,
  resetStsl,
  reinitStsl,
  getStslStats,
  verifyAdvSearchAttributes,
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

  it("initStsl registers ADV search attributes if missing", async () => {
    // Mock: SAs not yet present → registration should fire
    mocks.listSearchAttributes
      .mockResolvedValueOnce({ customAttributes: {} }) // check before register
      .mockResolvedValueOnce({ customAttributes: {} }) // verification poll 1
      .mockResolvedValue({
        // verification polls 2+ succeed
        customAttributes: { ...mocks.ADV_SA_FULL_PRESENT },
      });

    await initStsl({
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
    });

    expect(mocks.addSearchAttributes).toHaveBeenCalledTimes(1);
    const [call] = mocks.addSearchAttributes.mock.calls;
    // Type codes: 2=Keyword, 6=Datetime, 7=KeywordList. Must match the
    // current ADV_SEARCH_ATTRIBUTES set in plugin/src/temporal/search-attributes.ts.
    expect(call[0]).toEqual({
      namespace: "default",
      searchAttributes: {
        AdvChangeId: 2,
        AdvChangeStatus: 2,
        AdvChangeTitle: 2,
        AdvAffectedProjects: 7,
        AdvCurrentGate: 2,
        AdvCurrentBucket: 2,
        AdvLastSignalAt: 6,
        AdvCreatedAt: 6,
        AdvWorktreeBranches: 7,
        AdvWorktreePaths: 7,
        AdvBacklogIssueNumber: 2,
      },
    });
  });

  it("initStsl skips registration when SAs already present", async () => {
    // Default mock has all SAs present → registration should be skipped
    await initStsl({
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
    });

    // addSearchAttributes NOT called because checkAdvSearchAttributes sees all present
    expect(mocks.addSearchAttributes).toHaveBeenCalledTimes(0);
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

  it("initStsl logs non-AlreadyExists registration failures at error level", async () => {
    // Enable ADV_DEBUG so logger.error routes to console.error (GH #5:
    // console output is now gated on ADV_DEBUG=1).
    const prevDebug = process.env.ADV_DEBUG;
    process.env.ADV_DEBUG = "1";
    // Reset implementation queues (vi.clearAllMocks does NOT clear queued
    // mockRejectedValueOnce entries; prior tests can leak rejections that
    // were never consumed because their default mock made the call path
    // unreachable). Restore original defaults from vi.hoisted setup.
    mocks.listSearchAttributes.mockReset();
    mocks.addSearchAttributes.mockReset();
    mocks.listSearchAttributes.mockResolvedValue({
      customAttributes: { ...mocks.ADV_SA_FULL_PRESENT },
    });
    mocks.addSearchAttributes.mockResolvedValue({});
    // Test-specific overrides:
    // SAs not yet present on first list call so registration is attempted.
    mocks.listSearchAttributes.mockResolvedValueOnce({ customAttributes: {} });
    // Force a non-AlreadyExists, non-unavailable failure path on the addSA call.
    mocks.addSearchAttributes.mockRejectedValueOnce(
      new Error("permission denied"),
    );

    // Spy on console.error and console.warn to detect which level was used.
    // logger.warn → console.warn; logger.error → console.error
    // (see plugin/src/utils/debug-log.ts createLogger)
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    try {
      await initStsl({
        ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
        ADV_TEMPORAL_NAMESPACE: "default",
      });

      // The non-AlreadyExists, non-unavailable failure path MUST log at
      // error level (not warn). This is the AC-5 elevation: real registration
      // failures are visible to the agent / operator without scraping debug
      // logs.
      const errorCalls = errorSpy.mock.calls.map((c) => String(c[0]));
      const failureLogged = errorCalls.some((line) =>
        line.includes("Failed to register ADV search attributes"),
      );
      expect(failureLogged).toBe(true);

      // The same message MUST NOT also be emitted at warn level (no
      // duplicate logging across severities).
      const warnCalls = warnSpy.mock.calls.map((c) => String(c[0]));
      const warnedTheSame = warnCalls.some((line) =>
        line.includes("Failed to register ADV search attributes"),
      );
      expect(warnedTheSame).toBe(false);
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      if (prevDebug === undefined) {
        delete process.env.ADV_DEBUG;
      } else {
        process.env.ADV_DEBUG = prevDebug;
      }
    }
  });

  it("initStsl keeps AlreadyExists registration failures at debug level (no warn/error)", async () => {
    // Reset queues + restore defaults (see prior test for rationale).
    mocks.listSearchAttributes.mockReset();
    mocks.addSearchAttributes.mockReset();
    mocks.listSearchAttributes.mockResolvedValue({
      customAttributes: { ...mocks.ADV_SA_FULL_PRESENT },
    });
    mocks.addSearchAttributes.mockResolvedValue({});
    // Test-specific: empty list on first check, then AlreadyExists rejection
    mocks.listSearchAttributes.mockResolvedValueOnce({ customAttributes: {} });
    mocks.addSearchAttributes.mockRejectedValueOnce(
      new Error("search attribute already exists"),
    );

    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    try {
      await initStsl({
        ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
        ADV_TEMPORAL_NAMESPACE: "default",
      });

      // AlreadyExists is idempotent success — must not surface at warn or
      // error level (would be noise on every session start with persisted SAs).
      const errorCalls = errorSpy.mock.calls.map((c) => String(c[0]));
      const warnCalls = warnSpy.mock.calls.map((c) => String(c[0]));
      const failureSurfaced = [...errorCalls, ...warnCalls].some((line) =>
        line.includes("Failed to register ADV search attributes"),
      );
      expect(failureSurfaced).toBe(false);
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
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
        listSearchAttributes: vi.fn().mockResolvedValue({
          customAttributes: { ...mocks.ADV_SA_FULL_PRESENT },
        }),
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

  it("re-registers ADV search attributes after reconnect if missing", async () => {
    const { newConnection } = await initAndStubNextReconnect();
    // Make the new connection see SAs as missing on first check, then present
    newConnection.operatorService.listSearchAttributes
      .mockResolvedValueOnce({ customAttributes: {} }) // check → missing → register
      .mockResolvedValueOnce({ customAttributes: {} }) // verification poll 1
      .mockResolvedValue({
        customAttributes: { ...mocks.ADV_SA_FULL_PRESENT },
      });

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

describe("verifyAdvSearchAttributes", () => {
  beforeEach(() => {
    resetStsl();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await closeStsl().catch(() => {});
  });

  it("returns ok immediately when check passes on first attempt", async () => {
    // listSearchAttributes returns all 5 SAs present by default in mocks
    const result = await verifyAdvSearchAttributes(
      mocks.connection,
      "test-ns",
      3,
      10,
    );

    expect(result.ok).toBe(true);
    expect(mocks.listSearchAttributes).toHaveBeenCalledTimes(1);
  });

  it("polls until ok, then returns", async () => {
    // First 2 calls return empty (SAs missing), third returns all present
    mocks.listSearchAttributes
      .mockResolvedValueOnce({ customAttributes: {} })
      .mockResolvedValueOnce({ customAttributes: {} });

    const result = await verifyAdvSearchAttributes(
      mocks.connection,
      "test-ns",
      5,
      10,
    );

    expect(result.ok).toBe(true);
    expect(mocks.listSearchAttributes).toHaveBeenCalledTimes(3);
  });

  it("returns final check result after maxAttempts exhausted", async () => {
    // Override mock to return empty — SAs never propagate. Use mockResolvedValue
    // since this test runs before integration tests and we restore in afterEach.
    const original = mocks.listSearchAttributes.getMockImplementation();
    mocks.listSearchAttributes.mockResolvedValue({ customAttributes: {} });

    const result = await verifyAdvSearchAttributes(
      mocks.connection,
      "test-ns",
      3,
      1, // minimal delay for tests
    );

    expect(result.ok).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
    // 3 loop attempts + 1 final check = 4 calls
    expect(mocks.listSearchAttributes).toHaveBeenCalledTimes(4);

    // Restore original implementation so downstream tests get the hoisted mock
    if (original) {
      mocks.listSearchAttributes.mockImplementation(original);
    } else {
      mocks.listSearchAttributes.mockResolvedValue({
        customAttributes: { ...mocks.ADV_SA_FULL_PRESENT },
      });
    }
  });

  it("handles listSearchAttributes throwing an error", async () => {
    const original = mocks.listSearchAttributes.getMockImplementation();
    mocks.listSearchAttributes.mockRejectedValue(new Error("gRPC UNAVAILABLE"));

    const result = await verifyAdvSearchAttributes(
      mocks.connection,
      "test-ns",
      2,
      1, // minimal delay for tests
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("UNAVAILABLE");

    // Restore original implementation
    if (original) {
      mocks.listSearchAttributes.mockImplementation(original);
    } else {
      mocks.listSearchAttributes.mockResolvedValue({
        customAttributes: { ...mocks.ADV_SA_FULL_PRESENT },
      });
    }
  });
});

describe("initStsl verification integration", () => {
  beforeEach(() => {
    resetStsl();
    vi.clearAllMocks();
    // Ensure listSearchAttributes mock is restored to the hoisted default
    // (previous tests may have overridden it with mockResolvedValue/mockRejectedValue)
    mocks.listSearchAttributes.mockResolvedValue({
      customAttributes: { ...mocks.ADV_SA_FULL_PRESENT },
    });
  });

  afterEach(async () => {
    await closeStsl().catch(() => {});
  });

  it("initStsl sets saVerification after successful verification", async () => {
    const env = {
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "test-ns",
    };

    await initStsl(env);

    const stats = getStslStats();
    expect(stats.saVerification).toBeDefined();
    expect(stats.saVerification!.ok).toBe(true);
    expect(stats.saVerification!.checkedAt).toBeGreaterThan(0);
  }, 15_000);

  it("initStsl sets saVerification ok:false when verification fails", async () => {
    vi.useFakeTimers();
    mocks.listSearchAttributes.mockResolvedValue({ customAttributes: {} });

    const env = {
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "test-ns",
    };

    const initPromise = initStsl(env);
    // Advance through all setTimeout calls in the poll loop
    await vi.advanceTimersByTimeAsync(10_000);
    await initPromise;

    const stats = getStslStats();
    expect(stats.saVerification).toBeDefined();
    expect(stats.saVerification!.ok).toBe(false);
    vi.useRealTimers();
  });

  it("reinitStsl updates saVerification after reconnect", async () => {
    await initStsl({
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
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

    await reinitStsl();

    const stats = getStslStats();
    expect(stats.saVerification).toBeDefined();
    expect(stats.saVerification!.ok).toBe(true);
  });

  it("resetStsl clears saVerification", async () => {
    await initStsl({
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
    });

    expect(getStslStats().saVerification).toBeDefined();

    resetStsl();

    expect(getStslStats().saVerification).toBeNull();
  });
});
