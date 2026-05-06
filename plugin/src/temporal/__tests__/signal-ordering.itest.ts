import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type {
  WorkflowHandle,
  WorkflowHandleWithStartDetails,
} from "@temporalio/client";

import { createDefaultGates } from "../../types";
import type { ChangeWorkflowInput, ChangeWorkflowState } from "../contracts";
import { DEFAULT_CHANGE_HISTORY_THRESHOLD } from "../contracts";
import {
  getChangeStateQuery,
  getProcessedMarkersQuery,
  gateCompletedSignal,
  migrationMarkerSignal,
  taskAddedSignal,
} from "../messages";
import { withTestWorkflowEnvironment } from "./with-test-env";

const workflowsPath = fileURLToPath(
  new URL("../workflows.ts", import.meta.url),
);

type ChangeWorkflowHandle = WorkflowHandle<
  typeof import("../workflows").changeWorkflow
>;
type StartedChangeWorkflowHandle = WorkflowHandleWithStartDetails<
  typeof import("../workflows").changeWorkflow
>;

function makeChangeInput(changeId: string): ChangeWorkflowInput {
  return {
    projectId: "signal-ordering-test-project",
    changeId,
    title: `Signal ordering test: ${changeId}`,
    initializedAt: "2026-05-05T00:00:00.000Z",
    searchAttributesEnabled: false,
    seedState: {
      status: "active",
      tasks: [],
      wisdom: [],
      gates: createDefaultGates(),
      reentry_history: [],
    },
  };
}

function makeTask(id: string) {
  return {
    id,
    title: `Task ${id}`,
    type: "code" as const,
    status: "pending" as const,
    priority: 0,
    created_at: "2026-05-05T00:00:00.000Z",
  };
}

async function queryState(
  handle: ChangeWorkflowHandle,
): Promise<ChangeWorkflowState> {
  return handle.query(getChangeStateQuery);
}

async function pollForState(
  handle: ChangeWorkflowHandle,
  predicate: (state: ChangeWorkflowState) => boolean,
  timeoutMs = 60000,
): Promise<ChangeWorkflowState> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await queryState(handle);
    if (predicate(state)) return state;
    await new Promise((r) => setTimeout(r, 50));
  }
  const finalState = await queryState(handle);
  throw new Error(
    `State predicate never satisfied within timeout. tasks=${finalState.tasks.length}`,
  );
}

async function signalMigrationMarkerAndWait(
  handle: ChangeWorkflowHandle,
  markerId: string,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pollIntervalMs = options.pollIntervalMs ?? 50;
  await handle.signal(migrationMarkerSignal, { markerId });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const markers = await handle.query(getProcessedMarkersQuery);
    if (markers.includes(markerId)) return;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(
    `Migration marker ${markerId} not seen within ${timeoutMs}ms`,
  );
}

describe("changeWorkflow signal ordering", () => {
  it("uses marker barriers to serialize task and gate replay batches", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const taskQueue = `signal-ordering-${Date.now()}`;
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
        });

        await worker.runUntil(async () => {
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `signal-ordering-${Date.now()}`,
            taskQueue,
            args: [makeChangeInput("ordering-batch-test")],
          });

          const taskIds = Array.from(
            { length: 25 },
            (_, i) => `ordered-tk-${String(i).padStart(2, "0")}`,
          );
          for (const taskId of taskIds) {
            await handle.signal(taskAddedSignal, {
              task: makeTask(taskId),
              addedAt: "2026-05-05T00:00:00.000Z",
            });
          }

          await signalMigrationMarkerAndWait(handle, "tasks-batch-complete", {
            timeoutMs: 10000,
            pollIntervalMs: 10,
          });

          await handle.signal(gateCompletedSignal, {
            gateId: "proposal",
            approvalEvidence: "tasks replayed before gate",
            completedBy: "migration-test",
            completedAt: "2026-05-05T00:01:00.000Z",
          });
          await signalMigrationMarkerAndWait(handle, "gate-proposal-complete", {
            timeoutMs: 10000,
            pollIntervalMs: 10,
          });

          const state = await queryState(handle);
          const markers = await handle.query(getProcessedMarkersQuery);

          expect(state.tasks.map((t) => t.id)).toEqual(taskIds);
          expect(state.gates.proposal?.status).toBe("done");
          expect(markers).toEqual([
            "tasks-batch-complete",
            "gate-proposal-complete",
          ]);
        });
      },
    );
  }, 60000);

  it("preserves processed marker barriers across continue-as-new", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const taskQueue = `signal-ordering-can-${Date.now()}`;
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
        });

        await worker.runUntil(async () => {
          const workflowId = `signal-ordering-can-${Date.now()}`;
          const handle: StartedChangeWorkflowHandle =
            await env.client.workflow.start("changeWorkflow", {
              workflowId,
              taskQueue,
              args: [makeChangeInput("ordering-can-test")],
            });
          const firstRunId = handle.firstExecutionRunId;

          await signalMigrationMarkerAndWait(handle, "before-can", {
            timeoutMs: 10000,
            pollIntervalMs: 10,
          });

          const signalCount = DEFAULT_CHANGE_HISTORY_THRESHOLD + 200;
          const signalResults = await Promise.allSettled(
            Array.from({ length: signalCount }, (_, i) =>
              handle.signal(taskAddedSignal, {
                task: makeTask(`can-tk-${i}`),
                addedAt: "2026-05-05T00:00:00.000Z",
              }),
            ),
          );
          expect(
            signalResults.filter((r) => r.status === "rejected"),
          ).toHaveLength(0);

          const latestHandle =
            env.client.workflow.getHandle<
              typeof import("../workflows").changeWorkflow
            >(workflowId);
          await pollForState(
            latestHandle,
            (s) => s.tasks.length === signalCount,
            60000,
          );
          const description = await latestHandle.describe();
          expect(description.runId).not.toBe(firstRunId);

          const currentRunHandle = env.client.workflow.getHandle<
            typeof import("../workflows").changeWorkflow
          >(workflowId, description.runId);
          await signalMigrationMarkerAndWait(currentRunHandle, "after-can", {
            timeoutMs: 10000,
            pollIntervalMs: 10,
          });

          const markers = await currentRunHandle.query(
            getProcessedMarkersQuery,
          );

          expect(markers).toEqual(["before-can", "after-can"]);
        });
      },
    );
  }, 60000);
});
