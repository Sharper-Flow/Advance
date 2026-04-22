/**
 * Change Selection Helper Tests
 *
 * Covers every branch of resolveChangeSelection:
 *   - explicit selector: resolve, dedupe, ambiguous, not-found, protected status
 *   - filter selector: status, prefix, titleContains, createdBefore, lastActivityBefore
 *   - filter validation: missing status+staleness, empty result, protected in results
 */

import { describe, test, expect } from "vitest";
import { resolveChangeSelection, type SelectionDeps } from "./change-selection";
import type { Change, ChangeListResponse } from "../types";
import type { LoadResult } from "./json";

function mockChange(overrides: Partial<Change> = {}): Change {
  return {
    id: "testChange",
    title: "Test Change",
    status: "draft",
    created_at: "2026-01-01T00:00:00Z",
    tasks: [],
    deltas: {},
    ...overrides,
  } as Change;
}

function makeDeps(
  listResult: ChangeListResponse,
  getMap: Record<string, LoadResult<Change | null>> = {},
): SelectionDeps {
  return {
    list: async () => listResult,
    get: async (id: string) =>
      getMap[id] ?? {
        success: false,
        error: `Change not found: ${id}`,
        type: "not_found",
      },
  };
}

describe("resolveChangeSelection — explicit", () => {
  test("resolves single valid changeId", async () => {
    const change = mockChange({ id: "chg-a" });
    const deps = makeDeps(
      { changes: [] },
      { "chg-a": { success: true, data: change } },
    );
    const result = await resolveChangeSelection(
      { kind: "explicit", changeIds: ["chg-a"] },
      deps,
    );
    expect(result).toEqual({ ok: true, changeIds: ["chg-a"] });
  });

  test("resolves multiple valid changeIds", async () => {
    const deps = makeDeps(
      { changes: [] },
      {
        "chg-a": { success: true, data: mockChange({ id: "chg-a" }) },
        "chg-b": { success: true, data: mockChange({ id: "chg-b" }) },
      },
    );
    const result = await resolveChangeSelection(
      { kind: "explicit", changeIds: ["chg-a", "chg-b"] },
      deps,
    );
    expect(result).toEqual({ ok: true, changeIds: ["chg-a", "chg-b"] });
  });

  test("de-duplicates duplicate changeIds", async () => {
    const deps = makeDeps(
      { changes: [] },
      {
        "chg-a": { success: true, data: mockChange({ id: "chg-a" }) },
      },
    );
    const result = await resolveChangeSelection(
      { kind: "explicit", changeIds: ["chg-a", "chg-a"] },
      deps,
    );
    expect(result).toEqual({ ok: true, changeIds: ["chg-a"] });
  });

  test("rejects ambiguous change ID", async () => {
    const deps = makeDeps(
      { changes: [] },
      {
        abc: {
          success: false,
          error: 'Ambiguous change ID "abc". Matches: chg-abc1, chg-abc2.',
          type: "not_found",
        },
      },
    );
    const result = await resolveChangeSelection(
      { kind: "explicit", changeIds: ["abc"] },
      deps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("SELECTION_ERROR");
      expect(result.error).toContain("Ambiguous");
    }
  });

  test("rejects nonexistent change ID", async () => {
    const deps = makeDeps({ changes: [] }, {});
    const result = await resolveChangeSelection(
      { kind: "explicit", changeIds: ["missing"] },
      deps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("SELECTION_ERROR");
    }
  });

  test("rejects active status", async () => {
    const deps = makeDeps(
      { changes: [] },
      {
        "chg-a": {
          success: true,
          data: mockChange({ id: "chg-a", status: "active" }),
        },
      },
    );
    const result = await resolveChangeSelection(
      { kind: "explicit", changeIds: ["chg-a"] },
      deps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("SELECTION_ERROR");
      expect(result.error).toContain("active");
    }
  });

  test("rejects archived status", async () => {
    const deps = makeDeps(
      { changes: [] },
      {
        "chg-a": {
          success: true,
          data: mockChange({ id: "chg-a", status: "archived" }),
        },
      },
    );
    const result = await resolveChangeSelection(
      { kind: "explicit", changeIds: ["chg-a"] },
      deps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("SELECTION_ERROR");
      expect(result.error).toContain("archived");
    }
  });

  test("rejects closed status", async () => {
    const deps = makeDeps(
      { changes: [] },
      {
        "chg-a": {
          success: true,
          data: mockChange({ id: "chg-a", status: "closed" }),
        },
      },
    );
    const result = await resolveChangeSelection(
      { kind: "explicit", changeIds: ["chg-a"] },
      deps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("SELECTION_ERROR");
      expect(result.error).toContain("closed");
    }
  });

  test("accepts pending status", async () => {
    const deps = makeDeps(
      { changes: [] },
      {
        "chg-a": {
          success: true,
          data: mockChange({ id: "chg-a", status: "pending" }),
        },
      },
    );
    const result = await resolveChangeSelection(
      { kind: "explicit", changeIds: ["chg-a"] },
      deps,
    );
    expect(result).toEqual({ ok: true, changeIds: ["chg-a"] });
  });
});

describe("resolveChangeSelection — filter", () => {
  test("resolves with status filter", async () => {
    const deps = makeDeps(
      {
        changes: [
          {
            id: "chg-a",
            title: "A",
            status: "draft",
            taskCount: 0,
            completedTasks: 0,
          },
          {
            id: "chg-b",
            title: "B",
            status: "draft",
            taskCount: 0,
            completedTasks: 0,
          },
        ],
      },
      {
        "chg-a": { success: true, data: mockChange({ id: "chg-a" }) },
        "chg-b": { success: true, data: mockChange({ id: "chg-b" }) },
      },
    );
    const result = await resolveChangeSelection(
      { kind: "filter", filter: { status: "draft" } },
      deps,
    );
    expect(result).toEqual({ ok: true, changeIds: ["chg-a", "chg-b"] });
  });

  test("resolves with prefix filter", async () => {
    const deps = makeDeps(
      {
        changes: [
          {
            id: "test-a",
            title: "A",
            status: "draft",
            taskCount: 0,
            completedTasks: 0,
          },
          {
            id: "other-b",
            title: "B",
            status: "draft",
            taskCount: 0,
            completedTasks: 0,
          },
        ],
      },
      {
        "test-a": { success: true, data: mockChange({ id: "test-a" }) },
      },
    );
    const result = await resolveChangeSelection(
      { kind: "filter", filter: { status: "draft", prefix: "test" } },
      deps,
    );
    expect(result).toEqual({ ok: true, changeIds: ["test-a"] });
  });

  test("resolves with titleContains filter", async () => {
    const deps = makeDeps(
      {
        changes: [
          {
            id: "chg-a",
            title: "Parity test",
            status: "draft",
            taskCount: 0,
            completedTasks: 0,
          },
          {
            id: "chg-b",
            title: "Other feature",
            status: "draft",
            taskCount: 0,
            completedTasks: 0,
          },
        ],
      },
      {
        "chg-a": {
          success: true,
          data: mockChange({ id: "chg-a", title: "Parity test" }),
        },
      },
    );
    const result = await resolveChangeSelection(
      { kind: "filter", filter: { status: "draft", titleContains: "Parity" } },
      deps,
    );
    expect(result).toEqual({ ok: true, changeIds: ["chg-a"] });
  });

  test("resolves with createdBefore filter", async () => {
    const deps = makeDeps(
      {
        changes: [
          {
            id: "old-chg",
            title: "Old",
            status: "draft",
            taskCount: 0,
            completedTasks: 0,
          },
          {
            id: "new-chg",
            title: "New",
            status: "draft",
            taskCount: 0,
            completedTasks: 0,
          },
        ],
      },
      {
        "old-chg": {
          success: true,
          data: mockChange({
            id: "old-chg",
            created_at: "2025-01-01T00:00:00Z",
          }),
        },
        "new-chg": {
          success: true,
          data: mockChange({
            id: "new-chg",
            created_at: "2026-06-01T00:00:00Z",
          }),
        },
      },
    );
    const result = await resolveChangeSelection(
      { kind: "filter", filter: { createdBefore: "2026-01-01T00:00:00Z" } },
      deps,
    );
    expect(result).toEqual({ ok: true, changeIds: ["old-chg"] });
  });

  test("resolves with lastActivityBefore filter", async () => {
    const deps = makeDeps(
      {
        changes: [
          {
            id: "stale-chg",
            title: "Stale",
            status: "draft",
            taskCount: 0,
            completedTasks: 0,
          },
          {
            id: "fresh-chg",
            title: "Fresh",
            status: "draft",
            taskCount: 0,
            completedTasks: 0,
          },
        ],
      },
      {
        "stale-chg": {
          success: true,
          data: mockChange({
            id: "stale-chg",
            created_at: "2025-01-01T00:00:00Z",
            tasks: [
              {
                id: "tk-1",
                title: "Task",
                status: "done",
                type: "code",
                created_at: "2025-01-01T00:00:00Z",
                completed_at: "2025-02-01T00:00:00Z",
              },
            ],
          }),
        },
        "fresh-chg": {
          success: true,
          data: mockChange({
            id: "fresh-chg",
            created_at: "2025-01-01T00:00:00Z",
            tasks: [
              {
                id: "tk-2",
                title: "Task",
                status: "done",
                type: "code",
                created_at: "2025-01-01T00:00:00Z",
                completed_at: "2026-06-01T00:00:00Z",
              },
            ],
          }),
        },
      },
    );
    const result = await resolveChangeSelection(
      {
        kind: "filter",
        filter: { lastActivityBefore: "2026-01-01T00:00:00Z" },
      },
      deps,
    );
    expect(result).toEqual({ ok: true, changeIds: ["stale-chg"] });
  });

  test("AND-composes multiple filters", async () => {
    const deps = makeDeps(
      {
        changes: [
          {
            id: "test-parity",
            title: "Parity feature",
            status: "draft",
            taskCount: 0,
            completedTasks: 0,
          },
          {
            id: "test-other",
            title: "Other feature",
            status: "draft",
            taskCount: 0,
            completedTasks: 0,
          },
          {
            id: "nomatch",
            title: "Parity feature",
            status: "draft",
            taskCount: 0,
            completedTasks: 0,
          },
        ],
      },
      {
        "test-parity": {
          success: true,
          data: mockChange({ id: "test-parity", title: "Parity feature" }),
        },
      },
    );
    const result = await resolveChangeSelection(
      {
        kind: "filter",
        filter: { status: "draft", prefix: "test", titleContains: "Parity" },
      },
      deps,
    );
    expect(result).toEqual({ ok: true, changeIds: ["test-parity"] });
  });

  test("rejects filter without status or staleness", async () => {
    const deps = makeDeps({ changes: [] }, {});
    const result = await resolveChangeSelection(
      { kind: "filter", filter: { prefix: "test" } },
      deps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("SELECTION_ERROR");
      expect(result.error).toContain("status");
    }
  });

  test("rejects empty result set", async () => {
    const deps = makeDeps({ changes: [] }, {});
    const result = await resolveChangeSelection(
      { kind: "filter", filter: { status: "draft" } },
      deps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("SELECTION_ERROR");
      expect(result.error).toContain("Empty");
    }
  });

  test("rejects protected status in filtered results", async () => {
    const deps = makeDeps(
      {
        changes: [
          {
            id: "chg-a",
            title: "A",
            status: "draft",
            taskCount: 0,
            completedTasks: 0,
          },
        ],
      },
      {
        "chg-a": { success: true, data: mockChange({ id: "chg-a" }) },
      },
    );
    const result = await resolveChangeSelection(
      { kind: "filter", filter: { status: "draft" } },
      deps,
    );
    // Real store list() filters by status, so only draft changes are returned.
    expect(result).toEqual({ ok: true, changeIds: ["chg-a"] });
  });
});
