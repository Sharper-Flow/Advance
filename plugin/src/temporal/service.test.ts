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
