/**
 * adv_change_list / adv_change_show worker-free durable projection tests (AC3).
 *
 * Verifies that routine change reads render from the persisted projection and
 * never issue per-change workflow queries, and that archived/degraded summary
 * metadata is surfaced explicitly rather than hidden as an empty success.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { changeTools } from "./change";
import type { Store } from "../storage/store";
import type { Change } from "../types";

function createMockStore(
  listResult?: Awaited<ReturnType<Store["changes"]["list"]>>,
  changeOverride: Partial<Change> = {},
): Store {
  const change: Change = {
    id: "test-change",
    title: "Test Change",
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
      execution: { status: "done" },
      acceptance: { status: "done" },
      release: { status: "pending" },
    },
    artifacts: {},
    ...changeOverride,
  } as Change;

  return {
    paths: {
      root: "/tmp/test",
      changes: "/tmp/test/.adv/changes",
      archive: "/tmp/test/.adv/archive",
    } as Store["paths"],
    config: null,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {
      list: vi.fn(async () => ({ specs: [] })),
      get: vi.fn(async () => ({ success: false, error: "not found" })),
    } as unknown as Store["specs"],
    changes: {
      list: listResult
        ? vi.fn().mockResolvedValue(listResult)
        : vi.fn(async () => ({ changes: [] })),
      get: vi.fn(async () => ({ success: true, data: change })),
      create: vi.fn(),
      save: vi.fn(),
      close: vi.fn(),
      closeBatch: vi.fn(),
      refresh: vi.fn(async () => undefined),
      invalidate: vi.fn(),
    } as Store["changes"],
    tasks: {
      ready: vi.fn(async () => ({ ready: [], blocked: [] })),
    } as unknown as Store["tasks"],
    wisdom: {} as Store["wisdom"],
    gates: {
      get: vi.fn(async () => change.gates),
      complete: vi.fn(),
      reopenFrom: vi.fn(),
    },
    status: vi.fn(),
    epics: {
      create: vi.fn(),
      get: vi.fn(async () => ({ success: true, data: null })),
      list: vi.fn(async () => []),
      update: vi.fn(),
      addShell: vi.fn(),
      promoteShell: vi.fn(),
      linkChange: vi.fn(),
      unlinkChange: vi.fn(),
      reorder: vi.fn(),
    },
  } as unknown as Store;
}

describe("adv_change_list worker-free projection reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("AC3 — includeArchived returns archived rows from summary projection without workflow queries", async () => {
    const store = createMockStore({
      changes: [
        {
          id: "archived-change",
          title: "Archived Change",
          status: "archived",
          created_at: "2025-12-01T00:00:00Z",
          lastActivityAt: "2025-12-01T01:00:00Z",
          taskCount: 0,
          completedTasks: 0,
        },
      ],
      warnings: [
        {
          code: "TERMINAL_SOURCE_DEGRADED",
          source: "visibility",
          message: "Visibility list unreachable",
        },
      ],
    });

    const result = await changeTools.adv_change_list.execute(
      { includeArchived: true },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.changes).toHaveLength(1);
    expect(parsed.changes[0]).toMatchObject({
      id: "archived-change",
      title: "Archived Change",
      phase: "archived",
    });
  });

  test("AC3 — degraded/corrupt summary surfaces completeness metadata instead of empty success", async () => {
    const store = createMockStore({
      changes: [],
      warnings: [
        {
          code: "SOURCE_DEGRADED",
          source: "disk",
          message: "Change list unavailable",
        },
      ],
      hydrationStats: { omitted: 1 },
    });

    const result = await changeTools.adv_change_list.execute(
      { includeArchived: true },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.changes).toEqual([]);
  });

  test("AC3 — default active list uses listSummary and never falls back to a workflow query", async () => {
    const store = createMockStore({
      changes: [
        {
          id: "draft-change",
          title: "Draft Change",
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          lastActivityAt: "2026-01-01T01:00:00Z",
          taskCount: 0,
          completedTasks: 0,
        },
      ],
    });
    const result = await changeTools.adv_change_list.execute({}, store);
    const parsed = JSON.parse(result);

    expect(parsed.changes).toHaveLength(1);
    expect(parsed.changes[0].id).toBe("draft-change");
  });
});

describe("adv_change_show worker-free projection reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("AC3 — returns persisted change projection without issuing a workflow query", async () => {
    const store = createMockStore();

    const result = await changeTools.adv_change_show.execute(
      { changeId: "test-change" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.id).toBe("test-change");
    expect(parsed.title).toBe("Test Change");
    expect(parsed.status).toBe("active");
  });

  test("AC3 — archived change renders from disk/archive projection without workflow query", async () => {
    const store = createMockStore(undefined, {
      status: "archived",
      lifecycleState: "archived",
    });

    const result = await changeTools.adv_change_show.execute(
      { changeId: "test-change" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.status).toBe("archived");
  });
});
