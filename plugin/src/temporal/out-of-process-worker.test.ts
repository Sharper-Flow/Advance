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

interface FakeChild extends EventEmitter {
  pid: number;
  exitCode: number | null;
  killed: boolean;
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: (signal?: NodeJS.Signals | number) => boolean;
  unref: () => FakeChild;
}

function makeFakeChild(): FakeChild {
  const ee = new EventEmitter() as FakeChild;
  ee.pid = 12345 + Math.floor(Math.random() * 1000);
  ee.exitCode = null;
  ee.killed = false;
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

  it("spawns a Node child for each queue with the correct env", async () => {
    const child = makeFakeChild();
    mocks.spawn.mockReturnValue(child);

    const { createOutOfProcessWorker } =
      await import("./out-of-process-worker");

    const worker = await createOutOfProcessWorker({
      address: "127.0.0.1:7233",
      namespace: "default",
      queues: ["advance-proj-a"],
      workerScript: "/plugin/dist/temporal/worker.js",
      projectId: "proj-a",
    });

    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = mocks.spawn.mock.calls[0];
    expect(cmd).toBe("/usr/bin/node");
    expect(args).toEqual(["/plugin/dist/temporal/worker.js"]);
    expect(opts.env).toMatchObject({
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
      ADV_TEMPORAL_TASK_QUEUE: "advance-proj-a",
      ADV_TEMPORAL_PROJECT_ID: "proj-a",
    });
    expect(worker.queues).toEqual(["advance-proj-a"]);

    // Let the worker shutdown cleanly before the test exits to avoid leaking
    // the EventEmitter-backed fake child between tests.
    await worker.shutdown();
  });

  it("registerQueue spawns an additional child for the new queue", async () => {
    const child1 = makeFakeChild();
    const child2 = makeFakeChild();
    mocks.spawn.mockReturnValueOnce(child1).mockReturnValueOnce(child2);

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

    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    expect(mocks.spawn.mock.calls[1][2].env.ADV_TEMPORAL_TASK_QUEUE).toBe(
      "advance-b",
    );
    expect(worker.queues).toEqual(["advance-a", "advance-b"]);

    await worker.shutdown();
  });

  it("registerQueue is idempotent for already-registered queues", async () => {
    const child = makeFakeChild();
    mocks.spawn.mockReturnValue(child);

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
    mocks.spawn.mockReturnValue(child);

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

  it("exposes queue diagnostics for startup-vs-shutdown investigation", async () => {
    const child = makeFakeChild();
    mocks.spawn.mockReturnValue(child);

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
    mocks.spawn.mockReturnValue(child);

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
    mocks.spawn.mockReturnValue(child);

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
