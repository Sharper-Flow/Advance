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
    promise: Promise<void>;
  }> = [];

  const createWorker = vi.fn(async (options: { taskQueue: string }) => {
    let resolveRun!: () => void;
    const runPromise = new Promise<void>((r) => {
      resolveRun = r;
    });
    runDeferreds.push({ resolve: resolveRun, promise: runPromise });

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

describe("createInProcessWorker (A4b')", () => {
  beforeEach(() => {
    mocks.createWorker.mockClear();
    mocks.connect.mockClear();
    mocks.connectionClose.mockClear();
    mocks.workers.length = 0;
    mocks.runDeferreds.length = 0;
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
});
