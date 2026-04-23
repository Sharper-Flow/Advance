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

  it("throws when temporalBundle is not provided (Temporal-only runtime)", async () => {
    const { createStore } = await import("./store");

    await expect(
      createStore("/tmp/repo", { externalRoot: "/tmp/external/proj" }),
    ).rejects.toThrow(/temporalBundle is required/i);

    expect(mocks.createLegacyStore).not.toHaveBeenCalled();
    expect(mocks.createTemporalStoreBackend).not.toHaveBeenCalled();
  });

  it("throws when temporalBundle is null (Temporal-only runtime)", async () => {
    const { createStore } = await import("./store");

    await expect(
      createStore("/tmp/repo", {
        temporalBundle: undefined,
        externalRoot: "/tmp/external/proj",
      }),
    ).rejects.toThrow(/temporalBundle is required/i);

    expect(mocks.createLegacyStore).not.toHaveBeenCalled();
    expect(mocks.createTemporalStoreBackend).not.toHaveBeenCalled();
  });
});
