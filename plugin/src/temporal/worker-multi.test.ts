import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createMultiWorker, MULTI_SHUTDOWN_GRACE_MS } from "./worker-multi";
import {
  getLastWorkerRunError,
  resetTemporalRetryTelemetry,
} from "./retry-wrapper";
import type { ChildProcess } from "node:child_process";
import EventEmitter from "node:events";

// ---------------------------------------------------------------------------
// Mock child_process.spawn to avoid actually spawning Node processes
// ---------------------------------------------------------------------------

interface MockChild extends Partial<ChildProcess> {
  emit(event: string, ...args: unknown[]): boolean;
  stdin: { write: ReturnType<typeof vi.fn>; end?: ReturnType<typeof vi.fn> };
  stdout: EventEmitter;
  stderr: EventEmitter;
  killed: boolean;
  exitCode: number | null;
  kill: ReturnType<typeof vi.fn>;
  /**
   * Simulate the child sending a ready IPC message. Real child writes a
   * JSON line to stdout; the test emits the equivalent data event.
   */
  sendReady(): void;
  sendRegisterAck(queue: string): void;
  sendRegisterError(queue: string, message: string): void;
  sendRunError(queue: string, message: string): void;
}

let lastMockChild: MockChild | null = null;
const mockChildren: MockChild[] = [];

/**
 * When true (default), mock children auto-emit `{"type":"ready"}` on
 * next tick after spawn, mimicking a healthy child bootstrap. Individual
 * tests can set this false to simulate a child that never sends ready
 * (e.g. hang before Worker.create resolves).
 */
let autoEmitReady = true;
let autoAckRegister = true;

function createMockChild(): MockChild {
  const emitter = new EventEmitter();
  const stdout = new EventEmitter();
  const child: MockChild = {
    stdin: {
      // NOSONAR: typescript:S3516 — Node Writable.write() contract returns
      // boolean (buffer-not-full); this mock always returns true by design
      // because tests never assert backpressure behavior.
      write: vi.fn((line: string) => {
        if (!autoAckRegister) return true;
        try {
          const msg = JSON.parse(line.trim()) as {
            type?: string;
            queue?: unknown;
          };
          if (msg.type === "register" && typeof msg.queue === "string") {
            queueMicrotask(() => child.sendRegisterAck(msg.queue as string));
          }
        } catch {
          // Ignore malformed test writes.
        }
        return true;
      }),
    },
    stdout,
    stderr: new EventEmitter(),
    pid: 12345 + mockChildren.length,
    killed: false,
    exitCode: null,
    kill: vi.fn((signal?: string) => {
      child.killed = true;
      // Auto-emit exit to unblock shutdown promises
      if (signal === "SIGKILL") {
        child.exitCode = null;
        setImmediate(() => emitter.emit("exit", null, "SIGKILL"));
      } else {
        setImmediate(() => emitter.emit("exit", 0, null));
      }
    }),
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    emit(event: string, ...args: unknown[]): boolean {
      if (event === "exit") {
        child.exitCode = args[0] as number;
      }
      return emitter.emit(event, ...args);
    },
    sendReady() {
      child.stdout.emit("data", Buffer.from('{"type":"ready"}\n'));
    },
    sendRegisterAck(queue: string) {
      child.stdout.emit(
        "data",
        Buffer.from(JSON.stringify({ type: "register-ack", queue }) + "\n"),
      );
    },
    sendRegisterError(queue: string, message: string) {
      child.stdout.emit(
        "data",
        Buffer.from(
          JSON.stringify({ type: "register-error", queue, message }) + "\n",
        ),
      );
    },
    sendRunError(queue: string, message: string) {
      child.stdout.emit(
        "data",
        Buffer.from(
          JSON.stringify({ type: "run-error", queue, message }) + "\n",
        ),
      );
    },
  } as unknown as MockChild;
  return child;
}

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    const child = createMockChild();
    lastMockChild = child;
    mockChildren.push(child);
    // Auto-emit ready via a Promise microtask — this fires AFTER
    // `createMultiWorker` synchronously attaches its stdout listener
    // (which happens right after `spawn()` returns). Tests that want
    // to assert ready-timeout behavior should set
    // `autoEmitReady = false` before calling.
    if (autoEmitReady) {
      Promise.resolve().then(() => {
        Promise.resolve().then(() => child.sendReady());
      });
    }
    return child;
  }),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
}));

vi.mock("./runtime-manager", () => ({
  resolveNodeExecutable: vi.fn(() => ({
    found: true,
    path: "/usr/bin/node",
  })),
  buildTemporalWorkerProcessSpec: vi.fn(
    (input: {
      workerScript: string;
      taskQueue: string;
      address: string;
      namespace: string;
      projectId: string;
    }) => ({
      command: "/usr/bin/node",
      args: [input.workerScript],
      env: {
        ADV_TEMPORAL_ADDRESS: input.address,
        ADV_TEMPORAL_NAMESPACE: input.namespace,
        ADV_TEMPORAL_TASK_QUEUE: input.taskQueue,
        ADV_TEMPORAL_PROJECT_ID: input.projectId,
      },
    }),
  ),
}));

vi.mock("../utils/debug-log", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  appendDebugLog: vi.fn(),
}));

const baseInput = {
  address: "127.0.0.1:7233",
  namespace: "default",
  queues: ["adv-change-proj1", "adv-project-proj1"] as const,
  workerScript: "/fake/worker.ts",
  projectId: "proj1",
};

describe("Multi-queue worker host", () => {
  beforeEach(() => {
    lastMockChild = null;
    mockChildren.length = 0;
    autoEmitReady = true;
    autoAckRegister = true;
    resetTemporalRetryTelemetry();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("spawns a single child process for multiple queues", async () => {
    const worker = await createMultiWorker(baseInput);

    expect(lastMockChild).toBeTruthy();
    expect(worker.queues).toEqual(["adv-change-proj1", "adv-project-proj1"]);
    expect(worker.isAlive()).toBe(true);

    // Only one child spawned (not one per queue)
    expect(mockChildren.length).toBe(1);

    await worker.shutdown();
  });

  it("sets multi-queue env vars on child", async () => {
    const { spawn } = await import("node:child_process");
    await createMultiWorker(baseInput);

    const spawnCall = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
    const env = spawnCall[2]?.env as Record<string, string>;

    // Multi-queue flag is set
    expect(env.ADV_TEMPORAL_MULTI_QUEUE).toBe("1");
    expect(env.ADV_TEMPORAL_TASK_QUEUES).toBe(
      "adv-change-proj1,adv-project-proj1",
    );
  });

  it("sends IPC register message when registerQueue is called", async () => {
    const worker = await createMultiWorker(baseInput);

    await worker.registerQueue("adv-agenda-proj1");

    expect(lastMockChild?.stdin.write).toHaveBeenCalled();
    const writeCall = lastMockChild!.stdin.write.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("register"),
    );
    expect(writeCall).toBeTruthy();
    const msg = JSON.parse((writeCall![0] as string).trim());
    expect(msg).toEqual({ type: "register", queue: "adv-agenda-proj1" });
    expect(worker.queues).toContain("adv-agenda-proj1");

    await worker.shutdown();
  });

  it("does not expose dynamically registered queue until child ACK", async () => {
    autoAckRegister = false;
    const worker = await createMultiWorker(baseInput);

    const registerPromise = worker.registerQueue("adv-delayed-proj1");
    await Promise.resolve();

    expect(lastMockChild?.stdin.write).toHaveBeenCalled();
    expect(worker.queues).not.toContain("adv-delayed-proj1");
    expect(worker.getDiagnostics().queues).not.toContain("adv-delayed-proj1");

    lastMockChild!.sendRegisterAck("adv-delayed-proj1");
    await registerPromise;

    expect(worker.queues).toContain("adv-delayed-proj1");
    expect(worker.getDiagnostics().queues).toContain("adv-delayed-proj1");

    await worker.shutdown();
  });

  it("rejects registerQueue and surfaces diagnostics when child reports register-error", async () => {
    autoAckRegister = false;
    const worker = await createMultiWorker(baseInput);

    const registerPromise = worker.registerQueue("adv-broken-proj1");
    await Promise.resolve();

    lastMockChild!.sendRegisterError(
      "adv-broken-proj1",
      "Worker.create failed for adv-broken-proj1",
    );

    await expect(registerPromise).rejects.toThrow(
      "Worker.create failed for adv-broken-proj1",
    );
    expect(worker.queues).not.toContain("adv-broken-proj1");
    expect(worker.getDiagnostics()).toMatchObject({
      registerErrors: [
        {
          queue: "adv-broken-proj1",
          message: "Worker.create failed for adv-broken-proj1",
        },
      ],
    });

    await worker.shutdown();
  });

  it("records child run-error IPC in diagnostics and worker-run telemetry", async () => {
    const worker = await createMultiWorker(baseInput);

    lastMockChild!.sendRunError("adv-change-proj1", "poller failed");

    expect(worker.getDiagnostics()).toMatchObject({
      registerErrors: [
        {
          queue: "adv-change-proj1",
          message: "poller failed",
        },
      ],
    });
    expect(getLastWorkerRunError()).toMatchObject({
      queue: "adv-change-proj1",
      message: "poller failed",
    });

    await worker.shutdown();
  });

  it("ignores duplicate registerQueue calls", async () => {
    const worker = await createMultiWorker(baseInput);
    const writeCountBefore = lastMockChild!.stdin.write.mock.calls.length;

    await worker.registerQueue("adv-change-proj1"); // already registered

    // No new write calls
    expect(lastMockChild!.stdin.write.mock.calls.length).toBe(writeCountBefore);

    await worker.shutdown();
  });

  it("rejects registerQueue during shutdown", async () => {
    const worker = await createMultiWorker(baseInput);
    await worker.shutdown();

    await expect(worker.registerQueue("new-queue")).rejects.toThrow(
      "shutting down",
    );
  });

  it("SIGTERMs child on shutdown", async () => {
    const worker = await createMultiWorker(baseInput);
    const child = lastMockChild!;

    const shutdownPromise = worker.shutdown();

    // Simulate child exiting after SIGTERM
    setTimeout(() => {
      child.emit("exit", 0, null);
    }, 10);

    await shutdownPromise;

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(worker.isAlive()).toBe(false);
  });

  it("escalates to SIGKILL if child does not exit in time", async () => {
    vi.useFakeTimers();
    const worker = await createMultiWorker(baseInput);
    const child = lastMockChild!;

    // Override kill to NOT auto-emit exit on SIGTERM (simulates stuck child)
    let sigkillReceived = false;
    (child.kill as ReturnType<typeof vi.fn>).mockImplementation(
      (signal?: string) => {
        child.killed = true;
        if (signal === "SIGKILL") {
          sigkillReceived = true;
          child.exitCode = 137;
          // Emit exit after SIGKILL
          queueMicrotask(() => child.emit("exit", 137, "SIGKILL"));
        }
        // SIGTERM does NOT emit exit — child is stuck
      },
    );

    const shutdownPromise = worker.shutdown();

    // Advance past SIGTERM grace period
    await vi.advanceTimersByTimeAsync(MULTI_SHUTDOWN_GRACE_MS + 100);
    await shutdownPromise;

    expect(sigkillReceived).toBe(true);
  });

  it("does not respawn on graceful exit (code 0)", async () => {
    const onWorkerExhausted = vi.fn();
    const worker = await createMultiWorker({
      ...baseInput,
      onWorkerExhausted,
    });
    const child = lastMockChild!;

    // Simulate graceful exit
    child.emit("exit", 0, null);

    // Wait a tick for any scheduled respawns
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Only one child should have been spawned (no respawn)
    expect(mockChildren.length).toBe(1);
    expect(onWorkerExhausted).not.toHaveBeenCalled();

    await worker.shutdown();
  });

  it("fires onWorkerExhausted exactly once after child restart exhaustion", async () => {
    vi.useFakeTimers();
    const onWorkerExhausted = vi.fn();
    await createMultiWorker({
      ...baseInput,
      onWorkerExhausted,
    });

    lastMockChild!.emit("exit", null, "SIGKILL");
    await vi.advanceTimersByTimeAsync(1_050);
    mockChildren[mockChildren.length - 1].emit("exit", null, "SIGKILL");
    await vi.advanceTimersByTimeAsync(3_050);
    mockChildren[mockChildren.length - 1].emit("exit", null, "SIGKILL");
    await vi.advanceTimersByTimeAsync(10_050);
    mockChildren[mockChildren.length - 1].emit("exit", null, "SIGKILL");

    await Promise.resolve();
    expect(onWorkerExhausted).toHaveBeenCalledTimes(1);
    mockChildren[mockChildren.length - 1].emit("exit", null, "SIGKILL");
    await Promise.resolve();
    expect(onWorkerExhausted).toHaveBeenCalledTimes(1);
  });

  it("respawns child after crash with exponential backoff", async () => {
    vi.useFakeTimers();
    const worker = await createMultiWorker(baseInput);
    const child = lastMockChild!;

    // Simulate crash
    child.emit("exit", 1, null);

    // Advance past backoff (1000ms for first retry)
    await vi.advanceTimersByTimeAsync(1050);

    // A second child should have been spawned
    expect(mockChildren.length).toBe(2);

    const diag = worker.getDiagnostics();
    expect(diag.restartCount).toBe(1);

    // Cleanup: exit the respawned child
    mockChildren[mockChildren.length - 1].emit("exit", 0, null);
    await worker.shutdown();
  });

  it("returns diagnostics with correct state", async () => {
    const worker = await createMultiWorker(baseInput);

    const diag = worker.getDiagnostics();
    expect(diag.queues).toEqual(["adv-change-proj1", "adv-project-proj1"]);
    expect(diag.childExitCode).toBeNull();
    expect(diag.childPid).toBe(12345);
    expect(diag.childRunning).toBe(true);
    expect(diag.restartCount).toBe(0);
    expect(diag.pendingRegistrations).toEqual([]);
    expect(diag.registerErrors).toEqual([]);

    await worker.shutdown();
  });

  it("throws if Node executable not found", async () => {
    const { resolveNodeExecutable } = await import("./runtime-manager");
    (resolveNodeExecutable as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      found: false,
      remediation: "Install Node",
    });

    await expect(createMultiWorker(baseInput)).rejects.toThrow(
      "Cannot spawn multi-queue",
    );
  });

  it("throws if worker script not found", async () => {
    const { existsSync } = await import("node:fs");
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    await expect(
      createMultiWorker({
        ...baseInput,
        workerScript: "/nonexistent/worker.ts",
      }),
    ).rejects.toThrow("worker script not found");
  });

  // P1.3.6 ready-handshake tests.
  //
  // Context: before this fix, `createMultiWorker` resolved immediately
  // after spawning the child — tool calls in the ~500ms between spawn
  // and first Worker.create completion silently hit an unready worker.
  // After the fix, the parent blocks until the child writes
  // `{"type":"ready"}` to stdout, or until a 30s bootstrap timeout
  // fires (whichever comes first).
  describe("ready-handshake (P1.3.6)", () => {
    it("resolves when child sends ready IPC message", async () => {
      // Default autoEmitReady=true path already exercises this — verify
      // explicitly.
      const worker = await createMultiWorker(baseInput);
      expect(worker.isAlive()).toBe(true);
      await worker.shutdown();
    });

    it("rejects when child never sends ready within bootstrap timeout", async () => {
      autoEmitReady = false;
      vi.useFakeTimers();

      const createPromise = createMultiWorker(baseInput);
      // Attach a catch handler immediately to avoid "unhandled rejection"
      // warnings while we advance timers.
      const settled = createPromise.catch((err: Error) => err);

      // Advance past the 30s bootstrap timeout
      await vi.advanceTimersByTimeAsync(31_000);

      const result = await settled;
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toMatch(
        /ready|bootstrap|did not become ready/i,
      );

      // Parent must kill the orphan child so it doesn't leak.
      expect(lastMockChild).toBeTruthy();
      expect(lastMockChild!.kill).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("rejects when child exits before sending ready", async () => {
      autoEmitReady = false;

      const createPromise = createMultiWorker(baseInput);
      const settled = createPromise.catch((err: Error) => err);

      // Child crashes before bootstrap completes
      await new Promise((r) => setImmediate(r));
      expect(lastMockChild).toBeTruthy();
      lastMockChild!.emit("exit", 1, null);

      const result = await settled;
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toMatch(/exit|crash|never became/i);
    });
  });
});
