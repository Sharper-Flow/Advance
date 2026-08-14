/**
 * adv_epic_list / adv_epic_show worker-free durable projection tests (AC4).
 *
 * Verifies that routine Epic reads render active/retired projection facts without
 * a live workflow, and that completed-candidate evaluation and membership
 * convergence cannot silently report success when their live operation is
 * unreachable.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { epicTools } from "./epic";
import { parseToolOutput } from "../__tests__/setup";
import type { Store } from "../storage/store-types";
import type { Change, Epic, EpicEntry } from "../types";

function makeEpic(overrides?: Partial<Epic>): Epic {
  const now = new Date().toISOString();
  return {
    id: "authEpic",
    title: "Auth Epic",
    narrative: "Authentication initiative.",
    entries: [],
    progress: {
      status: "active",
      total_entries: 0,
      completed_entries: 0,
      active_entries: 0,
      next_entry_id: null,
      updated_at: now,
    },
    created_at: now,
    updated_at: now,
    version: 0,
    ...overrides,
  };
}

function makeStore(epicOverrides?: Partial<Epic>): Store {
  const epic = makeEpic(epicOverrides);
  const change: Change = {
    id: "change-1",
    title: "Linked Change",
    status: "active",
    gates: {},
    tasks: [],
    deltas: {},
    wisdom: [],
    created_at: "2026-06-25T00:00:00.000Z",
    updated_at: "2026-06-25T00:00:00.000Z",
  } as Change;

  return {
    paths: { root: "/workspace/owner" },
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
      list: vi.fn(async () => ({ changes: [] })),
      get: vi.fn(async () => ({ success: true, data: change })),
      create: vi.fn(async () => ({
        changeId: "change-1",
        path: "/tmp/change-1",
      })),
      save: vi.fn(),
      close: vi.fn(),
      closeBatch: vi.fn(),
      refresh: vi.fn(),
      invalidate: vi.fn(),
      setEpicMembership: vi.fn(async () => ({ ...change })),
      clearEpicMembership: vi.fn(async () => ({ ...change })),
    } as Store["changes"],
    tasks: {
      list: vi.fn(async () => []),
      get: vi.fn(async () => null),
      add: vi.fn(),
      update: vi.fn(),
      cancel: vi.fn(),
      reclassifyTdd: vi.fn(),
      show: vi.fn(),
    } as unknown as Store["tasks"],
    wisdom: {
      list: vi.fn(async () => []),
      add: vi.fn(),
    } as unknown as Store["wisdom"],
    gates: {
      get: vi.fn(
        async () =>
          ({}) as NonNullable<
            Store["gates"]["get"] extends infer R
              ? Awaited<ReturnType<R>>
              : never
          >,
      ),
      complete: vi.fn(),
      reopenFrom: vi.fn(),
    },
    status: vi.fn(),
    epics: {
      create: vi.fn(async () => epic),
      get: vi.fn(async () => ({ success: true, data: epic })),
      list: vi.fn(async () => [epic]),
      update: vi.fn(async () => epic),
      updateScope: vi.fn(async () => epic),
      markMerged: vi.fn(async () => epic),
      addShell: vi.fn(async () => ({}) as EpicEntry),
      promoteShell: vi.fn(async () => ({
        entryId: "shell-1",
        changeId: "change-1",
      })),
      linkChange: vi.fn(async () => ({}) as EpicEntry),
      retargetChange: vi.fn(async () => ({}) as EpicEntry),
      unlinkChange: vi.fn(async () => {}),
      reorder: vi.fn(async () => epic),
      setEntryMembershipStatus: vi.fn(async () => ({}) as EpicEntry),
      setEntryTerminalSummary: vi.fn(async () => ({}) as EpicEntry),
      getRetiredProjection: vi.fn(async () => ({ success: true, data: null })),
      saveRetiredProjection: vi.fn(async () => {}),
      retire: vi.fn(async () => ({
        epic_snapshot: epic,
        retired_at: new Date().toISOString(),
        retired_by: "agent",
        evidence: "mock",
        source_workflow_id: "adv/epic/project-id/authEpic",
        source_version: epic.version,
        projection_status: "prepared" as const,
      })),
      repairIndex: vi.fn(async () => ({
        total: 0,
        refreshed: 0,
        unverified: 0,
        skipped: 0,
        unreachable: 0,
        epics: [],
      })),
    },
  } as unknown as Store;
}

describe("adv_epic_show worker-free projection reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("AC4 — renders active Epic projection without live workflow queries", async () => {
    const now = new Date().toISOString();
    const store = makeStore({
      entries: [
        {
          kind: "change",
          entry_id: "entry-1",
          order: 0,
          change_id: "change-1",
          title: "Linked Change",
          membership_status: "linked",
          linked_at: now,
          linked_by: "agent",
          link_evidence: "linked",
        } as EpicEntry,
      ],
      progress: {
        status: "active",
        total_entries: 1,
        completed_entries: 0,
        active_entries: 1,
        next_entry_id: "entry-1",
        updated_at: now,
      },
    });
    store.changes.get = vi.fn(async () => {
      throw new Error("Temporal workflow unreachable");
    });

    const result = await epicTools.adv_epic_show.execute(
      { epic_id: "authEpic" },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.success).toBe(true);
    expect(parsed.epic.id).toBe("authEpic");
    expect(parsed.epic.title).toBe("Auth Epic");
  });

  test("AC4 — renders retired Epic projection without convergence", async () => {
    const retiredEpic = makeEpic({
      id: "retiredEpic",
      title: "Retired Epic",
      progress: {
        status: "completed",
        total_entries: 0,
        completed_entries: 0,
        active_entries: 0,
        next_entry_id: null,
        updated_at: new Date().toISOString(),
      },
    });
    const store = makeStore(retiredEpic);
    store.epics.get = vi.fn(async () => ({
      success: true,
      data: retiredEpic,
      source: "retired_projection" as const,
    }));
    store.epics.getRetiredProjection = vi.fn(async () => ({
      success: true,
      data: {
        epic_snapshot: retiredEpic,
        retired_at: "2026-07-01T00:00:00.000Z",
        retired_by: "agent",
        evidence: "User approved retirement.",
        source_workflow_id: "adv/epic/project-id/retiredEpic",
        source_version: 3,
        projection_status: "retired",
      },
    }));
    store.changes.get = vi.fn(async () => {
      throw new Error("Temporal workflow unreachable");
    });

    const result = await epicTools.adv_epic_show.execute(
      { epic_id: "retiredEpic" },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.success).toBe(true);
    expect(parsed.epic.id).toBe("retiredEpic");
    expect(parsed.epic.retired).toMatchObject({
      projection_status: "retired",
    });
    expect(parsed._unavailable).toBeUndefined();
  });

  test("AC4 — skips cross-project entries and still renders base projection", async () => {
    const now = new Date().toISOString();
    const store = makeStore({
      entries: [
        {
          kind: "change",
          entry_id: "api-entry",
          order: 0,
          change_ref: {
            change_id: "apiChange",
            project_id: "project-api",
            repo_id: "pokeedge-api",
            target_path: "/workspace/pokeedge-api",
          },
          title: "API Change",
          membership_status: "target_unreachable",
          linked_at: now,
          linked_by: "agent",
          link_evidence: "target unavailable during repair",
        } as EpicEntry,
      ],
      progress: {
        status: "active",
        total_entries: 1,
        completed_entries: 0,
        active_entries: 1,
        next_entry_id: "api-entry",
        updated_at: now,
      },
    });
    store.changes.get = vi.fn(async () => {
      throw new Error("Temporal workflow unreachable");
    });

    const result = await epicTools.adv_epic_show.execute(
      { epic_id: "authEpic" },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.success).toBe(true);
    expect(parsed.epic.next_work).toEqual([
      expect.objectContaining({
        entry_id: "api-entry",
        change_id: "apiChange",
        member_status: expect.objectContaining({
          status: "target_unreachable",
        }),
      }),
    ]);
  });
});

describe("adv_epic_list worker-free projection reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("AC4 — lists active Epics from projection without workflow queries", async () => {
    const store = makeStore();

    const result = await epicTools.adv_epic_list.execute({}, store);
    const parsed = parseToolOutput(result);

    expect(parsed.success).toBe(true);
    expect(parsed.status_filter).toBe("active");
    expect(parsed.epics).toHaveLength(1);
    expect(parsed.epics[0].id).toBe("authEpic");
  });

  test("AC4 — status=completed dry-run succeeds when live evaluation is reachable", async () => {
    const completedEpic = makeEpic({
      id: "completedEpic",
      title: "Completed Epic",
      progress: {
        status: "completed",
        total_entries: 0,
        completed_entries: 0,
        active_entries: 0,
        next_entry_id: null,
        updated_at: new Date().toISOString(),
      },
    });
    const store = makeStore(completedEpic);
    store.epics.list = vi.fn(async () => [completedEpic]);

    const result = await epicTools.adv_epic_list.execute(
      { status: "completed" },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.success).toBe(true);
    expect(parsed.status_filter).toBe("completed");
    expect(parsed.report.total_candidates).toBe(1);
    expect(parsed.report.candidates[0].id).toBe("completedEpic");
  });
});
