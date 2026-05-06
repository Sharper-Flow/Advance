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

  wf.setHandler(getStateQuery, () => state);
  wf.setHandler(getTasksQuery, () => [...state.tasks]);
  wf.setHandler(getGateStatusQuery, (gateId) => state.gates[gateId]);

  wf.setHandler(proposalUpdatedSignal, (payload) => {
    state.proposal = { text: payload.text, updatedAt: payload.updatedAt };
  });

  wf.setHandler(taskAddedSignal, (payload) => {
    state.tasks.push(payload.task);
  });

  wf.setHandler(gateInProgressSignal, (payload) => {
    state.gates[payload.gateId] = {
      id: payload.gateId,
      status: "in_progress",
      updatedAt: payload.triggeredAt,
    };
  });

  wf.setHandler(gateCompletedSignal, (payload) => {
    state.gates[payload.gateId] = {
      id: payload.gateId,
      status: "done",
      updatedAt: payload.completedAt,
    };
  });

  wf.setHandler(archiveRequestedSignal, (payload) => {
    state.archiveRequested = {
      requestedAt: payload.requestedAt,
      approvalEvidence: payload.approvalEvidence,
    };
  });

  await wf.condition(() => false);
}
