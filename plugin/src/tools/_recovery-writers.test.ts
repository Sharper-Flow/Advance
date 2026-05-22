import { describe, expect, it, vi } from "vitest";
import {
  saveRecoveredChangeStatus,
  saveRecoveredGateCompletion,
  saveRecoveredTaskAdd,
  saveRecoveredTaskMutation,
} from "./_recovery-writers";
import type { Change } from "../types";

vi.mock("../storage/json", () => ({
  saveChange: vi.fn(async (_changesDir: string, _change: Change) => undefined),
}));

import { saveChange as mockedSaveChange } from "../storage/json";

function createMockStore(): { store: any; saveCalls: Change[] } {
  const saveCalls: Change[] = [];
  const store: any = {
    paths: {
      root: "/tmp/test",
      changes: "/tmp/test/.adv/changes",
    },
    changes: {
      save: vi.fn(async (change: Change) => {
        saveCalls.push(change);
      }),
      refresh: vi.fn(async () => undefined),
    },
  };
  return { store, saveCalls };
}

function baseChange(): Change {
  return {
    id: "test-change",
    title: "Test",
    status: "draft",
    created_at: "2026-01-01T00:00:00Z",
    tasks: [
      {
        id: "tk-1",
        title: "First task",
        type: "code",
        section: "Implementation",
        status: "pending",
        priority: 0,
        created_at: "2026-01-01T00:00:00Z",
      } as Change["tasks"][number],
    ],
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
  } as Change;
}

describe("saveRecoveredTaskMutation", () => {
  it("mutates an existing task and persists the updated change", async () => {
    const { store, saveCalls } = createMockStore();
    const change = baseChange();

    const updated = await saveRecoveredTaskMutation({
      store,
      change,
      taskId: "tk-1",
      mutate: (task) => ({ ...task, status: "done" }),
    });

    expect(updated.tasks[0].status).toBe("done");
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].tasks[0].status).toBe("done");
    expect(store.changes.refresh).toHaveBeenCalledWith("test-change");
  });

  it("throws when the task is not present", async () => {
    const { store } = createMockStore();
    const change = baseChange();

    await expect(
      saveRecoveredTaskMutation({
        store,
        change,
        taskId: "tk-missing",
        mutate: (task) => task,
      }),
    ).rejects.toThrow(/not present in change/);
  });
});

describe("saveRecoveredTaskAdd", () => {
  it("appends a new task and persists", async () => {
    const { store, saveCalls } = createMockStore();
    const change = baseChange();
    const newTask = {
      id: "tk-2",
      title: "Second",
      type: "code",
      section: "Implementation",
      status: "pending",
      priority: 1,
      created_at: "2026-01-02T00:00:00Z",
    } as Change["tasks"][number];

    const updated = await saveRecoveredTaskAdd({
      store,
      change,
      task: newTask,
    });

    expect(updated.tasks).toHaveLength(2);
    expect(updated.tasks[1].id).toBe("tk-2");
    expect(saveCalls).toHaveLength(1);
  });

  it("rejects duplicate task IDs", async () => {
    const { store } = createMockStore();
    const change = baseChange();
    await expect(
      saveRecoveredTaskAdd({
        store,
        change,
        task: { ...change.tasks[0] },
      }),
    ).rejects.toThrow(/already present/);
  });
});

describe("saveRecoveredGateCompletion", () => {
  it("replaces gate completion fields through disk-direct saveChange", async () => {
    const { store, saveCalls } = createMockStore();
    const change = baseChange();
    (mockedSaveChange as unknown as ReturnType<typeof vi.fn>).mockClear();

    const updated = await saveRecoveredGateCompletion({
      store,
      change,
      gateId: "release",
      completion: {
        status: "done",
        completed_at: "2026-05-22T00:00:00Z",
        completed_by: "user:jon",
        approval_evidence: "recovery",
      },
    });

    expect(updated.gates?.release?.status).toBe("done");
    expect(updated.gates?.release?.completed_by).toBe("user:jon");
    expect(saveCalls).toHaveLength(0);
    expect(store.changes.save).not.toHaveBeenCalled();
    expect(mockedSaveChange).toHaveBeenCalledWith(
      "/tmp/test/.adv/changes",
      expect.objectContaining({
        gates: expect.objectContaining({
          release: expect.objectContaining({ status: "done" }),
        }),
      }),
    );
    expect(store.changes.refresh).toHaveBeenCalledWith("test-change");
  });
});

describe("saveRecoveredChangeStatus", () => {
  it("transitions status via disk-direct saveChange (bypasses store.changes.save)", async () => {
    const { store, saveCalls } = createMockStore();
    const change = baseChange();
    (mockedSaveChange as unknown as ReturnType<typeof vi.fn>).mockClear();

    const updated = await saveRecoveredChangeStatus({
      store,
      change,
      status: "archived",
    });

    // rq-fix-archive-recovery-disk-write AC1: store.changes.save is NOT
    // called because it would invoke archiveChangeSignal on a poisoned
    // workflow.
    expect(updated.status).toBe("archived");
    expect(saveCalls).toHaveLength(0);
    expect(store.changes.save).not.toHaveBeenCalled();
    expect(mockedSaveChange).toHaveBeenCalledWith(
      "/tmp/test/.adv/changes",
      expect.objectContaining({ status: "archived" }),
    );
    // AC2: cache invalidation still fires so the next read sees fresh state.
    expect(store.changes.refresh).toHaveBeenCalledWith("test-change");
  });
});
