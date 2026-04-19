import type {
  Cancellation,
  ChangeClosure,
  ErrorRecovery,
  GateId,
  Gates,
  Task,
  TddPhase,
  TddPhaseEvidence,
  TddReclassification,
  WisdomType,
} from "../types";
import { canCompleteGate, createDefaultGates } from "../types";
import { reopenChangeFromGate } from "../storage/gate-reentry";
import type {
  ArtifactKind,
  ArtifactMetadata,
  ChangeWorkflowState,
} from "./contracts";

export interface AddTaskInput {
  title: string;
  type?: Task["type"];
  section?: string;
  blockedBy?: string[];
  metadata?: Record<string, string>;
}

export interface UpdateTaskInput {
  status: Task["status"];
  now: string;
  notes?: string;
  implementationSummary?: string;
  errorRecovery?: ErrorRecovery;
}

export interface StateMutationContext {
  now: string;
  uuid: () => string;
}

function getTaskOrThrow(state: ChangeWorkflowState, taskId: string): Task {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  return task;
}

export function getTaskFromChangeState(
  state: ChangeWorkflowState,
  taskId: string,
): Task | null {
  return state.tasks.find((candidate) => candidate.id === taskId) ?? null;
}

export function createChangeWorkflowState(input: {
  changeId: string;
  title: string;
  createdAt: string;
}): ChangeWorkflowState {
  return {
    id: input.changeId,
    projectId: "",
    changeId: input.changeId,
    title: input.title,
    status: "draft",
    initializedAt: input.createdAt,
    createdAt: input.createdAt,
    tasks: [],
    wisdom: [],
    gates: createDefaultGates(),
    reentry_history: [],
    artifacts: {},
  };
}

export function addTaskToChangeState(
  state: ChangeWorkflowState,
  input: AddTaskInput,
  ctx: StateMutationContext,
): Task {
  const nextPriority =
    state.tasks.length === 0
      ? 0
      : Math.max(...state.tasks.map((task) => task.priority ?? 0)) + 1;

  const task: Task = {
    id: `tk-${ctx.uuid()}`,
    title: input.title,
    type: input.type ?? "code",
    section: input.section,
    status: "pending",
    priority: nextPriority,
    created_at: ctx.now,
    deps: input.blockedBy?.map((target) => ({
      type: "blocked_by" as const,
      target,
    })),
    tdd_phase: "none",
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };

  state.tasks.push(task);
  return task;
}

export function listTasksFromChangeState(
  state: ChangeWorkflowState,
  status?: Task["status"],
  filter?: string,
): Task[] {
  let tasks = status
    ? state.tasks.filter((task) => task.status === status)
    : [...state.tasks];

  if (!filter) return tasks;

  const hasKeyMatch = filter.match(/^has_metadata_key:(.+)$/);
  const kvMatch = filter.match(/^metadata:([^=]+)=(.+)$/);
  if (hasKeyMatch) {
    const key = hasKeyMatch[1];
    tasks = tasks.filter((task) => task.metadata && key in task.metadata);
  } else if (kvMatch) {
    const key = kvMatch[1];
    const value = kvMatch[2];
    tasks = tasks.filter((task) => task.metadata?.[key] === value);
  }

  return tasks;
}

export function getReadyTasksFromChangeState(state: ChangeWorkflowState): {
  ready: Task[];
  blocked: Array<{ task: Task; blockedBy: string[] }>;
} {
  const ready: Task[] = [];
  const blocked: Array<{ task: Task; blockedBy: string[] }> = [];

  for (const task of state.tasks) {
    if (task.status !== "pending") continue;

    const blockers =
      task.deps
        ?.filter((dep) => dep.type === "blocked_by")
        .filter((dep) => {
          const blockingTask = state.tasks.find(
            (candidate) => candidate.id === dep.target,
          );
          return (
            blockingTask &&
            blockingTask.status !== "done" &&
            blockingTask.status !== "cancelled"
          );
        })
        .map((dep) => dep.target) ?? [];

    if (blockers.length === 0) {
      ready.push(task);
    } else {
      blocked.push({ task, blockedBy: blockers });
    }
  }

  return { ready, blocked };
}

export function updateTaskInChangeState(
  state: ChangeWorkflowState,
  taskId: string,
  input: UpdateTaskInput,
): Task {
  const task = getTaskOrThrow(state, taskId);
  task.status = input.status;

  if (input.status === "in_progress" && !task.started_at) {
    task.started_at = input.now;
  }

  if (input.status === "done" || input.status === "cancelled") {
    task.completed_at = input.now;
    if (input.notes) {
      task.completed_by = input.notes;
    }
  }

  if (typeof input.implementationSummary !== "undefined") {
    task.implementation_summary = input.implementationSummary;
  }

  if (typeof input.errorRecovery !== "undefined") {
    task.error_recovery = input.errorRecovery;
  }

  return task;
}

export function recordTaskEvidenceInChangeState(
  state: ChangeWorkflowState,
  taskId: string,
  phase: "red" | "green",
  evidence: TddPhaseEvidence,
): Task {
  const task = getTaskOrThrow(state, taskId);
  if (!task.tdd_evidence) {
    task.tdd_evidence = {};
  }

  task.tdd_evidence[phase] = {
    ...evidence,
    recorded_at: evidence.recorded_at,
  };

  if (phase === "red") {
    task.tdd_phase = "red";
  } else if (task.tdd_evidence.red?.recorded_at) {
    task.tdd_phase = "complete";
  } else {
    task.tdd_phase = "green";
  }

  return task;
}

export function setTaskPhaseInChangeState(
  state: ChangeWorkflowState,
  taskId: string,
  phase: TddPhase,
): Task {
  const task = getTaskOrThrow(state, taskId);
  task.tdd_phase = phase;
  return task;
}

export function cancelTaskInChangeState(
  state: ChangeWorkflowState,
  taskId: string,
  cancellation: Cancellation,
  now: string,
): Task {
  const task = getTaskOrThrow(state, taskId);
  task.status = "cancelled";
  task.completed_at = now;
  task.cancellation = cancellation;
  return task;
}

export function reclassifyTaskTddInChangeState(
  state: ChangeWorkflowState,
  taskId: string,
  reclassification: TddReclassification,
): Task {
  const task = getTaskOrThrow(state, taskId);
  if (!task.metadata) {
    task.metadata = {};
  }
  task.metadata.tdd_intent = reclassification.to_intent;
  task.tdd_reclassification = reclassification;
  return task;
}

export function completeGateInChangeState(
  state: ChangeWorkflowState,
  gateId: GateId,
  input: { now: string; completedBy: string; notes?: string },
): Gates[GateId] {
  if (!canCompleteGate(state.gates, gateId)) {
    throw new Error(
      `Cannot complete ${gateId}: previous gate is not satisfied`,
    );
  }

  state.gates[gateId] = {
    ...state.gates[gateId],
    status: "done",
    completed_at: input.now,
    completed_by: input.completedBy,
    ...(input.notes ? { notes: input.notes } : {}),
  };

  return state.gates[gateId];
}

export function reopenFromGateInChangeState(
  state: ChangeWorkflowState,
  fromGate: GateId,
  input: {
    now: string;
    reason: string;
    scopeDelta?: string;
    reopenedBy?: string;
    approvalEvidence?: string;
  },
): void {
  // Project the workflow state into the minimum Change view that
  // reopenChangeFromGate actually touches. Avoids an unsafe
  // `as unknown as Change` cast and keeps field drift a compile-time error.
  const adapter: import("../types").Change = {
    id: state.changeId,
    title: state.title,
    status: state.status,
    created_at: state.createdAt,
    tasks: state.tasks,
    deltas: {},
    wisdom: state.wisdom,
    gates: state.gates,
    reentry_history: state.reentry_history ?? [],
  };

  reopenChangeFromGate(
    adapter,
    fromGate,
    input.reason,
    input.scopeDelta,
    input.reopenedBy,
    input.approvalEvidence,
  );

  // Copy any mutations made by the helper back onto the workflow state so
  // the workflow stays authoritative for gates + reentry history.
  state.gates = adapter.gates ?? state.gates;
  state.reentry_history = adapter.reentry_history ?? state.reentry_history;

  const history = state.reentry_history ?? [];
  const lastEntry = history[history.length - 1];
  if (lastEntry) {
    lastEntry.reopened_at = input.now;
  }
}

export function addChangeWisdom(
  state: ChangeWorkflowState,
  input: { type: WisdomType; content: string; sourceTask?: string },
  ctx: StateMutationContext,
): void {
  state.wisdom.push({
    id: `ws-${ctx.uuid()}`,
    type: input.type,
    content: input.content,
    source_task: input.sourceTask,
    recorded_at: ctx.now,
  });
}

export function updateArtifactMetadataInChangeState(
  state: ChangeWorkflowState,
  kind: ArtifactKind,
  metadata: ArtifactMetadata,
): void {
  state.artifacts[kind] = metadata;
}

export function closeChangeInChangeState(
  state: ChangeWorkflowState,
  closure: ChangeClosure,
): void {
  state.status = "closed";
  state.closure = closure;
}
