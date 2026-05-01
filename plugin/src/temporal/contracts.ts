import type {
  ChangeClosure,
  FastFollowOf,
  Gates,
  TaskRunState,
} from "../types";

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
  bootstrap: "adv.change.bootstrap",
  state: "adv.change.state",
  tasks: "adv.change.tasks",
  ready: "adv.change.ready",
  task: "adv.change.task",
  taskRun: "adv.change.taskRun",
  taskRuns: "adv.change.taskRuns",
} as const;

export const PROJECT_WORKFLOW_QUERY_NAMES = {
  bootstrap: "adv.project.bootstrap",
  state: "adv.project.state",
  agenda: "adv.project.agenda",
  wisdom: "adv.project.wisdom",
  migrationLedger: "adv.project.migrationLedger",
} as const;

export const PROJECT_WORKFLOW_UPDATE_NAMES = {
  addAgendaItem: "adv.project.addAgendaItem",
  updateAgendaItem: "adv.project.updateAgendaItem",
  addWisdom: "adv.project.addWisdom",
  recordMigrationEntry: "adv.project.recordMigrationEntry",
} as const;

export const CHANGE_WORKFLOW_UPDATE_NAMES = {
  addTask: "adv.change.addTask",
  updateTask: "adv.change.updateTask",
  recordTaskEvidence: "adv.change.recordTaskEvidence",
  recordTaskRunEvent: "adv.change.recordTaskRunEvent",
  setTaskPhase: "adv.change.setTaskPhase",
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
  seedState?: Partial<
    Pick<
      ChangeWorkflowState,
      | "status"
      | "tasks"
      | "wisdom"
      | "gates"
      | "reentry_history"
      | "artifacts"
      | "task_runs"
      | "fast_follow_of"
    >
  >;
}

export type ChangeWorkflowBootstrapState = ChangeWorkflowInput;

export interface ChangeWorkflowState extends ChangeWorkflowInput {
  id: string;
  status: import("../types").ChangeStatus;
  createdAt: string;
  tasks: import("../types").Task[];
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
  task_runs?: Record<string, TaskRunState>;
  /** Same-project fast-follow lineage (optional) */
  fast_follow_of?: FastFollowOf;
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

export interface ProjectWorkflowState extends ProjectWorkflowInput {
  agenda: import("../types").AgendaItem[];
  project_wisdom: ProjectWisdomEntry[];
  migration_ledger: MigrationLedgerEntry[];
  /** Durable index: changeId → ChangeSummaryPayload (populated by signals) */
  change_summaries: Record<string, ChangeSummaryPayload>;
  /** Monotonic version tracking per change for dedupe */
  source_versions: Record<string, number>;
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
