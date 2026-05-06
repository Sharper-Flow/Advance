import * as wf from "@temporalio/workflow";
import type {
  ArchiveRequestedPayload,
  ChangeCancelledPayload,
  ConformanceVerdictPayload,
  GateAwaitingApprovalPayload,
  GateCompletedPayload,
  GateInProgressPayload,
  GateStuckPayload,
  MigrationMarkerPayload,
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
export const gateAwaitingApprovalSignal = wf.defineSignal<
  [GateAwaitingApprovalPayload]
>("spike.change.gateAwaitingApproval");
export const gateStuckSignal = wf.defineSignal<[GateStuckPayload]>(
  "spike.change.gateStuck",
);
export const archiveRequestedSignal = wf.defineSignal<
  [ArchiveRequestedPayload]
>("spike.change.archiveRequested");
export const changeCancelledSignal = wf.defineSignal<[ChangeCancelledPayload]>(
  "spike.change.changeCancelled",
);
export const conformanceVerdictSignal = wf.defineSignal<
  [ConformanceVerdictPayload]
>("spike.change.conformanceVerdict");
export const migrationMarkerSignal = wf.defineSignal<[MigrationMarkerPayload]>(
  "spike.change.migrationMarker",
);

export const getStateQuery = wf.defineQuery<SpikeChangeState>(
  "spike.change.getState",
);
export const getTasksQuery = wf.defineQuery<SpikeTask[]>(
  "spike.change.getTasks",
);
export const getGateStatusQuery = wf.defineQuery<SpikeGateState, [SpikeGateId]>(
  "spike.change.getGateStatus",
);
export const getConformanceStateQuery = wf.defineQuery<
  SpikeChangeState["conformance"]
>("spike.change.getConformanceState");
export const getProcessedMarkersQuery = wf.defineQuery<string[]>(
  "spike.change.getProcessedMarkers",
);
