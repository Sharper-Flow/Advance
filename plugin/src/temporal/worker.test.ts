import { beforeEach, describe, expect, it, vi } from "vitest";

const workerMocks = vi.hoisted(() => {
  return {
    close: vi.fn(async () => {}),
    run: vi.fn(async () => {}),
    connect: vi.fn(async () => ({ close: workerMocks.close })),
    create: vi.fn(async () => ({ run: workerMocks.run })),
  };
});

vi.mock("@temporalio/worker", () => ({
  NativeConnection: { connect: workerMocks.connect },
  Worker: { create: workerMocks.create },
}));

import {
  runTemporalWorker,
  runTemporalWorkerFromEnv,
  createChildIPCHandler,
} from "./worker";

describe("temporal worker helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runTemporalWorkerFromEnv requires ADV_TEMPORAL_TASK_QUEUE", async () => {
    await expect(
      runTemporalWorkerFromEnv({} as NodeJS.ProcessEnv),
    ).rejects.toThrow(/ADV_TEMPORAL_TASK_QUEUE is required/);
  });

  it("runTemporalWorker creates a worker and closes the connection", async () => {
    await runTemporalWorker({
      taskQueue: "advance-proj1",
      address: "127.0.0.1:7233",
      namespace: "default",
      workflowsPath: "/tmp/workflows.js",
    });

    expect(workerMocks.connect).toHaveBeenCalledWith({
      address: "127.0.0.1:7233",
    });
    expect(workerMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "default",
        taskQueue: "advance-proj1",
        workflowsPath: "/tmp/workflows.js",
      }),
    );
    expect(workerMocks.run).toHaveBeenCalled();
    expect(workerMocks.close).toHaveBeenCalled();
  });

  it("runTemporalWorkerFromEnv uses env-derived defaults", async () => {
    await runTemporalWorkerFromEnv({
      ADV_TEMPORAL_TASK_QUEUE: "advance-proj2",
      ADV_TEMPORAL_ADDRESS: "10.0.0.2:9333",
      ADV_TEMPORAL_ALLOW_REMOTE: "true",
      ADV_TEMPORAL_NAMESPACE: "adv-dev",
    } as NodeJS.ProcessEnv);

    expect(workerMocks.connect).toHaveBeenCalledWith({
      address: "10.0.0.2:9333",
    });
    expect(workerMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "adv-dev",
        taskQueue: "advance-proj2",
      }),
    );
  });

  it("runTemporalWorker falls back to workflows.ts when workflows.js is absent in source mode", async () => {
    await runTemporalWorker({
      taskQueue: "advance-proj-source",
      address: "127.0.0.1:7233",
      namespace: "default",
    });

    expect(workerMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskQueue: "advance-proj-source",
        workflowsPath: expect.stringMatching(
          /src\/temporal\/workflows\.(js|ts)$/,
        ),
      }),
    );
  });

  it("runTemporalWorkerFromEnv honors ADV_TEMPORAL_MULTI_QUEUE and creates one Worker per queue", async () => {
    await runTemporalWorkerFromEnv({
      ADV_TEMPORAL_MULTI_QUEUE: "1",
      ADV_TEMPORAL_TASK_QUEUES: "advance-a, advance-b, advance-c",
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
    } as NodeJS.ProcessEnv);

    // One connection shared across all queues.
    expect(workerMocks.connect).toHaveBeenCalledTimes(1);
    // One Worker.create + .run per queue.
    expect(workerMocks.create).toHaveBeenCalledTimes(3);
    expect(workerMocks.run).toHaveBeenCalledTimes(3);
    const taskQueues = workerMocks.create.mock.calls.map(
      ([opts]) => (opts as { taskQueue: string }).taskQueue,
    );
    expect(taskQueues).toEqual(["advance-a", "advance-b", "advance-c"]);
  });

  it("runTemporalWorkerFromEnv rejects ADV_TEMPORAL_MULTI_QUEUE=1 with empty queue list", async () => {
    await expect(
      runTemporalWorkerFromEnv({
        ADV_TEMPORAL_MULTI_QUEUE: "1",
        ADV_TEMPORAL_TASK_QUEUES: "",
        ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
        ADV_TEMPORAL_NAMESPACE: "default",
      } as NodeJS.ProcessEnv),
    ).rejects.toThrow(/ADV_TEMPORAL_TASK_QUEUES is empty/);
  });

  // P1.3.7 — Child IPC handler for dynamic queue register/unregister.
  //
  // Context: parent (worker-multi.ts) writes JSON lines to child stdin.
  // Child must read and act. Handler dispatches to onRegister/
  // onUnregister/onShutdown callbacks. Stdin-based IPC (not process.send)
  // because child is spawned with stdio: ["pipe","pipe","pipe"] — no
  // IPC fd. See design.md § KD-1.
  describe("createChildIPCHandler (P1.3.7)", () => {
    it("dispatches register message to onRegister callback", async () => {
      const onRegister = vi.fn(async () => {});
      const onUnregister = vi.fn(async () => {});
      const onShutdown = vi.fn(async () => {});

      const handler = createChildIPCHandler({
        onRegister,
        onUnregister,
        onShutdown,
      });
      await handler.handleLine('{"type":"register","queue":"advance-new"}');

      expect(onRegister).toHaveBeenCalledWith("advance-new");
      expect(onUnregister).not.toHaveBeenCalled();
      expect(onShutdown).not.toHaveBeenCalled();
    });

    it("dispatches unregister message to onUnregister callback", async () => {
      const onRegister = vi.fn(async () => {});
      const onUnregister = vi.fn(async () => {});
      const onShutdown = vi.fn(async () => {});

      const handler = createChildIPCHandler({
        onRegister,
        onUnregister,
        onShutdown,
      });
      await handler.handleLine('{"type":"unregister","queue":"advance-old"}');

      expect(onUnregister).toHaveBeenCalledWith("advance-old");
      expect(onRegister).not.toHaveBeenCalled();
    });

    it("dispatches shutdown message to onShutdown callback", async () => {
      const onRegister = vi.fn(async () => {});
      const onUnregister = vi.fn(async () => {});
      const onShutdown = vi.fn(async () => {});

      const handler = createChildIPCHandler({
        onRegister,
        onUnregister,
        onShutdown,
      });
      await handler.handleLine('{"type":"shutdown"}');

      expect(onShutdown).toHaveBeenCalled();
    });

    it("handles multiple JSON lines in a single stdin chunk", async () => {
      const onRegister = vi.fn(async () => {});
      const handler = createChildIPCHandler({
        onRegister,
        onUnregister: vi.fn(async () => {}),
        onShutdown: vi.fn(async () => {}),
      });
      // Simulate chunk with two IPC messages
      await handler.handleChunk(
        Buffer.from(
          '{"type":"register","queue":"q1"}\n{"type":"register","queue":"q2"}\n',
        ),
      );

      expect(onRegister).toHaveBeenCalledTimes(2);
      expect(onRegister).toHaveBeenNthCalledWith(1, "q1");
      expect(onRegister).toHaveBeenNthCalledWith(2, "q2");
    });

    it("handles chunk-split JSON gracefully (partial line buffering)", async () => {
      const onRegister = vi.fn(async () => {});
      const handler = createChildIPCHandler({
        onRegister,
        onUnregister: vi.fn(async () => {}),
        onShutdown: vi.fn(async () => {}),
      });

      // First chunk has a partial line (no trailing newline)
      await handler.handleChunk(Buffer.from('{"type":"register","queue":"'));
      expect(onRegister).not.toHaveBeenCalled();

      // Second chunk completes the message
      await handler.handleChunk(Buffer.from('q-split"}\n'));
      expect(onRegister).toHaveBeenCalledWith("q-split");
    });

    it("ignores malformed JSON without crashing", async () => {
      const onRegister = vi.fn(async () => {});
      const handler = createChildIPCHandler({
        onRegister,
        onUnregister: vi.fn(async () => {}),
        onShutdown: vi.fn(async () => {}),
      });

      // Garbage line + valid line mixed
      await handler.handleChunk(
        Buffer.from('this is not json\n{"type":"register","queue":"ok"}\n'),
      );
      expect(onRegister).toHaveBeenCalledWith("ok");
    });

    it("ignores JSON with unrecognized type", async () => {
      const onRegister = vi.fn(async () => {});
      const onUnregister = vi.fn(async () => {});
      const onShutdown = vi.fn(async () => {});
      const handler = createChildIPCHandler({
        onRegister,
        onUnregister,
        onShutdown,
      });
      await handler.handleLine('{"type":"pong","value":42}');
      expect(onRegister).not.toHaveBeenCalled();
      expect(onUnregister).not.toHaveBeenCalled();
      expect(onShutdown).not.toHaveBeenCalled();
    });
  });
});
