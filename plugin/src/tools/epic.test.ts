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
    );
  });
});

describe("adv_epic_repair_membership", () => {
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
