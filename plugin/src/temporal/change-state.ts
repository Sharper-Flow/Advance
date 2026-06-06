import type {
  AcceptanceCriteriaSetSignalPayload,
  AgreementUpdatedSignalPayload,
  ArchiveRequestedSignalPayload,
  Cancellation,
  Change,
  ChangeCancelledSignalPayload,
  AcceptanceUpdatedSignalPayload,
  ChangeClosure,
  ContractAmendedSignalPayload,
  ContractReviewMatrixSetSignalPayload,
  ContractSetSignalPayload,
  ConformanceLockedSignalPayload,
  ConformanceOverriddenSignalPayload,
  ConformanceVerdictSignalPayload,
  DesignUpdatedSignalPayload,
  ErrorRecovery,
  ExecutiveSummaryUpdatedSignalPayload,
  GateId,
  GateAwaitingApprovalSignalPayload,
  GateCompletedSignalPayload,
  GateInProgressSignalPayload,
  GateReenteredSignalPayload,
  GateStuckSignalPayload,
  ProblemStatementUpdatedSignalPayload,
  ProposalUpdatedSignalPayload,
  ReflectionRecordedSignalPayload,
  SubagentReportSubmittedSignalPayload,
  Task,
  TaskAddedSignalPayload,
  TaskAssignedSignalPayload,
  TaskBlockedSignalPayload,
  TaskCancelledSignalPayload,
  TaskCompletedSignalPayload,
  TaskRemovedSignalPayload,
  TaskUpdatedSignalPayload,
  TddReclassification,
  WisdomAddedSignalPayload,
  WisdomType,
  WorktreeAttachedSignalPayload,
  WorktreeAutoManagedSignalPayload,
  WorktreeCreatedSignalPayload,
  WorktreeDeletedSignalPayload,
} from "../types";
import { createDefaultGates, GATE_ORDER } from "../types";
import { normalizePersistedSubagentReportState } from "../types";
import { subagentReportKey } from "./contracts";
import { describePayloadDigest } from "./digest";
import type {
  ArtifactKind,
  ArtifactMetadata,
  ChangeWorkflowInput,
  ChangeWorkflowState,
  SignalRejection,
} from "./contracts";

export interface UpdateTaskInput {
  status: Task["status"];
  now: string;
  notes?: string;
  implementationSummary?: string;
  errorRecovery?: ErrorRecovery;
  /** Repo-relative paths of files modified by the task, populated by checkpoint */
  touchedFiles?: string[];
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
  };
}

export function changeSeedStateFromChange(
  change: Change,
): NonNullable<ChangeWorkflowInput["seedState"]> {
  const [normalizedChange] = normalizePersistedSubagentReportState(change);
  const safeChange = normalizedChange as Change;

  return {
    status: safeChange.status,
    tasks: safeChange.tasks ?? [],
    subagent_reports: safeChange.subagent_reports ?? [],
    deltas: safeChange.deltas ?? {},
    wisdom: safeChange.wisdom ?? [],
    gates: safeChange.gates ?? createDefaultGates(),
    reentry_history: safeChange.reentry_history ?? [],
    artifacts: (safeChange.artifacts as ChangeWorkflowState["artifacts"]) ?? {},
    fast_follow_of: safeChange.fast_follow_of,
    affectedProjects: safeChange.affectedProjects,
    affectedPaths: safeChange.affectedPaths,
    lastSignalAt: safeChange.lastSignalAt,
    acceptanceCriteria: safeChange.acceptanceCriteria,
    contract: safeChange.contract,
    documents: safeChange.documents,
    origin: safeChange.origin,
    cross_project_origin: safeChange.cross_project_origin,
    cross_project_links: safeChange.cross_project_links,
    external_dependencies: safeChange.external_dependencies,
    worktree_auto_managed: safeChange.worktree_auto_managed,
    target_worktree_path: safeChange.target_worktree_path,
    scope_worktrees: safeChange.scope_worktrees,
    seenReportIds: safeChange.seenReportIds,
    signal_rejections: safeChange.signal_rejections,
    signal_rejections_total: safeChange.signal_rejections_total,
  };
}

export function changeToWorkflowState(input: {
  projectId: string;
  change: Change;
  initializedAt?: string;
  projectionChangesDir?: string;
  gates?: ChangeWorkflowState["gates"];
}): ChangeWorkflowState {
  const seed = changeSeedStateFromChange(input.change);
  return {
    ...createChangeWorkflowState({
      changeId: input.change.id,
      title: input.change.title,
      createdAt: input.initializedAt ?? input.change.created_at,
    }),
    projectId: input.projectId,
    initializedAt: input.initializedAt ?? input.change.created_at,
    projectionChangesDir: input.projectionChangesDir,
    ...seed,
    gates: input.gates ?? seed.gates ?? createDefaultGates(),
  };
}

function setLastSignalAt(state: ChangeWorkflowState, at: string): void {
  if (state.lastSignalAt && state.lastSignalAt > at) return;
  state.lastSignalAt = at;
}

export function applyCrossProjectCoordinationUpdatedToState(
  state: ChangeWorkflowState,
  payload: import("./contracts").CrossProjectCoordinationUpdatedSignalPayload,
): ChangeWorkflowState {
  if (payload.cross_project_links !== undefined) {
    state.cross_project_links = payload.cross_project_links;
  }
  if (payload.external_dependencies !== undefined) {
    state.external_dependencies = payload.external_dependencies;
  }
  setLastSignalAt(state, payload.updatedAt);
  return state;
}

export const SIGNAL_REJECTION_RING_BUFFER_LIMIT = 20;

export function applySignalRejectionToState(
  state: ChangeWorkflowState,
  input: {
    signalName: string;
    error: unknown;
    payload: unknown;
    rejectedAt: string;
  },
): ChangeWorkflowState {
  const error = input.error;
  const rejection: SignalRejection = {
    signalName: input.signalName,
    errorMessage: error instanceof Error ? error.message : String(error),
    errorClass:
      error instanceof Error && error.constructor?.name
        ? error.constructor.name
        : typeof error,
    payloadDigest: describePayloadDigest(input.payload),
    rejectedAt: input.rejectedAt,
  };

  const existing = state.signal_rejections ?? [];
  state.signal_rejections = [...existing, rejection].slice(
    -SIGNAL_REJECTION_RING_BUFFER_LIMIT,
  );
  state.signal_rejections_total = (state.signal_rejections_total ?? 0) + 1;
  setLastSignalAt(state, input.rejectedAt);
  return state;
}

function getMutableTask(state: ChangeWorkflowState, taskId: string): Task {
  return getTaskOrThrow(state, taskId);
}

// =============================================================================
// Layer 2 size-guard (KD-8) — state-mutation rejection
//
// Temporal docs (https://docs.temporal.io/handling-messages#exceptions)
// confirm throwing in a signal handler fails the ENTIRE workflow. ADV's
// canonical pattern (applyGateStuckToState at workflows.ts:722-732, 1098) is
// state-mutation rejection: record the rejection in state, leave the target
// state field unchanged, return state. Workflow continues; tool layer can
// observe the rejection via the next query.
//
// Layer 1 (tool/store layer) pre-checks size before any signal fires; Layer 2
// is the structural defense in case Layer 1 is bypassed (test fixtures,
// recovery flows, future code paths).
//
// Cap constants live in `types/artifacts.ts` (validated against Temporal
// 2 MB per-payload limit by the design-validation researcher).
// =============================================================================

import {
  AGGREGATE_HARD_CAP,
  ARTIFACT_HARD_CAP,
  ARTIFACT_SOFT_CAP,
} from "../types";

const utf8 = new TextEncoder();
function byteLength(content: string): number {
  return utf8.encode(content).length;
}

/**
 * Size-guard check for a single content signal. Returns:
 *   - `{ ok: true, warning? }` — content within hard cap; apply allowed.
 *     `warning` is set when soft cap exceeded (informational).
 *   - `{ ok: false, rejection }` — content exceeds hard cap; signal must
 *     NOT mutate `state.documents`. Caller records `rejection` on
 *     `state.artifacts[kind]`.
 */
function checkPerArtifactSize(
  kind: ArtifactKind,
  text: string,
  at: string,
): {
  ok: boolean;
  size: number;
  warning?: { size: number; soft_cap: number; at: string };
  rejection?: {
    reason: "ARTIFACT_OVERSIZED";
    attempted_size: number;
    cap: number;
    rejected_at: string;
  };
} {
  const size = byteLength(text);
  if (size > ARTIFACT_HARD_CAP) {
    return {
      ok: false,
      size,
      rejection: {
        reason: "ARTIFACT_OVERSIZED",
        attempted_size: size,
        cap: ARTIFACT_HARD_CAP,
        rejected_at: at,
      },
    };
  }
  if (size > ARTIFACT_SOFT_CAP) {
    return {
      ok: true,
      size,
      warning: { size, soft_cap: ARTIFACT_SOFT_CAP, at },
    };
  }
  return { ok: true, size };
}

/**
 * Aggregate-cap check projecting the proposed content onto the existing
 * `state.documents`. Returns whether applying this content would push the
 * total over `AGGREGATE_HARD_CAP`.
 */
function checkAggregateSize(
  state: ChangeWorkflowState,
  kind: ArtifactKind,
  text: string,
  at: string,
): {
  ok: boolean;
  totalBytes: number;
  rejection?: {
    reason: "AGGREGATE_OVERSIZED";
    attempted_size: number;
    cap: number;
    rejected_at: string;
  };
} {
  const projected: Record<string, string> = {
    ...(state.documents ?? {}),
    [kind]: text,
  } as Record<string, string>;
  const totalBytes = byteLength(JSON.stringify(projected));
  if (totalBytes > AGGREGATE_HARD_CAP) {
    return {
      ok: false,
      totalBytes,
      rejection: {
        reason: "AGGREGATE_OVERSIZED",
        attempted_size: totalBytes,
        cap: AGGREGATE_HARD_CAP,
        rejected_at: at,
      },
    };
  }
  return { ok: true, totalBytes };
}

/**
 * Apply size-guard checks and either:
 *   - Reject (Layer 2 state-mutation rejection): record rejection in
 *     `state.artifacts[kind]`, leave `state.documents[kind]` unchanged.
 *   - Apply: mutate `state.documents[kind]`, record soft-cap warning on
 *     `state.artifacts[kind]` if applicable.
 *
 * Shared helper used by all 6 content-signal reducers.
 */
function applyContentWithSizeGuard(
  state: ChangeWorkflowState,
  kind: ArtifactKind,
  text: string,
  at: string,
): ChangeWorkflowState {
  // Per-artifact hard cap check
  const perCheck = checkPerArtifactSize(kind, text, at);
  if (!perCheck.ok && perCheck.rejection) {
    state.artifacts = {
      ...state.artifacts,
      [kind]: {
        ...(state.artifacts[kind] ?? { path: "", updatedAt: at }),
        rejection: perCheck.rejection,
      },
    };
    setLastSignalAt(state, at);
    return state;
  }

  // Aggregate cap check (projects this content onto existing documents)
  const aggCheck = checkAggregateSize(state, kind, text, at);
  if (!aggCheck.ok && aggCheck.rejection) {
    state.artifacts = {
      ...state.artifacts,
      [kind]: {
        ...(state.artifacts[kind] ?? { path: "", updatedAt: at }),
        rejection: aggCheck.rejection,
      },
    };
    setLastSignalAt(state, at);
    return state;
  }

  // Caps passed — apply content. Clear any prior rejection; record warning
  // if soft cap exceeded.
  const existingArtifact = state.artifacts[kind] ?? {
    path: "",
    updatedAt: at,
  };
  const nextArtifact = {
    ...existingArtifact,
    rejection: undefined,
    sizeWarning: perCheck.warning,
  };
  state.documents = { ...(state.documents ?? {}), [kind]: text };
  state.artifacts = { ...state.artifacts, [kind]: nextArtifact };
  setLastSignalAt(state, at);
  return state;
}

export function applyProposalUpdatedToState(
  state: ChangeWorkflowState,
  payload: ProposalUpdatedSignalPayload,
): ChangeWorkflowState {
  return applyContentWithSizeGuard(
    state,
    "proposal",
    payload.text,
    payload.updatedAt,
  );
}

export function applyProblemStatementUpdatedToState(
  state: ChangeWorkflowState,
  payload: ProblemStatementUpdatedSignalPayload,
): ChangeWorkflowState {
  return applyContentWithSizeGuard(
    state,
    "problemStatement",
    payload.text,
    payload.updatedAt,
  );
}

export function applyAgreementUpdatedToState(
  state: ChangeWorkflowState,
  payload: AgreementUpdatedSignalPayload,
): ChangeWorkflowState {
  return applyContentWithSizeGuard(
    state,
    "agreement",
    payload.text,
    payload.updatedAt,
  );
}

export function applyDesignUpdatedToState(
  state: ChangeWorkflowState,
  payload: DesignUpdatedSignalPayload,
): ChangeWorkflowState {
  return applyContentWithSizeGuard(
    state,
    "design",
    payload.text,
    payload.updatedAt,
  );
}

export function applyExecutiveSummaryUpdatedToState(
  state: ChangeWorkflowState,
  payload: ExecutiveSummaryUpdatedSignalPayload,
): ChangeWorkflowState {
  return applyContentWithSizeGuard(
    state,
    "executiveSummary",
    payload.text,
    payload.updatedAt,
  );
}

export function applyAcceptanceUpdatedToState(
  state: ChangeWorkflowState,
  payload: AcceptanceUpdatedSignalPayload,
): ChangeWorkflowState {
  return applyContentWithSizeGuard(
    state,
    "acceptance",
    payload.text,
    payload.updatedAt,
  );
}

export function applyAcceptanceCriteriaSetToState(
  state: ChangeWorkflowState,
  payload: AcceptanceCriteriaSetSignalPayload,
): ChangeWorkflowState {
  state.acceptanceCriteria = [...payload.criteria];
  setLastSignalAt(state, payload.setAt);
  return state;
}

export function acceptanceCriteriaFromContract(
  contract: NonNullable<ChangeWorkflowState["contract"]>,
): string[] {
  return contract.items
    .filter((item) => item.kind === "acceptance_criterion")
    .map((item) => item.text);
}

export function applyContractSetToState(
  state: ChangeWorkflowState,
  payload: ContractSetSignalPayload,
): ChangeWorkflowState {
  state.contract = payload.contract;
  state.acceptanceCriteria = acceptanceCriteriaFromContract(payload.contract);
  setLastSignalAt(state, payload.updatedAt);
  return state;
}

export function applyContractAmendedToState(
  state: ChangeWorkflowState,
  payload: ContractAmendedSignalPayload,
): ChangeWorkflowState {
  if (!state.contract) {
    throw new Error("Cannot amend contract: no contract is set");
  }
  state.contract.amendments = [
    ...(state.contract.amendments ?? []),
    ...payload.amendments,
  ];
  if (
    payload.amendments.some(
      (amendment) => amendment.invalidatesReviewMatrix !== false,
    )
  ) {
    delete state.contract.reviewMatrix;
  }
  setLastSignalAt(state, payload.updatedAt);
  return state;
}

export function applyContractReviewMatrixSetToState(
  state: ChangeWorkflowState,
  payload: ContractReviewMatrixSetSignalPayload,
): ChangeWorkflowState {
  if (!state.contract) {
    throw new Error("Cannot set contract review matrix: no contract is set");
  }
  state.contract.reviewMatrix = payload.reviewMatrix;
  setLastSignalAt(state, payload.updatedAt);
  return state;
}

export function applyTaskAddedToState(
  state: ChangeWorkflowState,
  payload: TaskAddedSignalPayload,
): ChangeWorkflowState {
  const existingIndex = state.tasks.findIndex(
    (task) => task.id === payload.task.id,
  );
  if (existingIndex >= 0) {
    state.tasks[existingIndex] = payload.task;
  } else {
    state.tasks.push(payload.task);
  }
  setLastSignalAt(state, payload.addedAt);
  return state;
}

export function applyTaskUpdatedToState(
  state: ChangeWorkflowState,
  payload: TaskUpdatedSignalPayload,
): ChangeWorkflowState {
  const task = getMutableTask(state, payload.taskId);
  Object.assign(task, payload.partial);
  (task as Task & { updatedAt?: string }).updatedAt = payload.updatedAt;
  setLastSignalAt(state, payload.updatedAt);
  return state;
}

export function applyTaskRemovedToState(
  state: ChangeWorkflowState,
  payload: TaskRemovedSignalPayload,
): ChangeWorkflowState {
  state.tasks = state.tasks.filter((task) => task.id !== payload.taskId);
  setLastSignalAt(state, payload.removedAt);
  return state;
}

export function applyTaskAssignedToState(
  state: ChangeWorkflowState,
  payload: TaskAssignedSignalPayload,
): ChangeWorkflowState {
  const task = getMutableTask(state, payload.taskId);
  task.status = "in_progress";
  task.assignedTo = payload.sessionId;
  task.started_at = task.started_at ?? payload.assignedAt;
  setLastSignalAt(state, payload.assignedAt);
  return state;
}

export function applyTaskCompletedToState(
  state: ChangeWorkflowState,
  payload: TaskCompletedSignalPayload,
): ChangeWorkflowState {
  const task = getMutableTask(state, payload.taskId);
  const existingFiles = task.filesTouched ?? task.touched_files ?? [];
  const incomingWouldWeakenCheckpoint =
    task.status === "done" &&
    ((Boolean(task.checkpointSha) && !payload.checkpointSha) ||
      (existingFiles.length > 0 && payload.filesTouched.length === 0));

  if (incomingWouldWeakenCheckpoint) {
    setLastSignalAt(state, payload.completedAt);
    return state;
  }

  task.status = "done";
  task.verification = payload.verification;
  task.summary = payload.summary;
  task.implementation_summary = payload.summary;
  task.filesTouched = [...payload.filesTouched];
  task.touched_files = [...payload.filesTouched];
  task.checkpointSha = payload.checkpointSha;
  task.completedAt = payload.completedAt;
  task.completed_at = payload.completedAt;
  if (payload.structured_output) {
    task.structured_output = payload.structured_output;
  }
  setLastSignalAt(state, payload.completedAt);
  return state;
}

function assertNeverSubagentReport(report: never): never {
  throw new Error(`Unsupported sub-agent report in blocker summary: ${report}`);
}

function blockerSummary(
  report: SubagentReportSubmittedSignalPayload["report"],
): { summary: string; diagnosis: string } | null {
  switch (report.agent) {
    case "adv-engineer":
    case "adv-designer":
      if (report.blockers.length === 0) return null;
      return {
        summary: report.blockers
          .map((blocker) =>
            [blocker.file, blocker.line ? `:${blocker.line}` : "", blocker.what]
              .filter(Boolean)
              .join(" "),
          )
          .join("; "),
        diagnosis: report.blockers
          .map((blocker) => blocker.diagnosis)
          .join("; "),
      };

    case "adv-reviewer":
      if (report.blocking_findings.length === 0) return null;
      return {
        summary: report.blocking_findings
          .map((finding) =>
            [finding.file, finding.line ? `:${finding.line}` : "", finding.what]
              .filter(Boolean)
              .join(" "),
          )
          .join("; "),
        diagnosis: report.blocking_findings
          .map((finding) => finding.why)
          .join("; "),
      };

    case "adv-researcher":
    case "adv-tron":
    case "adv-scanner-bundle":
      return null;

    default: {
      const exhaustive: never = report;
      return assertNeverSubagentReport(exhaustive);
    }
  }
}

function taskIdFromReport(
  report: SubagentReportSubmittedSignalPayload["report"],
): string | undefined {
  if (typeof report.scope !== "string" && report.scope.kind === "task") {
    return report.scope.task_id;
  }
  return "task_id" in report ? report.task_id : undefined;
}

function reportKey(
  report: SubagentReportSubmittedSignalPayload["report"],
): string {
  return subagentReportKey({
    changeId: report.change_id,
    taskId: taskIdFromReport(report),
    scope: typeof report.scope === "string" ? undefined : report.scope,
    agent: report.agent,
    attempt: report.attempt,
  });
}

export function applySubagentReportSubmittedToState(
  state: ChangeWorkflowState,
  payload: SubagentReportSubmittedSignalPayload,
): ChangeWorkflowState {
  const taskId = payload.taskId ?? taskIdFromReport(payload.report);
  const task = taskId ? getMutableTask(state, taskId) : undefined;
  const taskScoped =
    typeof payload.report.scope === "string" ||
    payload.report.scope.kind === "task";
  const reportId = reportKey(payload.report);
  const seenReportIds = state.seenReportIds ?? [];
  const alreadyStoredInSidecar = (state.subagent_reports ?? []).some(
    (report) => reportKey(report) === reportId,
  );
  const alreadyStoredOnTask = (task?.subagent_reports ?? []).some(
    (report) => reportKey(report) === reportId,
  );

  if (seenReportIds.includes(reportId) || alreadyStoredInSidecar) {
    state.seenReportIds = seenReportIds.includes(reportId)
      ? seenReportIds
      : [...seenReportIds, reportId];
    if (task && taskScoped && !alreadyStoredOnTask) {
      task.subagent_reports = [
        ...(task.subagent_reports ?? []),
        payload.report as NonNullable<Task["subagent_reports"]>[number],
      ];
    }
    setLastSignalAt(state, payload.submittedAt);
    return state;
  }

  state.subagent_reports = [...(state.subagent_reports ?? []), payload.report];
  if (task && taskScoped && !alreadyStoredOnTask) {
    task.subagent_reports = [
      ...(task.subagent_reports ?? []),
      payload.report as NonNullable<Task["subagent_reports"]>[number],
    ];
  }
  state.seenReportIds = [...seenReportIds, reportId];

  const blockers = blockerSummary(payload.report);
  if (task && blockers) {
    task.error_recovery = {
      last_error: blockers.summary,
      retry_count: payload.report.attempt,
      max_retries: 3,
      error_class: "SEMANTIC",
      next_strategy: "Resolve sub-agent reported blocker",
      attempts: [
        ...(task.error_recovery?.attempts ?? []),
        {
          attempt_number: payload.report.attempt,
          error: blockers.summary,
          diagnosis: blockers.diagnosis,
          fix_tried: "Sub-agent report submission recorded blocker",
          strategy_label: `${payload.report.agent}-reported-blocker`,
          outcome: "failed",
          attempted_at: payload.submittedAt,
        },
      ],
    };
  }

  setLastSignalAt(state, payload.submittedAt);
  return state;
}

export function applyTaskBlockedToState(
  state: ChangeWorkflowState,
  payload: TaskBlockedSignalPayload,
): ChangeWorkflowState {
  const task = getMutableTask(state, payload.taskId);
  task.status = "blocked";
  task.blockReason = payload.reason;
  task.attempts = [...payload.attempts];
  setLastSignalAt(state, payload.blockedAt);
  return state;
}

export function applyTaskCancelledToState(
  state: ChangeWorkflowState,
  payload: TaskCancelledSignalPayload,
): ChangeWorkflowState {
  const task = getMutableTask(state, payload.taskId);
  task.status = "cancelled";
  task.cancelApproval = payload.approvalEvidence;
  task.cancelledAt = payload.cancelledAt;
  task.completed_at = payload.cancelledAt;
  task.cancellation = {
    reason: payload.reason,
    approved_by_user: true,
    approval_evidence: payload.approvalEvidence,
    approved_at: payload.cancelledAt,
  };
  setLastSignalAt(state, payload.cancelledAt);
  return state;
}

export function applyGateInProgressToState(
  state: ChangeWorkflowState,
  payload: GateInProgressSignalPayload,
): ChangeWorkflowState {
  state.gates[payload.gateId] = {
    ...state.gates[payload.gateId],
    status: "in_progress",
    started_at: payload.triggeredAt,
    triggered_by: payload.triggeredBy,
  };
  setLastSignalAt(state, payload.triggeredAt);
  return state;
}

export function applyGateAwaitingApprovalToState(
  state: ChangeWorkflowState,
  payload: GateAwaitingApprovalSignalPayload,
): ChangeWorkflowState {
  state.gates[payload.gateId] = {
    ...state.gates[payload.gateId],
    status: "awaiting_approval",
    approval_evidence: payload.evidence,
    started_at: payload.triggeredAt,
  };
  setLastSignalAt(state, payload.triggeredAt);
  return state;
}

export function applyGateStuckToState(
  state: ChangeWorkflowState,
  payload: GateStuckSignalPayload,
): ChangeWorkflowState {
  state.gates[payload.gateId] = {
    ...state.gates[payload.gateId],
    status: "stuck",
    stuck_reason: payload.reason,
    readiness_blockers: payload.readinessBlockers,
    started_at: payload.triggeredAt,
  };
  setLastSignalAt(state, payload.triggeredAt);
  return state;
}

export function applyGateCompletedToState(
  state: ChangeWorkflowState,
  payload: GateCompletedSignalPayload,
): ChangeWorkflowState {
  state.gates[payload.gateId] = {
    ...state.gates[payload.gateId],
    status: "done",
    stuck_reason: undefined,
    readiness_blockers: undefined,
    completed_at: payload.completedAt,
    completed_by: payload.completedBy,
    approval_evidence: payload.approvalEvidence,
    artifact_evidence: payload.artifactEvidence,
  };
  setLastSignalAt(state, payload.completedAt);
  return state;
}

export function applyGateReenteredToState(
  state: ChangeWorkflowState,
  payload: GateReenteredSignalPayload,
): ChangeWorkflowState {
  if (state.contract && payload.fromGateId !== "release") {
    delete state.contract.reviewMatrix;
  }
  reopenFromGateInChangeState(state, payload.fromGateId, {
    now: payload.reenteredAt,
    reason: payload.reason,
    scopeDelta: payload.scopeDelta,
    reopenedBy: payload.reenteredBy,
  });
  setLastSignalAt(state, payload.reenteredAt);
  return state;
}

export function applyWisdomAddedToState(
  state: ChangeWorkflowState,
  payload: WisdomAddedSignalPayload,
): ChangeWorkflowState {
  state.wisdom.push(payload.entry);
  setLastSignalAt(state, payload.addedAt);
  return state;
}

export function applyReflectionRecordedToState(
  state: ChangeWorkflowState,
  payload: ReflectionRecordedSignalPayload,
): ChangeWorkflowState {
  state.reflections = [...(state.reflections ?? []), payload.report];
  setLastSignalAt(state, payload.recordedAt);
  return state;
}

export function applyWorktreeCreatedToState(
  state: ChangeWorkflowState,
  payload: WorktreeCreatedSignalPayload,
): ChangeWorkflowState {
  state.worktrees = {
    ...(state.worktrees ?? {}),
    [payload.branch]: { ...payload, status: "created" },
  };
  setLastSignalAt(state, payload.createdAt);
  return state;
}

export function applyWorktreeDeletedToState(
  state: ChangeWorkflowState,
  payload: WorktreeDeletedSignalPayload,
): ChangeWorkflowState {
  state.worktrees = {
    ...(state.worktrees ?? {}),
    [payload.branch]: {
      ...(state.worktrees?.[payload.branch] ?? { branch: payload.branch }),
      status: "deleted",
      deletedAt: payload.deletedAt,
      deleteReason: payload.reason,
    },
  };
  setLastSignalAt(state, payload.deletedAt);
  return state;
}

/**
 * rq-autoManageAdvWorktrees AC3 — stamp/migrate worktree_auto_managed.
 *
 * Sticky semantics: once `state.worktree_auto_managed` is set to a
 * boolean, subsequent signals are ignored. This protects both the
 * create-time stamp (true) and the lazy migration (false) from being
 * overwritten by an out-of-order or retried signal.
 */
export function applyWorktreeAutoManagedToState(
  state: ChangeWorkflowState,
  payload: WorktreeAutoManagedSignalPayload,
): ChangeWorkflowState {
  if (typeof state.worktree_auto_managed === "boolean") {
    // Sticky — ignore; the first boolean wins.
    return state;
  }
  state.worktree_auto_managed = payload.value;
  setLastSignalAt(state, payload.recordedAt);
  return state;
}

/**
 * rq-autoManageAdvWorktrees AC4 — project a worktree path onto the
 * change record for cross-project / scope_repos routing convenience.
 *
 * Idempotent: writing the same value twice is a no-op (no state churn).
 * Differing values overwrite — the ensure-helper guarantees the new
 * value reflects the canonical registry post-create or post-cleanup.
 */
export function applyWorktreeAttachedToState(
  state: ChangeWorkflowState,
  payload: WorktreeAttachedSignalPayload,
): ChangeWorkflowState {
  switch (payload.role) {
    case "target": {
      if (state.target_worktree_path === payload.path) return state;
      state.target_worktree_path = payload.path;
      break;
    }
    case "scope": {
      if (!payload.repoId) {
        // Defensive: scope role requires repoId; skip without mutating.
        return state;
      }
      const current = state.scope_worktrees ?? {};
      if (payload.path === null) {
        if (!(payload.repoId in current)) return state;
        const next = { ...current };
        delete next[payload.repoId];
        state.scope_worktrees = next;
        break;
      }
      if (current[payload.repoId] === payload.path) return state;
      state.scope_worktrees = { ...current, [payload.repoId]: payload.path };
      break;
    }
    case "current": {
      // Current-repo worktree state lives in state.worktrees today (via
      // worktreeCreatedSignal). The attached signal with role:"current"
      // is reserved for future parity with target/scope — no-op for now
      // so the helper module can fire uniformly across roles without
      // double-writing the worktrees registry.
      return state;
    }
  }
  setLastSignalAt(state, payload.recordedAt);
  return state;
}

export function applyConformanceLockedToState(
  state: ChangeWorkflowState,
  payload: ConformanceLockedSignalPayload,
): ChangeWorkflowState {
  state.conformance = {
    ...(state.conformance ?? {}),
    lockedSpecs: [...payload.specs],
    lockedAt: payload.lockedAt,
    overrides: state.conformance?.overrides ?? [],
  };
  setLastSignalAt(state, payload.lockedAt);
  return state;
}

export function applyConformanceVerdictToState(
  state: ChangeWorkflowState,
  payload: ConformanceVerdictSignalPayload,
): ChangeWorkflowState {
  state.conformance = {
    ...(state.conformance ?? { overrides: [] }),
    lastVerdict: {
      verdict: payload.verdict,
      runId: payload.runId,
      failed: payload.failed,
      recordedAt: payload.recordedAt,
    },
  };
  setLastSignalAt(state, payload.recordedAt);
  return state;
}

export function applyConformanceOverriddenToState(
  state: ChangeWorkflowState,
  payload: ConformanceOverriddenSignalPayload,
): ChangeWorkflowState {
  state.conformance = {
    ...(state.conformance ?? {}),
    overrides: [
      ...(state.conformance?.overrides ?? []),
      {
        user: payload.user,
        reason: payload.reason,
        reVerifyDeadline: payload.reVerifyDeadline,
        overriddenAt: payload.overriddenAt,
      },
    ],
  };
  setLastSignalAt(state, payload.overriddenAt);
  return state;
}

export function applyArchiveRequestedToState(
  state: ChangeWorkflowState,
  payload: ArchiveRequestedSignalPayload,
): ChangeWorkflowState {
  state.status = "archived";
  state.terminated = true;
  state.archiveRequest = payload;
  setLastSignalAt(state, payload.requestedAt);
  return state;
}

export function applyChangeCancelledToState(
  state: ChangeWorkflowState,
  payload: ChangeCancelledSignalPayload,
): ChangeWorkflowState {
  state.status = "closed";
  state.terminated = true;
  state.closure = {
    reason: payload.supersededBy ? "superseded" : "cancelled",
    approved_by_user: true,
    approval_evidence: payload.approvalEvidence,
    approved_at: payload.cancelledAt,
    superseded_by: payload.supersededBy,
  };
  setLastSignalAt(state, payload.cancelledAt);
  return state;
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
  const fromIndex = GATE_ORDER.indexOf(fromGate);
  if (fromIndex < 0) return state;

  for (const gateId of GATE_ORDER.slice(fromIndex)) {
    state.gates[gateId] = { status: "pending" };
  }

  const gatesReset = GATE_ORDER.slice(fromIndex);
  state.reentry_history = [
    ...(state.reentry_history ?? []),
    {
      from_gate: fromGate,
      reason: input.reason,
      ...(input.scopeDelta ? { scope_delta: input.scopeDelta } : {}),
      reopened_by: input.reopenedBy ?? "agent",
      ...(input.approvalEvidence
        ? { approval_evidence: input.approvalEvidence }
        : {}),
      reopened_at: input.now,
      gates_reset: gatesReset,
    },
  ];

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
