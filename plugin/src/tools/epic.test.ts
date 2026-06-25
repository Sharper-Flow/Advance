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
  test("returns Epic state", async () => {
    const store = makeStore();
    const output = await epicTools.adv_epic_show.execute(
      { epic_id: "addAuthEpic" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(parsed.epic.title).toBe("Add Auth Epic");
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
