/**
 * Live D3 enforcement integration tests for tool handlers.
 *
 * AC3: edge validation fires at every edge-writing ingress.
 * AC4: shell promotion / change creation refuse nonterminal prerequisites.
 *
 * These tests verify that adv_epic_add_shell, adv_epic_promote_shell, and
 * adv_change_create actually wire the D3 enforcement module to the Store.
 */
import { describe, test, expect, vi } from "vitest";
import { epicTools } from "./epic";
import { changeTools } from "./change";
import { parseToolOutput } from "../__tests__/setup";
import type { Store } from "../storage/store-types";
import type { Change, Epic, EpicEntry } from "../types";

const PID = "bdf259aa162ae192af5b18899ccdc653b085528d";

function changeRef(id: string) {
  return { kind: "change" as const, project_id: PID, change_id: id };
}

function shellRef(epicId: string, entryId: string) {
  return { kind: "epic_entry" as const, epic_id: epicId, entry_id: entryId };
}

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

function makeShellEntry(
  overrides?: Partial<Extract<EpicEntry, { kind: "shell" }>>,
): Extract<EpicEntry, { kind: "shell" }> {
  return {
    kind: "shell",
    entry_id: "shell-1",
    order: 0,
    title: "Shell One",
    success_hint: "Do the thing",
    blocked_by: [],
    ...overrides,
  };
}

function makeChange(overrides?: Partial<Change>): Change {
  return {
    id: "change-terminal",
    title: "Terminal Change",
    status: "archived",
    lifecycleState: "archived",
    gates: {},
    tasks: [],
    deltas: {},
    wisdom: [],
    created_at: "2026-06-25T00:00:00.000Z",
    updated_at: "2026-06-25T00:00:00.000Z",
    same_project_dependencies: [],
    ...overrides,
  } as Change;
}

function makeStore(opts?: { epic?: Partial<Epic>; changes?: Change[] }): Store {
  const epic = makeEpic(opts?.epic);
  const changes = opts?.changes ?? [];
  const createdChanges = new Map<string, Change>();
  return {
    paths: {
      root: "/workspace/owner",
      external: `/tmp/advance/${PID}`,
      changes: "/workspace/owner/.adv/changes",
    },
    changes: {
      create: vi.fn(async (summary: string) => {
        const changeId = summary.toLowerCase().replace(/\s+/g, "-");
        createdChanges.set(changeId, {
          id: changeId,
          title: summary,
          status: "draft",
          lifecycleState: "open",
          gates: {},
          tasks: [],
          deltas: {},
          wisdom: [],
          created_at: "2026-06-25T00:00:00.000Z",
          updated_at: "2026-06-25T00:00:00.000Z",
          same_project_dependencies: [],
        } as Change);
        return { changeId, path: "/tmp" };
      }),
      get: vi.fn(async (id: string) => {
        const found =
          createdChanges.get(id) ?? changes.find((c) => c.id === id);
        return found
          ? { success: true as const, data: found, source: "disk" as const }
          : { success: false as const, error: "not found" };
      }),
      // Disk contract: the projection write persists the child's membership
      // derived from the promoted entry (post-promotion projection step).
      setEpicMembership: vi.fn(
        async (id: string, { membership }: { membership: unknown }) => {
          const target = createdChanges.get(id);
          if (target)
            (target as { epic_membership?: unknown }).epic_membership =
              membership;
          return target ?? null;
        },
      ),
      clearEpicMembership: vi.fn(async () => null),
      list: vi.fn(async () => ({
        changes: changes.map((c) => ({
          id: c.id,
          title: c.title,
          status: c.status,
          currentGate: "proposal" as const,
          lifecycleState: c.lifecycleState,
          created_at: c.created_at,
          lastActivityAt: c.updated_at,
          taskCount: c.tasks?.length ?? 0,
          completedTasks: 0,
        })),
      })),
      refresh: vi.fn(),
    },
    epics: {
      create: vi.fn(async () => epic),
      get: vi.fn(async () => ({ success: true, data: epic })),
      list: vi.fn(async () => [epic]),
      addShell: vi.fn(async () => makeShellEntry()),
      // Disk contract: promoteShell swaps the shell entry in place for a
      // change entry under the SAME entry_id, so a subsequent epics.get
      // returns the promoted state.
      promoteShell: vi.fn(async (_epicId: string, entryId: string) => {
        const index = epic.entries.findIndex(
          (entry) => entry.entry_id === entryId,
        );
        if (index >= 0) {
          epic.entries[index] = {
            kind: "change",
            entry_id: entryId,
            order: epic.entries[index].order,
            change_id: "change-1",
            title: epic.entries[index].title,
            membership_status: "projection_pending",
            linked_at: "2026-06-25T00:00:00.000Z",
            linked_by: "agent",
          } as (typeof epic.entries)[number];
        }
        return { entryId, changeId: "change-1" };
      }),
      linkChange: vi.fn(),
      unlinkChange: vi.fn(),
      retargetChange: vi.fn(),
      setEntryMembershipStatus: vi.fn(),
      setEntryTerminalSummary: vi.fn(),
      update: vi.fn(async () => epic),
      updateScope: vi.fn(async () => epic),
      markMerged: vi.fn(async () => epic),
      reorder: vi.fn(async () => epic),
      getRetiredProjection: vi.fn(async () => ({
        success: false,
        error: "none",
      })),
      saveRetiredProjection: vi.fn(),
      retire: vi.fn(),
      repairIndex: vi.fn(),
    },
  } as unknown as Store;
}

describe("adv_epic_add_shell D3 enforcement", () => {
  test("rejects self-edge in blocked_by", async () => {
    const store = makeStore();
    const output = await epicTools.adv_epic_add_shell.execute(
      {
        epic_id: "addAuthEpic",
        title: "Shell One",
        success_hint: "Do the thing",
        entry_id: "shell-1",
        blocked_by: [shellRef("addAuthEpic", "shell-1")],
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(false);
    expect(parsed.code).toBe("INVALID_WORK_NODE_REF");
  });

  test("rejects unresolved same-project target", async () => {
    const store = makeStore();
    const output = await epicTools.adv_epic_add_shell.execute(
      {
        epic_id: "addAuthEpic",
        title: "Shell One",
        success_hint: "Do the thing",
        entry_id: "shell-1",
        blocked_by: [changeRef("nonexistent")],
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(false);
    expect(parsed.code).toBe("UNRESOLVED_DEPENDENCY");
  });

  test("rejects cycle when adding blocked_by edge", async () => {
    const store = makeStore({
      epic: {
        entries: [
          makeShellEntry({
            entry_id: "shell-2",
            blocked_by: [shellRef("addAuthEpic", "shell-1")],
          }),
        ],
      },
    });
    const output = await epicTools.adv_epic_add_shell.execute(
      {
        epic_id: "addAuthEpic",
        title: "Shell One",
        success_hint: "Do the thing",
        entry_id: "shell-1",
        blocked_by: [shellRef("addAuthEpic", "shell-2")],
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(false);
    expect(parsed.code).toBe("DEPENDENCY_CYCLE");
  });

  test("accepts terminal change prereq and passes blocked_by to store", async () => {
    const store = makeStore({
      changes: [makeChange({ id: "prereq", title: "Prereq" })],
    });
    const output = await epicTools.adv_epic_add_shell.execute(
      {
        epic_id: "addAuthEpic",
        title: "Shell One",
        success_hint: "Do the thing",
        entry_id: "shell-1",
        blocked_by: [changeRef("prereq")],
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(store.epics.addShell).toHaveBeenCalledWith(
      "addAuthEpic",
      expect.objectContaining({
        blockedBy: [changeRef("prereq")],
      }),
    );
  });

  test("accepts nonterminal prereq at shell-add time for later promotion enforcement", async () => {
    const store = makeStore({
      changes: [
        makeChange({
          id: "prereq",
          title: "Prereq",
          status: "draft",
          lifecycleState: "open",
        }),
      ],
    });
    const output = await epicTools.adv_epic_add_shell.execute(
      {
        epic_id: "addAuthEpic",
        title: "Shell One",
        success_hint: "Do the thing",
        entry_id: "shell-1",
        blocked_by: [changeRef("prereq")],
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(store.epics.addShell).toHaveBeenCalledWith(
      "addAuthEpic",
      expect.objectContaining({
        blockedBy: [changeRef("prereq")],
      }),
    );
  });
});

describe("adv_epic_promote_shell D3 enforcement", () => {
  test("rejects promotion when blocked_by prereq is nonterminal", async () => {
    const store = makeStore({
      epic: {
        entries: [
          makeShellEntry({
            entry_id: "shell-1",
            blocked_by: [changeRef("prereq")],
          }),
        ],
      },
      changes: [
        makeChange({
          id: "prereq",
          title: "Prereq",
          status: "draft",
          lifecycleState: "open",
        }),
      ],
    });
    const output = await epicTools.adv_epic_promote_shell.execute(
      { epic_id: "addAuthEpic", entry_id: "shell-1", change_id: "change-1" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(false);
    expect(parsed.code).toBe("SHELL_PREREQ_NONTERMINAL");
    expect(store.epics.promoteShell).not.toHaveBeenCalled();
  });

  test("allows promotion when blocked_by prereq is terminal", async () => {
    const store = makeStore({
      epic: {
        entries: [
          makeShellEntry({
            entry_id: "shell-1",
            blocked_by: [changeRef("prereq")],
          }),
        ],
      },
      changes: [makeChange({ id: "prereq", title: "Prereq" })],
    });
    const output = await epicTools.adv_epic_promote_shell.execute(
      { epic_id: "addAuthEpic", entry_id: "shell-1", change_id: "change-1" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(true);
    expect(store.epics.promoteShell).toHaveBeenCalled();
  });
});

describe("adv_change_create D3 enforcement", () => {
  test("rejects creation when same_project_dependencies prereq is nonterminal", async () => {
    const store = makeStore({
      changes: [
        makeChange({
          id: "prereq",
          title: "Prereq",
          status: "draft",
          lifecycleState: "open",
        }),
      ],
    });
    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Add New Feature",
        same_project_dependencies: [changeRef("prereq")],
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.success).toBe(false);
    expect(parsed.code).toBe("DEP_PREREQ_NONTERMINAL");
    expect(store.changes.create).not.toHaveBeenCalled();
  });

  test("passes same_project_dependencies to store when prereqs are terminal", async () => {
    const store = makeStore({
      changes: [makeChange({ id: "prereq", title: "Prereq" })],
    });
    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Add New Feature",
        same_project_dependencies: [changeRef("prereq")],
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.changeId, JSON.stringify(parsed)).toBe("add-new-feature");
    expect(store.changes.create).toHaveBeenCalledWith(
      "Add New Feature",
      expect.objectContaining({
        initialMetadata: expect.objectContaining({
          same_project_dependencies: [changeRef("prereq")],
        }),
      }),
    );
  });
});
