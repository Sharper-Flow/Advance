import type { WorkflowHandle } from "@temporalio/client";
import type { spikeChangeWorkflow } from "./workflows";
import type { SpikeMigrationSource } from "./contracts";
import {
  gateCompletedSignal,
  getProcessedMarkersQuery,
  migrationMarkerSignal,
  proposalUpdatedSignal,
  taskAddedSignal,
} from "./messages";

export async function replayMigrationSource(
  handle: WorkflowHandle<typeof spikeChangeWorkflow>,
  source: SpikeMigrationSource,
  markerId: string,
): Promise<void> {
  if (source.proposal) {
    await handle.signal(proposalUpdatedSignal, {
      text: source.proposal,
      updatedAt: source.createdAt,
    });
  }

  for (const task of source.tasks) {
    await handle.signal(taskAddedSignal, {
      task,
      addedAt: source.createdAt,
    });
  }

  for (const gate of source.completedGates) {
    await handle.signal(gateCompletedSignal, gate);
  }

  await handle.signal(migrationMarkerSignal, {
    markerId,
    recordedAt: new Date().toISOString(),
  });
}

export async function waitForMigrationMarker(
  handle: WorkflowHandle<typeof spikeChangeWorkflow>,
  markerId: string,
  maxAttempts = 50,
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const markers = await handle.query(getProcessedMarkersQuery);
    if (markers.includes(markerId)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Migration marker ${markerId} was not processed`);
}
