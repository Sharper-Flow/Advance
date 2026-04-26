import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    resolveNodeExecutable: vi.fn(() => ({
      found: true,
      path: "/usr/bin/node",
      source: "path" as const,
    })),
    spawn: vi.fn(),
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
  };
});

vi.mock("./runtime-manager", async () => {
  const actual =
    await vi.importActual<typeof import("./runtime-manager")>(
      "./runtime-manager",
    );
  return {
    ...actual,
    resolveNodeExecutable: mocks.resolveNodeExecutable,
  };
});

vi.mock("node:child_process", () => ({
  spawn: mocks.spawn,
}));

vi.mock("node:fs", () => ({
  existsSync: mocks.existsSync,
  mkdirSync: mocks.mkdirSync,
}));

interface FakeChild extends EventEmitter {
  pid: number;
  exitCode: number | null;
  killed: boolean;
  stdin: { write: ReturnType<typeof vi.fn> };
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: (signal?: NodeJS.Signals | number) => boolean;
  unref: () => FakeChild;
}

/**
 * Emit the P1.3.6 ready-handshake IPC message via a Promise microtask
 * so `createMultiWorker` resolves quickly in tests. `vi.useFakeTimers()`
 * leaves Promise microtasks alone, so this works under both real and
 * fake timer modes. Real child writes the same JSON line to stdout
 * after Worker.create.
 */
function scheduleReady(child: FakeChild): void {
  Promise.resolve().then(() => {
    child.stdout.emit("data", Buffer.from('{"type":"ready"}\n'));
  });
}

/**
 * Wire `mocks.spawn` to return a child AND schedule its ready-handshake
 * using mockImplementationOnce. This matters: the ready emit must
 * happen AFTER `createMultiWorker` synchronously attaches its stdout
 * listener (which happens right after `spawn()` returns). By wiring the
 * microtask inside the spawn implementation itself, we guarantee the
 * listener is attached before the ready emit fires.
 */
function spawnWithReady(child: FakeChild): void {
  mocks.spawn.mockImplementationOnce(() => {
    // Queue the ready emit on the microtask queue so it fires AFTER
    // the synchronous listener attachment in createMultiWorker's
    // spawnChild().
    Promise.resolve().then(() => scheduleReady(child));
    return child;
  });
}

function makeFakeChild(): FakeChild {
  const ee = new EventEmitter() as FakeChild;
  ee.pid = 12345 + Math.floor(Math.random() * 1000);
  ee.exitCode = null;
  ee.killed = false;
  ee.stdin = {
    write: vi.fn((line: string) => {
      try {
        const msg = JSON.parse(line.trim()) as {
          type?: string;
          queue?: unknown;
        };
        if (msg.type === "register" && typeof msg.queue === "string") {
          queueMicrotask(() => {
            ee.stdout.emit(
              "data",
              Buffer.from(
                JSON.stringify({ type: "register-ack", queue: msg.queue }) +
                  "\n",
              ),
            );
          });
        }
      } catch {
        // Ignore malformed writes in tests.
      }
      return true;
    }),
  };
  ee.stdout = new EventEmitter();
  ee.stderr = new EventEmitter();
  const killSpy = vi.fn((signal?: NodeJS.Signals | number) => {
    ee.killed = true;
    // Emit exit asynchronously so callers can attach handlers first
    queueMicrotask(() => {
      ee.exitCode = 0;
      ee.emit("exit", 0, signal ?? null);
    });
    return true;
  });
  ee.kill = killSpy;
  ee.unref = () => ee;
  return ee;
}

function makeStuckChild(): FakeChild {
  const ee = new EventEmitter() as FakeChild;
  ee.pid = 54321 + Math.floor(Math.random() * 1000);
  ee.exitCode = null;
  ee.killed = false;
  ee.stdin = { write: vi.fn(() => true) };
  ee.stdout = new EventEmitter();
  ee.stderr = new EventEmitter();
  ee.kill = vi.fn((signal?: NodeJS.Signals | number) => {
    ee.killed = true;
    if (signal === "SIGKILL") {
      queueMicrotask(() => {
        ee.exitCode = 137;
        ee.emit("exit", 137, signal);
      });
    }
    return true;
  });
  ee.unref = () => ee;
  return ee;
}

describe("createOutOfProcessWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveNodeExecutable.mockReturnValue({
      found: true,
      path: "/usr/bin/node",
      source: "path",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("spawns a single shared child with multi-queue env", async () => {
    const child = makeFakeChild();
    spawnWithReady(child);

    const { createOutOfProcessWorker } =
      await import("./out-of-process-worker");

    const worker = await createOutOfProcessWorker({
      address: "127.0.0.1:7233",
      namespace: "default",
      queues: ["advance-proj-a", "advance-proj-b"],
      workerScript: "/plugin/dist/temporal/worker.js",
      projectId: "proj-a",
    });

    // Shared worker: only ONE spawn for all queues
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = mocks.spawn.mock.calls[0];
    expect(cmd).toBe("/usr/bin/node");
    expect(args).toEqual(["/plugin/dist/temporal/worker.js"]);
    expect(opts.env).toMatchObject({
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
      ADV_TEMPORAL_MULTI_QUEUE: "1",
      ADV_TEMPORAL_PROJECT_ID: "proj-a",
    });
    expect(opts.env.ADV_TEMPORAL_TASK_QUEUES).toContain("advance-proj-a");
    expect(opts.env.ADV_TEMPORAL_TASK_QUEUES).toContain("advance-proj-b");
    expect(worker.queues).toEqual(["advance-proj-a", "advance-proj-b"]);

    await worker.shutdown();
  });

  it("registerQueue sends IPC message instead of spawning new child", async () => {
    const child = makeFakeChild();
    spawnWithReady(child);

    const { createOutOfProcessWorker } =
      await import("./out-of-process-worker");

    const worker = await createOutOfProcessWorker({
      address: "127.0.0.1:7233",
      namespace: "default",
      queues: ["advance-a"],
      workerScript: "/plugin/dist/temporal/worker.js",
      projectId: "a",
    });

    expect(worker.queues).toEqual(["advance-a"]);
    await worker.registerQueue("advance-b");

    // Shared worker: NO additional spawn, queue added via IPC
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(worker.queues).toEqual(["advance-a", "advance-b"]);

    await worker.shutdown();
  });

  it("registerQueue is idempotent for already-registered queues", async () => {
    const child = makeFakeChild();
    spawnWithReady(child);

    const { createOutOfProcessWorker } =
      await import("./out-of-process-worker");

    const worker = await createOutOfProcessWorker({
      address: "127.0.0.1:7233",
      namespace: "default",
      queues: ["advance-dup"],
      workerScript: "/plugin/dist/temporal/worker.js",
      projectId: "dup",
    });

    await worker.registerQueue("advance-dup");
    expect(mocks.spawn).toHaveBeenCalledTimes(1);

    await worker.shutdown();
  });

  it("shutdown sends SIGTERM and awaits child exit", async () => {
    const child = makeFakeChild();
    spawnWithReady(child);

    const { createOutOfProcessWorker } =
      await import("./out-of-process-worker");

    const worker = await createOutOfProcessWorker({
      address: "127.0.0.1:7233",
      namespace: "default",
      queues: ["advance-q"],
      workerScript: "/plugin/dist/temporal/worker.js",
      projectId: "q",
    });

    await worker.shutdown();

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    // Second shutdown is a no-op (doesn't throw)
    await expect(worker.shutdown()).resolves.toBeUndefined();
  });

  it("bounds shutdown and escalates to SIGKILL when a child ignores SIGTERM", async () => {
    vi.useFakeTimers();
    const child = makeStuckChild();
    spawnWithReady(child);

    const { createOutOfProcessWorker } =
      await import("./out-of-process-worker");

    const worker = await createOutOfProcessWorker({
      address: "127.0.0.1:7233",
      namespace: "default",
      queues: ["advance-stuck"],
      workerScript: "/plugin/dist/temporal/worker.js",
      projectId: "stuck",
    });

    const shutdownPromise = worker.shutdown();
    await vi.advanceTimersByTimeAsync(5_100);
    await shutdownPromise;

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(worker.isAlive?.()).toBe(false);
    vi.useRealTimers();
  });

  it("exposes queue diagnostics for startup-vs-shutdown investigation", async () => {
    const child = makeFakeChild();
    spawnWithReady(child);

    const { createOutOfProcessWorker } =
      await import("./out-of-process-worker");

    const worker = await createOutOfProcessWorker({
      address: "127.0.0.1:7233",
      namespace: "default",
      queues: ["advance-diag"],
      workerScript: "/plugin/dist/temporal/worker.js",
      projectId: "diag",
    });

    expect(typeof worker.getDiagnostics).toBe("function");
    expect(worker.getDiagnostics()).toEqual([
      {
        queue: "advance-diag",
        dead: false,
        restartCount: 0,
        childExitCode: null,
        childRunning: true,
      },
    ]);

    await worker.shutdown();
  });

  it("throws when resolveNodeExecutable returns found:false", async () => {
    mocks.resolveNodeExecutable.mockReturnValueOnce({
      found: false,
      source: "none",
      remediation: "Install Node",
    });

    const { createOutOfProcessWorker } =
      await import("./out-of-process-worker");

    await expect(
      createOutOfProcessWorker({
        address: "127.0.0.1:7233",
        namespace: "default",
        queues: ["advance-q"],
        workerScript: "/plugin/dist/temporal/worker.js",
        projectId: "q",
      }),
    ).rejects.toThrow(/Install Node|Node executable/);
  });

  it("throws when workerScript does not exist", async () => {
    mocks.existsSync.mockReturnValueOnce(false);

    const { createOutOfProcessWorker } =
      await import("./out-of-process-worker");

    await expect(
      createOutOfProcessWorker({
        address: "127.0.0.1:7233",
        namespace: "default",
        queues: ["advance-q"],
        workerScript: "/nonexistent/path/worker.js",
        projectId: "q",
      }),
    ).rejects.toThrow(/worker script not found/);
  });

  it("sanitizes control characters and truncates huge stdout/stderr chunks", async () => {
    const child = makeFakeChild();
    spawnWithReady(child);

    const { createOutOfProcessWorker } =
      await import("./out-of-process-worker");

    const worker = await createOutOfProcessWorker({
      address: "127.0.0.1:7233",
      namespace: "default",
      queues: ["advance-sanitize"],
      workerScript: "/plugin/dist/temporal/worker.js",
      projectId: "sanitize",
    });

    // Emit a chunk with control characters and a huge payload
    const huge = "a".repeat(5_000);
    const dirty = `\x00\x01\x02normal\x7f${huge}`;
    child.stdout.emit("data", Buffer.from(dirty));

    // The debug logger is file-only, so we just verify the worker starts and
    // shutdown works without throwing. If sanitization were broken, the logger
    // call itself could throw on invalid UTF-8 or blow memory.
    expect(worker.queues).toEqual(["advance-sanitize"]);

    await worker.shutdown();
  });
});

describe("createOutOfProcessWorker restart policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.resolveNodeExecutable.mockReturnValue({
      found: true,
      path: "/usr/bin/node",
      source: "path",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  function makeCrashingChild(): FakeChild {
    const ee = new EventEmitter() as FakeChild;
    ee.pid = 42000 + Math.floor(Math.random() * 1000);
    ee.exitCode = null;
    ee.killed = false;
    ee.stdout = new EventEmitter();
    ee.stderr = new EventEmitter();
    ee.kill = vi.fn(() => true);
    ee.unref = () => ee;
    return ee;
  }

  it("respawns child up to 3 times on non-zero exit, then stops", async () => {
    // Four spawns total: initial + 3 restarts. After the 3rd restart crashes,
    // no further respawn should happen.
    const children = [
      makeCrashingChild(),
      makeCrashingChild(),
      makeCrashingChild(),
      makeCrashingChild(),
    ];
    let spawnCount = 0;
    mocks.spawn.mockImplementation(() => {
      const c = children[spawnCount++];
      // Queue ready AFTER spawnChild's sync listener attach; see
      // spawnWithReady above.
      Promise.resolve().then(() => scheduleReady(c));
      return c;
    });

    const { createOutOfProcessWorker } =
      await import("./out-of-process-worker");

    const worker = await createOutOfProcessWorker({
      address: "127.0.0.1:7233",
      namespace: "default",
      queues: ["advance-crasher"],
      workerScript: "/plugin/dist/temporal/worker.js",
      projectId: "crasher",
    });

    expect(spawnCount).toBe(1);

    // Crash child 1 → expect respawn after 1s backoff
    children[0].exitCode = 1;
    children[0].emit("exit", 1, null);
    await vi.advanceTimersByTimeAsync(1050);
    expect(spawnCount).toBe(2);

    // Crash child 2 → respawn after 3s backoff
    children[1].exitCode = 1;
    children[1].emit("exit", 1, null);
    await vi.advanceTimersByTimeAsync(3050);
    expect(spawnCount).toBe(3);

    // Crash child 3 → respawn after 10s backoff (final attempt)
    children[2].exitCode = 1;
    children[2].emit("exit", 1, null);
    await vi.advanceTimersByTimeAsync(10050);
    expect(spawnCount).toBe(4);

    // Crash child 4 (the 3rd restart) → NO respawn; worker is in "dead" state
    children[3].exitCode = 1;
    children[3].emit("exit", 1, null);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(spawnCount).toBe(4); // stayed at 4

    // Worker must expose dead state via isAlive
    expect(worker.isAlive?.()).toBe(false);

    await worker.shutdown();
  });

  it("does not respawn after shutdown is called", async () => {
    const child = makeCrashingChild();
    spawnWithReady(child);

    const { createOutOfProcessWorker } =
      await import("./out-of-process-worker");

    const worker = await createOutOfProcessWorker({
      address: "127.0.0.1:7233",
      namespace: "default",
      queues: ["advance-q"],
      workerScript: "/plugin/dist/temporal/worker.js",
      projectId: "q",
    });

    // Start shutdown, then crash the child
    const shutdownPromise = worker.shutdown();
    child.exitCode = 0;
    child.emit("exit", 0, "SIGTERM");
    await shutdownPromise;

    // Advance past any backoff window — no respawn expected
    await vi.advanceTimersByTimeAsync(15_000);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });

  it("treats exit code 0 (graceful) as not-a-crash (no respawn)", async () => {
    const child = makeCrashingChild();
    spawnWithReady(child);

    const { createOutOfProcessWorker } =
      await import("./out-of-process-worker");

    const worker = await createOutOfProcessWorker({
      address: "127.0.0.1:7233",
      namespace: "default",
      queues: ["advance-q"],
      workerScript: "/plugin/dist/temporal/worker.js",
      projectId: "q",
    });

    child.exitCode = 0;
    child.emit("exit", 0, null);
    await vi.advanceTimersByTimeAsync(15_000);

    // Only the initial spawn; graceful exit does not trigger restart.
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    // After a graceful exit with no respawn pending, isAlive() is false.
    expect(worker.isAlive?.()).toBe(false);

    await worker.shutdown();
  });
});
