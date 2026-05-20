export type TodoWriteStatus = "pending" | "in_progress" | "completed";

export interface TodoWriteItemInput {
  content?: unknown;
  status?: unknown;
}

export interface TodoWriteTaskState {
  id: string;
  changeId: string;
  status: string;
}

export interface TodoWriteGuardScope {
  active: boolean;
  activeChangeId?: string | null;
  degraded?: boolean;
  reason?: string;
}

export type TodoWriteGuardDecision =
  | { kind: "allow" }
  | { kind: "warn"; message: string }
  | { kind: "block"; message: string };

const TASK_ID_PATTERN = /\btk-[A-Za-z0-9]+\b/g;

export function extractTodoTaskIds(content: string): string[] {
  return Array.from(new Set(content.match(TASK_ID_PATTERN) ?? []));
}

export function normalizeTodoWriteItems(args: unknown): TodoWriteItemInput[] {
  if (!args || typeof args !== "object") return [];
  const todos = (args as { todos?: unknown }).todos;
  return Array.isArray(todos) ? (todos as TodoWriteItemInput[]) : [];
}

// rq-todoGuard01: scoped TodoWrite drift guardrails classify allow/warn/block.
export function evaluateTodoWriteGuard(input: {
  scope: TodoWriteGuardScope;
  todos: TodoWriteItemInput[];
  tasksById: Map<string, TodoWriteTaskState>;
}): TodoWriteGuardDecision {
  if (!input.scope.active) return { kind: "allow" };
  if (input.scope.degraded) {
    return {
      kind: "warn",
      message: `TodoWrite ADV guard warning: ${input.scope.reason ?? "ADV state unavailable"}`,
    };
  }

  const activeChangeId = input.scope.activeChangeId;
  if (!activeChangeId) return { kind: "allow" };

  let sawNoIdTodo = false;

  for (const todo of input.todos) {
    const content = typeof todo.content === "string" ? todo.content : "";
    const status = typeof todo.status === "string" ? todo.status : "";
    const ids = extractTodoTaskIds(content);
    if (ids.length === 0) {
      sawNoIdTodo = true;
      continue;
    }

    for (const taskId of ids) {
      const task = input.tasksById.get(taskId);
      if (!task) {
        return {
          kind: "block",
          message: `TodoWrite references unknown ADV task ${taskId}. Use the ADV task projection for ${activeChangeId}.`,
        };
      }
      if (task.changeId !== activeChangeId) {
        return {
          kind: "block",
          message: `TodoWrite references ${taskId} from change ${task.changeId}, not active change ${activeChangeId}.`,
        };
      }
      if (status === "completed" && task.status !== "done") {
        return {
          kind: "block",
          message: `TodoWrite cannot mark ${taskId} completed until ADV task state is done.`,
        };
      }
    }
  }

  if (sawNoIdTodo) {
    return {
      kind: "warn",
      message:
        "TodoWrite ADV guard warning: entries without tk-* IDs are scratchpad-only during active ADV execution.",
    };
  }

  return { kind: "allow" };
}
