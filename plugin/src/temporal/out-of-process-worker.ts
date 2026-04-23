/**
 * Out-of-process Temporal worker — now backed by the shared multi-queue host.
 *
 * Externally identical to the previous per-queue-child implementation.
 * Internally delegates to `createMultiWorker` which runs a single Node child
 * that polls all registered task queues.
 *
 * The migration from per-queue children to a single shared child reduces
 * process overhead (memory, startup latency, Node binary loads) when the
 * plugin needs workers on multiple queues.
 *
 * See `worker-multi.ts` for IPC protocol and lifecycle details.
 */

import type { InProcessWorker } from "./in-process-worker";
import { createMultiWorker } from "./worker-multi";

export const OOP_SHUTDOWN_GRACE_MS = 5_000;

export interface OutOfProcessWorkerInput {
  address: string;
  namespace: string;
  queues: readonly string[];
  workerScript: string;
  projectId: string;
  nodeEnv?: NodeJS.ProcessEnv;
}

export interface OutOfProcessWorker extends InProcessWorker {
  isAlive(): boolean;
  getDiagnostics(): Array<{
    queue: string;
    dead: boolean;
    restartCount: number;
    childExitCode: number | null;
    childRunning: boolean;
  }>;
}

export async function createOutOfProcessWorker(
  input: OutOfProcessWorkerInput,
): Promise<OutOfProcessWorker> {
  const multi = await createMultiWorker({
    address: input.address,
    namespace: input.namespace,
    queues: input.queues,
    workerScript: input.workerScript,
    projectId: input.projectId,
    nodeEnv: input.nodeEnv,
  });

  // Adapt MultiWorker to the legacy OutOfProcessWorker interface
  return {
    get queues() {
      return multi.queues;
    },

    async registerQueue(queue: string): Promise<void> {
      return multi.registerQueue(queue);
    },

    async shutdown(): Promise<void> {
      return multi.shutdown();
    },

    isAlive(): boolean {
      return multi.isAlive();
    },

    getDiagnostics() {
      const diag = multi.getDiagnostics();
      // Map aggregated diagnostics to per-queue array for backward compat
      return diag.queues.map((queue) => ({
        queue,
        dead: !diag.childRunning,
        restartCount: diag.restartCount,
        childExitCode: diag.childExitCode,
        childRunning: diag.childRunning,
      }));
    },
  };
}
