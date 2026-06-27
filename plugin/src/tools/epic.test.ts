import { describe, expect, test, vi } from "vitest";
vi.mock("./target-project", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./target-project")>();
  return {
    ...actual,
    withTargetPathStore: vi.fn(),
    appendTargetProjectContextOutput: vi.fn((output: string) => output),
  };
});

import { epicTools } from "./epic";
import { withTargetPathStore } from "./target-project";
import { parseToolOutput } from "../__tests__/setup";
import type { Store } from "../storage/store-types";
import type { Change, Epic, EpicEntry } from "../types";

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
      addShell: vi.fn(async () =>
        makeShellEntry({ entry_id: "shell-1", title: "Shell One" }),
      ),
      promoteShell: vi.fn(async () => ({
        entryId: "shell-1",
        changeId: "change-1",
      })),
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

  test("creates a change from shell and seeds epic membership", async () => {
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
        initialMetadata: expect.objectContaining({
          epic_membership: expect.objectContaining({
            epic_id: "addAuthEpic",
            entry_id: "shell-1",
            order: 3,
            title: "Shell One",
          }),
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
        stateRequirement: "temporal-required",
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
          epic_project_id: "project-api",
          repo_id: "pokeedge-api",
        }),
      }),
    );
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
          epic_project_id: "project-1",
          source: "link_existing",
        }),
      }),
    );
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
      }),
    );
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

describe("adv_epic_repair_membership", () => {
  test("dry-run clears matching child projection when owner Epic is missing", async () => {
    const store = makeStore();
    store.epics.get = vi.fn(async () => ({ success: false, data: null }));
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
          epic_id: "missingEpic",
          entry_id: "entry-2",
          order: 0,
          title: "Linked Change",
          linked_at: "2026-06-25T00:00:00.000Z",
        },
      } as Change,
    }));

    const output = await epicTools.adv_epic_repair_membership.execute(
      {
        epic_id: "missingEpic",
        entry_id: "entry-2",
        change_id: "change-2",
        mode: "clear_stale_projection",
        evidence: "Operator verified owner Epic row is missing.",
        dryRun: true,
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.action).toBe("clear_child_projection");
    expect(store.changes.clearEpicMembership).not.toHaveBeenCalled();
  });

  test("refuses missing-Epic clear when child projection mismatches expected membership", async () => {
    const store = makeStore();
    store.epics.get = vi.fn(async () => ({ success: false, data: null }));
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
          entry_id: "other-entry",
          order: 0,
          title: "Other",
          linked_at: "2026-06-25T00:00:00.000Z",
        },
      } as Change,
    }));

    const output = await epicTools.adv_epic_repair_membership.execute(
      {
        epic_id: "missingEpic",
        entry_id: "entry-2",
        change_id: "change-2",
        mode: "clear_stale_projection",
        evidence: "Operator verified owner Epic row is missing.",
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.code).toBe("PROJECTION_MISMATCH");
    expect(store.changes.clearEpicMembership).not.toHaveBeenCalled();
  });

  test("sync_child_projection refreshes target change membership from Epic entry", async () => {
    const store = makeStore({
      entries: [
        makeChangeEntry({
          entry_id: "entry-2",
          change_ref: {
            change_id: "change-2",
            project_id: "epic-test-project",
            repo_id: "repo-web",
          },
          title: "Linked Change",
          membership_status: "projection_stale",
          linked_at: "2026-06-25T00:00:00.000Z",
          linked_by: "agent",
          link_evidence: "repair test",
        }),
      ],
    });

    const output = await epicTools.adv_epic_repair_membership.execute(
      {
        epic_id: "addAuthEpic",
        entry_id: "entry-2",
        mode: "sync_child_projection",
        evidence: "Operator verified child projection needs refresh.",
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.repaired).toBe(true);
    expect(store.changes.setEpicMembership).toHaveBeenCalledWith(
      "change-2",
      expect.objectContaining({
        membership: expect.objectContaining({
          epic_id: "addAuthEpic",
          entry_id: "entry-2",
          repo_id: "repo-web",
        }),
      }),
    );
  });

  test("sync_child_projection backfills terminal summary for archived child", async () => {
    const store = makeStore({
      entries: [
        makeChangeEntry({
          entry_id: "entry-2",
          change_ref: {
            change_id: "change-2",
            project_id: "epic-test-project",
          },
          title: "Linked Change",
          membership_status: "projection_stale",
          linked_at: "2026-06-25T00:00:00.000Z",
          linked_by: "agent",
          link_evidence: "repair test",
        }),
      ],
    });
    vi.mocked(store.changes.get).mockResolvedValueOnce({
      success: true,
      data: {
        id: "change-2",
        title: "Linked Change",
        status: "archived",
        gates: {},
        tasks: [],
        deltas: {},
        wisdom: [],
        created_at: "2026-06-25T00:00:00.000Z",
        updated_at: "2026-06-26T00:00:00.000Z",
      } as Change,
    });

    const output = await epicTools.adv_epic_repair_membership.execute(
      {
        epic_id: "addAuthEpic",
        entry_id: "entry-2",
        mode: "sync_child_projection",
        evidence: "Operator verified archived child remains active in Epic.",
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.terminal_summary_projected).toBe(true);
    expect(store.epics.setEntryTerminalSummary).toHaveBeenCalledWith(
      "addAuthEpic",
      {
        entryId: "entry-2",
        status: "archived",
        completedAt: "2026-06-26T00:00:00.000Z",
      },
    );
    expect(store.changes.setEpicMembership).not.toHaveBeenCalled();
  });

  test("dry-run sync_child_projection previews closed child terminal backfill without mutation", async () => {
    const store = makeStore({
      entries: [
        makeChangeEntry({
          entry_id: "entry-2",
          change_ref: { change_id: "change-2", project_id: "project-api" },
          title: "Linked Change",
          membership_status: "projection_stale",
          linked_at: "2026-06-25T00:00:00.000Z",
          linked_by: "agent",
          link_evidence: "repair test",
        }),
      ],
    });
    vi.mocked(store.changes.get).mockResolvedValueOnce({
      success: true,
      data: {
        id: "change-2",
        title: "Linked Change",
        status: "closed",
        gates: {},
        tasks: [],
        deltas: {},
        wisdom: [],
        created_at: "2026-06-25T00:00:00.000Z",
      } as Change,
    });

    const output = await epicTools.adv_epic_repair_membership.execute(
      {
        epic_id: "addAuthEpic",
        entry_id: "entry-2",
        mode: "sync_child_projection",
        evidence: "Operator verified closed child remains active in Epic.",
        dryRun: true,
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.action).toBe("project_terminal_summary");
    expect(parsed.terminal_summary.status).toBe("closed");
    expect(store.epics.setEntryTerminalSummary).not.toHaveBeenCalled();
    expect(store.changes.setEpicMembership).not.toHaveBeenCalled();
  });

  test("dry-run mark_target_unreachable previews Epic status update without mutation", async () => {
    const store = makeStore({
      entries: [
        makeChangeEntry({
          entry_id: "entry-2",
          change_ref: { change_id: "change-2", project_id: "project-api" },
          title: "Linked Change",
          membership_status: "projection_pending",
          linked_at: "2026-06-25T00:00:00.000Z",
          linked_by: "agent",
          link_evidence: "repair test",
        }),
      ],
    });

    const output = await epicTools.adv_epic_repair_membership.execute(
      {
        epic_id: "addAuthEpic",
        entry_id: "entry-2",
        mode: "mark_target_unreachable",
        evidence: "Target queue unavailable during repair.",
        dryRun: true,
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.member_status.status).toBe("target_unreachable");
    expect(store.epics.setEntryMembershipStatus).not.toHaveBeenCalled();
  });

  test("remove_stale_entry dry-run previews parent unlink and emits no signals", async () => {
    const store = makeStore({
      entries: [
        makeChangeEntry({
          entry_id: "entry-2",
          change_id: "change-2",
          title: "Stale Entry",
          membership_status: "projection_stale",
        }),
      ],
    });
    store.changes.get = vi.fn(async () => ({ success: false, data: null }));

    const output = await epicTools.adv_epic_repair_membership.execute(
      {
        epic_id: "addAuthEpic",
        entry_id: "entry-2",
        mode: "remove_stale_entry",
        evidence: "Operator verified stale entry should be removed.",
        dryRun: true,
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.action).toBe("remove_stale_entry");
    expect(parsed.entry_id).toBe("entry-2");
    expect(parsed.change_id).toBe("change-2");
    expect(store.epics.unlinkChange).not.toHaveBeenCalled();
    expect(store.changes.get).not.toHaveBeenCalled();
  });

  test("remove_stale_entry removes parent when child lookup is missing and does not mutate child", async () => {
    const store = makeStore({
      entries: [
        makeChangeEntry({
          entry_id: "entry-2",
          change_id: "change-2",
          title: "Stale Entry",
          membership_status: "projection_stale",
        }),
      ],
    });
    store.changes.get = vi.fn(async () => ({ success: false, data: null }));

    const output = await epicTools.adv_epic_repair_membership.execute(
      {
        epic_id: "addAuthEpic",
        entry_id: "entry-2",
        mode: "remove_stale_entry",
        evidence: "Operator verified stale entry should be removed.",
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.repaired).toBe(true);
    expect(parsed.removed).toBe(true);
    expect(parsed.entry_id).toBe("entry-2");
    expect(parsed.change_id).toBe("change-2");
    expect(store.epics.unlinkChange).toHaveBeenCalledWith(
      "addAuthEpic",
      "entry-2",
      "Operator verified stale entry should be removed.",
    );
    expect(store.changes.get).not.toHaveBeenCalled();
    expect(store.changes.clearEpicMembership).not.toHaveBeenCalled();
  });

  test("retarget_stale_entry dry-run previews retarget without mutation", async () => {
    const store = makeStore({
      entries: [
        makeChangeEntry({
          entry_id: "entry-2",
          change_id: "change-2",
          title: "Original Title",
          order: 3,
          membership_status: "projection_stale",
        }),
      ],
    });

    const output = await epicTools.adv_epic_repair_membership.execute(
      {
        epic_id: "addAuthEpic",
        entry_id: "entry-2",
        mode: "retarget_stale_entry",
        new_change_id: "change-new",
        new_title: "Updated Title",
        evidence: "Operator verified target change replaces stale child.",
        dryRun: true,
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.action).toBe("retarget_stale_entry");
    expect(parsed.entry_id).toBe("entry-2");
    expect(parsed.change_id).toBe("change-2");
    expect(parsed.new_change_id).toBe("change-new");
    expect(parsed.new_title).toBe("Updated Title");
    expect(store.epics.retargetChange).not.toHaveBeenCalled();
    expect(store.changes.get).not.toHaveBeenCalled();
  });

  test("retarget_stale_entry retargets entry to new change and refreshes target membership", async () => {
    const store = makeStore({
      entries: [
        makeChangeEntry({
          entry_id: "entry-2",
          change_id: "change-2",
          title: "Original Title",
          order: 3,
          membership_status: "projection_stale",
        }),
      ],
    });
    store.changes.get = vi.fn(async (changeId: string) => ({
      success: true,
      data: {
        id: changeId,
        title: "New Target Change",
        status: "active",
        gates: {},
        tasks: [],
        deltas: {},
        wisdom: [],
        created_at: "2026-06-25T00:00:00.000Z",
        updated_at: "2026-06-25T00:00:00.000Z",
      } as Change,
    }));
    store.epics.retargetChange = vi.fn(async () =>
      makeChangeEntry({
        entry_id: "entry-2",
        change_id: "change-new",
        title: "Original Title",
        order: 3,
        membership_status: "linked",
      }),
    );

    const output = await epicTools.adv_epic_repair_membership.execute(
      {
        epic_id: "addAuthEpic",
        entry_id: "entry-2",
        mode: "retarget_stale_entry",
        new_change_id: "change-new",
        evidence: "Operator verified target change replaces stale child.",
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.repaired).toBe(true);
    expect(parsed.retargeted).toBe(true);
    expect(parsed.entry_id).toBe("entry-2");
    expect(parsed.change_id).toBe("change-new");
    expect(store.changes.get).toHaveBeenCalledWith("change-new");
    expect(store.changes.get).not.toHaveBeenCalledWith("change-2");
    expect(store.epics.retargetChange).toHaveBeenCalledWith(
      "addAuthEpic",
      expect.objectContaining({
        entryId: "entry-2",
        fromChangeId: "change-2",
        toChangeId: "change-new",
        retargetEvidence:
          "Operator verified target change replaces stale child.",
      }),
    );
    expect(store.changes.setEpicMembership).toHaveBeenCalledWith(
      "change-new",
      expect.objectContaining({
        membership: expect.objectContaining({
          epic_id: "addAuthEpic",
          entry_id: "entry-2",
          order: 3,
          title: "Original Title",
        }),
      }),
    );
  });

  test("retarget_stale_entry refuses target change already linked to another Epic before parent mutation", async () => {
    const store = makeStore({
      entries: [
        makeChangeEntry({
          entry_id: "entry-2",
          change_id: "change-2",
          title: "Original Title",
          membership_status: "projection_stale",
        }),
      ],
    });
    store.changes.get = vi.fn(async (changeId: string) => ({
      success: true,
      data: {
        id: changeId,
        title: "New Target Change",
        status: "active",
        gates: {},
        tasks: [],
        deltas: {},
        wisdom: [],
        created_at: "2026-06-25T00:00:00.000Z",
        updated_at: "2026-06-25T00:00:00.000Z",
        epic_membership: {
          epic_id: "otherEpic",
          entry_id: "other-entry",
          order: 0,
          title: "Other",
          linked_at: "2026-06-25T00:00:00.000Z",
        },
      } as Change,
    }));

    const output = await epicTools.adv_epic_repair_membership.execute(
      {
        epic_id: "addAuthEpic",
        entry_id: "entry-2",
        mode: "retarget_stale_entry",
        new_change_id: "change-new",
        evidence: "Operator verified target change replaces stale child.",
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.code).toBe("PROJECTION_MISMATCH");
    expect(store.epics.retargetChange).not.toHaveBeenCalled();
    expect(store.changes.setEpicMembership).not.toHaveBeenCalled();
  });

  test("retarget_stale_entry backfills terminal summary for archived target", async () => {
    const store = makeStore({
      entries: [
        makeChangeEntry({
          entry_id: "entry-2",
          change_id: "change-2",
          title: "Original Title",
          membership_status: "projection_stale",
        }),
      ],
    });
    store.changes.get = vi.fn(async (changeId: string) => ({
      success: true,
      data: {
        id: changeId,
        title: "New Target Change",
        status: "archived",
        gates: {},
        tasks: [],
        deltas: {},
        wisdom: [],
        created_at: "2026-06-25T00:00:00.000Z",
        updated_at: "2026-06-26T00:00:00.000Z",
      } as Change,
    }));
    store.epics.retargetChange = vi.fn(async () =>
      makeChangeEntry({
        entry_id: "entry-2",
        change_id: "change-new",
        title: "Original Title",
        membership_status: "linked",
      }),
    );

    const output = await epicTools.adv_epic_repair_membership.execute(
      {
        epic_id: "addAuthEpic",
        entry_id: "entry-2",
        mode: "retarget_stale_entry",
        new_change_id: "change-new",
        evidence: "Operator verified archived target replaces stale child.",
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.terminal_summary_projected).toBe(true);
    expect(store.epics.setEntryTerminalSummary).toHaveBeenCalledWith(
      "addAuthEpic",
      {
        entryId: "entry-2",
        status: "archived",
        completedAt: "2026-06-26T00:00:00.000Z",
      },
    );
    expect(store.changes.setEpicMembership).not.toHaveBeenCalled();
  });

  test("rejects blank evidence for remove_stale_entry", async () => {
    const store = makeStore({
      entries: [
        makeChangeEntry({ entry_id: "entry-2", change_id: "change-2" }),
      ],
    });
    const output = await epicTools.adv_epic_repair_membership.execute(
      {
        epic_id: "addAuthEpic",
        entry_id: "entry-2",
        mode: "remove_stale_entry",
        evidence: "",
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.error).toMatch(/evidence/i);
  });

  test("rejects blank evidence for retarget_stale_entry", async () => {
    const store = makeStore({
      entries: [
        makeChangeEntry({ entry_id: "entry-2", change_id: "change-2" }),
      ],
    });
    const output = await epicTools.adv_epic_repair_membership.execute(
      {
        epic_id: "addAuthEpic",
        entry_id: "entry-2",
        mode: "retarget_stale_entry",
        new_change_id: "change-new",
        evidence: "",
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.error).toMatch(/evidence/i);
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

describe("adv_epic_update_scope", () => {
  test("dry-run reports derived scope label and does not mutate", async () => {
    const store = makeStore({ version: 2 });
    const output = await epicTools.adv_epic_update_scope.execute(
      {
        epic_id: "addAuthEpic",
        expected_version: 2,
        audit_evidence: "User approved scope expansion.",
        owner_project_id: "project-web",
        scope_repos: [
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
        dryRun: true,
      },
      store,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.scope_label).toBe("product-spanning");
    expect(store.epics.updateScope).not.toHaveBeenCalled();
  });

  test("rejects removing scope repo that still has linked entries", async () => {
    const store = makeStore({
      version: 2,
      epic_scope: {
        kind: "product",
        owner_project_id: "project-web",
        repos: [
          {
            repo_id: "web",
            repo_project_id: "project-web",
            role: "primary",
            required: true,
          },
        ],
      },
      entries: [
        makeChangeEntry({
          change_ref: {
            change_id: "change-2",
            project_id: "project-web",
            repo_id: "web",
          },
          title: "Linked Change",
          membership_status: "linked",
          linked_at: "2026-06-25T00:00:00.000Z",
          linked_by: "agent",
          link_evidence: "linked",
        }),
      ],
    });

    const output = await epicTools.adv_epic_update_scope.execute(
      {
        epic_id: "addAuthEpic",
        expected_version: 2,
        audit_evidence: "Remove web repo.",
        owner_project_id: "project-web",
        scope_repos: [],
      },
      store,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.success).toBeFalsy();
    expect(parsed.code).toBe("SCOPE_REMOVAL_HAS_LINKED_ENTRIES");
    expect(store.epics.updateScope).not.toHaveBeenCalled();
  });

  test("rejects clearing scope when legacy linked entries lack repo attribution", async () => {
    const store = makeStore({
      version: 2,
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
        ],
      },
      entries: [
        makeChangeEntry({
          change_ref: {
            change_id: "legacy-change",
            project_id: "project-web",
          },
          title: "Legacy Linked Change",
          membership_status: "linked",
          linked_at: "2026-06-25T00:00:00.000Z",
          linked_by: "agent",
          link_evidence: "legacy link",
        }),
      ],
    });

    const output = await epicTools.adv_epic_update_scope.execute(
      {
        epic_id: "addAuthEpic",
        expected_version: 2,
        audit_evidence: "Clear scope.",
        owner_project_id: "project-web",
        scope_repos: [],
      },
      store,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.code).toBe("SCOPE_REMOVAL_HAS_LINKED_ENTRIES");
    expect(store.epics.updateScope).not.toHaveBeenCalled();
  });

  test("returns stale version before scope-removal guard", async () => {
    const store = makeStore({
      version: 5,
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
        ],
      },
      entries: [
        makeChangeEntry({
          change_ref: {
            change_id: "legacy-change",
            project_id: "project-web",
          },
          title: "Legacy Linked Change",
          membership_status: "linked",
          linked_at: "2026-06-25T00:00:00.000Z",
          linked_by: "agent",
          link_evidence: "legacy link",
        }),
      ],
    });

    const output = await epicTools.adv_epic_update_scope.execute(
      {
        epic_id: "addAuthEpic",
        expected_version: 2,
        audit_evidence: "Clear scope.",
        owner_project_id: "project-web",
        scope_repos: [],
      },
      store,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.code).toBe("stale_version");
    expect(parsed.error).toBe("Expected Epic version 2, found 5");
    expect(store.epics.updateScope).not.toHaveBeenCalled();
  });

  test("updates scope through store with audit evidence", async () => {
    const store = makeStore({ version: 2 });
    const output = await epicTools.adv_epic_update_scope.execute(
      {
        epic_id: "addAuthEpic",
        expected_version: 2,
        audit_evidence: "User approved scope expansion.",
        owner_project_id: "project-web",
        scope_repos: [
          {
            repo_id: "web",
            repo_project_id: "project-web",
            role: "primary",
            required: true,
          },
        ],
      },
      store,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(store.epics.updateScope).toHaveBeenCalledWith("addAuthEpic", {
      epicScope: {
        kind: "repo",
        owner_project_id: "project-web",
        repos: [
          {
            repo_id: "web",
            repo_project_id: "project-web",
            role: "primary",
            required: true,
          },
        ],
      },
      expectedVersion: 2,
      updatedBy: "agent",
      auditEvidence: "User approved scope expansion.",
    });
  });
});

describe("adv_epic_merge", () => {
  test("dry-run reports unique entries and duplicate-change conflicts", async () => {
    const sourceEntry = makeChangeEntry({
      entry_id: "source-entry",
      change_id: "change-2",
      change_ref: { change_id: "change-2", project_id: "project-web" },
      title: "Source Change",
      membership_status: "linked",
      linked_at: "2026-06-25T00:00:00.000Z",
      linked_by: "agent",
      link_evidence: "linked",
    });
    const duplicateEntry = makeChangeEntry({
      entry_id: "dup-entry",
      change_id: "change-3",
      change_ref: { change_id: "change-3", project_id: "project-web" },
      title: "Duplicate Change",
      membership_status: "linked",
      linked_at: "2026-06-25T00:00:00.000Z",
      linked_by: "agent",
      link_evidence: "linked",
    });
    const store = makeStore();
    store.epics.get = vi.fn(async (epicId: string) => ({
      success: true,
      data:
        epicId === "sourceEpic"
          ? makeEpic({
              id: "sourceEpic",
              entries: [sourceEntry, duplicateEntry],
            })
          : makeEpic({
              id: "survivorEpic",
              entries: [
                makeChangeEntry({
                  entry_id: "survivor-dup",
                  change_id: "change-3",
                  change_ref: {
                    change_id: "change-3",
                    project_id: "project-web",
                  },
                  title: "Duplicate Change",
                  membership_status: "linked",
                  linked_at: "2026-06-25T00:00:00.000Z",
                  linked_by: "agent",
                  link_evidence: "linked",
                }),
              ],
            }),
    }));

    const output = await epicTools.adv_epic_merge.execute(
      {
        source_epic_id: "sourceEpic",
        survivor_epic_id: "survivorEpic",
        expected_source_version: 0,
        expected_survivor_version: 0,
        evidence: "Merge duplicates.",
        dryRun: true,
      },
      store,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.plan.unique_changes).toHaveLength(1);
    expect(parsed.plan.conflicts).toEqual([
      expect.objectContaining({
        kind: "duplicate_change",
        source_entry_id: "dup-entry",
        change_id: "change-3",
      }),
    ]);
    expect(store.epics.markMerged).not.toHaveBeenCalled();
  });

  test("executes unique local merge and finalizes source after projections", async () => {
    const sourceEntry = makeChangeEntry({
      entry_id: "source-entry",
      change_id: "change-2",
      change_ref: { change_id: "change-2", project_id: "project-web" },
      title: "Source Change",
      membership_status: "linked",
      linked_at: "2026-06-25T00:00:00.000Z",
      linked_by: "agent",
      link_evidence: "linked",
    });
    const store = makeStore();
    store.changes.get = vi.fn(async () => ({
      success: true,
      data: {
        id: "change-2",
        title: "Source Change",
        status: "active",
        gates: {},
        tasks: [],
        deltas: {},
        wisdom: [],
        created_at: "2026-06-25T00:00:00.000Z",
        updated_at: "2026-06-25T00:00:00.000Z",
        epic_membership: {
          epic_id: "sourceEpic",
          entry_id: "source-entry",
          order: 0,
          title: "Source Change",
          linked_at: "2026-06-25T00:00:00.000Z",
          source: "link_existing",
        },
      } as Change,
    }));
    store.epics.get = vi.fn(async (epicId: string) => ({
      success: true,
      data:
        epicId === "sourceEpic"
          ? makeEpic({ id: "sourceEpic", version: 3, entries: [sourceEntry] })
          : makeEpic({ id: "survivorEpic", version: 5, entries: [] }),
    }));
    store.epics.linkChange = vi.fn(async () =>
      makeChangeEntry({
        entry_id: "merged-change-2",
        change_id: "change-2",
        change_ref: { change_id: "change-2", project_id: "project-web" },
        title: "Source Change",
        membership_status: "projection_pending",
        linked_at: "2026-06-25T00:00:00.000Z",
        linked_by: "agent",
        link_evidence: "Merge duplicates.",
      }),
    );

    const output = await epicTools.adv_epic_merge.execute(
      {
        source_epic_id: "sourceEpic",
        survivor_epic_id: "survivorEpic",
        expected_source_version: 3,
        expected_survivor_version: 5,
        evidence: "Merge duplicates.",
      },
      store,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(store.epics.linkChange).toHaveBeenCalledWith(
      "survivorEpic",
      expect.objectContaining({ changeId: "change-2" }),
    );
    expect(store.changes.setEpicMembership).toHaveBeenCalledWith(
      "change-2",
      expect.objectContaining({
        expectedCurrent: { epic_id: "sourceEpic", entry_id: "source-entry" },
      }),
    );
    expect(store.epics.unlinkChange).toHaveBeenCalledWith(
      "sourceEpic",
      "source-entry",
      "Merge duplicates.",
    );
    expect(store.epics.markMerged).toHaveBeenCalledWith(
      "sourceEpic",
      expect.objectContaining({ expectedVersion: 4 }),
    );
  });

  test("rejects unresolved merge conflicts before mutation", async () => {
    const duplicateEntry = makeChangeEntry({
      entry_id: "dup-entry",
      change_id: "change-3",
      change_ref: { change_id: "change-3", project_id: "project-web" },
      title: "Duplicate Change",
      membership_status: "linked",
      linked_at: "2026-06-25T00:00:00.000Z",
      linked_by: "agent",
      link_evidence: "linked",
    });
    const store = makeStore();
    store.epics.get = vi.fn(async (epicId: string) => ({
      success: true,
      data:
        epicId === "sourceEpic"
          ? makeEpic({ id: "sourceEpic", entries: [duplicateEntry] })
          : makeEpic({ id: "survivorEpic", entries: [duplicateEntry] }),
    }));

    const output = await epicTools.adv_epic_merge.execute(
      {
        source_epic_id: "sourceEpic",
        survivor_epic_id: "survivorEpic",
        expected_source_version: 0,
        expected_survivor_version: 0,
        evidence: "Merge duplicates.",
      },
      store,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.code).toBe("MERGE_CONFLICTS_UNRESOLVED");
    expect(store.epics.markMerged).not.toHaveBeenCalled();
  });

  test("preflights all child projections before mutating survivor", async () => {
    const firstEntry = makeChangeEntry({
      entry_id: "first-entry",
      change_id: "change-2",
      change_ref: { change_id: "change-2", project_id: "project-web" },
      title: "First Change",
      membership_status: "linked",
      linked_at: "2026-06-25T00:00:00.000Z",
      linked_by: "agent",
      link_evidence: "linked",
    });
    const badEntry = makeChangeEntry({
      entry_id: "bad-entry",
      change_id: "change-bad",
      change_ref: { change_id: "change-bad", project_id: "project-web" },
      title: "Bad Projection",
      membership_status: "linked",
      linked_at: "2026-06-25T00:00:00.000Z",
      linked_by: "agent",
      link_evidence: "linked",
    });
    const store = makeStore();
    store.epics.get = vi.fn(async (epicId: string) => ({
      success: true,
      data:
        epicId === "sourceEpic"
          ? makeEpic({
              id: "sourceEpic",
              version: 3,
              entries: [firstEntry, badEntry],
            })
          : makeEpic({ id: "survivorEpic", version: 5, entries: [] }),
    }));
    store.changes.get = vi.fn(async (changeId: string) => ({
      success: true,
      data: {
        id: changeId,
        title: changeId,
        status: "active",
        gates: {},
        tasks: [],
        deltas: {},
        wisdom: [],
        created_at: "2026-06-25T00:00:00.000Z",
        updated_at: "2026-06-25T00:00:00.000Z",
        epic_membership:
          changeId === "change-bad"
            ? { epic_id: "otherEpic", entry_id: "other-entry" }
            : {
                epic_id: "sourceEpic",
                entry_id: "first-entry",
                order: 0,
                title: "First Change",
                linked_at: "2026-06-25T00:00:00.000Z",
                source: "link_existing",
              },
      } as Change,
    }));

    const output = await epicTools.adv_epic_merge.execute(
      {
        source_epic_id: "sourceEpic",
        survivor_epic_id: "survivorEpic",
        expected_source_version: 3,
        expected_survivor_version: 5,
        evidence: "Merge duplicates.",
      },
      store,
    );

    const parsed = parseToolOutput(output);
    expect(parsed.code).toBe("PROJECTION_MISMATCH");
    expect(store.epics.linkChange).not.toHaveBeenCalled();
    expect(store.changes.setEpicMembership).not.toHaveBeenCalled();
    expect(store.epics.unlinkChange).not.toHaveBeenCalled();
    expect(store.epics.markMerged).not.toHaveBeenCalled();
  });
});
