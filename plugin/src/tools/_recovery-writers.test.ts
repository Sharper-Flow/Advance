import { describe, expect, it, vi } from "vitest";
import {
  saveRecoveredChangeStatus,
  saveRecoveredGateCompletion,
  saveRecoveredTaskAdd,
  saveRecoveredTaskMutation,
} from "./_recovery-writers";
import type { Change } from "../types";

function createMockStore(): { store: any; saveCalls: Change[] } {
  const saveCalls: Change[] = [];
  const store: any = {
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
  it("replaces gate completion fields and persists", async () => {
    const { store, saveCalls } = createMockStore();
    const change = baseChange();

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
    expect(saveCalls).toHaveLength(1);
  });
});

describe("saveRecoveredChangeStatus", () => {
  it("transitions status and persists", async () => {
    const { store, saveCalls } = createMockStore();
    const change = baseChange();

    const updated = await saveRecoveredChangeStatus({
      store,
      change,
      status: "archived",
    });

    expect(updated.status).toBe("archived");
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].status).toBe("archived");
  });
});
