import type {
  Cancellation,
  Change,
  ChangeLifecycleState,
  ChangeStatus,
  ErrorRecovery,
  GateId,
  Task,
  TddReclassification,
} from "./index";
import {
  createDefaultGates,
  normalizeLegacyChangeStatus,
  normalizePersistedSubagentReportState,
} from "./index";
import type { ChangeState } from "./change-state";

export interface UpdateTaskInput {
  status: Task["status"];
  now: string;
  notes?: string;
  implementationSummary?: string;
  errorRecovery?: ErrorRecovery;
  touchedFiles?: string[];
}

export interface StateMutationContext {
  now: string;
  uuid: () => string;
}

export function normalizeChangeLifecycleState(
  status: ChangeStatus | ChangeLifecycleState | undefined,
): ChangeLifecycleState {
  return status === "archived" || status === "closed" ? status : "open";
}

export function getTaskFromChangeState(
  state: ChangeState,
  taskId: string,
): Task | null {
  return state.tasks.find((candidate) => candidate.id === taskId) ?? null;
}

export function createChangeState(input: {
  changeId: string;
  title: string;
  createdAt: string;
}): ChangeState {
  return {
    id: input.changeId,
    projectId: "",
    changeId: input.changeId,
    title: input.title,
    status: "draft",
    lifecycleState: "open",
    initializedAt: input.createdAt,
    createdAt: input.createdAt,
    tasks: [],
    subagent_reports: [],
    deltas: {},
    wisdom: [],
    gates: createDefaultGates(),
    reentry_history: [],
    artifacts: {},
    documents: {},
    reflections: [],
    worktrees: {},
    conformance: { lockedSpecs: [], overrides: [] },
    acceptanceReadinessRevision: 0,
    state_revision: 0,
    same_project_dependencies: [],
  };
}

export function changeSeedStateFromChange(
  change: Change,
): Partial<ChangeState> {
  const [normalizedChange] = normalizePersistedSubagentReportState(change);
  const safeChange = normalizedChange as Change & Partial<ChangeState>;
  const status = normalizeLegacyChangeStatus(safeChange.status) as ChangeStatus;
  return {
    status,
    lifecycleState:
      safeChange.lifecycleState ?? normalizeChangeLifecycleState(status),
    tasks: safeChange.tasks ?? [],
    subagent_reports: safeChange.subagent_reports ?? [],
    deltas: safeChange.deltas ?? {},
    wisdom: safeChange.wisdom ?? [],
    gates: safeChange.gates ?? createDefaultGates(),
    reentry_history: safeChange.reentry_history ?? [],
    artifacts: safeChange.artifacts ?? {},
    fast_follow_of: safeChange.fast_follow_of,
    affectedProjects: safeChange.affectedProjects,
    affectedPaths: safeChange.affectedPaths,
    lastSignalAt: safeChange.lastSignalAt,
    acceptanceCriteria: safeChange.acceptanceCriteria,
    contract: safeChange.contract,
    acceptanceReadinessRevision: safeChange.acceptanceReadinessRevision,
    state_revision: safeChange.state_revision ?? 0,
    acceptanceCriteriaSnapshot: safeChange.acceptanceCriteriaSnapshot,
    documents: safeChange.documents,
    origin: safeChange.origin,
    cross_project_origin: safeChange.cross_project_origin,
    cross_project_links: safeChange.cross_project_links,
    external_dependencies: safeChange.external_dependencies,
    same_project_dependencies: safeChange.same_project_dependencies ?? [],
    worktree_auto_managed: safeChange.worktree_auto_managed,
    target_worktree_path: safeChange.target_worktree_path,
    scope_worktrees: safeChange.scope_worktrees,
    seenReportIds: safeChange.seenReportIds,
    seenReportIdsTotal: safeChange.seenReportIdsTotal,
    design_concern_dispositions: safeChange.design_concern_dispositions,
    verification_evidence_dispositions:
      safeChange.verification_evidence_dispositions,
    signal_rejections: safeChange.signal_rejections,
    signal_rejections_total: safeChange.signal_rejections_total,
    ops_followup: safeChange.ops_followup,
    ops_followup_links: safeChange.ops_followup_links,
    epic_membership: safeChange.epic_membership,
    lightweight_profile: safeChange.lightweight_profile,
    coordination_claim: safeChange.coordination_claim,
    creation_request_hash: safeChange.creation_request_hash,
    testRuns: safeChange.test_runs,
  };
}

export function changeToState(input: {
  projectId: string;
  change: Change;
  initializedAt?: string;
  gates?: ChangeState["gates"];
}): ChangeState {
  const seed = changeSeedStateFromChange(input.change);
  return {
    ...createChangeState({
      changeId: input.change.id,
      title: input.change.title,
      createdAt: input.initializedAt ?? input.change.created_at,
    }),
    projectId: input.projectId,
    initializedAt: input.initializedAt ?? input.change.created_at,
    ...seed,
    gates: input.gates ?? seed.gates ?? createDefaultGates(),
  };
}

export function changeToDirectiveState(input: {
  projectId: string;
  change: Change;
  gates?: ChangeState["gates"];
}): ChangeState {
  const state = changeToState(input);
  state.pendingCheckpoint = input.change.pendingCheckpoint;
  state.terminated = input.change.terminated;
  return state;
}

export function acceptanceCriteriaFromContract(
  contract: NonNullable<ChangeState["contract"]>,
): string[] {
  return contract.items
    .filter((item) => item.kind === "acceptance_criterion")
    .map((item) => item.text);
}

export function listTasksFromChangeState(
  state: ChangeState,
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
    tasks = tasks.filter(
      (task) => task.metadata && hasKeyMatch[1] in task.metadata,
    );
  } else if (kvMatch) {
    tasks = tasks.filter((task) => task.metadata?.[kvMatch[1]] === kvMatch[2]);
  }
  return tasks;
}

export function getReadyTasksFromChangeState(state: ChangeState): {
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
    if (blockers.length === 0) ready.push(task);
    else blocked.push({ task, blockedBy: blockers });
  }
  return { ready, blocked };
}

export function updateTaskInChangeState(
  state: ChangeState,
  taskId: string,
  input: UpdateTaskInput,
): Task {
  const task = getTaskFromChangeState(state, taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  task.status = input.status;
  if (input.status === "in_progress" && !task.started_at)
    task.started_at = input.now;
  if (input.status === "done" || input.status === "cancelled") {
    task.completed_at = input.now;
    if (input.notes) task.completed_by = input.notes;
  }
  if (input.implementationSummary !== undefined)
    task.implementation_summary = input.implementationSummary;
  if (input.errorRecovery !== undefined)
    task.error_recovery = input.errorRecovery;
  if (input.touchedFiles !== undefined) task.touched_files = input.touchedFiles;
  return task;
}

export function cancelTaskInChangeState(
  state: ChangeState,
  taskId: string,
  cancellation: Cancellation,
  now: string,
): Task {
  const task = getTaskFromChangeState(state, taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  task.status = "cancelled";
  task.completed_at = now;
  task.cancellation = cancellation;
  return task;
}

export function reclassifyTaskTddInChangeState(
  state: ChangeState,
  taskId: string,
  reclassification: TddReclassification,
): Task {
  const task = getTaskFromChangeState(state, taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  task.metadata ??= {};
  task.metadata.tdd_intent = reclassification.to_intent;
  task.tdd_reclassification = reclassification;
  return task;
}

export function completeGateInChangeState(
  state: ChangeState,
  gateId: GateId,
  input: { now: string; completedBy: string; notes?: string },
): ChangeState {
  state.gates[gateId] = {
    ...state.gates[gateId],
    status: "done",
    completed_at: input.now,
    completed_by: input.completedBy,
    ...(input.notes ? { notes: input.notes } : {}),
  };
  return state;
}
