import * as wf from "@temporalio/workflow";
import {
  createSpikeChangeState,
  type SpikeChangeWorkflowInput,
  type SpikeProjection,
} from "./contracts";
import {
  archiveRequestedSignal,
  changeCancelledSignal,
  conformanceVerdictSignal,
  gateAwaitingApprovalSignal,
  gateCompletedSignal,
  gateInProgressSignal,
  gateStuckSignal,
  getConformanceStateQuery,
  getGateStatusQuery,
  getProcessedMarkersQuery,
  getStateQuery,
  getTasksQuery,
  migrationMarkerSignal,
  proposalUpdatedSignal,
  taskAddedSignal,
} from "./messages";

interface SpikeActivities {
  writeChangeProjection(input: SpikeProjection): Promise<void>;
}

const { writeChangeProjection } = wf.proxyActivities<SpikeActivities>({
  startToCloseTimeout: "5 seconds",
});

export async function spikeChangeWorkflow(
  input: SpikeChangeWorkflowInput,
): Promise<void> {
  const state = createSpikeChangeState(input);
  const historyLengthThreshold = input.historyLengthThreshold ?? 5_000;

  const recordSignal = (): void => {
    state.signalCount += 1;
  };

  const shouldContinueAsNew = (): boolean => {
    const info = wf.workflowInfo();
    return (
      info.continueAsNewSuggested || info.historyLength > historyLengthThreshold
    );
  };

  wf.setHandler(getStateQuery, () => state);
  wf.setHandler(getTasksQuery, () => [...state.tasks]);
  wf.setHandler(getGateStatusQuery, (gateId) => state.gates[gateId]);
  wf.setHandler(getConformanceStateQuery, () => state.conformance);
  const processedMarkers: string[] = [];
  wf.setHandler(getProcessedMarkersQuery, () => [...processedMarkers]);

  const projectState = async (projectedAt: string): Promise<void> => {
    await writeChangeProjection({
      schemaVersion: 2,
      projectedAt,
      state: JSON.parse(JSON.stringify(state)) as typeof state,
    });
    state.projectionWrites += 1;
  };

  wf.setHandler(proposalUpdatedSignal, (payload) => {
    recordSignal();
    state.proposal = { text: payload.text, updatedAt: payload.updatedAt };
  });

  wf.setHandler(taskAddedSignal, (payload) => {
    recordSignal();
    state.tasks.push(payload.task);
  });

  wf.setHandler(gateInProgressSignal, (payload) => {
    recordSignal();
    state.gates[payload.gateId] = {
      id: payload.gateId,
      status: "in_progress",
      updatedAt: payload.triggeredAt,
    };
  });

  wf.setHandler(gateCompletedSignal, async (payload) => {
    recordSignal();
    state.gates[payload.gateId] = {
      id: payload.gateId,
      status: "done",
      updatedAt: payload.completedAt,
    };
    await projectState(payload.completedAt);
  });

  wf.setHandler(gateAwaitingApprovalSignal, async (payload) => {
    recordSignal();
    state.gates[payload.gateId] = {
      id: payload.gateId,
      status: "awaiting_approval",
      updatedAt: payload.triggeredAt,
    };
    await projectState(payload.triggeredAt);
  });

  wf.setHandler(gateStuckSignal, async (payload) => {
    recordSignal();
    state.gates[payload.gateId] = {
      id: payload.gateId,
      status: "stuck",
      updatedAt: payload.triggeredAt,
    };
    await projectState(payload.triggeredAt);
  });

  wf.setHandler(archiveRequestedSignal, async (payload) => {
    recordSignal();
    state.archiveRequested = {
      requestedAt: payload.requestedAt,
      approvalEvidence: payload.approvalEvidence,
    };
    await projectState(payload.requestedAt);
  });

  wf.setHandler(changeCancelledSignal, async (payload) => {
    recordSignal();
    state.closure = {
      reason: payload.reason,
      cancelledAt: payload.cancelledAt,
    };
    await projectState(payload.cancelledAt);
  });

  wf.setHandler(conformanceVerdictSignal, (payload) => {
    recordSignal();
    state.conformance = {
      verdict: payload.verdict,
      recordedAt: payload.recordedAt,
    };
  });

  wf.setHandler(migrationMarkerSignal, (payload) => {
    recordSignal();
    processedMarkers.push(payload.markerId);
  });

  await wf.condition(shouldContinueAsNew);
  await wf.condition(wf.allHandlersFinished);
  await wf.continueAsNew<typeof spikeChangeWorkflow>({
    ...input,
    seedState: {
      ...state,
      continueAsNewCount: state.continueAsNewCount + 1,
    },
  });
}
