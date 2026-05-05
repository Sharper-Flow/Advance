import {
  GATE_ORDER,
  type Change,
  type GateCompletion,
  type GateId,
  type Task,
} from "../types";
import type { ChangeWorkflowState } from "./contracts";
import {
  agreementUpdatedSignal,
  designUpdatedSignal,
  gateAwaitingApprovalSignal,
  gateCompletedSignal,
  gateInProgressSignal,
  gateStuckSignal,
  getProcessedMarkersQuery,
  migrationMarkerSignal,
  problemStatementUpdatedSignal,
  proposalUpdatedSignal,
  taskAddedSignal,
  taskAssignedSignal,
  taskBlockedSignal,
  taskCancelledSignal,
  taskCompletedSignal,
  wisdomAddedSignal,
} from "./messages";

export interface MigrationDocuments {
  proposal?: string;
  problemStatement?: string;
  agreement?: string;
  design?: string;
}

export type MigrationReplayStep =
  | { kind: "signal"; name: string; payload: unknown }
  | { kind: "marker"; name: string; markerId: string };

export interface MigrationSignalHandle {
  signal: (definition: unknown, payload: unknown) => Promise<void>;
  query: (definition: unknown) => Promise<unknown>;
}

export interface MigrationRoundTripReport {
  ok: boolean;
  unexpectedLosses: string[];
  acceptableLosses: string[];
  source: {
    taskCount: number;
    statusCounts: Record<string, number>;
    wisdomCount: number;
    documents: string[];
  };
  replayed: {
    taskCount: number;
    statusCounts: Record<string, number>;
    wisdomCount: number;
    documents: string[];
  };
}

const ACCEPTABLE_LOSSES = [
  "per-phase TDD evidence text folded into verification placeholders",
  "per-attempt error_recovery on completed/cancelled tasks not replayed as workflow history",
  "v1 workflow event history is not represented in the signal-state model",
  "seenIdempotencyKeys intentionally dropped",
];

function nowIso(): string {
  return new Date().toISOString();
}

function firstTimestamp(...values: Array<string | null | undefined>): string {
  return values.find((value): value is string => Boolean(value)) ?? nowIso();
}

function countTaskStatuses(tasks: Task[]): Record<string, number> {
  return tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1;
    return acc;
  }, {});
}

function documentKeys(documents: MigrationDocuments): string[] {
  return (["proposal", "problemStatement", "agreement", "design"] as const)
    .filter((key) => typeof documents[key] === "string")
    .map(String);
}

function baseTaskForReplay(task: Task): Task {
  const {
    assignedTo: _assignedTo,
    attempts: _attempts,
    blockReason: _blockReason,
    cancelApproval: _cancelApproval,
    cancellation: _cancellation,
    cancelledAt: _cancelledAt,
    checkpointSha: _checkpointSha,
    completedAt: _completedAt,
    completed_at: _completedAtLegacy,
    completed_by: _completedBy,
    filesTouched: _filesTouched,
    implementation_summary: _implementationSummary,
    started_at: _startedAt,
    summary: _summary,
    touched_files: _touchedFiles,
    verification: _verification,
    ...rest
  } = task;

  return {
    ...rest,
    status: "pending",
  };
}

function taskLifecycleSignals(task: Task): MigrationReplayStep[] {
  const steps: MigrationReplayStep[] = [
    {
      kind: "signal",
      name: "taskAdded",
      payload: { task: baseTaskForReplay(task), addedAt: task.created_at },
    },
  ];

  if (task.status === "pending") return steps;
  if (task.status === "in_progress") {
    steps.push({
      kind: "signal",
      name: "taskAssigned",
      payload: {
        taskId: task.id,
        sessionId: task.assignedTo ?? task.completed_by ?? "migration",
        assignedAt: firstTimestamp(task.started_at, task.created_at),
      },
    });
    return steps;
  }
  if (task.status === "blocked") {
    steps.push({
      kind: "signal",
      name: "taskBlocked",
      payload: {
        taskId: task.id,
        reason:
          task.blockReason ??
          task.error_recovery?.last_error ??
          "Migrated blocked task",
        attempts: task.attempts ?? task.error_recovery?.attempts ?? [],
        blockedAt: firstTimestamp(task.started_at, task.created_at),
      },
    });
    return steps;
  }
  if (task.status === "done") {
    steps.push({
      kind: "signal",
      name: "taskCompleted",
      payload: {
        taskId: task.id,
        verification:
          task.verification ??
          "Migrated from v1 state (per-phase TDD evidence folded into placeholder)",
        summary:
          task.summary ??
          task.implementation_summary ??
          "Migrated completed task",
        filesTouched: task.touched_files ?? task.filesTouched ?? [],
        checkpointSha: task.checkpointSha,
        completedAt: firstTimestamp(
          task.completedAt,
          task.completed_at,
          task.started_at,
          task.created_at,
        ),
      },
    });
    return steps;
  }

  steps.push({
    kind: "signal",
    name: "taskCancelled",
    payload: {
      taskId: task.id,
      approvalEvidence:
        task.cancellation?.approval_evidence ??
        task.cancelApproval ??
        "Migrated v1 cancellation approval evidence unavailable",
      reason: task.cancellation?.reason ?? "Migrated cancelled task",
      cancelledAt: firstTimestamp(
        task.cancelledAt,
        task.completed_at,
        task.cancellation?.approved_at,
        task.created_at,
      ),
    },
  });
  return steps;
}

function gateSignal(
  gateId: GateId,
  gate: GateCompletion,
): MigrationReplayStep | null {
  if (gate.status === "done") {
    return {
      kind: "signal",
      name: `gateCompleted:${gateId}`,
      payload: {
        gateId,
        approvalEvidence: gate.approval_evidence ?? gate.notes,
        completedBy: gate.completed_by ?? "migration",
        completedAt: firstTimestamp(gate.completed_at, gate.started_at),
      },
    };
  }
  if (gate.status === "in_progress") {
    return {
      kind: "signal",
      name: `gateInProgress:${gateId}`,
      payload: {
        gateId,
        triggeredBy: gate.triggered_by ?? "migration",
        triggeredAt: firstTimestamp(gate.started_at),
      },
    };
  }
  if (gate.status === "awaiting_approval") {
    return {
      kind: "signal",
      name: `gateAwaitingApproval:${gateId}`,
      payload: {
        gateId,
        evidence:
          gate.approval_evidence ??
          gate.notes ??
          "Migrated gate awaiting approval",
        triggeredAt: firstTimestamp(gate.started_at, gate.completed_at),
      },
    };
  }
  if (gate.status === "stuck") {
    return {
      kind: "signal",
      name: `gateStuck:${gateId}`,
      payload: {
        gateId,
        reason: gate.stuck_reason ?? gate.notes ?? "Migrated stuck gate",
        triggeredAt: firstTimestamp(gate.started_at, gate.completed_at),
      },
    };
  }
  return null;
}

export function buildMigrationReplayPlan(
  change: Change,
  documents: MigrationDocuments = {},
): MigrationReplayStep[] {
  const prefix = `migration-${change.id}`;
  const steps: MigrationReplayStep[] = [];

  if (documents.proposal) {
    steps.push({
      kind: "signal",
      name: "proposalUpdated",
      payload: {
        text: documents.proposal,
        updatedBy: "migration",
        updatedAt: change.created_at,
      },
    });
  }
  if (documents.problemStatement) {
    steps.push({
      kind: "signal",
      name: "problemStatementUpdated",
      payload: {
        text: documents.problemStatement,
        updatedBy: "migration",
        updatedAt: change.created_at,
      },
    });
  }
  if (documents.agreement) {
    steps.push({
      kind: "signal",
      name: "agreementUpdated",
      payload: {
        text: documents.agreement,
        updatedBy: "migration",
        updatedAt: change.created_at,
      },
    });
  }
  if (documents.design) {
    steps.push({
      kind: "signal",
      name: "designUpdated",
      payload: {
        text: documents.design,
        updatedBy: "migration",
        updatedAt: change.created_at,
      },
    });
  }
  steps.push({ kind: "marker", name: "docs", markerId: `${prefix}-docs` });

  for (const task of change.tasks ?? []) {
    steps.push(...taskLifecycleSignals(task));
  }
  steps.push({ kind: "marker", name: "tasks", markerId: `${prefix}-tasks` });

  for (const gateId of GATE_ORDER) {
    const gate = change.gates?.[gateId];
    if (gate) {
      const signal = gateSignal(gateId, gate);
      if (signal) steps.push(signal);
    }
    steps.push({
      kind: "marker",
      name: `gate-${gateId}`,
      markerId: `${prefix}-gate-${gateId}`,
    });
  }

  for (const entry of change.wisdom ?? []) {
    steps.push({
      kind: "signal",
      name: "wisdomAdded",
      payload: { entry, addedAt: entry.recorded_at },
    });
  }
  steps.push({ kind: "marker", name: "wisdom", markerId: `${prefix}-wisdom` });
  steps.push({ kind: "marker", name: "final", markerId: `${prefix}-final` });
  return steps;
}

async function applySignalStep(
  handle: MigrationSignalHandle,
  step: Extract<MigrationReplayStep, { kind: "signal" }>,
): Promise<void> {
  const signalName = step.name.split(":")[0];
  const definitionByName: Record<string, unknown> = {
    agreementUpdated: agreementUpdatedSignal,
    designUpdated: designUpdatedSignal,
    gateAwaitingApproval: gateAwaitingApprovalSignal,
    gateCompleted: gateCompletedSignal,
    gateInProgress: gateInProgressSignal,
    gateStuck: gateStuckSignal,
    problemStatementUpdated: problemStatementUpdatedSignal,
    proposalUpdated: proposalUpdatedSignal,
    taskAdded: taskAddedSignal,
    taskAssigned: taskAssignedSignal,
    taskBlocked: taskBlockedSignal,
    taskCancelled: taskCancelledSignal,
    taskCompleted: taskCompletedSignal,
    wisdomAdded: wisdomAddedSignal,
  };
  const definition = definitionByName[signalName];
  if (!definition)
    throw new Error(`No migration signal binding for ${step.name}`);
  await handle.signal(definition, step.payload);
}

export async function signalMigrationMarkerAndWait(
  handle: MigrationSignalHandle,
  markerId: string,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
    signalFirst?: boolean;
  } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pollIntervalMs = options.pollIntervalMs ?? 50;
  if (options.signalFirst !== false) {
    await handle.signal(migrationMarkerSignal, { markerId });
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const markers = (await handle.query(getProcessedMarkersQuery)) as string[];
    if (markers.includes(markerId)) return;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(
    `Migration marker ${markerId} not seen within ${timeoutMs}ms`,
  );
}

export async function replayChangeAsSignals(
  handle: MigrationSignalHandle,
  change: Change,
  documents: MigrationDocuments = {},
): Promise<MigrationReplayStep[]> {
  const plan = buildMigrationReplayPlan(change, documents);
  for (const step of plan) {
    if (step.kind === "marker") {
      await signalMigrationMarkerAndWait(handle, step.markerId);
    } else {
      await applySignalStep(handle, step);
    }
  }
  return plan;
}

export function validateMigrationRoundTrip(
  source: Change,
  replayed: ChangeWorkflowState,
  documents: MigrationDocuments = {},
): MigrationRoundTripReport {
  const unexpectedLosses: string[] = [];
  const sourceStatusCounts = countTaskStatuses(source.tasks ?? []);
  const replayedStatusCounts = countTaskStatuses(replayed.tasks ?? []);
  const sourceDocuments = documentKeys(documents);
  const replayedDocuments = documentKeys(replayed.documents ?? {});

  if ((source.tasks ?? []).length !== replayed.tasks.length) {
    unexpectedLosses.push(
      `task count mismatch: source=${(source.tasks ?? []).length} replayed=${replayed.tasks.length}`,
    );
  }
  for (const status of new Set([
    ...Object.keys(sourceStatusCounts),
    ...Object.keys(replayedStatusCounts),
  ])) {
    if (
      (sourceStatusCounts[status] ?? 0) !== (replayedStatusCounts[status] ?? 0)
    ) {
      unexpectedLosses.push(
        `task status mismatch for ${status}: source=${sourceStatusCounts[status] ?? 0} replayed=${replayedStatusCounts[status] ?? 0}`,
      );
    }
  }
  for (const gateId of GATE_ORDER) {
    const sourceStatus = source.gates?.[gateId]?.status ?? "pending";
    const replayedStatus = replayed.gates[gateId]?.status ?? "pending";
    if (sourceStatus !== replayedStatus) {
      unexpectedLosses.push(
        `gate ${gateId} mismatch: source=${sourceStatus} replayed=${replayedStatus}`,
      );
    }
  }
  if ((source.wisdom ?? []).length !== replayed.wisdom.length) {
    unexpectedLosses.push(
      `wisdom count mismatch: source=${(source.wisdom ?? []).length} replayed=${replayed.wisdom.length}`,
    );
  }
  for (const key of sourceDocuments) {
    if (!replayedDocuments.includes(key)) {
      unexpectedLosses.push(`document ${key} missing after replay`);
    }
  }

  return {
    ok: unexpectedLosses.length === 0,
    unexpectedLosses,
    acceptableLosses: ACCEPTABLE_LOSSES,
    source: {
      taskCount: (source.tasks ?? []).length,
      statusCounts: sourceStatusCounts,
      wisdomCount: (source.wisdom ?? []).length,
      documents: sourceDocuments,
    },
    replayed: {
      taskCount: replayed.tasks.length,
      statusCounts: replayedStatusCounts,
      wisdomCount: replayed.wisdom.length,
      documents: replayedDocuments,
    },
  };
}
