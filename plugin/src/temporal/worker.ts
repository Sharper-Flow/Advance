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

export async function runTemporalWorkerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
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
