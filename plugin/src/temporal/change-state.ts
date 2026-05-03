import type {
  Cancellation,
  ChangeClosure,
  ErrorRecovery,
  GateId,
  Task,
  TaskRunEvent,
  TaskRunPhase,
  TaskRunRequiredNextAction,
  TaskRunState,
  TddPhase,
  TddPhaseEvidence,
  TddReclassification,
  WisdomType,
} from "../types";
import { canCompleteGate, createDefaultGates } from "../types";
import { reopenChangeFromGate } from "./gate-reentry";
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
  /** Repo-relative paths of files modified by the task, populated by checkpoint */
  touchedFiles?: string[];
}

export interface TaskEvidencePolicyResult {
  task: Task;
  duplicate: boolean;
  corrected: boolean;
  correctionReason?: string;
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

const TASK_RUN_EVENT_LIMIT = 50;

const PHASE_BY_EVENT: Record<TaskRunEvent["type"], TaskRunPhase> = {
  start: "started",
  baseline: "baseline_captured",
  red_evidence: "red_recorded",
  green_evidence: "green_recorded",
  verification: "verified",
  checkpoint: "checkpointed",
  complete: "done",
  failure: "failed",
  blocker: "blocked",
};

const NEXT_ACTION_BY_PHASE: Record<TaskRunPhase, TaskRunRequiredNextAction> = {
  not_started: "start_task",
  started: "capture_baseline",
  baseline_captured: "record_red_evidence",
  awaiting_red: "record_red_evidence",
  red_recorded: "record_green_evidence",
  awaiting_green: "record_green_evidence",
  green_recorded: "run_incremental_verification",
  verified: "checkpoint_task",
  awaiting_checkpoint: "checkpoint_task",
  checkpointed: "mark_done",
  done: "none",
  blocked: "resolve_blocker",
  failed: "resolve_blocker",
};

const RESUME_HINT_BY_ACTION: Record<TaskRunRequiredNextAction, string> = {
  start_task: "Start task execution with adv_task_update status:'in_progress'.",
  capture_baseline: "Capture clean git baseline before Red Phase.",
  record_red_evidence: "Write failing test and record red evidence.",
  record_green_evidence: "Implement fix and record green evidence.",
  run_incremental_verification: "Run scoped verification before checkpoint.",
  checkpoint_task: "Create verified task checkpoint.",
  mark_done: "Mark task done after checkpoint is satisfied.",
  resolve_blocker: "Resolve blocker or follow doom-loop recovery.",
  none: "Task run is complete.",
};

function ensureTaskRuns(
  state: ChangeWorkflowState,
): Record<string, TaskRunState> {
  if (!state.task_runs) {
    state.task_runs = {};
  }
  return state.task_runs;
}

function createTaskRun(taskId: string, now: string): TaskRunState {
  return {
    taskId,
    runId: `run-${taskId}`,
    phase: "not_started",
    updatedAt: now,
    resumeHint: RESUME_HINT_BY_ACTION.start_task,
    requiredNextAction: "start_task",
    seenIdempotencyKeys: [],
    events: [],
  };
}

/**
 * Determine whether a task-run state transition is permitted.
 *
 * The default policy prefers the full TDD discipline:
 * `started -> baseline_captured -> red_recorded -> green_recorded ->
 * verified -> checkpointed -> done`. The ledger is diagnostic state, not
 * the source of truth for task validity, so it must also tolerate older
 * callers that skip baseline / verification bookkeeping while preserving
 * fundamentally invalid-transition rejections.
 *
 * Tasks with `tdd_intent: 'not_applicable'` (or no `tdd_intent` metadata
 * at all — legacy tasks) opt out of TDD discipline and may transition
 * directly from `started` to `checkpoint` or `complete`. This matches
 * the semantic meaning of "not applicable": there is no TDD lifecycle
 * to track for prose, spec, doc, or config-only changes.
 *
 * `inline` and `separate_verification` tasks may therefore transition from
 * `started` directly to red evidence or checkpoint, and from
 * `green_recorded` directly to checkpoint when verification was recorded
 * externally. This keeps long-running workflows recoverable until every
 * caller emits the full ledger sequence.
 *
 * Reliability rationale: rejecting these transitions caused the
 * workflow handler to throw, which surfaced as
 * `WorkflowWorkerUnhandledFailure` and permanently wedged the entire
 * change workflow. See agenda item ag-8c71c70f for the original bug.
 */
function isTransitionAllowed(
  current: TaskRunPhase,
  eventType: TaskRunEvent["type"],
  tddIntent?: string,
): boolean {
  if (eventType === "failure" || eventType === "blocker") {
    return current !== "done";
  }
  if (eventType === "start") {
    return current === "not_started";
  }
  if (eventType === "baseline") {
    return current === "started";
  }
  if (eventType === "red_evidence") {
    return (
      current === "started" ||
      current === "baseline_captured" ||
      current === "awaiting_red"
    );
  }
  if (eventType === "green_evidence") {
    return current === "red_recorded" || current === "awaiting_green";
  }
  if (eventType === "verification") {
    return current === "green_recorded";
  }
  if (eventType === "checkpoint") {
    if (
      current === "started" ||
      current === "green_recorded" ||
      current === "verified" ||
      current === "awaiting_checkpoint"
    ) {
      return true;
    }
    return false;
  }
  if (eventType === "complete") {
    if (current === "checkpointed") return true;
    // Same opt-out: not_applicable / legacy tasks may complete
    // directly from started (no checkpoint needed for no-op tasks).
    if (
      current === "started" &&
      (tddIntent === "not_applicable" || tddIntent === undefined)
    ) {
      return true;
    }
    return false;
  }
  return false;
}

function applyTaskRunPayload(run: TaskRunState, event: TaskRunEvent): void {
  if (event.type === "baseline") {
    run.baseline = {
      branch: String(event.payload.branch ?? ""),
      headSha: String(event.payload.headSha ?? ""),
      workdir: String(event.payload.workdir ?? ""),
      capturedAt: event.recordedAt,
    };
  }
  if (event.type === "red_evidence" || event.type === "green_evidence") {
    run.evidence = run.evidence ?? {};
    const key = event.type === "red_evidence" ? "red" : "green";
    run.evidence[key] = {
      test_file:
        typeof event.payload.test_file === "string"
          ? event.payload.test_file
          : undefined,
      command:
        typeof event.payload.command === "string"
          ? event.payload.command
          : undefined,
      output_snippet:
        typeof event.payload.output_snippet === "string"
          ? event.payload.output_snippet
          : undefined,
      exit_code:
        typeof event.payload.exit_code === "number"
          ? event.payload.exit_code
          : undefined,
      recorded_at: event.recordedAt,
    };
  }
  if (event.type === "verification") {
    run.verification = {
      summary: String(event.payload.summary ?? ""),
      recordedAt: event.recordedAt,
    };
  }
  if (event.type === "checkpoint") {
    run.checkpoint = {
      status: event.payload.status === "committed" ? "committed" : "clean",
      sha:
        typeof event.payload.sha === "string" ? event.payload.sha : undefined,
      branch:
        typeof event.payload.branch === "string"
          ? event.payload.branch
          : undefined,
      gitRoot:
        typeof event.payload.gitRoot === "string"
          ? event.payload.gitRoot
          : undefined,
      message:
        typeof event.payload.message === "string"
          ? event.payload.message
          : undefined,
      recordedAt: event.recordedAt,
    };
  }
}

export function getTaskFromChangeState(
  state: ChangeWorkflowState,
  taskId: string,
): Task | null {
  return state.tasks.find((candidate) => candidate.id === taskId) ?? null;
}

export function getTaskRunFromChangeState(
  state: ChangeWorkflowState,
  taskId: string,
): TaskRunState | null {
  return state.task_runs?.[taskId] ?? null;
}

export function listTaskRunsFromChangeState(
  state: ChangeWorkflowState,
): TaskRunState[] {
  return Object.values(state.task_runs ?? {});
}

export function recordTaskRunEventInChangeState(
  state: ChangeWorkflowState,
  taskId: string,
  event: TaskRunEvent,
): { duplicate: boolean; run: TaskRunState } {
  const task = getTaskOrThrow(state, taskId);
  if (!event.idempotencyKey) {
    throw new Error("Task-run event idempotencyKey is required");
  }

  const runs = ensureTaskRuns(state);
  const run = runs[taskId] ?? createTaskRun(taskId, event.recordedAt);
  runs[taskId] = run;

  const duplicate =
    run.seenIdempotencyKeys.includes(event.idempotencyKey) ||
    run.events.some(
      (existing) => existing.idempotencyKey === event.idempotencyKey,
    );
  if (duplicate) {
    return { duplicate: true, run };
  }

  const tddIntent = task.metadata?.tdd_intent;
  if (!isTransitionAllowed(run.phase, event.type, tddIntent)) {
    throw new Error(
      `Invalid task-run transition from ${run.phase} via ${event.type}` +
        (tddIntent ? ` (tdd_intent: ${tddIntent})` : ""),
    );
  }

  if (event.type === "start" && !run.startedAt) {
    run.startedAt = event.recordedAt;
  }
  run.phase = PHASE_BY_EVENT[event.type];
  run.updatedAt = event.recordedAt;
  run.requiredNextAction = NEXT_ACTION_BY_PHASE[run.phase];
  run.resumeHint = RESUME_HINT_BY_ACTION[run.requiredNextAction];
  applyTaskRunPayload(run, event);
  run.events.push(event);
  run.seenIdempotencyKeys.push(event.idempotencyKey);

  if (run.events.length > TASK_RUN_EVENT_LIMIT) {
    run.events = run.events.slice(-TASK_RUN_EVENT_LIMIT);
  }
  if (run.seenIdempotencyKeys.length > TASK_RUN_EVENT_LIMIT) {
    run.seenIdempotencyKeys =
      run.seenIdempotencyKeys.slice(-TASK_RUN_EVENT_LIMIT);
  }

  return { duplicate: false, run };
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

  if (typeof input.touchedFiles !== "undefined") {
    task.touched_files = input.touchedFiles;
  }

  return task;
}

export function recordTaskEvidenceInChangeState(
  state: ChangeWorkflowState,
  taskId: string,
  phase: "red" | "green",
  evidence: TddPhaseEvidence,
  options?: { correctionReason?: string },
): Task {
  return recordTaskEvidenceResultInChangeState(
    state,
    taskId,
    phase,
    evidence,
    options,
  ).task;
}

export function recordTaskEvidenceResultInChangeState(
  state: ChangeWorkflowState,
  taskId: string,
  phase: "red" | "green",
  evidence: TddPhaseEvidence,
  options?: { correctionReason?: string },
): TaskEvidencePolicyResult {
  const task = getTaskOrThrow(state, taskId);
  const result = applyTaskEvidencePolicy(task, phase, evidence, options);
  return { task, ...result };
}

export function applyTaskEvidencePolicy(
  task: Task,
  phase: "red" | "green",
  evidence: TddPhaseEvidence,
  options?: { correctionReason?: string },
): Omit<TaskEvidencePolicyResult, "task"> {
  if (!task.tdd_evidence) {
    task.tdd_evidence = {};
  }

  const existing = task.tdd_evidence[phase];
  if (existing && stableEvidenceEqual(existing, evidence)) {
    deriveTaskEvidencePhase(task);
    return { duplicate: true, corrected: false };
  }

  const correctionReason = options?.correctionReason?.trim();
  if (existing && !options?.correctionReason?.trim()) {
    throw new Error(
      `Conflicting ${phase} evidence already exists for task ${task.id}; provide correctionReason to replace it.`,
    );
  }

  task.tdd_evidence[phase] = {
    ...evidence,
    recorded_at: evidence.recorded_at,
    ...(correctionReason ? { correction_reason: correctionReason } : {}),
  };
  deriveTaskEvidencePhase(task);
  return {
    duplicate: false,
    corrected: Boolean(existing),
    ...(correctionReason ? { correctionReason } : {}),
  };
}

function stableEvidenceEqual(
  left: TddPhaseEvidence,
  right: TddPhaseEvidence,
): boolean {
  return (
    left.test_file === right.test_file &&
    left.command === right.command &&
    left.output_snippet === right.output_snippet &&
    left.exit_code === right.exit_code
  );
}

function deriveTaskEvidencePhase(task: Task): void {
  const hasRed = Boolean(task.tdd_evidence?.red);
  const hasGreen = Boolean(task.tdd_evidence?.green);

  if (hasRed && hasGreen) {
    task.tdd_phase = "complete";
  } else if (hasRed) {
    task.tdd_phase = "red";
  } else if (hasGreen) {
    task.tdd_phase = "green";
  } else {
    task.tdd_phase = "none";
  }
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
): ChangeWorkflowState {
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

  return state;
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
): ChangeWorkflowState {
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

  // Pass the workflow-supplied `now` directly so the helper records a
  // deterministic timestamp. Previously the workflow patched `reopened_at`
  // after the call, but the `new Date()` side-effect still ran during replay
  // and broke workflow determinism guarantees.
  reopenChangeFromGate(
    adapter,
    fromGate,
    input.reason,
    input.scopeDelta,
    input.reopenedBy,
    input.approvalEvidence,
    // Pass input.now so the helper stays deterministic inside the Temporal
    // workflow sandbox — replay would otherwise see new Date() produce a
    // fresh timestamp on every re-execution.
    input.now,
  );

  // Copy any mutations made by the helper back onto the workflow state so
  // the workflow stays authoritative for gates + reentry history.
  state.gates = adapter.gates ?? state.gates;
  state.reentry_history = adapter.reentry_history ?? state.reentry_history;

  return state;
}

export function addChangeWisdom(
  state: ChangeWorkflowState,
  input: { type: WisdomType; content: string; sourceTask?: string },
  ctx: StateMutationContext,
): ChangeWorkflowState {
  state.wisdom.push({
    id: `ws-${ctx.uuid()}`,
    type: input.type,
    content: input.content,
    source_task: input.sourceTask,
    recorded_at: ctx.now,
  });
  return state;
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
): ChangeWorkflowState {
  state.status = "closed";
  state.closure = closure;
  return state;
}

export function archiveChangeInChangeState(
  state: ChangeWorkflowState,
): ChangeWorkflowState {
  state.status = "archived";
  return state;
}
