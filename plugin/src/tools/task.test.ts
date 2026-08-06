/** Task read and filter semantics against the disk projection. */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { taskTools } from "./task";
import type { Store, Task } from "../types";

const tasks: Task[] = [
  {
    id: "tk-a",
    title: "First",
    status: "pending",
    priority: 1,
    created_at: "2026-01-01T00:00:00Z",
    blockedBy: [],
  } as Task,
  {
    id: "tk-b",
    title: "Second",
    status: "done",
    priority: 0,
    created_at: "2026-01-02T00:00:00Z",
    blockedBy: [],
  } as Task,
];

async function setup(): Promise<{ root: string; store: Store }> {
  const root = await createTempDir("adv-task-");
  const changeDir = join(root, "changes");
  await mkdir(changeDir, { recursive: true });
  await writeFile(
    join(changeDir, "change-1.json"),
    JSON.stringify({
      schemaVersion: 2,
      projectId: "0".repeat(40),
      changeId: "change-1",
      projectedAt: "2026-01-01T00:00:00Z",
      state: {
        id: "change-1",
        changeId: "change-1",
        title: "Change",
        status: "active",
        tasks,
        gates: {},
      },
    }),
  );
  const store = {
    paths: { root, changes: changeDir },
    changes: {
      list: async () => ({
        changes: [{ id: "change-1", title: "Change", status: "active" }],
      }),
    },
    wisdom: { search: async () => [] },
  } as unknown as Store;
  return { root, store };
}

describe("task tools — disk projection", () => {
  test("lists tasks from the persisted projection in priority order", async () => {
    const { root, store } = await setup();
    try {
      const parsed = JSON.parse(
        await taskTools.adv_task_list.execute({ changeId: "change-1" }, store),
      );
      expect(parsed.tasks.map((task: Task) => task.id)).toEqual([
        "tk-a",
        "tk-b",
      ]);
      expect(parsed.pagination.total).toBe(2);
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("filters task list by status without consulting workflow state", async () => {
    const { root, store } = await setup();
    try {
      const parsed = JSON.parse(
        await taskTools.adv_task_list.execute(
          { changeId: "change-1", status: "done" },
          store,
        ),
      );
      expect(parsed.tasks).toHaveLength(1);
      expect(parsed.tasks[0]).toMatchObject({ id: "tk-b", status: "done" });
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("shows a task from the authoritative projection", async () => {
    const { root, store } = await setup();
    try {
      const parsed = JSON.parse(
        await taskTools.adv_task_show.execute({ taskId: "tk-a" }, store),
      );
      expect(parsed.changeId).toBe("change-1");
      expect(parsed.task).toMatchObject({
        id: "tk-a",
        title: "First",
        status: "pending",
      });
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("returns a structured not-found result for an absent task", async () => {
    const { root, store } = await setup();
    try {
      const parsed = JSON.parse(
        await taskTools.adv_task_show.execute({ taskId: "tk-missing" }, store),
      );
      expect(parsed.error).toBe("Task not found: tk-missing");
    } finally {
      await cleanupTempDir(root);
    }
  });
});
