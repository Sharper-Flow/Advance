/**
 * Multi-queue worker host — single Node child process polling N task queues.
 *
 * Replaces the per-queue child model in `out-of-process-worker.ts` with one
 * child that creates a `Worker` for each registered queue. This reduces
 * process overhead (memory, startup time, Node binary loads) when the plugin
 * needs workers on multiple queues (change, project, agenda, etc.).
 *
 * IPC protocol (stdio JSON lines):
 *   Parent → Child:
 *     { "type": "register", "queue": "<name>" }
 *     { "type": "unregister", "queue": "<name>" }
 *   Child → Parent:
 *     { "type": "ready" }
 *     { "type": "error", "queue": "<name>", "message": "..." }
 *     { "type": "worker_started", "queue": "<name>" }
 *
 * Child reads initial queues from `ADV_TEMPORAL_TASK_QUEUES` (comma-separated).
 * The child script is `worker.ts` with multi-queue mode activated by the
 * `ADV_TEMPORAL_MULTI_QUEUE=1` env flag.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createLogger, appendDebugLog } from "../utils/debug-log";
import {
  buildTemporalWorkerProcessSpec,
  resolveNodeExecutable,
} from "./runtime-manager";
import type { InProcessWorker } from "./in-process-worker";

const logger = createLogger("temporal-multi-worker");
const debugLog = (msg: string): void =>
  appendDebugLog("temporal-multi-worker", msg);

const RESTART_BACKOFF_MS: readonly number[] = [1_000, 3_000, 10_000];
const MAX_RESTARTS = RESTART_BACKOFF_MS.length;
export const MULTI_SHUTDOWN_GRACE_MS = 5_000;

const LOG_MAX_LENGTH = 2_000;

function sanitizeLogChunk(chunk: Buffer): string {
  let text = chunk.toString("utf-8").trimEnd();
  const controlChars = new RegExp(`[\x00-\x08\x0b-\x1f\x7f]`, "g");
  text = text.replace(controlChars, "");
  if (text.length > LOG_MAX_LENGTH) {
    text = text.slice(0, LOG_MAX_LENGTH) + " …[truncated]";
  }
  return text;
}

/** IPC message types sent from parent to child. */
interface RegisterMessage {
  type: "register";
  queue: string;
}

interface UnregisterMessage {
  type: "unregister";
  queue: string;
}

type ParentToChildMessage = RegisterMessage | UnregisterMessage;

/** IPC message types sent from child to parent. */
export interface ChildReadyMessage {
  type: "ready";
}

export interface ChildErrorMessage {
  type: "error";
  queue?: string;
  message: string;
}

export interface ChildWorkerStartedMessage {
  type: "worker_started";
  queue: string;
}

export type ChildToParentMessage =
  | ChildReadyMessage
  | ChildErrorMessage
  | ChildWorkerStartedMessage;

export interface MultiWorkerInput {
  address: string;
  namespace: string;
  queues: readonly string[];
  workerScript: string;
  projectId: string;
  nodeEnv?: NodeJS.ProcessEnv;
}

export interface MultiWorker extends InProcessWorker {
  isAlive(): boolean;
  getDiagnostics(): {
    queues: string[];
    restartCount: number;
    childExitCode: number | null;
    childRunning: boolean;
  };
}

export async function createMultiWorker(
  input: MultiWorkerInput,
): Promise<MultiWorker> {
  const nodeResolution = resolveNodeExecutable(input.nodeEnv ?? process.env);
  if (!nodeResolution.found || !nodeResolution.path) {
    const reason =
      nodeResolution.remediation ??
      "No Node executable found. Install Node (v20+) on PATH or set ADV_NODE_PATH.";
    throw new Error(
      `Cannot spawn multi-queue Temporal worker: ${reason}`,
    );
  }
  const nodePath = nodeResolution.path;

  if (!existsSync(input.workerScript)) {
    throw new Error(
      `Cannot spawn multi-queue Temporal worker: worker script not found at "${input.workerScript}".`,
    );
  }

  const queues = new Set(input.queues);
  let child: ChildProcess | null = null;
  let restartCount = 0;
  let shuttingDown = false;
  let resolveExit: () => void = () => {};
  const exitPromise = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });

  function spawnChild(): void {
    const spec = buildTemporalWorkerProcessSpec({
      workerScript: input.workerScript,
      taskQueue: "__multi__", // placeholder; child reads QUEUES env
      address: input.address,
      namespace: input.namespace,
      projectId: input.projectId,
    });

    // Override the single-queue env with multi-queue config
    const env = {
      ...spec.env,
      ADV_TEMPORAL_MULTI_QUEUE: "1",
      ADV_TEMPORAL_TASK_QUEUES: [...queues].join(","),
      // Remove single-queue var to avoid confusion
      ADV_TEMPORAL_TASK_QUEUE: undefined,
    };

    debugLog(
      `spawning multi-queue worker queues=[${[...queues].join(",")}] attempt=${restartCount} node=${nodePath}`,
    );

    const newChild = spawn(nodePath, spec.args, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: false,
    });

    child = newChild;

    // IPC: write messages to child stdin
    // Stdout/stderr → debug log

    newChild.stdout?.on("data", (chunk: Buffer) => {
      const text = sanitizeLogChunk(chunk);
      logger.debug(`[multi-worker:stdout] ${text}`);
    });

    newChild.stderr?.on("data", (chunk: Buffer) => {
      const text = sanitizeLogChunk(chunk);
      logger.debug(`[multi-worker:stderr] ${text}`);
    });

    newChild.once("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      debugLog(
        `multi-queue worker exited code=${code} signal=${signal ?? "none"} restartCount=${restartCount}`,
      );

      if (shuttingDown || code === 0) {
        child = null;
        resolveExit();
        return;
      }

      if (restartCount >= MAX_RESTARTS) {
        logger.info(
          `Multi-queue Temporal worker exhausted ${MAX_RESTARTS} restart attempts. Last exit code=${code}, signal=${signal ?? "none"}.`,
        );
        child = null;
        resolveExit();
        return;
      }

      const backoff = RESTART_BACKOFF_MS[restartCount] ?? 10_000;
      restartCount += 1;
      debugLog(`scheduling respawn in ${backoff}ms (attempt ${restartCount}/${MAX_RESTARTS})`);
      setTimeout(() => {
        if (shuttingDown) return;
        spawnChild();
      }, backoff).unref();
    });
  }

  function sendToChild(msg: ParentToChildMessage): void {
    if (!child || child.killed || child.exitCode !== null) return;
    try {
      child.stdin?.write(JSON.stringify(msg) + "\n");
    } catch {
      debugLog(`failed to send IPC message to child: ${JSON.stringify(msg)}`);
    }
  }

  // Spawn the initial child with all initial queues
  spawnChild();

  return {
    get queues() {
      return [...queues];
    },

    async registerQueue(queue: string): Promise<void> {
      if (shuttingDown) {
        throw new Error(
          `Cannot register queue "${queue}" — worker is shutting down`,
        );
      }
      if (queues.has(queue)) return;
      queues.add(queue);
      sendToChild({ type: "register", queue });
    },

    async shutdown(): Promise<void> {
      if (shuttingDown) return;
      shuttingDown = true;

      if (child && child.exitCode === null) {
        try {
          child.kill("SIGTERM");
        } catch (e) {
          debugLog(`SIGTERM threw: ${(e as Error).message}`);
        }
      }

      const timedOut = await Promise.race([
        exitPromise.then(() => false),
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(true), MULTI_SHUTDOWN_GRACE_MS).unref();
        }),
      ]);

      if (timedOut && child && child.exitCode === null) {
        debugLog("shutdown grace exceeded — escalating to SIGKILL");
        try {
          child.kill("SIGKILL");
        } catch {
          // best-effort
        }
      }

      await exitPromise;
      child = null;
    },

    isAlive(): boolean {
      return Boolean(child && child.exitCode === null);
    },

    getDiagnostics() {
      return {
        queues: [...queues],
        restartCount,
        childExitCode: child?.exitCode ?? null,
        childRunning: Boolean(child && child.exitCode === null),
      };
    },
  };
}
