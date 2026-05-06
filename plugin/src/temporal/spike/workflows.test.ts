import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type { SpikeProjection } from "./contracts";

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
  proposalUpdatedSignal,
  taskAddedSignal,
} from "./messages";
import { replayMigrationSource, waitForMigrationMarker } from "./migration";
import { withTestWorkflowEnvironment } from "../__tests__/with-test-env";

const workflowsPath = fileURLToPath(new URL("./workflows.ts", import.meta.url));

function createProjectionActivities(projections: SpikeProjection[]) {
  return {
    writeChangeProjection: async (projection: SpikeProjection) => {
      projections.push(projection);
    },
  };
}

describe("spike signal-driven change workflow", () => {
  it("applies representative signals and exposes state via queries", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const taskQueue = "advance-spike-test";
        const projections: SpikeProjection[] = [];
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
          activities: createProjectionActivities(projections),
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

  it("accepts 3 concurrent clients firing 50 signals each without loss", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const taskQueue = "advance-spike-concurrent-test";
        const projections: SpikeProjection[] = [];
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
          activities: createProjectionActivities(projections),
        });

        await worker.runUntil(async () => {
          const handle = await env.client.workflow.start(
            "spikeChangeWorkflow",
            {
              workflowId: `spike-concurrent-${Date.now()}`,
              taskQueue,
              args: [
                {
                  changeId: "spike-concurrent",
                  title: "Spike concurrent change",
                  initializedAt: "2026-05-06T00:00:00.000Z",
                },
              ],
            },
          );

          const failures: string[] = [];
          const clientRuns = Array.from({ length: 3 }, (_, clientIndex) =>
            Promise.all(
              Array.from({ length: 50 }, async (_, signalIndex) => {
                const taskId = `tk-client-${clientIndex}-${signalIndex}`;
                try {
                  await handle.signal(taskAddedSignal, {
                    task: {
                      id: taskId,
                      title: `Client ${clientIndex} signal ${signalIndex}`,
                      status: "pending",
                    },
                    addedAt: `2026-05-06T00:${String(clientIndex).padStart(
                      2,
                      "0",
                    )}:${String(signalIndex).padStart(2, "0")}.000Z`,
                  });
                } catch (err) {
                  failures.push(
                    err instanceof Error ? err.message : String(err),
                  );
                }
              }),
            ),
          );

          await Promise.all(clientRuns);

          const tasks = await handle.query(getTasksQuery);
          const taskIds = new Set(tasks.map((task) => task.id));

          expect(failures).toEqual([]);
          expect(tasks).toHaveLength(150);
          expect(taskIds).toHaveLength(150);
        });
      },
    );
  });

  it("continues as new at a safe point and preserves in-flight signals", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const taskQueue = "advance-spike-can-test";
        const workflowId = `spike-can-${Date.now()}`;
        const projections: SpikeProjection[] = [];
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
          activities: createProjectionActivities(projections),
        });

        await worker.runUntil(async () => {
          await env.client.workflow.start("spikeChangeWorkflow", {
            workflowId,
            taskQueue,
            args: [
              {
                changeId: "spike-can",
                title: "Spike continue-as-new change",
                initializedAt: "2026-05-06T00:00:00.000Z",
                historyLengthThreshold: 25,
              },
            ],
          });

          const handle = env.client.workflow.getHandle(workflowId);
          const signalPromises = Array.from({ length: 120 }, (_, index) =>
            handle.signal(taskAddedSignal, {
              task: {
                id: `tk-can-${index}`,
                title: `CAN signal ${index}`,
                status: "pending",
              },
              addedAt: `2026-05-06T00:00:${String(index % 60).padStart(
                2,
                "0",
              )}.000Z`,
            }),
          );

          await Promise.all(signalPromises);

          let state = await handle.query(getStateQuery);
          for (let attempt = 0; attempt < 50; attempt += 1) {
            if (state.continueAsNewCount > 0) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
            state = await handle.query(getStateQuery);
          }

          const taskIds = new Set(state.tasks.map((task) => task.id));

          expect(state.continueAsNewCount).toBeGreaterThanOrEqual(1);
          expect(state.tasks).toHaveLength(120);
          expect(taskIds.size).toBe(120);
        });
      },
    );
  });

  it("projects only gate/terminal signals and reads conformance via query", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const taskQueue = "advance-spike-projection-test";
        const projections: SpikeProjection[] = [];
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
          activities: createProjectionActivities(projections),
        });

        await worker.runUntil(async () => {
          const handle = await env.client.workflow.start(
            "spikeChangeWorkflow",
            {
              workflowId: `spike-projection-${Date.now()}`,
              taskQueue,
              args: [
                {
                  changeId: "spike-projection",
                  title: "Spike projection change",
                  initializedAt: "2026-05-06T00:00:00.000Z",
                },
              ],
            },
          );

          await handle.signal(proposalUpdatedSignal, {
            text: "draft proposal",
            updatedAt: "2026-05-06T00:00:01.000Z",
          });
          await handle.signal(conformanceVerdictSignal, {
            verdict: "PASS",
            recordedAt: "2026-05-06T00:00:02.000Z",
          });

          const conformance = await handle.query(getConformanceStateQuery);
          expect(conformance).toEqual({
            verdict: "PASS",
            recordedAt: "2026-05-06T00:00:02.000Z",
          });
          expect(projections).toEqual([]);

          await handle.signal(gateCompletedSignal, {
            gateId: "proposal",
            completedAt: "2026-05-06T00:00:03.000Z",
          });
          await handle.signal(gateAwaitingApprovalSignal, {
            gateId: "planning",
            evidence: "prep report",
            triggeredAt: "2026-05-06T00:00:04.000Z",
          });
          await handle.signal(gateStuckSignal, {
            gateId: "release",
            reason: "external conformance drift",
            triggeredAt: "2026-05-06T00:00:05.000Z",
          });
          await handle.signal(archiveRequestedSignal, {
            requestedAt: "2026-05-06T00:00:06.000Z",
            approvalEvidence: "archive approval",
          });
          await handle.signal(changeCancelledSignal, {
            reason: "projection test cleanup",
            cancelledAt: "2026-05-06T00:00:07.000Z",
          });

          let state = await handle.query(getStateQuery);
          for (let attempt = 0; attempt < 50; attempt += 1) {
            if (state.projectionWrites === 5) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
            state = await handle.query(getStateQuery);
          }

          expect(state.projectionWrites).toBe(5);
          expect(projections).toHaveLength(5);
          expect(projections.length).toBeLessThanOrEqual(10);
          expect(projections.every((entry) => entry.schemaVersion === 2)).toBe(
            true,
          );
        });
      },
    );
  });

  it("replays a source change and waits on a migration marker barrier", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const taskQueue = "advance-spike-migration-test";
        const projections: SpikeProjection[] = [];
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
          activities: createProjectionActivities(projections),
        });

        await worker.runUntil(async () => {
          const handle = await env.client.workflow.start(
            "spikeChangeWorkflow",
            {
              workflowId: `spike-migration-${Date.now()}`,
              taskQueue,
              args: [
                {
                  changeId: "cleanupzombierunningworkflows",
                  title: "cleanupZombieRunningWorkflows",
                  initializedAt: "2026-05-04T16:02:04.193Z",
                },
              ],
            },
          );

          await replayMigrationSource(
            handle,
            {
              changeId: "cleanupzombierunningworkflows",
              title: "cleanupZombieRunningWorkflows",
              createdAt: "2026-05-04T16:02:04.193Z",
              proposal: "cleanup zombie running workflows",
              tasks: [],
              completedGates: [],
            },
            "marker-cleanupzombierunningworkflows",
          );
          await waitForMigrationMarker(
            handle,
            "marker-cleanupzombierunningworkflows",
          );

          const markers = await handle.query(getProcessedMarkersQuery);
          const state = await handle.query(getStateQuery);

          expect(markers).toContain("marker-cleanupzombierunningworkflows");
          expect(state.changeId).toBe("cleanupzombierunningworkflows");
          expect(state.title).toBe("cleanupZombieRunningWorkflows");
          expect(state.tasks).toEqual([]);
          expect(state.proposal?.text).toBe("cleanup zombie running workflows");
          expect(state.gates.proposal.status).toBe("pending");
        });
      },
    );
  });
});
