import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
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
 * Lifecycle:
 *  - One child per queue (matches `worker.ts` env-driven single-queue shape).
 *  - Stdout/stderr → `logger.debug` → file sink only (never console).
 *  - Non-zero exit → exponential backoff respawn (1s, 3s, 10s). Max 3 attempts
 *    per queue. After the 3rd restart crashes, that queue stays dead; a
 *    dedicated health probe can surface the state to operators.
 *  - Graceful exit (code 0) is NOT a crash — no respawn.
 *  - `shutdown()` SIGTERMs all children; the shutting-down flag disables
 *    respawn scheduling so post-shutdown exits don't revive the worker.
 */

const logger = createLogger("temporal-oop-worker");
const debugLog = (msg: string): void =>
  appendDebugLog("temporal-oop-worker", msg);

const RESTART_BACKOFF_MS: readonly number[] = [1_000, 3_000, 10_000];
const MAX_RESTARTS = RESTART_BACKOFF_MS.length;
export const OOP_SHUTDOWN_GRACE_MS = 5_000;

const LOG_MAX_LENGTH = 2_000;

function getStableWorkerCwd(): string {
  const cwd = join(tmpdir(), "advance-temporal-worker-cwd");
  mkdirSync(cwd, { recursive: true });
  return cwd;
}

function sanitizeLogChunk(chunk: Buffer): string {
  let text = chunk.toString("utf-8").trimEnd();
  // Strip control characters except tab (\x09) and newline (\x0a)
  // Build pattern from char codes to avoid no-control-regex lint error
  const controlChars = new RegExp(`[\x00-\x08\x0b-\x1f\x7f]`, "g");
  text = text.replace(controlChars, "");
  // Truncate huge chunks so a single log line can't blow up the sink
  if (text.length > LOG_MAX_LENGTH) {
    text = text.slice(0, LOG_MAX_LENGTH) + " …[truncated]";
  }
  return text;
}

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

/**
 * Public surface: superset of InProcessWorker with an additional `isAlive()`
 * probe that reflects the aggregate liveness of all child processes. A worker
 * is alive if at least one child exists and is running (exitCode === null).
 */
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

interface QueueState {
  queue: string;
  child: ChildProcess | null;
  restartCount: number;
  dead: boolean;
  exitPromise: Promise<void>;
  resolveExit: () => void;
}

export async function createOutOfProcessWorker(
  input: OutOfProcessWorkerInput,
): Promise<OutOfProcessWorker> {
  const nodeResolution = resolveNodeExecutable(input.nodeEnv ?? process.env);
  if (!nodeResolution.found || !nodeResolution.path) {
    const reason =
      nodeResolution.remediation ??
      "No Node executable found. Install Node (v20+) on PATH or set ADV_NODE_PATH.";
    throw new Error(`Cannot spawn out-of-process Temporal worker: ${reason}`);
  }
  const nodePath = nodeResolution.path;

  if (!existsSync(input.workerScript)) {
    throw new Error(
      `Cannot spawn out-of-process Temporal worker: worker script not found at "${input.workerScript}". Ensure the plugin is built (pnpm run build) or the path is correct.`,
    );
  }

  const states = new Map<string, QueueState>();
  let shuttingDown = false;

  function spawnChildFor(state: QueueState): void {
    const spec = buildTemporalWorkerProcessSpec({
      workerScript: input.workerScript,
      taskQueue: state.queue,
      address: input.address,
      namespace: input.namespace,
      projectId: input.projectId,
    });

    debugLog(
      `spawning OOP worker queue=${state.queue} attempt=${state.restartCount} node=${nodePath}`,
    );

    const child = spawn(nodePath, spec.args, {
      cwd: getStableWorkerCwd(),
      env: spec.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    state.child = child;

    child.stdout?.on("data", (chunk: Buffer) => {
      logger.debug(`[worker:${state.queue}:stdout] ${sanitizeLogChunk(chunk)}`);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      logger.debug(`[worker:${state.queue}:stderr] ${sanitizeLogChunk(chunk)}`);
    });

    child.once(
      "exit",
      (code: number | null, signal: NodeJS.Signals | null): void => {
        debugLog(
          `OOP worker exited queue=${state.queue} code=${code} signal=${signal ?? "none"} restartCount=${state.restartCount}`,
        );

        // If shutting down OR graceful exit, do not respawn.
        if (shuttingDown || code === 0) {
          state.child = null;
          state.dead = true;
          state.resolveExit();
          return;
        }

        // Crashed. Schedule respawn if budget remains.
        if (state.restartCount >= MAX_RESTARTS) {
          logger.info(
            `OOP Temporal worker queue="${state.queue}" exhausted ${MAX_RESTARTS} restart attempts — marking dead. Last exit code=${code}, signal=${signal ?? "none"}.`,
          );
          state.child = null;
          state.dead = true;
          state.resolveExit();
          return;
        }

        const backoff = RESTART_BACKOFF_MS[state.restartCount] ?? 10_000;
        state.restartCount += 1;
        debugLog(
          `scheduling respawn queue=${state.queue} in ${backoff}ms (attempt ${state.restartCount}/${MAX_RESTARTS})`,
        );
        setTimeout(() => {
          if (shuttingDown) return;
          spawnChildFor(state);
        }, backoff).unref();
      },
    );
  }

  function ensureQueueStarted(queue: string): QueueState {
    const existing = states.get(queue);
    if (existing) return existing;

    let resolveExit: () => void = () => {};
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });
    const state: QueueState = {
      queue,
      child: null,
      restartCount: 0,
      dead: false,
      exitPromise,
      resolveExit,
    };
    states.set(queue, state);
    spawnChildFor(state);
    return state;
  }

  for (const queue of input.queues) {
    ensureQueueStarted(queue);
  }

  return {
    get queues() {
      return [...states.keys()];
    },

    async registerQueue(queue: string): Promise<void> {
      if (shuttingDown) {
        throw new Error(
          `Cannot register queue "${queue}" — worker is shutting down`,
        );
      }
      ensureQueueStarted(queue);
    },

    async shutdown(): Promise<void> {
      if (shuttingDown) return;
      shuttingDown = true;

      const current = [...states.values()];
      for (const state of current) {
        const child = state.child;
        if (!child) continue;
        try {
          child.kill("SIGTERM");
        } catch (e) {
          state.child = null;
          state.dead = true;
          state.resolveExit();
          debugLog(
            `SIGTERM to OOP worker queue=${state.queue} threw: ${(e as Error).message}`,
          );
        }
      }

      const timedOut = await Promise.race([
        Promise.allSettled(current.map((s) => s.exitPromise)).then(() => false),
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(true), OOP_SHUTDOWN_GRACE_MS).unref();
        }),
      ]);

      if (timedOut) {
        debugLog(
          `shutdown grace window ${OOP_SHUTDOWN_GRACE_MS}ms exceeded — escalating to SIGKILL for remaining children`,
        );
        for (const state of current) {
          const child = state.child;
          if (!child || child.exitCode !== null) continue;
          try {
            child.kill("SIGKILL");
          } catch {
            // best-effort
          }
          state.child = null;
          state.dead = true;
          state.resolveExit();
        }
      }

      await Promise.allSettled(current.map((s) => s.exitPromise));
      states.clear();
    },

    isAlive(): boolean {
      for (const state of states.values()) {
        // `dead` means restart budget exhausted or the queue exited gracefully
        // with no respawn pending. `child.exitCode === null` is the actual
        // process-level liveness signal for still-running children.
        if (state.dead) continue;
        if (state.child && state.child.exitCode === null) return true;
      }
      return false;
    },

    getDiagnostics() {
      return [...states.values()].map((state) => ({
        queue: state.queue,
        dead: state.dead,
        restartCount: state.restartCount,
        childExitCode: state.child?.exitCode ?? null,
        childRunning: Boolean(state.child && state.child.exitCode === null),
      }));
    },
  };
}
