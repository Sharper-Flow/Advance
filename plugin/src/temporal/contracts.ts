import type { ChangeClosure, Gates } from "../types";

export const ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX = "advance";
export const DEFAULT_TEMPORAL_ADDRESS = "127.0.0.1:7233";
export const DEFAULT_TEMPORAL_NAMESPACE = "default";

export const CHANGE_WORKFLOW_NAME = "changeWorkflow";
export const PROJECT_WORKFLOW_NAME = "projectWorkflow";

export const CHANGE_WORKFLOW_QUERY_NAMES = {
  bootstrap: "adv.change.bootstrap",
  state: "adv.change.state",
  tasks: "adv.change.tasks",
  ready: "adv.change.ready",
  task: "adv.change.task",
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
  setTaskPhase: "adv.change.setTaskPhase",
  cancelTask: "adv.change.cancelTask",
  reclassifyTaskTdd: "adv.change.reclassifyTaskTdd",
  completeGate: "adv.change.completeGate",
  reopenFromGate: "adv.change.reopenFromGate",
  addWisdom: "adv.change.addWisdom",
  updateArtifactMetadata: "adv.change.updateArtifactMetadata",
  closeChange: "adv.change.closeChange",
} as const;

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
  seedState?: Partial<
    Pick<
      ChangeWorkflowState,
      "status" | "tasks" | "wisdom" | "gates" | "reentry_history" | "artifacts"
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
  source: "json" | "sqlite" | "external_state" | "temporal";
  status: "pending" | "done" | "failed";
  recordedAt: string;
  detail?: string;
}

export interface ProjectWorkflowState extends ProjectWorkflowInput {
  agenda: import("../types").AgendaItem[];
  project_wisdom: ProjectWisdomEntry[];
  migration_ledger: MigrationLedgerEntry[];
}
