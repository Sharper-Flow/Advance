import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";

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
import { withTestWorkflowEnvironment } from "../__tests__/with-test-env";

const workflowsPath = fileURLToPath(new URL("./workflows.ts", import.meta.url));

describe("spike signal-driven change workflow", () => {
  it("applies representative signals and exposes state via queries", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const taskQueue = "advance-spike-test";
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
        });

        await worker.runUntil(async () => {
          const handle = await env.client.workflow.start(
            "spikeChangeWorkflow",
            {
              workflowId: `spike-change-${Date.now()}`,
              taskQueue,
              args: [
                {
                  changeId: "spike-change",
                  title: "Spike change",
                  initializedAt: "2026-05-06T00:00:00.000Z",
                },
              ],
            },
          );

          await handle.signal(proposalUpdatedSignal, {
            text: "proposal text",
            updatedAt: "2026-05-06T00:00:01.000Z",
          });
          await handle.signal(taskAddedSignal, {
            task: {
              id: "tk-spike",
              title: "Spike task",
              status: "pending",
            },
            addedAt: "2026-05-06T00:00:02.000Z",
          });
          await handle.signal(gateInProgressSignal, {
            gateId: "planning",
            triggeredAt: "2026-05-06T00:00:03.000Z",
          });
          await handle.signal(gateCompletedSignal, {
            gateId: "proposal",
            completedAt: "2026-05-06T00:00:04.000Z",
          });
          await handle.signal(archiveRequestedSignal, {
            requestedAt: "2026-05-06T00:00:05.000Z",
            approvalEvidence: "spike test approval",
          });

          const state = await handle.query(getStateQuery);
          const tasks = await handle.query(getTasksQuery);
          const planningGate = await handle.query(
            getGateStatusQuery,
            "planning",
          );

          expect(state.changeId).toBe("spike-change");
          expect(state.proposal?.text).toBe("proposal text");
          expect(state.archiveRequested?.approvalEvidence).toBe(
            "spike test approval",
          );
          expect(tasks).toEqual([
            expect.objectContaining({ id: "tk-spike", title: "Spike task" }),
          ]);
          expect(planningGate).toEqual(
            expect.objectContaining({ status: "in_progress" }),
          );
        });
      },
    );
  });
});
