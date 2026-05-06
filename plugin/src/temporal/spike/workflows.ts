import * as wf from "@temporalio/workflow";
import {
  createSpikeChangeState,
  type SpikeChangeWorkflowInput,
} from "./contracts";
import {
  archiveRequestedSignal,
  gateCompletedSignal,
  gateInProgressSignal,
  getGateStatusQuery,
  getStateQuery,
  getTasksQuery,
  proposalUpdatedSignal,
  taskAddedSignal,
} from "./messages";

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

  wf.setHandler(gateCompletedSignal, (payload) => {
    recordSignal();
    state.gates[payload.gateId] = {
      id: payload.gateId,
      status: "done",
      updatedAt: payload.completedAt,
    };
  });

  wf.setHandler(archiveRequestedSignal, (payload) => {
    recordSignal();
    state.archiveRequested = {
      requestedAt: payload.requestedAt,
      approvalEvidence: payload.approvalEvidence,
    };
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
