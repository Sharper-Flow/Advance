export type SpikeGateId =
  | "proposal"
  | "discovery"
  | "design"
  | "planning"
  | "execution"
  | "acceptance"
  | "release";

export type SpikeGateStatus =
  | "pending"
  | "in_progress"
  | "awaiting_approval"
  | "stuck"
  | "done";

export interface SpikeChangeWorkflowInput {
  changeId: string;
  title: string;
  initializedAt: string;
}

export interface SpikeTask {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "done" | "cancelled";
}

export interface SpikeGateState {
  id: SpikeGateId;
  status: SpikeGateStatus;
  updatedAt?: string;
}

export interface SpikeChangeState {
  changeId: string;
  title: string;
  initializedAt: string;
  proposal?: { text: string; updatedAt: string };
  tasks: SpikeTask[];
  gates: Record<SpikeGateId, SpikeGateState>;
  archiveRequested?: { requestedAt: string; approvalEvidence: string };
}

export interface ProposalUpdatedPayload {
  text: string;
  updatedAt: string;
}

export interface TaskAddedPayload {
  task: SpikeTask;
  addedAt: string;
}

export interface GateInProgressPayload {
  gateId: SpikeGateId;
  triggeredAt: string;
}

export interface GateCompletedPayload {
  gateId: SpikeGateId;
  completedAt: string;
}

export interface ArchiveRequestedPayload {
  requestedAt: string;
  approvalEvidence: string;
}

const gateIds: SpikeGateId[] = [
  "proposal",
  "discovery",
  "design",
  "planning",
  "execution",
  "acceptance",
  "release",
];

export function createSpikeChangeState(
  input: SpikeChangeWorkflowInput,
): SpikeChangeState {
  return {
    changeId: input.changeId,
    title: input.title,
    initializedAt: input.initializedAt,
    tasks: [],
    gates: Object.fromEntries(
      gateIds.map((id) => [id, { id, status: "pending" as const }]),
    ) as Record<SpikeGateId, SpikeGateState>,
  };
}
