import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { fetchChangeContextSnapshot } from "./context-snapshot-fetch";
import { createLegacyStore, type Store } from "./store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
} from "../__tests__/setup";

describe("fetchChangeContextSnapshot", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createLegacyStore(tempDir);
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
  });

  test("returns a formatted snapshot for an existing change", async () => {
    const snapshot = await fetchChangeContextSnapshot(store, "addFeature");

    expect(snapshot).toBeDefined();
    expect(snapshot).toContain("addFeature");
    expect(snapshot).toContain("Add New Feature");
    expect(snapshot).toContain("Gates:");
    expect(snapshot).toContain("Tasks:");
    expect(snapshot).toMatch(/[╔╗╚╝║═]/);
  });

  test("returns undefined for non-existent change", async () => {
    const snapshot = await fetchChangeContextSnapshot(store, "nonExistent");

    expect(snapshot).toBeUndefined();
  });

  test("uses provided gates override", async () => {
    const overrideGates = {
      proposal: { status: "done" as const },
      discovery: { status: "done" as const },
      design: { status: "done" as const },
      planning: { status: "done" as const },
      execution: { status: "done" as const },
      acceptance: { status: "done" as const },
      release: { status: "done" as const },
    };

    const snapshot = await fetchChangeContextSnapshot(
      store,
      "addFeature",
      overrideGates,
    );

    expect(snapshot).toBeDefined();
    expect(snapshot).toContain("[✓ proposal]");
    expect(snapshot).toContain("[✓ release]");
  });
});
