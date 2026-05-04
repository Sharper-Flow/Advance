import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type WorkerInstance = {
    taskQueue: string;
    shutdown: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
  };
  const workers: WorkerInstance[] = [];
  const runDeferreds: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
    promise: Promise<void>;
  }> = [];

  const createWorker = vi.fn(async (options: { taskQueue: string }) => {
    let resolveRun!: () => void;
    let rejectRun!: (err: Error) => void;
    const runPromise = new Promise<void>((resolve, reject) => {
      rejectRun = reject;
      const r = resolve;
      resolveRun = r;
    });
    runDeferreds.push({
      resolve: resolveRun,
      reject: rejectRun,
      promise: runPromise,
    });

    const run = vi.fn(async () => runPromise);
    const shutdown = vi.fn(() => {
      resolveRun();
    });
    const w: WorkerInstance = { taskQueue: options.taskQueue, shutdown, run };
    workers.push(w);
    return w;
  });

  const connectionClose = vi.fn(async () => {});
  const connect = vi.fn(async () => ({ close: connectionClose }));

  return {
    createWorker,
    workers,
    runDeferreds,
    connect,
    connectionClose,
  };
});

vi.mock("@temporalio/worker", () => ({
  NativeConnection: { connect: mocks.connect },
  Worker: { create: mocks.createWorker },
}));

import { createInProcessWorker } from "./in-process-worker";
import {
  getLastWorkerRunError,
  resetTemporalRetryTelemetry,
} from "./retry-wrapper";

describe("createInProcessWorker (A4b')", () => {
  beforeEach(() => {
    resetTemporalRetryTelemetry();
    mocks.createWorker.mockClear();
    mocks.connect.mockClear();
    mocks.connectionClose.mockClear();
    mocks.workers.length = 0;
    mocks.runDeferreds.length = 0;
  });

  it("records run failure and removes the failed queue", async () => {
    const worker = await createInProcessWorker({
      address: "127.0.0.1:7233",
      namespace: "default",
      queues: ["advance-proj-a"],
    });

    mocks.runDeferreds[0].reject(new Error("poller crashed"));
    await vi.waitFor(() => {
      expect(worker.queues).toEqual([]);
    });

    expect(getLastWorkerRunError()).toMatchObject({
      queue: "advance-proj-a",
      message: "poller crashed",
    });
  });

  it("starts one Worker per queue on initial creation", async () => {
    const worker = await createInProcessWorker({
      address: "127.0.0.1:7233",
      namespace: "default",
      queues: ["advance-proj-a", "advance-proj-b"],
    });

    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.createWorker).toHaveBeenCalledTimes(2);
    expect(worker.queues).toEqual(["advance-proj-a", "advance-proj-b"]);

    await worker.shutdown();
  });

  it("registerQueue dynamically adds a queue without restarting existing workers", async () => {
    const worker = await createInProcessWorker({
      address: "127.0.0.1:7233",
      namespace: "default",
      queues: ["advance-proj-a"],
    });

    expect(worker.queues).toEqual(["advance-proj-a"]);
    await worker.registerQueue("advance-proj-b");
    expect(worker.queues).toEqual(["advance-proj-a", "advance-proj-b"]);

    await worker.registerQueue("advance-proj-a"); // idempotent
    expect(worker.queues).toEqual(["advance-proj-a", "advance-proj-b"]);

    await worker.shutdown();
  });

  it("registerQueue coalesces concurrent duplicate registrations", async () => {
    const worker = await createInProcessWorker({
      address: "127.0.0.1:7233",
      namespace: "default",
      queues: ["advance-proj-a"],
    });

    await Promise.all([
      worker.registerQueue("advance-proj-b"),
      worker.registerQueue("advance-proj-b"),
    ]);

    expect(mocks.createWorker).toHaveBeenCalledTimes(2);
    expect(worker.queues).toEqual(["advance-proj-a", "advance-proj-b"]);

    await worker.shutdown();
  });

  it("shutdown() calls shutdown on every worker and closes the connection once", async () => {
    const worker = await createInProcessWorker({
      address: "127.0.0.1:7233",
      namespace: "default",
      queues: ["advance-proj-a", "advance-proj-b"],
    });

    await worker.shutdown();

    for (const w of mocks.workers) {
      expect(w.shutdown).toHaveBeenCalledTimes(1);
    }
    expect(mocks.connectionClose).toHaveBeenCalledTimes(1);
  });

  it("shutdown() is idempotent (does not double-close the connection)", async () => {
    const worker = await createInProcessWorker({
      address: "127.0.0.1:7233",
      namespace: "default",
      queues: ["advance-proj-a"],
    });

    await worker.shutdown();
    await worker.shutdown();

    expect(mocks.connectionClose).toHaveBeenCalledTimes(1);
  });

  it("registerQueue rejects after shutdown", async () => {
    const worker = await createInProcessWorker({
      address: "127.0.0.1:7233",
      namespace: "default",
      queues: ["advance-proj-a"],
    });

    await worker.shutdown();

    await expect(worker.registerQueue("advance-proj-b")).rejects.toThrow(
      /shutting down/,
    );
  });

  it("registerQueue started before shutdown aborts instead of attaching a stranded worker", async () => {
    const worker = await createInProcessWorker({
      address: "127.0.0.1:7233",
      namespace: "default",
      queues: ["advance-proj-a"],
    });

    let releaseBoot!: () => void;
    const bootGate = new Promise<void>((r) => {
      releaseBoot = r;
    });

    // Make the NEXT Worker.create() call (registerQueue for advance-proj-b)
    // block until we release it, simulating a shutdown racing an in-flight
    // registerQueue call.
    mocks.createWorker.mockImplementationOnce(
      async (options: { taskQueue: string }) => {
        await bootGate;
        let resolveRun!: () => void;
        const runPromise = new Promise<void>((r) => {
          resolveRun = r;
        });
        mocks.runDeferreds.push({ resolve: resolveRun, promise: runPromise });
        const run = vi.fn(async () => runPromise);
        const shutdown = vi.fn(() => {
          resolveRun();
        });
        const w = { taskQueue: options.taskQueue, shutdown, run };
        mocks.workers.push(w);
        return w;
      },
    );

    const pending = worker.registerQueue("advance-proj-b");
    await Promise.resolve();
    const shutdownPromise = worker.shutdown();
    await Promise.resolve();
    releaseBoot();

    await expect(pending).rejects.toThrow(/shut down mid-start/);
    await shutdownPromise;

    // The racing worker was created but must not have been attached to
    // the registered set (its run() loop is not among the drained runners).
    expect(worker.queues).toEqual(["advance-proj-a"]);
  });
});
