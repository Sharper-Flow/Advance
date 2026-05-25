import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const diskStore = { paths: { root: "/repo/web" }, config: null };
  const temporalStore = { paths: diskStore.paths, config: null };
  return {
    diskStore,
    temporalStore,
    createDiskStore: vi.fn(async () => diskStore),
    createTemporalStoreBackend: vi.fn(() => temporalStore),
    getProjectId: vi.fn(async () => "r".repeat(40)),
  };
});

vi.mock("./store-disk", () => ({
  createDiskStore: mocks.createDiskStore,
}));

vi.mock("./store-temporal", () => ({
  createTemporalStoreBackend: mocks.createTemporalStoreBackend,
}));

vi.mock("../utils/project-id", () => ({
  getProjectId: mocks.getProjectId,
}));

import { createStore } from "./store";

describe("createStore product context", () => {
  test("routes Temporal store through productProjectId while exposing repoProjectId", async () => {
    const productContext = {
      currentRoot: "/repo/web",
      currentRepoId: "web",
      repoProjectId: "r".repeat(40),
      productId: "example-product",
      productProjectId: "p".repeat(40),
      primaryRoot: "/repo/backend",
      primaryRepoId: "backend",
      repos: {},
      mode: "secondary" as const,
      missingPrimaryPolicy: "block" as const,
    };

    const store = await createStore("/repo/web", {
      temporalBundle: {} as never,
      projectIdOverride: productContext.productProjectId,
      productContext,
    });

    expect(mocks.createTemporalStoreBackend).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p".repeat(40) }),
    );
    expect(store.productContext).toMatchObject({
      repoProjectId: "r".repeat(40),
      productProjectId: "p".repeat(40),
    });
  });
});
