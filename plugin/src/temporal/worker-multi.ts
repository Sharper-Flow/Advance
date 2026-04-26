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
 *     { "type": "register-ack", "queue": "<name>" }
 *     { "type": "register-error", "queue": "<name>", "message": "..." }
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

/**
 * Maximum time the parent waits for the child to send
 * `{"type":"ready"}` after spawn. If this elapses, parent kills the
 * orphan child and rejects `createMultiWorker`. 30s covers Worker.create
 * + NativeConnection handshake + workflow bundle warmup on cold-start
 * under load. Tool calls during bootstrap wait on this, so it's
 * deliberately longer than a single-query budget (5s, per P1.3.8) but
 * short enough to fail fast when the child is genuinely broken.
 *
 * See design.md § KD-1.
 */
export const MULTI_READY_TIMEOUT_MS = 30_000;

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

export interface ChildRegisterAckMessage {
  type: "register-ack";
  queue: string;
}

export interface ChildRegisterErrorMessage {
  type: "register-error";
  queue: string;
  message: string;
}

export type ChildToParentMessage =
  | ChildReadyMessage
  | ChildErrorMessage
  | ChildWorkerStartedMessage
  | ChildRegisterAckMessage
  | ChildRegisterErrorMessage;

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
    pendingRegistrations: string[];
    registerErrors: Array<{ queue: string; message: string }>;
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
    throw new Error(`Cannot spawn multi-queue Temporal worker: ${reason}`);
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
  const pendingRegistrations = new Map<
    string,
    {
      promise: Promise<void>;
      resolve: () => void;
      reject: (err: Error) => void;
    }
  >();
  const registerErrors = new Map<string, string>();
  let resolveExit: () => void = () => {};
  const exitPromise = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });

  /**
   * Handle a parsed JSON-line message from the child. Returns true if a
   * `{"type":"ready"}` message was observed.
   */
  function handleChildMessage(msg: { type?: string; [key: string]: unknown }) {
    if (msg.type === "ready") return true;

    if (msg.type === "register-ack" || msg.type === "worker_started") {
      if (typeof msg.queue !== "string") return false;
      const pending = pendingRegistrations.get(msg.queue);
      queues.add(msg.queue);
      registerErrors.delete(msg.queue);
      if (pending) {
        pendingRegistrations.delete(msg.queue);
        pending.resolve();
      }
      return false;
    }

    if (msg.type === "register-error") {
      if (typeof msg.queue !== "string") return false;
      const message =
        typeof msg.message === "string"
          ? msg.message
          : typeof msg.error === "string"
            ? msg.error
            : "Unknown register error";
      registerErrors.set(msg.queue, message);
      const pending = pendingRegistrations.get(msg.queue);
      if (pending) {
        pendingRegistrations.delete(msg.queue);
        pending.reject(
          new Error(
            `Failed to register Temporal worker queue "${msg.queue}": ${message}`,
          ),
        );
      }
      return false;
    }

    if (msg.type === "error" && typeof msg.queue === "string") {
      const message =
        typeof msg.message === "string" ? msg.message : "Unknown child error";
      registerErrors.set(msg.queue, message);
    }

    return false;
  }

  /**
   * Scan an IPC stdout buffer chunk for JSON-lines messages from the child.
   * Returns true if a `{"type":"ready"}` message was observed.
   */
  function parseChildMessages(chunk: Buffer): boolean {
    let sawReady = false;
    const text = chunk.toString("utf-8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as { type?: string };
        if (msg && handleChildMessage(msg)) sawReady = true;
      } catch {
        // Not JSON, ignore — probably a plain log line
      }
    }
    return sawReady;
  }

  /**
   * Spawn the Node child and install stdout/stderr/exit handlers.
   * Returns a promise that resolves when the child sends `{"type":"ready"}`
   * via stdout, or rejects on timeout / early exit.
   *
   * The parent blocks on this promise during initial spawn so tool calls
   * don't race the ~500ms Worker.create + NativeConnection window. On
   * respawn (after a crash), the promise is intentionally discarded —
   * the parent stays "alive" with the existing MultiWorker handle and
   * the next tool call sees either a healthy worker or a broken one
   * routed through the query timeout (P1.3.8).
   */
  function spawnChild(): Promise<void> {
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
    // Stdout/stderr → debug log + ready-handshake watcher

    let readyResolve: () => void = () => {};
    let readyReject: (err: Error) => void = () => {};
    const readyPromise = new Promise<void>((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    let settled = false;
    const settle = (err?: Error): void => {
      if (settled) return;
      settled = true;
      if (err) {
        readyReject(err);
      } else {
        readyResolve();
      }
    };

    const bootstrapTimer = setTimeout(() => {
      if (settled) return;
      logger.info(
        `Multi-queue Temporal worker did not become ready within ${MULTI_READY_TIMEOUT_MS}ms. Killing orphan child.`,
      );
      try {
        newChild.kill("SIGKILL");
      } catch {
        // best-effort
      }
      settle(
        new Error(
          `Multi-queue Temporal worker did not become ready within ${MULTI_READY_TIMEOUT_MS}ms — child never sent {"type":"ready"} IPC message.`,
        ),
      );
    }, MULTI_READY_TIMEOUT_MS);
    bootstrapTimer.unref();

    newChild.stdout?.on("data", (chunk: Buffer) => {
      const sawReady = parseChildMessages(chunk);
      if (!settled && sawReady) {
        clearTimeout(bootstrapTimer);
        debugLog("multi-queue worker sent ready IPC message");
        settle();
      }
      const text = sanitizeLogChunk(chunk);
      logger.debug(`[multi-worker:stdout] ${text}`);
    });

    newChild.stderr?.on("data", (chunk: Buffer) => {
      const text = sanitizeLogChunk(chunk);
      logger.debug(`[multi-worker:stderr] ${text}`);
    });

    newChild.once(
      "exit",
      (code: number | null, signal: NodeJS.Signals | null) => {
        debugLog(
          `multi-queue worker exited code=${code} signal=${signal ?? "none"} restartCount=${restartCount}`,
        );

        // If child exits before emitting ready, reject the handshake
        // so the caller sees a structured error rather than hanging.
        if (!settled) {
          clearTimeout(bootstrapTimer);
          settle(
            new Error(
              `Multi-queue Temporal worker exited before sending ready IPC message (code=${code}, signal=${signal ?? "none"}).`,
            ),
          );
        }

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
        debugLog(
          `scheduling respawn in ${backoff}ms (attempt ${restartCount}/${MAX_RESTARTS})`,
        );
        setTimeout(() => {
          if (shuttingDown) return;
          // Respawn intentionally discards the ready promise — the
          // existing MultiWorker handle stays live; a crashed
          // respawn will simply loop again up to MAX_RESTARTS.
          void spawnChild().catch((err: Error) => {
            debugLog(`respawn ready-handshake failed: ${err.message}`);
          });
        }, backoff).unref();
      },
    );

    return readyPromise;
  }

  function sendToChild(msg: ParentToChildMessage): boolean {
    if (!child || child.killed || child.exitCode !== null) return false;
    if (!child.stdin) return false;
    try {
      child.stdin.write(JSON.stringify(msg) + "\n");
      return true;
    } catch {
      debugLog(`failed to send IPC message to child: ${JSON.stringify(msg)}`);
      return false;
    }
  }

  // Spawn the initial child and block until it signals ready. If the
  // child crashes or times out during bootstrap, propagate the error so
  // the caller sees a structured failure rather than a silently-broken
  // worker handle. See P1.3.6 (design.md § KD-1).
  await spawnChild();

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
      const pending = pendingRegistrations.get(queue);
      if (pending) return pending.promise;

      let resolveRegistration: () => void = () => {};
      let rejectRegistration: (err: Error) => void = () => {};
      const promise = new Promise<void>((resolve, reject) => {
        resolveRegistration = resolve;
        rejectRegistration = reject;
      });
      pendingRegistrations.set(queue, {
        promise,
        resolve: resolveRegistration,
        reject: rejectRegistration,
      });
      registerErrors.delete(queue);

      if (!sendToChild({ type: "register", queue })) {
        pendingRegistrations.delete(queue);
        const message = "child process is not running";
        registerErrors.set(queue, message);
        throw new Error(
          `Failed to register Temporal worker queue "${queue}": ${message}`,
        );
      }

      return promise;
    },

    async shutdown(): Promise<void> {
      if (shuttingDown) return;
      shuttingDown = true;

      for (const [queue, pending] of pendingRegistrations) {
        pending.reject(
          new Error(
            `Failed to register Temporal worker queue "${queue}": worker is shutting down`,
          ),
        );
      }
      pendingRegistrations.clear();

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
        pendingRegistrations: [...pendingRegistrations.keys()].sort(),
        registerErrors: [...registerErrors]
          .map(([queue, message]) => ({ queue, message }))
          .sort((a, b) => a.queue.localeCompare(b.queue)),
      };
    },
  };
}
