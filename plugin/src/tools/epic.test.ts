import { describe, expect, test, vi } from "vitest";
vi.mock("./target-project", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./target-project")>();
  return {
    ...actual,
    withTargetPathStore: vi.fn(),
    appendTargetProjectContextOutput: vi.fn((output: string) => output),
  };
});

import { epicTools, resolveEpicOwnerStore } from "./epic";
import {
  withTargetPathStore,
  EpicOwnerRoutingError,
  EPIC_OWNER_ROUTING_ERROR_CODES,
} from "./target-project";
import { parseToolOutput } from "../__tests__/setup";
import type { Store } from "../storage/store-types";
import type { Change, Epic, EpicEntry, RetiredEpicProjection } from "../types";

const mockedWithTargetPathStore = vi.mocked(withTargetPathStore);

function makeEpic(overrides?: Partial<Epic>): Epic {
  const now = new Date().toISOString();
  return {
    id: "addAuthEpic",
    title: "Add Auth Epic",
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
    id: "change-2",
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
    epics: {
      create: vi.fn(async () => epic),
      get: vi.fn(async () => ({ success: true, data: epic })),
      list: vi.fn(async () => [epic]),
      update: vi.fn(async () => epic),
      updateScope: vi.fn(async () => epic),
      markMerged: vi.fn(async () => ({
        ...epic,
        merged_into: {
          epic_id: "survivorEpic",
          merged_at: "2026-06-25T00:00:00.000Z",
          merged_by: "agent",
          evidence: "merged",
          moved_entry_count: 1,
        },
        progress: { ...epic.progress, status: "merged" },
      })),
      addShell: vi.fn(async (_epicId, input) =>
        makeShellEntry({
          entry_id: "shell-1",
          title: "Shell One",
          ...(input?.context_packet !== undefined
            ? { context_packet: input.context_packet }
            : {}),
        }),
      ),
      promoteShell: vi.fn(async (_epicId, entryId, changeId) => {
        const shell = epic.entries.find(
          (entry): entry is Extract<EpicEntry, { kind: "shell" }> =>
            entry.kind === "shell" && entry.entry_id === entryId,
        );
        if (shell) {
          epic.entries = epic.entries.map((entry) =>
            entry === shell
              ? makeChangeEntry({
                  entry_id: entryId,
                  order: shell.order,
                  title: shell.title,
                  change_id: changeId,
                  membership_status: "linked",
                  linked_at: "2026-08-20T12:00:00.000Z",
                })
              : entry,
          );
        }
        return { entryId, changeId };
      }),
      linkChange: vi.fn(async () =>
        makeChangeEntry({ entry_id: "entry-2", change_id: "change-2" }),
      ),
      unlinkChange: vi.fn(async () => {}),
      retargetChange: vi.fn(async () =>
        makeChangeEntry({
          entry_id: "entry-2",
          change_id: "change-2",
          title: "Linked Change",
          membership_status: "linked",
          linked_at: "2026-06-25T00:00:00.000Z",
          linked_by: "agent",
        }),
      ),
      setEntryMembershipStatus: vi.fn(async () =>
        makeChangeEntry({
          entry_id: "entry-2",
          change_ref: { change_id: "change-2", project_id: "project-api" },
          title: "Linked Change",
          membership_status: "target_unreachable",
          linked_at: "2026-06-25T00:00:00.000Z",
          linked_by: "agent",
          link_evidence: "target failed",
        }),
      ),
      setEntryTerminalSummary: vi.fn(async () =>
        makeChangeEntry({
          entry_id: "entry-2",
          change_ref: { change_id: "change-2", project_id: "project-api" },
          title: "Linked Change",
          membership_status: "terminal",
          linked_at: "2026-06-25T00:00:00.000Z",
          linked_by: "agent",
          link_evidence: "terminal repair",
          terminal_summary: {
            status: "archived",
            completed_at: "2026-06-26T00:00:00.000Z",
          },
        }),
      ),
      reorder: vi.fn(async () => epic),
      getRetiredProjection: vi.fn(async () => ({ success: true, data: null })),
      saveRetiredProjection: vi.fn(async () => {}),
      retire: vi.fn(async () => ({
        epic_snapshot: epic,
        retired_at: new Date().toISOString(),
        retired_by: "agent",
        evidence: "mock",
        source_workflow_id: "adv/epic/project-id/addAuthEpic",
        source_version: epic.version,
        projection_status: "prepared" as const,
      })),
      repairIndex: vi.fn(async () => ({
        total: 2,
        refreshed: 1,
        unverified: 0,
        skipped: 0,
        unreachable: 1,
        epics: [
          {
            epic_id: "activeEpic",
            status: "active",
            action: "refreshed" as const,
          },
          {
            epic_id: "missingEpic",
            status: "unknown",
            action: "unreachable" as const,
            error: "Workflow state unavailable",
          },
        ],
      })),
    },
    changes: {
      get: vi.fn(async () => ({ success: true, data: change })),
      create: vi.fn(async () => ({
        changeId: "change-1",
        path: "/tmp/change-1",
      })),
      setEpicMembership: vi.fn(async () => ({
        ...change,
        epic_membership: {
          epic_id: "addAuthEpic",
          entry_id: "entry-2",
          order: 1,
          title: "Linked Change",
          linked_at: "2026-06-25T00:00:00.000Z",
        },
      })),
      clearEpicMembership: vi.fn(async () => ({
        ...change,
        epic_membership: undefined,
      })),
    },
  } as unknown as Store;
}

function makeShellEntry(
  overrides?: Partial<Extract<EpicEntry, { kind: "shell" }>>,
): Extract<EpicEntry, { kind: "shell" }> {
  return {
    kind: "shell",
    entry_id: "shell-1",
    order: 0,
    title: "Shell One",
    success_hint: "Do the thing",
    ...overrides,
  };
}

function makeChangeEntry(
  overrides?: Partial<Extract<EpicEntry, { kind: "change" }>>,
): Extract<EpicEntry, { kind: "change" }> {
  return {
    kind: "change",
    entry_id: "entry-2",
    order: 1,
    change_id: "change-2",
    ...overrides,
  };
}

describe("adv_epic_create", () => {
  test("creates an Epic and returns formatted state", async () => {
    const store = makeStore();
    const output = await epicTools.adv_epic_create.execute(
      { epic_id: "addAuthEpic", title: "Add Auth Epic", narrative: "Auth." },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.epic.id).toBe("addAuthEpic");
    expect(store.epics.create).toHaveBeenCalledWith(
      "addAuthEpic",
      "Add Auth Epic",
      "Auth.",
    );
  });

  test("creates a product-scoped Epic with multiple repo identities", async () => {
    const productScope = {
      kind: "product" as const,
      owner_project_id: "project-web",
      owner_repo_id: "pokeedge-web",
      repos: [
        {
          repo_id: "pokeedge-web",
          repo_project_id: "project-web",
          role: "primary" as const,
          required: true,
        },
        {
          repo_id: "pokeedge-api",
          repo_project_id: "project-api",
          role: "secondary" as const,
          required: true,
        },
      ],
    };
    const store = makeStore({ epic_scope: productScope });

    const output = await epicTools.adv_epic_create.execute(
      {
        epic_id: "productAuthEpic",
        title: "Product Auth Epic",
        narrative: "Auth across web and API.",
        scope_kind: "product",
        owner_project_id: "project-web",
        owner_repo_id: "pokeedge-web",
        scope_repos: productScope.repos,
      },
      store,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(store.epics.create).toHaveBeenCalledWith(
      "productAuthEpic",
      "Product Auth Epic",
      "Auth across web and API.",
      { epicScope: productScope },
    );
    expect(parsed.epic.epic_scope).toEqual(productScope);
  });
});

describe("adv_epic_show", () => {
  test("default compact view returns bounded history and next work", async () => {
    const now = new Date().toISOString();
    const store = makeStore({
      entries: [
        {
          kind: "change",
          entry_id: "done-1",
          order: 0,
          change_id: "doneChange",
          terminal_summary: { status: "archived", completed_at: now },
        },
        {
          kind: "change",
          entry_id: "active-1",
          order: 1,
          change_id: "activeChange",
        },
        {
          kind: "shell",
          entry_id: "shell-1",
          order: 2,
          title: "Future Shell",
          success_hint: "Do it",
        },
      ],
      progress: {
        status: "active",
        total_entries: 3,
        completed_entries: 1,
        active_entries: 1,
        next_entry_id: "active-1",
        updated_at: now,
      },
    });
    const output = await epicTools.adv_epic_show.execute(
      { epic_id: "addAuthEpic" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.epic.title).toBe("Add Auth Epic");
    expect(parsed.epic.history).toHaveLength(1);
    expect(parsed.epic.history[0]).toMatchObject({
      entry_id: "done-1",
      change_id: "doneChange",
      status: "archived",
    });
    expect(parsed.epic.history_total).toBe(1);
    expect(parsed.epic.next_work).toHaveLength(2);
    expect(parsed.epic.next_work[0]).toMatchObject({
      entry_id: "active-1",
      kind: "change",
      status: "active",
    });
    expect(parsed.epic.next_work[1]).toMatchObject({
      entry_id: "shell-1",
      kind: "shell",
      status: "future",
    });
    expect(parsed.epic.entries).toBeUndefined();
  });

  test("full view returns complete entries", async () => {
    const store = makeStore();
    const output = await epicTools.adv_epic_show.execute(
      { epic_id: "addAuthEpic", view: "full" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.epic.entries).toBeDefined();
  });

  test("renders derived scope label in compact and full views", async () => {
    const store = makeStore({
      epic_scope: {
        kind: "repo",
        owner_project_id: "project-web",
        repos: [
          {
            repo_id: "web",
            repo_project_id: "project-web",
            role: "primary",
            required: true,
          },
          {
            repo_id: "api",
            repo_project_id: "project-api",
            role: "secondary",
            required: true,
          },
        ],
      },
    });

    const compact = parseToolOutput(
      await epicTools.adv_epic_show.execute({ epic_id: "addAuthEpic" }, store),
    );
    const full = parseToolOutput(
      await epicTools.adv_epic_show.execute(
        { epic_id: "addAuthEpic", view: "full" },
        store,
      ),
    );

    expect(compact.epic.scope_label).toBe("product-spanning");
    expect(full.epic.scope_label).toBe("product-spanning");
  });

  test("merged source shows survivor pointer and no next work", async () => {
    const store = makeStore({
      merged_into: {
        epic_id: "survivorEpic",
        merged_at: "2026-06-25T00:00:00.000Z",
        merged_by: "agent",
        evidence: "Duplicate active Epic merged.",
        moved_entry_count: 1,
      },
      progress: {
        status: "merged",
        total_entries: 1,
        completed_entries: 0,
        active_entries: 0,
        next_entry_id: null,
        updated_at: "2026-06-25T00:00:00.000Z",
      },
      entries: [
        {
          kind: "shell",
          entry_id: "shell-1",
          order: 0,
          title: "Hidden future work",
          success_hint: "No active recommendation after merge.",
        },
      ],
    });

    const parsed = parseToolOutput(
      await epicTools.adv_epic_show.execute({ epic_id: "addAuthEpic" }, store),
    );

    expect(parsed.epic.status).toBe("merged");
    expect(parsed.epic.merged_into).toMatchObject({ epic_id: "survivorEpic" });
    expect(parsed.epic.next_work).toEqual([]);
  });

  test("returns typed not-found error", async () => {
    const store = makeStore();
    store.epics.get = vi.fn(async () => ({ success: true, data: null }));
    const output = await epicTools.adv_epic_show.execute(
      { epic_id: "missingEpic" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.code).toBe("EPIC_NOT_FOUND");
  });

  test("falls back to retired projection and includes retirement metadata", async () => {
    const epic = makeEpic({
      id: "retiredEpic",
      title: "Retired Epic",
      progress: {
        status: "completed",
        total_entries: 0,
        completed_entries: 0,
        active_entries: 0,
        next_entry_id: null,
        updated_at: "2026-07-08T00:00:00.000Z",
      },
    });
    const retiredProjection: RetiredEpicProjection = {
      epic_snapshot: epic,
      retired_at: "2026-07-08T00:00:00.000Z",
      retired_by: "agent",
      evidence: "User approved retirement.",
      source_workflow_id: "adv/epic/project-id/retiredEpic",
      source_version: 3,
      projection_status: "retired",
    };
    const store = makeStore();
    store.epics.get = vi.fn(async () => ({
      success: true,
      data: epic,
      source: "retired_projection" as const,
    }));
    store.epics.getRetiredProjection = vi.fn(async () => ({
      success: true,
      data: retiredProjection,
    }));

    const output = await epicTools.adv_epic_show.execute(
      { epic_id: "retiredEpic" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.epic.id).toBe("retiredEpic");
    expect(parsed.epic.retired).toMatchObject({
      retired_at: "2026-07-08T00:00:00.000Z",
      retired_by: "agent",
      evidence: "User approved retirement.",
      source_workflow_id: "adv/epic/project-id/retiredEpic",
      source_version: 3,
      projection_status: "retired",
    });
  });

  test("compact view bounds history to COMPACT_HISTORY_LIMIT and includes closed children", async () => {
    const now = new Date().toISOString();
    const entries: EpicEntry[] = [];
    for (let i = 0; i < 6; i++) {
      entries.push({
        kind: "change",
        entry_id: `done-${i}`,
        order: i,
        change_id: `doneChange-${i}`,
        terminal_summary: {
          status: i % 2 === 0 ? "archived" : "closed",
          completed_at: now,
        },
      });
    }
    const store = makeStore({
      entries,
      progress: {
        status: "active",
        total_entries: entries.length,
        completed_entries: entries.length,
        active_entries: 0,
        next_entry_id: null,
        updated_at: now,
      },
    });
    const output = await epicTools.adv_epic_show.execute(
      { epic_id: "addAuthEpic" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.epic.history).toHaveLength(5);
    expect(parsed.epic.history_total).toBe(6);
    expect(parsed.epic.history[0].status).toBe("archived");
    expect(parsed.epic.history[1].status).toBe("closed");
    expect(
      parsed.epic.history.map((h: { entry_id: string }) => h.entry_id),
    ).toEqual(["done-0", "done-1", "done-2", "done-3", "done-4"]);
  });

  test("compact view next_work skips terminal children", async () => {
    const now = new Date().toISOString();
    const store = makeStore({
      entries: [
        {
          kind: "change",
          entry_id: "archived-1",
          order: 0,
          change_id: "archivedChange",
          terminal_summary: { status: "archived", completed_at: now },
        },
        {
          kind: "change",
          entry_id: "closed-1",
          order: 1,
          change_id: "closedChange",
          terminal_summary: { status: "closed", completed_at: now },
        },
        {
          kind: "change",
          entry_id: "active-1",
          order: 2,
          change_id: "activeChange",
        },
        {
          kind: "shell",
          entry_id: "shell-1",
          order: 3,
          title: "Future Shell",
          success_hint: "Do it",
        },
      ],
      progress: {
        status: "active",
        total_entries: 4,
        completed_entries: 2,
        active_entries: 1,
        next_entry_id: "active-1",
        updated_at: now,
      },
    });
    const output = await epicTools.adv_epic_show.execute(
      { epic_id: "addAuthEpic" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.epic.next_work).toHaveLength(2);
    expect(parsed.epic.next_work[0]).toMatchObject({
      entry_id: "active-1",
      kind: "change",
      status: "active",
    });
    expect(parsed.epic.next_work[1]).toMatchObject({
      entry_id: "shell-1",
      kind: "shell",
      status: "future",
    });
  });

  test("compact view includes bounded member status for active change entries", async () => {
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
        },
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

    const output = await epicTools.adv_epic_show.execute(
      { epic_id: "addAuthEpic" },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.epic.next_work).toEqual([
      expect.objectContaining({
        entry_id: "api-entry",
        change_id: "apiChange",
        member_status: expect.objectContaining({
          status: "target_unreachable",
          message: expect.stringContaining("target"),
        }),
      }),
    ]);
    expect(parsed.epic.next_work[0].member_status.last_checked_at).toEqual(
      expect.any(String),
    );
    expect(parsed.epic.entries).toBeUndefined();
  });

  test("rq-epicDirectConvergence01: repairs stale entry status when child projection is correctly linked (issue #255 case c)", async () => {
    // Reproduction: Epic link completed correctly (child has matching
    // epic_membership), but the Epic entry's membership_status was never
    // advanced from projection_pending. Pre-convergence, adv_epic_show
    // would emit projection_missing and recommend convergence.
    // Post-convergence, the entry is repaired to "linked" in-place and the
    // rendered member_status is "ok".
    const entryId = "entry-stale";
    const changeId = "change-stale";
    const epicId = "addAuthEpic";
    const staleEntry: Extract<EpicEntry, { kind: "change" }> = {
      kind: "change",
      entry_id: entryId,
      order: 1,
      change_id: changeId,
      title: "Stale entry",
      membership_status: "projection_pending",
      linked_at: "2026-07-01T00:00:00.000Z",
      linked_by: "agent",
      link_evidence: "original link",
    };
    const childChange = {
      id: changeId,
      title: "Stale entry",
      status: "draft",
      epic_membership: {
        epic_id: epicId,
        entry_id: entryId,
        order: 1,
        title: "Stale entry",
        linked_at: "2026-07-01T00:00:00.000Z",
      },
    } as Change;
    const repairedEntry: Extract<EpicEntry, { kind: "change" }> = {
      ...staleEntry,
      membership_status: "linked",
    };
    const setEntryMembershipStatus = vi.fn(async () => repairedEntry);
    const store = makeStore({
      entries: [staleEntry],
      progress: {
        status: "active",
        total_entries: 1,
        completed_entries: 0,
        active_entries: 1,
        next_entry_id: entryId,
        updated_at: "2026-07-01T00:00:00.000Z",
      },
    });
    // Override changes.get to return our childChange, and stub the repair.
    (store.changes.get as ReturnType<typeof vi.fn>).mockImplementation(
      async (requestedId: string) =>
        requestedId === changeId
          ? { success: true, data: childChange }
          : { success: false, data: null },
    );
    store.epics.setEntryMembershipStatus = setEntryMembershipStatus;

    const output = await epicTools.adv_epic_show.execute(
      { epic_id: epicId },
      store,
    );
    const parsed = parseToolOutput(output);

    // Convergence repaired the entry in-place.
    expect(setEntryMembershipStatus).toHaveBeenCalledWith(
      epicId,
      expect.objectContaining({
        entryId,
        membershipStatus: "linked",
        evidence: expect.stringContaining("convergence"),
      }),
    );
    // Rendered member_status reflects the post-convergence truth: ok.
    expect(parsed.epic.next_work[0]).toMatchObject({
      entry_id: entryId,
      change_id: changeId,
      member_status: expect.objectContaining({ status: "ok" }),
    });
  });

  test("rq-epicDirectConvergence01: does not repair when child genuinely has no projection", async () => {
    // Entry is linked but child change has no epic_membership projection.
    // Convergence should rebuild the child projection (sync_child_projection)
    // rather than recommending manual repair.
    const entryId = "entry-missing-proj";
    const changeId = "change-missing-proj";
    const epicId = "addAuthEpic";
    const linkedEntry: Extract<EpicEntry, { kind: "change" }> = {
      kind: "change",
      entry_id: entryId,
      order: 1,
      change_id: changeId,
      title: "Missing projection",
      membership_status: "linked",
      linked_at: "2026-07-01T00:00:00.000Z",
      linked_by: "agent",
      link_evidence: "link",
    };
    const childChangeNoProj = {
      id: changeId,
      title: "Missing projection",
      status: "draft",
      // epic_membership intentionally absent
    } as Change;
    const setEpicMembership = vi.fn(async () => childChangeNoProj);
    const store = makeStore({
      entries: [linkedEntry],
      progress: {
        status: "active",
        total_entries: 1,
        completed_entries: 0,
        active_entries: 1,
        next_entry_id: entryId,
        updated_at: "2026-07-01T00:00:00.000Z",
      },
    });
    (store.changes.get as ReturnType<typeof vi.fn>).mockImplementation(
      async (requestedId: string) =>
        requestedId === changeId
          ? { success: true, data: childChangeNoProj }
          : { success: false, data: null },
    );
    store.changes.setEpicMembership = setEpicMembership;

    const output = await epicTools.adv_epic_show.execute(
      { epic_id: epicId },
      store,
    );
    const parsed = parseToolOutput(output);

    // Convergence rebuilt the child projection.
    expect(setEpicMembership).toHaveBeenCalledWith(
      changeId,
      expect.objectContaining({
        membership: expect.objectContaining({
          epic_id: epicId,
          entry_id: entryId,
        }),
      }),
    );
    // Entry was already linked; rendered member_status is ok.
    expect(parsed.epic.next_work[0]).toMatchObject({
      entry_id: entryId,
      member_status: expect.objectContaining({ status: "ok" }),
    });
  });
});

describe("adv_epic_show fast-follow lineage projection (rq-epicFastFollowLineage01)", () => {
  function makeChildChangeWithFastFollow(overrides?: {
    parentChangeId?: string;
    reportKey?: string;
    linkedAt?: string;
    includeFollowupRef?: boolean;
  }) {
    const linkedAt = overrides?.linkedAt ?? "2026-07-13T20:00:00.000Z";
    const fast_follow_of =
      overrides?.includeFollowupRef === false
        ? {
            parent_change_id: overrides?.parentChangeId ?? "parentChange",
            linked_at: linkedAt,
          }
        : {
            parent_change_id: overrides?.parentChangeId ?? "parentChange",
            linked_at: linkedAt,
            followup_ref: {
              report_key:
                overrides?.reportKey ??
                "parentChange|tk-source123|adv-engineer|1",
              kind: "follow_ups" as const,
              index: 0,
            },
          };
    return {
      id: "childChange",
      title: "Child Change",
      status: "active",
      gates: {},
      tasks: [],
      deltas: {},
      wisdom: [],
      created_at: "2026-07-13T00:00:00.000Z",
      updated_at: "2026-07-13T00:00:00.000Z",
      fast_follow_of,
    } as unknown as Change;
  }

  test("compact view renders fast-follow lineage on next_work change entries", async () => {
    const now = new Date().toISOString();
    const store = makeStore({
      entries: [
        {
          kind: "change",
          entry_id: "child-1",
          order: 0,
          change_id: "childChange",
        },
      ],
      progress: {
        status: "active",
        total_entries: 1,
        completed_entries: 0,
        active_entries: 1,
        next_entry_id: "child-1",
        updated_at: now,
      },
    });
    (store.changes.get as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) => {
        if (id === "childChange") {
          return { success: true, data: makeChildChangeWithFastFollow() };
        }
        return { success: false, error: "not found", type: "not_found" };
      },
    );

    const output = await epicTools.adv_epic_show.execute(
      { epic_id: "addAuthEpic" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.epic.next_work).toHaveLength(1);
    expect(parsed.epic.next_work[0].fast_follow_lineage).toMatchObject({
      source_change_id: "parentChange",
      source_task_id: "tk-source123",
      classification: "non_blocking_advisory",
      linked_at: "2026-07-13T20:00:00.000Z",
    });
  });

  test("full view renders fast-follow lineage on entries", async () => {
    const store = makeStore({
      entries: [
        {
          kind: "change",
          entry_id: "child-1",
          order: 0,
          change_id: "childChange",
        },
      ],
    });
    (store.changes.get as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) => {
        if (id === "childChange") {
          return { success: true, data: makeChildChangeWithFastFollow() };
        }
        return { success: false, error: "not found", type: "not_found" };
      },
    );

    const output = await epicTools.adv_epic_show.execute(
      { epic_id: "addAuthEpic", view: "full" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.epic.entries).toHaveLength(1);
    expect(parsed.epic.entries[0].fast_follow_lineage).toMatchObject({
      source_change_id: "parentChange",
      source_task_id: "tk-source123",
      classification: "non_blocking_advisory",
    });
  });

  test("source_task_id is null when followup_ref report_key is change scope", async () => {
    const store = makeStore({
      entries: [
        {
          kind: "change",
          entry_id: "child-1",
          order: 0,
          change_id: "childChange",
        },
      ],
    });
    (store.changes.get as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) => {
        if (id === "childChange") {
          return {
            success: true,
            data: makeChildChangeWithFastFollow({
              reportKey: "parentChange|change:scopeKey|adv-engineer|1",
            }),
          };
        }
        return { success: false, error: "not found", type: "not_found" };
      },
    );

    const output = await epicTools.adv_epic_show.execute(
      { epic_id: "addAuthEpic", view: "full" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(
      parsed.epic.entries[0].fast_follow_lineage.source_task_id,
    ).toBeNull();
  });

  test("source_task_id is null when fast_follow_of has no followup_ref", async () => {
    const store = makeStore({
      entries: [
        {
          kind: "change",
          entry_id: "child-1",
          order: 0,
          change_id: "childChange",
        },
      ],
    });
    (store.changes.get as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) => {
        if (id === "childChange") {
          return {
            success: true,
            data: makeChildChangeWithFastFollow({ includeFollowupRef: false }),
          };
        }
        return { success: false, error: "not found", type: "not_found" };
      },
    );

    const output = await epicTools.adv_epic_show.execute(
      { epic_id: "addAuthEpic", view: "full" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(
      parsed.epic.entries[0].fast_follow_lineage.source_task_id,
    ).toBeNull();
  });

  test("omits fast_follow_lineage when child change has no fast_follow_of", async () => {
    const store = makeStore({
      entries: [
        {
          kind: "change",
          entry_id: "child-1",
          order: 0,
          change_id: "childChange",
        },
      ],
    });
    (store.changes.get as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) => {
        if (id === "childChange") {
          const change = makeChildChangeWithFastFollow();
          const { fast_follow_of: _ff, ...rest } = change as unknown as {
            fast_follow_of: unknown;
          } & Record<string, unknown>;
          void _ff;
          return { success: true, data: rest as unknown as Change };
        }
        return { success: false, error: "not found", type: "not_found" };
      },
    );

    const output = await epicTools.adv_epic_show.execute(
      { epic_id: "addAuthEpic", view: "full" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.epic.entries[0].fast_follow_lineage).toBeUndefined();
  });

  test("omits fast_follow_lineage when child change load fails", async () => {
    const store = makeStore({
      entries: [
        {
          kind: "change",
          entry_id: "child-1",
          order: 0,
          change_id: "childChange",
        },
      ],
    });
    (store.changes.get as ReturnType<typeof vi.fn>).mockImplementation(
      async () => ({ success: false, error: "boom", type: "read_error" }),
    );

    const output = await epicTools.adv_epic_show.execute(
      { epic_id: "addAuthEpic", view: "full" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.epic.entries[0].fast_follow_lineage).toBeUndefined();
  });

  test("does not add lineage to shell entries", async () => {
    const store = makeStore({
      entries: [
        {
          kind: "shell",
          entry_id: "shell-1",
          order: 0,
          title: "Future Shell",
          success_hint: "Do it",
        },
      ],
    });
    const output = await epicTools.adv_epic_show.execute(
      { epic_id: "addAuthEpic", view: "full" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.epic.entries[0].fast_follow_lineage).toBeUndefined();
  });
});

describe("adv_epic_add_shell", () => {
  test("adds a shell entry", async () => {
    const store = makeStore();
    const output = await epicTools.adv_epic_add_shell.execute(
      {
        epic_id: "addAuthEpic",
        title: "Shell One",
        success_hint: "Do the thing",
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.entry.kind).toBe("shell");
  });

  test("persists a valid context_packet", async () => {
    const packet = {
      background: "Epic shell background",
      constraints: ["Must be safe"],
    };
    const store = makeStore();
    const output = await epicTools.adv_epic_add_shell.execute(
      {
        epic_id: "addAuthEpic",
        title: "Shell One",
        success_hint: "Do the thing",
        context_packet: packet,
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.entry.context_packet).toEqual(packet);
    expect(store.epics.addShell).toHaveBeenCalledWith(
      "addAuthEpic",
      expect.objectContaining({ context_packet: packet }),
    );
  });

  test("rejects an invalid context_packet", async () => {
    const store = makeStore();
    const output = await epicTools.adv_epic_add_shell.execute(
      {
        epic_id: "addAuthEpic",
        title: "Shell One",
        success_hint: "Do the thing",
        context_packet: "not-an-object",
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(false);
    expect(parsed.code).toBe("invalid_context_packet");
    expect(store.epics.addShell).not.toHaveBeenCalled();
  });

  test("rejects an oversize context_packet", async () => {
    const packet = {
      background: "y".repeat(4096),
      design_seed: "x".repeat(6144),
      constraints: Array.from({ length: 12 }, () => "z".repeat(512)),
      avoidances: Array.from({ length: 12 }, () => "w".repeat(512)),
    };
    const store = makeStore();
    const output = await epicTools.adv_epic_add_shell.execute(
      {
        epic_id: "addAuthEpic",
        title: "Shell One",
        success_hint: "Do the thing",
        context_packet: packet,
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(false);
    expect(parsed.code).toBe("context_packet_too_large");
    expect(store.epics.addShell).not.toHaveBeenCalled();
  });

  test("rejects a context_packet that exceeds the Epic aggregate cap", async () => {
    const largePacket = {
      background: "b".repeat(4096),
      design_seed: "x".repeat(6000),
      constraints: Array.from({ length: 6 }, () => "c".repeat(512)),
      avoidances: Array.from({ length: 5 }, () => "a".repeat(512)),
    };
    const existingEntries = Array.from({ length: 17 }, (_, i) =>
      makeShellEntry({
        entry_id: `shell-existing-${i}`,
        context_packet: largePacket,
      }),
    );
    const store = makeStore({ entries: existingEntries });
    const incomingPacket = {
      background: "incoming".repeat(500),
      design_seed: "y".repeat(6000),
    };
    const output = await epicTools.adv_epic_add_shell.execute(
      {
        epic_id: "addAuthEpic",
        title: "Shell Two",
        success_hint: "Do another thing",
        context_packet: incomingPacket,
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(false);
    expect(parsed.code).toBe("epic_aggregate_context_packets_exceeded");
    expect(store.epics.addShell).not.toHaveBeenCalled();
  });
});

describe("adv_epic_promote_shell", () => {
  test("promotes a shell with an existing change_id", async () => {
    const store = makeStore({
      entries: [makeShellEntry({ entry_id: "shell-1" })],
    });
    const output = await epicTools.adv_epic_promote_shell.execute(
      { epic_id: "addAuthEpic", entry_id: "shell-1", change_id: "change-1" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.change_id).toBe("change-1");
    expect(store.changes.create).not.toHaveBeenCalled();
    expect(store.epics.promoteShell).toHaveBeenCalledWith(
      "addAuthEpic",
      "shell-1",
      "change-1",
      "agent",
    );
  });

  test("creates a bare change from shell before promotion", async () => {
    const store = makeStore({
      entries: [makeShellEntry({ entry_id: "shell-1", order: 3 })],
    });
    const output = await epicTools.adv_epic_promote_shell.execute(
      { epic_id: "addAuthEpic", entry_id: "shell-1" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.change_id).toBe("change-1");
    expect(store.changes.create).toHaveBeenCalledWith(
      "Shell One",
      expect.objectContaining({
        artifacts: expect.any(Object),
      }),
    );
    const [, createOptions] = (
      store.changes.create as unknown as {
        mock: { calls: [string, { initialMetadata?: unknown }][] };
      }
    ).mock.calls[0];
    expect(createOptions.initialMetadata).toBeUndefined();
  });

  test("failed promotion leaves the newly created child without epic membership", async () => {
    const store = makeStore({
      entries: [makeShellEntry({ entry_id: "shell-1", order: 3 })],
    });
    store.epics.promoteShell = vi.fn(async () => {
      throw new Error("promoteShell unavailable");
    });

    const output = await epicTools.adv_epic_promote_shell.execute(
      { epic_id: "addAuthEpic", entry_id: "shell-1" },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.code).toBe("EPIC_ERROR");
    expect(store.changes.create).toHaveBeenCalled();
    const [, createOptions] = (
      store.changes.create as unknown as {
        mock: { calls: [string, { initialMetadata?: unknown }][] };
      }
    ).mock.calls[0];
    expect(createOptions.initialMetadata).toBeUndefined();
    expect(store.changes.setEpicMembership).not.toHaveBeenCalled();
  });

  test("projects successful promotion from the promoted Epic entry", async () => {
    const linkedAt = "2026-08-20T12:00:00.000Z";
    const promotedEntry = makeChangeEntry({
      entry_id: "entry-1",
      order: 7,
      change_id: "change-1",
      title: "Promoted title",
      linked_at: linkedAt,
      change_ref: {
        change_id: "change-1",
        project_id: "project-owner",
        repo_id: "repo-owner",
      },
    });
    const store = makeStore({
      entries: [makeShellEntry({ entry_id: "shell-1", order: 3 })],
    });
    store.epics.get = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        data: makeEpic({ entries: [makeShellEntry({ entry_id: "shell-1" })] }),
      })
      .mockResolvedValueOnce({
        success: true,
        data: makeEpic({ entries: [promotedEntry] }),
      });
    store.epics.promoteShell = vi.fn(async () => ({
      entryId: "entry-1",
      changeId: "change-1",
    }));

    const output = await epicTools.adv_epic_promote_shell.execute(
      { epic_id: "addAuthEpic", entry_id: "shell-1" },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(store.changes.setEpicMembership).toHaveBeenCalledWith("change-1", {
      membership: {
        epic_id: "addAuthEpic",
        entry_id: "entry-1",
        order: 7,
        title: "Promoted title",
        linked_at: linkedAt,
        source: "promote_shell",
        repo_id: "repo-owner",
      },
      setAt: linkedAt,
    });
  });

  test("retry after failed promotion succeeds with the same change_id", async () => {
    const linkedAt = "2026-08-20T12:00:00.000Z";
    const promotedEntry = makeChangeEntry({
      entry_id: "entry-1",
      order: 7,
      change_id: "change-1",
      title: "Promoted title",
      linked_at: linkedAt,
    });
    const store = makeStore({
      entries: [makeShellEntry({ entry_id: "shell-1" })],
    });
    store.epics.get = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        data: makeEpic({ entries: [makeShellEntry({ entry_id: "shell-1" })] }),
      })
      .mockResolvedValueOnce({
        success: true,
        data: makeEpic({ entries: [makeShellEntry({ entry_id: "shell-1" })] }),
      })
      .mockResolvedValueOnce({
        success: true,
        data: makeEpic({ entries: [promotedEntry] }),
      });
    store.epics.promoteShell = vi
      .fn()
      .mockRejectedValueOnce(new Error("promoteShell unavailable"))
      .mockResolvedValueOnce({ entryId: "entry-1", changeId: "change-1" });

    const firstOutput = await epicTools.adv_epic_promote_shell.execute(
      { epic_id: "addAuthEpic", entry_id: "shell-1", change_id: "change-1" },
      store,
    );
    expect(parseToolOutput(firstOutput).code).toBe("EPIC_ERROR");

    const retryOutput = await epicTools.adv_epic_promote_shell.execute(
      { epic_id: "addAuthEpic", entry_id: "shell-1", change_id: "change-1" },
      store,
    );

    expect(parseToolOutput(retryOutput).success).toBe(true);
    expect(store.changes.create).not.toHaveBeenCalled();
    expect(store.changes.setEpicMembership).toHaveBeenCalledWith(
      "change-1",
      expect.objectContaining({
        membership: expect.objectContaining({
          entry_id: "entry-1",
          source: "promote_shell",
        }),
      }),
    );
  });

  test("returns typed error when shell entry is missing", async () => {
    const store = makeStore();
    const output = await epicTools.adv_epic_promote_shell.execute(
      { epic_id: "addAuthEpic", entry_id: "missing-shell" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.code).toBe("SHELL_NOT_FOUND");
  });

  test("injects a valid context_packet into the generated proposal seed", async () => {
    const packet = {
      background: "Historical reasons this work matters.",
      design_seed: "Lean on the existing event bus.",
      references: [{ label: "RFC-1", locator: "https://example.com/rfc-1" }],
      constraints: ["Must keep the public API stable."],
      avoidances: ["Do not introduce a new database."],
    };
    const store = makeStore({
      entries: [
        makeShellEntry({ entry_id: "shell-1", context_packet: packet }),
      ],
    });
    const output = await epicTools.adv_epic_promote_shell.execute(
      { epic_id: "addAuthEpic", entry_id: "shell-1" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(store.changes.create).toHaveBeenCalled();

    const [, createOptions] = (
      store.changes.create as unknown as {
        mock: { calls: [string, { artifacts: { proposal: string } }][] };
      }
    ).mock.calls[0];
    const proposal = createOptions.artifacts.proposal;
    expect(proposal).toContain("## Future-Work Context");
    expect(proposal).toContain(packet.background);
    expect(proposal).toContain(packet.design_seed);
    expect(proposal).toContain("RFC-1");
    expect(proposal).toContain(packet.constraints[0]);
    expect(proposal).toContain(packet.avoidances[0]);
    expect(proposal).toContain("Promoted from Epic addAuthEpic shell shell-1.");
  });

  test("leaves the proposal seed unchanged when the shell has no context_packet", async () => {
    const store = makeStore({
      entries: [makeShellEntry({ entry_id: "shell-1" })],
    });
    const output = await epicTools.adv_epic_promote_shell.execute(
      { epic_id: "addAuthEpic", entry_id: "shell-1" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(store.changes.create).toHaveBeenCalled();

    const [, createOptions] = (
      store.changes.create as unknown as {
        mock: { calls: [string, { artifacts: { proposal: string } }][] };
      }
    ).mock.calls[0];
    const proposal = createOptions.artifacts.proposal;
    expect(proposal).not.toContain("## Future-Work Context");
    expect(proposal).toContain("## Intent");
  });

  test("omits an oversized context_packet from the proposal seed with a note", async () => {
    const oversizedPacket = {
      background: "b".repeat(4096),
      design_seed: "d".repeat(6144),
      references: Array.from({ length: 12 }, (_, i) => ({
        label: `ref-${i}`,
        locator: "https://example.com/" + "x".repeat(2000),
      })),
    };
    const store = makeStore({
      entries: [
        makeShellEntry({
          entry_id: "shell-1",
          context_packet: oversizedPacket,
        }),
      ],
    });
    const output = await epicTools.adv_epic_promote_shell.execute(
      { epic_id: "addAuthEpic", entry_id: "shell-1" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(store.changes.create).toHaveBeenCalled();

    const [, createOptions] = (
      store.changes.create as unknown as {
        mock: { calls: [string, { artifacts: { proposal: string } }][] };
      }
    ).mock.calls[0];
    const proposal = createOptions.artifacts.proposal;
    expect(proposal).toContain("## Future-Work Context");
    expect(proposal).not.toContain(oversizedPacket.background);
    expect(proposal).toContain("exceeded the size budget");
    expect(proposal).toContain("It was omitted to keep the proposal bounded");
  });
});

describe("adv_epic_link_change", () => {
  test("routes child projection through target_path while Epic remains owner-local", async () => {
    const ownerStore = makeStore();
    const targetStore = makeStore();
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/pokeedge-api",
          projectId: "project-api",
          externalRoot: "/xdg/project-api",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: targetStore,
      }),
    );
    ownerStore.epics.linkChange = vi.fn(async () =>
      makeChangeEntry({
        entry_id: "api-entry",
        order: 1,
        change_ref: {
          change_id: "change-2",
          project_id: "project-api",
          repo_id: "pokeedge-api",
          target_path: "/workspace/pokeedge-api",
        },
        title: "Linked Change",
        linked_at: "2026-06-25T00:00:00.000Z",
        membership_status: "projection_pending",
      }),
    );

    const output = await epicTools.adv_epic_link_change.execute(
      {
        epic_id: "addAuthEpic",
        change_id: "change-2",
        repo_id: "pokeedge-api",
        link_evidence: "User grouped API work.",
        target_path: "/workspace/pokeedge-api",
        target_confirmed: true,
        confirmationEvidence: "target approved",
      },
      ownerStore,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(mockedWithTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        currentProjectPath: ownerStore.paths.root,
        target_path: "/workspace/pokeedge-api",
        stateRequirement: "authoritative",
        target_confirmed: true,
        confirmationEvidence: "target approved",
      }),
      expect.any(Function),
    );
    expect(ownerStore.epics.linkChange).toHaveBeenCalledWith(
      "addAuthEpic",
      expect.objectContaining({
        changeProjectId: "project-api",
        repoId: "pokeedge-api",
        targetPath: "/workspace/pokeedge-api",
      }),
    );
    expect(targetStore.changes.setEpicMembership).toHaveBeenCalledWith(
      "change-2",
      expect.objectContaining({
        membership: expect.objectContaining({
          epic_id: "addAuthEpic",
          entry_id: "api-entry",
          repo_id: "pokeedge-api",
        }),
      }),
    );
    expect(
      vi.mocked(targetStore.changes.setEpicMembership).mock.calls[0]?.[1]
        ?.membership,
    ).not.toHaveProperty("epic_project_id");
  });

  test("links existing same-project change and sets child epic_membership", async () => {
    const linkedEntry = makeChangeEntry({
      entry_id: "entry-2",
      order: 4,
      change_ref: { change_id: "change-2", project_id: "project-1" },
      title: "Linked Change",
      membership_status: "projection_pending",
      linked_at: "2026-06-25T00:00:00.000Z",
      linked_by: "agent",
      link_evidence: "User grouped existing work.",
    });
    const store = makeStore();
    store.epics.linkChange = vi.fn(async () => linkedEntry);

    const output = await epicTools.adv_epic_link_change.execute(
      {
        epic_id: "addAuthEpic",
        change_id: "change-2",
        order: 4,
        link_evidence: "User grouped existing work.",
      },
      store,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(store.epics.linkChange).toHaveBeenCalledWith(
      "addAuthEpic",
      expect.objectContaining({
        changeId: "change-2",
        title: "Linked Change",
        linkEvidence: "User grouped existing work.",
      }),
    );
    expect(store.changes.setEpicMembership).toHaveBeenCalledWith(
      "change-2",
      expect.objectContaining({
        membership: expect.objectContaining({
          epic_id: "addAuthEpic",
          entry_id: "entry-2",
          order: 4,
          title: "Linked Change",
          source: "link_existing",
        }),
      }),
    );
    expect(
      vi.mocked(store.changes.setEpicMembership).mock.calls[0]?.[1]?.membership,
    ).not.toHaveProperty("epic_project_id");
  });

  test("repairs child projection idempotently when Epic entry already exists", async () => {
    const store = makeStore({
      entries: [
        makeChangeEntry({
          entry_id: "entry-2",
          change_id: "change-2",
          title: "Linked Change",
          linked_at: "2026-06-25T00:00:00.000Z",
          membership_status: "projection_pending",
        }),
      ],
    });

    const output = await epicTools.adv_epic_link_change.execute(
      {
        epic_id: "addAuthEpic",
        change_id: "change-2",
        link_evidence: "Retry after projection failure.",
      },
      store,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.idempotent).toBe(true);
    expect(store.epics.linkChange).not.toHaveBeenCalled();
    expect(store.changes.setEpicMembership).toHaveBeenCalledWith(
      "change-2",
      expect.objectContaining({
        membership: expect.objectContaining({
          epic_id: "addAuthEpic",
          entry_id: "entry-2",
        }),
        // The entry already exists, so the child's projection should already
        // name it. Stating the expectation makes a drifted child a typed
        // conflict at the storage boundary rather than a silent overwrite.
        expectedCurrent: { epic_id: "addAuthEpic", entry_id: "entry-2" },
      }),
    );
  });

  test("re-linking an existing entry surfaces a drifted child projection", async () => {
    const store = makeStore({
      entries: [
        makeChangeEntry({
          entry_id: "entry-2",
          change_id: "change-2",
          title: "Linked Change",
          linked_at: "2026-06-25T00:00:00.000Z",
          membership_status: "projection_pending",
        }),
      ],
    });
    // Storage refuses because the child now belongs to a different Epic.
    store.changes.setEpicMembership = vi.fn(async () => {
      throw Object.assign(new Error("conflicting projection"), {
        code: "epic_membership_conflict",
      });
    });

    const parsed = parseToolOutput(
      await epicTools.adv_epic_link_change.execute(
        {
          epic_id: "addAuthEpic",
          change_id: "change-2",
          link_evidence: "Retry after drift.",
        },
        store,
      ),
    );

    expect(parsed.success).not.toBe(true);
    expect(JSON.stringify(parsed)).toContain("conflicting projection");
  });

  test("rejects duplicate membership before linking", async () => {
    const store = makeStore();
    store.changes.get = vi.fn(async () => ({
      success: true,
      data: {
        id: "change-2",
        title: "Linked Change",
        status: "active",
        gates: {},
        tasks: [],
        created_at: "2026-06-25T00:00:00.000Z",
        updated_at: "2026-06-25T00:00:00.000Z",
        epic_membership: {
          epic_id: "otherEpic",
          entry_id: "entry-other",
          order: 0,
          title: "Other",
          linked_at: "2026-06-25T00:00:00.000Z",
        },
      } as Change,
    }));

    const output = await epicTools.adv_epic_link_change.execute(
      {
        epic_id: "addAuthEpic",
        change_id: "change-2",
        link_evidence: "User grouped existing work.",
      },
      store,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.code).toBe("CHANGE_ALREADY_IN_EPIC");
    expect(store.epics.linkChange).not.toHaveBeenCalled();
    expect(store.changes.setEpicMembership).not.toHaveBeenCalled();
  });

  test("rebuilds parent Epic entry when child has exact membership but parent entry is missing", async () => {
    const store = makeStore();
    store.changes.get = vi.fn(async () => ({
      success: true,
      data: {
        id: "change-2",
        title: "Linked Change",
        status: "active",
        gates: {},
        tasks: [],
        created_at: "2026-06-25T00:00:00.000Z",
        updated_at: "2026-06-25T00:00:00.000Z",
        epic_membership: {
          epic_id: "addAuthEpic",
          entry_id: "entry-2",
          order: 4,
          title: "Linked Change",
          linked_at: "2026-06-25T00:00:00.000Z",
        },
      } as Change,
    }));
    store.epics.linkChange = vi.fn(async () =>
      makeChangeEntry({
        entry_id: "entry-2",
        change_id: "change-2",
        title: "Linked Change",
        order: 4,
        membership_status: "projection_pending",
        linked_at: "2026-06-25T00:00:00.000Z",
      }),
    );

    const output = await epicTools.adv_epic_link_change.execute(
      {
        epic_id: "addAuthEpic",
        change_id: "change-2",
        link_evidence: "Retry after parent entry lost.",
      },
      store,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.rebuilt).toBe(true);
    expect(store.epics.linkChange).toHaveBeenCalledWith(
      "addAuthEpic",
      expect.objectContaining({
        entryId: "entry-2",
        changeId: "change-2",
        title: "Linked Change",
        linkEvidence: "Retry after parent entry lost.",
      }),
    );
    expect(store.changes.setEpicMembership).toHaveBeenCalledWith(
      "change-2",
      expect.objectContaining({
        membership: expect.objectContaining({
          epic_id: "addAuthEpic",
          entry_id: "entry-2",
          order: 4,
          title: "Linked Change",
        }),
      }),
    );
    expect(store.epics.retargetChange).not.toHaveBeenCalled();
  });

  test("retargets stale parent entry when child has exact membership and explicit entry_id matches", async () => {
    const store = makeStore({
      entries: [
        makeChangeEntry({
          entry_id: "entry-2",
          change_id: "change-old",
          title: "Old Change",
          order: 4,
          membership_status: "projection_stale",
        }),
      ],
    });
    store.changes.get = vi.fn(async () => ({
      success: true,
      data: {
        id: "change-2",
        title: "Linked Change",
        status: "active",
        gates: {},
        tasks: [],
        created_at: "2026-06-25T00:00:00.000Z",
        updated_at: "2026-06-25T00:00:00.000Z",
        epic_membership: {
          epic_id: "addAuthEpic",
          entry_id: "entry-2",
          order: 4,
          title: "Linked Change",
          linked_at: "2026-06-25T00:00:00.000Z",
        },
      } as Change,
    }));
    store.epics.retargetChange = vi.fn(async () =>
      makeChangeEntry({
        entry_id: "entry-2",
        change_id: "change-2",
        title: "Linked Change",
        order: 4,
        membership_status: "linked",
        linked_at: "2026-06-25T00:00:00.000Z",
      }),
    );

    const output = await epicTools.adv_epic_link_change.execute(
      {
        epic_id: "addAuthEpic",
        change_id: "change-2",
        entry_id: "entry-2",
        link_evidence: "Repair stale parent entry.",
      },
      store,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.retargeted).toBe(true);
    expect(store.epics.retargetChange).toHaveBeenCalledWith(
      "addAuthEpic",
      expect.objectContaining({
        entryId: "entry-2",
        fromChangeId: "change-old",
        toChangeId: "change-2",
        title: "Linked Change",
        retargetEvidence: "Repair stale parent entry.",
      }),
    );
    expect(store.epics.linkChange).not.toHaveBeenCalled();
  });

  test("retargets stale parent entry from exact child membership when entry_id is omitted", async () => {
    const store = makeStore({
      entries: [
        makeChangeEntry({
          entry_id: "entry-2",
          change_id: "change-old",
          title: "Old Change",
          order: 4,
          membership_status: "projection_stale",
        }),
      ],
    });
    store.changes.get = vi.fn(async () => ({
      success: true,
      data: {
        id: "change-2",
        title: "Linked Change",
        status: "active",
        gates: {},
        tasks: [],
        created_at: "2026-06-25T00:00:00.000Z",
        updated_at: "2026-06-25T00:00:00.000Z",
        epic_membership: {
          epic_id: "addAuthEpic",
          entry_id: "entry-2",
          order: 4,
          title: "Linked Change",
          linked_at: "2026-06-25T00:00:00.000Z",
        },
      } as Change,
    }));
    store.epics.retargetChange = vi.fn(async () =>
      makeChangeEntry({
        entry_id: "entry-2",
        change_id: "change-2",
        title: "Linked Change",
        order: 4,
        membership_status: "linked",
        linked_at: "2026-06-25T00:00:00.000Z",
      }),
    );

    const output = await epicTools.adv_epic_link_change.execute(
      {
        epic_id: "addAuthEpic",
        change_id: "change-2",
        link_evidence: "Repair stale parent entry from child projection.",
      },
      store,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.retargeted).toBe(true);
    expect(store.epics.retargetChange).toHaveBeenCalledWith(
      "addAuthEpic",
      expect.objectContaining({
        entryId: "entry-2",
        fromChangeId: "change-old",
        toChangeId: "change-2",
        title: "Linked Change",
        retargetEvidence: "Repair stale parent entry from child projection.",
      }),
    );
    expect(store.epics.linkChange).not.toHaveBeenCalled();
    expect(store.changes.setEpicMembership).toHaveBeenCalledWith(
      "change-2",
      expect.objectContaining({
        membership: expect.objectContaining({
          epic_id: "addAuthEpic",
          entry_id: "entry-2",
          title: "Linked Change",
        }),
      }),
    );
  });

  test("rejects when child membership mismatches requested Epic or entry", async () => {
    const store = makeStore();
    store.changes.get = vi.fn(async () => ({
      success: true,
      data: {
        id: "change-2",
        title: "Linked Change",
        status: "active",
        gates: {},
        tasks: [],
        created_at: "2026-06-25T00:00:00.000Z",
        updated_at: "2026-06-25T00:00:00.000Z",
        epic_membership: {
          epic_id: "addAuthEpic",
          entry_id: "entry-3",
          order: 4,
          title: "Linked Change",
          linked_at: "2026-06-25T00:00:00.000Z",
        },
      } as Change,
    }));

    const output = await epicTools.adv_epic_link_change.execute(
      {
        epic_id: "addAuthEpic",
        change_id: "change-2",
        entry_id: "entry-2",
        link_evidence: "User grouped existing work.",
      },
      store,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.code).toBe("CHANGE_ALREADY_IN_EPIC");
    expect(parsed.current_membership).toEqual({
      epic_id: "addAuthEpic",
      entry_id: "entry-3",
      order: 4,
      title: "Linked Change",
      linked_at: "2026-06-25T00:00:00.000Z",
    });
    expect(store.epics.linkChange).not.toHaveBeenCalled();
    expect(store.epics.retargetChange).not.toHaveBeenCalled();
    expect(store.changes.setEpicMembership).not.toHaveBeenCalled();
  });

  test.each(["archived", "closed"] as const)(
    "projects terminal child state when directly linking a %s change",
    async (status) => {
      const store = makeStore();
      store.changes.get = vi.fn(async () => ({
        success: true,
        data: {
          id: "change-2",
          title: "Done Change",
          status,
          gates: {},
          tasks: [],
          deltas: {},
          wisdom: [],
          created_at: "2026-06-25T00:00:00.000Z",
          updated_at: "2026-06-26T00:00:00.000Z",
        } as Change,
      }));
      store.epics.linkChange = vi.fn(async () =>
        makeChangeEntry({
          entry_id: "entry-2",
          change_id: "change-2",
          title: "Done Change",
          membership_status: "projection_pending",
          linked_at: "2026-06-25T00:00:00.000Z",
          linked_by: "agent",
          link_evidence: "Direct link terminal.",
        }),
      );
      store.epics.setEntryMembershipStatus = vi.fn(async () =>
        makeChangeEntry({
          entry_id: "entry-2",
          change_id: "change-2",
          title: "Done Change",
          membership_status: "terminal",
          terminal_summary: {
            status,
            completed_at: "2026-06-26T00:00:00.000Z",
          },
          linked_at: "2026-06-25T00:00:00.000Z",
          linked_by: "agent",
          link_evidence: "Direct link terminal.",
        }),
      );

      const output = await epicTools.adv_epic_link_change.execute(
        {
          epic_id: "addAuthEpic",
          change_id: "change-2",
          link_evidence: "Direct link terminal change.",
        },
        store,
      );
      const parsed = parseToolOutput(output);

      expect(parsed.success).toBe(true);
      expect(parsed.terminal_summary_projected).toBe(true);
      expect(parsed.terminal_summary.status).toBe(status);
      expect(store.epics.setEntryTerminalSummary).toHaveBeenCalledWith(
        "addAuthEpic",
        {
          entryId: "entry-2",
          status,
          completedAt: "2026-06-26T00:00:00.000Z",
        },
      );
      expect(store.epics.setEntryMembershipStatus).toHaveBeenCalledWith(
        "addAuthEpic",
        expect.objectContaining({
          entryId: "entry-2",
          membershipStatus: "terminal",
          evidence: "Direct link terminal change.",
        }),
      );
      expect(parsed.member_status.status).toBe("ok");
    },
  );
});

describe("adv_epic_unlink_change", () => {
  test("clears child projection before removing Epic entry", async () => {
    const store = makeStore({
      entries: [
        makeChangeEntry({ entry_id: "entry-2", change_id: "change-2" }),
      ],
    });

    const output = await epicTools.adv_epic_unlink_change.execute(
      {
        epic_id: "addAuthEpic",
        entry_id: "entry-2",
        unlink_evidence: "No longer part of initiative.",
      },
      store,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(store.changes.clearEpicMembership).toHaveBeenCalledWith("change-2", {
      expected: { epic_id: "addAuthEpic", entry_id: "entry-2" },
    });
    expect(store.epics.unlinkChange).toHaveBeenCalledWith(
      "addAuthEpic",
      "entry-2",
      "No longer part of initiative.",
    );
  });
});

describe("adv_epic_move_change", () => {
  test("moves child membership from source Epic to destination Epic", async () => {
    const fromEpic = makeEpic({
      id: "fromEpic",
      entries: [
        makeChangeEntry({ entry_id: "from-entry", change_id: "change-2" }),
      ],
    });
    const toEpic = makeEpic({ id: "toEpic", entries: [] });
    const store = makeStore();
    store.epics.get = vi.fn(async (epicId: string) => ({
      success: true,
      data: epicId === "fromEpic" ? fromEpic : toEpic,
    }));
    store.changes.get = vi.fn(async () => ({
      success: true,
      data: {
        id: "change-2",
        title: "Linked Change",
        status: "active",
        gates: {},
        tasks: [],
        created_at: "2026-06-25T00:00:00.000Z",
        updated_at: "2026-06-25T00:00:00.000Z",
        epic_membership: {
          epic_id: "fromEpic",
          entry_id: "from-entry",
          order: 0,
          title: "Linked Change",
          linked_at: "2026-06-25T00:00:00.000Z",
        },
      } as Change,
    }));
    store.epics.linkChange = vi.fn(async () =>
      makeChangeEntry({
        entry_id: "to-entry",
        order: 2,
        change_ref: { change_id: "change-2", project_id: "project-1" },
        title: "Linked Change",
        linked_at: "2026-06-25T00:01:00.000Z",
        membership_status: "projection_pending",
      }),
    );

    const output = await epicTools.adv_epic_move_change.execute(
      {
        from_epic_id: "fromEpic",
        to_epic_id: "toEpic",
        change_id: "change-2",
        order: 2,
        move_evidence: "Move into better initiative.",
      },
      store,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(store.epics.linkChange).toHaveBeenCalledWith(
      "toEpic",
      expect.objectContaining({
        changeId: "change-2",
        linkEvidence: "Move into better initiative.",
      }),
    );
    expect(store.changes.setEpicMembership).toHaveBeenCalledWith(
      "change-2",
      expect.objectContaining({
        expectedCurrent: { epic_id: "fromEpic", entry_id: "from-entry" },
        membership: expect.objectContaining({
          epic_id: "toEpic",
          entry_id: "to-entry",
          source: "move",
        }),
      }),
    );
    expect(store.epics.unlinkChange).toHaveBeenCalledWith(
      "fromEpic",
      "from-entry",
      "Move into better initiative.",
    );
  });
});

describe("adv_epic_reorder", () => {
  test("reorders entries and returns typed error on stale version", async () => {
    const store = makeStore();
    store.epics.reorder = vi.fn(async () => {
      const err = new Error("Expected Epic version 2, found 5");
      (err as { code?: string }).code = "stale_version";
      throw err;
    });
    const output = await epicTools.adv_epic_reorder.execute(
      {
        epic_id: "addAuthEpic",
        entry_ids: ["a", "b"],
        expected_version: 2,
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.code).toBe("stale_version");
  });
});

describe("adv_epic_retire", () => {
  test("dry-run returns projection summary without mutating", async () => {
    const store = makeStore();
    const output = await epicTools.adv_epic_retire.execute(
      {
        epic_id: "addAuthEpic",
        expected_version: 0,
        evidence: "User approved retirement.",
        dryRun: true,
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.epic_id).toBe("addAuthEpic");
    expect(parsed.retired.projection_status).toBe("prepared");
    expect(parsed.epic.id).toBe("addAuthEpic");
    expect(store.epics.retire).toHaveBeenCalledWith(
      "addAuthEpic",
      expect.objectContaining({
        expectedVersion: 0,
        evidence: "User approved retirement.",
        retiredBy: "agent",
        dryRun: true,
      }),
    );
  });

  test("retires a completed Epic and returns a show-compatible summary", async () => {
    const store = makeStore();
    const output = await epicTools.adv_epic_retire.execute(
      {
        epic_id: "addAuthEpic",
        expected_version: 0,
        evidence: "User approved retirement.",
        retired_by: "operator",
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(false);
    expect(parsed.epic_id).toBe("addAuthEpic");
    expect(parsed.epic.id).toBe("addAuthEpic");
    expect(parsed.retired.retired_by).toBe("agent");
    expect(parsed.retired.evidence).toBe("mock");
    expect(store.epics.retire).toHaveBeenCalledWith(
      "addAuthEpic",
      expect.objectContaining({
        expectedVersion: 0,
        evidence: "User approved retirement.",
        retiredBy: "operator",
        dryRun: false,
      }),
    );
  });

  test("rejects incomplete Epic with typed blockers", async () => {
    const store = makeStore();
    store.epics.retire = vi.fn(async () => {
      const err = new Error(
        "Epic addAuthEpic has incomplete entries and cannot be retired",
      );
      (err as { code?: string }).code = "epic_incomplete";
      (err as { blockers?: unknown }).blockers = [
        { entry_id: "entry-1", kind: "change", reason: "active" },
      ];
      throw err;
    });
    const output = await epicTools.adv_epic_retire.execute(
      {
        epic_id: "addAuthEpic",
        expected_version: 0,
        evidence: "User approved retirement.",
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.code).toBe("epic_incomplete");
    expect(parsed.blockers).toEqual([
      { entry_id: "entry-1", kind: "change", reason: "active" },
    ]);
  });

  test("returns typed stale_version error", async () => {
    const store = makeStore();
    store.epics.retire = vi.fn(async () => {
      const err = new Error("Expected Epic version 0, found 3");
      (err as { code?: string }).code = "stale_version";
      throw err;
    });
    const output = await epicTools.adv_epic_retire.execute(
      {
        epic_id: "addAuthEpic",
        expected_version: 0,
        evidence: "User approved retirement.",
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.code).toBe("stale_version");
  });

  test("routes owner Epic through epic_owner_target_path", async () => {
    const ownerStore = makeStore();
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/owner",
          projectId: "project-owner",
          externalRoot: "/xdg/project-owner",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: ownerStore,
      }),
    );

    const output = await epicTools.adv_epic_retire.execute(
      {
        epic_id: "addAuthEpic",
        expected_version: 0,
        evidence: "User approved retirement.",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(ownerStore.epics.retire).toHaveBeenCalledWith(
      "addAuthEpic",
      expect.objectContaining({ expectedVersion: 0 }),
    );
    expect(currentStore.epics.retire).not.toHaveBeenCalled();
    expect(parsed._epicOwnerProjectContext).toMatchObject({
      root: "/workspace/owner",
      projectId: "project-owner",
    });
  });
});

describe("adv_epic_update", () => {
  test("rejects update when neither title nor narrative provided", async () => {
    const store = makeStore();
    const output = await epicTools.adv_epic_update.execute(
      { epic_id: "addAuthEpic", expected_version: 0 },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.error).toMatch(/title or narrative/);
  });
});

describe("Epic owner routing", () => {
  test("resolveEpicOwnerStore returns current store when no owner route is provided", async () => {
    const store = makeStore();
    const result = await resolveEpicOwnerStore({ store });
    expect(result.context).toBeNull();
    expect(result.store).toBe(store);
  });

  test("adv_epic_link_change exposes owner route args on the live tool surface", () => {
    expect(epicTools.adv_epic_link_change.args).toHaveProperty(
      "epic_owner_target_path",
    );
    expect(epicTools.adv_epic_link_change.args).toHaveProperty(
      "epic_owner_target_confirmed",
    );
    expect(epicTools.adv_epic_link_change.args).toHaveProperty(
      "epic_owner_confirmationEvidence",
    );
  });

  test("adv_epic_link_change routes owner Epic through epic_owner_target_path", async () => {
    const ownerStore = makeStore();
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/owner",
          projectId: "project-owner",
          externalRoot: "/xdg/project-owner",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: ownerStore,
      }),
    );

    const output = await epicTools.adv_epic_link_change.execute(
      {
        epic_id: "addAuthEpic",
        change_id: "change-2",
        link_evidence: "User linked change to remote-owner Epic.",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(ownerStore.epics.linkChange).toHaveBeenCalledWith(
      "addAuthEpic",
      expect.any(Object),
    );
    expect(parsed._epicOwnerProjectContext).toMatchObject({
      root: "/workspace/owner",
      projectId: "project-owner",
      stateMode: "temporal",
    });
  });

  test("adv_epic_link_change splits owner and child project contexts", async () => {
    const ownerStore = makeStore();
    const childStore = makeStore();
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    ownerStore.epics.linkChange = vi.fn(async () =>
      makeChangeEntry({
        change_ref: {
          change_id: "change-2",
          project_id: "project-child",
        },
      }),
    );
    mockedWithTargetPathStore
      .mockImplementationOnce(async (_input, fn) =>
        fn({
          context: {
            root: "/workspace/owner",
            projectId: "project-owner",
            externalRoot: "/xdg/project-owner",
            trusted: true,
            trustSource: "related_repos",
            stateMode: "temporal",
          },
          store: ownerStore,
        }),
      )
      .mockImplementationOnce(async (_input, fn) =>
        fn({
          context: {
            root: "/workspace/child",
            projectId: "project-child",
            externalRoot: "/xdg/project-child",
            trusted: false,
            trustSource: "explicit",
            stateMode: "temporal",
          },
          store: childStore,
        }),
      );

    const output = await epicTools.adv_epic_link_change.execute(
      {
        epic_id: "addAuthEpic",
        change_id: "change-2",
        link_evidence: "User linked remote child to remote-owner Epic.",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
        target_path: "/workspace/child",
        target_confirmed: true,
        confirmationEvidence: "child approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed._epicOwnerProjectContext).toMatchObject({
      root: "/workspace/owner",
      projectId: "project-owner",
    });
    expect(parsed._childProjectContext).toMatchObject({
      root: "/workspace/child",
      projectId: "project-child",
    });
    expect(childStore.changes.setEpicMembership).toHaveBeenCalledWith(
      "change-2",
      expect.objectContaining({
        membership: expect.objectContaining({
          epic_project_id: "project-owner",
        }),
      }),
    );
    expect(
      vi.mocked(childStore.changes.setEpicMembership).mock.calls[0]?.[1]
        ?.membership,
    ).not.toHaveProperty("epic_project_id", "project-child");
  });

  test("adv_epic_link_change fails with OWNER_ROUTING_AMBIGUOUS when child-only target_path is provided for a non-local Epic", async () => {
    const currentStore = makeStore();
    currentStore.epics.get = vi.fn(async () => ({
      success: true,
      data: null,
    }));
    const childStore = makeStore();
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/child",
          projectId: "project-child",
          externalRoot: "/xdg/project-child",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: childStore,
      }),
    );

    const output = await epicTools.adv_epic_link_change.execute(
      {
        epic_id: "remoteEpic",
        change_id: "change-2",
        link_evidence: "User grouped remote work.",
        target_path: "/workspace/child",
        target_confirmed: true,
        confirmationEvidence: "child approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.code).toBe("OWNER_ROUTING_AMBIGUOUS");
  });

  test("adv_epic_link_change fails with CHILD_ROUTING_REQUIRED when owner route is remote and child change is not in owner project", async () => {
    const ownerStore = makeStore();
    ownerStore.changes.get = vi.fn(async () => ({
      success: true,
      data: null,
    }));
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/owner",
          projectId: "project-owner",
          externalRoot: "/xdg/project-owner",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: ownerStore,
      }),
    );

    const output = await epicTools.adv_epic_link_change.execute(
      {
        epic_id: "addAuthEpic",
        change_id: "missing-change",
        link_evidence: "User linked change to remote-owner Epic.",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.code).toBe("CHILD_ROUTING_REQUIRED");
  });

  test("adv_epic_unlink_change routes owner Epic through epic_owner_target_path", async () => {
    const ownerStore = makeStore({
      entries: [
        makeChangeEntry({ entry_id: "entry-2", change_id: "change-2" }),
      ],
    });
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/owner",
          projectId: "project-owner",
          externalRoot: "/xdg/project-owner",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: ownerStore,
      }),
    );

    const output = await epicTools.adv_epic_unlink_change.execute(
      {
        epic_id: "addAuthEpic",
        entry_id: "entry-2",
        unlink_evidence: "Remove from remote-owner Epic.",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(ownerStore.epics.unlinkChange).toHaveBeenCalledWith(
      "addAuthEpic",
      "entry-2",
      "Remove from remote-owner Epic.",
    );
    expect(parsed._epicOwnerProjectContext).toMatchObject({
      root: "/workspace/owner",
      projectId: "project-owner",
    });
  });

  test("adv_epic_move_change routes owner Epic through epic_owner_target_path", async () => {
    const fromEpic = makeEpic({
      id: "fromEpic",
      entries: [
        makeChangeEntry({ entry_id: "from-entry", change_id: "change-2" }),
      ],
    });
    const toEpic = makeEpic({ id: "toEpic", entries: [] });
    const ownerStore = makeStore();
    ownerStore.epics.get = vi.fn(async (epicId: string) => ({
      success: true,
      data: epicId === "fromEpic" ? fromEpic : toEpic,
    }));
    ownerStore.epics.linkChange = vi.fn(async () =>
      makeChangeEntry({
        entry_id: "to-entry",
        order: 2,
        change_ref: { change_id: "change-2", project_id: "project-1" },
        title: "Linked Change",
        linked_at: "2026-06-25T00:01:00.000Z",
        membership_status: "projection_pending",
      }),
    );
    const childStore = makeStore();
    childStore.changes.get = vi.fn(async () => ({
      success: true,
      data: {
        id: "change-2",
        title: "Linked Change",
        status: "active",
        gates: {},
        tasks: [],
        created_at: "2026-06-25T00:00:00.000Z",
        updated_at: "2026-06-25T00:00:00.000Z",
        epic_membership: {
          epic_id: "fromEpic",
          entry_id: "from-entry",
          order: 0,
          title: "Linked Change",
          linked_at: "2026-06-25T00:00:00.000Z",
        },
      } as Change,
    }));
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore
      .mockImplementationOnce(async (_input, fn) =>
        fn({
          context: {
            root: "/workspace/owner",
            projectId: "project-owner",
            externalRoot: "/xdg/project-owner",
            trusted: true,
            trustSource: "related_repos",
            stateMode: "temporal",
          },
          store: ownerStore,
        }),
      )
      .mockImplementationOnce(async (_input, fn) =>
        fn({
          context: {
            root: "/workspace/child",
            projectId: "project-child",
            externalRoot: "/xdg/project-child",
            trusted: false,
            trustSource: "explicit",
            stateMode: "temporal",
          },
          store: childStore,
        }),
      );

    const output = await epicTools.adv_epic_move_change.execute(
      {
        from_epic_id: "fromEpic",
        to_epic_id: "toEpic",
        change_id: "change-2",
        move_evidence: "Move in remote-owner Epic.",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
        target_path: "/workspace/child",
        target_confirmed: true,
        confirmationEvidence: "child approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(ownerStore.epics.linkChange).toHaveBeenCalledWith(
      "toEpic",
      expect.any(Object),
    );
    expect(ownerStore.epics.unlinkChange).toHaveBeenCalledWith(
      "fromEpic",
      "from-entry",
      "Move in remote-owner Epic.",
    );
    expect(parsed._epicOwnerProjectContext).toMatchObject({
      root: "/workspace/owner",
      projectId: "project-owner",
    });
    expect(parsed._childProjectContext).toMatchObject({
      root: "/workspace/child",
      projectId: "project-child",
    });
  });

  test("adv_epic_create routes owner Epic through epic_owner_target_path", async () => {
    const ownerStore = makeStore();
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/owner",
          projectId: "project-owner",
          externalRoot: "/xdg/project-owner",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: ownerStore,
      }),
    );

    const output = await epicTools.adv_epic_create.execute(
      {
        epic_id: "remoteEpic",
        title: "Remote Epic",
        narrative: "Owned remotely.",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(ownerStore.epics.create).toHaveBeenCalledWith(
      "remoteEpic",
      "Remote Epic",
      "Owned remotely.",
    );
    expect(currentStore.epics.create).not.toHaveBeenCalled();
    expect(parsed._epicOwnerProjectContext).toMatchObject({
      root: "/workspace/owner",
      projectId: "project-owner",
    });
  });

  test("adv_epic_show routes owner Epic through epic_owner_target_path", async () => {
    const ownerStore = makeStore();
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/owner",
          projectId: "project-owner",
          externalRoot: "/xdg/project-owner",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: ownerStore,
      }),
    );

    const output = await epicTools.adv_epic_show.execute(
      {
        epic_id: "addAuthEpic",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(ownerStore.epics.get).toHaveBeenCalledWith("addAuthEpic");
    expect(currentStore.epics.get).not.toHaveBeenCalled();
    expect(parsed._epicOwnerProjectContext).toMatchObject({
      root: "/workspace/owner",
      projectId: "project-owner",
    });
  });

  test("adv_epic_list routes owner Epic through epic_owner_target_path", async () => {
    const ownerStore = makeStore();
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/owner",
          projectId: "project-owner",
          externalRoot: "/xdg/project-owner",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: ownerStore,
      }),
    );

    const output = await epicTools.adv_epic_list.execute(
      {
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(ownerStore.epics.list).toHaveBeenCalled();
    expect(currentStore.epics.list).not.toHaveBeenCalled();
    expect(parsed._epicOwnerProjectContext).toMatchObject({
      root: "/workspace/owner",
      projectId: "project-owner",
    });
  });

  test("adv_epic_list defaults to active status and passes filter to store.list", async () => {
    const store = makeStore();

    const output = await epicTools.adv_epic_list.execute({}, store);
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.status_filter).toBe("active");
    expect(store.epics.list).toHaveBeenCalledWith({ status: "active" });
  });

  test("adv_epic_list status=completed returns dry-run candidate report", async () => {
    const completedEpic = makeEpic({
      id: "completedEpic",
      title: "Completed Epic",
      progress: {
        status: "completed",
        total_entries: 1,
        completed_entries: 1,
        active_entries: 0,
        next_entry_id: null,
        updated_at: new Date().toISOString(),
      },
    });
    const ownerStore = makeStore(completedEpic);
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/owner",
          projectId: "project-owner",
          externalRoot: "/xdg/project-owner",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: ownerStore,
      }),
    );

    const output = await epicTools.adv_epic_list.execute(
      {
        status: "completed",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.status_filter).toBe("completed");
    expect(parsed.report.total_candidates).toBe(1);
    expect(parsed.report.candidates[0].id).toBe("completedEpic");
    expect(ownerStore.epics.retire).toHaveBeenCalledWith(
      "completedEpic",
      expect.objectContaining({ dryRun: true }),
    );
  });

  test("adv_epic_list status=completed reports blocked Epics with dry-run errors", async () => {
    const activeEpic = makeEpic({
      id: "activeEpic",
      title: "Active Epic",
      progress: {
        status: "active",
        total_entries: 1,
        completed_entries: 0,
        active_entries: 1,
        next_entry_id: "entry-1",
        updated_at: new Date().toISOString(),
      },
    });
    const ownerStore = makeStore(activeEpic);
    vi.mocked(ownerStore.epics.retire).mockRejectedValue(
      Object.assign(
        new Error("Epic has incomplete entries: change:entry-1(active)"),
        {
          code: "epic_incomplete",
          blockers: [{ entry_id: "entry-1", kind: "change", reason: "active" }],
        },
      ),
    );
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/owner",
          projectId: "project-owner",
          externalRoot: "/xdg/project-owner",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: ownerStore,
      }),
    );

    const output = await epicTools.adv_epic_list.execute(
      {
        status: "completed",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.report.total_candidates).toBe(0);
    expect(parsed.report.blocked).toHaveLength(1);
    expect(parsed.report.blocked[0].code).toBe("epic_incomplete");
    expect(parsed.report.blocked[0].blockers).toEqual([
      { entry_id: "entry-1", kind: "change", reason: "active" },
    ]);
  });

  test("adv_epic_update routes owner Epic through epic_owner_target_path", async () => {
    const ownerStore = makeStore();
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/owner",
          projectId: "project-owner",
          externalRoot: "/xdg/project-owner",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: ownerStore,
      }),
    );

    const output = await epicTools.adv_epic_update.execute(
      {
        epic_id: "addAuthEpic",
        title: "Updated Title",
        expected_version: 0,
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(ownerStore.epics.update).toHaveBeenCalledWith(
      "addAuthEpic",
      expect.objectContaining({ title: "Updated Title" }),
    );
    expect(currentStore.epics.update).not.toHaveBeenCalled();
    expect(parsed._epicOwnerProjectContext).toMatchObject({
      root: "/workspace/owner",
      projectId: "project-owner",
    });
  });

  test("adv_epic_reorder routes owner Epic through epic_owner_target_path", async () => {
    const ownerStore = makeStore();
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/owner",
          projectId: "project-owner",
          externalRoot: "/xdg/project-owner",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: ownerStore,
      }),
    );

    const output = await epicTools.adv_epic_reorder.execute(
      {
        epic_id: "addAuthEpic",
        entry_ids: ["a", "b"],
        expected_version: 0,
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(ownerStore.epics.reorder).toHaveBeenCalledWith(
      "addAuthEpic",
      ["a", "b"],
      0,
    );
    expect(currentStore.epics.reorder).not.toHaveBeenCalled();
    expect(parsed._epicOwnerProjectContext).toMatchObject({
      root: "/workspace/owner",
      projectId: "project-owner",
    });
  });

  test("adv_epic_add_shell routes owner Epic through epic_owner_target_path", async () => {
    const ownerStore = makeStore();
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/owner",
          projectId: "project-owner",
          externalRoot: "/xdg/project-owner",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: ownerStore,
      }),
    );

    const output = await epicTools.adv_epic_add_shell.execute(
      {
        epic_id: "addAuthEpic",
        title: "Shell One",
        success_hint: "Do the thing",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(ownerStore.epics.addShell).toHaveBeenCalledWith(
      "addAuthEpic",
      expect.objectContaining({ title: "Shell One" }),
    );
    expect(currentStore.epics.addShell).not.toHaveBeenCalled();
    expect(parsed._epicOwnerProjectContext).toMatchObject({
      root: "/workspace/owner",
      projectId: "project-owner",
    });
  });

  test("adv_epic_promote_shell supports same-owner promotion with change_id", async () => {
    const ownerStore = makeStore({
      entries: [makeShellEntry({ entry_id: "shell-1" })],
    });
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/owner",
          projectId: "project-owner",
          externalRoot: "/xdg/project-owner",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: ownerStore,
      }),
    );

    const output = await epicTools.adv_epic_promote_shell.execute(
      {
        epic_id: "addAuthEpic",
        entry_id: "shell-1",
        change_id: "change-1",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(ownerStore.epics.promoteShell).toHaveBeenCalledWith(
      "addAuthEpic",
      "shell-1",
      "change-1",
      "agent",
    );
    expect(currentStore.changes.create).not.toHaveBeenCalled();
  });

  test("adv_epic_promote_shell rejects remote-child creation without change_id", async () => {
    const ownerStore = makeStore({
      entries: [makeShellEntry({ entry_id: "shell-1" })],
    });
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/owner",
          projectId: "project-owner",
          externalRoot: "/xdg/project-owner",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: ownerStore,
      }),
    );

    const output = await epicTools.adv_epic_promote_shell.execute(
      {
        epic_id: "addAuthEpic",
        entry_id: "shell-1",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.code).toBe("UNSUPPORTED_EPIC_ROUTING_SHAPE");
    expect(ownerStore.epics.promoteShell).not.toHaveBeenCalled();
    expect(currentStore.changes.create).not.toHaveBeenCalled();
  });

  test("EpicOwnerRoutingError carries stable routing error code", () => {
    const err = new EpicOwnerRoutingError(
      EPIC_OWNER_ROUTING_ERROR_CODES.OWNER_ROUTING_REQUIRED,
      "owner route required",
    );
    expect(err.code).toBe("OWNER_ROUTING_REQUIRED");
    expect(err.name).toBe("EpicOwnerRoutingError");
  });

  test("adv_epic_link_change proves same-owner child by loading change from owner store", async () => {
    const ownerStore = makeStore();
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/owner",
          projectId: "project-owner",
          externalRoot: "/xdg/project-owner",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: ownerStore,
      }),
    );

    const output = await epicTools.adv_epic_link_change.execute(
      {
        epic_id: "addAuthEpic",
        change_id: "change-2",
        link_evidence: "User linked same-owner change.",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(ownerStore.epics.linkChange).toHaveBeenCalledWith(
      "addAuthEpic",
      expect.any(Object),
    );
    expect(ownerStore.changes.setEpicMembership).toHaveBeenCalledWith(
      "change-2",
      expect.any(Object),
    );
    expect(parsed._childProjectContext).toBeUndefined();
  });

  test("adv_epic_move_change requires explicit child route when same-owner proof fails", async () => {
    const fromEpic = makeEpic({
      id: "fromEpic",
      entries: [
        makeChangeEntry({
          entry_id: "from-entry",
          change_id: "missing-change",
        }),
      ],
    });
    const toEpic = makeEpic({ id: "toEpic", entries: [] });
    const ownerStore = makeStore();
    ownerStore.epics.get = vi.fn(async (epicId: string) => ({
      success: true,
      data: epicId === "fromEpic" ? fromEpic : toEpic,
    }));
    ownerStore.changes.get = vi.fn(async () => ({
      success: true,
      data: null,
    }));
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/owner",
          projectId: "project-owner",
          externalRoot: "/xdg/project-owner",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: ownerStore,
      }),
    );

    const output = await epicTools.adv_epic_move_change.execute(
      {
        from_epic_id: "fromEpic",
        to_epic_id: "toEpic",
        change_id: "missing-change",
        move_evidence: "Move in remote-owner Epic.",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.code).toBe("CHILD_ROUTING_REQUIRED");
    expect(ownerStore.epics.linkChange).not.toHaveBeenCalled();
  });

  test("adv_epic_move_change proves same-owner child by loading change from owner store", async () => {
    const fromEpic = makeEpic({
      id: "fromEpic",
      entries: [
        makeChangeEntry({ entry_id: "from-entry", change_id: "change-2" }),
      ],
    });
    const toEpic = makeEpic({ id: "toEpic", entries: [] });
    const ownerStore = makeStore();
    ownerStore.epics.get = vi.fn(async (epicId: string) => ({
      success: true,
      data: epicId === "fromEpic" ? fromEpic : toEpic,
    }));
    ownerStore.epics.linkChange = vi.fn(async () =>
      makeChangeEntry({
        entry_id: "to-entry",
        order: 2,
        change_ref: { change_id: "change-2", project_id: "project-1" },
        title: "Linked Change",
        linked_at: "2026-06-25T00:01:00.000Z",
        membership_status: "projection_pending",
      }),
    );
    ownerStore.changes.get = vi.fn(async () => ({
      success: true,
      data: {
        id: "change-2",
        title: "Linked Change",
        status: "active",
        gates: {},
        tasks: [],
        created_at: "2026-06-25T00:00:00.000Z",
        updated_at: "2026-06-25T00:00:00.000Z",
        epic_membership: {
          epic_id: "fromEpic",
          entry_id: "from-entry",
          order: 0,
          title: "Linked Change",
          linked_at: "2026-06-25T00:00:00.000Z",
        },
      } as Change,
    }));
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/owner",
          projectId: "project-owner",
          externalRoot: "/xdg/project-owner",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: ownerStore,
      }),
    );

    const output = await epicTools.adv_epic_move_change.execute(
      {
        from_epic_id: "fromEpic",
        to_epic_id: "toEpic",
        change_id: "change-2",
        move_evidence: "Move same-owner change in remote-owner Epic.",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(ownerStore.epics.linkChange).toHaveBeenCalledWith(
      "toEpic",
      expect.any(Object),
    );
    expect(ownerStore.changes.setEpicMembership).toHaveBeenCalledWith(
      "change-2",
      expect.any(Object),
    );
    expect(parsed._childProjectContext).toBeUndefined();
  });

  test("adv_epic_link_change fails before mutation when remote child lacks trust confirmation", async () => {
    const ownerStore = makeStore();
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore
      .mockImplementationOnce(async (_input, fn) =>
        fn({
          context: {
            root: "/workspace/owner",
            projectId: "project-owner",
            externalRoot: "/xdg/project-owner",
            trusted: true,
            trustSource: "related_repos",
            stateMode: "temporal",
          },
          store: ownerStore,
        }),
      )
      .mockImplementationOnce(async (_input, _fn) => {
        throw new EpicOwnerRoutingError(
          EPIC_OWNER_ROUTING_ERROR_CODES.OWNER_ROUTING_REQUIRED,
          "Untrusted target_path mutation requires target_confirmed: true and confirmationEvidence",
        );
      });

    const output = await epicTools.adv_epic_link_change.execute(
      {
        epic_id: "addAuthEpic",
        change_id: "change-2",
        link_evidence: "User linked remote child.",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
        target_path: "/workspace/child",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.code).toBe("OWNER_ROUTING_REQUIRED");
    expect(ownerStore.epics.linkChange).not.toHaveBeenCalled();
  });

  test("adv_epic_link_change returns deterministic partial state when child projection fails after owner mutation", async () => {
    const ownerStore = makeStore();
    const childStore = makeStore();
    childStore.changes.setEpicMembership = vi.fn(async () => {
      throw new Error("child projection unavailable");
    });
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore
      .mockImplementationOnce(async (_input, fn) =>
        fn({
          context: {
            root: "/workspace/owner",
            projectId: "project-owner",
            externalRoot: "/xdg/project-owner",
            trusted: true,
            trustSource: "related_repos",
            stateMode: "temporal",
          },
          store: ownerStore,
        }),
      )
      .mockImplementationOnce(async (_input, fn) =>
        fn({
          context: {
            root: "/workspace/child",
            projectId: "project-child",
            externalRoot: "/xdg/project-child",
            trusted: false,
            trustSource: "explicit",
            stateMode: "temporal",
          },
          store: childStore,
        }),
      );

    const output = await epicTools.adv_epic_link_change.execute(
      {
        epic_id: "addAuthEpic",
        change_id: "change-2",
        link_evidence: "User linked remote child to remote-owner Epic.",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
        target_path: "/workspace/child",
        target_confirmed: true,
        confirmationEvidence: "child approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(false);
    expect(parsed.owner_mutated).toBe(true);
    expect(parsed.child_projection_failed).toBe(true);
    expect(parsed.code).toBe("CHILD_PROJECTION_FAILED");
    expect(ownerStore.epics.linkChange).toHaveBeenCalled();
  });

  test("adv_epic_move_change returns deterministic partial state when source unlink fails after child projection", async () => {
    const fromEpic = makeEpic({
      id: "fromEpic",
      entries: [
        makeChangeEntry({ entry_id: "from-entry", change_id: "change-2" }),
      ],
    });
    const toEpic = makeEpic({ id: "toEpic", entries: [] });
    const ownerStore = makeStore();
    ownerStore.epics.get = vi.fn(async (epicId: string) => ({
      success: true,
      data: epicId === "fromEpic" ? fromEpic : toEpic,
    }));
    ownerStore.epics.linkChange = vi.fn(async () =>
      makeChangeEntry({
        entry_id: "to-entry",
        order: 2,
        change_ref: { change_id: "change-2", project_id: "project-1" },
        title: "Linked Change",
        linked_at: "2026-06-25T00:01:00.000Z",
        membership_status: "projection_pending",
      }),
    );
    ownerStore.epics.unlinkChange = vi.fn(async () => {
      throw new Error("owner unlink unavailable");
    });
    const childStore = makeStore();
    childStore.changes.get = vi.fn(async () => ({
      success: true,
      data: {
        id: "change-2",
        title: "Linked Change",
        status: "active",
        gates: {},
        tasks: [],
        created_at: "2026-06-25T00:00:00.000Z",
        updated_at: "2026-06-25T00:00:00.000Z",
        epic_membership: {
          epic_id: "fromEpic",
          entry_id: "from-entry",
          order: 0,
          title: "Linked Change",
          linked_at: "2026-06-25T00:00:00.000Z",
        },
      } as Change,
    }));
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore
      .mockImplementationOnce(async (_input, fn) =>
        fn({
          context: {
            root: "/workspace/owner",
            projectId: "project-owner",
            externalRoot: "/xdg/project-owner",
            trusted: true,
            trustSource: "related_repos",
            stateMode: "temporal",
          },
          store: ownerStore,
        }),
      )
      .mockImplementationOnce(async (_input, fn) =>
        fn({
          context: {
            root: "/workspace/child",
            projectId: "project-child",
            externalRoot: "/xdg/project-child",
            trusted: false,
            trustSource: "explicit",
            stateMode: "temporal",
          },
          store: childStore,
        }),
      );

    const output = await epicTools.adv_epic_move_change.execute(
      {
        from_epic_id: "fromEpic",
        to_epic_id: "toEpic",
        change_id: "change-2",
        move_evidence: "Move in remote-owner Epic.",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
        target_path: "/workspace/child",
        target_confirmed: true,
        confirmationEvidence: "child approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(false);
    expect(parsed.owner_partially_mutated).toBe(true);
    expect(parsed.source_unlink_failed).toBe(true);
    expect(parsed.code).toBe("MEMBERSHIP_PARTIAL_FAILURE");
    expect(ownerStore.epics.linkChange).toHaveBeenCalled();
    expect(childStore.changes.setEpicMembership).toHaveBeenCalled();
    expect(ownerStore.epics.unlinkChange).toHaveBeenCalled();
  });

  test("adv_epic_unlink_change returns deterministic partial state when owner unlink fails after child projection cleared", async () => {
    const ownerStore = makeStore({
      entries: [
        makeChangeEntry({ entry_id: "entry-2", change_id: "change-2" }),
      ],
    });
    ownerStore.epics.unlinkChange = vi.fn(async () => {
      throw new Error("owner unlink unavailable");
    });
    const currentStore = makeStore();
    currentStore.paths.root = "/workspace/current";
    mockedWithTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/workspace/owner",
          projectId: "project-owner",
          externalRoot: "/xdg/project-owner",
          trusted: true,
          trustSource: "related_repos",
          stateMode: "temporal",
        },
        store: ownerStore,
      }),
    );

    const output = await epicTools.adv_epic_unlink_change.execute(
      {
        epic_id: "addAuthEpic",
        entry_id: "entry-2",
        unlink_evidence: "Remove from remote-owner Epic.",
        epic_owner_target_path: "/workspace/owner",
        epic_owner_target_confirmed: true,
        epic_owner_confirmationEvidence: "owner approved",
      },
      currentStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(false);
    expect(parsed.child_projection_cleared).toBe(true);
    expect(parsed.owner_unlink_failed).toBe(true);
    expect(parsed.code).toBe("MEMBERSHIP_PARTIAL_FAILURE");
    expect(ownerStore.changes.clearEpicMembership).toHaveBeenCalled();
    expect(ownerStore.epics.unlinkChange).toHaveBeenCalled();
  });
});
