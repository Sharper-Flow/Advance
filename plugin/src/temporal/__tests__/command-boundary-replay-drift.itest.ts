import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Worker } from "@temporalio/worker";

import { withTimeSkippingTestWorkflowEnvironment } from "./with-test-env";

const recordingWorkflowsPath = fileURLToPath(
  new URL("./command-boundary-replay.recording-workflow.ts", import.meta.url),
);
const driftWorkflowsPath = fileURLToPath(
  new URL("./command-boundary-replay.drift-workflow.ts", import.meta.url),
);

describe("command-boundary replay determinism", () => {
  it("rejects replay when an activity and timer exchange positions", async () => {
    await withTimeSkippingTestWorkflowEnvironment(async (env) => {
      const taskQueue = "command-boundary-replay-drift";
      const workflowId = "command-boundary-replay-drift";
      const worker = await Worker.create({
        connection: env.nativeConnection,
        workflowsPath: recordingWorkflowsPath,
        activities: { commandBoundaryActivity: async () => undefined },
        taskQueue,
      });

      let history: Awaited<
        ReturnType<
          Awaited<ReturnType<typeof env.client.workflow.start>>["fetchHistory"]
        >
      >;
      await worker.runUntil(async () => {
        const handle = await env.client.workflow.start(
          "commandBoundaryReplayWorkflow",
          { workflowId, taskQueue },
        );
        await handle.result();
        history = await handle.fetchHistory();
      });

      await expect(
        Worker.runReplayHistory(
          {
            workflowsPath: driftWorkflowsPath,
            replayName: "command-boundary-replay-drift",
          },
          history!,
          workflowId,
        ),
      ).rejects.toThrow(/nondeterminism|does not match/i);
    });
  }, 30_000);
});
