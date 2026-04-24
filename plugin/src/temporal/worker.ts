import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities";
import { getTemporalAddress, getTemporalNamespace } from "./client";

function resolveWorkflowsPath(): string {
  const jsPath = fileURLToPath(new URL("./workflows.js", import.meta.url));
  if (existsSync(jsPath)) return jsPath;
  return fileURLToPath(new URL("./workflows.ts", import.meta.url));
}

export interface TemporalWorkerOptions {
  address?: string;
  namespace?: string;
  taskQueue: string;
  workflowsPath?: string;
}

export async function runTemporalWorker(
  options: TemporalWorkerOptions,
): Promise<void> {
  const connection = await NativeConnection.connect({
    address: options.address ?? getTemporalAddress(),
  });

  try {
    const worker = await Worker.create({
      connection,
      namespace: options.namespace ?? getTemporalNamespace(),
      taskQueue: options.taskQueue,
      workflowsPath: options.workflowsPath ?? resolveWorkflowsPath(),
      activities,
    });

    await worker.run();
  } finally {
    await connection.close();
  }
}

/**
 * Run multiple Temporal Workers concurrently, one per task queue, sharing a
 * single NativeConnection. The multi-queue model is activated when the
 * parent sets `ADV_TEMPORAL_MULTI_QUEUE=1` and a comma-separated
 * `ADV_TEMPORAL_TASK_QUEUES` list. The child registers all queues up front,
 * then runs them in parallel so the server sees a poller per queue.
 *
 * Parent-side IPC (register / unregister) is not yet wired to the live
 * worker set here; see `worker-multi.ts` for the parent protocol. The
 * initial queue set is the common case that unblocks polling today.
 */
export async function runMultiQueueTemporalWorker(
  taskQueues: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (taskQueues.length === 0) {
    throw new Error(
      "ADV_TEMPORAL_TASK_QUEUES must list at least one task queue",
    );
  }

  const connection = await NativeConnection.connect({
    address: getTemporalAddress(env),
  });

  try {
    const namespace = getTemporalNamespace(env);
    const workflowsPath = resolveWorkflowsPath();
    const workers = await Promise.all(
      taskQueues.map((taskQueue) =>
        Worker.create({
          connection,
          namespace,
          taskQueue,
          workflowsPath,
          activities,
        }),
      ),
    );

    await Promise.all(workers.map((worker) => worker.run()));
  } finally {
    await connection.close();
  }
}

export async function runTemporalWorkerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  // Multi-queue mode: parent spawns one Node child that polls many queues.
  // Contract: `ADV_TEMPORAL_MULTI_QUEUE=1` + `ADV_TEMPORAL_TASK_QUEUES=q1,q2`.
  // See `worker-multi.ts`.
  if (env.ADV_TEMPORAL_MULTI_QUEUE === "1") {
    const raw = env.ADV_TEMPORAL_TASK_QUEUES ?? "";
    const queues = raw
      .split(",")
      .map((q) => q.trim())
      .filter((q) => q.length > 0);
    if (queues.length === 0) {
      throw new Error(
        "ADV_TEMPORAL_MULTI_QUEUE=1 but ADV_TEMPORAL_TASK_QUEUES is empty",
      );
    }
    await runMultiQueueTemporalWorker(queues, env);
    return;
  }

  const taskQueue = env.ADV_TEMPORAL_TASK_QUEUE;
  if (!taskQueue) {
    throw new Error("ADV_TEMPORAL_TASK_QUEUE is required to start worker");
  }

  await runTemporalWorker({
    address: getTemporalAddress(env),
    namespace: getTemporalNamespace(env),
    taskQueue,
  });
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
  runTemporalWorkerFromEnv().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
