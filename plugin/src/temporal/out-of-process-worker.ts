import { spawn, type ChildProcess } from "node:child_process";
import { createLogger, appendDebugLog } from "../utils/debug-log";
import {
  buildTemporalWorkerProcessSpec,
  resolveNodeExecutable,
} from "./runtime-manager";
import type { InProcessWorker } from "./in-process-worker";

/**
 * Out-of-process Temporal worker.
 *
 * Spawns one detached Node child process per registered task queue. Each
 * child runs `plugin/src/temporal/worker.ts` (or its built JS equivalent),
 * which calls `runTemporalWorkerFromEnv()` to start a single-queue Worker.
 *
 * Motivation: opencode ships as a compiled Bun executable. `@temporalio/worker`
 * cannot run inside Bun because `Worker.create()` spawns a Node worker thread
 * whose `require('@temporalio/common')` fails from Bun's install-cache path.
 * Running the worker in a Node child process side-steps the incompatibility
 * by giving the worker Node-native module resolution with the plugin's own
 * `node_modules` on its search path.
 *
 * Design choices:
 *  - One child per queue (matches `worker.ts` env-driven single-queue shape).
 *    Rejected for now: extending `worker.ts` to register multiple queues —
 *    deferrable to a follow-up change once the OOP path is proven in prod.
 *  - Logging goes through `logger.debug` → file sink only (no console spam).
 *  - `shutdown()` SIGTERMs every child, awaits their `exit` events, resolves.
 *    SIGKILL fallback after a hard timeout is implemented in Phase 2.5.
 */

const logger = createLogger("temporal-oop-worker");
const debugLog = (msg: string): void =>
  appendDebugLog("temporal-oop-worker", msg);

export interface OutOfProcessWorkerInput {
  address: string;
  namespace: string;
  queues: readonly string[];
  /**
   * Path to the built or source worker script. Typically
   * `plugin/dist/temporal/worker.js` when running from a built plugin, or
   * `plugin/src/temporal/worker.ts` when running from source (requires tsx on
   * the child).
   */
  workerScript: string;
  /** Project identifier used to scope task queues / workflows. */
  projectId: string;
  /** Override the Node executable lookup (primarily for tests). */
  nodeEnv?: NodeJS.ProcessEnv;
}

interface ChildEntry {
  child: ChildProcess;
  queue: string;
  exitPromise: Promise<void>;
}

export async function createOutOfProcessWorker(
  input: OutOfProcessWorkerInput,
): Promise<InProcessWorker> {
  const nodeResolution = resolveNodeExecutable(input.nodeEnv ?? process.env);
  if (!nodeResolution.found || !nodeResolution.path) {
    const reason =
      nodeResolution.remediation ??
      "No Node executable found. Install Node (v20+) on PATH or set ADV_NODE_PATH.";
    throw new Error(`Cannot spawn out-of-process Temporal worker: ${reason}`);
  }
  const nodePath = nodeResolution.path;

  const entries = new Map<string, ChildEntry>();
  let shuttingDown = false;

  function startOne(queue: string): ChildEntry {
    const spec = buildTemporalWorkerProcessSpec({
      workerScript: input.workerScript,
      taskQueue: queue,
      address: input.address,
      namespace: input.namespace,
      projectId: input.projectId,
    });

    debugLog(`spawning OOP worker for queue=${queue} node=${nodePath}`);

    const child = spawn(nodePath, spec.args, {
      env: spec.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false, // Keep child tied to parent for reliable shutdown.
    });

    // Forward child output to the file-sink logger only — never the console.
    // Worker logs are verbose; dumping them to opencode sessions would undo
    // the spam-silencing work in Phase 1.
    child.stdout?.on("data", (chunk: Buffer) => {
      logger.debug(`[worker:${queue}:stdout] ${chunk.toString().trimEnd()}`);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      logger.debug(`[worker:${queue}:stderr] ${chunk.toString().trimEnd()}`);
    });

    const exitPromise = new Promise<void>((resolve) => {
      const handleExit = (
        code: number | null,
        signal: NodeJS.Signals | null,
      ): void => {
        debugLog(
          `OOP worker exited queue=${queue} code=${code} signal=${signal ?? "none"}`,
        );
        resolve();
      };
      child.once("exit", handleExit);
    });

    return { child, queue, exitPromise };
  }

  // Bring up all initial queues before returning the handle.
  for (const queue of input.queues) {
    if (entries.has(queue)) continue;
    entries.set(queue, startOne(queue));
  }

  return {
    get queues() {
      return [...entries.keys()];
    },

    async registerQueue(queue: string): Promise<void> {
      if (shuttingDown) {
        throw new Error(
          `Cannot register queue "${queue}" — worker is shutting down`,
        );
      }
      if (entries.has(queue)) return;
      entries.set(queue, startOne(queue));
    },

    async shutdown(): Promise<void> {
      if (shuttingDown) return;
      shuttingDown = true;

      const current = [...entries.values()];
      for (const entry of current) {
        try {
          entry.child.kill("SIGTERM");
        } catch (e) {
          debugLog(
            `SIGTERM to OOP worker queue=${entry.queue} threw: ${(e as Error).message}`,
          );
        }
      }

      // Wait for every child to exit before resolving. Phase 2.5 adds the
      // hard-deadline SIGKILL fallback.
      await Promise.allSettled(current.map((e) => e.exitPromise));
      entries.clear();
    },
  };
}
