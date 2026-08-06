import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const diskStore = { paths: { root: "/repo/web" }, config: null };
  return {
    diskStore,
    createDiskStore: vi.fn(async () => diskStore),
  };
});

vi.mock("./store-disk", () => ({
  createDiskStore: mocks.createDiskStore,
}));

import { createStore } from "./store";

describe("createStore product context", () => {
  test("creates the disk store and preserves product context", async () => {
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

    const store = await createStore("/repo/web", { productContext });

    expect(mocks.createDiskStore).toHaveBeenCalledWith("/repo/web", {});
    expect(store).toBe(mocks.diskStore);
    expect(store.productContext).toMatchObject({
      repoProjectId: "r".repeat(40),
      productProjectId: "p".repeat(40),
    });
  });
});
