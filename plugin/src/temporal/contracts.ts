import type {
  ChangeClosure,
  ChangeContract,
  Change,
  ChangeOrigin,
  SubagentAgent,
  SubagentReportScope,
  ScopedSubagentReport,
  FastFollowOf,
  Gates,
} from "../types";
import type { SignalPayloadDigest } from "./digest";

export const ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX = "advance";
export const DEFAULT_TEMPORAL_ADDRESS = "127.0.0.1:7233";
export const DEFAULT_TEMPORAL_NAMESPACE = "default";

export const CHANGE_WORKFLOW_NAME = "changeWorkflow";

export const ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES = {
  projectId: "AdvProjectId",
  changeId: "AdvChangeId",
  changeStatus: "AdvChangeStatus",
  activeGate: "AdvActiveGate",
  doomLoop: "AdvDoomLoopActive",
} as const;

export const CHANGE_WORKFLOW_QUERY_NAMES = {
  getState: "adv.change.getState",
  getTasks: "adv.change.getTasks",
  getGateStatus: "adv.change.getGateStatus",
  getGateCriteria: "adv.change.getGateCriteria",
  getWorktrees: "adv.change.getWorktrees",
  getConformanceState: "adv.change.getConformanceState",
} as const;

export const CHANGE_WORKFLOW_COMPAT_QUERY_NAMES = {
  bootstrap: "adv.change.bootstrap",
  state: "adv.change.getChangeState",
  ready: "adv.change.getReadyTasks",
  tasks: "adv.change.tasks",
  task: "adv.change.task",
  getCurrentBucket: "adv.change.getCurrentBucket",
  getInvestmentReport: "adv.change.getInvestmentReport",
  getReviewVerification: "adv.change.getReviewVerification",
  getTaskRunSummary: "adv.change.getTaskRunSummary",
} as const;

export const CHANGE_WORKFLOW_SIGNAL_NAMES = {
  proposalUpdated: "adv.change.proposalUpdated",
  problemStatementUpdated: "adv.change.problemStatementUpdated",
  agreementUpdated: "adv.change.agreementUpdated",
  designUpdated: "adv.change.designUpdated",
  executiveSummaryUpdated: "adv.change.executiveSummaryUpdated",
  acceptanceUpdated: "adv.change.acceptanceUpdated",
  acceptanceCriteriaSet: "adv.change.acceptanceCriteriaSet",
  contractSet: "adv.change.contractSet",
  contractAmended: "adv.change.contractAmended",
  contractReviewMatrixSet: "adv.change.contractReviewMatrixSet",
  taskAdded: "adv.change.taskAdded",
  taskUpdated: "adv.change.taskUpdated",
  taskRemoved: "adv.change.taskRemoved",
  taskAssigned: "adv.change.taskAssigned",
  taskCompleted: "adv.change.taskCompleted",
  subagentReportSubmitted: "adv.change.subagentReportSubmitted",
  taskBlocked: "adv.change.taskBlocked",
  taskCancelled: "adv.change.taskCancelled",
  gateInProgress: "adv.change.gateInProgress",
  gateAwaitingApproval: "adv.change.gateAwaitingApproval",
  gateStuck: "adv.change.gateStuck",
  gateCompleted: "adv.change.gateCompleted",
  gateReentered: "adv.change.gateReentered",
  wisdomAdded: "adv.change.wisdomAdded",
  reflectionRecorded: "adv.change.reflectionRecorded",
  worktreeCreated: "adv.change.worktreeCreated",
  worktreeDeleted: "adv.change.worktreeDeleted",
  worktreeAutoManaged: "adv.change.worktreeAutoManaged",
  worktreeAttached: "adv.change.worktreeAttached",
  crossProjectCoordinationUpdated: "adv.change.crossProjectCoordinationUpdated",
  conformanceLocked: "adv.change.conformanceLocked",
  conformanceVerdict: "adv.change.conformanceVerdict",
  conformanceOverridden: "adv.change.conformanceOverridden",
  archiveRequested: "adv.change.archiveRequested",
  phase9StatusUpdated: "adv.change.phase9StatusUpdated",
  changeCancelled: "adv.change.changeCancelled",
  updateArtifactMetadata: "adv.change.updateArtifactMetadata",
  archiveChange: "adv.change.archiveChange",
  closeChange: "adv.change.closeChange",
} as const;

export function subagentReportKey(input: {
  changeId: string;
  taskId?: string;
  scope?: SubagentReportScope;
  agent: SubagentAgent;
  attempt: number;
}): string {
  if (input.taskId) {
    return `${input.changeId}|${input.taskId}|${input.agent}|${input.attempt}`;
  }
  const scopeId = input.scope
    ? input.scope.kind === "task"
      ? `task:${input.scope.task_id}`
      : `change:${input.scope.scope_key}`
    : "unknown-scope";
  return `${input.changeId}|${scopeId}|${input.agent}|${input.attempt}`;
}

export interface ChangeSummaryPayload {
  changeId: string;
  title: string;
  status: import("../types").ChangeStatus;
  gateProgress: {
    proposal: string;
    discovery: string;
    design: string;
    planning: string;
    execution: string;
    acceptance: string;
    release: string;
  };
  taskCounts: {
    total: number;
    done: number;
    pending: number;
  };
  lastActivityAt: string;
  fast_follow_of?: FastFollowOf;
  /** Union of all task touched_files for this change (for peer overlap scans). */
  touched_files?: string[];
}

// Re-export canonical ArtifactKind from the single source of truth in
// `types/artifacts.ts`. The local positional-style ArtifactKind union that
// previously lived here is deleted; existing callers continue to import
// `ArtifactKind` from this module via the re-export, preserving call sites.
export type { ArtifactKind } from "../types/artifacts";

export interface ArtifactMetadata {
  path: string;
  updatedAt: string;
  contentHash?: string;
  /**
   * Recorded when a content signal was rejected by Layer 2 size-guard
   * (signal handler) per KD-8. State-mutation rejection — the workflow
   * continues and `state.documents[kind]` is unchanged, but the rejection
   * is observable via this metadata field for the tool layer to surface.
   */
  rejection?: {
    reason: "ARTIFACT_OVERSIZED" | "AGGREGATE_OVERSIZED";
    attempted_size: number;
    cap: number;
    rejected_at: string;
  };
  /**
   * Recorded when a content signal triggered the soft-cap warning but was
   * still applied. Informational; does not block writes.
   */
  sizeWarning?: {
    size: number;
    soft_cap: number;
    at: string;
  };
}

export interface ChangeWorkflowInput {
  projectId: string;
  changeId: string;
  title: string;
  initializedAt: string;
  /**
   * When false, workflow handlers skip wf.upsertSearchAttributes() calls.
   * Defaults to true (or undefined, which is treated as true) for backward
   * compatibility. Set to false when Temporal search attributes are not
   * registered on the server to prevent workflow task failures.
   */
  searchAttributesEnabled?: boolean;
  /**
   * External mutable-state changes directory where signal-driven workflows
   * project their downstream JSON cache (`{changeId}.json`). Undefined keeps
   * projection disabled for legacy/test workflows that do not need disk I/O.
   */
  projectionChangesDir?: string;
  /** In-repo project roots that receive durable archive artifacts. */
  archiveProjects?: Array<{ projectPath: string }>;
  seedState?: Partial<
    Pick<
      ChangeWorkflowState,
      | "status"
      | "tasks"
      | "subagent_reports"
      | "deltas"
      | "wisdom"
      | "gates"
      | "reentry_history"
      | "artifacts"
      | "fast_follow_of"
      | "affectedProjects"
      | "affectedPaths"
      | "lastSignalAt"
      | "pendingCheckpoint"
      | "terminated"
      | "acceptanceCriteria"
      | "contract"
      | "documents"
      | "reflections"
      | "worktrees"
      | "conformance"
      | "archiveRequest"
      | "phase9_status"
      | "origin"
      | "cross_project_origin"
      | "cross_project_links"
      | "external_dependencies"
      | "worktree_auto_managed"
      | "target_worktree_path"
      | "scope_worktrees"
      | "seenReportIds"
      | "signal_rejections"
      | "signal_rejections_total"
    >
  >;
}

export type ChangeWorkflowBootstrapState = ChangeWorkflowInput;

export interface CrossProjectCoordinationUpdatedSignalPayload {
  cross_project_links?: Change["cross_project_links"];
  external_dependencies?: Change["external_dependencies"];
  updatedAt: string;
}

export interface SignalRejection {
  signalName: string;
  errorMessage: string;
  errorClass: string;
  payloadDigest: SignalPayloadDigest;
  rejectedAt: string;
}

export interface ChangeWorkflowState extends ChangeWorkflowInput {
  id: string;
  status: import("../types").ChangeStatus;
  createdAt: string;
  tasks: import("../types").Task[];
  subagent_reports?: ScopedSubagentReport[];
  deltas: import("../types").Change["deltas"];
  wisdom: import("../types").WisdomEntry[];
  gates: Gates;
  reentry_history?: import("../types").ReentryHistoryEntry[];
  artifacts: {
    proposal?: ArtifactMetadata;
    problemStatement?: ArtifactMetadata;
    discovery?: ArtifactMetadata;
    design?: ArtifactMetadata;
    agreement?: ArtifactMetadata;
    executiveSummary?: ArtifactMetadata;
    acceptance?: ArtifactMetadata;
  };
  /** Same-project fast-follow lineage (optional) */
  fast_follow_of?: FastFollowOf;
  affectedProjects?: string[];
  affectedPaths?: string[];
  lastSignalAt?: string;
  pendingCheckpoint?: boolean;
  terminated?: boolean;
  acceptanceCriteria?: string[];
  contract?: ChangeContract;
  /**
   * Authoritative artifact content for the change, keyed by canonical
   * `ArtifactKind`. Source of truth for proposal/problemStatement/agreement/
   * design/executiveSummary/acceptance markdown content; disk-resident
   * `.md` files are a derived view materialized only when building the
   * archive bundle.
   *
   * Naming standard: camelCase keys mirror `ArtifactKind` and `ArtifactPayload`
   * (`types/artifacts.ts`). Kebab-case appears only at the filesystem boundary
   * through `ARTIFACT_FILENAME` from `types/artifacts.ts`.
   *
   * Additive optional fields — Temporal replay-safe per safe-deployments
   * contract (https://docs.temporal.io/develop/safe-deployments). Histories
   * predating this extension replay cleanly with `executiveSummary` and
   * `acceptance` undefined.
   */
  documents?: {
    proposal?: string;
    problemStatement?: string;
    agreement?: string;
    design?: string;
    executiveSummary?: string;
    acceptance?: string;
  };
  reflections?: unknown[];
  worktrees?: Record<
    string,
    {
      branch: string;
      path?: string;
      baseRef?: string;
      headSha?: string;
      status: "created" | "deleted";
      createdAt?: string;
      deletedAt?: string;
      deleteReason?: string;
      // Stamped true by applyWorktreeCreatedToState because
      // worktreeCreatedSignal fires only post-setup (advWorktreeCreate
      // Step 7). worktreeExistsForChange requires setupReady===true for the
      // isolation existing-worktree ALLOW probe (rq-worktreeMutationGuard01.4).
      setupReady?: boolean;
    }
  >;
  conformance?: {
    lockedSpecs?: string[];
    lockedAt?: string;
    lastVerdict?: {
      verdict: import("../types").ConformanceVerdict;
      runId: string;
      failed?: Array<
        { rq_id: string; summary: string } & Record<string, unknown>
      >;
      recordedAt: string;
    };
    overrides?: Array<{
      user: string;
      reason: string;
      reVerifyDeadline: string;
      overriddenAt: string;
    }>;
  };
  archiveRequest?: {
    approvalEvidence: string;
    requestedBy: string;
    requestedAt: string;
  };
  phase9_status?: import("../types").Change["phase9_status"];
  /**
   * Closure metadata set when the workflow records a terminal close. Stored
   * on the workflow state explicitly so readers/tests don't have to rely on
   * prototype-pollution-style assignments.
   */
  closure?: ChangeClosure;
  /**
   * Origin linkage to the upstream artifact that triggered this change.
   * Mirrors `ChangeSchema.origin` (on-disk Change type). Populated from
   * `ChangeWorkflowInput.seedState.origin` at workflow start; read by
   * `buildChangeSearchAttributes` to populate `AdvBacklogIssueNumber`
   * search attribute (rq-backlogCoord01).
   */
  origin?: ChangeOrigin;
  /** Cross-project provenance for target follow-up changes. */
  cross_project_origin?: import("../types").Change["cross_project_origin"];
  /** Source-side outbound links to target project follow-up changes. */
  cross_project_links?: import("../types").Change["cross_project_links"];
  /** Advisory dependencies on external project changes. */
  external_dependencies?: import("../types").Change["external_dependencies"];
  /** Deterministic idempotency keys for submitted sub-agent reports. */
  seenReportIds?: string[];

  /**
   * Per-change worktree-auto-managed marker (rq-autoManageAdvWorktrees AC3).
   * Mirrors `ChangeSchema.worktree_auto_managed` on disk. Set by
   * `worktreeAutoManagedSignal`; sticky once a boolean is written.
   */
  worktree_auto_managed?: boolean;

  /**
   * Cross-project worktree path projection (rq-autoManageAdvWorktrees AC4).
   * Mirrors `ChangeSchema.target_worktree_path` on disk. Set by
   * `worktreeAttachedSignal({ role: "target" })`; null after archive
   * cleanup. Registry remains canonical per `rq-worktreeRegistry01`.
   */
  target_worktree_path?: string | null;

  /**
   * Per-`scope_repos[*]` worktree path projection
   * (rq-autoManageAdvWorktrees AC4). Mirrors `ChangeSchema.scope_worktrees`
   * on disk. Keyed by `repo_id`. Set by
   * `worktreeAttachedSignal({ role: "scope", repoId, path })`. Iteration
   * order matches `Object.keys` insertion order, which archive Phase 9
   * cleanup relies on for deterministic per-repo deletion.
   */
  scope_worktrees?: Record<string, string>;

  /**
   * Bounded diagnostics for signal-handler programmer/domain errors that were
   * rejected via state mutation instead of throwing and failing the workflow.
   * Additive optional fields — replay-safe for histories predating ADR 0003.
   */
  signal_rejections?: SignalRejection[];
  signal_rejections_total?: number;
  /**
   * Per-gate criteria evaluated at completion time.
   * Advisory audit trail — criteria are not blocking.
   * Optional for replay-safety — histories predating this field replay
   * cleanly with gateCriteria undefined.
   */
  gateCriteria?: Partial<
    Record<import("../types").GateId, import("../types").GateCriterion[]>
  >;
}

/**
 * Worktree registry record. Per-change context only in the signal-driven
 * architecture; peer sessions read via change workflow queries or Temporal
 * visibility search attributes. rq-wl-branchRegistry01
 */
export type WorktreeRecordStatus =
  | "unmaterialized"
  | "materializing"
  // Set by applyWorktreeCreatedToState on worktreeCreatedSignal (fired at
  // advWorktreeCreate Step 7, post-setup). Setup-ready by construction; the
  // isolation existing-worktree ALLOW probe (worktreeExistsForChange) treats
  // it as a valid non-deleted/non-failed status.
  | "created"
  | "active"
  | "idle"
  | "setup_failed"
  | "pending_delete"
  | "merged"
  | "stale"
  | "deleted";

export interface WorktreeRecord {
  /** Branch name (registry key). */
  branch: string;
  /** Absolute path on disk. Undefined for branch records with no worktree yet. */
  path?: string;
  /** Whether this branch currently has a materialized worktree path. */
  materialized?: boolean;
  /** Owning ADV change id, if any. */
  changeId?: string;
  /** Lifecycle status. `deleted` is a soft-delete marker. */
  status: WorktreeRecordStatus;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-seen heartbeat from any peer session. */
  lastSeenAt: string;
  /**
   * Resolved base ref (default branch) the worktree was created from.
   * Stored explicitly so KD-13 (default-branch resolution) is recorded
   * for audit and for stale-base detection.
   */
  baseRef: string;
  /** HEAD SHA at creation. */
  headSha: string;
  /**
   * Provenance of the registry entry. `tool` = created via
   * `adv_worktree_create`. `git_census` = adopted by the migration
   * reconciliation step from `git worktree list`.
   */
  source: "tool" | "git_census";
  /**
   * Monotonic version per worktree branch for replay-deterministic
   * dedup of out-of-order updates. Mutators skip lower versions and
   * exact duplicate equal-version updates. Equal-version updates with
   * different payloads are promoted by the workflow mutator to avoid
   * same-millisecond multi-session write loss.
   */
  sourceVersion: number;
  /** True when setup hooks passed or legacy record is assumed runnable. */
  setupReady?: boolean;
  /** Setup failure detail when status is `setup_failed`. */
  setupFailureReason?: string;
  /** Git dirty/untracked summary from latest git-first reconciliation. */
  dirty?: boolean;
  /** Whether branch has been integrated into the default branch. */
  merged?: boolean;
  /** Whether cleanup gates currently permit safe deletion. */
  cleanupEligible?: boolean;
  /** Human-readable blockers when cleanupEligible is false. */
  cleanupBlockedBy?: string[];
  /** Pending-delete marker; populated by `setPendingWorktreeDelete`. */
  pendingDelete?: PendingWorktreeDelete;
}

export type MaterializedWorktreeRecord = WorktreeRecord & {
  path: string;
  materialized: true;
};

/**
 * Pending-worktree-delete record. Survives across sessions so a
 * delete that could not complete (worktree still in use, integration
 * gate not satisfied) can be retried by the next session that owns
 * the change.
 */
export interface PendingWorktreeDelete {
  /** Branch name (registry key). */
  branch: string;
  /** Absolute path on disk. */
  path: string;
  /** Reason recorded by the caller that flagged the pending delete. */
  reason: string;
  /** ISO 8601 timestamp when the pending delete was recorded. */
  recordedAt: string;
  /**
   * Number of retry attempts made so far. Incremented by
   * `incrementPendingWorktreeDeleteAttempts`.
   */
  attempts: number;
}

/**
 * Session registry record. Per-change context only in the signal-driven
 * architecture; peer sessions are tracked via process facts, not durable
 * workflow state.
 *
 * Privacy-defensive schema (KD-4, T3 user decision): public surfaces
 * (adv_status peer-sessions, adv_session_list) expose only
 * `sessionId`, `startedAt`, and the worktree basename. PID and full
 * worktree path are own-session-only via `adv_session_show`.
 */
export interface SessionRecord {
  /** Opaque session id (`sess_<8 alphanumeric>`). */
  sessionId: string;
  /** Branch the session is operating against, if any. */
  worktreeBranch?: string;
  /**
   * Absolute worktree path. Internal-only; never surfaced to peers.
   * Public surfaces show basename via privacy-defensive projection.
   */
  worktreePath: string;
  /** Process id of the session. Internal-only; never surfaced to peers. */
  pid: number;
  /** ISO 8601 session start time. */
  startedAt: string;
  /** ISO 8601 last heartbeat. */
  lastSeenAt: string;
  /** Active change the session is working on, if any. Own-session only. */
  activeChangeId?: string;
  /** Current task id, if any. Own-session only. */
  currentTaskId?: string;
  /** Current gate the session is interacting with, if any. Own-session only. */
  activeGate?: string;
}

/**
 * Continue-as-new history thresholds.
 * Tunable via env var ADV_TEMPORAL_CHANGE_HISTORY_THRESHOLD.
 */
export const DEFAULT_CHANGE_HISTORY_THRESHOLD = 5_000;

export interface ContinueAsNewThresholds {
  changeHistoryThreshold: number;
}

export interface ContinueAsNewInfoLike {
  continueAsNewSuggested?: unknown;
  historyLength?: unknown;
}

export function shouldContinueAsNewFromInfo(
  info: ContinueAsNewInfoLike,
  threshold: number,
): boolean {
  if (info.continueAsNewSuggested === true) return true;
  return (
    typeof info.historyLength === "number" && info.historyLength >= threshold
  );
}

export function resolveHistoryThresholds(
  env: Record<string, string | undefined> = {},
): ContinueAsNewThresholds {
  return {
    changeHistoryThreshold: env.ADV_TEMPORAL_CHANGE_HISTORY_THRESHOLD
      ? parseInt(env.ADV_TEMPORAL_CHANGE_HISTORY_THRESHOLD, 10)
      : DEFAULT_CHANGE_HISTORY_THRESHOLD,
  };
}
