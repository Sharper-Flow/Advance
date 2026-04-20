import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const store = {
    init: vi.fn(async () => {}),
    close: vi.fn(),
    flush: vi.fn(async () => {}),
  };

  return {
    store,
    createStore: vi.fn(async () => store as any),
    getProjectId: vi.fn(async () => null),
    ensureTemporalRuntime: vi.fn(async () => ({
      address: "127.0.0.1:7233",
      namespace: "default",
      startedRuntime: true,
    })),
    createTemporalClientBundle: vi.fn(async () => ({
      address: "127.0.0.1:7233",
      namespace: "default",
      connection: {} as any,
      client: {} as any,
    })),
  };
});

vi.mock("./storage/store", () => ({
  createStore: mocks.createStore,
}));

vi.mock("./utils/project-id", () => ({
  getProjectId: mocks.getProjectId,
}));

vi.mock("./temporal/runtime-manager", () => ({
  ensureTemporalRuntime: mocks.ensureTemporalRuntime,
}));

vi.mock("./temporal/client", () => ({
  createTemporalClientBundle: mocks.createTemporalClientBundle,
}));

describe("plugin-init tryInitStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wires Temporal runtime + bundle into createStore when projectId resolves", async () => {
    mocks.getProjectId.mockResolvedValueOnce("proj-sha");

    const { tryInitStore } = await import("./plugin-init");

    const result = await tryInitStore("/tmp/repo", "/tmp/external");

    expect(mocks.ensureTemporalRuntime).toHaveBeenCalledWith("proj-sha");
    expect(mocks.createTemporalClientBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
        ADV_TEMPORAL_NAMESPACE: "default",
      }),
    );
    expect(mocks.createStore).toHaveBeenCalledWith("/tmp/repo", {
      externalRoot: "/tmp/external",
      projectIdOverride: "proj-sha",
      temporalBundle: expect.objectContaining({
        address: "127.0.0.1:7233",
        namespace: "default",
      }),
    });
    expect(mocks.store.init).toHaveBeenCalled();
    expect(result).toEqual({ store: mocks.store, initError: null });
  });

  it("returns initError and never calls createStore when runtime probe blocks Bun", async () => {
    mocks.getProjectId.mockResolvedValueOnce("proj-sha");
    mocks.ensureTemporalRuntime.mockRejectedValueOnce(
      new Error(
        "Bun runtime does not expose Bun.spawn for local runtime/bootstrap management. Run the plugin on Node or upgrade Bun before enabling Temporal-backed storage.",
      ),
    );

    const { tryInitStore } = await import("./plugin-init");

    const result = await tryInitStore("/tmp/repo", "/tmp/external");

    expect(mocks.createStore).not.toHaveBeenCalled();
    expect(result.store).toBeNull();
    expect(result.initError).toBeInstanceOf(Error);
    expect(result.initError?.message).toMatch(/Bun runtime does not expose Bun\.spawn/);
  });
});
