/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the Temporal cutover
 * decision is made.
 */

import { fileURLToPath } from "node:url";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";

export async function createIntegrationHarness(taskQueue: string) {
  const env = await TestWorkflowEnvironment.createTimeSkipping();
  const worker = await Worker.create({
    connection: env.nativeConnection,
    taskQueue,
    workflowsPath: fileURLToPath(
      new URL("../../workflows.ts", import.meta.url),
    ),
    activities: {},
  });

  return { env, worker };
}
