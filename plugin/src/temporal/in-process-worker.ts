import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities";
import { recordWorkerRunFailure } from "./retry-wrapper";

interface TemporalWorkerInstance {
  run(): Promise<void>;
  shutdown(): void | Promise<void>;
}

/**
 * In-process multi-queue Temporal worker.
 *
 * Replaces the earlier spawn+detach model (one child process per task
 * queue) with a single worker owned by the plugin process. The plugin
 * bootstrap creates one of these; migration code can register additional
 * task queues at runtime (e.g., new per-project queues discovered during
 * the eager migration sweep).
 *
 * Why in-process:
 *   - One lifecycle (no child process cleanup, no stale-bundle hazards
 *     across boots)
 *   - Graceful shutdown via `worker.shutdown()` rather than SIGTERM
 *   - Simpler to reason about + mock in tests
 *
 * Future-direction alternatives (documented at A4e):
 *   - Per-project detached worker processes (isolation)
 *   - Multiple workers per logical shard (scale beyond a single polling loop)
 */

function resolveWorkflowsPath(): string {
  const jsPath = fileURLToPath(new URL("./workflows.js", import.meta.url));
  if (existsSync(jsPath)) return jsPath;
  return fileURLToPath(new URL("./workflows.ts", import.meta.url));
}

export interface InProcessWorker {
  /**
   * Register an additional task queue with the worker. If the queue is
   * already registered, this is a no-op. Returns a promise that resolves
   * once the worker has begun polling the queue.
   */
  registerQueue(taskQueue: string): Promise<void>;

  /**
   * List of queues currently registered on this worker. Useful for
   * health probes and observability.
   */
  readonly queues: readonly string[];

  /** Queues whose Worker.run() promise rejected and no longer count alive. */
  readonly failedQueues?: readonly string[];

  /**
   * Shut the worker down gracefully. Waits for in-flight activities /
   * workflow tasks to drain, then closes the underlying connection.
   * Safe to call multiple times.
   */
  shutdown(): Promise<void>;
}

interface CreateInProcessWorkerInput {
  address: string;
  namespace: string;
  queues: readonly string[];
  workflowsPath?: string;
  /** Optional override for activities (test injection). */
  activities?: Record<string, unknown>;
  /** Optional override for Worker.create (test injection). */
  workerFactory?: (
    options: Parameters<typeof Worker.create>[0],
  ) => Promise<TemporalWorkerInstance>;
  /** Called once when every registered queue has failed outside shutdown. */
  onWorkerExhausted?: () => void | Promise<void>;
  /**
   * Optional override for the NativeConnection factory. Primarily used in
   * tests that pass a TestWorkflowEnvironment native-connection.
   */
  connection?: NativeConnection;
}

/**
 * Create an in-process Temporal worker that polls every queue in `queues`.
 *
 * Uses one `NativeConnection` + one `Worker` per queue (Temporal's SDK
 * requires a Worker instance per task queue; they share the same underlying
 * connection so the cost is bounded). All workers run inside the plugin
 * process — no child processes, no detachment.
 */
export async function createInProcessWorker(
  input: CreateInProcessWorkerInput,
): Promise<InProcessWorker> {
  // When the caller injects a connection (e.g., TestWorkflowEnvironment owns
  // the shared native client), we must NOT close it on shutdown — the caller
  // controls that lifecycle. Closing a caller-owned connection here leaves
  // the environment in "Client already closed" state for subsequent Worker
  // creates within the same test suite.
  const connectionInjected = input.connection !== undefined;
  const connection =
    input.connection ??
    (await NativeConnection.connect({ address: input.address }));

  const workflowsPath = input.workflowsPath ?? resolveWorkflowsPath();
  const effectiveActivities = input.activities ?? activities;
  const workerFactory =
    input.workerFactory ??
    ((options: Parameters<typeof Worker.create>[0]) => Worker.create(options));

  const registered = new Map<string, TemporalWorkerInstance>();
  const failed = new Set<string>();
  const runners = new Map<string, Promise<void>>();
  const starting = new Map<string, Promise<void>>();
  let shuttingDown = false;
  let exhaustedNotified = false;

  function onRunSettled(taskQueue: string, err: unknown): void {
    if (!err || shuttingDown) return;
    recordWorkerRunFailure(taskQueue, err);
    registered.delete(taskQueue);
    failed.add(taskQueue);
    runners.delete(taskQueue);
    if (!exhaustedNotified && registered.size === 0) {
      exhaustedNotified = true;
      void Promise.resolve(input.onWorkerExhausted?.()).catch(() => {
        // Best-effort callback; caller owns recovery/error reporting.
      });
    }
  }

  async function startOne(taskQueue: string): Promise<void> {
    if (shuttingDown) {
      throw new Error(
        `Cannot register queue "${taskQueue}" — worker is shutting down`,
      );
    }
    if (registered.has(taskQueue)) return;
    const pending = starting.get(taskQueue);
    if (pending) {
      await pending;
      return;
    }

    const boot = (async () => {
      const worker = await workerFactory({
        connection,
        namespace: input.namespace,
        taskQueue,
        workflowsPath,
        activities: effectiveActivities,
      });
      // Re-check: shutdown may have been initiated while Worker.create was
      // in flight. If so, tear this worker down immediately and refuse to
      // register it rather than attaching it to a worker that won't be
      // drained.
      if (shuttingDown) {
        try {
          worker.shutdown();
        } catch {
          // best-effort: the worker never started polling
        }
        throw new Error(
          `registerQueue("${taskQueue}") aborted — worker shut down mid-start`,
        );
      }
      failed.delete(taskQueue);
      if (registered.size === 0) exhaustedNotified = false;
      registered.set(taskQueue, worker);
      runners.set(
        taskQueue,
        worker.run().then(
          () => onRunSettled(taskQueue, null),
          (err) => onRunSettled(taskQueue, err),
        ),
      );
    })();

    starting.set(taskQueue, boot);
    try {
      await boot;
    } finally {
      starting.delete(taskQueue);
    }
  }

  for (const queue of input.queues) {
    await startOne(queue);
  }

  return {
    get queues() {
      return [...registered.keys()];
    },

    get failedQueues() {
      return [...failed];
    },

    async registerQueue(taskQueue: string): Promise<void> {
      await startOne(taskQueue);
    },

    async shutdown(): Promise<void> {
      if (shuttingDown) return;
      shuttingDown = true;
      for (const worker of registered.values()) {
        try {
          worker.shutdown();
        } catch {
          // best-effort: continue shutting down the rest
        }
      }
      // Drain every worker.run() promise before closing the connection.
      await Promise.allSettled(runners.values());
      if (!connectionInjected) {
        try {
          await connection.close();
        } catch {
          // best-effort
        }
      }
    },
  };
}
