/** Task read and filter semantics against the disk projection. */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
  cleanupTempDir,
  createTempDir,
  createTempGitWorktree,
} from "../__tests__/setup";
import { taskTools } from "./task";
import type { Store, Task } from "../types";
import { ChangeSchema } from "../types";
import { SAMPLE_CHANGE } from "../__tests__/setup";
import { loadChange } from "../storage/change-projection-reader";

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
  await mkdir(join(changeDir, "change-1"), { recursive: true });
  await writeFile(
    join(changeDir, "change-1", "change.json"),
    JSON.stringify({
      id: "change-1",
      title: "Change",
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      tasks,
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

  test("task add/list/show and blockedBy use canonical state despite stale flat data", async () => {
    const root = await createTempDir("adv-task-canonical-");
    const worktree = await createTempGitWorktree("adv-task-canonical-");
    const cwdSpy = vi
      .spyOn(process, "cwd")
      .mockReturnValue(worktree.worktreePath);
    const changeDir = join(root, "changes");
    const changeId = "canonical-task-change";
    const canonical = ChangeSchema.parse({
      ...SAMPLE_CHANGE,
      id: changeId,
      title: "Canonical task change",
      status: "draft",
      lifecycleState: "open",
      gates: {
        proposal: { status: "pending" },
        discovery: { status: "pending" },
        design: { status: "pending" },
        planning: { status: "pending" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      },
      tasks: [
        {
          id: "tk-canonical",
          title: "Canonical blocker",
          type: "code",
          status: "pending",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      projection_revision: 0,
      state_revision: 0,
    });
    try {
      await mkdir(join(changeDir, changeId), { recursive: true });
      await writeFile(
        join(changeDir, changeId, "change.json"),
        JSON.stringify(canonical),
      );
      await writeFile(
        join(changeDir, `${changeId}.json`),
        JSON.stringify({ state: { tasks: [] } }),
      );
      const store = {
        paths: { root, changes: changeDir },
        config: null,
        changes: {
          get: async () => loadChange(changeDir, changeId),
          list: async () => ({
            changes: [
              { id: changeId, title: canonical.title, status: "draft" },
            ],
          }),
        },
        gates: {
          get: async () => canonical.gates,
        },
        wisdom: { search: async () => [] },
      } as unknown as Store;

      const add = JSON.parse(
        await taskTools.adv_task_add.execute(
          {
            changeId,
            content: "Canonical dependent task",
            type: "docs",
            blockedBy: ["tk-canonical"],
          },
          store,
        ),
      );
      expect(add.error).toBeUndefined();
      expect(add.task.deps).toEqual([
        { type: "blocked_by", target: "tk-canonical" },
      ]);
      const summaryPointer = JSON.parse(
        await readFile(
          join(root, "summaries", changeId, "current.json"),
          "utf8",
        ),
      );
      const summaryShard = JSON.parse(
        await readFile(summaryPointer.shard_path, "utf8"),
      );
      expect(summaryPointer.projection_revision).toBe(1);
      expect(summaryShard.task_count).toBe(2);

      const listed = JSON.parse(
        await taskTools.adv_task_list.execute({ changeId }, store),
      );
      expect(listed.tasks).toHaveLength(2);
      const shown = JSON.parse(
        await taskTools.adv_task_show.execute(
          { taskId: "tk-canonical" },
          store,
        ),
      );
      expect(shown.task.id).toBe("tk-canonical");
    } finally {
      cwdSpy.mockRestore();
      await worktree.cleanup();
      await cleanupTempDir(root);
    }
  });
});
