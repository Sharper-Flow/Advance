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
 * Signal parent that the child has finished bootstrap. Writes a single
 * JSON line to stdout where the parent listens for the
 * `{"type":"ready"}` marker. See `worker-multi.ts` §
 * MULTI_READY_TIMEOUT_MS and P1.3.6 (design.md § KD-1).
 *
 * stdout is the agreed IPC channel (see `worker-multi.ts` `stdio: ["pipe",
 * "pipe", "pipe"]`). `process.send()` is not available because the child
 * is not spawned with an IPC fd. Best-effort — if the write fails, the
 * bootstrap timeout will catch it and emit a clean failure.
 */
function emitIpcMessage(message: Record<string, unknown>): void {
  try {
    // Write direct to stdout; avoid console.log which may buffer/delay.
    process.stdout.write(JSON.stringify(message) + "\n");
  } catch {
    // Ignore — parent will time out or surface the missing ACK/error.
  }
}

function emitReady(queues: string[]): void {
  emitIpcMessage({ type: "ready", queues });
}

/**
 * IPC message types the child accepts from parent on stdin.
 * Parent-side shape lives in worker-multi.ts.
 */
export interface ChildIPCHandler {
  /**
   * Dispatch a single JSON-line message. Safe to call directly from
   * tests. Ignores malformed JSON and unrecognized types.
   */
  handleLine(line: string): Promise<void>;

  /**
   * Accept a raw stdin buffer chunk. Buffers partial lines across
   * chunks and dispatches each complete `\n`-terminated JSON message
   * via handleLine.
   */
  handleChunk(chunk: Buffer): Promise<void>;
}

export interface ChildIPCHandlerCallbacks {
  onRegister: (queue: string) => Promise<void>;
  onUnregister: (queue: string) => Promise<void>;
  onShutdown: () => Promise<void>;
}

/**
 * Child-side IPC handler for dynamic queue register/unregister
 * (P1.3.7). Reads JSON-line messages from stdin written by the parent.
 *
 * Message shapes:
 *   `{"type":"register","queue":"<name>"}`  → `onRegister(queue)`
 *   `{"type":"unregister","queue":"<name>"}` → `onUnregister(queue)`
 *   `{"type":"shutdown"}`                   → `onShutdown()`
 *
 * Unrecognized types and malformed lines are silently ignored so the
 * child can't be crashed by stray parent output. See design.md § KD-1,
 * implementation strategy.
 */
export function createChildIPCHandler(
  callbacks: ChildIPCHandlerCallbacks,
): ChildIPCHandler {
  let buffer = "";

  async function handleLine(line: string): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Non-JSON input (probably a stray log line) — ignore.
      return;
    }

    if (!parsed || typeof parsed !== "object") return;
    const msg = parsed as { type?: string; queue?: unknown };

    switch (msg.type) {
      case "register":
        if (typeof msg.queue === "string") {
          await callbacks.onRegister(msg.queue);
        }
        break;
      case "unregister":
        if (typeof msg.queue === "string") {
          await callbacks.onUnregister(msg.queue);
        }
        break;
      case "shutdown":
        await callbacks.onShutdown();
        break;
      default:
        // Unknown type — silently ignore for forward compatibility.
        break;
    }
  }

  async function handleChunk(chunk: Buffer): Promise<void> {
    buffer += chunk.toString("utf-8");
    const lines = buffer.split(/\r?\n/);
    // Last element is either empty (clean trailing newline) or a partial
    // line that hasn't terminated yet — preserve it for the next chunk.
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      await handleLine(line);
    }
  }

  return { handleLine, handleChunk };
}

/**
 * Run multiple Temporal Workers concurrently, one per task queue, sharing a
 * single NativeConnection. The multi-queue model is activated when the
 * parent sets `ADV_TEMPORAL_MULTI_QUEUE=1` and a comma-separated
 * `ADV_TEMPORAL_TASK_QUEUES` list. The child registers all queues up front,
 * then runs them in parallel so the server sees a poller per queue.
 *
 * After every `Worker.create` resolves, the child emits a
 * `{"type":"ready"}` IPC line so the parent can unblock
 * `createMultiWorker`. See P1.3.6.
 *
 * Parent-side IPC (register / unregister) is not yet wired to the live
 * worker set here; see `worker-multi.ts` for the parent protocol.
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

    // Build mutable worker registry for P1.3.7 dynamic register/unregister.
    const workerRegistry = new Map<
      string,
      Awaited<ReturnType<typeof Worker.create>>
    >();
    for (let i = 0; i < taskQueues.length; i++) {
      workerRegistry.set(taskQueues[i], workers[i]);
    }

    // P1.3.7: wire stdin IPC handler so parent can register/unregister
    // queues dynamically after bootstrap. stdin is the agreed IPC
    // channel — parent writes JSON lines via child.stdin.write.
    const ipcHandler = createChildIPCHandler({
      onRegister: async (queue: string) => {
        if (workerRegistry.has(queue)) {
          emitIpcMessage({ type: "register-ack", queue });
          return;
        }
        try {
          const newWorker = await Worker.create({
            connection,
            namespace,
            taskQueue: queue,
            workflowsPath,
            activities,
          });
          workerRegistry.set(queue, newWorker);
          // Fire-and-forget .run so the IPC handler returns promptly.
          void newWorker.run();
          emitIpcMessage({ type: "register-ack", queue });
        } catch (err) {
          emitIpcMessage({
            type: "register-error",
            queue,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      },
      onUnregister: async (queue: string) => {
        const worker = workerRegistry.get(queue);
        if (!worker) return;
        workerRegistry.delete(queue);
        try {
          await worker.shutdown();
        } catch {
          // Best-effort — process exit will clean up anyway.
        }
      },
      onShutdown: async () => {
        const entries = Array.from(workerRegistry.values());
        workerRegistry.clear();
        await Promise.allSettled(entries.map((w) => w.shutdown()));
        try {
          process.stdout.write('{"type":"shutdown-ack"}\n');
        } catch {
          // Best-effort.
        }
        // Close the connection and let the process exit naturally.
        await connection.close();
        process.exit(0);
      },
    });

    // Attach stdin listener. Not registered in test env (no process.stdin
    // or handler.handleChunk called directly). `readable` mode lets us
    // avoid flipping stdin into flowing mode which can interfere with
    // some test harnesses.
    if (process.stdin && typeof process.stdin.on === "function") {
      process.stdin.on("data", (chunk: Buffer) => {
        void ipcHandler.handleChunk(chunk);
      });
    }

    // P1.3.6: signal parent that bootstrap is complete. Must happen
    // AFTER all Worker.create resolve AND after stdin handler is wired
    // (so register messages arriving immediately after ready don't
    // race), but BEFORE worker.run (which blocks forever).
    emitReady(taskQueues);

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
