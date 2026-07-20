import type {
  AcceptanceCriteriaSetSignalPayload,
  AgreementUpdatedSignalPayload,
  ArchiveRequestedSignalPayload,
  Cancellation,
  Change,
  ChangeCancelledSignalPayload,
  ChangeLifecycleState,
  ChangeStatus,
  AcceptanceUpdatedSignalPayload,
  ChangeClosure,
  ContractAmendedSignalPayload,
  ContractReviewMatrixSetSignalPayload,
  ContractSetSignalPayload,
  DesignConcernDispositionedSignalPayload,
  VerificationEvidenceDispositionedSignalPayload,
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
  EpicMembershipClearedSignalPayload,
  EpicMembershipSetSignalPayload,
  OpsEvidenceAppendedSignalPayload,
  OpsFollowupLinkAddedSignalPayload,
  OpsFollowupSeededSignalPayload,
  OpsRunEvidenceAppendedSignalPayload,
  OpsRunUpsertedSignalPayload,
  OriginRepairedSignalPayload,
  LightweightProfileEvaluatedSignalPayload,
  LightweightProfileRequestedSignalPayload,
  ProblemStatementUpdatedSignalPayload,
  ProposalUpdatedSignalPayload,
  ReflectionRecordedSignalPayload,
  SpecDeltaAddedSignalPayload,
  SpecDeltaModifiedSignalPayload,
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
  TestRunRecordedSignalPayload,
  WisdomAddedSignalPayload,
  WisdomType,
  WorktreeAttachedSignalPayload,
  WorktreeAutoManagedSignalPayload,
  WorktreeCreatedSignalPayload,
  WorktreeDeletedSignalPayload,
  WorktreeSetupFailedSignalPayload,
} from "../types";
import {
  createDefaultGates,
  GATE_ORDER,
  SpecDeltaModifiedSignalPayloadSchema,
} from "../types";
import { CAPABILITY_KEY_PATTERN } from "../types/specs";
import {
  normalizePersistedSubagentReportState,
  normalizeLegacyChangeStatus,
} from "../types";
import {
  subagentReportImplementationCycleId,
  subagentReportKey,
} from "../types/subagent-reports";
import {
  resolveTaskEvidence,
  validateTaskEvidenceForStage,
} from "../validator/task-classifier";
import { describePayloadDigest } from "./digest";
import type {
  ArtifactKind,
  ArtifactMetadata,
  ChangeWorkflowInput,
  ChangeWorkflowState,
  MutationReceipt,
  SignalRejection,
  TestRunRecord,
} from "./contracts";
import { MUTATION_RECEIPTS_FIFO_LIMIT } from "./contracts";

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

// rq-changeLifecycleState01: change lifecycle state (open/archived/closed) is
// tracked separately from gate progress and compatibility status.
export function normalizeChangeLifecycleState(
  status: ChangeStatus | ChangeLifecycleState | undefined,
): ChangeLifecycleState {
  // rq-changeLifecycleState01: lifecycle state is the durable open/terminal
  // claim, separate from compatibility `status` values such as draft/active.
  if (status === "archived" || status === "closed") return status;
  return "open";
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
  };
}

export function changeSeedStateFromChange(
  change: Change,
): NonNullable<ChangeWorkflowInput["seedState"]> {
  const [normalizedChange] = normalizePersistedSubagentReportState(change);
  const safeChange = normalizedChange as Change;
  // Legacy stored statuses ("active"/"pending") never reach workflow state:
  // they normalize to "draft" (the open status) at the seed boundary.
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
    artifacts: (safeChange.artifacts as ChangeWorkflowState["artifacts"]) ?? {},
    fast_follow_of: safeChange.fast_follow_of,
    affectedProjects: safeChange.affectedProjects,
    affectedPaths: safeChange.affectedPaths,
    lastSignalAt: safeChange.lastSignalAt,
    acceptanceCriteria: safeChange.acceptanceCriteria,
    contract: safeChange.contract,
    acceptanceReadinessRevision: safeChange.acceptanceReadinessRevision,
    acceptanceCriteriaSnapshot: safeChange.acceptanceCriteriaSnapshot,
    documents: safeChange.documents,
    origin: safeChange.origin,
    cross_project_origin: safeChange.cross_project_origin,
    cross_project_links: safeChange.cross_project_links,
    external_dependencies: safeChange.external_dependencies,
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

/**
 * Build a `ChangeWorkflowState` suitable for `deriveWorkflowDirective` from a
 * disk `Change` projection. Preserves the directive-relevant sidecar fields
 * (`pendingCheckpoint`, `terminated`) that `changeToWorkflowState`'s seed
 * projection drops, so tool-layer consumers (gate status, status enrichment)
 * derive the same directive the workflow's `getDirectiveQuery` would.
 *
 * No persistence, no caching — equal inputs yield equal output.
 */
export function changeToDirectiveState(input: {
  projectId: string;
  change: Change;
  gates?: ChangeWorkflowState["gates"];
}): ChangeWorkflowState {
  const state = changeToWorkflowState(input);
  state.pendingCheckpoint = input.change.pendingCheckpoint;
  state.terminated = input.change.terminated;
  return state;
}

function setLastSignalAt(state: ChangeWorkflowState, at: string): void {
  if (state.lastSignalAt && state.lastSignalAt > at) return;
  state.lastSignalAt = at;
}

function advanceAcceptanceReadinessRevision(state: ChangeWorkflowState): void {
  state.acceptanceReadinessRevision =
    (state.acceptanceReadinessRevision ?? 0) + 1;
}

/**
 * rq-readinessMutationReceipt01: prepend a mutation receipt to
 * `state.mutationReceipts` (most recent first), then cap the FIFO at
 * {@link MUTATION_RECEIPTS_FIFO_LIMIT}. Callers invoke this AFTER the
 * reducer has applied a readiness-affecting mutation, so the receipt
 * is the structural proof that state mutation completed. No-ops when
 * the caller did not supply a `mutationReceiptId`, preserving legacy
 * compatibility (signal handler behavior is unchanged for callers that
 * omit the field).
 *
 * The reducer is responsible for invocation timing — receipt recording
 * belongs to the same reducer pass that applied the mutation. Callers
 * must not invoke this from background or unrelated code paths.
 */
export function recordMutationReceipt(
  state: ChangeWorkflowState,
  input: {
    signalName: string;
    mutationReceiptId?: string;
    recordedAt: string;
  },
): void {
  if (!input.mutationReceiptId) return;
  const receipt: MutationReceipt = {
    id: input.mutationReceiptId,
    signalName: input.signalName,
    recordedAt: input.recordedAt,
  };
  const existing = state.mutationReceipts ?? [];
  const next = [receipt, ...existing].slice(0, MUTATION_RECEIPTS_FIFO_LIMIT);
  state.mutationReceipts = next;
}

/**
 * rq-readinessMutationReceipt01: query-side helper that finds a receipt
 * by id in the bounded FIFO. Returns the matching receipt or undefined
 * when the id is not present (yet). Pure read — safe to call from any
 * query handler, including the `getMutationReceipts` query itself.
 */
export function findMutationReceipt(
  state: ChangeWorkflowState,
  mutationReceiptId: string,
): MutationReceipt | undefined {
  const receipts = state.mutationReceipts ?? [];
  return receipts.find((r) => r.id === mutationReceiptId);
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

/**
 * rq-activeOriginRepair01: apply an audited origin repair to workflow state.
 * Updates state.origin and persists the audit payload in the workflow signal
 * history. Previous origin is captured when provided so callers can surface
 * before/after evidence.
 */
export function applyOriginRepairedToState(
  state: ChangeWorkflowState,
  payload: OriginRepairedSignalPayload,
): ChangeWorkflowState {
  state.origin = payload.origin;
  setLastSignalAt(state, payload.repairedAt);
  return state;
}

export const SIGNAL_REJECTION_RING_BUFFER_LIMIT = 20;
export const SEEN_REPORT_IDS_RING_BUFFER_LIMIT = 200;

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

export function applyOpsFollowupSeededToState(
  state: ChangeWorkflowState,
  payload: OpsFollowupSeededSignalPayload,
): ChangeWorkflowState {
  state.ops_followup = payload.profile;
  setLastSignalAt(state, payload.seededAt);
  return state;
}

export function applyOpsFollowupLinkAddedToState(
  state: ChangeWorkflowState,
  payload: OpsFollowupLinkAddedSignalPayload,
): ChangeWorkflowState {
  const existing = state.ops_followup_links ?? [];
  const index = existing.findIndex((link) => link.id === payload.link.id);
  const next =
    index >= 0
      ? existing.map((link, i) => (i === index ? payload.link : link))
      : [...existing, payload.link];
  state.ops_followup_links = next;
  setLastSignalAt(state, payload.addedAt);
  return state;
}

export function applyOpsEvidenceAppendedToState(
  state: ChangeWorkflowState,
  payload: OpsEvidenceAppendedSignalPayload,
): ChangeWorkflowState {
  if (!state.ops_followup) {
    throw new Error(
      "Cannot append ops evidence: change has no ops_followup profile",
    );
  }
  state.ops_followup = {
    ...state.ops_followup,
    evidence: [...(state.ops_followup.evidence ?? []), payload.entry],
    ...(payload.status ? { status: payload.status } : {}),
    updated_at: payload.appendedAt,
  };
  setLastSignalAt(state, payload.appendedAt);
  return state;
}

export function applyOpsRunUpsertedToState(
  state: ChangeWorkflowState,
  payload: OpsRunUpsertedSignalPayload,
): ChangeWorkflowState {
  if (!state.ops_followup) {
    throw new Error(
      "Cannot upsert ops run: change has no ops_followup profile",
    );
  }
  const existing = state.ops_followup.runs ?? [];
  const index = existing.findIndex((run) => run.id === payload.run.id);
  const runs =
    index >= 0
      ? existing.map((run, i) =>
          i === index
            ? {
                ...payload.run,
                // rq-opsRunEvidence01: run evidence is append-only. A stale
                // client-side upsert payload must not erase evidence already
                // accepted by the workflow state machine.
                evidence: run.evidence ?? [],
              }
            : run,
        )
      : [...existing, payload.run];
  state.ops_followup = {
    ...state.ops_followup,
    runs,
    updated_at: payload.upsertedAt,
  };
  setLastSignalAt(state, payload.upsertedAt);
  return state;
}

export function applyOpsRunEvidenceAppendedToState(
  state: ChangeWorkflowState,
  payload: OpsRunEvidenceAppendedSignalPayload,
): ChangeWorkflowState {
  if (!state.ops_followup) {
    throw new Error(
      "Cannot append ops run evidence: change has no ops_followup profile",
    );
  }
  const existing = state.ops_followup.runs ?? [];
  const index = existing.findIndex((run) => run.id === payload.runId);
  if (index < 0) {
    throw new Error(
      `Cannot append ops run evidence: run not found ${payload.runId}`,
    );
  }

  const runs = existing.map((run, i) => {
    if (i !== index) return run;
    return {
      ...run,
      status: payload.entry.next_status,
      evidence: [...(run.evidence ?? []), payload.entry],
      updated_at: payload.appendedAt,
    };
  });

  state.ops_followup = {
    ...state.ops_followup,
    runs,
    ...(payload.status ? { status: payload.status } : {}),
    updated_at: payload.appendedAt,
  };
  setLastSignalAt(state, payload.appendedAt);
  return state;
}

export function applyLightweightProfileRequestedToState(
  state: ChangeWorkflowState,
  payload: LightweightProfileRequestedSignalPayload,
): ChangeWorkflowState {
  state.lightweight_profile = {
    request: payload.request,
    omissionPolicy: payload.omissionPolicy,
    evaluations: [],
  };
  setLastSignalAt(state, payload.requestedAt);
  return state;
}

export function applyLightweightProfileEvaluatedToState(
  state: ChangeWorkflowState,
  payload: LightweightProfileEvaluatedSignalPayload,
): ChangeWorkflowState {
  const existing = state.lightweight_profile;
  if (!existing) {
    throw new Error(
      "Cannot append lightweight profile evaluation: no profile request exists",
    );
  }
  const key = payload.evaluation.evaluationKey;
  if (existing.evaluations.some((entry) => entry.evaluationKey === key)) {
    // Stable idempotency: same request/phase/fingerprint retry is a no-op.
    setLastSignalAt(state, payload.evaluatedAt);
    return state;
  }
  existing.evaluations.push(payload.evaluation);
  setLastSignalAt(state, payload.evaluatedAt);
  return state;
}

function epicMembershipIdentity(
  membership: NonNullable<ChangeWorkflowState["epic_membership"]>,
) {
  return {
    epic_id: membership.epic_id,
    entry_id: membership.entry_id,
  };
}

function epicMembershipMatches(
  membership: NonNullable<ChangeWorkflowState["epic_membership"]>,
  expected: { epic_id: string; entry_id: string },
): boolean {
  return (
    membership.epic_id === expected.epic_id &&
    membership.entry_id === expected.entry_id
  );
}

export function applyEpicMembershipSetToState(
  state: ChangeWorkflowState,
  payload: EpicMembershipSetSignalPayload,
): ChangeWorkflowState {
  const current = state.epic_membership;
  if (current) {
    const sameTarget = epicMembershipMatches(current, {
      epic_id: payload.membership.epic_id,
      entry_id: payload.membership.entry_id,
    });
    const expectedMatches = payload.expectedCurrent
      ? epicMembershipMatches(current, payload.expectedCurrent)
      : false;
    const moveAllowed = payload.membership.source === "move" && expectedMatches;

    if (!sameTarget && !moveAllowed) {
      const currentIdentity = epicMembershipIdentity(current);
      throw new Error(
        `Cannot set Epic membership: change already belongs to Epic ${currentIdentity.epic_id} entry ${currentIdentity.entry_id}`,
      );
    }
  } else if (payload.membership.source === "move" && payload.expectedCurrent) {
    throw new Error(
      `Cannot move Epic membership: expected current Epic ${payload.expectedCurrent.epic_id} entry ${payload.expectedCurrent.entry_id}, but change has no Epic membership`,
    );
  }

  state.epic_membership = payload.membership;
  setLastSignalAt(state, payload.setAt);
  return state;
}

export function applyEpicMembershipClearedToState(
  state: ChangeWorkflowState,
  payload: EpicMembershipClearedSignalPayload,
): ChangeWorkflowState {
  const current = state.epic_membership;
  if (!current) {
    throw new Error(
      `Cannot clear Epic membership: expected Epic ${payload.expected.epic_id} entry ${payload.expected.entry_id}, but change has no Epic membership`,
    );
  }
  if (!epicMembershipMatches(current, payload.expected)) {
    throw new Error(
      `Cannot clear Epic membership: current Epic ${current.epic_id} entry ${current.entry_id} does not match expected Epic ${payload.expected.epic_id} entry ${payload.expected.entry_id}`,
    );
  }

  delete state.epic_membership;
  setLastSignalAt(state, payload.clearedAt);
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
): { state: ChangeWorkflowState; applied: boolean } {
  // Active content is Temporal-first; metadata intentionally omits active
  // filesystem paths until an archive/recovery/materialization step creates one.
  const temporalOnlyMetadata = (): ArtifactMetadata => ({
    updatedAt: at,
    source: "temporal",
    readable: false,
  });
  // Per-artifact hard cap check
  const perCheck = checkPerArtifactSize(kind, text, at);
  if (!perCheck.ok && perCheck.rejection) {
    state.artifacts = {
      ...state.artifacts,
      [kind]: {
        ...(state.artifacts[kind] ?? temporalOnlyMetadata()),
        rejection: perCheck.rejection,
      },
    };
    setLastSignalAt(state, at);
    return { state, applied: false };
  }

  // Aggregate cap check (projects this content onto existing documents)
  const aggCheck = checkAggregateSize(state, kind, text, at);
  if (!aggCheck.ok && aggCheck.rejection) {
    state.artifacts = {
      ...state.artifacts,
      [kind]: {
        ...(state.artifacts[kind] ?? temporalOnlyMetadata()),
        rejection: aggCheck.rejection,
      },
    };
    setLastSignalAt(state, at);
    return { state, applied: false };
  }

  // Caps passed — apply content. Clear any prior rejection; record warning
  // if soft cap exceeded.
  const existingArtifact = state.artifacts[kind] ?? temporalOnlyMetadata();
  const nextArtifact = {
    ...existingArtifact,
    rejection: undefined,
    sizeWarning: perCheck.warning,
  };
  state.documents = { ...(state.documents ?? {}), [kind]: text };
  state.artifacts = { ...state.artifacts, [kind]: nextArtifact };
  setLastSignalAt(state, at);
  return { state, applied: true };
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
  ).state;
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
  ).state;
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
  ).state;
}

export function applyDesignUpdatedToState(
  state: ChangeWorkflowState,
  payload: DesignUpdatedSignalPayload,
): ChangeWorkflowState {
  const { state: next, applied } = applyContentWithSizeGuard(
    state,
    "design",
    payload.text,
    payload.updatedAt,
  );
  // rq-readinessMutationReceipt01: design content affects acceptance
  // readiness (the design gate artifact backs acceptance review). Record
  // only on successful content application.
  if (applied) {
    recordMutationReceipt(next, {
      signalName: "designUpdated",
      mutationReceiptId: payload.mutationReceiptId,
      recordedAt: payload.updatedAt,
    });
  }
  return next;
}

export function applyExecutiveSummaryUpdatedToState(
  state: ChangeWorkflowState,
  payload: ExecutiveSummaryUpdatedSignalPayload,
): ChangeWorkflowState {
  const { state: next, applied } = applyContentWithSizeGuard(
    state,
    "executiveSummary",
    payload.text,
    payload.updatedAt,
  );
  // rq-readinessMutationReceipt01: executive summary content gates
  // acceptance readiness; record only on successful content application.
  if (applied) {
    recordMutationReceipt(next, {
      signalName: "executiveSummaryUpdated",
      mutationReceiptId: payload.mutationReceiptId,
      recordedAt: payload.updatedAt,
    });
  }
  return next;
}

export function applyAcceptanceUpdatedToState(
  state: ChangeWorkflowState,
  payload: AcceptanceUpdatedSignalPayload,
): ChangeWorkflowState {
  const { state: next, applied } = applyContentWithSizeGuard(
    state,
    "acceptance",
    payload.text,
    payload.updatedAt,
  );
  // rq-readinessMutationReceipt01: acceptance proof content gates
  // release readiness; record only on successful content application.
  if (applied) {
    recordMutationReceipt(next, {
      signalName: "acceptanceUpdated",
      mutationReceiptId: payload.mutationReceiptId,
      recordedAt: payload.updatedAt,
    });
  }
  return next;
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
  advanceAcceptanceReadinessRevision(state);
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
  advanceAcceptanceReadinessRevision(state);
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
  advanceAcceptanceReadinessRevision(state);
  setLastSignalAt(state, payload.updatedAt);
  // rq-readinessMutationReceipt01: review matrix set advances the
  // acceptance-readiness revision, clearing an otherwise-blocking
  // readiness gap (rq-contractCoverageProjection01). Record the receipt
  // after state apply so the query confirms the reducer ran.
  recordMutationReceipt(state, {
    signalName: "contractReviewMatrixSet",
    mutationReceiptId: payload.mutationReceiptId,
    recordedAt: payload.updatedAt,
  });
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
  if (payload.applyCycle) {
    task.apply_cycle = payload.applyCycle;
  }
  setLastSignalAt(state, payload.assignedAt);
  return state;
}

const TEST_RUN_RING_BUFFER_LIMIT = 20;

/**
 * Persist a test-run record into `state.testRuns[taskId][]`.
 * Ring-buffered to last TEST_RUN_RING_BUFFER_LIMIT entries per task.
 *
 * rq-TDD009seq: these records are matched against
 * `TaskCompletedSignalPayload.lastRedRunId` / `lastGreenRunId` at
 * task-completion time to enforce red-before-green ordering.
 */
export function applyTestRunRecordedToState(
  state: ChangeWorkflowState,
  payload: TestRunRecordedSignalPayload,
): ChangeWorkflowState {
  const { taskId, ...recordFields } = payload;
  const record = recordFields as TestRunRecord;
  const existing = state.testRuns?.[taskId] ?? [];
  const updated = [...existing, record].slice(-TEST_RUN_RING_BUFFER_LIMIT);
  state.testRuns = {
    ...(state.testRuns ?? {}),
    [taskId]: updated,
  };
  setLastSignalAt(state, payload.recordedAt);
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

  // rq-delDefaults10: frontend completion structurally requires one
  // matching-cycle adv-designer follow-up after successful engineer or safe
  // inline implementation; the task's active apply cycle anchors that
  // evidence — no cycle anchor, no completion.
  if (task.metadata?.frontend === "true") {
    const implementationCycleId = task.apply_cycle?.implementation_cycle_id;
    if (!implementationCycleId) {
      throw new Error(
        `TASK_COMPLETION_BLOCKED: frontend task ${payload.taskId} has no active implementation cycle. Assign the task with an apply cycle and collect successful adv-designer evidence before completing it.`,
      );
    }
    const reports = [
      ...(state.subagent_reports ?? []),
      ...(task.subagent_reports ?? []),
    ];
    if (
      !hasMatchingDesignerApplyEvidence({
        taskId: payload.taskId,
        implementationCycleId,
        reports,
      })
    ) {
      throw new Error(
        `TASK_COMPLETION_BLOCKED: frontend task ${payload.taskId} requires successful adv-designer evidence for implementation cycle ${implementationCycleId}.`,
      );
    }
    if (
      !hasMatchingFrontendImplementationReceipt({
        taskId: payload.taskId,
        implementationCycleId,
        reports,
      })
    ) {
      throw new Error(
        `TASK_COMPLETION_BLOCKED: frontend task ${payload.taskId} requires matching successful adv-engineer evidence or an inline provenance receipt for implementation cycle ${implementationCycleId}.`,
      );
    }
  }

  // rq-TDD009seq: red-then-green ordering enforcement for inline TDD tasks.
  // Only fires when lastGreenRunId is structurally present (cutover boundary).
  // Legacy tasks without lastGreenRunId are grandfathered (C1).
  // Tasks with tdd_intent not_applicable / separate_verification are exempt (C3).
  if (payload.lastGreenRunId) {
    const tddIntent = task.metadata?.tdd_intent;
    // Default (undefined) is treated as inline per rq-TDD001inl.3
    const isInline = tddIntent === "inline" || tddIntent === undefined;
    if (isInline) {
      const runs = state.testRuns?.[payload.taskId] ?? [];
      const redRun = payload.lastRedRunId
        ? runs.find((r) => r.runId === payload.lastRedRunId)
        : undefined;
      const greenRun = runs.find((r) => r.runId === payload.lastGreenRunId);

      if (!redRun || redRun.exitCode === 0 || redRun.phase !== "red") {
        throw new Error(
          `TASK_ORDERING_VIOLATION: no prior red run (phase:'red', exitCode!=0) ` +
            `found for taskId ${payload.taskId}` +
            (payload.lastRedRunId
              ? ` matching lastRedRunId=${payload.lastRedRunId}`
              : "") +
            `. Record a failing test via adv_run_test with phase:'red' before completing this task.`,
        );
      }

      if (!greenRun || greenRun.exitCode !== 0 || greenRun.phase !== "green") {
        throw new Error(
          `TASK_ORDERING_VIOLATION: green run matching lastGreenRunId=${payload.lastGreenRunId} ` +
            `not found or not passing (expected phase:'green', exitCode=0) for taskId ${payload.taskId}.`,
        );
      }

      if (redRun.recordedAt >= greenRun.recordedAt) {
        throw new Error(
          `TASK_ORDERING_VIOLATION: red run ${redRun.runId} ` +
            `(recordedAt=${redRun.recordedAt}) is not before green run ` +
            `${greenRun.runId} (recordedAt=${greenRun.recordedAt}) for taskId ${payload.taskId}.`,
        );
      }
    }
  }

  // rq-evidencePlan01: validate the normalized evidence plan before completing.
  // The resolver is the sole compatibility authority; unsupported routes fail
  // structurally, and behavior-critical non-test routes require a linked review
  // conclusion.
  const evidenceResolution = resolveTaskEvidence(task);
  if (!evidenceResolution.valid) {
    throw new Error(
      `TASK_COMPLETION_BLOCKED: task ${payload.taskId} has an invalid evidence plan: ${evidenceResolution.errors.join("; ")}`,
    );
  }
  const completionValidation = validateTaskEvidenceForStage(
    task,
    "completion",
    [...(state.subagent_reports ?? []), ...(task.subagent_reports ?? [])],
  );
  if (!completionValidation.valid) {
    throw new Error(
      `TASK_COMPLETION_BLOCKED: task ${payload.taskId} has invalid completion-stage evidence: ${completionValidation.errors.join("; ")}`,
    );
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
  // Preserve the resolved evidence plan as typed completion proof (additive to
  // verification prose and run IDs). For legacy tasks this materializes the
  // normalized legacy plan for the first time.
  if (evidenceResolution.policy && evidenceResolution.proof_target) {
    task.evidence_plan = {
      policy: evidenceResolution.policy,
      proof_target: evidenceResolution.proof_target,
      ...(evidenceResolution.rationale
        ? { rationale: evidenceResolution.rationale }
        : {}),
      ...(evidenceResolution.review_conclusion
        ? { review_conclusion: evidenceResolution.review_conclusion }
        : {}),
      ...(evidenceResolution.review_evidence_ref
        ? { review_evidence_ref: evidenceResolution.review_evidence_ref }
        : {}),
      ...(evidenceResolution.stage ? { stage: evidenceResolution.stage } : {}),
      provenance: evidenceResolution.compatibility ?? "legacy",
    };
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
    case "adv-verification-triage-bundle":
      return null;

    case "adv-visual-review":
      if (report.blockers.length === 0) return null;
      return {
        summary: report.blockers.join("; "),
        diagnosis: report.blockers.join("; "),
      };

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

function hasMatchingDesignerApplyEvidence(input: {
  taskId: string;
  implementationCycleId: string;
  reports: SubagentReportSubmittedSignalPayload["report"][];
}): boolean {
  return input.reports.some(
    (report) =>
      report.agent === "adv-designer" &&
      report.status === "complete" &&
      taskIdFromReport(report) === input.taskId &&
      subagentReportImplementationCycleId(report) ===
        input.implementationCycleId,
  );
}

function hasMatchingSuccessfulEngineerEvidence(input: {
  taskId: string;
  implementationCycleId: string;
  reports: SubagentReportSubmittedSignalPayload["report"][];
}): SubagentReportSubmittedSignalPayload["report"] | undefined {
  return input.reports.find(
    (report) =>
      report.agent === "adv-engineer" &&
      report.status === "complete" &&
      report.blockers.length === 0 &&
      report.verification.length > 0 &&
      report.verification.every((entry) => entry.exit_code === 0) &&
      taskIdFromReport(report) === input.taskId &&
      subagentReportImplementationCycleId(report) ===
        input.implementationCycleId,
  );
}

function hasMatchingFrontendImplementationReceipt(input: {
  taskId: string;
  implementationCycleId: string;
  reports: SubagentReportSubmittedSignalPayload["report"][];
}): boolean {
  const successfulEngineers = input.reports.filter(
    (report) =>
      report.agent === "adv-engineer" &&
      report.status === "complete" &&
      report.blockers.length === 0 &&
      report.verification.length > 0 &&
      report.verification.every((entry) => entry.exit_code === 0) &&
      taskIdFromReport(report) === input.taskId &&
      subagentReportImplementationCycleId(report) ===
        input.implementationCycleId,
  );

  return input.reports.some((report) => {
    if (
      report.agent !== "adv-designer" ||
      report.status !== "complete" ||
      taskIdFromReport(report) !== input.taskId ||
      subagentReportImplementationCycleId(report) !==
        input.implementationCycleId
    ) {
      return false;
    }
    const provenance = report.apply_context?.implementation_provenance;
    if (provenance?.kind === "inline") return true;
    return (
      provenance?.kind === "engineer_report" &&
      successfulEngineers.some(
        (engineer) => reportKey(engineer) === provenance.report_key,
      )
    );
  });
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
    implementationCycleId: subagentReportImplementationCycleId(report),
  });
}

/**
 * Behavior-critical evidence plans only: code/verification tasks whose
 * evidence_policy is set and not test/not_applicable. A reviewer report
 * covering docs/ops/research tasks does not write a review_evidence_ref.
 */
function isBehaviorCriticalEvidencePlanTask(task: Task): boolean {
  const type = task.type ?? "code";
  if (type !== "code" && type !== "verification") return false;
  const policy = task.evidence_plan?.policy ?? task.evidence_policy;
  if (!policy) return false;
  return policy !== "test" && policy !== "not_applicable";
}

/**
 * Ensure the evidence_plan carries a stable `provenance` field. Legacy plans
 * that omit it are normalized to "legacy" so downstream readiness checks can
 * distinguish legacy readability from stage-v2 authority. Returns a partial
 * patch keyed by field presence — used to merge into existing evidence_plan
 * objects without dropping the original `policy`, `proof_target`, etc.
 */
function normalizeEvidencePlanCompatibility(plan: Task["evidence_plan"]): {
  provenance: "legacy" | "new" | "reclassified";
} {
  if (!plan) return { provenance: "legacy" };
  return { provenance: plan.provenance ?? "legacy" };
}

export function applySubagentReportSubmittedToState(
  state: ChangeWorkflowState,
  payload: SubagentReportSubmittedSignalPayload,
): ChangeWorkflowState {
  const taskScoped =
    typeof payload.report.scope === "string" ||
    payload.report.scope.kind === "task";
  const reportOwnerTaskId = taskIdFromReport(payload.report);
  // Ownership boundary: for task-scoped reports the report itself is the
  // authority on which task owns it. A signal-level taskId that disagrees
  // with the report owner is rejected before any storage and before cycle
  // validation — otherwise cycle validation could anchor to one task while
  // the evidence persists under another. Payloads whose taskId matches (or
  // omits) the owner are unaffected.
  if (
    taskScoped &&
    reportOwnerTaskId &&
    payload.taskId &&
    payload.taskId !== reportOwnerTaskId
  ) {
    throw new Error(
      `SUBAGENT_REPORT_OWNER_MISMATCH: signal taskId ${payload.taskId} conflicts with task-scoped report owner task ${reportOwnerTaskId} (agent: ${payload.report.agent}, attempt: ${payload.report.attempt}).`,
    );
  }
  const taskId =
    taskScoped && reportOwnerTaskId
      ? reportOwnerTaskId
      : (payload.taskId ?? reportOwnerTaskId);
  const task = taskId ? getMutableTask(state, taskId) : undefined;

  // An adv-designer report carrying apply_context is cycle-anchored evidence:
  // it may only persist while the owning task has that exact apply cycle
  // active. Persisting pre-anchor evidence would let it become valid later
  // once a matching cycle starts. Never infer or backfill a cycle here —
  // throw so the signal wrapper records a signal rejection instead.
  // Legacy reports without apply_context claim no cycle and stay compatible.
  if (payload.report.agent === "adv-designer") {
    const claimedCycleId = subagentReportImplementationCycleId(payload.report);
    if (claimedCycleId) {
      const activeCycleId = task?.apply_cycle?.implementation_cycle_id;
      if (activeCycleId !== claimedCycleId) {
        throw new Error(
          `SUBAGENT_REPORT_ANCHOR_REJECTED: adv-designer report for task ${taskId ?? "<unknown>"} claims implementation cycle ${claimedCycleId} but the task has no matching active implementation cycle${activeCycleId ? ` (active cycle: ${activeCycleId})` : ""}.`,
        );
      }
      const provenance =
        payload.report.apply_context?.implementation_provenance;
      if (provenance?.kind === "engineer_report") {
        const reports = [
          ...(state.subagent_reports ?? []),
          ...(task?.subagent_reports ?? []),
        ];
        const engineer = hasMatchingSuccessfulEngineerEvidence({
          taskId: taskId ?? "",
          implementationCycleId: claimedCycleId,
          reports,
        });
        if (!engineer || reportKey(engineer) !== provenance.report_key) {
          throw new Error(
            `SUBAGENT_REPORT_PROVENANCE_REJECTED: adv-designer report for task ${taskId ?? "<unknown>"} must cite a successful same-cycle adv-engineer report key.`,
          );
        }
      }
    }
  }

  const reportId = reportKey(payload.report);
  const seenReportIds = state.seenReportIds ?? [];
  const alreadyStoredInSidecar = (state.subagent_reports ?? []).some(
    (report) => reportKey(report) === reportId,
  );
  const alreadyStoredOnTask = (task?.subagent_reports ?? []).some(
    (report) => reportKey(report) === reportId,
  );

  if (seenReportIds.includes(reportId) || alreadyStoredInSidecar) {
    // Duplicate: leave retained IDs and cumulative total unchanged.
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
  state.seenReportIds = [...seenReportIds, reportId].slice(
    -SEEN_REPORT_IDS_RING_BUFFER_LIMIT,
  );
  state.seenReportIdsTotal = (state.seenReportIdsTotal ?? 0) + 1;

  // Stage-v2 reviewer-owned evidence: when an adv-reviewer report is persisted
  // for a behavior-critical task that uses a non-test route, write a typed
  // review_evidence_ref to the task's evidence plan. Callers cannot author this
  // ref — only the reviewer-report consumer does, and only on fresh (not
  // duplicate) storage. Tasks created with only task-level evidence_policy
  // (no evidence_plan object) get the plan created here so the ref is never
  // silently dropped.
  if (
    task &&
    taskScoped &&
    payload.report.agent === "adv-reviewer" &&
    isBehaviorCriticalEvidencePlanTask(task)
  ) {
    if (task.evidence_plan) {
      task.evidence_plan = {
        ...task.evidence_plan,
        ...normalizeEvidencePlanCompatibility(task.evidence_plan),
        review_evidence_ref: { report_key: reportId },
      };
    } else {
      // Task has task-level evidence_policy but no evidence_plan object.
      // isBehaviorCriticalEvidencePlanTask already guaranteed the policy
      // exists and is a non-test route for behavior-critical work.
      const policy = task.evidence_policy;
      if (policy) {
        task.evidence_plan = {
          policy,
          proof_target: "Reviewer-owned evidence",
          provenance: "legacy",
          review_evidence_ref: { report_key: reportId },
        };
      }
    }
  }

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
  // Persist gate criteria if present (advisory audit trail)
  if (payload.criteria) {
    state.gateCriteria = {
      ...(state.gateCriteria ?? {}),
      [payload.gateId]: payload.criteria,
    };
  }
  // Capture acceptance criteria snapshot keyed to the current readiness
  // revision so stale audit evidence can never be surfaced as current pass.
  if (payload.gateId === "acceptance" && payload.criteria) {
    state.acceptanceCriteriaSnapshot = {
      criteria: payload.criteria,
      basisRevision: state.acceptanceReadinessRevision ?? 0,
    };
  }
  setLastSignalAt(state, payload.completedAt);
  // rq-readinessMutationReceipt01: gate completion is the canonical
  // readiness-affecting mutation; the receipt is recorded AFTER the
  // reducer applies state so AC7 immediate gate readiness observes the
  // applied state on its first valid attempt.
  recordMutationReceipt(state, {
    signalName: "gateCompleted",
    mutationReceiptId: payload.mutationReceiptId,
    recordedAt: payload.completedAt,
  });
  return state;
}

// rq-requiredObligation02: Out-of-scope required obligations require explicit
// routing via re-enter or split; the re-enter path clears review matrix to force
// re-evaluation of contract items that may have changed scope.
export function applyGateReenteredToState(
  state: ChangeWorkflowState,
  payload: GateReenteredSignalPayload,
): ChangeWorkflowState {
  if (state.contract && payload.fromGateId !== "release") {
    delete state.contract.reviewMatrix;
    advanceAcceptanceReadinessRevision(state);
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

/**
 * addSpecDeltaWriter: append-only spec-delta reducer (DeltaAdd semantics only).
 *
 * Appends `payload.delta` under `state.deltas[payload.capability]`, accepting
 * existing or valid new kebab-case capability keys. Duplicate delta ids and
 * duplicate add-requirement ids are rejected deterministically (throw →
 * signal-rejection path) so replays and duplicate submissions leave the
 * capability-keyed delta record unchanged. Matching is exact-identifier only —
 * no heuristic inference. The reducer never resolves or modifies global spec
 * files: archive remains the sole global-spec writer.
 */
export function applySpecDeltaAddedToState(
  state: ChangeWorkflowState,
  payload: SpecDeltaAddedSignalPayload,
): ChangeWorkflowState {
  if (!CAPABILITY_KEY_PATTERN.test(payload.capability)) {
    throw new Error(
      `Malformed capability key: ${JSON.stringify(payload.capability)}`,
    );
  }
  const deltas = state.deltas ?? {};
  for (const [capability, entries] of Object.entries(deltas)) {
    for (const entry of entries) {
      if (entry.id === payload.delta.id) {
        throw new Error(
          `Duplicate spec delta id ${payload.delta.id} under capability ${capability}`,
        );
      }
      if (
        entry.operation === "add" &&
        entry.requirement.id === payload.delta.requirement.id
      ) {
        throw new Error(
          `Duplicate requirement id ${payload.delta.requirement.id} under capability ${capability}`,
        );
      }
    }
  }
  state.deltas = {
    ...deltas,
    [payload.capability]: [
      ...(deltas[payload.capability] ?? []),
      payload.delta,
    ],
  };
  setLastSignalAt(state, payload.addedAt);
  return state;
}

/**
 * Modify-only spec-delta reducer. The tool proves target existence against the
 * current global spec before signaling; this reducer owns the durable conflict
 * boundary. It validates the payload again, rejects duplicate delta identifiers
 * globally, and permits only one modify intent per capability/requirement pair.
 */
export function applySpecDeltaModifiedToState(
  state: ChangeWorkflowState,
  payload: SpecDeltaModifiedSignalPayload,
): ChangeWorkflowState {
  const parsed = SpecDeltaModifiedSignalPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `Invalid modify spec delta: ${parsed.error.issues[0]?.message ?? "schema validation failed"}`,
    );
  }
  const validated = parsed.data;
  const deltas = state.deltas ?? {};
  for (const [capability, entries] of Object.entries(deltas)) {
    for (const entry of entries) {
      if (entry.id === validated.delta.id) {
        throw new Error(
          `Duplicate spec delta id ${validated.delta.id} under capability ${capability}`,
        );
      }
      if (
        capability === validated.capability &&
        entry.operation === "modify" &&
        entry.target_id === validated.delta.target_id
      ) {
        throw new Error(
          `Conflicting modify delta target ${validated.delta.target_id} under capability ${capability}`,
        );
      }
    }
  }
  state.deltas = {
    ...deltas,
    [validated.capability]: [
      ...(deltas[validated.capability] ?? []),
      validated.delta,
    ],
  };
  setLastSignalAt(state, validated.modifiedAt);
  return state;
}

// rq-designQualityEvidence01: typed disposition of a single design-quality
// concern. Latest disposition wins for a given (taskId, concernKey) so the
// gate-readiness evaluator reads a single current verdict per concern.
export function applyDesignConcernDispositionedToState(
  state: ChangeWorkflowState,
  payload: DesignConcernDispositionedSignalPayload,
): ChangeWorkflowState {
  const existing = state.design_concern_dispositions ?? [];
  const next = existing.filter(
    (d) =>
      !(d.taskId === payload.taskId && d.concernKey === payload.concernKey),
  );
  next.push({
    taskId: payload.taskId,
    concernKey: payload.concernKey,
    disposition: payload.disposition,
    evidence: payload.evidence,
    dispositionedAt: payload.dispositionedAt,
  });
  state.design_concern_dispositions = next;
  setLastSignalAt(state, payload.dispositionedAt);
  // rq-readinessMutationReceipt01: design-concern disposition clears an
  // otherwise-blocking concern in the gate-readiness evaluator. Record
  // the receipt AFTER state apply so the query confirms the reducer ran.
  recordMutationReceipt(state, {
    signalName: "designConcernDispositioned",
    mutationReceiptId: payload.mutationReceiptId,
    recordedAt: payload.dispositionedAt,
  });
  return state;
}

// strengthenAgentEvidence AC1: typed disposition of a verification-evidence
// gap. Latest disposition wins for a given (taskId, concernKey) so the
// gate-readiness evaluator reads a single current verdict per gap.
export function applyVerificationEvidenceDispositionedToState(
  state: ChangeWorkflowState,
  payload: VerificationEvidenceDispositionedSignalPayload,
): ChangeWorkflowState {
  const existing = state.verification_evidence_dispositions ?? [];
  const next = existing.filter(
    (d) =>
      !(d.taskId === payload.taskId && d.concernKey === payload.concernKey),
  );
  next.push({
    taskId: payload.taskId,
    concernKey: payload.concernKey,
    disposition: payload.disposition,
    evidence: payload.evidence,
    dispositionedAt: payload.dispositionedAt,
  });
  state.verification_evidence_dispositions = next;
  setLastSignalAt(state, payload.dispositionedAt);
  // rq-readinessMutationReceipt01: verification-evidence disposition
  // clears an otherwise-blocking VERIFICATION_EVIDENCE_MISSING readiness
  // blocker. Record AFTER state apply.
  recordMutationReceipt(state, {
    signalName: "verificationEvidenceDispositioned",
    mutationReceiptId: payload.mutationReceiptId,
    recordedAt: payload.dispositionedAt,
  });
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
    // worktreeCreatedSignal is fired only at advWorktreeCreate Step 7
    // ("register in worktree_registry only after setup is ready"), i.e.
    // after postCreate setup hooks pass. Stamp setupReady:true so
    // worktreeExistsForChange (the isolation existing-worktree ALLOW probe,
    // rq-worktreeMutationGuard01.4, which requires setupReady===true) can
    // recognize the materialized worktree. Without this the probe is dead
    // code and main-checkout sessions can never mutate ADV state.
    [payload.branch]: { ...payload, status: "created", setupReady: true },
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
 * rq-wl-setupReadiness01.1 — durable setup-failure persistence.
 *
 * Applied when git worktree add fails (stage:"git_failed") or postCreate
 * hooks fail (stage:"hook_failed"). Sets status:"setup_failed", records
 * the reason, and marks materialized:true only when the git worktree itself
 * exists (hook_failed). The setupReady guard stays false so resume blocks.
 */
export function applyWorktreeSetupFailedToState(
  state: ChangeWorkflowState,
  payload: WorktreeSetupFailedSignalPayload,
): ChangeWorkflowState {
  const now = payload.failedAt;
  state.worktrees = {
    ...(state.worktrees ?? {}),
    [payload.branch]: {
      branch: payload.branch,
      path: payload.path,
      changeId: payload.changeId,
      status: "setup_failed",
      createdAt: now,
      lastSeenAt: now,
      baseRef: payload.baseRef,
      headSha: payload.headSha ?? "",
      source: "tool",
      sourceVersion: 1,
      setupReady: false,
      materialized: payload.stage === "hook_failed",
      setupFailureReason: payload.setupFailureReason,
      cleanupEligible: false,
      cleanupBlockedBy: [payload.stage],
    },
  };
  setLastSignalAt(state, now);
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
  state.lifecycleState = "archived";
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
  state.lifecycleState = "closed";
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
  const normalized: ArtifactMetadata = { ...metadata };
  // Workflow state may preserve legacy path-bearing metadata for replay; tool
  // readback remains responsible for re-validating readability before display.
  if (normalized.path?.trim() === "") {
    delete normalized.path;
    normalized.readable = false;
    normalized.source ??= "temporal";
  }
  state.artifacts[kind] = normalized;
}

export function closeChangeInChangeState(
  state: ChangeWorkflowState,
  closure: ChangeClosure,
): ChangeWorkflowState {
  state.status = "closed";
  state.lifecycleState = "closed";
  state.closure = closure;
  return state;
}

export function archiveChangeInChangeState(
  state: ChangeWorkflowState,
): ChangeWorkflowState {
  state.status = "archived";
  state.lifecycleState = "archived";
  return state;
}
