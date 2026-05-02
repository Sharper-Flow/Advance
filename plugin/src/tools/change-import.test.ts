/**
 * Change Import Tool Tests
 *
 * TDD tests for adv_change_import.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { readFile, writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { changeImportTools } from "./change-import";
import { changeTools } from "./change";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  parseToolOutput,
} from "../__tests__/setup";
import { createLegacyStore, type Store } from "../storage/store";

const mocks = vi.hoisted(() => ({
  ensureChangeWorkflowStarted: vi.fn(async () => ({ workflowId: "test" })),
  getService: vi.fn(() => ({
    client: {
      workflow: {
        start: vi.fn(async () => ({})),
        getHandle: vi.fn(() => ({})),
      },
    },
  })),
}));

vi.mock("../temporal/migration", async () => {
  const actual =
    await vi.importActual<typeof import("../temporal/migration")>(
      "../temporal/migration",
    );
  return {
    ...actual,
    ensureChangeWorkflowStarted: mocks.ensureChangeWorkflowStarted,
  };
});

vi.mock("../temporal/service", async () => {
  const actual =
    await vi.importActual<typeof import("../temporal/service")>(
      "../temporal/service",
    );
  return {
    ...actual,
    getService: mocks.getService,
  };
});

describe("adv_change_import", () => {
  let tempDir: string;
  let store: Store;
  let sourceDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createLegacyStore(tempDir);

    // Create a hand-authored source directory with minimal change.json
    sourceDir = join(tempDir, "source-change");
    await mkdir(sourceDir, { recursive: true });

    // Minimal change.json — missing tasks/deltas (relies on F3 lenient schema)
    await writeFile(
      join(sourceDir, "change.json"),
      JSON.stringify(
        {
          id: "handAuthoredChange",
          title: "Hand Authored Change",
          status: "draft",
          created_at: "2026-05-02T12:00:00Z",
        },
        null,
        2,
      ),
    );

    await writeFile(
      join(sourceDir, "proposal.md"),
      "# Hand Authored Change\n\n## Intent\n\nTest import.",
    );

    vi.clearAllMocks();
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
  });

  test("imports a hand-authored stub directory and makes it visible via adv_change_list", async () => {
    const result = await changeImportTools.adv_change_import.execute(
      { source_path: sourceDir },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.success).toBe(true);
    expect(parsed.changeId).toBe("handAuthoredChange");
    expect(parsed.seededAtTemporal).toBe(true);
    expect(parsed.importedFields).toContain("tasks");
    expect(parsed.importedFields).toContain("deltas");
    expect(parsed.importedFields).toContain("gates");

    // Verify Temporal workflow was seeded
    expect(mocks.ensureChangeWorkflowStarted).toHaveBeenCalledTimes(1);
    const seedCall = mocks.ensureChangeWorkflowStarted.mock.calls[0];
    expect(seedCall[1]).toMatchObject({
      changeId: "handAuthoredChange",
      title: "Hand Authored Change",
    });

    // Verify change is visible via adv_change_list
    const listResult = await changeTools.adv_change_list.execute({}, store);
    const listParsed = parseToolOutput(listResult);
    const importedChange = listParsed.changes.find(
      (c: { id: string }) => c.id === "handAuthoredChange",
    );
    expect(importedChange).toBeDefined();
    expect(importedChange.title).toBe("Hand Authored Change");
    expect(importedChange.status).toBe("draft");
  });

  test("rejects import when change already exists and overwrite is false", async () => {
    // First import
    await changeImportTools.adv_change_import.execute(
      { source_path: sourceDir },
      store,
    );

    // Second import without overwrite
    const result = await changeImportTools.adv_change_import.execute(
      { source_path: sourceDir },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("already exists");
  });

  test("allows overwrite when change already exists and overwrite is true", async () => {
    // First import
    await changeImportTools.adv_change_import.execute(
      { source_path: sourceDir },
      store,
    );

    // Modify source
    await writeFile(
      join(sourceDir, "change.json"),
      JSON.stringify(
        {
          id: "handAuthoredChange",
          title: "Updated Title",
          status: "active",
          created_at: "2026-05-02T12:00:00Z",
        },
        null,
        2,
      ),
    );

    // Second import with overwrite
    const result = await changeImportTools.adv_change_import.execute(
      { source_path: sourceDir, overwrite: true },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.success).toBe(true);
    expect(parsed.changeId).toBe("handAuthoredChange");

    // Verify updated
    const showResult = await changeTools.adv_change_show.execute(
      { changeId: "handAuthoredChange" },
      store,
    );
    const showParsed = parseToolOutput(showResult);
    expect(showParsed.title).toBe("Updated Title");
    expect(showParsed.status).toBe("active");
  });

  test("rejects import when source change.json is missing", async () => {
    const emptyDir = join(tempDir, "empty-dir");
    await mkdir(emptyDir, { recursive: true });

    const result = await changeImportTools.adv_change_import.execute(
      { source_path: emptyDir },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("not found");
  });

  test("returns error when Temporal service is not initialized", async () => {
    mocks.getService.mockReturnValueOnce(null);

    const result = await changeImportTools.adv_change_import.execute(
      { source_path: sourceDir },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Temporal service layer not initialized");
    // Disk import should have succeeded
    const listResult = await changeTools.adv_change_list.execute({}, store);
    const listParsed = parseToolOutput(listResult);
    const importedChange = listParsed.changes.find(
      (c: { id: string }) => c.id === "handAuthoredChange",
    );
    expect(importedChange).toBeDefined();
  });
});
