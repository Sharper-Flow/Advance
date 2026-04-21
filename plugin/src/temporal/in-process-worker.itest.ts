/**
 * @deprecated Transitional integration test for A4b'. Retained until the
 * migration harness itself is deleted in Phase D (D3b).
 *
 * Integration test proving the in-process multi-queue Temporal worker
 * actually runs a migrateAllProjectsWorkflow against a TestWorkflowEnvironment,
 * dispatches the activity, and returns the activity result — all on one
 * worker instance. This is the test the earlier smoke script approximated
 * with an external dev server; here we prove the same loop without any
 * external dependency.
 */

import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { createInProcessWorker } from "./in-process-worker";
import { migrateAllProjectsWorkflow } from "./migration-workflow";
import type { MigrationSweepResult } from "./migrate-runner";

const WORKFLOWS_PATH = fileURLToPath(
  new URL("./workflows.ts", import.meta.url),
);

describe("createInProcessWorker integration (A4b')", () => {
  let env: TestWorkflowEnvironment;

  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createTimeSkipping();
  }, 60_000);

  afterAll(async () => {
    await env?.teardown();
  });

  it("runs migrateAllProjectsWorkflow through the in-process worker with a stubbed activity", async () => {
    const stubResult: MigrationSweepResult = {
      projectId: "proj-integration",
      migratedChanges: 0,
      status: "done",
    };
    const stubActivities = {
      migrateSingleProjectActivity: async () => stubResult,
    };

    const controlQueue = "integration-control";
    const worker = await createInProcessWorker({
      address: "unused-when-connection-injected",
      namespace: "default",
      queues: [controlQueue],
      workflowsPath: WORKFLOWS_PATH,
      activities: stubActivities,
      connection: env.nativeConnection,
    });

    try {
      const handle = await env.client.workflow.start(
        migrateAllProjectsWorkflow,
        {
          workflowId: `adv/migration/integration-control/run-${Date.now()}`,
          taskQueue: controlQueue,
          args: [
            {
              controlProjectId: "integration-control",
              runId: "run-1",
              projectPaths: ["/tmp/integration/proj-a"],
            },
          ],
        },
      );

      const result = (await handle.result()) as MigrationSweepResult[];
      expect(result).toEqual([stubResult]);
    } finally {
      await worker.shutdown();
    }
  }, 120_000);

  it("registerQueue dynamically adds a queue after the worker is already running", async () => {
    const stubActivities = {
      migrateSingleProjectActivity: async () => ({
        projectId: "late-queue",
        migratedChanges: 0,
        status: "done" as const,
      }),
    };

    const controlQueue = "integration-control-late";
    const worker = await createInProcessWorker({
      address: "unused-when-connection-injected",
      namespace: "default",
      queues: [controlQueue],
      workflowsPath: WORKFLOWS_PATH,
      activities: stubActivities,
      connection: env.nativeConnection,
    });

    try {
      expect(worker.queues).toEqual([controlQueue]);
      await worker.registerQueue("integration-side-queue");
      expect(worker.queues).toEqual([controlQueue, "integration-side-queue"]);
    } finally {
      await worker.shutdown();
    }
  }, 60_000);
});

// Suppress an unused-import lint error for Worker (the integration test
// uses createInProcessWorker, which in turn uses Worker under the hood).
void Worker;
