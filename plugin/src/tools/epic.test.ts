import { describe, expect, test, vi } from "vitest";
import { epicTools } from "./epic";
import { parseToolOutput } from "../__tests__/setup";
import type { Store } from "../storage/store-types";
import type { Epic, EpicEntry } from "../types";

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
  return {
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
      reorder: vi.fn(async () => epic),
    },
    changes: {
      create: vi.fn(async () => ({
        changeId: "change-1",
        path: "/tmp/change-1",
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
