import { describe, expect, it } from "vitest";
import {
  evaluateTodoWriteGuard,
  extractTodoTaskIds,
  normalizeTodoWriteItems,
  type TodoWriteTaskState,
} from "./todowrite-guard";

const tasks = new Map<string, TodoWriteTaskState>([
  ["tk-active", { id: "tk-active", changeId: "change-a", status: "pending" }],
  ["tk-done", { id: "tk-done", changeId: "change-a", status: "done" }],
  ["tk-other", { id: "tk-other", changeId: "change-b", status: "pending" }],
]);

describe("todowrite-guard", () => {
  it("extracts unique task IDs from TodoWrite content", () => {
    expect(
      extractTodoTaskIds("Do tk-active then tk-active and tk-other"),
    ).toEqual(["tk-active", "tk-other"]);
  });

  it("normalizes OpenCode TodoWrite args", () => {
    expect(
      normalizeTodoWriteItems({
        todos: [{ content: "tk-active", status: "pending" }],
      }),
    ).toEqual([{ content: "tk-active", status: "pending" }]);
    expect(normalizeTodoWriteItems({})).toEqual([]);
  });

  it("allows todos outside active ADV guard scope", () => {
    expect(
      evaluateTodoWriteGuard({
        scope: { active: false },
        todos: [{ content: "tk-missing", status: "completed" }],
        tasksById: tasks,
      }),
    ).toEqual({ kind: "allow" });
  });

  it("blocks unknown task IDs during active ADV execution", () => {
    expect(
      evaluateTodoWriteGuard({
        scope: { active: true, activeChangeId: "change-a" },
        todos: [{ content: "tk-missing", status: "pending" }],
        tasksById: tasks,
      }),
    ).toMatchObject({ kind: "block" });
  });

  it("blocks task IDs owned by another change", () => {
    expect(
      evaluateTodoWriteGuard({
        scope: { active: true, activeChangeId: "change-a" },
        todos: [{ content: "tk-other", status: "pending" }],
        tasksById: tasks,
      }),
    ).toMatchObject({ kind: "block" });
  });

  it("blocks completed todos until ADV task state is done", () => {
    expect(
      evaluateTodoWriteGuard({
        scope: { active: true, activeChangeId: "change-a" },
        todos: [{ content: "tk-active", status: "completed" }],
        tasksById: tasks,
      }),
    ).toMatchObject({ kind: "block" });

    expect(
      evaluateTodoWriteGuard({
        scope: { active: true, activeChangeId: "change-a" },
        todos: [{ content: "tk-done", status: "completed" }],
        tasksById: tasks,
      }),
    ).toEqual({ kind: "allow" });
  });

  it("warns for no-ID scratchpad todos and degraded state", () => {
    expect(
      evaluateTodoWriteGuard({
        scope: { active: true, activeChangeId: "change-a" },
        todos: [{ content: "scratch note", status: "pending" }],
        tasksById: tasks,
      }),
    ).toMatchObject({ kind: "warn" });

    expect(
      evaluateTodoWriteGuard({
        scope: { active: true, activeChangeId: "change-a", degraded: true },
        todos: [{ content: "tk-missing", status: "completed" }],
        tasksById: tasks,
      }),
    ).toMatchObject({ kind: "warn" });
  });
});
