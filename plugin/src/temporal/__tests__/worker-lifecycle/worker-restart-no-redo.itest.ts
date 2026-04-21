/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the Temporal cutover
 * decision is made.
 */

import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { Worker } from "@temporalio/worker";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { changeWorkflow } from "../../workflows";
import { buildChangeWorkflowId, buildProjectTaskQueue } from "../../client";
import { restartDoesNotRedoCompletedActivities } from "./worker-lifecycle";
import { withTestWorkflowEnvironment } from "../with-test-env";

describe("worker lifecycle - restart no redo", () => {
  it(
    "asserts restart semantics via replay",
    async () => {
      await withTestWorkflowEnvironment(
        () => TestWorkflowEnvironment.createTimeSkipping(),
        async (env) => {
          const taskQueue = buildProjectTaskQueue("validate-temporal-replay");
          const worker = await Worker.create({
            connection: env.nativeConnection,
            taskQueue,
            workflowsPath: fileURLToPath(
              new URL("../../workflows.ts", import.meta.url),
            ),
            activities: {},
          });

          let runPromise: Promise<void> | undefined;

          try {
            runPromise = worker.run();
            const handle = await env.client.workflow.start(changeWorkflow, {
              workflowId: buildChangeWorkflowId(
                "validate-temporal-replay",
                "chg-replay",
              ),
              taskQueue,
              args: [
                {
                  projectId: "validate-temporal-replay",
                  changeId: "chg-replay",
                  title: "Replay Change",
                  initializedAt: "2026-04-20T00:00:00.000Z",
                },
              ],
            });

            const history = await handle.fetchHistory();
            await handle.terminate("captured for replay");

            const result = await restartDoesNotRedoCompletedActivities({
              history,
              workflowsPath: fileURLToPath(
                new URL("../../workflows.ts", import.meta.url),
              ),
            });
            expect(result.pass).toBe(true);
          } finally {
            worker.shutdown();
            await runPromise?.catch(() => undefined);
          }
        },
      );
    },
    15_000,
  );
});
