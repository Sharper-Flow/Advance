/**
 * Tests for adv_change_set_release_notes tool contract.
 *
 * Covers:
 *   - Tool validates release_notes with canonical schema before signaling.
 *   - Full replacement semantics via store.changes.setReleaseNotes.
 *   - Readback/projection includes release_notes.
 *   - Target_path cross-project routing.
 *   - Placeholder-sensitive args fail preflight before handler/signal/write.
 */

import { describe, expect, test, vi, beforeEach } from "vitest";
import { changeTools } from "./change";
import type { Change, ReleaseNotesContent, Store } from "../types";

const mocks = vi.hoisted(() => ({
  getProjectId: vi.fn(async () => "test-project-id"),
  withTargetPathStore: vi.fn(),
}));

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return { ...actual, getProjectId: mocks.getProjectId };
});

vi.mock("./target-project", async () => {
  const actual =
    await vi.importActual<typeof import("./target-project")>(
      "./target-project",
    );
  return { ...actual, withTargetPathStore: mocks.withTargetPathStore };
});

function createMockStore(change: Change): Store {
  return {
    paths: {
      root: "/tmp/main",
      changes: "/tmp/main/.adv/changes",
      archive: "/tmp/main/.adv/archive",
    } as Store["paths"],
    config: { name: "test", features: {} } as Store["config"],
    changes: {
      get: vi.fn(async (_changeId: string) => ({
        success: true,
        data: change,
      })),
      list: vi.fn(async () => ({ changes: [change] })),
      save: vi.fn(),
      refresh: vi.fn(),
      setReleaseNotes: vi.fn(async (_changeId, input) => ({
        ...change,
        release_notes: input.release_notes,
      })),
    } as unknown as Store["changes"],
  } as unknown as Store;
}

function activeChange(overrides: Partial<Change> = {}): Change {
  return {
    id: "release-notes-change",
    title: "Release notes change",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
      planning: { status: "done" },
      execution: { status: "in_progress" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    } as Change["gates"],
    ...overrides,
  } as Change;
}

const tools = changeTools as unknown as Record<
  string,
  {
    args: Record<string, unknown>;
    execute: (input: unknown, store: Store) => Promise<string>;
  }
>;

const validReleaseNotes: ReleaseNotesContent[] = [
  {
    audience: "external",
    category: "added",
    headline_external: "Added release-note setter",
    area: "workflow",
  },
];

describe("adv_change_set_release_notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withTargetPathStore.mockReset();
  });

  test("calls store.changes.setReleaseNotes with full replacement payload", async () => {
    const store = createMockStore(activeChange());
    const result = await tools.adv_change_set_release_notes.execute(
      {
        changeId: "release-notes-change",
        release_notes: validReleaseNotes,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.changeId).toBe("release-notes-change");
    expect(store.changes.setReleaseNotes).toHaveBeenCalledTimes(1);
    const call = vi.mocked(store.changes.setReleaseNotes).mock.calls[0];
    expect(call[0]).toBe("release-notes-change");
    expect(call[1]?.release_notes).toEqual(validReleaseNotes);
    expect(call[1]?.setAt).toMatch(/\d{4}-/);
  });

  test("returns release_notes in success output", async () => {
    const store = createMockStore(activeChange());
    const result = await tools.adv_change_set_release_notes.execute(
      {
        changeId: "release-notes-change",
        release_notes: validReleaseNotes,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.release_notes).toEqual(validReleaseNotes);
  });

  test("rejects invalid release_notes before signaling (missing required audience)", async () => {
    const store = createMockStore(activeChange());
    const result = await tools.adv_change_set_release_notes.execute(
      {
        changeId: "release-notes-change",
        release_notes: [
          { category: "added" } as unknown as ReleaseNotesContent,
        ],
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toBeDefined();
    expect(parsed.code).toBe("INVALID_TOOL_ARGS");
    expect(store.changes.setReleaseNotes).not.toHaveBeenCalled();
  });

  test("rejects invalid category before signaling", async () => {
    const store = createMockStore(activeChange());
    const result = await tools.adv_change_set_release_notes.execute(
      {
        changeId: "release-notes-change",
        release_notes: [
          {
            audience: "external",
            category: "unknown-category",
          } as unknown as ReleaseNotesContent,
        ],
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toBeDefined();
    expect(parsed.code).toBe("INVALID_TOOL_ARGS");
    expect(store.changes.setReleaseNotes).not.toHaveBeenCalled();
  });

  test("rejects blank changeId before signaling", async () => {
    const store = createMockStore(activeChange());
    const result = await tools.adv_change_set_release_notes.execute(
      {
        changeId: "",
        release_notes: validReleaseNotes,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toBeDefined();
    expect(store.changes.setReleaseNotes).not.toHaveBeenCalled();
  });

  test("routes through target_path when provided", async () => {
    const store = createMockStore(activeChange());
    const targetStore = createMockStore(activeChange());
    mocks.withTargetPathStore.mockImplementation(async (_opts, fn) => {
      return fn({
        context: { projectId: "target-project-id" },
        store: targetStore,
      });
    });

    const result = await tools.adv_change_set_release_notes.execute(
      {
        changeId: "release-notes-change",
        release_notes: validReleaseNotes,
        target_path: "/tmp/target",
        target_confirmed: true,
        confirmationEvidence: "user approved target",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(targetStore.changes.setReleaseNotes).toHaveBeenCalledTimes(1);
    expect(store.changes.setReleaseNotes).not.toHaveBeenCalled();
  });

  test("surfaces store error without swallowing", async () => {
    const store = createMockStore(activeChange());
    vi.mocked(store.changes.setReleaseNotes).mockRejectedValueOnce(
      new Error("temporal unavailable"),
    );

    const result = await tools.adv_change_set_release_notes.execute(
      {
        changeId: "release-notes-change",
        release_notes: validReleaseNotes,
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/temporal unavailable/);
  });
});
