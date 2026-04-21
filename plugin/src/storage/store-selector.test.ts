import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  legacyStore: {
    close: vi.fn(),
    paths: { root: "/tmp/repo", specs: "/tmp/repo/.adv/specs" },
  },
  createLegacyStore: vi.fn(async () => mocks.legacyStore as any),
  createTemporalStoreBackend: vi.fn(() => ({ kind: "temporal-store" }) as any),
  getProjectId: vi.fn(async () => "resolved-project-id"),
}));

vi.mock("./store-legacy", () => ({
  createLegacyStore: mocks.createLegacyStore,
}));
vi.mock("./store-temporal", () => ({
  createTemporalStoreBackend: mocks.createTemporalStoreBackend,
}));
vi.mock("../utils/project-id", () => ({ getProjectId: mocks.getProjectId }));

describe("createStore selector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves projectId via getProjectId and returns Temporal-backed store when temporalBundle is provided without projectIdOverride", async () => {
    const { createStore } = await import("./store");

    const result = await createStore("/tmp/repo", {
      temporalBundle: { client: { workflow: {} } } as any,
      externalRoot: "/tmp/external/proj",
    });

    expect(mocks.createLegacyStore).toHaveBeenCalledWith("/tmp/repo", {
      externalRoot: "/tmp/external/proj",
    });
    expect(mocks.getProjectId).toHaveBeenCalledWith("/tmp/repo");
    expect(mocks.createTemporalStoreBackend).toHaveBeenCalledWith({
      legacy: mocks.legacyStore,
      temporal: expect.objectContaining({ client: { workflow: {} } }),
      projectId: "resolved-project-id",
    });
    expect(result).toEqual({ kind: "temporal-store" });
  });
});
