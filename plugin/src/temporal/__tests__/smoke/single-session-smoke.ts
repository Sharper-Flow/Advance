/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the Temporal cutover
 * decision is made.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { changeWorkflow } from "../../workflows";
import {
  addTaskUpdate,
  addChangeWisdomUpdate,
  closeChangeUpdate,
  completeGateUpdate,
  reopenFromGateUpdate,
} from "../../messages";
import { buildChangeWorkflowId, buildProjectTaskQueue } from "../../client";
import { REPLAY_HISTORY_FILES } from "../replay/replay-safety";

export async function runSingleSessionSmoke(input: {
  env?: NodeJS.ProcessEnv;
}): Promise<{
  pass: boolean;
  historyPath: string;
  counters: {
    changesCreated: number;
    tasksAdded: number;
    gatesCompleted: number;
    wisdomAdded: number;
    reentries: number;
  };
}> {
  const env = input.env ?? process.env;
  if ((env.ADV_TEMPORAL_PILOT ?? "").toLowerCase() !== "true") {
    throw new Error(
      "ADV_TEMPORAL_PILOT=true is required to run the smoke session",
    );
  }

  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const projectId = "validate-temporal-smoke";
  const changeId = "chg-smoke";
  const taskQueue = buildProjectTaskQueue(projectId);
  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    taskQueue,
    workflowsPath: fileURLToPath(
      new URL("../../workflows.ts", import.meta.url),
    ),
    activities: {},
  });

  let runPromise: Promise<void> | undefined;
  try {
    runPromise = worker.run();
    const handle = await testEnv.client.workflow.start(changeWorkflow, {
      workflowId: buildChangeWorkflowId(projectId, changeId),
      taskQueue,
      args: [
        {
          projectId,
          changeId,
          title: "Smoke Change",
          initializedAt: "2026-04-20T00:00:00.000Z",
        },
      ],
    });

    const task = await handle.executeUpdate(addTaskUpdate, {
      args: [{ title: "smoke-task" }],
    });
    await handle.executeUpdate(completeGateUpdate, {
      args: ["proposal", "smoke", "agent"],
    });
    await handle.executeUpdate(addChangeWisdomUpdate, {
      args: ["pattern", "smoke-wisdom", task.id],
    });
    await handle.executeUpdate(reopenFromGateUpdate, {
      args: ["proposal", "smoke reentry", "delta", "evidence"],
    });
    await handle.executeUpdate(closeChangeUpdate, {
      args: [
        {
          reason: "superseded",
          approved_by_user: true,
          approved_at: "2026-04-20T00:10:00.000Z",
          approval_evidence: "approved",
        },
      ],
    });

    const history = await handle.fetchHistory();
    await mkdir(
      fileURLToPath(new URL("../replay/histories/", import.meta.url)),
      {
        recursive: true,
      },
    );
    await writeFile(
      REPLAY_HISTORY_FILES.smokeCaptured,
      JSON.stringify(history, null, 2),
    );
    await handle.terminate("smoke complete");

    return {
      pass: true,
      historyPath: REPLAY_HISTORY_FILES.smokeCaptured,
      counters: {
        changesCreated: 1,
        tasksAdded: 1,
        gatesCompleted: 1,
        wisdomAdded: 1,
        reentries: 1,
      },
    };
  } finally {
    worker.shutdown();
    await runPromise?.catch(() => undefined);
    await testEnv.teardown();
  }
}
