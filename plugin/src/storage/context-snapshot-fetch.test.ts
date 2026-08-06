import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  fetchChangeContextSnapshot,
  fetchChangeContextTicker,
  maybeAttachChangeTicker,
} from "./context-snapshot-fetch";
import { createDiskStore, type Store } from "./store";
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
    store = await createDiskStore(tempDir);
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

  test("returns a compact ticker for an existing change", async () => {
    const ticker = await fetchChangeContextTicker(store, "addFeature", {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "pending" },
      planning: { status: "pending" },
      execution: { status: "pending" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    });

    expect(ticker).toBeDefined();
    expect(ticker?.split("\n").length).toBe(1);
    expect(ticker).toMatch(
      /║.*addFeature.*·.*discovery ✓→design.*·.*\d+\/\d+.*║/,
    );
    expect(ticker!.length).toBeLessThanOrEqual(80);
  });

  test("returns undefined ticker for non-existent change", async () => {
    const ticker = await fetchChangeContextTicker(store, "nonExistent");

    expect(ticker).toBeUndefined();
  });
});

describe("maybeAttachChangeTicker", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createDiskStore(tempDir);
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
  });

  test("no-op when include is undefined (default-OFF)", async () => {
    const output: Record<string, unknown> = { success: true };
    await maybeAttachChangeTicker(output, undefined, store, "addFeature");
    expect(output._contextSnapshot).toBeUndefined();
  });

  test("no-op when include.snapshot is false", async () => {
    const output: Record<string, unknown> = { success: true };
    await maybeAttachChangeTicker(
      output,
      { snapshot: false },
      store,
      "addFeature",
    );
    expect(output._contextSnapshot).toBeUndefined();
  });

  test("no-op when include.snapshot is undefined", async () => {
    const output: Record<string, unknown> = { success: true };
    await maybeAttachChangeTicker(output, {}, store, "addFeature");
    expect(output._contextSnapshot).toBeUndefined();
  });

  test("attaches ticker when include.snapshot is true for existing change", async () => {
    const output: Record<string, unknown> = { success: true };
    await maybeAttachChangeTicker(
      output,
      { snapshot: true },
      store,
      "addFeature",
    );
    expect(output._contextSnapshot).toBeDefined();
    expect(typeof output._contextSnapshot).toBe("string");
    expect((output._contextSnapshot as string).length).toBeLessThanOrEqual(80);
  });

  test("does not attach ticker for non-existent change (undefined snapshot)", async () => {
    const output: Record<string, unknown> = { success: true };
    await maybeAttachChangeTicker(
      output,
      { snapshot: true },
      store,
      "nonExistent",
    );
    expect(output._contextSnapshot).toBeUndefined();
  });

  test("does not throw when store operations fail (best-effort)", async () => {
    // Use a store-like object that throws on changes.get to simulate failure.
    // The helper MUST swallow the error and not propagate it.
    const throwingStore = {
      ...store,
      changes: {
        ...store.changes,
        get: async () => {
          throw new Error("simulated store failure");
        },
      },
    } as unknown as Store;
    const output: Record<string, unknown> = { success: true };
    // Should NOT throw — best-effort per DDC4
    await expect(
      maybeAttachChangeTicker(
        output,
        { snapshot: true },
        throwingStore,
        "addFeature",
      ),
    ).resolves.toBeUndefined();
    expect(output._contextSnapshot).toBeUndefined();
  });
});
