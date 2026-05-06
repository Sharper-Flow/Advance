import * as wf from "@temporalio/workflow";
import type {
  ArchiveRequestedPayload,
  GateCompletedPayload,
  GateInProgressPayload,
  ProposalUpdatedPayload,
  SpikeChangeState,
  SpikeGateId,
  SpikeGateState,
  SpikeTask,
  TaskAddedPayload,
} from "./contracts";

export const proposalUpdatedSignal = wf.defineSignal<[ProposalUpdatedPayload]>(
  "spike.change.proposalUpdated",
);
export const taskAddedSignal = wf.defineSignal<[TaskAddedPayload]>(
  "spike.change.taskAdded",
);
export const gateInProgressSignal = wf.defineSignal<[GateInProgressPayload]>(
  "spike.change.gateInProgress",
);
export const gateCompletedSignal = wf.defineSignal<[GateCompletedPayload]>(
  "spike.change.gateCompleted",
);
export const archiveRequestedSignal = wf.defineSignal<
  [ArchiveRequestedPayload]
>("spike.change.archiveRequested");

export const getStateQuery = wf.defineQuery<SpikeChangeState>(
  "spike.change.getState",
);
export const getTasksQuery = wf.defineQuery<SpikeTask[]>(
  "spike.change.getTasks",
);
export const getGateStatusQuery = wf.defineQuery<SpikeGateState, [SpikeGateId]>(
  "spike.change.getGateStatus",
);
