import type { ChangeClosure, FastFollowOf, Gates } from "../types";

export const ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX = "advance";
export const DEFAULT_TEMPORAL_ADDRESS = "127.0.0.1:7233";
export const DEFAULT_TEMPORAL_NAMESPACE = "default";

export const CHANGE_WORKFLOW_NAME = "changeWorkflow";
export const PROJECT_WORKFLOW_NAME = "projectWorkflow";

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
  getWorktrees: "adv.change.getWorktrees",
  getConformanceState: "adv.change.getConformanceState",
  getProcessedMarkers: "adv.change.getProcessedMarkers",
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

export const PROJECT_WORKFLOW_QUERY_NAMES = {
  bootstrap: "adv.project.bootstrap",
  state: "adv.project.state",
  agenda: "adv.project.agenda",
  wisdom: "adv.project.wisdom",
  migrationLedger: "adv.project.migrationLedger",
  worktreeRegistry: "adv.project.worktreeRegistry",
  materializedWorktrees: "adv.project.materializedWorktrees",
} as const;

export const PROJECT_WORKFLOW_UPDATE_NAMES = {
  addAgendaItem: "adv.project.addAgendaItem",
  updateAgendaItem: "adv.project.updateAgendaItem",
  addWisdom: "adv.project.addWisdom",
  recordMigrationEntry: "adv.project.recordMigrationEntry",
  /**
   * adv_archive_purge support: removes a single change from
   * `change_summaries` and `source_versions`. See rq-archivePurge01.
   */
  purgeChangeSummary: "adv.project.purgeChangeSummary",
  /**
   * Worktree + session lifecycle updates (T4, KD-1).
   * Spec anchors: rq-worktreeRegistry01 + rq-multiSessionCoordination01.
   * State authority for worktrees and sessions lives inside this project
   * workflow (no SQLite or sidecar JSONL); peer sessions coordinate via
   * these workflow updates.
   */
  addWorktreeSession: "adv.project.addWorktreeSession",
  updateWorktreeRecord: "adv.project.updateWorktreeRecord",
  removeWorktreeSession: "adv.project.removeWorktreeSession",
  setPendingWorktreeDelete: "adv.project.setPendingWorktreeDelete",
  clearPendingWorktreeDelete: "adv.project.clearPendingWorktreeDelete",
  incrementPendingWorktreeDeleteAttempts:
    "adv.project.incrementPendingWorktreeDeleteAttempts",
  registerSession: "adv.project.registerSession",
  unregisterSession: "adv.project.unregisterSession",
  updateSessionActivity: "adv.project.updateSessionActivity",
} as const;

export const CHANGE_WORKFLOW_UPDATE_NAMES = {
  addTask: "adv.change.addTask",
  updateTask: "adv.change.updateTask",
  cancelTask: "adv.change.cancelTask",
  reclassifyTaskTdd: "adv.change.reclassifyTaskTdd",
  completeGate: "adv.change.completeGate",
  reopenFromGate: "adv.change.reopenFromGate",
  addWisdom: "adv.change.addWisdom",
  updateArtifactMetadata: "adv.change.updateArtifactMetadata",
  archiveChange: "adv.change.archiveChange",
  closeChange: "adv.change.closeChange",
} as const;

export const CHANGE_WORKFLOW_SIGNAL_NAMES = {
  applyChangeSummary: "adv.change.applyChangeSummary",
  proposalUpdated: "adv.change.proposalUpdated",
  problemStatementUpdated: "adv.change.problemStatementUpdated",
  agreementUpdated: "adv.change.agreementUpdated",
  designUpdated: "adv.change.designUpdated",
  acceptanceCriteriaSet: "adv.change.acceptanceCriteriaSet",
  taskAdded: "adv.change.taskAdded",
  taskUpdated: "adv.change.taskUpdated",
  taskRemoved: "adv.change.taskRemoved",
  taskAssigned: "adv.change.taskAssigned",
  taskCompleted: "adv.change.taskCompleted",
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
  conformanceLocked: "adv.change.conformanceLocked",
  conformanceVerdict: "adv.change.conformanceVerdict",
  conformanceOverridden: "adv.change.conformanceOverridden",
  archiveRequested: "adv.change.archiveRequested",
  changeCancelled: "adv.change.changeCancelled",
  migrationMarker: "adv.change.migrationMarker",
} as const;

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
  sourceVersion: number;
  /** Union of all task touched_files for this change (for peer overlap scans). */
  touched_files?: string[];
}

export type ArtifactKind =
  | "proposal"
  | "problemStatement"
  | "agreement"
  | "design";

export interface ArtifactMetadata {
  path: string;
  updatedAt: string;
  contentHash?: string;
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
      | "documents"
      | "reflections"
      | "worktrees"
      | "conformance"
      | "archiveRequest"
    >
  >;
}

export type ChangeWorkflowBootstrapState = ChangeWorkflowInput;

export interface ChangeWorkflowState extends ChangeWorkflowInput {
  id: string;
  status: import("../types").ChangeStatus;
  createdAt: string;
  tasks: import("../types").Task[];
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
  };
  /** Same-project fast-follow lineage (optional) */
  fast_follow_of?: FastFollowOf;
  affectedProjects?: string[];
  affectedPaths?: string[];
  lastSignalAt?: string;
  pendingCheckpoint?: boolean;
  terminated?: boolean;
  acceptanceCriteria?: string[];
  documents?: {
    proposal?: string;
    problemStatement?: string;
    agreement?: string;
    design?: string;
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
  /**
   * Closure metadata set when the workflow records a terminal close. Stored
   * on the workflow state explicitly so readers/tests don't have to rely on
   * prototype-pollution-style assignments.
   */
  closure?: ChangeClosure;
}

export interface ProjectWorkflowInput {
  projectId: string;
  initializedAt: string;
  agenda?: import("../types").AgendaItem[];
  projectWisdom?: ProjectWisdomEntry[];
  migrationLedger?: MigrationLedgerEntry[];
  changeSummaries?: Record<string, ChangeSummaryPayload>;
  sourceVersions?: Record<string, number>;
  /**
   * Maximum number of entries to keep in `change_summaries`. When the
   * registry exceeds this cap, the oldest archived entry (by
   * `lastActivityAt`) is evicted on each subsequent insert. Active and
   * other non-archived statuses are never evicted.
   *
   * Defaults to `DEFAULT_CHANGE_SUMMARIES_CAP` (50). Resolve from the
   * `ADV_CHANGE_SUMMARIES_CAP` env var via `resolveChangeSummariesCap`.
   *
   * Spec: rq-changeSummariesCap01.
   */
  changeSummariesCap?: number;
  /**
   * Worktree + session registries (T4, KD-1).
   * Optional on input so existing seedState payloads remain compatible;
   * `createProjectWorkflowState` initializes to `{}` when omitted.
   * Spec: rq-worktreeRegistry01.
   */
  worktreeRegistry?: Record<string, WorktreeRecord>;
  pendingWorktreeDeletes?: Record<string, PendingWorktreeDelete>;
  sessionRegistry?: Record<string, SessionRecord>;
}

export type ProjectWorkflowBootstrapState = ProjectWorkflowInput;

export interface ProjectWisdomEntry {
  id: string;
  type: import("../types").WisdomType;
  content: string;
  sourceChange?: string;
  sourceTask?: string;
  promotedAt: string;
  tags?: string[];
  invalidatedBy?: string;
}

export interface MigrationLedgerEntry {
  key: string;
  source: "json" | "external_state" | "temporal";
  status: "pending" | "done" | "failed";
  recordedAt: string;
  detail?: string;
}

/**
 * Worktree registry record. State authority for ADV-managed worktrees
 * lives inside `ProjectWorkflowState.worktree_registry`. Peer sessions
 * read this registry via the project workflow query path; no sidecar
 * SQLite or JSONL is involved.
 *
 * Spec anchors: rq-worktreeRegistry01, rq-multiSessionCoordination01.
 */
export type WorktreeRecordStatus =
  | "unmaterialized"
  | "materializing"
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
 * Session registry record. Tracks live OpenCode sessions for the
 * project so peers can be enumerated (`adv_session_list`) and queried
 * (`adv_session_show`, own-session-only via two-factor ACL).
 *
 * Privacy-defensive schema (KD-4, T3 user decision): public surfaces
 * (adv_status peer-sessions, adv_session_list) expose only
 * `sessionId`, `startedAt`, and the worktree basename. PID and full
 * worktree path are stored here for own-session diagnostics
 * (`adv_session_show` after two-factor ACL) and never exposed to
 * peer-facing surfaces.
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

export interface ProjectWorkflowState extends ProjectWorkflowInput {
  agenda: import("../types").AgendaItem[];
  project_wisdom: ProjectWisdomEntry[];
  migration_ledger: MigrationLedgerEntry[];
  /** Durable index: changeId → ChangeSummaryPayload (populated by signals) */
  change_summaries: Record<string, ChangeSummaryPayload>;
  /** Monotonic version tracking per change for dedupe */
  source_versions: Record<string, number>;
  /**
   * Resolved cap for `change_summaries`. Eviction (oldest archived by
   * `lastActivityAt`) runs whenever an insert pushes the registry size
   * past this cap. Cached on state so the workflow is replay-deterministic
   * — re-resolving from env at replay time would not be deterministic.
   *
   * Spec: rq-changeSummariesCap01.
   */
  change_summaries_cap: number;
  /**
   * Worktree registry (T4, KD-1). State authority for ADV-managed
   * worktrees lives here; sidecar SQLite/JSONL is forbidden.
   * Spec: rq-worktreeRegistry01.
   */
  worktree_registry: Record<string, WorktreeRecord>;
  /**
   * Pending-worktree-delete registry (T4, KD-1). Survives across
   * sessions so a delete that could not complete is retried by the
   * next session.
   */
  pending_worktree_deletes: Record<string, PendingWorktreeDelete>;
  /**
   * Session registry (T4, KD-1, KD-4). Tracks live OpenCode sessions
   * for the project. Privacy-defensive: only sessionId/startedAt/
   * worktree basename are exposed to peer-facing surfaces; PID and
   * full worktree path are own-session-only.
   * Spec: rq-multiSessionCoordination01.
   */
  session_registry: Record<string, SessionRecord>;
}

/**
 * Default cap for the parent project workflow's `change_summaries`
 * registry. Tunable via the `ADV_CHANGE_SUMMARIES_CAP` env var, resolved
 * once at workflow bootstrap and cached on state for replay determinism.
 *
 * Rationale: 50 is a conservative default informed by the field measurement
 * that mature projects with 250+ archived changes hit > 4s per
 * project-scoped MCP call; capping at 50 keeps the in-memory iteration cost
 * bounded while supporting recently-relevant changes without disk fallback.
 *
 * Spec: rq-changeSummariesCap01.
 */
export const DEFAULT_CHANGE_SUMMARIES_CAP = 50;

export function resolveChangeSummariesCap(
  env: Record<string, string | undefined> = {},
): number {
  const raw = env.ADV_CHANGE_SUMMARIES_CAP;
  if (!raw) return DEFAULT_CHANGE_SUMMARIES_CAP;
  const parsed = parseInt(raw, 10);
  // Guard against NaN, negative, and zero — fall back to the default.
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CHANGE_SUMMARIES_CAP;
  }
  return parsed;
}

/**
 * Continue-as-new history thresholds.
 * Tunable via env vars ADV_TEMPORAL_PROJECT_HISTORY_THRESHOLD and
 * ADV_TEMPORAL_CHANGE_HISTORY_THRESHOLD.
 */
export const DEFAULT_PROJECT_HISTORY_THRESHOLD = 10_000;
export const DEFAULT_CHANGE_HISTORY_THRESHOLD = 2_000;

export interface ContinueAsNewThresholds {
  projectHistoryThreshold: number;
  changeHistoryThreshold: number;
}

export function resolveHistoryThresholds(
  env: Record<string, string | undefined> = {},
): ContinueAsNewThresholds {
  return {
    projectHistoryThreshold: env.ADV_TEMPORAL_PROJECT_HISTORY_THRESHOLD
      ? parseInt(env.ADV_TEMPORAL_PROJECT_HISTORY_THRESHOLD, 10)
      : DEFAULT_PROJECT_HISTORY_THRESHOLD,
    changeHistoryThreshold: env.ADV_TEMPORAL_CHANGE_HISTORY_THRESHOLD
      ? parseInt(env.ADV_TEMPORAL_CHANGE_HISTORY_THRESHOLD, 10)
      : DEFAULT_CHANGE_HISTORY_THRESHOLD,
  };
}

/**
 * Project workflow precondition guard (T4, KD-1, peer-review F1).
 *
 * Invoked by the 8 worktree/session lifecycle mutators (T6) before
 * mutating state. Confirms the workflow has been bootstrapped to a
 * shape that supports the new registries — i.e. the worktree/session
 * registry fields are present (initialized to `{}` by
 * `createProjectWorkflowState`).
 *
 * Throws `WorkflowNotReadyError` when the workflow state predates the
 * v1.5.0 schema (e.g. seeded from an older snapshot that did not yet
 * carry the new registries) so callers receive a deterministic error
 * with the recommended remediation hint instead of a NPE on
 * `state.worktree_registry`.
 *
 * Spec anchors: rq-worktreeRegistry01, rq-multiSessionCoordination01.
 */
export class WorkflowNotReadyError extends Error {
  readonly code = "WORKFLOW_NOT_READY";
  readonly hint: string;
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(
      `Project workflow not ready: missing required field(s): ${missing.join(
        ", ",
      )}. Hint: run adv_workflow_repair to rebuild project workflow state.`,
    );
    this.name = "WorkflowNotReadyError";
    this.hint = "run adv_workflow_repair";
    this.missing = missing;
  }
}

export function assertProjectWorkflowReachable(
  state:
    | Partial<
        Pick<
          ProjectWorkflowState,
          "worktree_registry" | "pending_worktree_deletes" | "session_registry"
        >
      >
    | null
    | undefined,
): asserts state is Pick<
  ProjectWorkflowState,
  "worktree_registry" | "pending_worktree_deletes" | "session_registry"
> {
  if (!state) {
    throw new WorkflowNotReadyError([
      "worktree_registry",
      "pending_worktree_deletes",
      "session_registry",
    ]);
  }
  const missing: string[] = [];
  if (!state.worktree_registry) missing.push("worktree_registry");
  if (!state.pending_worktree_deletes) missing.push("pending_worktree_deletes");
  if (!state.session_registry) missing.push("session_registry");
  if (missing.length > 0) throw new WorkflowNotReadyError(missing);
}
