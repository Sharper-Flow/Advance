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
}

export interface ChangeWorkflowBootstrapState extends ChangeWorkflowInput {}

export interface ChangeWorkflowState extends ChangeWorkflowInput {
  id: string;
  title: string;
  status: "draft" | "pending" | "active" | "archived" | "closed";
  createdAt: string;
  tasks: import("../types").Task[];
  wisdom: import("../types").WisdomEntry[];
  gates: import("../types").Gates;
  reentry_history: import("../types").ReentryHistoryEntry[];
  artifacts: Partial<Record<ArtifactKind, ArtifactMetadata>>;
}

export interface ProjectWorkflowInput {
  projectId: string;
  initializedAt: string;
}

export interface ProjectWorkflowBootstrapState extends ProjectWorkflowInput {}
